import { useState } from 'react';
import { TopAppBar } from '@/components/TopAppBar';
import { useApp } from '@/App';

interface Conquista {
  id: string;
  titulo: string;
  descricao: string;
  icone: string;
  desbloqueada: boolean;
  categoria: string;
}

interface Atividade {
  id: string;
  usuario: string;
  acao: string;
  target: string;
  tempo: string;
  pontos: number;
  cor: 'highlight-orange' | 'primary' | 'secondary';
  icone: string;
}

const conquistas: Conquista[] = [
  { id: '1', titulo: 'Semana Impecavel', descricao: 'Todas as tarefas concluidas no prazo.', icone: 'workspace_premium', desbloqueada: true, categoria: 'Mestre do Solo' },
  { id: '2', titulo: 'Chef da Rodada', descricao: '3 jantares coletivos preparados.', icone: 'restaurant', desbloqueada: true, categoria: '' },
  { id: '3', titulo: 'Brilho Eterno', descricao: 'Cozinha limpa por 7 dias seguidos.', icone: 'cleaning_services', desbloqueada: false, categoria: '' },
  { id: '4', titulo: 'Poupador Real', descricao: 'Meta de mercado batida este mes.', icone: 'savings', desbloqueada: true, categoria: '' },
  { id: '5', titulo: 'Paz de Espirito', descricao: 'Resolvendo conflitos sem estresse.', icone: 'volunteer_activism', desbloqueada: false, categoria: '' },
];

const atividades: Atividade[] = [
  { id: '1', usuario: 'Lucas', acao: 'completou', target: 'Limpar Geladeira', tempo: 'Ha 2 horas', pontos: 15, cor: 'highlight-orange', icone: 'stars' },
  { id: '2', usuario: 'Nova meta batida', acao: '', target: 'Compras da Semana', tempo: 'Ontem', pontos: 50, cor: 'primary', icone: 'handshake' },
  { id: '3', usuario: 'Mariana', acao: 'regou as', target: 'Plantas da Sala', tempo: 'Ontem', pontos: 10, cor: 'highlight-orange', icone: 'energy_savings_leaf' },
];

export function ConquistasPage() {
  const { openMenu, openNotifications } = useApp();
  const [harmonia] = useState(84);

  const corClasses = {
    'highlight-orange': 'border-l-highlight-orange text-highlight-orange bg-highlight-orange/20',
    'primary': 'border-l-primary text-primary bg-primary/20',
    'secondary': 'border-l-secondary text-secondary bg-secondary/20',
  };

  return (
    <div className="min-h-screen bg-surface text-on-background font-body-md pb-32">
      <TopAppBar
        onMenuClick={openMenu}
        onNotificationClick={openNotifications}
        title="Casa das Oliveiras" />

      <main className="px-margin-page pb-8">
        {/* Title Section */}
        <section className="mt-6 mb-8">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-[#fb923c]">Frutos</h2>
          <p className="font-body-md text-text-muted">Conquistas da Casa</p>
        </section>

        {/* Harmony Progress Bar */}
        <section className="mb-stack-lg p-6 bg-surface-container rounded-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-section-heading text-section-heading flex items-center gap-2">
              <span className="material-symbols-outlined text-[#fb923c]">eco</span>
              Harmonia da Casa
            </h3>
            <span className="text-[#fb923c] font-bold">{harmonia}%</span>
          </div>
          <div className="w-full h-4 bg-surface-container-highest rounded-full overflow-hidden">
            <div
              className="h-full bg-[#fb923c] progress-glow rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${harmonia}%` }}
            />
          </div>
          <p className="mt-3 font-caption text-caption text-text-muted italic">A colheita esta proxima! Continuem cuidando das raizes.</p>
        </section>

        {/* Achievements Bento Grid */}
        <section className="mb-stack-lg">
          <div className="grid grid-cols-2 gap-gutter-grid">
            {/* Feature Card: Active Achievement */}
            {conquistas.filter(c => c.desbloqueada).slice(0, 1).map(c => (
              <div
                key={c.id}
                className="col-span-2 p-6 bg-surface-card rounded-[24px] border border-[#fb923c]/20 flex items-center justify-between overflow-hidden relative cursor-pointer active:scale-[0.96] transition-all"
              >
                <div className="relative z-10">
                  <span className="bg-[#fb923c]/10 text-[#fb923c] px-3 py-1 rounded-full font-label-sm text-label-sm mb-2 inline-block">Mestre do Solo</span>
                  <h4 className="font-section-heading text-section-heading text-white">{c.titulo}</h4>
                  <p className="font-caption text-caption text-text-muted">{c.descricao}</p>
                </div>
                <div className="w-24 h-24 bg-[#fb923c]/10 rounded-full flex items-center justify-center relative z-10">
                  <span className="material-symbols-outlined text-5xl text-[#fb923c]" style={{ fontVariationSettings: "'FILL' 1" }}>{c.icone}</span>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#fb923c]/5 blur-3xl -mr-10 -mt-10" />
              </div>
            ))}

            {/* Small Grid Cards */}
            {conquistas.slice(1).map((c) => (
              <div
                key={c.id}
                className={`p-5 bg-surface-card rounded-xl border border-outline-variant active:scale-[0.96] transition-all cursor-pointer ${
                  !c.desbloqueada ? 'opacity-60' : ''
                }`}
              >
                <div className="w-12 h-12 mb-4 bg-surface-container-highest rounded-lg flex items-center justify-center">
                  <span className={`material-symbols-outlined ${c.desbloqueada ? 'text-[#fb923c]' : 'text-outline'}`}>
                    {c.icone}
                  </span>
                </div>
                <h4 className="font-label-sm text-label-sm text-white font-bold mb-1">{c.titulo}</h4>
                <p className="font-caption text-caption text-text-muted">{c.descricao}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Activities */}
        <section className="mb-stack-lg">
          <h3 className="font-section-heading text-section-heading mb-4 px-1">Atividades Recentes</h3>
          <div className="space-y-stack-sm">
            {atividades.map((a) => (
              <div key={a.id} className={`flex items-center gap-4 p-4 bg-surface-container-low rounded-xl border-l-4 ${corClasses[a.cor]}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  a.cor === 'highlight-orange' ? 'bg-[#fb923c]/20' : a.cor === 'primary' ? 'bg-primary/20' : 'bg-secondary/20'
                }`}>
                  <span className={`material-symbols-outlined text-sm ${
                    a.cor === 'highlight-orange' ? 'text-[#fb923c]' : a.cor === 'primary' ? 'text-primary' : 'text-secondary'
                  }`}>{a.icone}</span>
                </div>
                <div className="flex-grow">
                  <p className="font-label-sm text-label-sm text-white">
                    {a.usuario} {a.acao} <span className={`font-bold ${
                      a.cor === 'highlight-orange' ? 'text-[#fb923c]' : a.cor === 'primary' ? 'text-primary' : 'text-secondary'
                    }`}>"{a.target}"</span>
                  </p>
                  <p className="font-caption text-caption text-text-muted">{a.tempo} • +{a.pontos} pts</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
