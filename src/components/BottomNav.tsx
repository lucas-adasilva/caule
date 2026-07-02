import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

interface NavItem {
  icon: string;
  iconFilled: string;
  labelPoetic: string;
  path: string;
  color: string;
  showFor: ('admin' | 'morador' | 'hospede')[];
}

// Menu inferior - visibilidade por role (mesma ordem e seções do MenuDrawer)
const navItems: NavItem[] = [
  { icon: 'forest', iconFilled: 'forest', labelPoetic: 'Copa', path: '/app', color: 'text-[#2ECC71]', showFor: ['admin', 'morador'] },
  { icon: 'eco', iconFilled: 'eco', labelPoetic: 'Folhas', path: '/tarefas', color: 'text-[#90EE90]', showFor: ['admin', 'morador', 'hospede'] },
  { icon: 'local_florist', iconFilled: 'local_florist', labelPoetic: 'Flores', path: '/eventos', color: 'text-[#FFB6C1]', showFor: ['admin', 'morador', 'hospede'] },
  { icon: 'account_tree', iconFilled: 'account_tree', labelPoetic: 'Ramos', path: '/admin/users', color: 'text-[#A5B4FC]', showFor: ['admin', 'morador'] },
  { icon: 'cycle', iconFilled: 'cycle', labelPoetic: 'Ciclos', path: '/calendario', color: 'text-[#D8BFD8]', showFor: ['admin', 'morador', 'hospede'] },
  { icon: 'device_hub', iconFilled: 'device_hub', labelPoetic: 'Raízes', path: '/comunicacao', color: 'text-[#8A2BE2]', showFor: ['admin', 'morador', 'hospede'] },
  { icon: 'yard', iconFilled: 'yard', labelPoetic: 'Caule', path: '/configuracoes', color: 'text-[#A9A9A9]', showFor: ['admin'] },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const role = user?.role || 'hospede';
  const filteredItems = navItems.filter(item => item.showFor.includes(role as any));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center px-0.5 pt-1 pb-3 pb-safe bg-surface-container rounded-t-xl shadow-lg border-t border-white/5 backdrop-blur-md">
      {filteredItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-lg transition-all duration-300 active:scale-90 flex-1 min-w-0 ${
              isActive
                ? 'bg-primary-container/20 text-primary scale-105'
                : 'text-on-surface-variant hover:text-primary-fixed-dim'
            }`}
          >
            {item.labelPoetic === 'Caule' ? (
              <img src="/assets/logo.png" alt="Caule" className="w-5 h-5 object-contain" />
            ) : (
              <span
                className={`material-symbols-outlined text-[20px] ${isActive ? item.color : ''}`}
                style={isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
              >
                {isActive ? item.iconFilled : item.icon}
              </span>
            )}
            <span className={`text-[10px] font-medium mt-0.5 leading-tight truncate w-full text-center ${isActive ? item.color : ''}`}>{item.labelPoetic}</span>
          </button>
        );
      })}
    </nav>
  );
}
