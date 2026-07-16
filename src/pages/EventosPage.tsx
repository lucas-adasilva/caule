import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TopAppBar } from '@/components/TopAppBar';
import { useApp } from '@/App';
import { useAuthStore } from '@/stores/authStore';
import type { Evento, Recorrencia } from '@/utils/eventos';
import { proximaOcorrencia, eventoOcorreEm, notificarEvento, formatarDataLocal } from '@/utils/eventos';

const DIAS_SEMANA = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
const EMOJIS_SUGERIDOS = ['📅', '🍕', '✨', '🎂', '🎉', '🛋️', '🌿', '🎮', '🎬', '🍻'];

function getDatasDaSemanaAtual(): Date[] {
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(segunda); d.setDate(segunda.getDate() + i); return d; });
}

interface Morador { uid: string; name: string; }

interface FormEvento {
  titulo: string;
  emoji: string;
  local: string;
  data: string;
  horario: string;
  descricao: string;
  recorrencia: Recorrencia;
}

const FORM_VAZIO: FormEvento = { titulo: '', emoji: '📅', local: '', data: '', horario: '19:00', descricao: '', recorrencia: 'nenhuma' };

export function EventosPage() {
  const { openMenu, openNotifications } = useApp();
  const { user } = useAuthStore();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [moradores, setMoradores] = useState<Morador[]>([]);
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
        membros.push({ uid: d.id, name: data.name || 'Morador' });
      });
      setMoradores(membros);
    } catch (e) { console.error('[Eventos] Erro ao carregar:', e); }
    setLoading(false);
  }

  function nomeDe(uid: string): string {
    if (uid === user?.uid) return 'Você';
    return moradores.find(m => m.uid === uid)?.name || 'Alguém';
  }

  function contarEventosNoDia(dia: Date): number {
    return eventos.filter(ev => eventoOcorreEm(ev, dia)).length;
  }

  const eventosComOcorrencia = eventos
    .map(ev => ({ evento: ev, ocorrencia: proximaOcorrencia(ev, hoje) }))
    .filter((x): x is { evento: Evento; ocorrencia: Date } => x.ocorrencia !== null)
    .sort((a, b) => a.ocorrencia.getTime() - b.ocorrencia.getTime());

  function abrirNovo() {
    setEditandoId(null);
    setForm({ ...FORM_VAZIO, data: formatarDataLocal(datasDaSemana[diaSelecionado] || hoje) });
    setErro('');
    setModalAberto(true);
  }

  function abrirEditar(ev: Evento) {
    setEditandoId(ev.id);
    setForm({ titulo: ev.titulo, emoji: ev.emoji || '📅', local: ev.local, data: ev.data, horario: ev.horario, descricao: ev.descricao || '', recorrencia: ev.recorrencia || 'nenhuma' });
    setErro('');
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditandoId(null);
    setForm(FORM_VAZIO);
  }

  async function salvarEvento() {
    if (!form.titulo.trim() || !form.data || !form.horario || !form.local.trim()) {
      setErro('Preencha título, data, horário e local.');
      return;
    }
    if (!user?.houseId || !user?.uid) return;
    setSalvando(true);
    setErro('');
    try {
      const dados = {
        titulo: form.titulo.trim(),
        emoji: form.emoji || '📅',
        local: form.local.trim(),
        data: form.data,
        horario: form.horario,
        descricao: form.descricao.trim(),
        recorrencia: form.recorrencia,
      };
      if (editandoId) {
        await updateDoc(doc(db, 'eventos', editandoId), { ...dados, updatedAt: serverTimestamp() });
        setSucesso('Evento atualizado!');
        notificarEvento(user.houseId, user.uid, user.name || 'Alguém', 'editado', dados).catch(() => {});
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
        notificarEvento(user.houseId, user.uid, user.name || 'Alguém', 'criado', dados).catch(() => {});
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

  async function responder(ev: Evento, resposta: 'confirmado' | 'recusado') {
    if (!user?.uid) return;
    const respostasAntigas = ev.respostas;
    setEventos(prev => prev.map(e => e.id === ev.id ? { ...e, respostas: { ...e.respostas, [user.uid]: resposta } } : e));
    try {
      await updateDoc(doc(db, 'eventos', ev.id), { [`respostas.${user.uid}`]: resposta });
    } catch (e) {
      console.error('[Eventos] Erro ao responder:', e);
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
            const confirmados = Object.entries(evento.respostas).filter(([, r]) => r === 'confirmado').map(([uid]) => uid);
            const minhaResposta = user?.uid ? evento.respostas[user.uid] : undefined;
            const podeEditarEste = podeGerenciar;
            return (
              <div key={evento.id} className="glass-card rounded-2xl p-4 flex gap-4 items-start transition-all active:scale-[0.98]">
                <div className="w-14 h-14 rounded-2xl bg-page-flores/20 flex items-center justify-center text-3xl flex-shrink-0">
                  {evento.emoji || '📅'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <h4 className="font-bold text-on-surface text-lg truncate">{evento.titulo}</h4>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {evento.recorrencia !== 'nenhuma' && (
                        <span className="material-symbols-outlined text-[16px] text-text-muted" title={evento.recorrencia === 'semanal' ? 'Evento semanal' : 'Evento mensal'}>repeat</span>
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
                    <span>{ocorrencia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {evento.horario} · {evento.local}</span>
                  </div>
                  {evento.descricao && <p className="text-sm text-on-surface-variant mb-3">{evento.descricao}</p>}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex -space-x-3">
                      {confirmados.slice(0, 4).map((uid) => (
                        <div
                          key={uid}
                          title={nomeDe(uid)}
                          className="w-8 h-8 rounded-full border-2 border-surface-card bg-surface-container-high flex items-center justify-center text-[10px] font-bold text-primary"
                        >
                          {nomeDe(uid).charAt(0).toUpperCase()}
                        </div>
                      ))}
                      {confirmados.length > 4 && (
                        <div className="w-8 h-8 rounded-full border-2 border-surface-card bg-surface-container flex items-center justify-center text-[10px] font-bold">
                          +{confirmados.length - 4}
                        </div>
                      )}
                      {confirmados.length === 0 && <span className="text-xs text-text-muted">Ninguém confirmou ainda</span>}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => responder(evento, 'confirmado')}
                        className={`px-3 py-1.5 rounded-lg font-label-sm text-xs active:scale-95 transition-all ${
                          minhaResposta === 'confirmado'
                            ? 'bg-page-flores text-white'
                            : 'border border-page-flores text-page-flores'
                        }`}
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => responder(evento, 'recusado')}
                        className={`px-3 py-1.5 rounded-lg font-label-sm text-xs active:scale-95 transition-all ${
                          minhaResposta === 'recusado'
                            ? 'bg-surface-container-highest text-on-surface-variant'
                            : 'border border-outline-variant text-text-muted'
                        }`}
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
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

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Emoji</label>
              <div className="flex flex-wrap gap-2">
                {EMOJIS_SUGERIDOS.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setForm({ ...form, emoji: e })}
                    className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${form.emoji === e ? 'bg-page-flores/20 ring-2 ring-page-flores' : 'bg-surface-container-high'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Título</label>
              <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex: Jantar da Casa" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1">Data</label>
                <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
              </div>
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1">Horário</label>
                <input type="time" value={form.horario} onChange={e => setForm({ ...form, horario: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
              </div>
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Local</label>
              <input value={form.local} onChange={e => setForm({ ...form, local: e.target.value })} placeholder="Ex: Área Gourmet" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Repetição</label>
              <select value={form.recorrencia} onChange={e => setForm({ ...form, recorrencia: e.target.value as Recorrencia })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm">
                <option value="nenhuma">Não se repete</option>
                <option value="semanal">Toda semana</option>
                <option value="mensal">Todo mês</option>
              </select>
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1">Descrição (opcional)</label>
              <textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} rows={2} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm resize-none" />
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
