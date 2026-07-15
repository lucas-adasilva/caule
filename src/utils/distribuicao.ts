import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Capacitor } from '@capacitor/core';

// ==========================================
// INTERFACES
// ==========================================

export interface AtribuicaoHistorico {
  data: string;
  tipo: 'distribuicao' | 'redistribuicao' | 'realocacao' | 'adiantamento';
  motivo: string;
  responsavelAnteriorId?: string;
  responsavelAnteriorNome?: string;
  responsavelNovoId?: string;
  responsavelNovoNome?: string;
  semanaOrigem?: string;
  semanaDestino?: string;
}

export interface Atribuicao {
  id: string;
  tarefaId: string;
  titulo: string;
  descricao: string;
  prioridade: 'alta' | 'media' | 'baixa';
  responsavelId: string;
  responsavelNome: string;
  diaSemana: number;
  status: 'pendente' | 'concluída';
  dataConclusao?: string;
  dataPlanejamento?: string;
  historico?: AtribuicaoHistorico[];
}

export interface DistribuicaoSemana {
  id: string;
  weekId: string;
  casaId: string;
  atribuicoes: Atribuicao[];
}

export interface MoradorInfo {
  uid: string;
  name: string;
  role: string;
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

export function proximaSemana(weekId: string): string {
  const match = weekId.match(/(\d+)-W(\d+)/);
  if (!match) return weekId;
  const ano = parseInt(match[1], 10);
  const semana = parseInt(match[2], 10);
  if (semana >= 52) return `${ano + 1}-W01`;
  return `${ano}-W${String(semana + 1).padStart(2, '0')}`;
}

export function semanaAnterior(weekId: string): string {
  const match = weekId.match(/(\d+)-W(\d+)/);
  if (!match) return weekId;
  const ano = parseInt(match[1], 10);
  const semana = parseInt(match[2], 10);
  if (semana <= 1) return `${ano - 1}-W52`;
  return `${ano}-W${String(semana - 1).padStart(2, '0')}`;
}

export async function buscarDistribuicao(
  casaId: string,
  weekId: string
): Promise<DistribuicaoSemana | null> {
  const q = query(collection(db, 'distribuicoes'), where('casaId', '==', casaId));
  const snap = await getDocs(q);
  let encontrou: DistribuicaoSemana | null = null;
  snap.forEach((d) => {
    const data = d.data() as any;
    if (data.weekId === weekId && !encontrou) {
      encontrou = {
        id: d.id,
        weekId: data.weekId,
        casaId: data.casaId,
        atribuicoes: (data.atribuicoes || []).map((a: any) => ({
          ...a,
          historico: a.historico || [],
        })),
      };
    }
  });
  return encontrou;
}

export async function buscarMoradoresPresentes(casaId: string): Promise<MoradorInfo[]> {
  const q = query(collection(db, 'users'), where('houseId', '==', casaId));
  const snap = await getDocs(q);
  const hoje = new Date().toISOString().split('T')[0];
  const moradores: MoradorInfo[] = [];

  snap.forEach((d) => {
    const data = d.data();
    if (data.isActive === false) return;

    let estaPresente = false;
    if (data.role === 'hospede') {
      estaPresente =
        data.estadiaInicio &&
        data.estadiaFim &&
        data.estadiaInicio <= hoje &&
        data.estadiaFim > hoje;
    } else {
      estaPresente = data.isPresent !== false;
    }

    if (estaPresente) {
      moradores.push({
        uid: d.id,
        name: data.name || 'Morador',
        role: data.role || 'morador',
      });
    }
  });

  return moradores;
}

function calcularCarga(atribuicoes: Atribuicao[], moradores: MoradorInfo[]): Record<string, number> {
  const carga: Record<string, number> = {};
  moradores.forEach((m) => (carga[m.uid] = 0));
  atribuicoes.forEach((a) => {
    if (a.status === 'pendente' && carga[a.responsavelId] !== undefined) {
      carga[a.responsavelId] = (carga[a.responsavelId] || 0) + 1;
    }
  });
  return carga;
}

function adicionarHistorico(
  atribuicao: Atribuicao,
  tipo: AtribuicaoHistorico['tipo'],
  motivo: string,
  extra?: Partial<AtribuicaoHistorico>
): Atribuicao {
  const entrada: AtribuicaoHistorico = {
    data: new Date().toISOString(),
    tipo,
    motivo,
    ...extra,
  };
  return {
    ...atribuicao,
    historico: [...(atribuicao.historico || []), entrada],
  };
}

function moradorComMenorCarga(moradores: MoradorInfo[], carga: Record<string, number>): MoradorInfo | null {
  if (moradores.length === 0) return null;
  return moradores.reduce((menor, atual) => {
    const cargaMenor = carga[menor.uid] || 0;
    const cargaAtual = carga[atual.uid] || 0;
    return cargaAtual < cargaMenor ? atual : menor;
  });
}

async function salvarDistribuicao(distId: string, atribuicoes: Atribuicao[]): Promise<void> {
  await updateDoc(doc(db, 'distribuicoes', distId), {
    atribuicoes,
    updatedAt: serverTimestamp(),
  });
}

function calcularDiasEntre(inicio: string, fim: string): number {
  const d1 = new Date(inicio);
  const d2 = new Date(fim);
  const diff = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

// ==========================================
// NOTIFICAÇÃO PARA ADMIN
// ==========================================

async function buscarAdmins(casaId: string): Promise<{ uid: string; name: string }[]> {
  const q = query(collection(db, 'users'), where('houseId', '==', casaId));
  const snap = await getDocs(q);
  const admins: { uid: string; name: string }[] = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.role === 'admin') {
      admins.push({ uid: d.id, name: data.name || 'Admin' });
    }
  });
  return admins;
}

