import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setDoc, doc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';

interface CasaEncontrada {
  id: string;
  nome: string;
  endereco: string;
  cidade: string;
  estado: string;
  foto?: string;
}

export function CompletarPerfilPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [step, setStep] = useState<'dados' | 'boasvindas'>('dados');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [casaEncontrada, setCasaEncontrada] = useState<CasaEncontrada | null>(null);
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    phone: '',
    cpf: '',
    pixKey: '',
    birthDate: '',
    senhaCasa: '',
  });

  async function handleVerificarSenha(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim()) { setError('Nome completo é obrigatório'); return; }
    if (!form.phone.trim()) { setError('Telefone é obrigatório'); return; }
    if (!form.cpf.trim()) { setError('CPF é obrigatório'); return; }
    if (!form.senhaCasa.trim()) { setError('A senha da casa é obrigatória'); return; }

    setLoading(true);
    try {
      // Busca todas as casas e verifica a senha no cliente
      const snap = await getDocs(collection(db, 'casas'));
      let casa: CasaEncontrada | null = null;
      snap.forEach(d => {
        const data = d.data() as any;
        if (data.senhaCadastro === form.senhaCasa.trim()) {
          casa = {
            id: d.id,
            nome: data.nome || 'Casa',
            endereco: data.endereco || '',
            cidade: data.cidade || '',
            estado: data.estado || '',
            foto: data.foto || '',
          };
        }
      });

      if (!casa) {
        setError('Senha da casa incorreta. Peça a senha para algum morador da casa ❤️');
        setLoading(false);
        return;
      }

      setCasaEncontrada(casa);
      setStep('boasvindas');
    } catch (err: any) {
      console.error('[CompletarPerfil] Erro ao verificar senha:', err);
      setError(err.message || 'Erro ao verificar senha');
    } finally {
      setLoading(false);
    }
  }

  async function handleFazerParte() {
    if (!casaEncontrada) return;
    setLoading(true);
    setError('');

    const currentUser = auth.currentUser;
    if (!currentUser) { setError('Usuário não autenticado'); setLoading(false); return; }

    try {
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
        houseId: casaEncontrada.id,
        role: 'hospede' as const,
        isActive: true,
        isPresent: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', currentUser.uid), userData);
      console.log('[CompletarPerfil] Perfil salvo:', currentUser.uid, 'casa:', casaEncontrada.nome);

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

      navigate('/app', { replace: true });
    } catch (err: any) {
      console.error('[CompletarPerfil] Erro ao salvar:', err);
      setError(err.message || 'Erro ao salvar perfil');
    } finally {
      setLoading(false);
    }
  }

  // ============ TELA 1: FORMULÁRIO DE DADOS ============
  if (step === 'dados') {
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

          <form onSubmit={handleVerificarSenha} className="space-y-4">
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

            <div>
              <label className="block text-label-sm text-on-surface-variant mb-1">Senha da casa *</label>
              <input
                type="text"
                value={form.senhaCasa}
                onChange={(e) => setForm({ ...form, senhaCasa: e.target.value })}
                placeholder="Digite a senha fornecida pelo admin"
                className="w-full px-3 py-2.5 rounded-lg bg-surface text-on-surface border border-outline-variant focus:border-primary focus:outline-none"
                required
              />
              <p className="text-[10px] text-on-surface-variant mt-1">
                Peça a senha para algum morador da casa ❤️
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
              disabled={loading}
              className="w-full py-3 rounded-lg bg-primary text-on-primary font-bold text-body-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Verificando...' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============ TELA 2: BOAS-VINDAS ============
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface-variant rounded-2xl overflow-hidden shadow-xl border border-outline-variant">
        {/* Foto da casa ou placeholder */}
        <div className="w-full h-48 bg-surface-container-high flex items-center justify-center relative">
          {casaEncontrada?.foto ? (
            <img
              src={casaEncontrada.foto}
              alt={casaEncontrada.nome}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center">
              <span className="material-symbols-outlined text-6xl text-primary">home</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <h2 className="text-white font-bold text-xl">{casaEncontrada?.nome}</h2>
            <p className="text-white/80 text-sm">
              {casaEncontrada?.endereco}{casaEncontrada?.cidade ? `, ${casaEncontrada.cidade}` : ''}
            </p>
          </div>
        </div>

        <div className="p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
            <span className="text-3xl">🎉</span>
          </div>

          <h3 className="text-headline-sm font-bold text-on-surface">
            Bem-vindo à {casaEncontrada?.nome}!
          </h3>

          <p className="text-body-sm text-on-surface-variant">
            Você está prestes a fazer parte desta comunidade. Aqui você poderá organizar tarefas,
            acompanhar eventos e interagir com os outros moradores.
          </p>

          {error && (
            <div className="bg-error/10 border border-error rounded-lg p-3 text-error text-body-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleFazerParte}
            disabled={loading}
            className="w-full py-3 rounded-lg bg-primary text-on-primary font-bold text-body-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Entrando...' : 'Fazer parte desta comunidade'}
          </button>

          <button
            onClick={() => { setStep('dados'); setError(''); }}
            disabled={loading}
            className="text-sm text-on-surface-variant hover:text-on-surface underline"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
