const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

// Dispara push real (FCM) para o destinatário sempre que uma notificação in-app é criada
// (redistribuição de tarefas por viagem/estadia, etc). O título já vem definido por quem gravou o doc.
exports.enviarPushNotificacao = onDocumentCreated('notificacoes/{notificacaoId}', async (event) => {
  const snap = event.data;
  if (!snap) return;

  const notificacao = snap.data();
  const destinatarioId = notificacao.destinatarioId;
  if (!destinatarioId) return;

  const userSnap = await db.collection('users').doc(destinatarioId).get();
  if (!userSnap.exists) return;

  const tokens = userSnap.data().fcmTokens || [];
  if (tokens.length === 0) return;

  const bodyTexto = String(notificacao.mensagem || '').replace(/<[^>]*>/g, '').slice(0, 200);

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: notificacao.titulo || 'Caule',
      body: bodyTexto,
    },
    data: {
      type: notificacao.tipo || 'sistema',
      notificacaoId: event.params.notificacaoId,
    },
    android: {
      notification: {
        channelId: 'caule-default',
        sound: 'default',
        icon: 'ic_stat_notification',
        color: '#4edea3',
      },
    },
  });

  // Remove tokens que o FCM reportou como inválidos/desinstalados
  const tokensInvalidos = [];
  response.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        tokensInvalidos.push(tokens[i]);
      }
    }
  });

  if (tokensInvalidos.length > 0) {
    await db.collection('users').doc(destinatarioId).update({
      fcmTokens: FieldValue.arrayRemove(...tokensInvalidos),
    });
  }
});

// ==========================================
// LEMBRETES DE EVENTOS (agendado)
// ==========================================

const JANELA_MIN = 10; // deve bater com o intervalo do schedule abaixo
const OFFSET_LABEL = { 1440: '1 dia', 60: '1 hora', 30: '30 minutos' };
const FUSO_SP_HORAS = 3; // America/Sao_Paulo = UTC-3 o ano todo (Brasil aboliu horario de verao)

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Seg=0 ... Dom=6, mesma convencao do app (calculado em UTC pois so usamos ano/mes/dia, sem hora)
function diaSemanaDe(ano, mes, dia) {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return (d.getUTCDay() + 6) % 7;
}

function eventoOcorreNoDia(evento, ano, mes, dia) {
  if (evento.recorrencia === 'nenhuma') {
    if (!evento.data) return false;
    const [a, m, d] = evento.data.split('-').map(Number);
    return a === ano && m === mes && d === dia;
  }
  if (evento.recorrencia === 'semanal') {
    const idx = diaSemanaDe(ano, mes, dia);
    return (evento.diasSemana || []).includes(String(idx));
  }
  // mensal
  return (evento.diasMes || []).includes(dia);
}

// Instante UTC exato da ocorrencia, assumindo horario informado em America/Sao_Paulo
function ocorrenciaUTC(ano, mes, dia, horario) {
  const [h, min] = String(horario || '00:00').split(':').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, h + FUSO_SP_HORAS, min || 0));
}

// Data civil (ano/mes/dia) em America/Sao_Paulo correspondente a um instante UTC
function paraDataSaoPaulo(dataUTC) {
  const local = new Date(dataUTC.getTime() - FUSO_SP_HORAS * 60 * 60000);
  return { ano: local.getUTCFullYear(), mes: local.getUTCMonth() + 1, dia: local.getUTCDate() };
}

