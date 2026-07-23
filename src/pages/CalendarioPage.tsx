import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { TopAppBar } from '@/components/TopAppBar';
import { useApp } from '@/App';
import { useAuthStore } from '@/stores/authStore';
import type { Evento } from '@/utils/eventos';
import { eventoOcorreEm } from '@/utils/eventos';

interface ItemPendente {
  id: string;
  titulo: string;
  fotoURL?: string;
  status: 'aberto' | 'resolvido';
  criadoPor: string;
  criadoPorNome: string;
}

interface TarefaBase {
  id: string;
  titulo: string;
  comodoId: string;
  prioridade: 'alta' | 'media' | 'baixa';
}
interface ComodoInfo {
  id: string;
  nome: string;
  icone: string;
}
interface AtribuicaoHist {
  id: string;
  tarefaId: string;
  titulo: string;
  prioridade: 'alta' | 'media' | 'baixa';
  responsavelId: string;
  responsavelNome: string;
  diaSemana: number;
  status: string;
  dataConclusao?: string;
}
interface DistribuicaoHist {
  id: string;
  weekId: string;
  atribuicoes: AtribuicaoHist[];
}

interface OcorrenciaPerdida {
  data: Date;
  responsavelId: string;
  responsavelNome: string;
}
interface TarefaNaoConcluida {
  tarefaId: string;
  titulo: string;
  comodo?: ComodoInfo;
  count: number;
  ocorrencias: OcorrenciaPerdida[];
}

function getDiasDoMes(referencia: Date): { data: Date; noMesAtual: boolean }[] {
  const ano = referencia.getFullYear();
  const mes = referencia.getMonth();
  const primeiroDiaMes = new Date(ano, mes, 1);
  const ultimoDiaMes = new Date(ano, mes + 1, 0);
  const diaSemanaPrimeiro = (primeiroDiaMes.getDay() + 6) % 7; // Seg=0

  const dias: { data: Date; noMesAtual: boolean }[] = [];
  for (let i = diaSemanaPrimeiro; i > 0; i--) dias.push({ data: new Date(ano, mes, 1 - i), noMesAtual: false });
  for (let dia = 1; dia <= ultimoDiaMes.getDate(); dia++) dias.push({ data: new Date(ano, mes, dia), noMesAtual: true });
  while (dias.length % 7 !== 0) {
    const ultimo = dias[dias.length - 1].data;
    const d = new Date(ultimo);
    d.setDate(d.getDate() + 1);
    dias.push({ data: d, noMesAtual: false });
  }
  return dias;
}

// Segunda-feira real (ISO, ancorada em 4 de janeiro) de uma semana - mesmo calculo usado em
// ConquistasPage.tsx/moradorViajandoNaSemana pra converter weekId em data de calendario.
function segundaDaSemana(weekId: string): Date {
  const match = weekId.match(/(\d+)-W(\d+)/);
  if (!match) return new Date(NaN);
  const ano = parseInt(match[1], 10);
  const semana = parseInt(match[2], 10);
  const jan4 = new Date(ano, 0, 4);
  const primeiraSegunda = new Date(jan4.getTime() - ((jan4.getDay() + 6) % 7) * 24 * 60 * 60 * 1000);
  return new Date(primeiraSegunda.getTime() + (semana - 1) * 7 * 24 * 60 * 60 * 1000);
}

function fimDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// Prazo final pra considerar uma tarefa "nao cumprida", conforme a prioridade:
// alta = no mesmo dia; media = ate domingo da mesma semana; baixa = ate 15 dias depois.
function calcularPrazo(prioridade: string, segunda: Date, dueDate: Date): Date {
  if (prioridade === 'alta') return fimDoDia(dueDate);
  if (prioridade === 'media') {
    const domingo = new Date(segunda);
    domingo.setDate(domingo.getDate() + 6);
    return fimDoDia(domingo);
  }
  const d15 = new Date(dueDate);
  d15.setDate(d15.getDate() + 15);
  return fimDoDia(d15);
}

