import { useState, useRef, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useHouseStore } from '../stores/houseStore';
import { useAuthStore } from '../stores/authStore';
import { auth, db, storage } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { formatPhone, formatCpf, isValidPhone, isValidCpf } from '../utils/formatters';
import { usuarioViajandoAgora } from '../utils/viagens';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';
import { UserAvatar } from '@/components/UserAvatar';

interface MenuItem {
  id: string;
  poetic: string;
  real: string;
  path: string;
  icon: React.FC<{ className?: string }>;
}

const menuItems: MenuItem[] = [
  { id: 'copo',     poetic: 'Copa',      real: 'Visão Geral',   path: '/app',           icon: CopaArvoreIcon },
  { id: 'folhas',   poetic: 'Folhas',    real: 'Tarefas',       path: '/tarefas',       icon: FolhaIcon },
  { id: 'flores',   poetic: 'Flores',    real: 'Eventos',       path: '/eventos',       icon: FlorIcon },
  { id: 'frutos',   poetic: 'Frutos',    real: 'Conquistas',    path: '/conquistas',    icon: FrutoIcon },
  { id: 'sementes', poetic: 'Sementes',  real: 'Projetos',      path: '/projetos',      icon: SementeIcon },
  { id: 'ramos',    poetic: 'Ramos',     real: 'Moradores',     path: '/admin/users',   icon: RamosIcon },
  { id: 'ciclos',    poetic: 'Ciclos',     real: 'Calendário',    path: '/calendario',    icon: CiclosIcon },
  { id: 'raizes',   poetic: 'Raízes',    real: 'Comunicação',   path: '/comunicação',   icon: RaizIcon },
  { id: 'caule',    poetic: 'Caule',     real: 'Configurações', path: '/configurações', icon: CauleConfigIcon },
];