function formatarDataLocal(ano, mes, dia) {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// Roda a cada 10 minutos: para cada evento com lembretes configurados, verifica se alguma
// ocorrência (única ou recorrente) tem um lembrete cujo horário de disparo cai na janela atual.
exports.verificarLembretesEventos = onSchedule({ schedule: `every ${JANELA_MIN} minutes`, region: 'southamerica-east1' }, async () => {
  const agora = new Date();
  const eventosSnap = await db.collection('eventos').get();

  for (const eventoDoc of eventosSnap.docs) {
    const evento = eventoDoc.data();
    const lembretes = evento.lembretes || [];
    if (lembretes.length === 0) continue;
    if (!evento.horario) continue;

    for (const offsetMin of lembretes) {
      const janelaInicio = new Date(agora.getTime() + offsetMin * 60000);
      const janelaFim = new Date(janelaInicio.getTime() + JANELA_MIN * 60000);

      const d1 = paraDataSaoPaulo(janelaInicio);
      const d2 = paraDataSaoPaulo(janelaFim);
      const diasCandidatos = [d1];
      if (d1.dia !== d2.dia || d1.mes !== d2.mes || d1.ano !== d2.ano) diasCandidatos.push(d2);

      for (const dc of diasCandidatos) {
        if (!eventoOcorreNoDia(evento, dc.ano, dc.mes, dc.dia)) continue;
        const ocorrencia = ocorrenciaUTC(dc.ano, dc.mes, dc.dia, evento.horario);
        if (ocorrencia < janelaInicio || ocorrencia >= janelaFim) continue;

        // Lembrete devido agora - so notifica quem confirmou presenca NESSA ocorrencia
        // especifica (data), mais o criador do evento (que nao precisa confirmar o proprio
        // evento pra querer ser lembrado dele). Eventos privados nao tem RSVP na casa, entao
        // so o criador recebe.
        try {
          const dataOcorrenciaStr = formatarDataLocal(dc.ano, dc.mes, dc.dia);
          const respostasOcorrencia = (evento.respostas && evento.respostas[dataOcorrenciaStr]) || {};
          const destinatariosUids = new Set(
            Object.keys(respostasOcorrencia).filter((uid) => respostasOcorrencia[uid] === 'confirmado')
          );
          if (evento.criadoPor) destinatariosUids.add(evento.criadoPor);
          if (destinatariosUids.size === 0) continue;

          const localTexto = evento.locais && evento.locais.length > 0 ? ` · 📍 ${escapeHtml(evento.locais.join(', '))}` : '';
          const titulo = `Lembrete: ${escapeHtml(evento.titulo || 'Evento')}`;
          const mensagem = `
            <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2937;background:#ffffff;border-radius:14px;padding:14px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:24px;">${escapeHtml(evento.emoji || '📅')}</span>
                <div>
                  <p style="margin:0;font-size:15px;color:#6b7280;">🔔 Começa em ${OFFSET_LABEL[offsetMin] || offsetMin + ' min'}</p>
                  <p style="margin:0;font-size:17px;font-weight:700;color:#fc7c78;">${escapeHtml(evento.titulo || 'Evento')}</p>
                </div>
              </div>
              <p style="margin:10px 0 0 0;font-size:13px;color:#374151;">🕐 ${escapeHtml(evento.horario)}${localTexto}</p>
              <p style="margin-top:10px;font-size:11px;color:#9ca3af;text-align:center;">✨ Caule — Sistema de Gestão da Casa</p>
            </div>
          `;

          for (const uid of destinatariosUids) {
            await db.collection('notificacoes').add({
              destinatarioId: uid,
              titulo,
              mensagem,
              tipo: 'sistema',
              lida: false,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
        } catch (e) {
          console.error('[Lembretes] Erro ao notificar evento', eventoDoc.id, e);
        }
      }
    }
  }
});

// ==========================================
// DISTRIBUIÇÃO SEMANAL AUTOMÁTICA (agendado)
// ==========================================
// Mesmo algoritmo de "Gerar Tarefas da Semana" (ConfiguracoesPage.tsx), portado pro backend
// pra rodar sozinho toda semana - mantém as mesmas convenções de weekId e as mesmas regras de
// desempate, pra gerar a MESMA distribuição que um admin geraria clicando o botão manual.

const DIA_SEMANA_MAP = {
  '0': 0, seg: 0, segunda: 0,
  '1': 1, ter: 1, terca: 1, 'terça': 1,
  '2': 2, qua: 2, quarta: 2,
  '3': 3, qui: 3, quinta: 3,
  '4': 4, sex: 4, sexta: 4,
  '5': 5, sab: 5, sabado: 5, 'sábado': 5,
  '6': 6, dom: 6, domingo: 6,
};
function parseDiaSemana(d) {
  const num = DIA_SEMANA_MAP[String(d || '').toLowerCase().trim()];
  return num !== undefined ? num : null;
}

// Mesma fórmula (não-ISO, ancorada em 1º de janeiro) usada em TarefasPage.tsx / HomePage.tsx /
// ConfiguracoesPage.tsx pra rotular e procurar a distribuição "desta semana" - precisa bater com
// o que essas páginas calculam, senão a distribuição gerada aqui nunca aparece pro usuário.
function weekIdDoDia(data) {
  const ano = data.getFullYear();
  const primeiraSegunda = new Date(ano, 0, 1);
  const diasDesdeInicio = Math.floor((data.getTime() - primeiraSegunda.getTime()) / (24 * 60 * 60 * 1000));
  const semana = Math.ceil((diasDesdeInicio + primeiraSegunda.getDay()) / 7);
  return `${ano}-W${String(semana).padStart(2, '0')}`;
}

// Mesmo cálculo (ancorado em 4 de janeiro / ISO) usado em moradorViajandoNaSemana no app -
// mantido idêntico de propósito, mesmo divergindo de weekIdDoDia em anos de virada; é assim
// que o app já calcula hoje, então replicamos para não ter comportamento diferente do manual.
function intervaloDaSemana(weekId) {
  const match = weekId.match(/(\d+)-W(\d+)/);
  const ano = parseInt(match[1], 10);
  const semana = parseInt(match[2], 10);
  const jan4 = new Date(ano, 0, 4);
  const primeiraSegunda = new Date(jan4.getTime() - ((jan4.getDay() + 6) % 7) * 24 * 60 * 60 * 1000);
  const inicioSemana = new Date(primeiraSegunda.getTime() + (semana - 1) * 7 * 24 * 60 * 60 * 1000);
  const fimSemana = new Date(inicioSemana.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { inicioSemana, fimSemana };
}

function moradorViajandoNaSemana(uid, weekId, viagens, considerarDomingo) {
  const { inicioSemana, fimSemana } = intervaloDaSemana(weekId);
  const inicioStr = inicioSemana.toISOString().split('T')[0];
  const fimStr = fimSemana.toISOString().split('T')[0];
  const diasFora = [];
  viagens.filter((v) => v.uid === uid).forEach((v) => {
    if (v.dataSaida <= fimStr && v.dataRetorno >= inicioStr) {
      for (let d = 0; d < 7; d++) {
        const diaData = new Date(inicioSemana.getTime() + d * 24 * 60 * 60 * 1000);
        const diaStr = diaData.toISOString().split('T')[0];
        if (diaStr >= v.dataSaida && diaStr <= v.dataRetorno) diasFora.push(d);
      }
    }
  });
  return { viajando: diasFora.length > 0, diasFora: [...new Set(diasFora)].filter((d) => considerarDomingo || d !== 6).sort() };
}

function getSemanaDoMes(weekId) {
  const match = weekId.match(/(\d+)-W(\d+)/);
  const ano = parseInt(match[1], 10);
  const semanaISO = parseInt(match[2], 10);
  const jan4 = new Date(ano, 0, 4);
  const jan4Dia = jan4.getDay();
  const jan4Segunda = new Date(ano, 0, 4 - (jan4Dia === 0 ? 6 : jan4Dia - 1));
  const inicioSemana = new Date(jan4Segunda.getTime() + (semanaISO - 1) * 7 * 24 * 60 * 60 * 1000);
  const mes = inicioSemana.getMonth();
  const primeiroDiaMes = new Date(ano, mes, 1);
  const diaSemana = primeiroDiaMes.getDay();
  const primeiraSegunda = new Date(primeiroDiaMes.getTime() - (diaSemana === 0 ? 6 : diaSemana - 1) * 24 * 60 * 60 * 1000);
  const diasDiff = Math.floor((inicioSemana.getTime() - primeiraSegunda.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return diasDiff + 1;
}

// Gera as atribuições de uma semana pra uma casa - mesma lógica de gerarTarefasSemana() em
// ConfiguracoesPage.tsx (round-robin por carga, desempate por histórico de execuções, respeita
// viagens e limite diário de tarefas por morador).
function gerarAtribuicoesSemana({ weekId, tarefasBase, execucoes, moradoresPresentes, viagens, considerarDomingo }) {
  const atribuicoes = [];
  const tarefasPorMorador = {};
  moradoresPresentes.forEach((m) => { tarefasPorMorador[m.uid] = 0; });
  const tarefasExpandidas = [];
  const matchWeek = weekId.match(/-W(\d+)$/);
  const numSemana = matchWeek ? parseInt(matchWeek[1], 10) : 0;
  const semanaPar = numSemana % 2 === 0;

  tarefasBase.forEach((tarefa) => {
    const diasUteis = considerarDomingo ? 7 : 6;
    if (tarefa.frequencia === 'diaria') {
      for (let d = 0; d < diasUteis; d++) tarefasExpandidas.push({ tarefa, dia: d });
    } else if (tarefa.frequencia === 'semanal' && tarefa.diasSemana && tarefa.diasSemana.length > 0) {
      const diasUnicos = [...new Set(tarefa.diasSemana.map((d) => parseDiaSemana(d)).filter((d) => d !== null))]
        .filter((d) => considerarDomingo || d !== 6);
      diasUnicos.forEach((d) => tarefasExpandidas.push({ tarefa, dia: d }));
    } else if (tarefa.frequencia === 'semanal') {
      const vezes = tarefa.vezesPorSemana || 1;
      for (let v = 0; v < vezes; v++) tarefasExpandidas.push({ tarefa, dia: 0 });
    } else if (tarefa.frequencia === 'quinzenal') {
      if (!semanaPar) tarefasExpandidas.push({ tarefa, dia: 0 });
    } else if (tarefa.frequencia === 'mensal') {
      if (getSemanaDoMes(weekId) === 1) tarefasExpandidas.push({ tarefa, dia: 0 });
    } else if (tarefa.frequencia === 'unica') {
      // O valor de "dia" aqui é ignorado no despacho abaixo (tarefas sem diasSemana sempre
      // passam por distribuirTarefa(tarefa, null), que escolhe o dia menos carregado sozinho) -
      // faz sentido pra uma tarefa "hoje" no fluxo manual, mas pra uma semana futura o
      // algoritmo já resolve isso automaticamente.
      tarefasExpandidas.push({ tarefa, dia: 0 });
    }
  });

  const prioridadeFrequencia = { alta: 0, diaria: 1, semanal: 2, quinzenal: 3, mensal: 4, unica: 5 };
  tarefasExpandidas.sort((a, b) => {
    const pa = a.tarefa.prioridade === 'alta' ? 0 : a.tarefa.prioridade === 'media' ? 1 : 2;
    const pb = b.tarefa.prioridade === 'alta' ? 0 : b.tarefa.prioridade === 'media' ? 1 : 2;
    if (pa !== pb) return pa - pb;
    const fa = prioridadeFrequencia[a.tarefa.frequencia] ?? 99;
    const fb = prioridadeFrequencia[b.tarefa.frequencia] ?? 99;
    return fa - fb;
  });

  const LIMITE_TAREFAS_DIA = 5;
  const DIAS_UTEIS = considerarDomingo ? 7 : 6;
  const capacidadeTotal = moradoresPresentes.length * DIAS_UTEIS * LIMITE_TAREFAS_DIA;
  if (tarefasExpandidas.length > capacidadeTotal) {
    return { atribuicoes: null, erro: `Capacidade excedida: ${tarefasExpandidas.length} tarefas para ${capacidadeTotal} slots` };
  }

  const cargaPorDia = {};
  moradoresPresentes.forEach((m) => { cargaPorDia[m.uid] = new Array(DIAS_UTEIS).fill(0); });
  const tarefasAlocadasPorMorador = {};
  moradoresPresentes.forEach((m) => { tarefasAlocadasPorMorador[m.uid] = {}; });
  let roundRobinIdx = 0;

  function distribuirTarefa(tarefa, diaFixo) {
    if (!considerarDomingo && diaFixo === 6) return null;
    const moradoresDisponiveis = moradoresPresentes.filter((m) => {
      const { viajando, diasFora } = moradorViajandoNaSemana(m.uid, weekId, viagens, considerarDomingo);
      if (diaFixo !== null) {
        if (viajando && diasFora.includes(diaFixo)) return false;
        if (cargaPorDia[m.uid][diaFixo] >= LIMITE_TAREFAS_DIA) return false;
        const diasJaUsados = tarefasAlocadasPorMorador[m.uid][tarefa.id] || [];
        if (diasJaUsados.includes(diaFixo)) return false;
        return true;
      }
      for (let d = 0; d < DIAS_UTEIS; d++) {
        if (viajando && diasFora.includes(d)) continue;
        if (cargaPorDia[m.uid][d] >= LIMITE_TAREFAS_DIA) continue;
        const diasJaUsados = tarefasAlocadasPorMorador[m.uid][tarefa.id] || [];
        if (diasJaUsados.includes(d)) continue;
        return true;
      }
      return false;
    });
    if (moradoresDisponiveis.length === 0) return null;
    const sortedMoradores = moradoresDisponiveis.sort((a, b) => {
      const cargaA = tarefasPorMorador[a.uid] || 0;
      const cargaB = tarefasPorMorador[b.uid] || 0;
      if (cargaA !== cargaB) return cargaA - cargaB;
      const execsA = execucoes.filter((e) => e.tarefaId === tarefa.id && e.executorId === a.uid).length;
      const execsB = execucoes.filter((e) => e.tarefaId === tarefa.id && e.executorId === b.uid).length;
      if (execsA !== execsB) return execsA - execsB;
      const idxA = moradoresPresentes.findIndex((m) => m.uid === a.uid);
      const idxB = moradoresPresentes.findIndex((m) => m.uid === b.uid);
      const posA = (idxA + roundRobinIdx) % moradoresPresentes.length;
      const posB = (idxB + roundRobinIdx) % moradoresPresentes.length;
      return posA - posB;
    });
    const responsavel = sortedMoradores[0];
    tarefasPorMorador[responsavel.uid] = (tarefasPorMorador[responsavel.uid] || 0) + 1;
    roundRobinIdx = (roundRobinIdx + 1) % moradoresPresentes.length;
    let dia = diaFixo;
    if (dia === null) {
      const { diasFora } = moradorViajandoNaSemana(responsavel.uid, weekId, viagens, considerarDomingo);
      const diasJaUsados = tarefasAlocadasPorMorador[responsavel.uid][tarefa.id] || [];
      let melhorDia = -1;
      let menorCarga = Infinity;
      for (let d = 0; d < DIAS_UTEIS; d++) {
        if (diasFora.includes(d)) continue;
        if (diasJaUsados.includes(d)) continue;
        const c = cargaPorDia[responsavel.uid][d];
        if (c >= LIMITE_TAREFAS_DIA) continue;
        if (c < menorCarga) { menorCarga = c; melhorDia = d; }
      }
      if (melhorDia === -1) return null;
      dia = melhorDia;
    }
    if (!tarefasAlocadasPorMorador[responsavel.uid][tarefa.id]) tarefasAlocadasPorMorador[responsavel.uid][tarefa.id] = [];
    tarefasAlocadasPorMorador[responsavel.uid][tarefa.id].push(dia);
    cargaPorDia[responsavel.uid][dia] = (cargaPorDia[responsavel.uid][dia] || 0) + 1;
    return { tarefa, dia, responsavel };
  }

  tarefasExpandidas.filter(({ tarefa }) => tarefa.diasSemana && tarefa.diasSemana.length > 0).forEach(({ tarefa, dia }) => {
    const result = distribuirTarefa(tarefa, dia);
    if (result) {
      atribuicoes.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        tarefaId: tarefa.id, titulo: tarefa.titulo, descricao: tarefa.descricao || '', prioridade: tarefa.prioridade,
        responsavelId: result.responsavel.uid, responsavelNome: result.responsavel.name, diaSemana: result.dia, status: 'pendente',
      });
    }
  });
  tarefasExpandidas.filter(({ tarefa }) => !(tarefa.diasSemana && tarefa.diasSemana.length > 0)).forEach(({ tarefa }) => {
    const result = distribuirTarefa(tarefa, null);
    if (result) {
      atribuicoes.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        tarefaId: tarefa.id, titulo: tarefa.titulo, descricao: tarefa.descricao || '', prioridade: tarefa.prioridade,
        responsavelId: result.responsavel.uid, responsavelNome: result.responsavel.name, diaSemana: result.dia, status: 'pendente',
      });
    }
  });

  return { atribuicoes, tarefasPorMorador, erro: null };
}

async function notificarAdminsDistribuicaoSemanal(casaId, weekId, atribuicoes, tarefasPorMorador, moradoresPresentes) {
  const usersSnap = await db.collection('users').where('houseId', '==', casaId).get();
  const admins = [];
  usersSnap.forEach((d) => { if (d.data().role === 'admin') admins.push(d.id); });
  if (admins.length === 0) return;

  const resumo = moradoresPresentes.map((m) => `${escapeHtml(m.name)}: ${tarefasPorMorador[m.uid] || 0}`).join(' · ');
  const titulo = 'Tarefas da Semana Distribuídas';
  const mensagem = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2937;">
      <p style="margin:0 0 8px 0;font-size:15px;">📋 <strong>${atribuicoes.length}</strong> tarefas distribuídas automaticamente para a semana <strong>${escapeHtml(weekId)}</strong>.</p>
      <p style="margin:0;font-size:13px;color:#374151;">${resumo}</p>
      <p style="margin-top:12px;font-size:11px;color:#9ca3af;text-align:center;">✨ Caule — Sistema de Gestão da Casa</p>
    </div>
  `;

  for (const uid of admins) {
    await db.collection('notificacoes').add({
      destinatarioId: uid,
      titulo,
      mensagem,
      tipo: 'sistema',
      lida: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

async function distribuirTarefasDaCasa(casaId, weekId) {
  const [tarefasSnap, execucoesSnap, usersSnap] = await Promise.all([
    db.collection('tarefas').where('casaId', '==', casaId).get(),
    db.collection('execucoes').where('casaId', '==', casaId).get(),
    db.collection('users').where('houseId', '==', casaId).get(),
  ]);

  const tarefasBase = tarefasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (tarefasBase.length === 0) return;

  const execucoes = execucoesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const hoje = new Date().toISOString().split('T')[0];
  const moradoresPresentes = [];
  const uidsMoradores = [];
  usersSnap.forEach((d) => {
    const data = d.data();
    if (data.isActive === false || data.isPresent !== true) return;
    if (data.role === 'hospede') {
      const estadiaAtiva = data.estadiaInicio && data.estadiaFim && data.estadiaInicio <= hoje && data.estadiaFim > hoje;
      if (!estadiaAtiva) return;
    }
    moradoresPresentes.push({ uid: d.id, name: data.name || 'Morador', role: data.role || 'morador' });
    uidsMoradores.push(d.id);
  });
  if (moradoresPresentes.length === 0) return;

  const viagens = [];
  for (let i = 0; i < uidsMoradores.length; i += 10) {
    const batch = uidsMoradores.slice(i, i + 10);
    const snap = await db.collection('viagens').where('uid', 'in', batch).get();
    snap.forEach((d) => viagens.push({ id: d.id, ...d.data() }));
  }

  // Mesmo padrão do toggle "considerar domingo" em ConfiguracoesPage.tsx: nunca foi persistido
  // no Firestore (é só estado local da tela), então usamos o mesmo default (segunda a sábado).
  const considerarDomingo = false;

  const { atribuicoes, tarefasPorMorador, erro } = gerarAtribuicoesSemana({
    weekId, tarefasBase, execucoes, moradoresPresentes, viagens, considerarDomingo,
  });

  if (erro) {
    console.error('[DistribuicaoSemanal] Casa', casaId, ':', erro);
    return;
  }

  const distSnap = await db.collection('distribuicoes').where('casaId', '==', casaId).get();
  const jaExiste = distSnap.docs.some((d) => d.data().weekId === weekId);
  if (jaExiste) {
    console.log('[DistribuicaoSemanal] Casa', casaId, 'já tem distribuição para', weekId, '- pulando');
    return;
  }

  await db.collection('distribuicoes').add({
    casaId,
    weekId,
    atribuicoes,
    createdAt: FieldValue.serverTimestamp(),
    geradoAutomaticamente: true,
  });

  await notificarAdminsDistribuicaoSemanal(casaId, weekId, atribuicoes, tarefasPorMorador, moradoresPresentes);
}

// Roda todo domingo às 16h (America/Sao_Paulo) e gera a distribuição da semana que começa na
// segunda seguinte (amanhã, no momento em que isso roda), para cada casa cadastrada.
exports.distribuirTarefasSemanais = onSchedule(
  { schedule: '0 16 * * 0', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1' },
  async () => {
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const weekId = weekIdDoDia(amanha);

    const casasSnap = await db.collection('casas').get();
    for (const casaDoc of casasSnap.docs) {
      try {
        await distribuirTarefasDaCasa(casaDoc.id, weekId);
      } catch (e) {
        console.error('[DistribuicaoSemanal] Erro na casa', casaDoc.id, e);
      }
    }
  }
);
