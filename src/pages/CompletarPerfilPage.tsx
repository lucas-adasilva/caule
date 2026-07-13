import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setDoc, doc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';

interface Casa {
  id: string;
  nome: string;
  endereco: string;
  cidade: string;
  estado: string;
}

export function CompletarPerfilPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [carregandoCasas, setCarregandoCasas] = useState(true);
  const [error, setError] = useState('');
  const [casas, setCasas] = useState<Casa[]>([]);
  const [form, setForm] = useState({
    fullName: user?.name || '',
    phone: '',
    cpf: '',
    pixKey: '',
    birthDate: '',
    houseId: '',
  });

  // Carrega as casas disponíveis ao montar o componente
  useEffect(() => {
    async function carregarCasas() {
      try {
        const snap = await getDocs(collection(db, 'casas'));
        const lista: Casa[] = [];
        snap.forEach(d => {
          const data = d.data() as any;
          if (data.isActive !== false) {
            lista.push({
              id: d.id,
              nome: data.nome || 'Casa sem nome',
              endereco: data.endereco || '',
              cidade: data.cidade || '',
              estado: data.estado || '',
            });
          }
        });
        setCasas(lista);
      } catch (e: any) {
        console.error('[CompletarPerfil] Erro ao carregar casas:', e);
      } finally {
        setCarregandoCasas(false);
      }
    }
    carregarCasas();
  }, []);

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim()) { setError('Nome completo é obrigatório'); return; }
    if (!form.phone.trim()) { setError('Telefone é obrigatório'); return; }
    if (!form.cpf.trim()) { setError('CPF é obrigatório'); return; }
    if (!form.houseId) { setError('Escolha uma casa para se associar'); return; }

    const currentUser = auth.currentUser;
    if (!currentUser) { setError('Usuário não autenticado'); return; }

    setLoading(true);
    try {
      const casaSelecionada = casas.find(c => c.id === form.houseId);
      const userData = {
        uid: currentUser.uid,
        email: currentUser.email || '',
        name: user?.name || currentUser.displayName || currentUser.email?.split('@')[0] || '',
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        cpf: form.cpf.trim(),
        pixKey: form.pixKey.trim(),
        birthDate: form.birthDate || '',
        photoURL: currentUser.photoURL || '',
        houseId: form.houseId,
        role: 'hospede' as const,
        isActive: true,
        isPresent: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', currentUser.uid), userData);
      console.log('[CompletarPerfil] Perfil salvo:', currentUser.uid, 'casa:', casaSelecionada?.nome);

      // Atualiza o store local
      const { setUser } = useAuthStore.getState();
      setUser({
        uid: userData.uid,
        email: userData.email,
        name: userData.name,
        fullName: userData.fullName,
        role: userData.role,
        isActive: true,
        isPresent: true,
        phone: userData.phone,
        cpf: userData.cpf,
        pixKey: userData.pixKey,
        photoURL: userData.photoURL,
        houseId: userData.houseId,
      });

      // Redireciona para o app (com casa já vinculada, o usuário terá acesso completo)
      navigate('/app', { replace: true });
    } catch (err: any) {
      console.error('[CompletarPerfil] Erro:', err);
      setError(err.message || 'Erro ao salvar perfil');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface-variant rounded-2xl p-6 shadow-xl border border-outline-variant">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 mx-auto mb-3 flex items-center justify-center overflow-hidden">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl">👤</span>
            )}
          </div>
          <h1 className="text-headline-sm font-bold text-on-surface">Bem-vindo!</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Complete seu perfil para continuar
          </p>
        </div>

        {error && (
          <div className="bg-error/10 border border-error rounded-lg p-3 mb-4 text-error text-body-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="block text-label-sm text-on-surface-variant mb-1">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-3 py-2.5 rounded-lg bg-surface text-on-surface border border-outline-variant opacity-60"
            />
          </div>

          <div>
            <label className="block text-label-sm text-on-surface-variant mb-1">Nome completo *</label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Digite seu nome completo"
              className="w-full px-3 py-2.5 rounded-lg bg-surface text-on-surface border border-outline-variant focus:border-primary focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-label-sm text-on-surface-variant mb-1">Telefone *</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(11) 99999-9999"
              className="w-full px-3 py-2.5 rounded-lg bg-surface text-on-surface border border-outline-variant focus:border-primary focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-label-sm text-on-surface-variant mb-1">CPF *</label>
            <input
              type="text"
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: e.target.value })}
              placeholder="000.000.000-00"
              className="w-full px-3 py-2.5 rounded-lg bg-surface text-on-surface border border-outline-variant focus:border-primary focus:outline-none"
              required
            />
          </div>

          {/* === SELEÇÃO DE CASA === */}
          <div>
            <label className="block text-label-sm text-on-surface-variant mb-1">
              Escolha sua casa *
            </label>
            {carregandoCasas ? (
              <div className="w-full px-3 py-2.5 rounded-lg bg-surface-container-high border border-outline-variant text-on-surface-variant text-sm flex items-center gap-2">
                <span className="material-symbols-outlined animate-spin text-primary text-lg">refresh</span>
                Carregando casas...
              </div>
            ) : casas.length === 0 ? (
              <div className="w-full px-3 py-2.5 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
                <span className="material-symbols-outlined text-sm mr-1">error</span>
                Nenhuma casa disponível. Entre em contato com o admin.
              </div>
            ) : (
              <select
                value={form.houseId}
                onChange={(e) => setForm({ ...form, houseId: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg bg-surface text-on-surface border border-outline-variant focus:border-primary focus:outline-none text-sm"
                required
              >
                <option value="">Selecione uma casa</option>
                {casas.map(casa => (
                  <option key={casa.id} value={casa.id}>
                    {casa.nome} — {casa.cidade}{casa.estado ? `, ${casa.estado}` : ''}
                  </option>
                ))}
              </select>
            )}
            <p className="text-[10px] text-on-surface-variant mt-1">
              As tarefas, moradores e eventos são organizados por casa.
            </p>
          </div>

          <div>
            <label className="block text-label-sm text-on-surface-variant mb-1">Chave PIX</label>
            <input
              type="text"
              value={form.pixKey}
              onChange={(e) => setForm({ ...form, pixKey: e.target.value })}
              placeholder="Email, CPF, telefone ou chave aleatória"
              className="w-full px-3 py-2.5 rounded-lg bg-surface text-on-surface border border-outline-variant focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-label-sm text-on-surface-variant mb-1">Data de nascimento</label>
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-surface text-on-surface border border-outline-variant focus:border-primary focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading || carregandoCasas || casas.length === 0}
            className="w-full py-3 rounded-lg bg-primary text-on-primary font-bold text-body-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Salvando...' : 'Continuar'}
          </button>
        </form>
      </div>
    </div>
  );
}
