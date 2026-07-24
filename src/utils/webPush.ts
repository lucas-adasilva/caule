import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db, getWebMessaging, VAPID_KEY } from '@/lib/firebase';

/**
 * Registra push real no navegador/PWA: service worker de mensagens, permissão do
 * Notification API e token FCM salvo no mesmo campo `fcmTokens` usado pelo app nativo -
 * a Cloud Function `enviarPushNotificacao` não precisa saber a origem do token, o FCM
 * entrega a versão certa (webpush) sozinho.
 */
export async function registerWebPush(uid: string): Promise<{ ok: boolean; error?: string }> {
  if (!('serviceWorker' in navigator)) {
    return { ok: false, error: 'Este navegador não suporta Service Worker' };
  }
  if (!VAPID_KEY) {
    return { ok: false, error: 'Chave VAPID não configurada ainda (falta gerar no console do Firebase)' };
  }

  try {
    const messaging = await getWebMessaging();
    if (!messaging) {
      return { ok: false, error: 'Push não é suportado neste navegador' };
    }

    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') {
      return { ok: false, error: 'Permissão de notificações negada' };
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) {
      return { ok: false, error: 'Não foi possível gerar o token de push' };
    }

    await setDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) }, { merge: true });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erro desconhecido ao registrar push web' };
  }
}

/**
 * Mensagens com o app/aba em PRIMEIRO PLANO não passam pelo service worker (só chegam lá
 * quando em segundo plano) - chegam aqui, via onMessage(). Sem isso, nada aparece se a pessoa
 * estiver com a aba aberta no momento do push. Mostra a notificação manualmente via SW pra
 * manter o mesmo ícone/clique do caminho de segundo plano.
 */
export async function listenForegroundWebPush(): Promise<() => void> {
  const messaging = await getWebMessaging();
  if (!messaging || !('serviceWorker' in navigator)) return () => {};

  const unsubscribe = onMessage(messaging, async (payload) => {
    const data = payload.data || {};
    const title = data.title || payload.notification?.title || 'Caule';
    const body = data.body || payload.notification?.body || '';
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        data,
      });
    } catch (e) {
      console.error('[Push] Erro ao mostrar notificação em primeiro plano:', e);
    }
  });

  return unsubscribe;
}
