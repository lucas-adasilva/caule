import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { TopAppBar } from '@/components/TopAppBar';

interface Casa {
  id: string;
  nome: string;
  endereco: string;
  cidade: string;
  estado: string;
}

export function VincularCasaPage() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [casas, setCasas] = useState<Casa[]>([]);
  const [loading, setLoading] = useState(true);
  const [vinculando, setVinculando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  useEffect(() => {
    if (!user?.uid) { navigate('/login'); return; }
    if (user.houseId) { navigate('/app'); return; }
    carregarCasas();
  }, [user?.uid, user?.houseId]);

  async function carregarCasas() {
    try {
      // Busca todas as casas (sem filtro - evita indice composto)
      const snap = await getDocs(collection(db, 'casas'));
      const lista: Casa[] = [];
      snap.forEach(d => {
        const data = d.data() as any;
        // Filtra ativas no cliente
        if (data.isActive !== false) {
          lista.push({ id: d.id, nome: data.nome, endereco: data.endereco, cidade: data.cidade, estado: data.estado });
        }
      });
      setCasas(lista);
    } catch (e: any) { setErro('Erro ao carregar casas: ' + e.message); }
    setLoading(false);
  }

  async function vincularCasa(casa: Casa) {
    if (!user?.uid) return;
    setVinculando(true);
    setErro('');
    setSucesso('');
    try {
      await updateDoc(doc(db, 'users', user.uid), { houseId: casa.id });
      // Atualiza localmente
      setUser({ ...user, houseId: casa.id });
      setSucesso(`Você foi vinculado a ${casa.nome}!`);
      setTimeout(() => navigate('/app'), 1500);
    } catch (e: any) { setErro('Erro ao vincular: ' + e.message); }
    setVinculando(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface">
        <TopAppBar title="Escolher Casa" showAvatar={false} showMenu={false} showNotifications={false} />
        <div className="flex justify-center py-20"><span className="material-symbols-outlined animate-spin text-primary text-3xl">refresh</span></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-text-body font-body-md">
      <TopAppBar title="Escolher Casa" showAvatar={false} showMenu={false} showNotifications={false} />

      <main className="px-margin-page mt-stack-md space-y-6 pb-10">
        {/* Header */}
        <div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Bem-vindo, {user?.name || 'Morador'}!</h2>
          <p className="text-text-muted font-body-md mt-1">Voce ainda nao esta vinculado a uma casa. Escolha uma abaixo:</p>
        </div>

        {/* Mensagens */}
        {erro && <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm flex items-center gap-2"><span className="material-symbols-outlined text-sm">error</span>{erro}</div>}
        {sucesso && <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-primary text-sm flex items-center gap-2"><span className="material-symbols-outlined text-sm">check_circle</span>{sucesso}</div>}

        {/* Lista de Casas */}
        {casas.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">home</span>
            <p className="text-text-muted">Nenhuma casa disponivel no momento</p>
            <p className="text-caption text-on-surface-variant mt-1">Entre em contato com o admin</p>
          </div>
        ) : (
          <div className="space-y-3">
            {casas.map(casa => (
              <div key={casa.id} className="bg-surface-card rounded-xl border border-outline-variant p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-on-primary text-2xl">home</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-on-surface">{casa.nome}</h3>
                    <p className="text-caption text-on-surface-variant">{casa.endereco}, {casa.cidade} - {casa.estado}</p>
                  </div>
                </div>
                <button
                  onClick={() => vincularCasa(casa)}
                  disabled={vinculando}
                  className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {vinculando ? 'Vinculando...' : `Entrar em ${casa.nome}`}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Dica */}
        <div className="bg-surface-container-low rounded-xl p-4 space-y-2">
          <h4 className="font-bold text-sm text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-primary">lightbulb</span>Por que preciso escolher uma casa?</h4>
          <p className="text-sm text-on-surface-variant">No Caule, tarefas, moradores e eventos sao organizados por casa. Ao escolher uma casa, voce passa a fazer parte dessa comunidade e recebe as tarefas atribuidas a voce.</p>
        </div>
      </main>
    </div>
  );
}
