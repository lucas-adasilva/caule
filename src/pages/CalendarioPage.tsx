import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { db, storage } from '@/lib/firebase';
import { TopAppBar } from '@/components/TopAppBar';
import { useApp } from '@/App';
import { useAuthStore } from '@/stores/authStore';
import type { Evento } from '@/utils/eventos';
import { eventoOcorreEm } from '@/utils/eventos';

const MESES_RANKING = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

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
  frequencia?: string;
  diasSemana?: string[];
  vezesPorSemana?: number;
  ativo?: boolean;
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

// Inverso de segundaDaSemana: dada uma segunda-feira, acha o weekId (mesma convencao Jan-4-ISO).
// Impreciso pertinho da virada do ano (semana que cruza dezembro/janeiro), mas isso so afeta uma
// estimativa, entao nao vale a pena tratar esse caso especial aqui.
function weekIdDaSegunda(segunda: Date): string {
  const ano = segunda.getFullYear();
  const jan4 = new Date(ano, 0, 4);
  const primeiraSegunda = new Date(jan4.getTime() - ((jan4.getDay() + 6) % 7) * 24 * 60 * 60 * 1000);
  const diff = Math.round((segunda.getTime() - primeiraSegunda.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${ano}-W${String(diff + 1).padStart(2, '0')}`;
}

// Todas as segundas-feiras que caem dentro do mes informado (mes 0-11).
function segundasDoMes(ano: number, mes: number): Date[] {
  const segundas: Date[] = [];
  const d = new Date(ano, mes, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  while (d.getMonth() === mes) {
    segundas.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return segundas;
}

function segundasDoAno(ano: number): Date[] {
  let todas: Date[] = [];
  for (let mes = 0; mes < 12; mes++) todas = todas.concat(segundasDoMes(ano, mes));
  return todas;
}

// Mesmo calculo de getSemanaDoMes() usado em functions/index.js/ConfiguracoesPage.tsx pra saber
// se uma semana e a "primeira" do mes (usado pra estimar tarefas mensais).
function semanaDoMesDoWeekId(weekId: string): number {
  const segunda = segundaDaSemana(weekId);
  if (isNaN(segunda.getTime())) return 0;
  const mes = segunda.getMonth();
  const ano = segunda.getFullYear();
  const primeiroDiaMes = new Date(ano, mes, 1);
  const diaSemana = primeiroDiaMes.getDay();
  const primeiraSegundaDoMes = new Date(primeiroDiaMes.getTime() - (diaSemana === 0 ? 6 : diaSemana - 1) * 24 * 60 * 60 * 1000);
  const diasDiff = Math.floor((segunda.getTime() - primeiraSegundaDoMes.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return diasDiff + 1;
}

// Estima quantas tarefas UMA semana sem distribuicao real geraria, a partir das regras de
// recorrencia de tarefasBase - mesma expansao usada em gerarAtribuicoesSemana()
// (functions/index.js/ConfiguracoesPage.tsx), sem multiplicar por morador (cada ocorrencia = 1
// tarefa, independente de quem faria).
function estimarTarefasSemana(tarefasBase: TarefaBase[], weekId: string): number {
  const match = weekId.match(/-W(\d+)$/);
  const numSemana = match ? parseInt(match[1], 10) : 0;
  const semanaPar = numSemana % 2 === 0;
  const primeiraDoMes = semanaDoMesDoWeekId(weekId) === 1;

  let total = 0;
  tarefasBase.filter(t => t.ativo !== false).forEach(t => {
    if (t.frequencia === 'diaria') total += 6;
    else if (t.frequencia === 'semanal' && t.diasSemana && t.diasSemana.length > 0) total += t.diasSemana.length;
    else if (t.frequencia === 'semanal') total += t.vezesPorSemana || 1;
    else if (t.frequencia === 'quinzenal') { if (!semanaPar) total += 1; }
    else if (t.frequencia === 'mensal') { if (primeiraDoMes) total += 1; }
    // 'unica' nao entra na estimativa - e pontual, nao da pra prever recorrencia
  });
  return total;
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

  // Dashboard "Ranking de Moradores"
  const [visaoRanking, setVisaoRanking] = useState<'menos' | 'mais'>('menos');
  const [granularidadeRanking, setGranularidadeRanking] = useState<'semana' | 'mes' | 'ano'>('semana');
  const [anoRanking, setAnoRanking] = useState(new Date().getFullYear());
  const [mesRanking, setMesRanking] = useState(new Date().getMonth());
  const [semanaRanking, setSemanaRanking] = useState('');

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
        sTarefas.forEach(d => { const data = d.data(); listaTarefas.push({ id: d.id, titulo: data.titulo || 'Tarefa', comodoId: data.comodoId || '', prioridade: data.prioridade || 'media', frequencia: data.frequencia || 'semanal', diasSemana: data.diasSemana || [], vezesPorSemana: data.vezesPorSemana, ativo: data.ativo }); });
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

  // Anos e semanas com distribuicao de verdade (pra nao oferecer opcoes vazias no slicer)
  const anosComDados = useMemo(() => {
    const anos = new Set<number>();
    distribuicoes.forEach(d => { const s = segundaDaSemana(d.weekId); if (!isNaN(s.getTime())) anos.add(s.getFullYear()); });
    anos.add(new Date().getFullYear());
    return Array.from(anos).sort((a, b) => b - a);
  }, [distribuicoes]);

  // Todas as semanas do ano (nao so as que ja tem distribuicao real) - semanas sem dados entram
  // com temDados=false, pra oferecer a opcao mesmo assim (o percentual geral estima o total
  // esperado pra elas em vez de mostrar 0 tarefas).
  const semanasDoAno = useMemo(() => {
    return segundasDoAno(anoRanking)
      .map(segunda => {
        const weekId = weekIdDaSegunda(segunda);
        return { weekId, segunda, temDados: distribuicoes.some(d => d.weekId === weekId) };
      })
      .sort((a, b) => b.segunda.getTime() - a.segunda.getTime());
  }, [distribuicoes, anoRanking]);

  // Semana selecionada default: a mais recente do ano escolhido QUE TEM DADOS (senao a mais
  // recente de qualquer jeito), assim que a lista carrega
  useEffect(() => {
    if (semanaRanking || semanasDoAno.length === 0) return;
    const comDados = semanasDoAno.find(w => w.temDados);
    setSemanaRanking((comDados || semanasDoAno[0]).weekId);
  }, [semanasDoAno, semanaRanking]);

  // Percentual geral de conclusao no periodo selecionado - soma tudo (todos os moradores juntos).
  // Semanas sem distribuicao real entram com um total ESTIMADO a partir da recorrencia das
  // tarefas cadastradas (0 concluidas, ja que nada foi distribuido ainda).
  const percentualGeral = useMemo(() => {
    let semanasAlvo: Date[] = [];
    if (granularidadeRanking === 'semana') {
      const segunda = segundaDaSemana(semanaRanking);
      if (!isNaN(segunda.getTime())) semanasAlvo = [segunda];
    } else if (granularidadeRanking === 'mes') {
      semanasAlvo = segundasDoMes(anoRanking, mesRanking);
    } else {
      semanasAlvo = segundasDoAno(anoRanking);
    }

    let total = 0;
    let concluidas = 0;
    let temEstimativa = false;

    semanasAlvo.forEach(segunda => {
      const weekId = weekIdDaSegunda(segunda);
      const dist = distribuicoes.find(d => d.weekId === weekId);
      if (dist) {
        dist.atribuicoes.forEach(a => {
          total++;
          if (a.status === 'concluida' || a.status === 'concluída') concluidas++;
        });
      } else {
        const estimativa = estimarTarefasSemana(tarefasBase, weekId);
        if (estimativa > 0) { total += estimativa; temEstimativa = true; }
      }
    });

    return {
      total,
      concluidas,
      pct: total > 0 ? Math.round((concluidas / total) * 1000) / 10 : 0,
      temEstimativa,
    };
  }, [distribuicoes, tarefasBase, granularidadeRanking, anoRanking, mesRanking, semanaRanking]);

  const rankingMoradores = useMemo(() => {
    const distsFiltradas = distribuicoes.filter(dist => {
      const segunda = segundaDaSemana(dist.weekId);
      if (isNaN(segunda.getTime())) return false;
      if (granularidadeRanking === 'semana') return dist.weekId === semanaRanking;
      if (granularidadeRanking === 'mes') return segunda.getFullYear() === anoRanking && segunda.getMonth() === mesRanking;
      return segunda.getFullYear() === anoRanking;
    });

    const porMorador: Record<string, { total: number; concluidas: number }> = {};
    distsFiltradas.forEach(dist => {
      dist.atribuicoes.forEach(a => {
        if (!a.responsavelNome) return;
        if (!porMorador[a.responsavelNome]) porMorador[a.responsavelNome] = { total: 0, concluidas: 0 };
        porMorador[a.responsavelNome].total++;
        if (a.status === 'concluida' || a.status === 'concluída') porMorador[a.responsavelNome].concluidas++;
      });
    });

    const linhas = Object.entries(porMorador).map(([nome, v]) => ({
      nome,
      total: v.total,
      concluidas: v.concluidas,
      naoConcluidas: v.total - v.concluidas,
      pctNaoConcluidas: v.total > 0 ? Math.round(((v.total - v.concluidas) / v.total) * 1000) / 10 : 0,
      pctConcluidas: v.total > 0 ? Math.round((v.concluidas / v.total) * 1000) / 10 : 0,
    }));

    return visaoRanking === 'menos'
      ? [...linhas].sort((a, b) => b.pctNaoConcluidas - a.pctNaoConcluidas)
      : [...linhas].sort((a, b) => b.pctConcluidas - a.pctConcluidas);
  }, [distribuicoes, granularidadeRanking, anoRanking, mesRanking, semanaRanking, visaoRanking]);

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

        {/* Ranking de Moradores */}
        <section className="space-y-stack-md">
          <h3 className="text-section-heading font-section-heading text-on-surface">Ranking de Moradores</h3>

          {/* Toggle de visao */}
          <div className="flex bg-surface-container-low rounded-xl p-1 border border-outline-variant/50">
            <button
              onClick={() => setVisaoRanking('menos')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${visaoRanking === 'menos' ? 'bg-error/20 text-error' : 'text-on-surface-variant'}`}
            >
              Quem menos concluiu
            </button>
            <button
              onClick={() => setVisaoRanking('mais')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${visaoRanking === 'mais' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant'}`}
            >
              Quem mais concluiu
            </button>
          </div>

          {/* Slicer: granularidade + ano + (semana ou mes) */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex bg-surface-container-low rounded-lg p-1 border border-outline-variant/50">
              {(['semana', 'mes', 'ano'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setGranularidadeRanking(g)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold capitalize transition-all ${granularidadeRanking === g ? 'bg-page-ciclos/25 text-page-ciclos' : 'text-on-surface-variant'}`}
                >
                  {g === 'mes' ? 'Mês' : g}
                </button>
              ))}
            </div>

            <select
              value={anoRanking}
              onChange={e => { setAnoRanking(parseInt(e.target.value, 10)); setSemanaRanking(''); }}
              className="bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-1.5 px-2 text-xs"
            >
              {anosComDados.map(a => <option key={a} value={a}>{a}</option>)}
            </select>

            {granularidadeRanking === 'mes' && (
              <select
                value={mesRanking}
                onChange={e => setMesRanking(parseInt(e.target.value, 10))}
                className="bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-1.5 px-2 text-xs"
              >
                {MESES_RANKING.map((nome, i) => <option key={i} value={i}>{nome}</option>)}
              </select>
            )}

            {granularidadeRanking === 'semana' && (
              <select
                value={semanaRanking}
                onChange={e => setSemanaRanking(e.target.value)}
                className="bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-1.5 px-2 text-xs"
              >
                {semanasDoAno.map(({ weekId, segunda, temDados }) => {
                  const domingo = new Date(segunda); domingo.setDate(domingo.getDate() + 6);
                  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                  return <option key={weekId} value={weekId}>{fmt(segunda)} - {fmt(domingo)}{temDados ? '' : ' (estimado)'}</option>;
                })}
              </select>
            )}
          </div>

          {/* Percentual geral do periodo - soma todos os moradores */}
          <div className="glass-card rounded-xl p-4 space-y-2">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-label-sm font-bold text-on-surface-variant uppercase">Concluído no período</p>
                <p className="text-[10px] text-on-surface-variant">
                  {percentualGeral.concluidas} de {percentualGeral.total} tarefa{percentualGeral.total === 1 ? '' : 's'}
                  {percentualGeral.temEstimativa ? ' (algumas semanas ainda não distribuídas - total estimado)' : ''}
                </p>
              </div>
              <p className="text-3xl font-bold text-page-ciclos">{percentualGeral.pct}%</p>
            </div>
            <div className="h-2.5 rounded-full bg-surface-container-low overflow-hidden">
              <div
                className="h-full rounded-full bg-page-ciclos transition-all"
                style={{ width: `${Math.min(100, percentualGeral.pct)}%` }}
              />
            </div>
          </div>

          {/* Grafico */}
          <div className="glass-card rounded-xl p-4">
            {rankingMoradores.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-8">Nenhuma tarefa distribuída nesse período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, rankingMoradores.length * 44)}>
                <BarChart data={rankingMoradores} layout="vertical" margin={{ top: 4, right: 28, left: 4, bottom: 4 }}>
                  <XAxis type="number" hide domain={[0, 100]} />
                  <YAxis type="category" dataKey="nome" width={90} tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'var(--color-surface-container-low)' }}
                    contentStyle={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-outline-variant)', borderRadius: 8, fontSize: 12 }}
                    formatter={(_value: number, _name: string, item: any) => {
                      const linha = item.payload;
                      return visaoRanking === 'menos'
                        ? [`${linha.pctNaoConcluidas}% (${linha.naoConcluidas}/${linha.total})`, 'Não concluídas']
                        : [`${linha.pctConcluidas}% (${linha.concluidas}/${linha.total})`, 'Concluídas'];
                    }}
                  />
                  <Bar
                    dataKey={visaoRanking === 'menos' ? 'pctNaoConcluidas' : 'pctConcluidas'}
                    fill={visaoRanking === 'menos' ? 'var(--color-error)' : 'var(--color-primary)'}
                    radius={[0, 6, 6, 0]}
                    barSize={22}
                  >
                    <LabelList
                      dataKey={visaoRanking === 'menos' ? 'pctNaoConcluidas' : 'pctConcluidas'}
                      position="right"
                      formatter={(v: number) => `${v}%`}
                      style={{ fill: 'var(--color-on-surface)', fontSize: 11, fontWeight: 700 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
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
