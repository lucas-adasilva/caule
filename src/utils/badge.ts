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
    if (!isSupported) {
      // No Android, isSupported() reflete se o launcher do aparelho é suportado pelo
      // ShortcutBadger (Samsung, Xiaomi, Huawei, Sony, Nova, etc). Launchers "puros"
      // (Pixel/AOSP) NÃO suportam número no ícone - só um pontinho, e nem sempre.
      console.log('[Badge] Não suportado neste launcher/dispositivo.');
      return;
    }

    let perm = await Badge.checkPermissions();
    if (perm.display !== 'granted') {
      perm = await Badge.requestPermissions();
      if (perm.display !== 'granted') {
        console.log('[Badge] Permissão negada:', perm.display);
        return;
      }
    }

    // Filtra "lida" no cliente (em vez de where composto) para não depender de um índice
    // composto no Firestore - segue o mesmo padrão já usado no resto do app.
    const q = query(collection(db, 'notificacoes'), where('destinatarioId', '==', uid));
    const snap = await getDocs(q);
    const naoLidas = snap.docs.filter((d) => d.data().lida !== true).length;
    if (naoLidas > 0) {
      await Badge.set({ count: naoLidas });
      console.log('[Badge] Contador atualizado:', naoLidas);
    } else {
      await Badge.clear();
      console.log('[Badge] Contador zerado.');
    }
  } catch (e) {
    console.error('[Badge] Erro ao sincronizar contador:', e);
  }
}
