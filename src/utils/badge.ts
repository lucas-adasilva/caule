import { Capacitor } from '@capacitor/core';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Sincroniza o número no ícone do app com a quantidade de notificações não lidas do usuário.
 * Só faz algo em plataforma nativa (Android/iOS) - não existe no web/PWA.
 */
export async function syncBadgeCount(uid?: string): Promise<void> {
  if (!uid || !Capacitor.isNativePlatform()) return;
  try {
    const { Badge } = await import('@capawesome/capacitor-badge');
    const { isSupported } = await Badge.isSupported();
    if (!isSupported) return;

    let perm = await Badge.checkPermissions();
    if (perm.display !== 'granted') {
      perm = await Badge.requestPermissions();
      if (perm.display !== 'granted') return;
    }

    // Filtra "lida" no cliente (em vez de where composto) para não depender de um índice
    // composto no Firestore - segue o mesmo padrão já usado no resto do app.
    const q = query(collection(db, 'notificacoes'), where('destinatarioId', '==', uid));
    const snap = await getDocs(q);
    const naoLidas = snap.docs.filter((d) => d.data().lida !== true).length;
    if (naoLidas > 0) {
      await Badge.set({ count: naoLidas });
    } else {
      await Badge.clear();
    }
  } catch (e) {
    console.error('[Badge] Erro ao sincronizar contador:', e);
  }
}
