const { onDocumentCreated } = require('firebase-functions/v2/firestore');
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
