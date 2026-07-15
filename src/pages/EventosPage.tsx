import { useState } from 'react';
import { TopAppBar } from '@/components/TopAppBar';
import { useApp } from '@/App';

interface Evento {
  id: string;
  titulo: string;
  emoji: string;
  data: string;
  horario: string;
  local: string;
  participantes: string[];
  status: 'confirmado' | 'pendente' | 'aguardando';
}

const DIAS_SEMANA = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

const eventosMock: Evento[] = [
  {
    id: '1',
    titulo: 'Jantar da Casa',
    emoji: '🍕',
    data: 'Hoje',
    horario: '20:30',
    local: 'Quarta-feira',
    participantes: ['Ana', 'Lucas', 'Mariana', 'Ricardo', 'Beatriz'],
    status: 'confirmado',
  },
  {
    id: '2',
    titulo: 'Faxina Geral',
    emoji: '✨',
    data: 'Sabado',
    horario: '09:00',
    local: '17 de Junho',
    participantes: ['Ana', 'Lucas'],
    status: 'pendente',
  },
  {
    id: '3',
    titulo: 'Aniv. do Marcos',
    emoji: '🎂',
    data: '22 Jun',
    horario: '',
    local: 'Area Gourmet',
    participantes: ['Todos'],
    status: 'aguardando',
  },
];

export function EventosPage() {
  const { openMenu, openNotifications } = useApp();
  const [diaSelecionado, setDiaSelecionado] = useState(2);
  const [eventos, setEventos] = useState<Evento[]>(eventosMock);

  function toggleConfirmar(eventoId: string) {
    setEventos(prev => prev.map(e => {
      if (e.id === eventoId) {
        return { ...e, status: e.status === 'confirmado' ? 'pendente' : 'confirmado' };
      }
      return e;
    }));
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
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-tertiary-container mb-1">Flores</h2>
          <p className="text-text-muted font-label-sm">Eventos e Celebracoes</p>
        </section>

        {/* Weekly Mini Calendar */}
        <section className="mb-stack-lg overflow-x-auto">
          <div className="flex gap-3 min-w-max py-2">
            {DIAS_SEMANA.map((dia, idx) => (
              <button
                key={idx}
                onClick={() => setDiaSelecionado(idx)}
                className={`flex flex-col items-center justify-center w-14 h-20 rounded-2xl transition-all cursor-pointer ${
                  diaSelecionado === idx
                    ? 'bg-tertiary-container text-on-tertiary-fixed font-bold flower-glow scale-110 mx-2'
                    : 'bg-surface-container text-text-muted'
                }`}
              >
                <span className={`text-caption ${diaSelecionado === idx ? 'opacity-80' : ''}`}>{dia}</span>
                <span className={diaSelecionado === idx ? 'text-xl' : 'font-bold text-lg'}>{12 + idx}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Upcoming Events */}
        <section className="space-y-stack-md">
          <div className="flex items-center justify-between mb-stack-sm">
            <h3 className="font-section-heading text-on-surface">Proximos Eventos</h3>
            <span className="text-tertiary-container font-label-sm cursor-pointer">Ver todos</span>
          </div>

          {eventos.map((evento) => (
            <div key={evento.id} className="glass-card rounded-2xl p-4 flex gap-4 items-start transition-all active:scale-[0.98]">
              <div className="w-14 h-14 rounded-2xl bg-tertiary-container/20 flex items-center justify-center text-3xl flex-shrink-0">
                {evento.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-bold text-on-surface text-lg truncate">{evento.titulo}</h4>
                  <span className={`font-label-sm flex-shrink-0 ml-2 ${
                    evento.status === 'confirmado' ? 'text-tertiary-container' : 'text-text-muted'
                  }`}>
                    {evento.data}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-text-muted text-sm mb-3">
                  <span className="material-symbols-outlined text-[16px]">schedule</span>
                  <span>{evento.horario ? `${evento.horario} • ` : ''}{evento.local}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex -space-x-3">
                    {evento.participantes.slice(0, 4).map((nome, i) => (
                      <div
                        key={i}
                        className="w-8 h-8 rounded-full border-2 border-surface-card bg-surface-container-high flex items-center justify-center text-[10px] font-bold text-primary"
                      >
                        {nome === 'Todos' ? 'ALL' : nome.charAt(0)}
                      </div>
                    ))}
                    {evento.participantes.length > 4 && (
                      <div className="w-8 h-8 rounded-full border-2 border-surface-card bg-surface-container flex items-center justify-center text-[10px] font-bold">
                        +{evento.participantes.length - 4}
                      </div>
                    )}
                  </div>
                  {evento.status === 'confirmado' ? (
                    <button
                      onClick={() => toggleConfirmar(evento.id)}
                      className="px-4 py-1.5 border border-tertiary-container text-tertiary-container rounded-lg font-label-sm active:scale-95 transition-all"
                    >
                      Cancelar
                    </button>
                  ) : evento.status === 'pendente' ? (
                    <div className="text-caption text-secondary">Aguardando mais 2</div>
                  ) : (
                    <button
                      onClick={() => toggleConfirmar(evento.id)}
                      className="px-4 py-1.5 bg-tertiary-container text-on-tertiary-fixed rounded-lg font-label-sm active:scale-95 transition-all"
                    >
                      Confirmar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>
      </main>

      {/* FAB: Novo Evento */}
      <button className="fixed right-6 bottom-24 w-14 h-14 bg-tertiary-container text-on-tertiary-fixed rounded-2xl shadow-xl flower-glow flex items-center justify-center z-40 active:scale-90 transition-all">
        <span className="material-symbols-outlined text-3xl">add</span>
      </button>
    </div>
  );
}
