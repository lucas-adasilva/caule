import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { auth } from './lib/firebase';
import { useAuthStore } from './stores/authStore';
import { LoginForm } from './components/auth/LoginForm';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { BottomNav } from './components/BottomNav';
import { MenuDrawer } from './components/MenuDrawer';
import { SplashScreen } from './components/SplashScreen';
import { HomePage } from './pages/HomePage';
import { TarefasPage } from './pages/TarefasPage';
import { ConquistasPage } from './pages/ConquistasPage';
import { EventosPage } from './pages/EventosPage';
import { CalendarioPage } from './pages/CalendarioPage';
import { ConfiguracoesPage } from './pages/ConfiguracoesPage';
import { ComunicacaoPage } from './pages/ComunicacaoPage';
import { ConvitePage } from './pages/ConvitePage';
import { CadastroPage } from './pages/CadastroPage';
import { VincularCasaPage } from './pages/VincularCasaPage';
import { NotificacoesPage } from './pages/NotificacoesPage';
import { PerfilPage } from './pages/PerfilPage';
import { UsersPage } from './pages/admin/UsersPage';
import { ProjetosPage } from './pages/ProjetosPage';
import { EstadiaPage } from './pages/EstadiaPage';
import { UpdateDialog } from './components/UpdateDialog';
import { usePushNotifications } from './hooks/usePushNotifications';

// Contexto para handlers globais (menu, notificacoes)
const AppContext = createContext({
  openMenu: () => {},
  openNotifications: () => {},
});
export const useApp = () => useContext(AppContext);

function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const hideNavPaths = ['/login', '/convite', '/cadastro', '/vincular-casa'];
  const showNav = !hideNavPaths.includes(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <AppContext.Provider value={{
      openMenu: () => setMenuOpen(true),
      openNotifications: () => navigate('/notificacoes'),
    }}>
      <div className="min-h-screen bg-surface text-on-surface font-body-md">
        <MenuDrawer isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className={showNav ? 'pb-24' : ''}>
          {children}
        </main>
        {showNav && !menuOpen && <BottomNav />}
        <UpdateDialog />
      </div>
    </AppContext.Provider>
  );
}

async function buildUserObject(firebaseUser: any) {
  const { getDoc, setDoc, doc } = await import('firebase/firestore');
  const { db } = await import('./lib/firebase');

  let userData: any = {};
  let firestoreFound = false;
  try {
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      userData = userDoc.data();
      firestoreFound = true;
    } else {
      // Documento não existe → criar para logins Google (ou novos)
      const newUserData = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || '',
        fullName: firebaseUser.displayName || '',
        photoURL: firebaseUser.photoURL || '',
        phone: firebaseUser.phoneNumber || '',
        cpf: '',
        pixKey: '',
        birthDate: '',
        houseId: '',
        role: 'hospede',
        isActive: true,
        isPresent: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'users', firebaseUser.uid), newUserData);
      userData = newUserData;
      firestoreFound = true;
      console.log('[AUTH] Novo usuário criado no Firestore:', firebaseUser.uid);
    }
  } catch (e: any) {
    console.error('[AUTH] Firestore ERRO:', e.code, e.message);
  }

  const role = userData.role || 'hospede';
  let photoURL = '';
  if (firestoreFound && userData.photoURL && userData.photoURL.trim() !== '') {
    photoURL = userData.photoURL;
  } else {
    photoURL = firebaseUser.photoURL || firebaseUser.photoUrl || '';
  }

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    name: userData.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || '',
    fullName: userData.fullName || '',
    role: role,
    isActive: userData.isActive !== false,
    isPresent: userData.isPresent !== false,
    phone: userData.phone || '',
    cpf: userData.cpf || '',
    pixKey: userData.pixKey || '',
    photoURL: photoURL,
    houseId: userData.houseId || '',
    estadiaInicio: userData.estadiaInicio || '',
    estadiaFim: userData.estadiaFim || '',
    estadiaAtiva: verificarEstadiaAtiva(userData.estadiaInicio, userData.estadiaFim),
  };
}

function verificarEstadiaAtiva(estadiaInicio?: string, estadiaFim?: string): boolean {
  if (!estadiaInicio || !estadiaFim) return false;
  const hoje = new Date().toISOString().split('T')[0];
  return estadiaInicio <= hoje && estadiaFim > hoje;
}

function AuthListener() {
  const { setUser, setLoading } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // ==========================================
    // WEB: processa resultado de redirect primeiro
    // ==========================================
    const isNative = Capacitor.isNativePlatform();
    if (!isNative) {
      getRedirectResult(auth).then(async (redirectResult) => {
        if (redirectResult?.user) {
          console.log('[AuthListener] Login via redirect detectado:', redirectResult.user.email);
          const user = await buildUserObject(redirectResult.user);
          setUser(user);
          if (user.role === 'hospede' && !user.estadiaAtiva && location.pathname !== '/estadia') {
            navigate('/estadia', { replace: true });
          } else {
            navigate('/app', { replace: true });
          }
        }
      }).catch((err) => {
        console.log('[AuthListener] Sem redirect pendente:', err);
      });
    }

    // ==========================================
    // Listener unificado para TODAS as plataformas
    // ==========================================
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        const user = await buildUserObject(firebaseUser);
        setUser(user);
        if (user.role === 'hospede' && !user.estadiaAtiva && location.pathname !== '/estadia') {
          navigate('/estadia', { replace: true });
        } else if (location.pathname === '/login' || location.pathname === '/cadastro') {
          navigate('/app', { replace: true });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading, navigate, location.pathname]);

  return null;
}

function AppRoutes() {
  usePushNotifications();

  return (
    <AppLayout>
      <Routes>
        <Route path="/login" element={<LoginForm />} />
        <Route path="/convite" element={<ConvitePage />} />
        <Route path="/cadastro" element={<CadastroPage />} />
        <Route path="/vincular-casa" element={<ProtectedRoute><VincularCasaPage /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/app" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/tarefas" element={<ProtectedRoute><TarefasPage /></ProtectedRoute>} />
        <Route path="/conquistas" element={<ProtectedRoute><ConquistasPage /></ProtectedRoute>} />
        <Route path="/projetos" element={<ProtectedRoute><ProjetosPage /></ProtectedRoute>} />
        <Route path="/eventos" element={<ProtectedRoute><EventosPage /></ProtectedRoute>} />
        <Route path="/calendario" element={<ProtectedRoute><CalendarioPage /></ProtectedRoute>} />
        <Route path="/comunicacao" element={<ProtectedRoute><ComunicacaoPage /></ProtectedRoute>} />
        <Route path="/notificacoes" element={<ProtectedRoute><NotificacoesPage /></ProtectedRoute>} />
        <Route path="/perfil" element={<ProtectedRoute><PerfilPage /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
        <Route path="/estadia" element={<ProtectedRoute><EstadiaPage /></ProtectedRoute>} />
        <Route path="/configuracoes" element={<ProtectedRoute adminOnly><ConfiguracoesPage /></ProtectedRoute>} />
      </Routes>
    </AppLayout>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const { user, isLoading } = useAuthStore();

  // Se usuário já está logado, não mostra splash (vai direto para app)
  // Se está deslogado, mostra splash antes do login
  const shouldShowSplash = showSplash && !user && !isLoading;

  return (
    <HashRouter>
      {shouldShowSplash && (
        <SplashScreen onComplete={() => setShowSplash(false)} />
      )}
      <AuthListener />
      <AppRoutes />
    </HashRouter>
  );
}
