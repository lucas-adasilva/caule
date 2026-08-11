import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TopAppBar } from '@/components/TopAppBar';
import { UserAvatar } from '@/components/UserAvatar';
import { useApp } from '@/App';
import { useAuthStore } from '@/stores/authStore';
import { buscarMoradoresEmViagem } from '@/utils/viagens';
import { formatPhoneCompleto } from '@/utils/formatters';
import type { Hospedagem } from '@/utils/hospedagem';

type Pronome = 'ela' | 'ele' | 'elu';

interface Pessoa {
  uid: string;
  name: string;
  photoURL?: string;
  phone?: string;
  role: string;
  pronome?: Pronome;
}

interface ComodoHospede {
  id: string;
  nome: string;
  icone: string;
}

interface ReservaFutura {
  id: string;
  casaId: string;
  hospedeNome: string;
  chegada: string; // YYYY-MM-DD
  saida: string; // YYYY-MM-DD (exclusiva, mesma convencao de Hospedagem: ultima noite e saida - 1 dia)
  comodoId: string;
  comodoNome: string;
  comodoIcone: string;
  createdBy: string;
}

function estadiaAtiva(estadiaInicio?: string, estadiaFim?: string): boolean {
  if (!estadiaInicio || !estadiaFim) return false;
  const hoje = new Date().toISOString().split('T')[0];
  return estadiaInicio <= hoje && estadiaFim > hoje;
}

// Mesma concordancia de genero por pronome usada no cadastro (CadastroPage.tsx)
function rotuloPessoa(pessoa: Pessoa): string {
  if (pessoa.role === 'hospede') return 'Hóspede';
  if (pessoa.pronome === 'ela') return 'Moradora';
  if (pessoa.pronome === 'elu') return 'Moradore';
  return 'Morador';
}

const FAIXA_LABEL: Record<string, string> = { minimo: 'Mínima', ideal: 'Ideal', abundante: 'Abundante' };

function calcularDias(chegada: string, saida: string): number {
  const d1 = new Date(chegada + 'T00:00:00');
  const d2 = new Date(saida + 'T00:00:00');
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000));
}

