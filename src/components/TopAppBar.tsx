import { useAuthStore } from '@/stores/authStore';
import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { UserAvatar } from '@/components/UserAvatar';
import { usuarioViajandoAgora, buscarViagemAtiva, interromperViagem, redistribuirTarefasPorRetorno } from '@/utils/viagens';
import { redistribuirPorEntrada } from '@/utils/distribuicao';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TopAppBarProps {
  title?: string;
  subtitle?: string;
  onMenuClick?: () => void;
  onNotificationClick?: () => void;
  showAvatar?: boolean;
  showMenu?: boolean;
  showNotifications?: boolean;
  showBackButton?: boolean;
  onBackClick?: () => void;
}

export function TopAppBar({
  title,
  subtitle,
  onMenuClick,
  onNotificationClick,
  showAvatar = true,
  showMenu = true,
  showNotifications = true,
  showBackButton = false,
  onBackClick,
}: TopAppBarProps) {
  const { user, setIsPresent } = useAuthStore();
  const navigate = useNavigate();
  const [isTraveling, setIsTraveling] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const isPresent = user?.isPresent ?? true;

  useEffect(() => {
    if (user?.uid) {
      usuarioViajandoAgora(user.uid).then(setIsTraveling);
    }
  }, [user?.uid]);

  async function handleRetornarViagem() {
    if (!user?.uid || !user?.houseId) return;
    if (!confirm('Você está voltando para casa mais cedo?\n\nAs tarefas serão redistribuídas entre todos os moradores presentes.')) return;
    
    setIsProcessing(true);
    try {
      // Buscar viagem ativa
      const viagem = await buscarViagemAtiva(user.uid);
      if (viagem) {
        // Atualizar data de retorno para hoje
        await interromperViagem(viagem.id);
        
        // Redistribuir tarefas usando o novo sistema
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const jan4 = new Date(ano, 0, 4);
        const jan4Dia = jan4.getDay();
        const jan4Segunda = new Date(ano, 0, 4 - (jan4Dia === 0 ? 6 : jan4Dia - 1));
        const targetSegunda = new Date(hoje);
        const targetDia = targetSegunda.getDay();
        targetSegunda.setDate(targetSegunda.getDate() - (targetDia === 0 ? 6 : targetDia - 1));
        const diasDiff = Math.floor((targetSegunda.getTime() - jan4Segunda.getTime()) / (7 * 24 * 60 * 60 * 1000));
        const numSemana = diasDiff + 1;
        const weekId = `${ano}-W${String(numSemana).padStart(2, '0')}`;
        
        await redistribuirPorEntrada(user.uid, user.houseId, weekId, 'retorno_viagem');
        
        // Atualizar estado local
        setIsTraveling(false);
        alert('Viagem interrompida! Tarefas redistribuídas.');
      }
    } catch (e: any) {
      alert('Erro ao interromper viagem: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleLogout() {
    try {
      if (Capacitor.isNativePlatform()) {
        await FirebaseAuthentication.signOut();
      }
    } catch (e) {
      console.log('[TopAppBar] Native signOut error:', e);
    }
    await signOut(auth);
    useAuthStore.getState().logout();
  }

  return (
    <header className="sticky top-0 w-full z-30 flex justify-between items-center px-margin-page h-16 bg-surface/80 backdrop-blur-md pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center gap-3">
        {showBackButton && (
          <button
            onClick={onBackClick}
            className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-surface-variant"
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
            <span className="text-sm font-medium">Voltar</span>
          </button>
        )}
        {showMenu && (
          <button
            onClick={onMenuClick}
            className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-surface-variant transition-colors text-on-surface-variant"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
        )}
        {title ? (
          <div>
            {subtitle && (
              <p className="text-primary text-label-sm font-label-sm tracking-widest uppercase">{subtitle}</p>
            )}
            <h1 className="text-primary font-bold text-2xl tracking-tight">{title}</h1>
          </div>
        ) : (
          <span className="text-primary font-bold text-2xl tracking-tight">Caule</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {showNotifications && (
          <button
            onClick={onNotificationClick}
            className="text-primary hover:opacity-80 transition-opacity duration-200 active:scale-95"
          >
            <span className="material-symbols-outlined text-[28px]">notifications</span>
          </button>
        )}
        {showAvatar && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="relative">
                <button className="w-10 h-10 rounded-full border-2 border-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-transform active:scale-95 flex items-center justify-center">
                  <UserAvatar
                    photoURL={user?.photoURL}
                    name={user?.name}
                    isPresent={isPresent}
                    isTraveling={isTraveling}
                    size={40}
                    showPresence={false}
                    className="w-full h-full"
                    imgClassName="border-0"
                    fallbackClassName="border-0"
                  />
                </button>
                {/* Indicador de presença/viagem — fora do overflow-hidden */}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-surface flex items-center justify-center ${
                    isTraveling ? 'bg-red-500' : isPresent ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  title={isTraveling ? 'Em viagem' : isPresent ? 'Presente' : 'Ausente'}
                >
                  {isTraveling && (
                    <span className="material-symbols-outlined text-white" style={{ fontSize: 8 }}>flight</span>
                  )}
                </span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="min-w-[14rem] bg-surface border border-outline/30 shadow-lg rounded-xl p-1">
              <DropdownMenuLabel className="px-3 py-2 text-sm font-semibold text-on-surface">
                {user?.name || 'Minha conta'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-outline/30" />
              {isTraveling ? (
                <DropdownMenuItem disabled className="px-3 py-2 text-sm text-on-surface-variant rounded-lg opacity-60 cursor-not-allowed">
                  <span className="material-symbols-outlined text-base mr-2 text-red-500">flight</span>
                  <span>Em viagem — indisponível</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuCheckboxItem
                  checked={isPresent}
                  onCheckedChange={(checked) => setIsPresent(Boolean(checked))}
                  className="px-3 py-2 text-sm text-on-surface rounded-lg focus:bg-surface-variant focus:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base mr-2">
                    {isPresent ? 'check_circle' : 'schedule'}
                  </span>
                  <span>{isPresent ? 'Presente na casa' : 'Ausente da casa'}</span>
                </DropdownMenuCheckboxItem>
              )}
              <DropdownMenuSeparator className="bg-outline/30" />
              {isTraveling ? (
                <DropdownMenuItem
                  onClick={handleRetornarViagem}
                  disabled={isProcessing}
                  className="px-3 py-2 text-sm rounded-lg focus:bg-surface-variant focus:text-on-surface cursor-pointer text-red-500"
                >
                  <span className="material-symbols-outlined text-base mr-2">home</span>
                  <span>{isProcessing ? 'Processando...' : 'Retornar para casa'}</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => navigate('/perfil', { state: { openViagem: true } })}
                  className="px-3 py-2 text-sm rounded-lg focus:bg-surface-variant focus:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base mr-2">flight</span>
                  <span>Cadastrar Viagem</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="bg-outline/30" />
              <DropdownMenuItem
                onClick={handleLogout}
                variant="destructive"
                className="px-3 py-2 text-sm rounded-lg focus:bg-destructive/10 focus:text-destructive cursor-pointer"
              >
                <LogOut className="w-4 h-4 mr-2" />
                <span>Sair da Conta</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
