import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
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
import { syncBadgeCount } from './utils/badge';
import { EstadiaPage } from './pages/EstadiaPage';
import { AcessoRestritoPage } from './pages/AcessoRestritoPage';
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
  const hideNavPaths = ['/login', '/convite', '/cadastro', '/completar-perfil', '/vincular-casa', '/acesso-restrito'];
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
  const { getDoc, doc } = await import('firebase/firestore');
  const { db } = await import('./lib/firebase');

  let userData: any = {};
  let firestoreFound = false;
  try {
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      userData = userDoc.data();
      firestoreFound = true;
    }
  } catch (e: any) {
    console.error('[AUTH] Firestore ERRO:', e.code, e.message);
  }

  let casaAcessoRestrito = false;
  if (userData.houseId) {
    try {
      const casaDoc = await getDoc(doc(db, 'casas', userData.houseId));
      if (casaDoc.exists()) casaAcessoRestrito = casaDoc.data().acessoRestrito === true;
    } catch (e: any) {
      console.error('[AUTH] Erro ao checar acesso restrito da casa:', e.code, e.message);
    }
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
    isPresent: role === 'hospede'
      ? verificarEstadiaAtiva(userData.estadiaInicio, userData.estadiaFim)
      : userData.isPresent !== false,
    phone: userData.phone || '',
    cpf: userData.cpf || '',
    pixKey: userData.pixKey || '',
    birthDate: userData.birthDate || '',
    photoURL: photoURL,
    pronome: userData.pronome || '',
    houseId: userData.houseId || '',
    estadiaInicio: userData.estadiaInicio || '',
    estadiaFim: userData.estadiaFim || '',
    estadiaAtiva: verificarEstadiaAtiva(userData.estadiaInicio, userData.estadiaFim),
    isNewUser: !firestoreFound,
    pushHabilitado: userData.pushHabilitado === true,
    casaAcessoRestrito,
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
  // A rota atual e lida dentro do callback do onAuthStateChanged, que pode
  // disparar a qualquer momento - um ref evita ter que colocar location.pathname
  // nas deps do efeito abaixo (o que forçava reinscrever o listener a cada
  // navegação, causando refetch do Firestore e um flash de loading em cada troca de rota).
  const pathnameRef = useRef(location.pathname);
  useEffect(() => { pathnameRef.current = location.pathname; }, [location.pathname]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        const user = await buildUserObject(firebaseUser);
        setUser(user);
        syncBadgeCount(user.uid);
        const pathname = pathnameRef.current;
        if (user.isNewUser) {
          if (pathname !== '/completar-perfil') {
            navigate('/completar-perfil', { replace: true });
          }
        } else if (!user.houseId) {
          // Usuário existe mas não tem casa vinculada → manda escolher casa
          if (pathname !== '/vincular-casa') {
            navigate('/vincular-casa', { replace: true });
          }
        } else if (user.role !== 'admin' && user.casaAcessoRestrito) {
          if (pathname !== '/acesso-restrito') {
            navigate('/acesso-restrito', { replace: true });
          }
        } else if (user.role === 'hospede' && !user.estadiaAtiva && pathname !== '/estadia') {
          navigate('/estadia', { replace: true });
        } else if (pathname === '/login' || pathname === '/cadastro' || pathname === '/acesso-restrito') {
          navigate('/app', { replace: true });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading, navigate]);

  return null;
}

// Escuta em tempo real a flag acessoRestrito da casa do usuario logado - sem isso, quem ja
// estava com o app aberto so seria bloqueado/liberado no proximo login (o onAuthStateChanged
// acima so roda uma vez por sessao), o que nao serve pro caso de uso de "bloquear todo mundo
// agora enquanto mexo em varias coisas".
function AcessoRestritoListener() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  useEffect(() => { pathnameRef.current = location.pathname; }, [location.pathname]);

  useEffect(() => {
    if (!user?.houseId) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { onSnapshot, doc } = await import('firebase/firestore');
      const { db } = await import('./lib/firebase');
      if (cancelled) return;
      unsubscribe = onSnapshot(doc(db, 'casas', user.houseId as string), (snap) => {
        const restrito = snap.exists() && snap.data().acessoRestrito === true;
        const current = useAuthStore.getState().user;
        if (!current || current.casaAcessoRestrito === restrito) return;
        setUser({ ...current, casaAcessoRestrito: restrito });
        const pathname = pathnameRef.current;
        if (restrito && current.role !== 'admin' && pathname !== '/acesso-restrito') {
          navigate('/acesso-restrito', { replace: true });
        } else if (!restrito && pathname === '/acesso-restrito') {
          navigate('/app', { replace: true });
        }
      });
    })();

    return () => { cancelled = true; if (unsubscribe) unsubscribe(); };
  }, [user?.houseId, setUser, navigate]);

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
        <Route path="/acesso-restrito" element={<ProtectedRoute><AcessoRestritoPage /></ProtectedRoute>} />
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
        <Route path="/completar-perfil" element={<ProtectedRoute><CadastroPage /></ProtectedRoute>} />
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
      <AcessoRestritoListener />
      <AppRoutes />
    </HashRouter>
  );
}
