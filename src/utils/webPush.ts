import { getToken } from 'firebase/messaging';
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