// Quantos dias da estadia (chegada inclusive, saida exclusive - mesma convencao de calcularDias)
// caem dentro do mes/ano informado. Uma estadia que atravessa a virada do mes conta os dias de
// cada mes separadamente (ex: chegada 28/07, saida 03/08 -> 4 dias em julho, 2 dias em agosto).
function diasNoMes(chegada: string, saida: string, ano: number, mes: number): number {
  const inicio = new Date(chegada + 'T00:00:00');
  const fimExclusivo = new Date(saida + 'T00:00:00');
  const mesInicio = new Date(ano, mes, 1);
  const mesFimExclusivo = new Date(ano, mes + 1, 1);
  const rangeInicio = inicio > mesInicio ? inicio : mesInicio;
  const rangeFim = fimExclusivo < mesFimExclusivo ? fimExclusivo : mesFimExclusivo;
  return Math.max(0, Math.round((rangeFim.getTime() - rangeInicio.getTime()) / 86400000));
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA_CAL = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function formatDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Grade do mes (domingo primeiro, com dias de padding do mes anterior/seguinte pra completar semanas)
function getDiasDoMesCalendario(referencia: Date): { data: Date; noMesAtual: boolean }[] {
  const ano = referencia.getFullYear();
  const mes = referencia.getMonth();
  const primeiroDiaMes = new Date(ano, mes, 1);
  const ultimoDiaMes = new Date(ano, mes + 1, 0);
  const diaSemanaPrimeiro = primeiroDiaMes.getDay(); // Dom=0

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

function PessoaCard({ pessoa }: { pessoa: Pessoa }) {
  const telefone = pessoa.phone ? pessoa.phone.replace(/\D/g, '') : '';
  // Sem o "+55" pra caber no card - o link do WhatsApp usa o numero completo de qualquer forma.
  const telefoneCurto = formatPhoneCompleto(pessoa.phone || '').replace(/^\+55\s*/, '');
  return (
    <div className="flex flex-col items-center gap-1 w-24 text-center">
      <UserAvatar photoURL={pessoa.photoURL} name={pessoa.name} size={56} showPresence={false} />
      <span className="text-xs font-bold text-on-surface truncate w-full">{pessoa.name.split(' ')[0]}</span>
      <span className="text-[9px] text-page-ramos leading-none">{rotuloPessoa(pessoa)}</span>
      {telefone ? (
        <a
          href={`https://wa.me/${telefone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 w-full text-[9px] text-on-surface-variant hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[11px] flex-shrink-0">call</span>
          <span className="truncate min-w-0">{telefoneCurto}</span>
        </a>
      ) : (
        <span className="text-[9px] text-on-surface-variant">Sem contato</span>
      )}
    </div>
  );
}

export function UsersPage() {
  const { openMenu, openNotifications } = useApp();
  const { user } = useAuthStore();
  const [presentes, setPresentes] = useState<Pessoa[]>([]);
  const [viajando, setViajando] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [historico, setHistorico] = useState<Hospedagem[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(true);
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [reembolsandoMes, setReembolsandoMes] = useState(false);
  const [comodosHospedes, setComodosHospedes] = useState<ComodoHospede[]>([]);
  const [reservas, setReservas] = useState<ReservaFutura[]>([]);
  const [loadingReservas, setLoadingReservas] = useState(true);
  const [comodosReserva, setComodosReserva] = useState<ComodoHospede[]>([]);
  const [mesReferenciaReserva, setMesReferenciaReserva] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [modalReservaOpen, setModalReservaOpen] = useState(false);
  const [salvandoReserva, setSalvandoReserva] = useState(false);
  const [erroReserva, setErroReserva] = useState('');
  const [formReserva, setFormReserva] = useState({ hospedeNome: '', chegada: '', saida: '', comodoId: '' });

  async function carregarDados() {
    if (!user?.houseId) { setLoading(false); return; }
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), where('houseId', '==', user.houseId));
      const snap = await getDocs(q);
      const moradores: Pessoa[] = [];
      const moradoresPresentes: Pessoa[] = [];
      const hospedesPresentes: Pessoa[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.isActive === false) return;
        const pessoa: Pessoa = { uid: d.id, name: data.name || 'Sem nome', photoURL: data.photoURL || '', phone: data.phone || '', role: data.role || 'hospede', pronome: data.pronome };
        if (pessoa.role === 'hospede') {
          if (estadiaAtiva(data.estadiaInicio, data.estadiaFim)) hospedesPresentes.push(pessoa);
          // hospede sem estadia ativa nao aparece em lugar nenhum
        } else {
          moradores.push(pessoa);
          if (data.isPresent !== false) moradoresPresentes.push(pessoa);
        }
      });

      const uidsEmViagem = await buscarMoradoresEmViagem(moradores.map(m => m.uid));
      setViajando(moradores.filter(m => uidsEmViagem.has(m.uid)));
      setPresentes([...moradoresPresentes.filter(m => !uidsEmViagem.has(m.uid)), ...hospedesPresentes]);
    } catch (e) { console.error('[Moradores] Erro ao carregar:', e); }
    setLoading(false);
  }

  async function carregarHistorico() {
    if (!user?.houseId) { setLoadingHistorico(false); return; }
    setLoadingHistorico(true);
    try {
      const q = query(collection(db, 'hospedagens'), where('casaId', '==', user.houseId));
      const snap = await getDocs(q);
      const itens: Hospedagem[] = [];
      snap.forEach(d => itens.push({ id: d.id, ...d.data() } as Hospedagem));
      itens.sort((a, b) => b.chegada.localeCompare(a.chegada));
      setHistorico(itens);
    } catch (e) { console.error('[Moradores] Erro ao carregar histórico de hospedagem:', e); }
    setLoadingHistorico(false);
  }

  async function carregarComodosHospedes() {
    if (!user?.houseId) return;
    try {
      const q = query(collection(db, 'comodos'), where('casaId', '==', user.houseId));
      const snap = await getDocs(q);
      const coms: ComodoHospede[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.tipo === 'privado' && data.aceitaHospedes === true) coms.push({ id: d.id, nome: data.nome || 'Cômodo', icone: data.icone || '🏠' });
      });
      setComodosHospedes(coms);
    } catch (e) { console.error('[Moradores] Erro ao carregar cômodos:', e); }
  }

  async function carregarReservas() {
    if (!user?.houseId) { setLoadingReservas(false); return; }
    setLoadingReservas(true);
    try {
      const q = query(collection(db, 'reservasFuturas'), where('casaId', '==', user.houseId));
      const snap = await getDocs(q);
      const itens: ReservaFutura[] = [];
      snap.forEach(d => itens.push({ id: d.id, ...d.data() } as ReservaFutura));
      itens.sort((a, b) => a.chegada.localeCompare(b.chegada));
      setReservas(itens);
    } catch (e) { console.error('[Moradores] Erro ao carregar reservas futuras:', e); }
    setLoadingReservas(false);
  }

  // Comodos pra reserva futura: coletivos e privados, desde que aceitem hospedes - diferente do
  // combo do historico de hospedagem (comodosHospedes acima), que so lista privados.
  async function carregarComodosReserva() {
    if (!user?.houseId) return;
    try {
      const q = query(collection(db, 'comodos'), where('casaId', '==', user.houseId));
      const snap = await getDocs(q);
      const coms: ComodoHospede[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.aceitaHospedes === true) coms.push({ id: d.id, nome: data.nome || 'Cômodo', icone: data.icone || '🏠' });
      });
      setComodosReserva(coms);
    } catch (e) { console.error('[Moradores] Erro ao carregar cômodos para reserva:', e); }
  }

  useEffect(() => { carregarDados(); }, [user?.houseId]);
  useEffect(() => { carregarHistorico(); }, [user?.houseId]);
  useEffect(() => { carregarComodosHospedes(); }, [user?.houseId]);
  useEffect(() => { carregarReservas(); }, [user?.houseId]);
  useEffect(() => { carregarComodosReserva(); }, [user?.houseId]);

  async function togglePagamento(item: Hospedagem) {
    setHistorico(prev => prev.map(h => h.id === item.id ? { ...h, statusPagamento: !h.statusPagamento } : h));
    try { await updateDoc(doc(db, 'hospedagens', item.id), { statusPagamento: !item.statusPagamento }); }
    catch (e) {
      console.error('[Moradores] Erro ao atualizar pagamento:', e);
      setHistorico(prev => prev.map(h => h.id === item.id ? { ...h, statusPagamento: item.statusPagamento } : h));
    }
  }

  async function toggleReembolso(item: Hospedagem) {
    setHistorico(prev => prev.map(h => h.id === item.id ? { ...h, statusReembolso: !h.statusReembolso } : h));
    try { await updateDoc(doc(db, 'hospedagens', item.id), { statusReembolso: !item.statusReembolso }); }
    catch (e) {
      console.error('[Moradores] Erro ao atualizar reembolso:', e);
      setHistorico(prev => prev.map(h => h.id === item.id ? { ...h, statusReembolso: item.statusReembolso } : h));
    }
  }

  // Edicao direta na tabela - atualiza local pra resposta imediata e grava no Firestore.
  // "Dias" e "Contribuicao Total" nunca sao gravados, sao sempre calculados na hora de exibir.
  function atualizarCampoLocal<K extends keyof Hospedagem>(id: string, campo: K, valor: Hospedagem[K]) {
    setHistorico(prev => prev.map(h => h.id === id ? { ...h, [campo]: valor } : h));
  }

  async function salvarCampo<K extends keyof Hospedagem>(id: string, campo: K, valor: Hospedagem[K]) {
    try { await updateDoc(doc(db, 'hospedagens', id), { [campo]: valor, updatedAt: serverTimestamp() }); }
    catch (e) { console.error('[Moradores] Erro ao salvar campo do histórico:', e); }
  }

  async function adicionarLinhaHistorico() {
    if (!user?.houseId) return;
    const hoje = new Date().toISOString().split('T')[0];
    const novo = {
      casaId: user.houseId,
      hospedeUid: '',
      hospedeNome: 'Novo hóspede',
      responsavelUid: '',
      responsavelNome: '',
      chegada: hoje,
      saida: hoje,
      dormitorio: '',
      faixaContribuicao: 'minimo' as const,
      valorContribuicao: 0,
      statusPagamento: false,
      statusReembolso: false,
      createdAt: serverTimestamp(),
    };
    try {
      const ref = await addDoc(collection(db, 'hospedagens'), novo);
      setHistorico(prev => [{ id: ref.id, ...novo, createdAt: undefined }, ...prev]);
    } catch (e) { console.error('[Moradores] Erro ao adicionar linha:', e); }
  }

  async function excluirLinhaHistorico(item: Hospedagem) {
    if (!confirm(`Excluir o registro de hospedagem de ${item.hospedeNome || 'hóspede sem nome'}?`)) return;
    setHistorico(prev => prev.filter(h => h.id !== item.id));
    try { await deleteDoc(doc(db, 'hospedagens', item.id)); }
    catch (e) {
      console.error('[Moradores] Erro ao excluir linha:', e);
      setHistorico(prev => [...prev, item].sort((a, b) => b.chegada.localeCompare(a.chegada)));
    }
  }

  function abrirModalReserva() {
    setFormReserva({ hospedeNome: '', chegada: '', saida: '', comodoId: '' });
    setErroReserva('');
    setModalReservaOpen(true);
  }

  function fecharModalReserva() {
    setModalReservaOpen(false);
    setErroReserva('');
  }

  async function handleSalvarReserva() {
    if (!user?.houseId) return;
    if (!formReserva.hospedeNome.trim()) { setErroReserva('Informe o nome do hóspede'); return; }
    if (!formReserva.chegada || !formReserva.saida) { setErroReserva('Informe as datas de entrada e saída'); return; }
    if (formReserva.saida <= formReserva.chegada) { setErroReserva('A data de saída precisa ser depois da entrada'); return; }
    if (!formReserva.comodoId) { setErroReserva('Selecione o cômodo'); return; }
    const comodo = comodosReserva.find(c => c.id === formReserva.comodoId);
    if (!comodo) { setErroReserva('Cômodo inválido'); return; }
    setSalvandoReserva(true);
    setErroReserva('');
    try {
      const novo = {
        casaId: user.houseId,
        hospedeNome: formReserva.hospedeNome.trim(),
        chegada: formReserva.chegada,
        saida: formReserva.saida,
        comodoId: comodo.id,
        comodoNome: comodo.nome,
        comodoIcone: comodo.icone,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'reservasFuturas'), novo);
      setReservas(prev => [...prev, { id: ref.id, ...novo, createdAt: undefined }].sort((a, b) => a.chegada.localeCompare(b.chegada)));
      setModalReservaOpen(false);
    } catch (e) { console.error('[Moradores] Erro ao salvar reserva futura:', e); setErroReserva('Erro ao salvar. Tente novamente.'); }
    setSalvandoReserva(false);
  }

  async function excluirReserva(item: ReservaFutura) {
    if (!confirm(`Excluir a reserva de ${item.hospedeNome}?`)) return;
    setReservas(prev => prev.filter(r => r.id !== item.id));
    try { await deleteDoc(doc(db, 'reservasFuturas', item.id)); }
    catch (e) {
      console.error('[Moradores] Erro ao excluir reserva futura:', e);
      setReservas(prev => [...prev, item].sort((a, b) => a.chegada.localeCompare(b.chegada)));
    }
  }

  function mesReservaAnterior() { setMesReferenciaReserva(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; }); }
  function mesReservaSeguinte() { setMesReferenciaReserva(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; }); }

  // Reservas cuja estadia (chegada inclusive, saida exclusive) cobre o dia informado.
  function reservasNoDia(data: Date): ReservaFutura[] {
    const dataStr = formatDateLocal(data);
    return reservas.filter(r => r.chegada <= dataStr && dataStr < r.saida);
  }

  const diasCalendarioReserva = useMemo(() => getDiasDoMesCalendario(mesReferenciaReserva), [mesReferenciaReserva]);

  // Linhas que contam pro mes/ano selecionado: precisam ter algum dia dentro do mes E estarem
  // marcadas como pagas (regra explicita - reembolso e o total so consideram quem ja pagou).
  const linhasDoMes = useMemo(() => {
    return historico
      .map(item => ({ item, dias: diasNoMes(item.chegada, item.saida, anoSelecionado, mesSelecionado) }))
      .filter(({ item, dias }) => dias > 0 && item.statusPagamento);
  }, [historico, anoSelecionado, mesSelecionado]);

  const resumoMes = useMemo(() => {
    const hospedesDistintos = new Set(linhasDoMes.map(({ item }) => item.hospedeUid || item.hospedeNome));
    const totalContribuicao = linhasDoMes.reduce((soma, { item, dias }) => soma + dias * (item.valorContribuicao ?? 0), 0);
    return { hospedes: hospedesDistintos.size, total: totalContribuicao };
  }, [linhasDoMes]);

  async function reembolsarMes() {
    if (linhasDoMes.length === 0) return;
    if (!confirm(`Marcar como reembolsadas as ${linhasDoMes.length} linha(s) que contam pra ${MESES[mesSelecionado]}/${anoSelecionado}?`)) return;
    setReembolsandoMes(true);
    const idsAlvo = new Set(linhasDoMes.map(({ item }) => item.id));
    setHistorico(prev => prev.map(h => idsAlvo.has(h.id) ? { ...h, statusReembolso: true } : h));
    try {
      await Promise.all(linhasDoMes.map(({ item }) => updateDoc(doc(db, 'hospedagens', item.id), { statusReembolso: true, updatedAt: serverTimestamp() })));
    } catch (e) {
      console.error('[Moradores] Erro ao reembolsar mês:', e);
    }
    setReembolsandoMes(false);
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body-md pb-32">
      <TopAppBar
        onMenuClick={openMenu}
        onNotificationClick={openNotifications}
        title="Moradores"
        titleColor="text-page-ramos" />

      <main className="px-margin-page pb-8">
        <section className="mt-6 mb-8">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-page-ramos">Ramos</h2>
          <p className="font-body-md text-text-muted">Quem está na casa agora</p>
        </section>

        {loading ? (
          <div className="flex justify-center py-8"><span className="material-symbols-outlined animate-spin text-page-ramos text-3xl">refresh</span></div>
        ) : (
          <div className="space-y-8">
            <section>
              <h3 className="text-section-heading font-bold text-on-surface mb-3">Presentes agora</h3>
              {presentes.length === 0 ? (
                <p className="text-sm text-text-muted">Ninguém presente no momento.</p>
              ) : (
                <div className="flex flex-wrap gap-4">
                  {presentes.map(p => <PessoaCard key={p.uid} pessoa={p} />)}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-section-heading font-bold text-on-surface mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">flight</span>
                Viajando
              </h3>
              {viajando.length === 0 ? (
                <p className="text-sm text-text-muted">Ninguém viajando no momento.</p>
              ) : (
                <div className="flex flex-wrap gap-4">
                  {viajando.map(p => <PessoaCard key={p.uid} pessoa={p} />)}
                </div>
              )}
            </section>

            {user?.role !== 'hospede' && (
              <>
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-section-heading font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">event_upcoming</span>
                    Reservas Futuras
                  </h3>
                  <button
                    onClick={abrirModalReserva}
                    className="w-9 h-9 rounded-full bg-page-ramos text-white flex items-center justify-center shadow hover:brightness-110 active:scale-90 transition-all flex-shrink-0"
                    title="Nova reserva futura"
                  >
                    <span className="material-symbols-outlined text-xl">add</span>
                  </button>
                </div>

                {/* Calendario mensal */}
                <div className="glass-card rounded-xl p-3 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={mesReservaAnterior} className="material-symbols-outlined text-on-surface-variant p-1 hover:bg-surface-variant rounded transition-colors">chevron_left</button>
                    <h4 className="font-section-heading text-body-md text-on-surface capitalize">{mesReferenciaReserva.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h4>
                    <button onClick={mesReservaSeguinte} className="material-symbols-outlined text-on-surface-variant p-1 hover:bg-surface-variant rounded transition-colors">chevron_right</button>
                  </div>

                  <div className="grid grid-cols-7 mb-1 text-center">
                    {DIAS_SEMANA_CAL.map((d, i) => <span key={i} className="text-[10px] font-bold text-on-surface-variant opacity-60">{d}</span>)}
                  </div>

                  {loadingReservas ? (
                    <div className="flex justify-center py-6"><span className="material-symbols-outlined animate-spin text-page-ramos text-2xl">refresh</span></div>
                  ) : (
                    <div className="grid grid-cols-7 gap-1">
                      {diasCalendarioReserva.map(({ data, noMesAtual }, idx) => {
                        const isHoje = data.toDateString() === new Date().toDateString();
                        const reservasDoDia = noMesAtual ? reservasNoDia(data) : [];
                        return (
                          <div
                            key={idx}
                            className={`min-h-[4.5rem] rounded-lg p-1 flex flex-col gap-0.5 ${
                              !noMesAtual
                                ? 'opacity-20'
                                : isHoje
                                ? 'bg-page-ramos/10 ring-1 ring-page-ramos'
                                : 'bg-surface-container/50'
                            }`}
                          >
                            <span className={`text-[10px] leading-none ${isHoje ? 'font-bold text-page-ramos' : 'text-on-surface-variant'}`}>{data.getDate()}</span>
                            <div className="flex flex-col gap-0.5 overflow-hidden">
                              {reservasDoDia.slice(0, 2).map(r => (
                                <span key={r.id} className="text-[8px] leading-tight font-bold text-page-ramos bg-page-ramos/15 rounded px-0.5 py-px truncate" title={r.hospedeNome}>
                                  {r.hospedeNome.split(' ')[0]}
                                </span>
                              ))}
                              {reservasDoDia.length > 2 && (
                                <span className="text-[8px] leading-none text-on-surface-variant">+{reservasDoDia.length - 2}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Tabela de reservas futuras */}
                {!loadingReservas && (
                  reservas.length === 0 ? (
                    <p className="text-sm text-text-muted mb-2">Nenhuma reserva futura cadastrada ainda.</p>
                  ) : (
                    <div className="overflow-x-auto -mx-margin-page px-margin-page mb-2">
                      <table className="w-full text-xs border-collapse min-w-[520px]">
                        <thead>
                          <tr className="text-left text-page-ramos border-b border-outline-variant">
                            <th className="py-2 pr-3 font-bold">Hóspede</th>
                            <th className="py-2 pr-3 font-bold">Entrada</th>
                            <th className="py-2 pr-3 font-bold">Saída</th>
                            <th className="py-2 pr-3 font-bold">Cômodo</th>
                            <th className="py-2 pr-1 font-bold text-center"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {reservas.map(item => (
                            <tr key={item.id} className="border-b border-outline-variant/50">
                              <td className="py-2 pr-3 text-on-surface font-bold">{item.hospedeNome}</td>
                              <td className="py-2 pr-3 text-on-surface-variant">{new Date(item.chegada + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                              <td className="py-2 pr-3 text-on-surface-variant">{new Date(item.saida + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                              <td className="py-2 pr-3 text-on-surface-variant">{item.comodoIcone} {item.comodoNome}</td>
                              <td className="py-2 pr-1 text-center">
                                <button
                                  onClick={() => excluirReserva(item)}
                                  className="w-6 h-6 rounded-md flex items-center justify-center text-error/70 hover:bg-error/10 hover:text-error transition-colors"
                                  title="Excluir reserva"
                                >
                                  <span className="material-symbols-outlined text-[16px]">delete</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </section>

              <section>
                <h3 className="text-section-heading font-bold text-on-surface mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">history</span>
                  Histórico de Hospedagem
                </h3>

                {/* Resumo do mes + slicer de mes/ano */}
                <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-surface-card rounded-xl border border-outline-variant">
                  <div className="flex gap-4 flex-1 min-w-[180px]">
                    <div>
                      <p className="text-[10px] uppercase text-on-surface-variant font-bold">Hóspedes</p>
                      <p className="text-xl font-bold text-page-ramos">{resumoMes.hospedes}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-on-surface-variant font-bold">Contribuição total</p>
                      <p className="text-xl font-bold text-page-ramos">R$ {resumoMes.total.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={mesSelecionado}
                      onChange={e => setMesSelecionado(parseInt(e.target.value, 10))}
                      className="bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-1.5 px-2 text-xs"
                    >
                      {MESES.map((nome, i) => <option key={i} value={i}>{nome}</option>)}
                    </select>
                    <select
                      value={anoSelecionado}
                      onChange={e => setAnoSelecionado(parseInt(e.target.value, 10))}
                      className="bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-1.5 px-2 text-xs"
                    >
                      {[anoSelecionado - 1, anoSelecionado, anoSelecionado + 1].map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>

                {/* Acoes */}
                <div className="flex items-center gap-4 mb-3">
                  <button
                    onClick={adicionarLinhaHistorico}
                    className="flex items-center gap-1 text-[11px] font-bold text-page-ramos hover:brightness-110 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                    Nova linha
                  </button>
                  <button
                    onClick={reembolsarMes}
                    disabled={reembolsandoMes || linhasDoMes.length === 0}
                    className="flex items-center gap-1 text-[11px] font-bold text-tertiary hover:brightness-110 transition-all disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[16px]">currency_exchange</span>
                    {reembolsandoMes ? 'Reembolsando...' : `Reembolsar ${MESES[mesSelecionado]}`}
                  </button>
                </div>

                {loadingHistorico ? (
                  <div className="flex justify-center py-6"><span className="material-symbols-outlined animate-spin text-page-ramos text-2xl">refresh</span></div>
                ) : historico.length === 0 ? (
                  <p className="text-sm text-text-muted">Nenhuma hospedagem registrada ainda.</p>
                ) : (
                  <div className="overflow-x-auto -mx-margin-page px-margin-page">
                    <table className="w-full text-xs border-collapse min-w-[920px]">
                      <thead>
                        <tr className="text-left text-page-ramos border-b border-outline-variant">
                          <th className="py-2 pr-3 font-bold">Hóspede</th>
                          <th className="py-2 pr-3 font-bold">Responsável</th>
                          <th className="py-2 pr-3 font-bold">Chegada</th>
                          <th className="py-2 pr-3 font-bold">Saída</th>
                          <th className="py-2 pr-3 font-bold text-center">Dias</th>
                          <th className="py-2 pr-3 font-bold">Dormitório</th>
                          <th className="py-2 pr-3 font-bold">Faixa</th>
                          <th className="py-2 pr-3 font-bold">Contribuição por dia</th>
                          <th className="py-2 pr-3 font-bold">Contribuição Total</th>
                          <th className="py-2 pr-3 font-bold text-center">Pagamento</th>
                          <th className="py-2 pr-3 font-bold text-center">Reembolso</th>
                          <th className="py-2 pr-1 font-bold text-center"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {historico.map(item => {
                          const dias = calcularDias(item.chegada, item.saida);
                          const total = dias * (item.valorContribuicao ?? 0);
                          return (
                            <tr key={item.id} className="border-b border-outline-variant/50">
                              <td className="py-1 pr-3">
                                <input
                                  defaultValue={item.hospedeNome}
                                  onChange={e => atualizarCampoLocal(item.id, 'hospedeNome', e.target.value)}
                                  onBlur={e => salvarCampo(item.id, 'hospedeNome', e.target.value)}
                                  className="w-28 bg-transparent text-on-surface font-bold border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                />
                              </td>
                              <td className="py-1 pr-3">
                                <input
                                  defaultValue={item.responsavelNome}
                                  onChange={e => atualizarCampoLocal(item.id, 'responsavelNome', e.target.value)}
                                  onBlur={e => salvarCampo(item.id, 'responsavelNome', e.target.value)}
                                  className="w-28 bg-transparent text-on-surface-variant border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                />
                              </td>
                              <td className="py-1 pr-3">
                                <input
                                  type="date"
                                  defaultValue={item.chegada}
                                  onChange={e => { atualizarCampoLocal(item.id, 'chegada', e.target.value); salvarCampo(item.id, 'chegada', e.target.value); }}
                                  className="w-32 bg-transparent text-on-surface-variant border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                />
                              </td>
                              <td className="py-1 pr-3">
                                <input
                                  type="date"
                                  defaultValue={item.saida}
                                  onChange={e => { atualizarCampoLocal(item.id, 'saida', e.target.value); salvarCampo(item.id, 'saida', e.target.value); }}
                                  className="w-32 bg-transparent text-on-surface-variant border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                />
                              </td>
                              <td className="py-2 pr-3 text-on-surface-variant text-center font-bold">{dias}</td>
                              <td className="py-1 pr-3">
                                <select
                                  value={comodosHospedes.some(c => c.nome === item.dormitorio) ? item.dormitorio : ''}
                                  onChange={e => { atualizarCampoLocal(item.id, 'dormitorio', e.target.value); salvarCampo(item.id, 'dormitorio', e.target.value); }}
                                  className="w-28 bg-transparent text-on-surface-variant border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                >
                                  <option value="">Selecione</option>
                                  {item.dormitorio && !comodosHospedes.some(c => c.nome === item.dormitorio) && (
                                    <option value={item.dormitorio}>{item.dormitorio} (antigo)</option>
                                  )}
                                  {comodosHospedes.map(c => <option key={c.id} value={c.nome}>{c.icone} {c.nome}</option>)}
                                </select>
                              </td>
                              <td className="py-1 pr-3">
                                <select
                                  value={item.faixaContribuicao}
                                  onChange={e => { const v = e.target.value as Hospedagem['faixaContribuicao']; atualizarCampoLocal(item.id, 'faixaContribuicao', v); salvarCampo(item.id, 'faixaContribuicao', v); }}
                                  className="bg-transparent text-on-surface-variant border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                >
                                  {Object.entries(FAIXA_LABEL).map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
                                </select>
                              </td>
                              <td className="py-1 pr-3">
                                <div className="flex items-center gap-0.5 text-on-surface-variant">
                                  R$
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    defaultValue={item.valorContribuicao ?? 0}
                                    onChange={e => atualizarCampoLocal(item.id, 'valorContribuicao', parseFloat(e.target.value) || 0)}
                                    onBlur={e => salvarCampo(item.id, 'valorContribuicao', parseFloat(e.target.value) || 0)}
                                    className="w-16 bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                  />
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-on-surface font-bold whitespace-nowrap">R$ {total.toFixed(2)}</td>
                              <td className="py-2 pr-3 text-center">
                                <button
                                  onClick={() => togglePagamento(item)}
                                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${item.statusPagamento ? 'bg-primary border-primary text-on-primary' : 'border-outline-variant text-transparent'}`}
                                  title={item.statusPagamento ? 'Pago' : 'Marcar como pago'}
                                >
                                  <span className="material-symbols-outlined text-[16px]">check</span>
                                </button>
                              </td>
                              <td className="py-2 pr-3 text-center">
                                <button
                                  onClick={() => toggleReembolso(item)}
                                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${item.statusReembolso ? 'bg-tertiary border-tertiary text-on-tertiary' : 'border-outline-variant text-transparent'}`}
                                  title={item.statusReembolso ? 'Reembolsado' : 'Marcar como reembolsado'}
                                >
                                  <span className="material-symbols-outlined text-[16px]">check</span>
                                </button>
                              </td>
                              <td className="py-2 pr-1 text-center">
                                <button
                                  onClick={() => excluirLinhaHistorico(item)}
                                  className="w-6 h-6 rounded-md flex items-center justify-center text-error/70 hover:bg-error/10 hover:text-error transition-colors"
                                  title="Excluir linha"
                                >
                                  <span className="material-symbols-outlined text-[16px]">delete</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              </>
            )}
          </div>
        )}
      </main>

      {/* Modal Nova Reserva Futura */}
      {modalReservaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={fecharModalReserva} />
          <div className="relative bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-outline-variant space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-section-heading text-section-heading">Nova Reserva Futura</h3>
              <button onClick={fecharModalReserva} className="p-1 hover:bg-surface-container rounded-full transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Nome do Hóspede</label>
              <input
                value={formReserva.hospedeNome}
                onChange={e => setFormReserva({ ...formReserva, hospedeNome: e.target.value })}
                placeholder="Nome do hóspede"
                className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-label-sm text-on-surface-variant block mb-1">Data de Entrada</label>
                <input
                  type="date"
                  value={formReserva.chegada}
                  onChange={e => setFormReserva({ ...formReserva, chegada: e.target.value })}
                  className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-label-sm text-on-surface-variant block mb-1">Data de Saída</label>
                <input
                  type="date"
                  value={formReserva.saida}
                  onChange={e => setFormReserva({ ...formReserva, saida: e.target.value })}
                  className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Quarto</label>
              {comodosReserva.length === 0 ? (
                <p className="text-xs text-on-surface-variant">Nenhum cômodo está marcado como "aceita hóspedes" ainda.</p>
              ) : (
                <select
                  value={formReserva.comodoId}
                  onChange={e => setFormReserva({ ...formReserva, comodoId: e.target.value })}
                  className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm"
                >
                  <option value="">Selecione</option>
                  {comodosReserva.map(c => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
                </select>
              )}
            </div>

            {erroReserva && <p className="text-error text-xs">{erroReserva}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleSalvarReserva}
                disabled={salvandoReserva}
                className="flex-1 bg-page-ramos text-white font-bold py-2 rounded-lg text-sm hover:brightness-110 transition-all disabled:opacity-50"
              >
                {salvandoReserva ? 'Salvando...' : 'Criar'}
              </button>
              <button onClick={fecharModalReserva} className="px-4 py-2 bg-surface-container text-on-surface rounded-lg text-sm border border-outline-variant">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