interface TarefaNaoConcluidaComPrioridade extends TarefaNaoConcluida {
  prioridade: 'alta' | 'media' | 'baixa';
}

function calcularTop10PorPrioridade(
  distribuicoes: DistribuicaoHist[],
  tarefasBase: TarefaBase[],
  comodos: ComodoInfo[]
): Record<'alta' | 'media' | 'baixa', TarefaNaoConcluida[]> {
  const agora = new Date();
  const grupos: Record<string, TarefaNaoConcluidaComPrioridade> = {};

  distribuicoes.forEach(dist => {
    const segunda = segundaDaSemana(dist.weekId);
    if (isNaN(segunda.getTime())) return;
    dist.atribuicoes.forEach(atrib => {
      const dueDate = new Date(segunda);
      dueDate.setDate(dueDate.getDate() + atrib.diaSemana);
      const prazo = calcularPrazo(atrib.prioridade, segunda, dueDate);

      let perdida = false;
      if (atrib.status === 'concluida' || atrib.status === 'concluída') {
        if (atrib.dataConclusao) perdida = new Date(atrib.dataConclusao).getTime() > prazo.getTime();
      } else {
        perdida = agora.getTime() > prazo.getTime();
      }
      if (!perdida) return;

      const tarefaAtual = tarefasBase.find(t => t.id === atrib.tarefaId);
      const comodo = tarefaAtual ? comodos.find(c => c.id === tarefaAtual.comodoId) : undefined;
      const prioridade = tarefaAtual?.prioridade || atrib.prioridade;

      if (!grupos[atrib.tarefaId]) {
        grupos[atrib.tarefaId] = {
          tarefaId: atrib.tarefaId,
          titulo: tarefaAtual?.titulo || atrib.titulo,
          comodo,
          prioridade,
          count: 0,
          ocorrencias: [],
        };
      }
      grupos[atrib.tarefaId].count++;
      grupos[atrib.tarefaId].ocorrencias.push({ data: dueDate, responsavelId: atrib.responsavelId, responsavelNome: atrib.responsavelNome });
    });
  });

  const todas = Object.values(grupos);
  const porPrioridade = (p: 'alta' | 'media' | 'baixa') =>
    todas.filter(t => t.prioridade === p).sort((a, b) => b.count - a.count).slice(0, 10);

  return { alta: porPrioridade('alta'), media: porPrioridade('media'), baixa: porPrioridade('baixa') };
}

