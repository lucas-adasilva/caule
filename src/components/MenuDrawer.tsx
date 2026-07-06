import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { UserAvatar } from '@/components/UserAvatar';
import { usuarioViajandoAgora } from '@/utils/viagens';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  path: string;
  label: string;
  realLabel: string;
  icon: string;
  color: string;
  activeBg: string;
  hoverBg: string;
  showFor: ('admin' | 'morador' | 'hospede')[];
}

// Menu lateral - visibilidade por role
const menuItems: MenuItem[] = [
  { path: '/app', label: 'Copa', realLabel: 'Visão Geral', icon: 'forest', color: 'text-[#2ECC71]', activeBg: 'bg-[#2ECC71]/15', hoverBg: 'hover:bg-[#2ECC71]/25', showFor: ['admin', 'morador'] },
  { path: '/tarefas', label: 'Folhas', realLabel: 'Tarefas', icon: 'eco', color: 'text-[#90EE90]', activeBg: 'bg-[#90EE90]/15', hoverBg: 'hover:bg-[#90EE90]/25', showFor: ['admin', 'morador', 'hospede'] },
  { path: '/eventos', label: 'Flores', realLabel: 'Eventos', icon: 'local_florist', color: 'text-[#FFB6C1]', activeBg: 'bg-[#FFB6C1]/15', hoverBg: 'hover:bg-[#FFB6C1]/25', showFor: ['admin', 'morador', 'hospede'] },
  { path: '/conquistas', label: 'Frutos', realLabel: 'Conquistas', icon: 'nutrition', color: 'text-[#FFA07A]', activeBg: 'bg-[#FFA07A]/15', hoverBg: 'hover:bg-[#FFA07A]/25', showFor: ['admin', 'morador'] },
  { path: '/projetos', label: 'Sementes', realLabel: 'Projetos', icon: 'potted_plant', color: 'text-[#98D8C8]', activeBg: 'bg-[#98D8C8]/15', hoverBg: 'hover:bg-[#98D8C8]/25', showFor: ['admin', 'morador'] },
  { path: '/admin/users', label: 'Ramos', realLabel: 'Moradores', icon: 'account_tree', color: 'text-[#A5B4FC]', activeBg: 'bg-[#A5B4FC]/15', hoverBg: 'hover:bg-[#A5B4FC]/25', showFor: ['admin', 'morador'] },
  { path: '/calendario', label: 'Ciclos', realLabel: 'Calendário', icon: 'cycle', color: 'text-[#D8BFD8]', activeBg: 'bg-[#D8BFD8]/15', hoverBg: 'hover:bg-[#D8BFD8]/25', showFor: ['admin', 'morador', 'hospede'] },
  { path: '/comunicacao', label: 'Raízes', realLabel: 'Comunicação', icon: 'device_hub', color: 'text-[#8A2BE2]', activeBg: 'bg-[#8A2BE2]/15', hoverBg: 'hover:bg-[#8A2BE2]/25', showFor: ['admin', 'morador', 'hospede'] },
  { path: '/configuracoes', label: 'Caule', realLabel: 'Configurações', icon: 'yard', color: 'text-[#A9A9A9]', activeBg: 'bg-[#A9A9A9]/15', hoverBg: 'hover:bg-[#A9A9A9]/25', showFor: ['admin'] },
];

