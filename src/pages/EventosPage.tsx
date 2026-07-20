import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TopAppBar } from '@/components/TopAppBar';
import { UserAvatar } from '@/components/UserAvatar';
import { useApp } from '@/App';
import { useAuthStore } from '@/stores/authStore';
import type { Evento, Recorrencia, TipoEvento } from '@/utils/eventos';
import { proximaOcorrencia, eventoOcorreEm, notificarEvento, formatarDataLocal, sugerirEmojiEvento, descreverRecorrencia, respostasDaOcorrencia, LEMBRETE_OPCOES } from '@/utils/eventos';

const LEMBRETE_LABEL: Record<number, string> = { 1440: '1 dia antes', 60: '1 hora antes', 30: '30 minutos antes' };

const DIAS_SEMANA = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
const DIAS_SEMANA_SEL = [
  { key: '0', label: 'Seg' }, { key: '1', label: 'Ter' }, { key: '2', label: 'Qua' },
  { key: '3', label: 'Qui' }, { key: '4', label: 'Sex' }, { key: '5', label: 'Sab' }, { key: '6', label: 'Dom' },
];

function getDatasDaSemanaAtual(): Date[] {
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(segunda); d.setDate(segunda.getDate() + i); return d; });
}

interface Morador { uid: string; name: string; photoURL?: string; }
interface Comodo { id: string; nome: string; icone: string; tipo: string; aceitaEventos: boolean; }

interface FormEvento {
  titulo: string;
  emoji: string;
  locais: string[];
  horario: string;
  descricao: string;
  recorrencia: Recorrencia;
  data: string;
  diasSemana: string[];
  diasMes: number[];
  tipo: TipoEvento;
  lembretes: number[];
}

const FORM_VAZIO: FormEvento = {
  titulo: '', emoji: '📅', locais: [], horario: '19:00', descricao: '',
  recorrencia: 'nenhuma', data: '', diasSemana: [], diasMes: [], tipo: 'coletivo', lembretes: [],
};

