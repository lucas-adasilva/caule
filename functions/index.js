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

async function buscarMembrosCasa(casaId) {
  const snap = await db.collection('users').where('houseId', '==', casaId).get();
  const membros = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.isActive === false) return;
    membros.push({ uid: d.id, role: data.role || 'hospede' });
  });
  return membros;
}

function destinatariosPorTipo(membros, tipo) {
  if (tipo === 'privado') return [];
  if (tipo === 'apenas_moradores') return membros.filter((m) => m.role !== 'hospede');
  return membros;
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

        // Lembrete devido agora - dispara notificacao
        try {
          const membros = await buscarMembrosCasa(evento.casaId);
          const destinatarios = destinatariosPorTipo(membros, evento.tipo || 'coletivo');
          if (destinatarios.length === 0) continue;

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

          for (const membro of destinatarios) {
            await db.collection('notificacoes').add({
              destinatarioId: membro.uid,
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