export function MenuDrawer({ isOpen, onClose }: MenuDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const [houseName, setHouseName] = useState<string>('Caule');
  const [isTraveling, setIsTraveling] = useState(false);

  const role = user?.role || 'hospede';
  const filteredItems = menuItems.filter(item => item.showFor.includes(role as any));

  // Buscar nome da casa e verificar viagem quando o drawer abrir
  useEffect(() => {
    const houseId = user?.houseId;
    if (isOpen && houseId) {
      const fetchHouseName = async () => {
        try {
          const houseDoc = await getDoc(doc(db, 'casas', houseId));
          if (houseDoc.exists()) {
            const data = houseDoc.data();
            setHouseName(data.nome || data.name || 'Caule');
          } else {
            setHouseName('Caule');
          }
        } catch {
          setHouseName('Caule');
        }
      };
      fetchHouseName();
    } else if (!houseId) {
      setHouseName('Caule');
    }

    // Verificar se usuário está em viagem
    if (isOpen && user?.uid) {
      usuarioViajandoAgora(user.uid).then(setIsTraveling);
    }
  }, [isOpen, user?.houseId, user?.uid]);

  function handleNavigate(path: string) {
    navigate(path);
    onClose();
  }

  return (
    <>
      {/* Overlay escuro */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 h-full w-72 bg-surface z-50 shadow-2xl transform transition-transform duration-300 ease-in-out border-r border-outline-variant flex flex-col overflow-hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header com logo + nome da casa */}
        <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant shrink-0">
          <div className="flex items-center justify-between">
            <div className="w-8 flex items-center justify-center">
              <img src="/assets/logo.png" alt="Caule" className="w-8 h-8 object-contain" />
            </div>
            <span className="font-bold text-emerald-500 text-xl tracking-tight truncate text-center flex-1 px-1">{houseName}</span>
            <div className="w-8 flex items-center justify-center">
              <button
                onClick={onClose}
                className="p-1 hover:bg-surface-container-high rounded-full transition-colors"
              >
                <span className="material-symbols-outlined text-on-surface-variant text-lg">close</span>
              </button>
            </div>
          </div>
        </div>

        {/* Itens de navegação - scrolláveis */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <nav className="p-2 space-y-1">
            {filteredItems.map(item => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left transition-all ${
                    isActive
                      ? `${item.activeBg} ${item.hoverBg} font-bold`
                      : item.hoverBg
                  }`}
                >
                  {item.label === 'Caule' ? (
                    <img src="/assets/logo.png" alt="Caule" className="w-6 h-6 object-contain" />
                  ) : (
                    <span className={`material-symbols-outlined text-2xl ${item.color}`}>
                      {item.icon}
                    </span>
                  )}
                  <span className="flex items-baseline gap-1.5">
                    <span className={`text-lg ${item.color}`}>{item.label}</span>
                    <span className="text-sm text-white/80 font-bold">{item.realLabel}</span>
                  </span>
                  {isActive && (
                    <span className={`material-symbols-outlined ${item.color} text-lg ml-auto`}>chevron_right</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer - Perfil + Sair (fixo no fundo, sempre visível) */}
        <div className="px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] border-t border-outline-variant bg-surface space-y-2 shrink-0">
          {/* Perfil do usuário - clique para editar */}
          <button
            onClick={() => handleNavigate('/perfil')}
            className="flex items-center gap-3 w-full text-left hover:bg-surface-container-high rounded-xl p-2 transition-colors group"
          >
            <UserAvatar
              photoURL={user?.photoURL}
              name={user?.name || 'Morador'}
              isPresent={user?.isPresent}
              isTraveling={isTraveling}
              size={40}
              className="flex-shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-on-surface text-sm truncate">{user?.name || 'Morador'}</p>
              <p className="text-caption text-on-surface-variant truncate">{user?.email}</p>
              {isTraveling ? (
                <span className="inline-block mt-0.5 px-2 py-0.5 bg-red-500/10 text-red-500 text-[10px] font-bold rounded-full uppercase flex items-center gap-1">
                  <span className="material-symbols-outlined text-[8px]">flight</span>Em viagem
                </span>
              ) : (
                <span className="inline-block mt-0.5 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full uppercase">
                  {user?.role || 'morador'}
                </span>
              )}
            </div>
            <span className="material-symbols-outlined text-on-surface-variant text-lg">
              edit
            </span>
          </button>

          <div className="border-t border-outline-variant/50" />

          {/* Sair */}
          <button
            onClick={async () => {
              onClose();
              try {
                await signOut(auth);
              } catch (err) {
                console.error('[Logout] Erro ao fazer signOut:', err);
              }
              // O AuthListener detecta o signOut e redireciona para /login via ProtectedRoute
            }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left text-error hover:bg-error/10 transition-all"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
            <span className="text-sm font-bold">Sair da Conta</span>
          </button>
        </div>
      </div>
    </>
  );
}