export function EventosPage() {
  const { openMenu, openNotifications } = useApp();
  const { user } = useAuthStore();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [comodos, setComodos] = useState<Comodo[]>([]);
  const [loading, setLoading] = useState(true);
  const hoje = new Date();
  const diaHojeIdx = (hoje.getDay() + 6) % 7;
  const [diaSelecionado, setDiaSelecionado] = useState(diaHojeIdx);
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormEvento>(FORM_VAZIO);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [salvando, setSalvando] = useState(false);

  const datasDaSemana = getDatasDaSemanaAtual();
  const podeGerenciar = user?.role === 'admin' || user?.role === 'morador';

  useEffect(() => { carregarDados(); }, [user?.houseId]);

  // Sugere emoji automaticamente conforme o titulo digitado (so em evento novo - editar
  // um evento existente nao deve sobrescrever um emoji ja customizado). Usuario pode
  // sobrescrever livremente o campo emoji a qualquer momento.
  useEffect(() => {
    if (editandoId) return;
    if (!form.titulo.trim()) return;
    const sugerido = sugerirEmojiEvento(form.titulo);
    setForm(prev => prev.emoji === sugerido ? prev : { ...prev, emoji: sugerido });
  }, [form.titulo, editandoId]);

  async function carregarDados() {
    if (!user?.houseId) { setLoading(false); return; }
    setLoading(true);
    try {
      const qEv = query(collection(db, 'eventos'), where('casaId', '==', user.houseId));
      const sEv = await getDocs(qEv);
      const lista: Evento[] = [];
      sEv.forEach(d => lista.push({ id: d.id, ...d.data(), respostas: d.data().respostas || {} } as Evento));
      setEventos(lista);

      const qUsers = query(collection(db, 'users'), where('houseId', '==', user.houseId));
      const sUsers = await getDocs(qUsers);
      const membros: Morador[] = [];
      sUsers.forEach(d => {
        const data = d.data();
        if (data.isActive === false) return;
        membros.push({ uid: d.id, name: data.name || 'Morador', photoURL: data.photoURL || '' });
      });
      setMoradores(membros);

      const qComodos = query(collection(db, 'comodos'), where('casaId', '==', user.houseId));
      const sComodos = await getDocs(qComodos);
      const comodosData: Comodo[] = [];
      sComodos.forEach(d => { const data = d.data(); comodosData.push({ id: d.id, nome: data.nome || 'Cômodo', icone: data.icone || '🏠', tipo: data.tipo || 'coletivo', aceitaEventos: data.aceitaEventos === true }); });
      setComodos(comodosData);
    } catch (e) { console.error('[Eventos] Erro ao carregar:', e); }
    setLoading(false);
  }

  function moradorDe(uid: string): { name: string; photoURL?: string } {
    if (uid === user?.uid) return { name: 'Você', photoURL: user?.photoURL };
    const m = moradores.find(m => m.uid === uid);
    return { name: m?.name || 'Alguém', photoURL: m?.photoURL };
  }

  function contarEventosNoDia(dia: Date): number {
    return eventos.filter(ev => eventoOcorreEm(ev, dia)).length;
  }

  // Coletivo/Privado nao e sobre visibilidade (todo evento e visivel pra casa toda) - e sobre
  // quem pode participar: coletivo = qualquer morador confirma presenca; privado = evento de
  // um morador com convidados dele, sem RSVP da casa nem notificacao pros outros.
  const eventosComOcorrencia = eventos
    .map(ev => ({ evento: ev, ocorrencia: proximaOcorrencia(ev, hoje) }))
    .filter((x): x is { evento: Evento; ocorrencia: Date } => x.ocorrencia !== null)
    .sort((a, b) => a.ocorrencia.getTime() - b.ocorrencia.getTime());

  const comodosPublicos = comodos.filter(c => c.tipo === 'coletivo' && c.aceitaEventos);

  function abrirNovo() {
    setEditandoId(null);
    setForm({ ...FORM_VAZIO, data: formatarDataLocal(datasDaSemana[diaSelecionado] || hoje) });
    setErro('');
    setModalAberto(true);
  }

  function abrirEditar(ev: Evento) {
    setEditandoId(ev.id);
    setForm({
      titulo: ev.titulo, emoji: ev.emoji || '📅', locais: ev.locais || [], horario: ev.horario,
      descricao: ev.descricao || '', recorrencia: ev.recorrencia || 'nenhuma',
      data: ev.data || formatarDataLocal(hoje), diasSemana: ev.diasSemana || [], diasMes: ev.diasMes || [],
      tipo: ev.tipo || 'coletivo', lembretes: ev.lembretes || [],
    });
    setErro('');
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditandoId(null);
    setForm(FORM_VAZIO);
  }

  async function salvarEvento() {
    if (!form.titulo.trim() || !form.horario) { setErro('Preencha título e horário.'); return; }
    if (form.recorrencia === 'nenhuma' && !form.data) { setErro('Selecione a data do evento.'); return; }
    if (form.recorrencia === 'semanal' && form.diasSemana.length === 0) { setErro('Selecione pelo menos um dia da semana.'); return; }
    if (form.recorrencia === 'mensal' && form.diasMes.length === 0) { setErro('Selecione pelo menos um dia do mês.'); return; }
    if (!user?.houseId || !user?.uid) return;
    setSalvando(true);
    setErro('');
    try {
      const dados: Record<string, any> = {
        titulo: form.titulo.trim(),
        emoji: form.emoji || '📅',
        locais: form.locais,
        horario: form.horario,
        descricao: form.descricao.trim(),
        recorrencia: form.recorrencia,
        tipo: form.tipo,
        lembretes: form.lembretes,
      };
      if (form.recorrencia === 'nenhuma') dados.data = form.data;
      if (form.recorrencia === 'semanal') dados.diasSemana = form.diasSemana;
      if (form.recorrencia === 'mensal') dados.diasMes = form.diasMes;

      if (editandoId) {
        await updateDoc(doc(db, 'eventos', editandoId), { ...dados, updatedAt: serverTimestamp() });
        setSucesso('Evento atualizado!');
        notificarEvento(user.houseId, user.uid, user.name || 'Alguém', 'editado', dados as any).catch(() => {});
      } else {
        await addDoc(collection(db, 'eventos'), {
          ...dados,
          casaId: user.houseId,
          criadoPor: user.uid,
          criadoPorNome: user.name || 'Alguém',
          respostas: {},
          createdAt: serverTimestamp(),
        });
        setSucesso('Evento criado!');
        notificarEvento(user.houseId, user.uid, user.name || 'Alguém', 'criado', dados as any).catch(() => {});
      }
      fecharModal();
      await carregarDados();
    } catch (e: any) {
      setErro('Erro ao salvar: ' + e.message);
    }
    setSalvando(false);
  }

  async function excluirEvento(ev: Evento) {
    if (!confirm(`Excluir o evento "${ev.titulo}"?`)) return;
    try {
      await deleteDoc(doc(db, 'eventos', ev.id));
      setEventos(prev => prev.filter(e => e.id !== ev.id));
      if (user?.houseId && user?.uid) {
        notificarEvento(user.houseId, user.uid, user.name || 'Alguém', 'cancelado', ev).catch(() => {});
      }
    } catch (e: any) {
      alert('Erro ao excluir: ' + e.message);
    }
  }

  // RSVP e por ocorrencia especifica (data), nao pela serie toda - confirmar uma semana de um
  // evento recorrente nao confirma automaticamente as proximas.
  async function responder(ev: Evento, dataOcorrencia: string, resposta: 'confirmado' | 'recusado') {
    if (!user?.uid) return;
    const respostasAntigas = ev.respostas;
    setEventos(prev => prev.map(e => e.id === ev.id
      ? { ...e, respostas: { ...e.respostas, [dataOcorrencia]: { ...(e.respostas[dataOcorrencia] || {}), [user.uid]: resposta } } }
      : e));
    try {
      await updateDoc(doc(db, 'eventos', ev.id), { [`respostas.${dataOcorrencia}.${user.uid}`]: resposta });
    } catch (e) {
      console.error('[Eventos] Erro ao responder:', e);
      setEventos(prev => prev.map(ev2 => ev2.id === ev.id ? { ...ev2, respostas: respostasAntigas } : ev2));
    }
  }

  // Admin ou criador do evento pode remover uma confirmação - inclusive de usuários que
  // já foram excluídos do app e ficariam presos na lista pra sempre como "Alguém".
  async function removerConfirmado(ev: Evento, dataOcorrencia: string, uid: string) {
    if (!confirm('Remover esta confirmação?')) return;
    const respostasAntigas = ev.respostas;
    setEventos(prev => prev.map(e => {
      if (e.id !== ev.id) return e;
      const ocorrencia = { ...(e.respostas[dataOcorrencia] || {}) };
      delete ocorrencia[uid];
      return { ...e, respostas: { ...e.respostas, [dataOcorrencia]: ocorrencia } };
    }));
    try {
      await updateDoc(doc(db, 'eventos', ev.id), { [`respostas.${dataOcorrencia}.${uid}`]: deleteField() });
    } catch (e) {
      console.error('[Eventos] Erro ao remover confirmação:', e);
      setEventos(prev => prev.map(ev2 => ev2.id === ev.id ? { ...ev2, respostas: respostasAntigas } : ev2));
    }
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body-md selection:bg-tertiary/30 pb-32">
      <TopAppBar
        onMenuClick={openMenu}
        onNotificationClick={openNotifications}
        title="Eventos"
        titleColor="text-page-flores" />

      <main className="px-margin-page pb-8">
        {/* Title & Subtitle */}
        <section className="py-stack-md">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-page-flores mb-1">Flores</h2>
          <p className="text-text-muted font-label-sm">Eventos e Celebrações</p>
        </section>

        {(erro || sucesso) && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${erro ? 'bg-error-container/20 border border-error/30 text-error' : 'bg-page-flores/10 border border-page-flores/30 text-page-flores'}`}>
            {erro || sucesso}
          </div>
        )}

        {/* Weekly Mini Calendar */}
        <section className="mb-stack-lg overflow-x-auto">
          <div className="flex gap-3 min-w-max py-2">
            {DIAS_SEMANA.map((dia, idx) => {
              const isSelected = diaSelecionado === idx;
              const qtdEventos = contarEventosNoDia(datasDaSemana[idx]);
              return (
                <button
                  key={idx}
                  onClick={() => setDiaSelecionado(idx)}
                  className={`relative flex flex-col items-center justify-center w-14 h-20 rounded-2xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-page-flores text-white font-bold shadow-[0_0_15px_rgba(252,124,120,0.4)] scale-110 mx-2'
                      : 'bg-surface-container text-text-muted'
                  }`}
                >
                  <span className={`text-xs ${isSelected ? 'opacity-90' : ''}`}>{dia}</span>
                  <span className={isSelected ? 'text-xl' : 'font-bold text-lg'}>{datasDaSemana[idx].getDate()}</span>
                  {qtdEventos > 0 && (
                    <span className={`absolute bottom-1.5 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-page-flores'}`} />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Upcoming Events */}
        <section className="space-y-stack-md">
          <div className="flex items-center justify-between mb-stack-sm">
            <h3 className="text-section-heading font-bold text-on-surface">Próximos Eventos</h3>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><span className="material-symbols-outlined animate-spin text-page-flores text-3xl">refresh</span></div>
          ) : eventosComOcorrencia.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">local_florist</span>
              <p className="text-text-muted">Nenhum evento agendado</p>
            </div>
          ) : eventosComOcorrencia.map(({ evento, ocorrencia }) => {
            const dataOcorrenciaStr = formatarDataLocal(ocorrencia);
            const respostasOcorrencia = respostasDaOcorrencia(evento, dataOcorrenciaStr);
            const confirmados = Object.entries(respostasOcorrencia).filter(([, r]) => r === 'confirmado').map(([uid]) => uid);
            const minhaResposta = user?.uid ? respostasOcorrencia[user.uid] : undefined;
            const ehPrivado = evento.tipo === 'privado';
            const podeParticipar = evento.tipo === 'coletivo' || (evento.tipo === 'apenas_moradores' && user?.role !== 'hospede');
            const podeEditarEste = user?.role === 'admin' || evento.criadoPor === user?.uid;
            const dataOuRecorrencia = evento.recorrencia === 'nenhuma'
              ? ocorrencia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
              : descreverRecorrencia(evento);
            return (
              <div key={evento.id} className="glass-card rounded-2xl p-4 flex gap-4 items-start transition-all active:scale-[0.98]">
                <div className="w-14 h-14 rounded-2xl bg-page-flores/20 flex items-center justify-center text-3xl flex-shrink-0">
                  {evento.emoji || '📅'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <h4 className="font-bold text-on-surface text-lg truncate">{evento.titulo}</h4>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {ehPrivado && (
                        <span className="material-symbols-outlined text-[16px] text-text-muted" title="Evento privado">lock</span>
                      )}
                      {evento.tipo === 'apenas_moradores' && (
                        <span className="material-symbols-outlined text-[16px] text-text-muted" title="Apenas moradores">home</span>
                      )}
                      {evento.recorrencia !== 'nenhuma' && (
                        <span className="material-symbols-outlined text-[16px] text-text-muted" title={descreverRecorrencia(evento)}>repeat</span>
                      )}
                      {podeEditarEste && (
                        <>
                          <button onClick={() => abrirEditar(evento)} className="p-1 text-on-surface-variant hover:text-page-flores rounded-full transition-colors">
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button onClick={() => excluirEvento(evento)} className="p-1 text-on-surface-variant hover:text-error rounded-full transition-colors">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-text-muted text-sm mb-3">
                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                    <span>{dataOuRecorrencia} · {evento.horario}{evento.locais && evento.locais.length > 0 ? ` · ${evento.locais.join(', ')}` : ''}</span>
                  </div>
                  {evento.descricao && <p className="text-sm text-on-surface-variant mb-3">{evento.descricao}</p>}
                  {!ehPrivado && (
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1.5">
                        {confirmados.length === 0 ? (
                          <span className="text-xs text-text-muted">Ninguém confirmou ainda</span>
                        ) : confirmados.map((uid) => {
                          const m = moradorDe(uid);
                          return (
                            <div key={uid} className="flex items-center gap-2">
                              <UserAvatar photoURL={m.photoURL} name={m.name} size={28} showPresence={false} />
                              <span className="text-xs text-on-surface-variant truncate flex-1">{m.name}</span>
                              {podeEditarEste && (
                                <button
                                  onClick={() => removerConfirmado(evento, dataOcorrenciaStr, uid)}
                                  className="p-1 text-on-surface-variant hover:text-error rounded-full transition-colors flex-shrink-0"
                                  title="Remover confirmação"
                                >
                                  <span className="material-symbols-outlined text-[16px]">close</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {podeParticipar && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => responder(evento, dataOcorrenciaStr, 'confirmado')}
                            className={`px-3 py-1.5 rounded-lg font-label-sm text-xs active:scale-95 transition-all ${
                              minhaResposta === 'confirmado'
                                ? 'bg-page-flores text-white'
                                : 'border border-page-flores text-page-flores'
                            }`}
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => responder(evento, dataOcorrenciaStr, 'recusado')}
                            className={`px-3 py-1.5 rounded-lg font-label-sm text-xs active:scale-95 transition-all ${
                              minhaResposta === 'recusado'
                                ? 'bg-surface-container-highest text-on-surface-variant'
                                : 'border border-outline-variant text-text-muted'
                            }`}
                          >
                            Recusar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </main>

      {/* FAB: Novo Evento */}
      {podeGerenciar && (
        <button
          onClick={abrirNovo}
          className="fixed right-6 bottom-24 w-14 h-14 bg-page-flores text-white rounded-2xl shadow-xl shadow-[0_0_15px_rgba(252,124,120,0.4)] flex items-center justify-center z-40 active:scale-90 transition-all"
        >
          <span className="material-symbols-outlined text-3xl">add</span>
        </button>
      )}

      {/* Modal Novo/Editar Evento */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={fecharModal}>
          <div className="bg-surface-card w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-on-surface text-lg">{editandoId ? 'Editar Evento' : 'Novo Evento'}</h3>
              <button onClick={fecharModal} className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Título do evento" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />

            <div className="flex items-center gap-2">
              <label className="text-label-sm text-on-surface-variant">Emoji</label>
              <input
                type="text"
                value={form.emoji}
                onChange={e => setForm({ ...form, emoji: e.target.value })}
                placeholder="📅"
                maxLength={4}
                className="w-16 text-center bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-1 text-lg"
              />
              <span className="text-xs text-on-surface-variant">Sugestão automática — edite à vontade</span>
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Repetição</label>
              <select value={form.recorrencia} onChange={e => setForm({ ...form, recorrencia: e.target.value as Recorrencia })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm">
                <option value="nenhuma">Não se repete</option>
                <option value="semanal">Toda semana</option>
                <option value="mensal">Todo mês</option>
              </select>
            </div>

            {form.recorrencia === 'nenhuma' && (
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1">Data</label>
                <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
              </div>
            )}

            {form.recorrencia === 'semanal' && (
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1">Dias da Semana</label>
                <div className="flex gap-1">
                  {DIAS_SEMANA_SEL.map(d => {
                    const ativo = form.diasSemana.includes(d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setForm({ ...form, diasSemana: ativo ? form.diasSemana.filter(x => x !== d.key) : [...form.diasSemana, d.key] })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${ativo ? 'bg-page-flores text-white' : 'bg-surface-container-high text-on-surface-variant border border-outline-variant'}`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {form.recorrencia === 'mensal' && (
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1">Dia(s) do Mês</label>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(dia => {
                    const ativo = form.diasMes.includes(dia);
                    return (
                      <button
                        key={dia}
                        type="button"
                        onClick={() => setForm({ ...form, diasMes: ativo ? form.diasMes.filter(x => x !== dia) : [...form.diasMes, dia] })}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all ${ativo ? 'bg-page-flores text-white' : 'bg-surface-container-high text-on-surface-variant border border-outline-variant'}`}
                      >
                        {dia}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Horário</label>
              <input type="time" value={form.horario} onChange={e => setForm({ ...form, horario: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Local (opcional, múltipla escolha)</label>
              {comodosPublicos.length === 0 ? (
                <p className="text-xs text-on-surface-variant">Nenhum cômodo está marcado como "aceita eventos" ainda.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {comodosPublicos.map(c => {
                    const ativo = form.locais.includes(c.nome);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setForm({ ...form, locais: ativo ? form.locais.filter(x => x !== c.nome) : [...form.locais, c.nome] })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${ativo ? 'bg-page-flores text-white' : 'bg-surface-container-high text-on-surface-variant border border-outline-variant'}`}
                      >
                        {c.icone} {c.nome}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Descrição (opcional)</label>
              <textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} rows={2} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm resize-none" />
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Participação</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm({ ...form, tipo: 'apenas_moradores' })} className={`flex-1 py-2 rounded-lg text-xs ${form.tipo === 'apenas_moradores' ? 'bg-page-flores text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>Só Moradores</button>
                <button type="button" onClick={() => setForm({ ...form, tipo: 'coletivo' })} className={`flex-1 py-2 rounded-lg text-xs ${form.tipo === 'coletivo' ? 'bg-page-flores text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>Coletivo</button>
                <button type="button" onClick={() => setForm({ ...form, tipo: 'privado' })} className={`flex-1 py-2 rounded-lg text-xs ${form.tipo === 'privado' ? 'bg-page-flores text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>Privado</button>
              </div>
              {form.tipo === 'apenas_moradores' && (
                <p className="text-[10px] text-on-surface-variant mt-1">Só moradores e admin recebem aviso e confirmam presença. Hóspedes não são notificados.</p>
              )}
              {form.tipo === 'coletivo' && (
                <p className="text-[10px] text-on-surface-variant mt-1">Todo mundo da casa (moradores e hóspedes) recebe aviso e pode confirmar presença.</p>
              )}
              {form.tipo === 'privado' && (
                <p className="text-[10px] text-on-surface-variant mt-1">Evento seu com convidados próprios — sem confirmação de presença da casa nem notificação pros outros. Continua visível pra todo mundo.</p>
              )}
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Lembrete (opcional, múltipla escolha)</label>
              <div className="flex flex-col gap-1.5">
                {LEMBRETE_OPCOES.map(min => {
                  const ativo = form.lembretes.includes(min);
                  return (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setForm({ ...form, lembretes: ativo ? form.lembretes.filter(x => x !== min) : [...form.lembretes, min] })}
                      className={`flex items-center gap-2 py-2 px-3 rounded-lg text-sm text-left transition-all ${ativo ? 'bg-page-flores/15 border border-page-flores text-page-flores' : 'bg-surface-container-high border border-outline-variant text-on-surface-variant'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{ativo ? 'notifications_active' : 'notifications_none'}</span>
                      {LEMBRETE_LABEL[min]}
                    </button>
                  );
                })}
              </div>
            </div>

            {erro && <div className="p-2 bg-error-container/20 border border-error/30 rounded-lg text-error text-xs">{erro}</div>}

            <div className="flex gap-2">
              <button onClick={salvarEvento} disabled={salvando} className="flex-1 bg-page-flores text-white font-bold py-2 rounded-lg text-sm hover:brightness-110 transition-all disabled:opacity-50">
                {salvando ? 'Salvando...' : editandoId ? 'Atualizar' : 'Criar'}
              </button>
              <button onClick={fecharModal} className="px-4 py-2 bg-surface-container text-on-surface rounded-lg text-sm border border-outline-variant">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
