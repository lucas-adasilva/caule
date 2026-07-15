import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useApp } from '@/App';
import { TopAppBar } from '@/components/TopAppBar';

interface Atribuicao {
  id: string; tarefaId: string; titulo: string; descricao: string;
  prioridade: 'alta' | 'media' | 'baixa'; responsavelId: string;
  responsavelNome: string; diaSemana: number;
  status: 'pendente' | 'concluida'; dataConclusao?: string; horarioLimite?: string;
  execucaoId?: string;
}
interface Distribuicao { id: string; weekId: string; casaId: string; atribuicoes: Atribuicao[]; }

const DIAS_SEMANA = ['Seg','Ter','Qua','Qui','Sex','Sab','Dom'];
function getSemanaAtual(): string { const hoje = new Date(); const ano = hoje.getFullYear(); const primeiraSegunda = new Date(ano, 0, 1); const diasDesdeInicio = Math.floor((hoje.getTime() - primeiraSegunda.getTime()) / (24 * 60 * 60 * 1000)); const semana = Math.ceil((diasDesdeInicio + primeiraSegunda.getDay()) / 7); return `${ano}-W${String(semana).padStart(2, '0')}`; }
function getDiaAtual(): number { return new Date().getDay(); }
function formatarDataBr(dataIso?: string): string { if (!dataIso) return ''; const d = new Date(dataIso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; }
function isoToInputDate(dataIso?: string): string { if (!dataIso) return ''; const d = new Date(dataIso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function inputDateToIso(dataStr: string): string { return new Date(`${dataStr}T12:00:00`).toISOString(); }
function getHojeStr(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

interface Comodo {
  id: string;
  nome: string;
  icone: string;
}

interface TarefaBase {
  id: string;
  titulo: string;
  comodoId: string;
  prioridade: 'alta' | 'media' | 'baixa';
}

/* ===== Componente de Tarefa com Swipe ===== */
function TaskRow({ atribuicao, onToggle, onEditDate, comodo }: { atribuicao: Atribuicao; onToggle: (a: Atribuicao) => void; onEditDate: (a: Atribuicao) => void; comodo?: Comodo; }) {
  const isConcluida = atribuicao.status === 'concluida';
  const [tx, setTx] = useState(0);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isHoriz, setIsHoriz] = useState(false);
  const [mostrarDesc, setMostrarDesc] = useState(true); // Descricao visivel por padrao

  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; setStartX(t.clientX); setStartY(t.clientY); setIsHoriz(false); setTx(0); };
  const onTouchMove = (e: React.TouchEvent) => { const t = e.touches[0]; const dx = t.clientX - startX; const dy = t.clientY - startY; if (!isHoriz && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) setIsHoriz(true); if (isHoriz) { e.preventDefault(); if (!isConcluida && dx > 0) setTx(Math.min(dx, 100)); else if (isConcluida && dx < 0) setTx(Math.max(dx, -100)); else setTx(0); } };
  const onTouchEnd = () => { if (isHoriz) { if (!isConcluida && tx > 50) onToggle(atribuicao); else if (isConcluida && tx < -50) onToggle(atribuicao); } setTx(0); setIsHoriz(false); };

  const pClasses = { alta: 'bg-error/10 text-error border-error/20', media: 'bg-tertiary-container/20 text-tertiary border-tertiary/20', baixa: 'bg-secondary/10 text-secondary border-secondary/20' };

  // Log para debug
  console.log(`[TaskRow] ${atribuicao.titulo} - status: ${atribuicao.status}, isConcluida: ${isConcluida}`);

  return (
    <div className="relative mb-3 select-none overflow-hidden rounded-xl" style={{ touchAction: 'pan-y' }}>
      {/* Background swipe */}
      <div className={`absolute inset-0 flex items-center rounded-xl ${!isConcluida ? 'justify-end pr-4 bg-primary' : 'justify-start pl-4 bg-error'}`} style={{ opacity: Math.abs(tx) / 80 }}>
        <span className="material-symbols-outlined text-white text-2xl">{!isConcluida ? 'check' : 'reply'}</span>
      </div>
      {/* Foreground */}
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        className={`bg-surface-card border rounded-xl p-4 relative z-10 ${isConcluida ? 'border-outline-variant/50 opacity-80' : 'border-outline-variant'}`}
        style={{ transform: `translateX(${tx}px)`, transition: isHoriz ? 'none' : 'transform 0.2s ease' }}>
        <div className="flex items-center gap-3">
          {/* Checkbox */}
          <button onClick={() => onToggle(atribuicao)} className="flex-shrink-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isConcluida ? 'bg-primary' : 'bg-surface-container-high border-2 border-outline-variant'}`}>
              {isConcluida && <span className="material-symbols-outlined text-on-primary text-lg">check</span>}
            </div>
          </button>
          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className={`font-bold text-sm ${isConcluida ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>{atribuicao.titulo}</h4>
            {comodo && (
              <p className="text-[10px] text-on-surface-variant flex items-center gap-1 mt-0.5">
                <span className="text-xs">{comodo.icone}</span>{comodo.nome}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border ${pClasses[atribuicao.prioridade]}`}>{atribuicao.prioridade === 'alta' ? 'Alta' : atribuicao.prioridade === 'media' ? 'Media' : 'Baixa'}</span>
              {atribuicao.horarioLimite && <span className="text-[10px] text-on-surface-variant flex items-center gap-0.5"><span className="material-symbols-outlined text-[10px]">schedule</span>{atribuicao.horarioLimite}</span>}
              {atribuicao.descricao && (
                <button onClick={() => setMostrarDesc(!mostrarDesc)} className="p-0.5 text-on-surface-variant hover:text-primary transition-colors" title="Ver descricao">
                  <span className="material-symbols-outlined text-[14px]">{mostrarDesc ? 'expand_less' : 'info'}</span>
                </button>
              )}
            </div>
            {mostrarDesc && atribuicao.descricao && <div className="mt-2 p-2 bg-surface-container-low rounded-lg text-sm text-on-surface-variant">{atribuicao.descricao}</div>}
            {isConcluida && atribuicao.dataConclusao && (
              <div className="flex items-center gap-1 mt-1 text-caption text-on-surface-variant">
                <span className="material-symbols-outlined text-[12px]">event_available</span>Concluido em {formatarDataBr(atribuicao.dataConclusao)}
                <button onClick={() => onEditDate(atribuicao)} className="ml-1 p-0.5 text-primary hover:bg-primary/10 rounded"><span className="material-symbols-outlined text-[14px]">edit</span></button>
              </div>
            )}
          </div>
          {/* Botao desfazer - seta vermelha */}
          {isConcluida && (
            <button onClick={() => onToggle(atribuicao)} className="flex-shrink-0 p-2 bg-error/10 text-error hover:bg-error/20 rounded-full transition-colors" title="Desfazer conclusao">
              <span className="material-symbols-outlined text-lg">reply</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== Pagina Folhas ===== */
export function TarefasPage() {
  const { user } = useAuthStore();
  const { openMenu, openNotifications } = useApp();
  const [distribuicao, setDistribuicao] = useState<Distribuicao | null>(null);
  const [comodos, setComodos] = useState<Comodo[]>([]);
  const [tarefas, setTarefas] = useState<TarefaBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [diaSelecionado, setDiaSelecionado] = useState(getDiaAtual() === 0 ? 6 : getDiaAtual() - 1);
  const [editandoAtrib, setEditandoAtrib] = useState<Atribuicao | null>(null);
  const [novaData, setNovaData] = useState('');
  const semanaAtual = getSemanaAtual();

  async function carregarDados() {
    if (!user?.uid || !user?.houseId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Buscar distribuicao
      const distRef = collection(db, 'distribuicoes');
      const qDist = query(distRef, where('casaId', '==', user.houseId));
      const snapDist = await getDocs(qDist);
      let encontrou = false;
      snapDist.forEach(d => { if ((d.data() as any).weekId === semanaAtual && !encontrou) { encontrou = true; setDistribuicao({ id: d.id, ...d.data() } as Distribuicao); } });
      if (!encontrou) setDistribuicao(null);

      // Buscar comodos
      const qComodos = query(collection(db, 'comodos'), where('casaId', '==', user.houseId));
      const sComodos = await getDocs(qComodos);
      const comodosData: Comodo[] = [];
      sComodos.forEach(d => { const data = d.data(); comodosData.push({ id: d.id, nome: data.nome || 'Cômodo', icone: data.icone || '🏠' }); });
      setComodos(comodosData);

      // Buscar tarefas
      const qTarefas = query(collection(db, 'tarefas'), where('casaId', '==', user.houseId));
      const sTarefas = await getDocs(qTarefas);
      const tarefasData: TarefaBase[] = [];
      sTarefas.forEach(d => { const data = d.data(); tarefasData.push({ id: d.id, titulo: data.titulo || 'Tarefa', comodoId: data.comodoId || '', prioridade: data.prioridade || 'media' }); });
      setTarefas(tarefasData);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => { carregarDados(); }, [user?.uid, user?.houseId]);

  async function toggleTarefa(atribuicao: Atribuicao) {
    if (!distribuicao || !user?.uid || !user?.houseId) return;
    try {
      const isConcluindo = atribuicao.status === 'pendente';
      // Desfazer remove o registro de execucao criado ao concluir, para nao inflar o historico usado no desempate
      let execucaoId = atribuicao.execucaoId;
      if (isConcluindo) {
        const ref = await addDoc(collection(db, 'execucoes'), { tarefaId: atribuicao.tarefaId, titulo: atribuicao.titulo, executorId: user.uid, executorNome: user.name || 'Morador', weekId: semanaAtual, data: new Date().toISOString(), casaId: user.houseId });
        execucaoId = ref.id;
      } else if (atribuicao.execucaoId) {
        await deleteDoc(doc(db, 'execucoes', atribuicao.execucaoId));
        execucaoId = undefined;
      }
      // Cria objeto de update - nao inclui dataConclusao/execucaoId quando desfaz (remove do doc)
      const novasAtribuicoes = distribuicao.atribuicoes.map(a => {
        if (a.id === atribuicao.id) {
          const updated: any = { ...a, status: (isConcluindo ? 'concluida' : 'pendente') as 'pendente' | 'concluida' };
          if (isConcluindo) { updated.dataConclusao = new Date().toISOString(); updated.execucaoId = execucaoId; }
          else { delete updated.dataConclusao; delete updated.execucaoId; } // Remove campos ao inves de undefined
          return updated;
        }
        return a;
      });
      await updateDoc(doc(db, 'distribuicoes', distribuicao.id), { atribuicoes: novasAtribuicoes });
      setDistribuicao({ ...distribuicao, atribuicoes: novasAtribuicoes });
    } catch (e) { console.error('toggleTarefa error:', e); }
  }

  async function salvarDataConclusao() {
    if (!distribuicao || !editandoAtrib || !novaData) return;
    // Valida: nao permite data futura
    if (novaData > getHojeStr()) { alert('Nao e possivel selecionar uma data futura!'); return; }
    try { const novasAtribuicoes = distribuicao.atribuicoes.map(a => a.id === editandoAtrib.id ? { ...a, dataConclusao: inputDateToIso(novaData) } : a); await updateDoc(doc(db, 'distribuicoes', distribuicao.id), { atribuicoes: novasAtribuicoes }); setDistribuicao({ ...distribuicao, atribuicoes: novasAtribuicoes }); setEditandoAtrib(null); setNovaData(''); } catch (e) { console.error(e); }
  }

  async function limparDataConclusao() {
    if (!distribuicao || !editandoAtrib) return;
    try {
      const novasAtribuicoes = distribuicao.atribuicoes.map(a => {
        if (a.id === editandoAtrib.id) {
          const updated: any = { ...a, status: 'pendente' };
          delete updated.dataConclusao; // Remove campo - nao undefined
          return updated;
        }
        return a;
      });
      await updateDoc(doc(db, 'distribuicoes', distribuicao.id), { atribuicoes: novasAtribuicoes });
      setDistribuicao({ ...distribuicao, atribuicoes: novasAtribuicoes });
      setEditandoAtrib(null);
      setNovaData('');
    } catch (e) { console.error('limparDataConclusao error:', e); }
  }

  const minhasAtribuicoes = distribuicao?.atribuicoes.filter(a => a.responsavelId === user?.uid && a.diaSemana === diaSelecionado) || [];
  const pendentes = minhasAtribuicoes.filter(a => a.status === 'pendente');
  const concluidas = minhasAtribuicoes.filter(a => a.status === 'concluida');
  const pendentesSemana = distribuicao?.atribuicoes.filter(a => a.responsavelId === user?.uid && a.status === 'pendente') || [];

  // Agrupar tarefas pendentes por cômodo
  function agruparPorComodo(atribuicoes: Atribuicao[]) {
    const grupos: Record<string, { comodo: Comodo; atribuicoes: Atribuicao[] }> = {};
    atribuicoes.forEach(atrib => {
      const tarefa = tarefas.find(t => t.id === atrib.tarefaId);
      const comodoId = tarefa?.comodoId;
      const comodo = comodos.find(c => c.id === comodoId);
      if (!comodo) return;
      if (!grupos[comodo.id]) grupos[comodo.id] = { comodo, atribuicoes: [] };
      grupos[comodo.id].atribuicoes.push(atrib);
    });
    return Object.values(grupos);
  }

  const pendentesPorComodo = agruparPorComodo(pendentes);
  const concluidasPorComodo = agruparPorComodo(concluidas);

  return (
    <div className="min-h-screen bg-surface text-text-body font-body-md pb-32">
      <TopAppBar
        onMenuClick={openMenu}
        onNotificationClick={openNotifications}
        title={user?.name ? `Casa de ${user.name}` : 'Casa das Oliveiras'} />
      <main className="px-margin-page mt-stack-md">
        <div className="mb-stack-lg"><h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Folhas</h2><p className="text-text-muted font-body-md">Minhas tarefas da semana</p></div>

        {/* Weekly Filter */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-stack-lg">
          {DIAS_SEMANA.map((dia, idx) => {
            const count = distribuicao?.atribuicoes.filter(a => a.responsavelId === user?.uid && a.diaSemana === idx && a.status === 'pendente').length || 0;
            return (
              <button key={idx} onClick={() => setDiaSelecionado(idx)} className={`flex-shrink-0 flex flex-col items-center justify-center w-14 h-18 rounded-xl transition-all duration-200 ${diaSelecionado === idx ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-card border border-outline-variant/30 text-on-surface'}`}>
                <span className={`text-[10px] font-bold uppercase ${diaSelecionado === idx ? 'text-on-primary/80' : 'text-text-muted'}`}>{dia}</span>
                {count > 0 && <span className={`text-[10px] font-bold mt-0.5 ${diaSelecionado === idx ? 'text-on-primary' : 'text-primary'}`}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Status summary */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-surface-card rounded-xl border border-outline-variant p-3 text-center"><p className="text-2xl font-bold text-primary">{pendentesSemana.length}</p><p className="text-[10px] text-on-surface-variant uppercase">Pendentes</p></div>
          <div className="flex-1 bg-surface-card rounded-xl border border-outline-variant p-3 text-center"><p className="text-2xl font-bold text-secondary">{distribuicao?.atribuicoes.filter(a => a.responsavelId === user?.uid && a.status === 'concluida').length || 0}</p><p className="text-[10px] text-on-surface-variant uppercase">Concluidas</p></div>
        </div>

        {/* Task List */}
        {loading ? (<div className="flex justify-center py-8"><span className="material-symbols-outlined animate-spin text-primary text-3xl">refresh</span></div>)
        : !distribuicao ? (<div className="text-center py-12"><span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">eco</span><p className="text-text-muted">Nenhuma distribuicao para esta semana</p></div>)
        : minhasAtribuicoes.length === 0 ? (<div className="text-center py-12"><span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">weekend</span><p className="text-text-muted">Nenhuma tarefa para voce em {DIAS_SEMANA[diaSelecionado]}</p></div>)
        : (<div>
          {pendentes.length > 0 && (
            <div className="mb-4">
              <h3 className="text-label-sm text-on-surface-variant font-bold mb-1 uppercase">Pendentes ({pendentes.length})</h3>
              <p className="text-[10px] text-primary mb-3 flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">swipe_right</span>Deslize para a direita para concluir</p>
              {pendentesPorComodo.map(({ comodo, atribuicoes }) => (
                <div key={comodo.id} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{comodo.icone}</span>
                    <h4 className="font-bold text-sm text-on-surface">{comodo.nome}</h4>
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-auto">{atribuicoes.length}</span>
                  </div>
                  {atribuicoes.map(a => <TaskRow key={a.id} atribuicao={a} onToggle={toggleTarefa} onEditDate={(atrib) => { setEditandoAtrib(atrib); setNovaData(isoToInputDate(atrib.dataConclusao)); }} comodo={comodo} />)}
                </div>
              ))}
            </div>
          )}
          {concluidas.length > 0 && (
            <div>
              <h3 className="text-label-sm text-on-surface-variant font-bold mb-1 uppercase">Concluidas ({concluidas.length})</h3>
              <p className="text-[10px] text-error mb-3 flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">swipe_left</span>Deslize para a esquerda para desfazer</p>
              {concluidasPorComodo.map(({ comodo, atribuicoes }) => (
                <div key={comodo.id} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{comodo.icone}</span>
                    <h4 className="font-bold text-sm text-on-surface-variant">{comodo.nome}</h4>
                    <span className="text-[10px] bg-secondary/10 text-secondary px-2 py-0.5 rounded-full ml-auto">{atribuicoes.length}</span>
                  </div>
                  {atribuicoes.map(a => <TaskRow key={a.id} atribuicao={a} onToggle={toggleTarefa} onEditDate={(atrib) => { setEditandoAtrib(atrib); setNovaData(isoToInputDate(atrib.dataConclusao)); }} comodo={comodo} />)}
                </div>
              ))}
            </div>
          )}
        </div>)}
      </main>

      {/* Modal editar data */}
      {editandoAtrib && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setEditandoAtrib(null); setNovaData(''); }}>
          <div className="bg-surface-card w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-on-surface text-lg">{editandoAtrib.titulo}</h3>
              <button onClick={() => { setEditandoAtrib(null); setNovaData(''); }} className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {/* Data atual */}
            {editandoAtrib.dataConclusao && (
              <div className="p-3 bg-surface-container-low rounded-lg">
                <p className="text-sm text-on-surface-variant">Data atual: <span className="font-bold text-on-surface">{formatarDataBr(editandoAtrib.dataConclusao)}</span></p>
              </div>
            )}
            {/* Input nova data */}
            <div>
              <label className="text-label-sm text-on-surface-variant block mb-2 font-bold">Nova data de conclusao</label>
              <input type="date" value={novaData} max={getHojeStr()} onChange={e => setNovaData(e.target.value)} className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-base" />
            </div>
            {/* Botoes */}
            <div className="flex flex-col gap-2 pt-2">
              <button onClick={salvarDataConclusao} disabled={!novaData} className="w-full bg-primary text-on-primary font-bold py-4 rounded-xl text-base hover:brightness-110 transition-all disabled:opacity-40 shadow-sm">
                Salvar Nova Data
              </button>
              <button onClick={limparDataConclusao} className="w-full bg-tertiary/10 text-tertiary border border-tertiary/30 font-bold py-3 rounded-xl text-sm hover:bg-tertiary/20 transition-all">
                Voltar a Pendente
              </button>
              <button onClick={() => { setEditandoAtrib(null); setNovaData(''); }} className="w-full py-2 text-on-surface-variant text-sm hover:text-on-surface transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}