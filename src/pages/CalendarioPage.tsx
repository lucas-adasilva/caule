import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TopAppBar } from '@/components/TopAppBar';
import { useApp } from '@/App';
import { useAuthStore } from '@/stores/authStore';
import type { Evento } from '@/utils/eventos';
import { eventoOcorreEm } from '@/utils/eventos';

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

export function CalendarioPage() {
  const { openMenu, openNotifications } = useApp();
  const { user } = useAuthStore();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesReferencia, setMesReferencia] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const hoje = new Date();
  const [diaSelecionado, setDiaSelecionado] = useState(hoje);

  useEffect(() => {
    async function carregar() {
      if (!user?.houseId) { setLoading(false); return; }
      try {
        const q = query(collection(db, 'eventos'), where('casaId', '==', user.houseId));
        const snap = await getDocs(q);
        const lista: Evento[] = [];
        snap.forEach(d => lista.push({ id: d.id, ...d.data(), respostas: d.data().respostas || {} } as Evento));
        setEventos(lista);
      } catch (e) { console.error('[Calendario] Erro ao carregar eventos:', e); }
      setLoading(false);
    }
    carregar();
  }, [user?.houseId]);

  function mesAnterior() { setMesReferencia(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; }); }
  function mesSeguinte() { setMesReferencia(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; }); }

  const monthName = mesReferencia.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const dias = getDiasDoMes(mesReferencia);

  function eventosNoDia(dia: Date): Evento[] {
    return eventos.filter(ev => eventoOcorreEm(ev, dia));
  }

  const eventosDoDiaSelecionado = eventosNoDia(diaSelecionado);
  const diaSelecionadoLabel = diaSelecionado.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

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

        {/* Insights / Progress Section */}
        <section className="glass-card overflow-hidden rounded-xl h-40 relative flex items-end p-6">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/60 to-surface/20" />
          </div>
          <div className="relative z-10 w-full">
            <p className="text-label-sm font-label-sm text-primary mb-1">Ritmo Mensal</p>
            <div className="flex items-center justify-between">
              <h4 className="text-body-md font-section-heading text-on-surface">Crescimento constante</h4>
              <span className="font-headline-lg-mobile text-headline-lg-mobile text-primary">85%</span>
            </div>
            <div className="w-full h-2 bg-surface-container-highest rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-primary w-[85%] rounded-full shadow-[0_0_10px_rgba(78,222,163,0.5)]" />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
