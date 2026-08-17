import { signOut } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';

export function AcessoRestritoPage() {
  async function handleLogout() {
    try {
      if (Capacitor.isNativePlatform()) {
        await FirebaseAuthentication.signOut();
      }
    } catch (e) {
      console.log('[AcessoRestrito] Native signOut error:', e);
    }
    await signOut(auth);
    useAuthStore.getState().logout();
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col items-center justify-center px-8 text-center gap-4">
      <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center">
        <span className="material-symbols-outlined text-error text-3xl">lock</span>
      </div>
      <h1 className="font-headline-lg-mobile text-headline-lg-mobile">Seu acesso está desativado</h1>
      <p className="font-body-md text-text-muted max-w-xs">
        O administrador do app ativou o acesso restrito.
      </p>
      <button
        onClick={handleLogout}
        className="mt-4 px-6 py-2.5 bg-surface-container text-on-surface rounded-lg text-sm font-bold border border-outline-variant hover:bg-surface-container-high transition-colors"
      >
        Sair
      </button>
    </div>
  );
}