export function CalendarioPage() {
  const { openMenu, openNotifications } = useApp();
  const { user } = useAuthStore();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [tarefasBase, setTarefasBase] = useState<TarefaBase[]>([]);
  const [comodos, setComodos] = useState<ComodoInfo[]>([]);
  const [distribuicoes, setDistribuicoes] = useState<DistribuicaoHist[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesReferencia, setMesReferencia] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const hoje = new Date();
  const [diaSelecionado, setDiaSelecionado] = useState(hoje);
  const [tarefaDetalhe, setTarefaDetalhe] = useState<TarefaNaoConcluida | null>(null);
  const [itensPendentes, setItensPendentes] = useState<ItemPendente[]>([]);
  const [novoItemTexto, setNovoItemTexto] = useState('');
  const [salvandoItem, setSalvandoItem] = useState(false);
  const [enviandoFotoId, setEnviandoFotoId] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      if (!user?.houseId) { setLoading(false); return; }
      try {
        const qEventos = query(collection(db, 'eventos'), where('casaId', '==', user.houseId));
        const sEventos = await getDocs(qEventos);
        const listaEventos: Evento[] = [];
        sEventos.forEach(d => listaEventos.push({ id: d.id, ...d.data(), respostas: d.data().respostas || {} } as Evento));
        setEventos(listaEventos);

        const qTarefas = query(collection(db, 'tarefas'), where('casaId', '==', user.houseId));
        const sTarefas = await getDocs(qTarefas);
        const listaTarefas: TarefaBase[] = [];
        sTarefas.forEach(d => { const data = d.data(); listaTarefas.push({ id: d.id, titulo: data.titulo || 'Tarefa', comodoId: data.comodoId || '', prioridade: data.prioridade || 'media' }); });
        setTarefasBase(listaTarefas);

        const qComodos = query(collection(db, 'comodos'), where('casaId', '==', user.houseId));
        const sComodos = await getDocs(qComodos);
        const listaComodos: ComodoInfo[] = [];
        sComodos.forEach(d => { const data = d.data(); listaComodos.push({ id: d.id, nome: data.nome || 'Cômodo', icone: data.icone || '🏠' }); });
        setComodos(listaComodos);

        const qDist = query(collection(db, 'distribuicoes'), where('casaId', '==', user.houseId));
        const sDist = await getDocs(qDist);
        const listaDist: DistribuicaoHist[] = [];
        sDist.forEach(d => { const data = d.data(); listaDist.push({ id: d.id, weekId: data.weekId, atribuicoes: data.atribuicoes || [] }); });
        setDistribuicoes(listaDist);

        await carregarItensPendentes();
      } catch (e) { console.error('[Calendario] Erro ao carregar dados:', e); }
      setLoading(false);
    }
    carregar();
  }, [user?.houseId]);

  async function carregarItensPendentes() {
    if (!user?.houseId) return;
    try {
      const q = query(collection(db, 'ciclosPendentes'), where('casaId', '==', user.houseId));
      const snap = await getDocs(q);
      const lista: ItemPendente[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.status !== 'aberto') return;
        lista.push({ id: d.id, titulo: data.titulo || '', fotoURL: data.fotoURL || '', status: data.status, criadoPor: data.criadoPor || '', criadoPorNome: data.criadoPorNome || 'Alguém' });
      });
      setItensPendentes(lista);
    } catch (e) { console.error('[Calendario] Erro ao carregar ciclos pendentes:', e); }
  }

  async function adicionarItemPendente() {
    const titulo = novoItemTexto.trim();
    if (!titulo || !user?.houseId || !user?.uid) return;
    setSalvandoItem(true);
    try {
      const ref = await addDoc(collection(db, 'ciclosPendentes'), {
        casaId: user.houseId,
        titulo,
        status: 'aberto',
        criadoPor: user.uid,
        criadoPorNome: user.name || 'Alguém',
        createdAt: serverTimestamp(),
      });
      setItensPendentes(prev => [...prev, { id: ref.id, titulo, status: 'aberto', criadoPor: user.uid, criadoPorNome: user.name || 'Alguém' }]);
      setNovoItemTexto('');
    } catch (e: any) {
      alert('Erro ao adicionar: ' + e.message);
    }
    setSalvandoItem(false);
  }

  async function enviarFotoItem(itemId: string, file: File) {
    if (!file.type.startsWith('image/')) { alert('Selecione uma imagem válida'); return; }
    if (file.size > 4 * 1024 * 1024) { alert('A imagem deve ter no máximo 4MB'); return; }
    setEnviandoFotoId(itemId);
    try {
      const storageRef = ref(storage, `ciclosPendentes/${itemId}/foto.jpg`);
      await uploadBytes(storageRef, file);
      const fotoURL = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'ciclosPendentes', itemId), { fotoURL });
      setItensPendentes(prev => prev.map(it => it.id === itemId ? { ...it, fotoURL } : it));
    } catch (e: any) {
      alert('Erro ao enviar foto: ' + e.message);
    }
    setEnviandoFotoId(null);
  }

  async function resolverItem(itemId: string) {
    // Some da lista de abertos mas mantem o registro no Firestore (status vira 'resolvido')
    setItensPendentes(prev => prev.filter(it => it.id !== itemId));
    try {
      await updateDoc(doc(db, 'ciclosPendentes', itemId), {
        status: 'resolvido',
        resolvidoEm: serverTimestamp(),
        resolvidoPor: user?.uid || '',
      });
    } catch (e) {
      console.error('[Calendario] Erro ao resolver item:', e);
      carregarItensPendentes();
    }
  }

  function mesAnterior() { setMesReferencia(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; }); }
  function mesSeguinte() { setMesReferencia(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; }); }

  const monthName = mesReferencia.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const dias = getDiasDoMes(mesReferencia);

  function eventosNoDia(dia: Date): Evento[] {
    return eventos.filter(ev => eventoOcorreEm(ev, dia));
  }

  const eventosDoDiaSelecionado = eventosNoDia(diaSelecionado);
  const diaSelecionadoLabel = diaSelecionado.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

  const top10PorPrioridade = calcularTop10PorPrioridade(distribuicoes, tarefasBase, comodos);
  const PRIORIDADES: { key: 'alta' | 'media' | 'baixa'; label: string; corTexto: string; corBg: string; corBorda: string }[] = [
    { key: 'alta', label: 'Alta Prioridade', corTexto: 'text-error', corBg: 'bg-error/10', corBorda: 'border-error/30' },
    { key: 'media', label: 'Média Prioridade', corTexto: 'text-yellow-600', corBg: 'bg-yellow-500/10', corBorda: 'border-yellow-500/30' },
    { key: 'baixa', label: 'Baixa Prioridade', corTexto: 'text-secondary', corBg: 'bg-secondary/10', corBorda: 'border-secondary/30' },
  ];

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body-md overflow-x-hidden pb-32">
      {/* Background Atmospheric Effects (Growth Rings) */}
      <div className="fixed inset-0 overflow-hidden -z-10 opacity-30 pointer-events-none">
        <div className="absolute w-[600px] h-[600px] -top-20 -left-20 rounded-full border border-primary/5" />
        <div className="absolute w-[800px] h-[800px] -top-40 -left-40 rounded-full border border-primary/5" />
        <div className="absolute w-[1000px] h-[1000px] -top-60 -left-60 rounded-full border border-primary/5" />
      </div>

      <TopAppBar
        onMenuClick={openMenu}
        onNotificationClick={openNotifications}
        title="Calendário"
        titleColor="text-page-ciclos" />

      <main className="flex-1 px-margin-page py-6 pb-24 space-y-stack-lg">
        {/* Hero Header */}
        <section className="space-y-1">
          <p className="text-label-sm font-label-sm text-page-ciclos uppercase tracking-widest">Tempo de Crescer</p>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-page-ciclos">Calendário da Casa</h2>
        </section>

        {/* Calendar Month View Card */}
        <section className="glass-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-section-heading text-body-md text-on-surface capitalize">{monthName}</h3>
            <div className="flex gap-2">
              <button onClick={mesAnterior} className="material-symbols-outlined text-on-surface-variant p-1 hover:bg-surface-variant rounded transition-colors">chevron_left</button>
              <button onClick={mesSeguinte} className="material-symbols-outlined text-on-surface-variant p-1 hover:bg-surface-variant rounded transition-colors">chevron_right</button>
            </div>
          </div>

          {/* Calendar Days Header */}
          <div className="grid grid-cols-7 mb-2 text-center">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
              <span key={i} className="text-label-sm font-label-sm text-on-surface-variant opacity-60">{d}</span>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {dias.map(({ data, noMesAtual }, idx) => {
              const isToday = data.toDateString() === hoje.toDateString();
              const isSelected = data.toDateString() === diaSelecionado.toDateString();
              const qtdEventos = noMesAtual ? eventosNoDia(data).length : 0;
              return (
                <button
                  key={idx}
                  onClick={() => noMesAtual && setDiaSelecionado(data)}
                  disabled={!noMesAtual}
                  className={`aspect-square flex items-center justify-center rounded-lg transition-all text-sm font-label-sm relative ${
                    !noMesAtual
                      ? 'text-on-surface-variant opacity-20'
                      : isToday
                      ? 'bg-page-ciclos text-on-primary font-bold shadow-[0_0_15px_rgba(216,191,216,0.4)]'
                      : isSelected
                      ? 'bg-page-ciclos/20 text-page-ciclos font-bold'
                      : 'hover:bg-surface-variant text-on-surface'
                  }`}
                >
                  {data.getDate()}
                  {qtdEventos > 0 && (
                    <span className={`absolute bottom-1.5 w-1 h-1 rounded-full ${isToday ? 'bg-on-primary' : 'bg-tertiary'}`} />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Daily Schedule Section */}
        <section className="space-y-stack-md">
          <div className="flex items-center justify-between">
            <h3 className="text-section-heading font-section-heading text-on-surface">Programação do Dia</h3>
            <span className="text-caption font-caption text-primary capitalize">{diaSelecionadoLabel}</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><span className="material-symbols-outlined animate-spin text-page-ciclos text-3xl">refresh</span></div>
          ) : eventosDoDiaSelecionado.length === 0 ? (
            <div className="glass-card rounded-xl p-6 text-center">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">event_available</span>
              <p className="text-text-muted">Nenhum evento neste dia</p>
            </div>
          ) : (
            <div className="space-y-3">
              {eventosDoDiaSelecionado.map((evento) => (
                <div
                  key={evento.id}
                  className="glass-card p-4 rounded-xl flex items-center gap-4 group transition-all hover:translate-x-1"
                >
                  <div className="w-10 h-10 rounded-lg bg-tertiary-container/30 flex items-center justify-center text-lg">
                    {evento.emoji || '📅'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-label-sm font-label-sm text-on-surface truncate">{evento.titulo}</h4>
                    <p className="text-caption font-caption text-on-surface-variant truncate">
                      {evento.horario}{evento.locais && evento.locais.length > 0 ? ` · ${evento.locais.join(', ')}` : ''}
                    </p>
                  </div>
                  <span className="bg-tertiary/20 text-tertiary px-3 py-1 rounded-full text-caption font-label-sm flex-shrink-0">Evento</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Ciclos de Tarefas Não Concluídas */}
        <section className="space-y-stack-md">
          <div className="flex items-center justify-between">
            <h3 className="text-section-heading font-section-heading text-on-surface">Ciclos de Tarefas Não Concluídas</h3>
          </div>
          <p className="text-caption font-caption text-on-surface-variant -mt-2">
            Alta: não feita no mesmo dia · Média: não feita até domingo · Baixa: não feita em 15 dias
          </p>

          {loading ? (
            <div className="flex justify-center py-8"><span className="material-symbols-outlined animate-spin text-page-ciclos text-3xl">refresh</span></div>
          ) : (
            <div className="space-y-5">
              {PRIORIDADES.map(({ key, label, corTexto, corBg, corBorda }) => {
                const lista = top10PorPrioridade[key];
                return (
                  <div key={key} className={`rounded-xl border ${corBorda} ${corBg} p-3 space-y-2`}>
                    <h4 className={`text-label-sm font-bold uppercase ${corTexto} px-1`}>{label}</h4>
                    {lista.length === 0 ? (
                      <p className="text-xs text-on-surface-variant px-1 py-2">Nenhuma tarefa atrasada nessa prioridade - tudo em dia!</p>
                    ) : (
                      <div className="space-y-2">
                        {lista.map((item, idx) => (
                          <button
                            key={item.tarefaId}
                            onClick={() => setTarefaDetalhe(item)}
                            className="w-full glass-card rounded-xl p-3 flex items-center gap-3 text-left hover:translate-x-1 transition-all"
                          >
                            <span className="w-5 text-center text-xs font-bold text-on-surface-variant flex-shrink-0">{idx + 1}</span>
                            <span className="text-lg flex-shrink-0">{item.comodo?.icone || '📋'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-on-surface truncate">{item.titulo}</p>
                              <p className="text-[10px] text-on-surface-variant">{item.comodo?.nome || 'Cômodo removido'}</p>
                            </div>
                            <span className={`text-xs font-bold ${corBg} ${corTexto} px-2 py-1 rounded-full flex-shrink-0`}>{item.count}x</span>
                            <span className="material-symbols-outlined text-on-surface-variant text-lg flex-shrink-0">chevron_right</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Você pode encerrar este ciclo? */}
        <section className="space-y-stack-md">
          <h3 className="text-section-heading font-section-heading text-on-surface">Você pode encerrar este ciclo?</h3>
          <p className="text-caption font-caption text-on-surface-variant -mt-2">
            Coisas que ficaram pendentes pra casa - fora do sistema de tarefas, tipo "tirar louça suja da mesa".
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={novoItemTexto}
              onChange={e => setNovoItemTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') adicionarItemPendente(); }}
              placeholder="O que ficou pendente?"
              className="flex-1 bg-surface-container-high border border-outline-variant text-on-surface rounded-xl py-2.5 px-4 text-sm"
            />
            <button
              onClick={adicionarItemPendente}
              disabled={!novoItemTexto.trim() || salvandoItem}
              className="px-4 bg-page-ciclos text-on-primary font-bold rounded-xl text-sm hover:brightness-110 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined">add</span>
            </button>
          </div>

          {itensPendentes.length === 0 ? (
            <div className="glass-card rounded-xl p-6 text-center">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">task_alt</span>
              <p className="text-text-muted">Nenhum ciclo em aberto no momento</p>
            </div>
          ) : (
            <div className="space-y-3">
              {itensPendentes.map(item => (
                <div key={item.id} className="glass-card rounded-xl p-4 space-y-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-page-ciclos">Ciclo Aberto</span>
                    <p className="text-sm font-medium text-on-surface mt-0.5">{item.titulo}</p>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">Por {item.criadoPorNome}</p>
                  </div>
                  {item.fotoURL && (
                    <img src={item.fotoURL} alt={item.titulo} className="w-20 h-20 object-cover rounded-lg border border-outline-variant" />
                  )}
                  <div className="flex gap-2">
                    <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-surface-container-high border border-outline-variant text-on-surface-variant rounded-lg text-xs font-bold cursor-pointer hover:bg-surface-container-highest transition-all">
                      <span className="material-symbols-outlined text-[16px]">
                        {enviandoFotoId === item.id ? 'hourglass_empty' : 'photo_camera'}
                      </span>
                      {enviandoFotoId === item.id ? 'Enviando...' : item.fotoURL ? 'Trocar Foto' : 'Enviar Foto'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={enviandoFotoId === item.id}
                        onChange={e => { const file = e.target.files?.[0]; if (file) enviarFotoItem(item.id, file); e.target.value = ''; }}
                      />
                    </label>
                    <button
                      onClick={() => resolverItem(item.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 text-primary border border-primary/30 rounded-lg text-xs font-bold hover:bg-primary/20 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      Resolvido
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Modal: detalhes da tarefa nao concluida */}
      {tarefaDetalhe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setTarefaDetalhe(null)}>
          <div className="bg-surface rounded-2xl p-5 w-full max-w-sm shadow-2xl border border-outline-variant space-y-3 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-on-surface text-lg">{tarefaDetalhe.titulo}</h3>
                {tarefaDetalhe.comodo && (
                  <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                    <span>{tarefaDetalhe.comodo.icone}</span>{tarefaDetalhe.comodo.nome}
                  </p>
                )}
              </div>
              <button onClick={() => setTarefaDetalhe(null)} className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-xs font-bold text-on-surface-variant uppercase">
              {tarefaDetalhe.count} {tarefaDetalhe.count > 1 ? 'vezes não concluída no prazo' : 'vez não concluída no prazo'}
            </p>
            <div className="space-y-2">
              {[...tarefaDetalhe.ocorrencias].sort((a, b) => b.data.getTime() - a.data.getTime()).map((oc, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg text-sm">
                  <span className="text-on-surface">{oc.data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                  <span className="text-on-surface-variant">{oc.responsavelNome || 'Sem responsável'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