export function Sidebar({ className = '' }: { className?: string }) {
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const { casaAtual } = useHouseStore();
  const { user } = useAuthStore();

  // Drawer de perfil
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Campos de edição
  const [editName, setEditName] = useState(user?.name || '');         // nome de exibição
  const [editFullName, setEditFullName] = useState(user?.fullName || ''); // nome completo
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [editCpf, setEditCpf] = useState(user?.cpf || '');
  const [editPixKey, setEditPixKey] = useState(user?.pixKey || '');
  const [editBirthDate, setEditBirthDate] = useState(user?.birthDate || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userPhoto = user?.photoURL || '';
  const userName = user?.name || 'Usuário'; // nome de exibição no rodapé

  const [isTraveling, setIsTraveling] = useState(false);
  useEffect(() => {
    if (user?.uid) {
      console.log('[SIDEBAR] Verificando viagem para', user.uid);
      usuarioViajandoAgora(user.uid).then(traveling => {
        console.log('[SIDEBAR] isTraveling:', traveling);
        setIsTraveling(traveling);
      });
    }
  }, [user?.uid]);

  console.log('[SIDEBAR RENDER] isTraveling:', isTraveling, 'user?.uid:', user?.uid, 'user?.name:', user?.name);

  function openProfile() {
    setEditName(user?.name || '');               // nome de exibição
    setEditFullName(user?.fullName || '');       // nome completo
    setEditPhone(user?.phone || '');
    setEditCpf(user?.cpf || '');
    setEditPixKey(user?.pixKey || '');
    setEditBirthDate(user?.birthDate || '');
    setEditingProfile(false);
    setProfileOpen(true);
  }

  function closeProfile() {
    setProfileOpen(false);
    setTimeout(() => setEditingProfile(false), 300);
  }

  function triggerPhotoUpload() {
    fileInputRef.current?.click();
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user?.uid) return;
    if (!file.type.startsWith('image/')) {
      alert('Selecione uma imagem válida');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 4MB');
      return;
    }
    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'users', user.uid), {
        photoURL: downloadURL,
        updatedAt: new Date(),
      });
      // Atualiza localmente
      useAuthStore.setState(state => ({
        user: state.user ? { ...state.user, photoURL: downloadURL } : null
      }));
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert('Erro ao enviar foto');
    }
    setUploadingPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function saveProfile() {
    if (!user?.uid) return;
    if (editPhone.trim() && !isValidPhone(editPhone)) {
      alert('Celular inválido. Use o formato (11) 99999-9999');
      return;
    }
    if (editCpf.trim() && !isValidCpf(editCpf)) {
      alert('CPF inválido');
      return;
    }
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name: editName.trim(),
        fullName: editFullName.trim(),
        phone: editPhone.trim(),
        cpf: editCpf.trim(),
        pixKey: editPixKey.trim(),
        birthDate: editBirthDate || '',
        updatedAt: new Date(),
      });
      useAuthStore.setState(state => ({
        user: state.user ? {
          ...state.user,
          name: editName.trim(),
          fullName: editFullName.trim(),
          phone: editPhone.trim(),
          cpf: editCpf.trim(),
          pixKey: editPixKey.trim(),
          birthDate: editBirthDate || '',
        } : null
      }));
      setEditingProfile(false);
    } catch (error: any) {
      alert(`Erro ao salvar: ${error.message}`);
    }
    setSavingProfile(false);
  }

  async function handleLogout() {
    try {
      if (Capacitor.isNativePlatform()) {
        await FirebaseAuthentication.signOut();
      }
    } catch (e) {
      console.log('[Logout] Native signOut error:', e);
    }
    await auth.signOut();
    useAuthStore.getState().logout();
  }

  return (
    <>
      <aside
        className={`relative bg-gray-900 border-r border-gray-700 flex flex-col transition-all duration-300 z-40 ${
          expanded ? 'w-64' : 'w-20'
        } ${className}`}
      >
        {/* Logo / Topo — Botão toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-center h-20 border-b border-gray-700 shrink-0 cursor-pointer hover:bg-gray-800/50 transition-colors w-full"
        >
          {expanded ? (
            <div className="flex items-center gap-3">
              <img src="/assets/logo.png" alt="Caule" className="w-10 h-10" />
              <div className="flex flex-col items-start">
                <span className="text-emerald-400 font-bold text-xl tracking-wide leading-none">
                  Caule
                </span>
                <span className="text-gray-500 text-xs mt-0.5 tracking-widest uppercase">
                  {casaAtual ? casaAtual.nome : 'Selecione uma casa'}
                </span>
              </div>
            </div>
          ) : (
            <img src="/assets/logo.png" alt="Caule" className="w-10 h-10" />
          )}
        </button>

        {/* Menu */}
        <nav className="flex-1 py-3 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Link
                key={item.id}
                to={item.path}
                className={`group relative flex items-center rounded-xl transition-all duration-200 ${
                  expanded ? 'mx-1 px-2 py-3 gap-3' : 'px-0 py-3'
                } ${
                  isActive
                    ? 'bg-emerald-600/20 text-emerald-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                } ${!expanded ? 'justify-center' : ''}`}
                title={!expanded ? `${item.poetic} — ${item.real}` : undefined}
              >
                {item.id === 'caule' ? (
                  <div className="h-14 w-14 shrink-0 flex items-center justify-center">
                    <Icon className={`h-full w-full object-contain transition-all duration-200 ${isActive ? 'opacity-100' : 'opacity-40 grayscale'}`} />
                  </div>
                ) : (
                  <Icon className={`h-14 w-14 shrink-0 transition-all duration-200 ${isActive ? 'opacity-100' : 'opacity-40 grayscale'}`} />
                )}

                <span
                  className={`flex flex-col leading-tight transition-all duration-300 ${
                    expanded
                      ? 'opacity-100 translate-x-0'
                      : 'opacity-0 -translate-x-2 w-0 overflow-hidden'
                  }`}
                >
                  <span className="text-lg font-bold whitespace-nowrap">{item.poetic}</span>
                  <span className="text-sm text-gray-400 whitespace-nowrap -mt-0.5 font-medium">{item.real}</span>
                </span>

                {!expanded && (
                  <span className="absolute left-full ml-3 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl border border-gray-700">
                    <span className="font-medium">{item.poetic}</span>
                    <span className="text-gray-400"> — {item.real}</span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Rodapé — Perfil do usuário */}
        <div className="p-3 border-t border-gray-700 shrink-0">
          <button
            onClick={openProfile}
            className={`w-full flex items-center gap-3 transition-all duration-300 hover:bg-gray-800 rounded-lg p-2 ${
              expanded ? '' : 'justify-center'
            }`}
            title={!expanded ? 'Meu Perfil' : undefined}
          >
            {/* Avatar */}
            <UserAvatar
              photoURL={userPhoto}
              name={userName}
              isPresent={user?.isPresent}
              isTraveling={isTraveling}
              size={32}
              className="shrink-0"
            />

            <div
              className={`overflow-hidden transition-all duration-300 text-left ${
                expanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
              }`}
            >
              <div className="text-sm text-white font-medium truncate max-w-[140px]">{userName}</div>
              <div className="text-xs text-gray-500 truncate max-w-[140px]">
                {casaAtual ? casaAtual.nome : 'Nenhuma casa selecionada'}
              </div>
            </div>
          </button>
        </div>
      </aside>

      {/* ===== DRAWER DE PERFIL ===== */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-300 ${
          profileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeProfile} />

        {/* Painel */}
        <div
          className={`absolute right-0 top-0 h-full w-full max-w-md bg-gray-900 border-l border-gray-700 shadow-2xl transform transition-transform duration-300 ${
            profileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <h2 className="text-lg font-bold">
                {editingProfile ? 'Editar Perfil' : 'Meu Perfil'}
              </h2>
              <button
                onClick={closeProfile}
                className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Conteúdo scrollável */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Foto */}
              <div className="flex flex-col items-center mb-8">
                <div className="relative">
                  <UserAvatar
                    photoURL={userPhoto}
                    name={userName}
                    isPresent={user?.isPresent}
                    isTraveling={isTraveling}
                    size={112}
                    className="border-4 border-gray-700"
                    imgClassName="border-4 border-gray-700"
                    fallbackClassName="border-4 border-gray-700"
                  />
                  {/* Ícone de lápis no canto inferior direito */}
                  <button
                    onClick={triggerPhotoUpload}
                    className="absolute -bottom-1 -right-1 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg border-2 border-gray-900 hover:bg-emerald-400 transition-colors z-10"
                    title="Editar foto"
                  >
                    <span className="material-symbols-outlined text-white text-lg">edit</span>
                  </button>
                  {/* Overlay de upload */}
                  {uploadingPhoto && (
                    <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                      <div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" />
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>

              {/* Campos */}
              <div className="space-y-5">
                {/* Nome de Exibição */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Nome de Exibição (Apelido)</label>
                  {editingProfile ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Como prefere ser chamado"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <div>
                      <p className="text-white text-lg font-medium">{userName}</p>
                      {isTraveling && <p className="text-[10px] text-red-400 font-bold mt-1 flex items-center gap-1"><span className="material-symbols-outlined text-[10px]">flight</span>Em viagem</p>}
                    </div>
                  )}
                </div>

                {/* Nome Completo */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Nome Completo</label>
                  {editingProfile ? (
                    <input
                      type="text"
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                      placeholder="Nome completo legal"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <p className="text-gray-300">{user?.fullName || <span className="text-gray-500 italic">Não informado</span>}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Email</label>
                  <p className="text-gray-300">{user?.email || '—'}</p>
                </div>

                {/* Celular */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Celular</label>
                  {editingProfile ? (
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                      placeholder="(11) 99999-9999"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <p className="text-gray-300">{user?.phone ? formatPhone(user.phone) : <span className="text-gray-500 italic">Não informado</span>}</p>
                  )}
                </div>

                {/* CPF */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">CPF</label>
                  {editingProfile ? (
                    <input
                      type="text"
                      value={editCpf}
                      onChange={(e) => setEditCpf(formatCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <p className="text-gray-300">{formatCpf(user?.cpf || '') || <span className="text-gray-500 italic">Não informado</span>}</p>
                  )}
                </div>

                {/* Data de Nascimento */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Data de Nascimento</label>
                  {editingProfile ? (
                    <input
                      type="date"
                      value={editBirthDate}
                      onChange={(e) => setEditBirthDate(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <p className="text-gray-300">{user?.birthDate || <span className="text-gray-500 italic">Não informado</span>}</p>
                  )}
                </div>

                {/* Chave Pix */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Chave Pix</label>
                  {editingProfile ? (
                    <input
                      type="text"
                      value={editPixKey}
                      onChange={(e) => setEditPixKey(e.target.value)}
                      placeholder="CPF, email, telefone ou chave aleatória"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <p className="text-gray-300 font-mono">{user?.pixKey || <span className="text-gray-500 italic">Não informado</span>}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="p-6 border-t border-gray-700 space-y-3">
              {editingProfile ? (
                <>
                  <button
                    onClick={saveProfile}
                    disabled={savingProfile}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {savingProfile ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        Salvando...
                      </>
                    ) : (
                      'Salvar Alteráções'
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setEditingProfile(false);
                      setEditName(user?.name || '');
                      setEditFullName(user?.fullName || '');
                      setEditPhone(user?.phone || '');
                      setEditCpf(user?.cpf || '');
                      setEditPixKey(user?.pixKey || '');
                      setEditBirthDate(user?.birthDate || '');
                    }}
                    className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-gray-300"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditingProfile(true)}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Editar Perfil
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sair
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ===== Ícones SVG ===== */

function RaizIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 4 L12 16" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M12 14 Q6 16 4 20 Q9 17 12 14" fill="#059669"/>
      <path d="M12 14 Q18 16 20 20 Q15 17 12 14" fill="#047857"/>
      <path d="M12 10 Q8 12 7 16" stroke="#10b981" strokeWidth="1.5" fill="none"/>
    </svg>
  );
}

function CopaArvoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Copa frondosa - camadas de folhas */}
      {/* Camada inferior (mais escura) */}
      <path d="M4 14 Q6 10 8 12 Q10 9 12 11 Q14 9 16 12 Q18 10 20 14 Q16 12 12 14 Q8 12 4 14" fill="#047857"/>
      {/* Camada do meio */}
      <path d="M5 10 Q7 7 9 9 Q11 6 12 8 Q13 6 15 9 Q17 7 19 10 Q15 8 12 10 Q9 8 5 10" fill="#059669"/>
      {/* Camada superior (mais clara) */}
      <path d="M7 7 Q9 4 12 6 Q15 4 17 7 Q14 5 12 7 Q10 5 7 7" fill="#10b981"/>
      {/* Topo/coroa */}
      <path d="M10 4 Q12 2 14 4 Q12 3 10 4" fill="#34d399"/>
      {/* Caule */}
      <path d="M12 15 L12 22" stroke="#047857" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Florzinha Ave do Paraiso escondida na copa */}
      <path d="M12 8 Q10 6 11 4 Q12 6 12 8" fill="#f59e0b"/>
      <path d="M12 8 Q14 6 13 4 Q12 6 12 8" fill="#3b82f6"/>
      <circle cx="12" cy="6.5" r="1" fill="#fbbf24"/>
    </svg>
  );
}

function FolhaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 20 Q12 12 6 8 Q12 10 12 20" fill="#10b981"/>
      <path d="M12 20 Q12 12 18 8 Q12 10 12 20" fill="#059669"/>
      <path d="M12 20 L12 10" stroke="#047857" strokeWidth="1.5"/>
    </svg>
  );
}

function FlorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Caule */}
      <path d="M12 22 L12 12" stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
      {/* Folhas */}
      <path d="M12 16 Q8 14 6 12 Q10 13 12 16" fill="#059669"/>
      <path d="M12 14 Q16 12 18 10 Q14 11 12 14" fill="#047857"/>
      {/* 5 petalas ao redor do centro */}
      <path d="M12 8 Q10 4 12 2 Q14 4 12 8" fill="#f59e0b"/>
      <path d="M12 8 Q8 6 6 8 Q8 10 12 8" fill="#f97316"/>
      <path d="M12 8 Q16 6 18 8 Q16 10 12 8" fill="#f59e0b"/>
      <path d="M12 8 Q9 11 10 13 Q12 11 12 8" fill="#fb923c"/>
      <path d="M12 8 Q15 11 14 13 Q12 11 12 8" fill="#f97316"/>
      {/* Centro */}
      <circle cx="12" cy="8" r="2" fill="#fbbf24"/>
      <circle cx="12" cy="8" r="1" fill="#fef3c7"/>
    </svg>
  );
}

function FrutoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 20 Q12 14 10 10" stroke="#10b981" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M10 10 Q7 7 6 5 Q9 7 10 10" fill="#10b981"/>
      <ellipse cx="14" cy="9" rx="4" ry="6" fill="#65a30d" transform="rotate(20 14 9)"/>
      <ellipse cx="14" cy="9" rx="2.5" ry="4" fill="#84cc16" transform="rotate(20 14 9)"/>
      <circle cx="17" cy="16" r="2.5" fill="#dc2626"/>
      <circle cx="16.5" cy="15.5" r="1" fill="#ef4444"/>
      <circle cx="8" cy="14" r="2" fill="#b91c1c"/>
      <circle cx="7.7" cy="13.7" r="0.8" fill="#dc2626"/>
    </svg>
  );
}

function SementeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="14" rx="5" ry="7" fill="#92400e"/>
      <path d="M12 7 L12 21" stroke="#10b981" strokeWidth="2"/>
      <path d="M10 4 Q12 7 14 4" stroke="#10b981" strokeWidth="1.5" fill="none"/>
      <ellipse cx="12" cy="14" rx="3" ry="4.5" fill="#b45309"/>
    </svg>
  );
}

function RamosIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 21 L12 10" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M12 16 Q7 13 6 9 Q10 12 12 16" fill="#10b981"/>
      <path d="M12 14 Q17 11 18 7 Q14 10 12 14" fill="#059669"/>
      <path d="M12 12 Q8 8 7 5" stroke="#10b981" strokeWidth="1.5" fill="none"/>
    </svg>
  );
}

function CiclosIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 3 A9 9 0 1 1 11.99 3" stroke="#10b981" strokeWidth="2" fill="none"/>
      <path d="M12 6 A6 6 0 1 1 11.99 6" stroke="#059669" strokeWidth="1.5" fill="none" strokeDasharray="3 2"/>
      <path d="M12 9 A3 3 0 1 1 11.99 9" stroke="#f59e0b" strokeWidth="1.5" fill="none"/>
    </svg>
  );
}

function CauleConfigIcon({ className }: { className?: string }) {
  return (
    <img src="/assets/logo_casa_3.png" alt="Caule" className={className} />
  );
}