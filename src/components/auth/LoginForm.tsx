import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  linkWithCredential,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkingState, setLinkingState] = useState<{
    pending: boolean;
    email: string;
    credential: any;
  } | null>(null);
  const navigate = useNavigate();
  const { setUser, setLoading: setAuthLoading } = useAuthStore();

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const { getDoc, doc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      const userObj = {
        uid: result.user.uid,
        email: result.user.email || '',
        name: userData.name || result.user.displayName || email.split('@')[0],
        fullName: userData.fullName || '',
        role: userData.role || 'hospede',
        isActive: userData.isActive !== false,
        isPresent: userData.isPresent !== false,
        phone: userData.phone || '',
        cpf: userData.cpf || '',
        pixKey: userData.pixKey || '',
        photoURL: userData.photoURL || result.user.photoURL || '',
        houseId: userData.houseId || '',
      };
      setUser(userObj);
      navigate(userObj.houseId ? '/app' : '/vincular-casa');
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Detecta se o navegador é mobile (para escolher popup vs redirect)
   */
  function isMobileBrowser(): boolean {
    const ua = navigator.userAgent;
    const isMobileUA = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isSmallScreen = window.innerWidth <= 768;
    return isMobileUA || isSmallScreen;
  }

  /**
   * Vincula a credencial do Google à conta existente de email/senha
   */
  async function handleLinkAccount() {
    if (!linkingState) return;
    setLoading(true);
    setError('');
    try {
      // Faz login com email/senha da conta existente
      const userCredential = await signInWithEmailAndPassword(
        auth,
        linkingState.email,
        password
      );
      // Vincula a credencial do Google
      await linkWithCredential(userCredential.user, linkingState.credential);
      console.log('[LinkAccount] Google vinculado com sucesso!');
      setLinkingState(null);
      setPassword('');
      navigate('/app');
    } catch (err: any) {
      console.error('[LinkAccount] Erro:', err);
      setError(err.message || 'Erro ao vincular conta. Verifique a senha.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError('');
    try {
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        // ==========================================
        // ANDROID / iOS NATIVO (APK)
        // ==========================================
        // Com skipNativeAuth: true, o plugin só pega a credencial.
        // A gente faz a autenticação manualmente no JS SDK para controlar
        // o fluxo de vinculação de contas.
        const result = await FirebaseAuthentication.signInWithGoogle();

        if (!result.credential?.idToken) {
          throw new Error('Credencial incompleta do Google');
        }

        const googleCredential = GoogleAuthProvider.credential(
          result.credential.idToken,
          result.credential.accessToken
        );

        try {
          // Tenta fazer login com a credencial do Google
          await signInWithCredential(auth, googleCredential);
          // onAuthStateChanged no App.tsx detecta o usuário novo e navega
        } catch (signInErr: any) {
          // Se o email já existe com outro provider (email/senha)
          if (signInErr.code === 'auth/account-exists-with-different-credential') {
            const pendingEmail = signInErr.customData?.email || result.user?.email;
            if (pendingEmail) {
              setLinkingState({
                pending: true,
                email: pendingEmail,
                credential: googleCredential,
              });
              // Preenche o email no form para facilitar
              setEmail(pendingEmail);
            } else {
              setError('Esta conta Google já existe com outro método de login. Use email e senha.');
            }
          } else {
            throw signInErr;
          }
        }
        return;
      }

      // ==========================================
      // WEB (desktop e mobile/PWA)
      // ==========================================
      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');

      if (isMobileBrowser()) {
        // Mobile web / PWA: usa redirect
        await signInWithRedirect(auth, provider);
        // A página recarrega; o App.tsx processa via getRedirectResult
      } else {
        // Desktop web: usa popup
        try {
          await signInWithPopup(auth, provider);
          // onAuthStateChanged no App.tsx detecta o usuário novo e navega
        } catch (popupErr: any) {
          if (popupErr.code === 'auth/account-exists-with-different-credential') {
            const pendingEmail = popupErr.customData?.email;
            const pendingCredential = GoogleAuthProvider.credentialFromError(popupErr);
            if (pendingEmail && pendingCredential) {
              setLinkingState({
                pending: true,
                email: pendingEmail,
                credential: pendingCredential,
              });
              setEmail(pendingEmail);
            } else {
              setError('Esta conta Google já existe com outro método de login. Use email e senha.');
            }
          } else {
            throw popupErr;
          }
        }
      }
    } catch (err: any) {
      console.error('[GoogleLogin] Erro:', err);

      let errorMessage = 'Erro ao fazer login com Google';

      if (err?.code === 'auth/popup-blocked') {
        errorMessage = 'Popup bloqueado. Tente recarregar a página.';
      } else if (err?.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Login cancelado.';
      } else if (err?.code === 'auth/unauthorized-domain') {
        errorMessage = 'Domínio não autorizado no Firebase. Adicione este domínio no console.';
      } else if (err?.message?.includes('No credentials available')) {
        errorMessage = 'Nenhuma conta Google encontrada no dispositivo.';
      } else if (err?.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
      setAuthLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-margin-page bg-surface">
      {/* Atmospheric Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-surface-container-high/30 to-surface" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/5 rounded-full blur-3xl" />
      </div>

      <main className="w-full max-w-md flex flex-col items-center">
        {/* Brand Identity */}
        <div className="flex flex-col items-center mb-stack-lg">
          <div className="w-32 h-32 mb-4 bg-surface-container rounded-3xl flex items-center justify-center overflow-hidden shadow-2xl">
            <img src="/assets/logo.png" alt="Caule Logo" className="w-24 h-24 object-contain" />
          </div>
          <h1 className="text-4xl font-bold text-primary tracking-tight">Caule</h1>
        </div>

        {/* Form Card */}
        <div className="w-full glass-panel rounded-xl p-8 shadow-xl">
          {/* Modal de Vinculação de Conta */}
          {linkingState?.pending && (
            <div className="mb-6 bg-secondary-container/30 border border-secondary/30 rounded-lg p-4">
              <h3 className="text-label-sm font-label-sm text-on-surface mb-2">
                Conta Google já existe
              </h3>
              <p className="text-caption font-caption text-on-surface-variant mb-3">
                O email <strong>{linkingState.email}</strong> já tem uma conta. Digite sua senha para vincular o login Google.
              </p>
              <div className="relative group mb-3">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">lock</span>
                <input
                  className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-3 pl-11 pr-4 focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition-all outline-none"
                  type="password"
                  placeholder="Senha da conta existente"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleLinkAccount}
                  disabled={loading || !password}
                  className="flex-1 bg-secondary-container text-on-secondary-container font-bold py-2 rounded-lg hover:brightness-110 transition-all text-label-sm font-label-sm disabled:opacity-50"
                >
                  {loading ? 'Vinculando...' : 'Vincular Conta'}
                </button>
                <button
                  type="button"
                  onClick={() => { setLinkingState(null); setPassword(''); }}
                  className="px-4 py-2 text-on-surface-variant hover:text-on-surface transition-colors text-label-sm font-label-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <form className="space-y-stack-md" onSubmit={handleEmailLogin}>
            {/* Email Input */}
            <div className="space-y-2">
              <label className="text-label-sm font-label-sm text-on-surface-variant block ml-1" htmlFor="email">E-mail</label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-lg">mail</span>
                <input
                  className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-3 pl-11 pr-4 focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 outline-none"
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-label-sm font-label-sm text-on-surface-variant" htmlFor="password">Senha</label>
                <a className="text-caption font-caption text-primary hover:underline" href="#" onClick={(e) => e.preventDefault()}>Esqueceu?</a>
              </div>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-lg">lock</span>
                <input
                  className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-3 pl-11 pr-12 focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 outline-none"
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-error-container/20 border border-error/30 rounded-lg p-3 text-error text-sm">
                {error}
              </div>
            )}

            {/* Primary Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-container text-on-primary-container font-bold py-4 rounded-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-label-sm font-label-sm disabled:opacity-50"
              >
                {loading ? (
                  <span className="material-symbols-outlined animate-spin">refresh</span>
                ) : (
                  <>
                    Entrar
                    <span className="material-symbols-outlined text-xl">arrow_forward</span>
                  </>
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 py-2">
              <div className="h-px bg-outline-variant flex-1" />
              <span className="text-caption font-caption text-text-muted uppercase tracking-widest">ou</span>
              <div className="h-px bg-outline-variant flex-1" />
            </div>

            {/* Google Auth */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || linkingState?.pending}
              className="w-full bg-surface-container text-on-surface border border-outline-variant py-3 rounded-lg hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-3 text-label-sm font-label-sm disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continuar com Google
            </button>
          </form>
        </div>

        {/* Footer */}
        <footer className="mt-stack-lg text-center">
          <p className="text-caption font-caption text-on-surface-variant">
            Nao tem conta? <button className="text-primary font-bold hover:underline" onClick={() => navigate('/cadastro')}>Criar conta</button>
          </p>
          <div className="mt-8 flex justify-center gap-6 text-text-muted">
            <a className="hover:text-primary transition-colors text-caption font-caption" href="#">Privacidade</a>
            <a className="hover:text-primary transition-colors text-caption font-caption" href="#">Termos</a>
            <a className="hover:text-primary transition-colors text-caption font-caption" href="#">Ajuda</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
