import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { TopAppBar } from '@/components/TopAppBar';
import { redistribuirPorEntrada, redistribuirPorSaida } from '@/utils/distribuicao';
import { getSemanaDaData, sobrepoeSemanaAtual } from '@/utils/semana';
import type { FaixaContribuicao } from '@/utils/hospedagem';
import { salvarHospedagem, encerrarHospedagemAberta } from '@/utils/hospedagem';

interface Morador { uid: string; name: string; }
interface Comodo { id: string; nome: string; icone: string; }
interface Casa { contribuicaoMinima?: number; contribuicaoIdeal?: number; contribuicaoAbundante?: number; }

const FAIXA_LABEL: Record<FaixaContribuicao, string> = { minimo: 'Mínima', ideal: 'Ideal', abundante: 'Abundante' };

export function EstadiaPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [estadiaInicio, setEstadiaInicio] = useState('');
  const [estadiaFim, setEstadiaFim] = useState('');
  const [responsavelId, setResponsavelId] = useState('');
  const [dormitorio, setDormitorio] = useState('');
  const [faixaContribuicao, setFaixaContribuicao] = useState<FaixaContribuicao>('ideal');
  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [comodos, setComodos] = useState<Comodo[]>([]);
  const [casa, setCasa] = useState<Casa | null>(null);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.estadiaInicio) setEstadiaInicio(user.estadiaInicio);
    if (user?.estadiaFim) setEstadiaFim(user.estadiaFim);
  }, [user]);

  async function carregarDadosCasa() {
    if (!user?.houseId) return;
    try {
      const qUsers = query(collection(db, 'users'), where('houseId', '==', user.houseId));
      const sUsers = await getDocs(qUsers);
      const membros: Morador[] = [];
      sUsers.forEach(d => {
        const data = d.data();
        if (data.isActive === false || data.role === 'hospede') return;
        membros.push({ uid: d.id, name: data.name || 'Morador' });
      });
      setMoradores(membros);

      const qComodos = query(collection(db, 'comodos'), where('casaId', '==', user.houseId));
      const sComodos = await getDocs(qComodos);
      const coms: Comodo[] = [];
      sComodos.forEach(d => {
        const data = d.data();
        if (data.tipo === 'privado' && data.aceitaHospedes === true) coms.push({ id: d.id, nome: data.nome || 'Cômodo', icone: data.icone || '🏠' });
      });
      setComodos(coms);

      const casaSnap = await getDoc(doc(db, 'casas', user.houseId));
      if (casaSnap.exists()) setCasa(casaSnap.data() as Casa);
    } catch (e) { console.error('[Estadia] Erro ao carregar dados da casa:', e); }
  }

  useEffect(() => { carregarDadosCasa(); }, [user?.houseId]);

  async function handleSalvar() {
    setErro(''); setSucesso('');
    if (!estadiaInicio || !estadiaFim) {
      setErro('Preencha a data de início e a data de fim da estadia.');
      return;
    }
    if (estadiaFim <= estadiaInicio) {
      setErro('A data de fim deve ser após a data de início.');
      return;
    }
    if (!responsavelId) {
      setErro('Selecione o responsável por você durante a estadia.');
      return;
    }
    if (comodos.length > 0 && !dormitorio) {
      setErro('Selecione o dormitório.');
      return;
    }
    if (!user?.uid) {
      setErro('Usuário não autenticado.');
      return;
    }
    setLoading(true);
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const estadiaAtiva = estadiaInicio <= hoje && estadiaFim > hoje;
      const isCadastro = !user?.estadiaInicio || !user?.estadiaFim;
      // Presença NESTA SEMANA (não só hoje) - decide se dispara redistribuição/push
      const sobrepoeAntes = sobrepoeSemanaAtual(user?.estadiaInicio, user?.estadiaFim);
      const sobrepoeDepois = sobrepoeSemanaAtual(estadiaInicio, estadiaFim);
      await updateDoc(doc(db, 'users', user.uid), {
        estadiaInicio,
        estadiaFim,
        isPresent: estadiaAtiva,
        updatedAt: new Date().toISOString(),
      });

      // Registro no historico de hospedagem (nao bloqueia o fluxo principal se falhar)
      if (user.houseId) {
        try {
          const responsavel = moradores.find(m => m.uid === responsavelId);
          const dormitorioObj = comodos.find(c => c.id === dormitorio);
          const valorContribuicao = faixaContribuicao === 'minimo' ? (casa?.contribuicaoMinima || 0)
            : faixaContribuicao === 'ideal' ? (casa?.contribuicaoIdeal || 0)
            : (casa?.contribuicaoAbundante || 0);
          await salvarHospedagem({
            casaId: user.houseId,
            hospedeUid: user.uid,
            hospedeNome: user.name || 'Hóspede',
            responsavelUid: responsavelId,
            responsavelNome: responsavel?.name || '',
            chegada: estadiaInicio,
            saida: estadiaFim,
            dormitorio: dormitorioObj?.nome || '',
            faixaContribuicao,
            valorContribuicao,
          });
        } catch (err) {
          console.error('[Estadia] Erro ao salvar histórico de hospedagem:', err);
        }
      }

      setSucesso(estadiaAtiva
        ? 'Estadia definida! Você pode usar o app normalmente.'
        : `Estadia definida, mas ainda não está ativa. Volte em ${estadiaInicio}.`);
      // Redistribui tarefas se a presença na semana atual mudou
      if (user?.houseId && sobrepoeAntes !== sobrepoeDepois) {
        const semanaAtual = getSemanaDaData(new Date());
        try {
          if (sobrepoeDepois) {
            const titulo = isCadastro ? 'Tarefas Redistribuídas - Cadastro de Hospedagem' : 'Tarefas Redistribuídas - Alteração de Hospedagem';
            await redistribuirPorEntrada(user.uid, user.houseId, semanaAtual.weekId, 'estadia_iniciada', estadiaInicio, estadiaFim, titulo);
          } else {
            await redistribuirPorSaida(user.uid, user.houseId, semanaAtual.weekId, 'estadia_terminada', 'Tarefas Redistribuídas - Alteração de Hospedagem');
          }
        } catch (err: any) {
          console.error('Erro ao redistribuir por mudança de estadia:', err);
        }
      }
      // Atualiza localmente e redireciona se ativa
      if (estadiaAtiva) {
        setTimeout(() => navigate('/app', { replace: true }), 1500);
      }
    } catch (e: any) {
      setErro('Erro ao salvar: ' + e.message);
    }
    setLoading(false);
  }

  async function handleExcluirEstadia() {
    if (!user?.uid) return;
    if (!confirm('Excluir sua estadia cadastrada? Você precisará definir um novo período para voltar a usar o app.')) return;
    setLoading(true);
    setErro(''); setSucesso('');
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const sobrepoeAntes = sobrepoeSemanaAtual(user.estadiaInicio, user.estadiaFim);
      await updateDoc(doc(db, 'users', user.uid), {
        estadiaInicio: '',
        estadiaFim: '',
        isPresent: false,
        updatedAt: new Date().toISOString(),
      });
      try { await encerrarHospedagemAberta(user.uid, hoje); } catch (err) { console.error('[Estadia] Erro ao encerrar histórico:', err); }
      setEstadiaInicio('');
      setEstadiaFim('');
      setSucesso('Estadia excluída.');
      if (user.houseId && sobrepoeAntes) {
        const semanaAtual = getSemanaDaData(new Date());
        try {
          await redistribuirPorSaida(user.uid, user.houseId, semanaAtual.weekId, 'estadia_terminada', 'Tarefas Redistribuídas - Hospedagem Excluída');
        } catch (err: any) {
          console.error('Erro ao redistribuir exclusão de estadia:', err);
        }
      }
    } catch (e: any) {
      setErro('Erro ao excluir: ' + e.message);
    }
    setLoading(false);
  }

  const hoje = new Date().toISOString().split('T')[0];
  const estadiaExpirada = user?.estadiaFim && user.estadiaFim <= hoje;
  const estadiaFutura = user?.estadiaInicio && user.estadiaInicio > hoje;

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <TopAppBar title="Minha Estadia" showMenu={false} showNotifications={false} />
      <main className="px-margin-page mt-stack-md space-y-6 pb-10">
        {/* Header */}
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-tertiary mb-3">luggage</span>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Bem-vindo, Hóspede!</h2>
          <p className="text-text-muted font-body-md mt-2">
            Para usar o app, defina o período da sua estadia nesta casa.
          </p>
        </div>

        {/* Status atual */}
        {user?.estadiaInicio && user?.estadiaFim && (
          <div className={`rounded-xl border p-4 text-center ${estadiaExpirada ? 'bg-error/10 border-error/30' : estadiaFutura ? 'bg-tertiary/10 border-tertiary/30' : 'bg-primary/10 border-primary/30'}`}>
            <span className={`material-symbols-outlined text-3xl mb-2 ${estadiaExpirada ? 'text-error' : estadiaFutura ? 'text-tertiary' : 'text-primary'}`}>
              {estadiaExpirada ? 'event_busy' : estadiaFutura ? 'event_upcoming' : 'event_available'}
            </span>
            <p className={`text-sm font-bold ${estadiaExpirada ? 'text-error' : estadiaFutura ? 'text-tertiary' : 'text-primary'}`}>
              {estadiaExpirada
                ? 'Sua estadia expirou. Defina novas datas.'
                : estadiaFutura
                ? `Sua estadia começa em ${user.estadiaInicio}.`
                : 'Sua estadia está ativa!'}
            </p>
            {user.estadiaInicio && user.estadiaFim && (
              <p className="text-[10px] text-on-surface-variant mt-1">
                {user.estadiaInicio} → {user.estadiaFim}
              </p>
            )}
          </div>
        )}

        {/* Form */}
        <div className="bg-surface-card rounded-xl border border-outline-variant p-5 space-y-4">
          <h3 className="font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">edit_calendar</span>
            Definir Período de Estadia
          </h3>

          <div>
            <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Data de Início *</label>
            <input
              type="date"
              value={estadiaInicio}
              onChange={(e) => setEstadiaInicio(e.target.value)}
              className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
            />
          </div>

          <div>
            <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Data de Fim *</label>
            <input
              type="date"
              value={estadiaFim}
              onChange={(e) => setEstadiaFim(e.target.value)}
              min={estadiaInicio || hoje}
              className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
            />
          </div>

          <div>
            <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Responsável por Você *</label>
            <select
              value={responsavelId}
              onChange={(e) => setResponsavelId(e.target.value)}
              className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
            >
              <option value="">Selecione um morador</option>
              {moradores.map(m => <option key={m.uid} value={m.uid}>{m.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Dormitório {comodos.length > 0 ? '*' : '(opcional)'}</label>
            {comodos.length === 0 ? (
              <p className="text-xs text-on-surface-variant">Nenhum dormitório disponível ainda - fale com um morador.</p>
            ) : (
              <select
                value={dormitorio}
                onChange={(e) => setDormitorio(e.target.value)}
                className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
              >
                <option value="">Selecione</option>
                {comodos.map(c => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="text-label-sm text-on-surface-variant block mb-2 font-bold">Contribuição *</label>
            <div className="grid grid-cols-3 gap-2">
              {(['minimo', 'ideal', 'abundante'] as FaixaContribuicao[]).map(faixa => (
                <button
                  key={faixa}
                  type="button"
                  onClick={() => setFaixaContribuicao(faixa)}
                  className={`flex flex-col items-center py-3 rounded-xl border-2 transition-all ${faixaContribuicao === faixa ? 'bg-primary/15 border-primary text-primary' : 'bg-surface-container-high border-outline-variant text-on-surface-variant'}`}
                >
                  <span className="text-xs font-bold">{FAIXA_LABEL[faixa]}</span>
                  <span className="text-sm font-bold mt-1">
                    R$ {(faixa === 'minimo' ? casa?.contribuicaoMinima : faixa === 'ideal' ? casa?.contribuicaoIdeal : casa?.contribuicaoAbundante)?.toFixed(0) ?? '0'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Mensagens */}
          {erro && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>{erro}
            </div>
          )}
          {sucesso && (
            <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-primary text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">check_circle</span>{sucesso}
            </div>
          )}

          <button
            onClick={handleSalvar}
            disabled={loading}
            className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin">refresh</span>
            ) : (
              <>
                <span className="material-symbols-outlined">save</span>
                Salvar Estadia
              </>
            )}
          </button>

          {user?.estadiaInicio && user?.estadiaFim && (
            <button
              onClick={handleExcluirEstadia}
              disabled={loading}
              className="w-full bg-error/10 text-error border border-error/30 font-bold py-2.5 rounded-xl hover:bg-error/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">delete</span>
              Excluir Estadia
            </button>
          )}
        </div>

        {/* Info */}
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/50 p-4 text-center">
          <span className="material-symbols-outlined text-on-surface-variant text-2xl mb-2">info</span>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Durante sua estadia, você poderá ver as tarefas da casa e participar da rotina.
            Fora do período, seu acesso será limitado. Fale com um morador da casa para ajudar.
          </p>
        </div>
      </main>
    </div>
  );
}
