import { useState } from 'react';
import { TopAppBar } from '@/components/TopAppBar';
import { useApp } from '@/App';

interface TarefaDia {
  id: string;
  titulo: string;
  horario: string;
  local: string;
  tipo: 'tarefa' | 'evento' | 'limpeza';
  xp: number;
}

const tarefasDoDia: TarefaDia[] = [
  { id: '1', titulo: 'Regar as Plantas', horario: 'Manha', local: 'Area Externa', tipo: 'tarefa', xp: 12 },
  { id: '2', titulo: 'Jantar de Caule', horario: '19:30', local: 'Todos os Residentes', tipo: 'evento', xp: 0 },
  { id: '3', titulo: 'Limpeza da Cozinha', horario: 'Apos Almoco', local: 'Cozinha', tipo: 'limpeza', xp: 8 },
];

function getDaysInMonth(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();
  const days: { day: number; isCurrentMonth: boolean; hasEvent: boolean; isToday: boolean }[] = [];

  // Previous month padding
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push({ day: prevMonthLastDay - i, isCurrentMonth: false, hasEvent: false, isToday: false });
  }

  // Current month
  const today = new Date();
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      day: d,
      isCurrentMonth: true,
      hasEvent: [2, 5, 14].includes(d),
      isToday: today.getDate() === d && today.getMonth() === month && today.getFullYear() === year,
    });
  }

  return days;
}

export function CalendarioPage() {
  const { openMenu, openNotifications } = useApp();
  const [currentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(currentDate.getDate());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const days = getDaysInMonth(year, month);

  const tipoClasses = {
    tarefa: { icon: 'local_florist', iconColor: 'text-primary', bg: 'bg-primary-container/20' },
    evento: { icon: 'restaurant', iconColor: 'text-tertiary', bg: 'bg-tertiary-container/30' },
    limpeza: { icon: 'sanitizer', iconColor: 'text-secondary', bg: 'bg-secondary-container/20' },
  };

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
        title="Ciclos" />

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
              <button className="material-symbols-outlined text-on-surface-variant p-1 hover:bg-surface-variant rounded transition-colors">chevron_left</button>
              <button className="material-symbols-outlined text-on-surface-variant p-1 hover:bg-surface-variant rounded transition-colors">chevron_right</button>
            </div>
          </div>

          {/* Calendar Days Header */}
          <div className="grid grid-cols-7 mb-2 text-center">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => (
              <span key={d} className="text-label-sm font-label-sm text-on-surface-variant opacity-60">{d}</span>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => (
              <button
                key={idx}
                onClick={() => day.isCurrentMonth && setSelectedDay(day.day)}
                className={`aspect-square flex items-center justify-center rounded-lg transition-all text-sm font-label-sm relative ${
                  !day.isCurrentMonth
                    ? 'text-on-surface-variant opacity-20'
                    : day.isToday
                    ? 'bg-page-ciclos text-on-primary font-bold shadow-[0_0_15px_rgba(216,191,216,0.4)]'
                    : selectedDay === day.day
                    ? 'bg-page-ciclos/20 text-page-ciclos font-bold'
                    : 'hover:bg-surface-variant text-on-surface'
                }`}
              >
                {day.day}
                {day.hasEvent && day.isCurrentMonth && (
                  <span className={`absolute bottom-1.5 w-1 h-1 rounded-full ${day.isToday ? 'bg-on-primary' : 'bg-tertiary'}`} />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Daily Schedule Section */}
        <section className="space-y-stack-md">
          <div className="flex items-center justify-between">
            <h3 className="text-section-heading font-section-heading text-on-surface">Programacao do Dia</h3>
            <span className="text-caption font-caption text-primary">Terca-feira</span>
          </div>

          <div className="space-y-3">
            {tarefasDoDia.map((tarefa) => {
              const tipo = tipoClasses[tarefa.tipo];
              return (
                <div
                  key={tarefa.id}
                  className="glass-card p-4 rounded-xl flex items-center gap-4 group transition-all hover:translate-x-1"
                >
                  <div className={`w-10 h-10 rounded-lg ${tipo.bg} flex items-center justify-center ${tipo.iconColor}`}>
                    <span className="material-symbols-outlined">{tipo.icon}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-label-sm font-label-sm text-on-surface">{tarefa.titulo}</h4>
                    <p className="text-caption font-caption text-on-surface-variant">{tarefa.horario} • {tarefa.local}</p>
                  </div>
                  {tarefa.tipo === 'evento' ? (
                    <button className="bg-tertiary/20 text-tertiary px-3 py-1 rounded-full text-caption font-label-sm">Evento</button>
                  ) : (
                    <div className="flex items-center gap-1 text-primary">
                      <span className="material-symbols-outlined text-[18px]">bolt</span>
                      <span className="text-label-sm font-label-sm">+{tarefa.xp} XP</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
