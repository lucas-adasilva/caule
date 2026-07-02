import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { TopAppBar } from '@/components/TopAppBar';

interface CasaEncontrada {
  id: string;
  nome: string;
  endereco: string;
  cidade: string;
  estado: string;
}

export function ConvitePage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState('');
  const [casa, setCasa] = useState<CasaEncontrada | null>(null);
  const [loading, setLoading] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Visitante
  const [emailVisitante, setEmailVisitante] = useState('');
  const [modoVisitante, setModoVisitante] = useState(false);
  const [nomeVisitante, setNomeVisitante] = useState('');

  // Buscar casa (apenas logado)
  async function buscarCasa() {
    if (!codigo.trim()) { setErro('Digite o codigo da casa'); return; }
    if (!user?.uid) { setErro('Faca login para buscar casas no banco de dados'); return; }
    setErro(''); setSucesso(''); setCasa(null); setBuscando(true);
    try {
      const docRef = doc(db, 'casas', codigo.trim());
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCasa({ id: docSnap.id, nome: data.nome, endereco: data.endereco, cidade: data.cidade, estado: data.estado });
        setBuscando(false); return;
      }
      const q = query(collection(db, 'casas'), where('nome', '>=', codigo.trim()), where('nome', '<=', codigo.trim() + '\uf8ff'));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data();
        setCasa({ id: d.id, nome: data.nome, endereco: data.endereco, cidade: data.cidade, estado: data.estado });
      } else { setErro('Nenhuma casa encontrada'); }
    } catch (e: any) { setErro('Erro: ' + e.message); }
    setBuscando(false);
  }

  // Solicitar convite logado
  async function solicitarConvite() {
    if (!casa || !user?.uid) return;
    setLoading(true); setErro(''); setSucesso('');
    try {
      const q = query(collection(db, 'convites'), where('solicitanteId', '==', user.uid), where('casaId', '==', casa.id), where('status', '==', 'pendente'));
      const snap = await getDocs(q);
      if (!snap.empty) { setErro('Voce ja tem um convite pendente para esta casa'); setLoading(false); return; }
      await addDoc(collection(db, 'convites'), {
        casaId: casa.id, casaNome: casa.nome,
        solicitanteId: user.uid, solicitanteNome: user.name || user.email || 'Usuário',
        solicitanteEmail: user.email, status: 'pendente',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setSucesso(`Convite solicitado para ${casa.nome}! Aguarde aprovacao.`);
      setCasa(null); setCodigo('');
    } catch (e: any) { setErro('Erro: ' + e.message); }
    setLoading(false);
  }

  // Solicitar convite visitante (salva sem buscar no Firestore)
  async function enviarSolicitacaoVisitante() {
    if (!emailVisitante.trim() || !nomeVisitante.trim() || !codigo.trim()) { setErro('Preencha todos os campos'); return; }
    setLoading(true); setErro(''); setSucesso('');
    try {
      await addDoc(collection(db, 'convites'), {
        casaId: codigo.trim(), casaNome: codigo.trim(),
        solicitanteId: null, solicitanteNome: nomeVisitante.trim(),
        solicitanteEmail: emailVisitante.trim(), status: 'pendente',
        modo: 'visitante', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setSucesso('Solicitação enviada! Entraremos em contato pelo email.');
      setCodigo(''); setEmailVisitante(''); setNomeVisitante('');
    } catch (e: any) { setErro('Erro: ' + e.message); }
    setLoading(false);
  }

  // Render
  return (
    <div className="min-h-screen bg-surface text-text-body font-body-md">
      <TopAppBar title="Solicitar Convite" showAvatar={false} showMenu={false} showNotifications={false} />

      <main className="px-margin-page mt-stack-md space-y-6 pb-10">
        {/* NAO LOGADO */}
        {!user?.uid && !modoVisitante && (
          <div className="bg-surface-card rounded-xl border border-outline-variant p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-primary text-3xl">login</span>
            </div>
            <h3 className="font-bold text-on-surface text-lg">Bem-vindo ao Caule</h3>
            <p className="text-sm text-on-surface-variant">Para solicitar convite, faca login ou continue como visitante.</p>
            <div className="space-y-2">
              <button onClick={() => navigate('/login')} className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all">Fazer Login</button>
              <button onClick={() => setModoVisitante(true)} className="w-full bg-surface-container text-on-surface border border-outline-variant font-bold py-3 rounded-xl hover:bg-surface-container-high transition-all">Continuar como Visitante</button>
            </div>
          </div>
        )}

        {/* LOGADO */}
        {user?.uid && (
          <>
            <div>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Ingressar em uma Casa</h2>
              <p className="text-text-muted font-body-md mt-1">Olá {user.name || user.email}! Digite o código da casa.</p>
            </div>
            <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-4">
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-2 font-bold">Codigo ou Nome da Casa</label>
                <div className="flex gap-2">
                  <input value={codigo} onChange={e => { setCodigo(e.target.value); setCasa(null); setErro(''); }}
                    onKeyDown={e => e.key === 'Enter' && buscarCasa()} placeholder="Ex: Casa das Oliveiras"
                    className="flex-1 bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
                  <button onClick={buscarCasa} disabled={buscando || !codigo.trim()}
                    className="px-4 bg-primary text-on-primary font-bold rounded-xl hover:brightness-110 transition-all disabled:opacity-50">
                    {buscando ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">search</span>}
                  </button>
                </div>
              </div>
              {erro && <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm flex items-center gap-2"><span className="material-symbols-outlined text-sm">error</span>{erro}</div>}
              {sucesso && <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-primary text-sm flex items-center gap-2"><span className="material-symbols-outlined text-sm">check_circle</span>{sucesso}</div>}
            </div>
            {casa && (
              <div className="bg-primary/5 border-2 border-primary/30 rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center flex-shrink-0"><span className="material-symbols-outlined text-on-primary text-2xl">home</span></div>
                  <div><h3 className="font-bold text-on-surface">{casa.nome}</h3><p className="text-caption text-on-surface-variant">{casa.endereco}, {casa.cidade} - {casa.estado}</p></div>
                </div>
                <button onClick={solicitarConvite} disabled={loading} className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all disabled:opacity-50 shadow-sm">{loading ? 'Enviando...' : `Solicitar Convite para ${casa.nome}`}</button>
              </div>
            )}
          </>
        )}

        {/* VISITANTE */}
        {modoVisitante && (
          <>
            <div>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Solicitar Convite</h2>
              <p className="text-text-muted font-body-md mt-1">Preencha seus dados e o codigo da casa desejada.</p>
            </div>
            <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-4">
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-2 font-bold">Seu Nome</label>
                <input value={nomeVisitante} onChange={e => setNomeVisitante(e.target.value)} placeholder="Seu nome completo"
                  className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
              </div>
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-2 font-bold">Seu E-mail</label>
                <input value={emailVisitante} onChange={e => setEmailVisitante(e.target.value)} placeholder="seu@email.com" type="email"
                  className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
              </div>
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-2 font-bold">Codigo ou Nome da Casa</label>
                <input value={codigo} onChange={e => { setCodigo(e.target.value); setErro(''); }} placeholder="Ex: Casa das Oliveiras"
                  className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
              </div>
              {erro && <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm flex items-center gap-2"><span className="material-symbols-outlined text-sm">error</span>{erro}</div>}
              {sucesso && <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-primary text-sm flex items-center gap-2"><span className="material-symbols-outlined text-sm">check_circle</span>{sucesso}</div>}
              <button onClick={enviarSolicitacaoVisitante} disabled={loading || !emailVisitante.trim() || !nomeVisitante.trim() || !codigo.trim()}
                className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all disabled:opacity-50 shadow-sm">
                {loading ? 'Enviando...' : 'Enviar Solicitacao'}
              </button>
            </div>
          </>
        )}

        {/* Dicas */}
        <div className="bg-surface-container-low rounded-xl p-4 space-y-2">
          <h4 className="font-bold text-sm text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-primary">lightbulb</span>Como funciona</h4>
          <ol className="text-sm text-on-surface-variant space-y-1 list-decimal list-inside">
            <li>Digite o codigo ou nome da casa</li>
            <li>Clique em buscar para encontrar a casa</li>
            <li>Solicite o convite</li>
            <li>O admin da casa recebera sua solicitacao</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
