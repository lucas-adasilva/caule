import { useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { auth } from '../lib/firebase';

/**
 * Hook que busca dados do Firestore e sobrescreve o usuário no store.
 * Espera o Firebase JS SDK estar autenticado antes de ler o Firestore.
 */
export function useFirestoreUser() {
  const { user, setUser } = useAuthStore();
  const lastSyncedUid = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    if (lastSyncedUid.current === user.uid) return;

    const syncUserFromFirestore = async () => {
      // AGUARDA o Firebase JS SDK estar logado (pode demorar após login nativo)
      let attempts = 0;
      while (!auth.currentUser && attempts < 30) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }

      if (!auth.currentUser) {
        console.log('[FS] Firebase JS SDK not authenticated after 3s');
        return;
      }

      console.log('[FS] === SYNC START === uid:', user.uid);
      console.log('[FS] Firebase JS user:', auth.currentUser.email);

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log('[FS] Doc FOUND:', JSON.stringify({
            role: userData.role,
            hasPhoto: !!userData.photoURL,
            name: userData.name,
          }));

          lastSyncedUid.current = user.uid;

          // SEMPRE sobrescreve com dados do Firestore
          const updatedUser = {
            ...user,
            role: userData.role || user.role || 'hospede',
            photoURL: (userData.photoURL && userData.photoURL.trim() !== '')
              ? userData.photoURL
              : (user.photoURL || ''),
            name: userData.name || user.name || '',
            fullName: userData.fullName || user.fullName || '',
            phone: userData.phone || user.phone || '',
            cpf: userData.cpf || user.cpf || '',
            pixKey: userData.pixKey || user.pixKey || '',
            houseId: userData.houseId || user.houseId || '',
            isActive: userData.isActive !== false,
            isPresent: (userData.role || 'hospede') === 'hospede'
              ? (userData.estadiaInicio && userData.estadiaFim && userData.estadiaInicio <= new Date().toISOString().split('T')[0] && userData.estadiaFim > new Date().toISOString().split('T')[0])
              : userData.isPresent !== false,
          };

          setUser(updatedUser);
          console.log('[FS] User UPDATED. Role:', updatedUser.role);
        } else {
          console.log('[FS] Doc NOT found for uid:', user.uid);
          lastSyncedUid.current = user.uid;
        }
      } catch (e: any) {
        console.error('[FS] ERROR:', e.message);
      }
      console.log('[FS] === SYNC END ===');
    };

    syncUserFromFirestore();
  }, [user?.uid, setUser]);
}