const DIAS_LABEL = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function corPrioridade(p: string): string {
  if (p === 'alta') return '#ef4444';
  if (p === 'media') return '#f59e0b';
  return '#22c55e';
}

function emojiPrioridade(p: string): string {
  if (p === 'alta') return '🔴';
  if (p === 'media') return '🟡';
  return '🟢';
}

async function enviarNotificacaoLocal(titulo: string, body: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [
        {
          title: titulo,
          body: body.replace(/<[^>]*>/g, ''),
          id: Math.floor(Math.random() * 2147483647),
          channelId: 'caule-default',
          sound: 'default',
          smallIcon: 'ic_stat_notification',
        },
      ],
    });
  } catch (err: any) {
    console.error('[Notificacao] Local notification error:', err.message);
  }
}

async function notificarRedistribuicao(
  casaId: string,
  nomeMorador: string,
  tipoEvento: 'chegada' | 'saida',
  subtipo: 'viagem' | 'estadia',
  tarefasAlteradas: Atribuicao[],
  realocadas: number,
  adiantadas: number,
  tituloCustom?: string
): Promise<void> {
  const admins = await buscarAdmins(casaId);
  if (admins.length === 0) return;

  const isChegada = tipoEvento === 'chegada';
  const corEvento = isChegada ? '#22c55e' : '#ef4444';
  const emojiEvento = isChegada ? '✅' : '✈️';
  const textoEvento = subtipo === 'estadia'
    ? (isChegada ? 'iniciou a estadia' : 'encerrou a estadia')
    : (isChegada ? 'retornou de viagem' : 'saiu em viagem');

  // Tabelinha de tarefas redistribuídas
  let tabelaHTML = '';
  if (tarefasAlteradas.length > 0) {
    tabelaHTML = `
      <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;">
        <thead>
          <tr style="background:${corEvento}15;">
            <th style="text-align:left;padding:8px;border-bottom:2px solid ${corEvento}40;">Tarefa</th>
            <th style="text-align:center;padding:8px;border-bottom:2px solid ${corEvento}40;">Prioridade</th>
            <th style="text-align:center;padding:8px;border-bottom:2px solid ${corEvento}40;">Dia</th>
            <th style="text-align:left;padding:8px;border-bottom:2px solid ${corEvento}40;">Responsável</th>
          </tr>
        </thead>
        <tbody>
          ${tarefasAlteradas.map((a, i) => `
            <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${a.titulo}</td>
              <td style="text-align:center;padding:8px;border-bottom:1px solid #e5e7eb;">
                <span style="color:${corPrioridade(a.prioridade)};font-weight:bold;">
                  ${emojiPrioridade(a.prioridade)} ${a.prioridade}
                </span>
              </td>
              <td style="text-align:center;padding:8px;border-bottom:1px solid #e5e7eb;">${DIAS_LABEL[a.diaSemana]}</td>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${a.responsavelNome}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  const totalExtras = [];
  if (realocadas > 0) totalExtras.push(`📅 ${realocadas} realocada${realocadas > 1 ? 's' : ''} para próxima semana`);
  if (adiantadas > 0) totalExtras.push(`⏩ ${adiantadas} adiantada${adiantadas > 1 ? 's' : ''} da próxima semana`);

  const mensagemHTML = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2937;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:24px;">${emojiEvento}</span>
        <div>
          <p style="margin:0;font-size:15px;color:#6b7280;">Redistribuição de Tarefas</p>
          <p style="margin:0;font-size:17px;font-weight:700;color:${corEvento};">
            <strong>${nomeMorador}</strong> ${textoEvento}
          </p>
        </div>
      </div>
      ${tabelaHTML}
      <div style="margin-top:14px;padding:10px 12px;background:#f3f4f6;border-radius:10px;font-size:13px;color:#374151;">
        <p style="margin:0 0 4px 0;font-weight:600;">📊 Resumo:</p>
        <p style="margin:0;">📝 ${tarefasAlteradas.length} tarefa${tarefasAlteradas.length !== 1 ? 's' : ''} redistribuída${tarefasAlteradas.length !== 1 ? 's' : ''}</p>
        ${totalExtras.length > 0 ? `<p style="margin:4px 0 0 0;">${totalExtras.join(' · ')}</p>` : ''}
      </div>
      <p style="margin-top:12px;font-size:11px;color:#9ca3af;text-align:center;">
        ✨ Caule — Sistema de Gestão da Casa
      </p>
    </div>
  `;

  const titulo = tituloCustom || `Redistribuição de Tarefas — ${nomeMorador} ${textoEvento}`;
  const bodyTexto = `${tarefasAlteradas.length} tarefas redistribuídas. ${totalExtras.join('. ')}`;

  // Envia para cada admin
  for (const admin of admins) {
    try {
      await addDoc(collection(db, 'notificacoes'), {
        destinatarioId: admin.uid,
        titulo,
        mensagem: mensagemHTML,
        tipo: 'sistema',
        lida: false,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('[Notificacao] Erro ao salvar notificacao:', e);
    }
  }

  // Envia notificação local no dispositivo
  await enviarNotificacaoLocal(titulo, bodyTexto);
}

// ==========================================
// REDISTRIBUIÇÃO POR SAÍDA
// ==========================================

export async function redistribuirPorSaida(
  uidSaindo: string,
  casaId: string,
  weekId: string,
  motivo: 'viagem' | 'estadia_terminada',
  tituloNotificacao?: string
): Promise<{ redistribuidas: number; realocadas: number }> {
  const dist = await buscarDistribuicao(casaId, weekId);
  if (!dist) return { redistribuidas: 0, realocadas: 0 };

  const moradores = await buscarMoradoresPresentes(casaId);
  if (moradores.length === 0) return { redistribuidas: 0, realocadas: 0 };

  const carga = calcularCarga(dist.atribuicoes, moradores);
  const textoMotivo =
    motivo === 'viagem' ? 'Morador saiu em viagem' : 'Hóspede encerrou a estadia';

  const novasAtribuicoes: Atribuicao[] = [];
  const tarefasParaRealocar: Atribuicao[] = [];
  const tarefasRedistribuidas: Atribuicao[] = [];
  let redistribuidas = 0;
  let realocadas = 0;

  for (const atrib of dist.atribuicoes) {
    if (atrib.responsavelId !== uidSaindo || atrib.status !== 'pendente') {
      novasAtribuicoes.push(atrib);
      continue;
    }

    if (atrib.prioridade === 'alta') {
      const novoResponsavel = moradorComMenorCarga(moradores, carga);
      if (novoResponsavel) {
        carga[novoResponsavel.uid] = (carga[novoResponsavel.uid] || 0) + 1;
        const nova = adicionarHistorico(
          { ...atrib, responsavelId: novoResponsavel.uid, responsavelNome: novoResponsavel.name },
          'redistribuicao',
          textoMotivo,
          {
            responsavelAnteriorId: uidSaindo,
            responsavelAnteriorNome: atrib.responsavelNome,
            responsavelNovoId: novoResponsavel.uid,
            responsavelNovoNome: novoResponsavel.name,
          }
        );
        novasAtribuicoes.push(nova);
        tarefasRedistribuidas.push(nova);
        redistribuidas++;
      } else {
        tarefasParaRealocar.push(atrib);
      }
    } else {
      const LIMITE = 5;
      const disponiveis = moradores.filter((m) => (carga[m.uid] || 0) < LIMITE);
      if (disponiveis.length > 0) {
        const novoResponsavel = moradorComMenorCarga(disponiveis, carga);
        if (novoResponsavel) {
          carga[novoResponsavel.uid] = (carga[novoResponsavel.uid] || 0) + 1;
          const nova = adicionarHistorico(
            { ...atrib, responsavelId: novoResponsavel.uid, responsavelNome: novoResponsavel.name },
            'redistribuicao',
            textoMotivo,
            {
              responsavelAnteriorId: uidSaindo,
              responsavelAnteriorNome: atrib.responsavelNome,
              responsavelNovoId: novoResponsavel.uid,
              responsavelNovoNome: novoResponsavel.name,
            }
          );
          novasAtribuicoes.push(nova);
          tarefasRedistribuidas.push(nova);
          redistribuidas++;
        } else {
          tarefasParaRealocar.push(atrib);
        }
      } else {
        tarefasParaRealocar.push(atrib);
      }
    }
  }

  if (tarefasParaRealocar.length > 0) {
    await realocarParaSemanaSeguinte(tarefasParaRealocar, casaId, weekId, uidSaindo, textoMotivo);
    realocadas = tarefasParaRealocar.length;
  }

  await salvarDistribuicao(dist.id, novasAtribuicoes);

  // Busca nome do morador para notificação
  let nomeMorador = 'Morador';
  try {
    const q = query(collection(db, 'users'), where('houseId', '==', casaId));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      if (d.id === uidSaindo) nomeMorador = d.data().name || 'Morador';
    });
  } catch { /* silent */ }

  await notificarRedistribuicao(
    casaId,
    nomeMorador,
    'saida',
    motivo === 'viagem' ? 'viagem' : 'estadia',
    tarefasRedistribuidas,
    realocadas,
    0,
    tituloNotificacao
  );

  return { redistribuidas, realocadas };
}

// ==========================================
// REDISTRIBUIÇÃO POR ENTRADA
// ==========================================

export async function redistribuirPorEntrada(
  uidEntrando: string,
  casaId: string,
  weekId: string,
  motivo: 'retorno_viagem' | 'estadia_iniciada',
  estadiaInicio?: string,
  estadiaFim?: string,
  tituloNotificacao?: string
): Promise<{ redistribuidas: number; adiantadas: number }> {
  // Verifica > 1 noite para hóspedes
  if (motivo === 'estadia_iniciada' && estadiaInicio && estadiaFim) {
    const noites = calcularDiasEntre(estadiaInicio, estadiaFim);
    if (noites <= 1) {
      return { redistribuidas: 0, adiantadas: 0 };
    }
  }

  const dist = await buscarDistribuicao(casaId, weekId);
  if (!dist) return { redistribuidas: 0, adiantadas: 0 };

  const moradores = await buscarMoradoresPresentes(casaId);
  if (moradores.length === 0) return { redistribuidas: 0, adiantadas: 0 };

  const textoMotivo = motivo === 'retorno_viagem' ? 'Morador retornou de viagem' : 'Hóspede iniciou a estadia';

  // Dia de hoje (segunda=0, domingo=6)
  const diaHoje = (new Date().getDay() + 6) % 7;

  // Separa moradores que já estavam presentes dos que acabaram de entrar
  const moradoresAnteriores = moradores.filter((m) => m.uid !== uidEntrando);
  const moradorEntrando = moradores.find((m) => m.uid === uidEntrando);

  const carga: Record<string, number> = {};
  moradores.forEach((m) => (carga[m.uid] = 0));

  const pendentes = dist.atribuicoes.filter((a) => a.status === 'pendente');
  const concluidas = dist.atribuicoes.filter((a) => a.status === 'concluída');
  const novasAtribuicoes: Atribuicao[] = [...concluidas];
  const tarefasRedistribuidas: Atribuicao[] = [];

  for (const atrib of pendentes) {
    // Se for dia de hoje, o morador que entrou não pode receber (só a partir de amanhã)
    const candidatos =
      atrib.diaSemana === diaHoje && moradorEntrando
        ? moradoresAnteriores
        : moradores;

    if (candidatos.length === 0) {
      novasAtribuicoes.push(atrib);
      continue;
    }

    const sortedMoradores = [...candidatos].sort((a, b) => (carga[a.uid] || 0) - (carga[b.uid] || 0));
    const novoResponsavel = sortedMoradores[0];
    if (!novoResponsavel) {
      novasAtribuicoes.push(atrib);
      continue;
    }

    carga[novoResponsavel.uid] = (carga[novoResponsavel.uid] || 0) + 1;

    const foiMudanca = atrib.responsavelId !== novoResponsavel.uid;
    const novaAtrib = foiMudanca
      ? adicionarHistorico(
          { ...atrib, responsavelId: novoResponsavel.uid, responsavelNome: novoResponsavel.name },
          'redistribuicao',
          textoMotivo,
          {
            responsavelAnteriorId: atrib.responsavelId,
            responsavelAnteriorNome: atrib.responsavelNome,
            responsavelNovoId: novoResponsavel.uid,
            responsavelNovoNome: novoResponsavel.name,
          }
        )
      : atrib;

    novasAtribuicoes.push(novaAtrib);
    if (foiMudanca) tarefasRedistribuidas.push(novaAtrib);
  }

  // Capacidade restante
  const LIMITE = 5;
  const DIAS = 6;
  const capacidadeTotal = moradores.length * DIAS * LIMITE;
  const tarefasTotais = novasAtribuicoes.filter((a) => a.status === 'pendente').length;
  const capacidadeSobrando = Math.max(0, capacidadeTotal - tarefasTotais);

  let adiantadas = 0;
  if (capacidadeSobrando > 0) {
    const resultadoAdiantamento = await adiantarTarefas(casaId, weekId, capacidadeSobrando, moradores, carga);
    novasAtribuicoes.push(...resultadoAdiantamento.tarefasAdiantadas);
    adiantadas = resultadoAdiantamento.tarefasAdiantadas.length;

    if (resultadoAdiantamento.distFuturaId && resultadoAdiantamento.atribuicoesFuturas) {
      await salvarDistribuicao(resultadoAdiantamento.distFuturaId, resultadoAdiantamento.atribuicoesFuturas);
    }
  }

  await salvarDistribuicao(dist.id, novasAtribuicoes);

  // Busca nome do morador
  let nomeMorador = 'Morador';
  try {
    const q = query(collection(db, 'users'), where('houseId', '==', casaId));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      if (d.id === uidEntrando) nomeMorador = d.data().name || 'Morador';
    });
  } catch { /* silent */ }

  await notificarRedistribuicao(
    casaId,
    nomeMorador,
    'chegada',
    motivo === 'retorno_viagem' ? 'viagem' : 'estadia',
    tarefasRedistribuidas,
    0,
    adiantadas,
    tituloNotificacao
  );

  return { redistribuidas: pendentes.length, adiantadas };
}

// ==========================================
// REALOCAÇÃO / ADIANTAMENTO
// ==========================================

async function realocarParaSemanaSeguinte(
  tarefas: Atribuicao[],
  casaId: string,
  weekIdAtual: string,
  _uidSaindo: string,
  motivoTexto: string
): Promise<void> {
  const weekIdDestino = proximaSemana(weekIdAtual);
  let distDestino = await buscarDistribuicao(casaId, weekIdDestino);

  const novasAtribuicoes = tarefas.map((atrib) =>
    adicionarHistorico(
      {
        ...atrib,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        dataPlanejamento: atrib.dataPlanejamento || new Date().toISOString(),
      },
      'realocacao',
      motivoTexto,
      { semanaOrigem: weekIdAtual, semanaDestino: weekIdDestino }
    )
  );

  if (!distDestino) {
    await addDoc(collection(db, 'distribuicoes'), {
      casaId,
      weekId: weekIdDestino,
      atribuicoes: novasAtribuicoes,
      createdAt: serverTimestamp(),
    });
    return;
  }

  const atribuicoesAtuais = [...distDestino.atribuicoes, ...novasAtribuicoes];
  await salvarDistribuicao(distDestino.id, atribuicoesAtuais);
}

interface ResultadoAdiantamento {
  tarefasAdiantadas: Atribuicao[];
  distFuturaId?: string;
  atribuicoesFuturas?: Atribuicao[];
}

async function adiantarTarefas(
  casaId: string,
  weekIdAtual: string,
  quantidadeMaxima: number,
  moradores: MoradorInfo[],
  cargaAtual: Record<string, number>
): Promise<ResultadoAdiantamento> {
  const weekIdFuturo = proximaSemana(weekIdAtual);
  const distFutura = await buscarDistribuicao(casaId, weekIdFuturo);
  if (!distFutura) return { tarefasAdiantadas: [] };

  const tarefasPendentesFuturas = distFutura.atribuicoes.filter((a) => a.status === 'pendente');
  if (tarefasPendentesFuturas.length === 0) return { tarefasAdiantadas: [] };

  const tarefasParaAdiantar = tarefasPendentesFuturas.slice(0, quantidadeMaxima);
  const tarefasAdiantadas: Atribuicao[] = [];

  for (const atrib of tarefasParaAdiantar) {
    const sortedMoradores = [...moradores].sort((a, b) => (cargaAtual[a.uid] || 0) - (cargaAtual[b.uid] || 0));
    const novoResponsavel = sortedMoradores[0];
    if (!novoResponsavel) break;

    cargaAtual[novoResponsavel.uid] = (cargaAtual[novoResponsavel.uid] || 0) + 1;

    tarefasAdiantadas.push(
      adicionarHistorico(
        {
          ...atrib,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          responsavelId: novoResponsavel.uid,
          responsavelNome: novoResponsavel.name,
          dataPlanejamento: atrib.dataPlanejamento || new Date().toISOString(),
        },
        'adiantamento',
        'Capacidade disponível na semana atual — tarefa adiantada',
        {
          semanaOrigem: weekIdFuturo,
          semanaDestino: weekIdAtual,
          responsavelAnteriorId: atrib.responsavelId,
          responsavelAnteriorNome: atrib.responsavelNome,
          responsavelNovoId: novoResponsavel.uid,
          responsavelNovoNome: novoResponsavel.name,
        }
      )
    );
  }

  const idsAdiantados = new Set(tarefasAdiantadas.map((a) => a.tarefaId + '-' + a.diaSemana));
  const atribuicoesFuturasAtualizadas = distFutura.atribuicoes.filter(
    (a) => a.status !== 'pendente' || !idsAdiantados.has(a.tarefaId + '-' + a.diaSemana)
  );

  return {
    tarefasAdiantadas,
    distFuturaId: distFutura.id,
    atribuicoesFuturas: atribuicoesFuturasAtualizadas,
  };
}

// ==========================================
// GERAR DISTRIBUIÇÃO COM HISTÓRICO
// ==========================================

export function criarAtribuicaoComHistorico(
  tarefaId: string,
  titulo: string,
  descricao: string,
  prioridade: 'alta' | 'media' | 'baixa',
  responsavel: MoradorInfo,
  diaSemana: number
): Atribuicao {
  const agora = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    tarefaId,
    titulo,
    descricao,
    prioridade,
    responsavelId: responsavel.uid,
    responsavelNome: responsavel.name,
    diaSemana,
    status: 'pendente',
    dataPlanejamento: agora,
    historico: [
      {
        data: agora,
        tipo: 'distribuicao',
        motivo: 'Distribuição inicial da semana',
        responsavelNovoId: responsavel.uid,
        responsavelNovoNome: responsavel.name,
      },
    ],
  };
}
