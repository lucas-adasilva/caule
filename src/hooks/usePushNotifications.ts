import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  type Token,
  type ActionPerformed,
  type PushNotificationSchema,
} from '@capacitor/push-notifications';
import { collection, addDoc, serverTimestamp, doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { syncBadgeCount } from '../utils/badge';
import { registerWebPush } from '../utils/webPush';

export function usePushNotifications() {
  const { user } = useAuthStore();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<PushNotificationSchema[]>([]);

  const isNative = Capacitor.isNativePlatform();

  // Salvar token FCM no Firestore para permitir push real vindo de outros usuarios (Cloud Function)
  const saveFcmTokenToFirestore = async (fcmToken: string) => {
    if (!user?.uid) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { fcmTokens: arrayUnion(fcmToken) }, { merge: true });
    } catch (e) {
      console.error('[Push] Erro ao salvar fcmToken:', e);
    }
  };

  // Salvar notificacao no Firestore
  const saveNotificationToFirestore = async (notification: PushNotificationSchema) => {
    if (!user?.uid) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: user.uid,
        title: notification.title || '',
        body: notification.body || '',
        data: notification.data || {},
        timestamp: serverTimestamp(),
        read: false,
        type: (notification.data?.type as string) || 'sistema',
      });
    } catch (e) {
      console.error('[Push] Erro ao salvar notificacao:', e);
    }
  };

  const createNotificationChannel = async () => {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.createChannel({
        id: 'caule-default',
        name: 'Caule Notificações',
        description: 'Notificações do app Caule',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
      await LocalNotifications.createChannel({
        id: 'caule-chat',
        name: 'Caule Mensagens',
        description: 'Mensagens de chat',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
    } catch (err: any) {
      console.error('[Push] Erro ao criar canal:', err.message);
    }
  };

  const registerPush = async () => {
    if (!isNative) {
      if (!user?.uid) return;
      const result = await registerWebPush(user.uid);
      if (!result.ok) {
        console.warn('[Push] Web registration failed:', result.error);
        setError(result.error || 'Erro ao registrar push web');
      } else {
        setError(null);
      }
      return;
    }

    try {
      await createNotificationChannel();

      const permStatus = await PushNotifications.requestPermissions();
      if (permStatus.receive !== 'granted') {
        console.warn('[Push] Permission denied');
        setError('Permissao de notificacoes negada');
        return;
      }

      await PushNotifications.register();
      console.log('[Push] Registered with FCM');
    } catch (err: any) {
      console.error('[Push] Registration error:', err);
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!isNative) return;

    // NAO registra push automaticamente no startup - evita crash
    // Usuário ativa manualmente na aba Notificações
    createNotificationChannel();

    const tokenListener = PushNotifications.addListener(
      'registration',
      (token: Token) => {
        console.log('[Push] FCM Token:', token.value);
        setToken(token.value);
        setError(null);
        saveFcmTokenToFirestore(token.value);
      }
    );

    const errorListener = PushNotifications.addListener(
      'registrationError',
      (error) => {
        console.error('[Push] Registration error:', error);
        setError(JSON.stringify(error));
      }
    );

    const receiveListener = PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        console.log('[Push] Received:', notification);
        setNotifications((prev) => [notification, ...prev]);
        // Salvar no Firestore
        saveNotificationToFirestore(notification);
        syncBadgeCount(user?.uid);
      }
    );

    const actionListener = PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action: ActionPerformed) => {
        console.log('[Push] Action performed:', action);
        const data = action.notification.data;
        if (data?.type === 'tarefa' && data?.id) {
          window.location.href = `/app?tarefa=${data.id}`;
        } else if (data?.type === 'mensagem') {
          window.location.href = '/comunicacao';
        }
      }
    );

    // Push NAO registra automaticamente aqui - depende do toggle "Push sempre ativo"
    // (ver efeito separado abaixo, que roda de novo quando o usuario/preferencia carrega)
    // registerPush();

    return () => {
      tokenListener.then((l) => l.remove());
      errorListener.then((l) => l.remove());
      receiveListener.then((l) => l.remove());
      actionListener.then((l) => l.remove());
    };
  }, [isNative]);

  // Registra automaticamente (permissao + token) sempre que o app abre com o toggle "Push
  // sempre ativo" ligado - roda de novo quando o usuario/preferencia carrega do Firestore
  // (que acontece depois do mount, de forma assincrona).
  useEffect(() => {
    if (!user?.pushHabilitado) return;
    registerPush();
  }, [isNative, user?.pushHabilitado, user?.uid]);

  const scheduleLocalNotification = async (title: string, body: string, delayMs: number = 1000) => {
    if (!isNative) return;
    try {
      await createNotificationChannel();
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: Math.floor(Math.random() * 2147483647),
            schedule: { at: new Date(Date.now() + delayMs) },
            channelId: 'caule-default',
            sound: 'default',
            smallIcon: 'ic_stat_notification',
          },
        ],
      });
      console.log('[Push] Local notification scheduled');
    } catch (err: any) {
      console.error('[Push] Local notification error:', err);
      throw err;
    }
  };

  return {
    token,
    error,
    notifications,
    registerPush,
    isNative,
    scheduleLocalNotification,
  };
}
