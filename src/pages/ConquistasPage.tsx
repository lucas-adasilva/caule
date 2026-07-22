import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TopAppBar } from '@/components/TopAppBar';
import { useApp } from '@/App';
import { useAuthStore } from '@/stores/authStore';
import { proximaSemana, semanaAnterior } from '@/utils/distribuicao';

interface Atribuicao {
  id: string;
  diaSemana: number;
  status: 'pendente' | 'concluída' | 'concluida';
}
interface Distribuicao {
  id: string;
  weekId: string;
  casaId: string;
  atribuicoes: Atribuicao[];
}

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

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function getSemanaAtualWeekId(): string {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const primeiraSegunda = new Date(ano, 0, 1);
  const diasDesdeInicio = Math.floor((hoje.getTime() - primeiraSegunda.getTime()) / (24 * 60 * 60 * 1000));
  const semana = Math.ceil((diasDesdeInicio + primeiraSegunda.getDay()) / 7);
  return `${ano}-W${String(semana).padStart(2, '0')}`;
}

// Segunda-feira real (ISO, ancorada em 4 de janeiro) de uma semana - usada so pra atribuir cada
// semana a um mes/ano (pelo dia em que ela comeca), igual ao mesmo calculo ja usado em
// moradorViajandoNaSemana/intervaloDaSemana em outras partes do app.
function segundaDaSemana(weekId: string): Date {
  const match = weekId.match(/(\d+)-W(\d+)/);
  if (!match) return new Date(NaN);
  const ano = parseInt(match[1], 10);
  const semana = parseInt(match[2], 10);
  const jan4 = new Date(ano, 0, 4);
  const primeiraSegunda = new Date(jan4.getTime() - ((jan4.getDay() + 6) % 7) * 24 * 60 * 60 * 1000);
  return new Date(primeiraSegunda.getTime() + (semana - 1) * 7 * 24 * 60 * 60 * 1000);
}

function formatarDataCurta(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function calcularPercentual(atribuicoes: Atribuicao[]): { pct: number; concluidas: number; total: number } {
  const total = atribuicoes.length;
  const concluidas = atribuicoes.filter(a => a.status === 'concluida' || a.status === 'concluída').length;
  return { pct: total > 0 ? Math.round((concluidas / total) * 100) : 0, concluidas, total };
}

function BarraPercentual({ label, sub, pct, destaque }: { label: string; sub?: string; pct: number; destaque?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${destaque ? 'p-3 bg-page-frutos/10 rounded-xl' : ''}`}>
      <div className="w-16 flex-shrink-0">
        <p className={`text-xs font-bold ${destaque ? 'text-page-frutos' : 'text-on-surface'}`}>{label}</p>
        {sub && <p className="text-[10px] text-on-surface-variant">{sub}</p>}
      </div>
      <div className="flex-1 h-2.5 bg-surface-container-highest rounded-full overflow-hidden">
        <div className="h-full bg-page-frutos rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-10 text-right text-xs font-bold flex-shrink-0 ${destaque ? 'text-page-frutos' : 'text-on-surface-variant'}`}>{pct}%</span>
    </div>
  );
}

export function ConquistasPage() {
  const { openMenu, openNotifications } = useApp();
  const { user } = useAuthStore();
  const [distribuicoes, setDistribuicoes] = useState<Distribuicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [visao, setVisao] = useState<'semana' | 'mes' | 'ano'>('semana');
  const [weekIdSelecionado, setWeekIdSelecionado] = useState(getSemanaAtualWeekId());
  const hoje = new Date();
  const [anoSelecionado, setAnoSelecionado] = useState(hoje.getFullYear());
  const [mesSelecionado, setMesSelecionado] = useState(hoje.getMonth());

  useEffect(() => {
    async function carregar() {
      if (!user?.houseId) { setLoading(false); return; }
      try {
        const q = query(collection(db, 'distribuicoes'), where('casaId', '==', user.houseId));
        const snap = await getDocs(q);
        const lista: Distribuicao[] = [];
        snap.forEach(d => lista.push({ id: d.id, ...d.data() } as Distribuicao));
        setDistribuicoes(lista);
      } catch (e) { console.error('[Conquistas] Erro ao carregar distribuições:', e); }
      setLoading(false);
    }
    carregar();
  }, [user?.houseId]);

  function mesAnteriorNav() {
    setMesSelecionado(prev => {
      if (prev === 0) { setAnoSelecionado(a => a - 1); return 11; }
      return prev - 1;
    });
  }
  function mesSeguinteNav() {
    setMesSelecionado(prev => {
      if (prev === 11) { setAnoSelecionado(a => a + 1); return 0; }
      return prev + 1;
    });
  }

  // ===== SEMANA =====
  const distSemana = distribuicoes.find(d => d.weekId === weekIdSelecionado);
  const segundaSemana = segundaDaSemana(weekIdSelecionado);
  const diasDaSemana = Array.from({ length: 7 }, (_, i) => { const d = new Date(segundaSemana); d.setDate(d.getDate() + i); return d; });
  const percentualPorDia = DIAS_SEMANA.map((_, idx) => calcularPercentual((distSemana?.atribuicoes || []).filter(a => a.diaSemana === idx)));
  const totalSemana = calcularPercentual(distSemana?.atribuicoes || []);

  // ===== MES =====
  const semanasDoMes = distribuicoes
    .filter(d => { const seg = segundaDaSemana(d.weekId); return seg.getFullYear() === anoSelecionado && seg.getMonth() === mesSelecionado; })
    .sort((a, b) => segundaDaSemana(a.weekId).getTime() - segundaDaSemana(b.weekId).getTime());
  const totalMes = calcularPercentual(semanasDoMes.flatMap(d => d.atribuicoes));

  // ===== ANO =====
  const distribuicoesPorMes: Distribuicao[][] = Array.from({ length: 12 }, (_, mes) =>
    distribuicoes.filter(d => { const seg = segundaDaSemana(d.weekId); return seg.getFullYear() === anoSelecionado && seg.getMonth() === mes; })
  );
  const percentualPorMes = distribuicoesPorMes.map(lista => calcularPercentual(lista.flatMap(d => d.atribuicoes)));
  const totalAno = calcularPercentual(distribuicoesPorMes.flat().flatMap(d => d.atribuicoes));

  const corClasses = {
    'highlight-orange': 'border-l-page-frutos text-page-frutos bg-page-frutos/20',
    'primary': 'border-l-primary text-primary bg-primary/20',
    'secondary': 'border-l-secondary text-secondary bg-secondary/20',
  };

  return (
    <div className="min-h-screen bg-surface text-on-background font-body-md pb-32">
      <TopAppBar
        onMenuClick={openMenu}
        onNotificationClick={openNotifications}
        title="Conquistas"
        titleColor="text-page-frutos" />

      <main className="px-margin-page pb-8">
        {/* Title Section */}
        <section className="mt-6 mb-8">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-page-frutos">Frutos</h2>
          <p className="font-body-md text-text-muted">Conquistas da Casa</p>
        </section>

        {/* Percentual de Tarefas Concluídas */}
        <section className="mb-stack-lg p-4 bg-surface-container rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-section-heading text-section-heading flex items-center gap-2">
              <span className="material-symbols-outlined text-page-frutos">task_alt</span>
              Tarefas Concluídas
            </h3>
          </div>

          {/* Toggle Semana / Mês / Ano */}
          <div className="flex gap-1.5 bg-surface-container-high rounded-lg p-1">
            {(['semana', 'mes', 'ano'] as const).map(v => (
              <button
                key={v}
                onClick={() => setVisao(v)}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold capitalize transition-all ${
                  visao === v ? 'bg-page-frutos text-white' : 'text-on-surface-variant'
                }`}
              >
                {v === 'mes' ? 'Mês' : v}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-6"><span className="material-symbols-outlined animate-spin text-page-frutos text-2xl">refresh</span></div>
          ) : visao === 'semana' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button onClick={() => setWeekIdSelecionado(semanaAnterior(weekIdSelecionado))} className="p-1 text-on-surface-variant hover:text-page-frutos rounded-full transition-colors">
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <span className="text-xs font-bold text-on-surface">
                  {formatarDataCurta(diasDaSemana[0])} - {formatarDataCurta(diasDaSemana[6])}
                </span>
                <button onClick={() => setWeekIdSelecionado(proximaSemana(weekIdSelecionado))} className="p-1 text-on-surface-variant hover:text-page-frutos rounded-full transition-colors">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
              <div className="space-y-2">
                {DIAS_SEMANA.map((dia, idx) => (
                  <BarraPercentual key={idx} label={dia} sub={formatarDataCurta(diasDaSemana[idx])} pct={percentualPorDia[idx].pct} />
                ))}
              </div>
              <BarraPercentual label="Semana" sub={`${totalSemana.concluidas}/${totalSemana.total} tarefas`} pct={totalSemana.pct} destaque />
            </div>
          ) : visao === 'mes' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button onClick={mesAnteriorNav} className="p-1 text-on-surface-variant hover:text-page-frutos rounded-full transition-colors">
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <span className="text-xs font-bold text-on-surface capitalize">{MESES[mesSelecionado]} de {anoSelecionado}</span>
                <button onClick={mesSeguinteNav} className="p-1 text-on-surface-variant hover:text-page-frutos rounded-full transition-colors">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
              {semanasDoMes.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-4">Nenhuma distribuição de tarefas neste mês</p>
              ) : (
                <div className="space-y-2">
                  {semanasDoMes.map((d, idx) => {
                    const { pct } = calcularPercentual(d.atribuicoes);
                    return <BarraPercentual key={d.id} label={`Sem. ${idx + 1}`} sub={formatarDataCurta(segundaDaSemana(d.weekId))} pct={pct} />;
                  })}
                </div>
              )}
              <BarraPercentual label="Mês" sub={`${totalMes.concluidas}/${totalMes.total} tarefas`} pct={totalMes.pct} destaque />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button onClick={() => setAnoSelecionado(a => a - 1)} className="p-1 text-on-surface-variant hover:text-page-frutos rounded-full transition-colors">
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <span className="text-sm font-bold text-on-surface">{anoSelecionado}</span>
                <button onClick={() => setAnoSelecionado(a => a + 1)} className="p-1 text-on-surface-variant hover:text-page-frutos rounded-full transition-colors">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
              <div className="space-y-2">
                {MESES.map((mes, idx) => (
                  <BarraPercentual key={idx} label={mes} pct={percentualPorMes[idx].pct} />
                ))}
              </div>
              <BarraPercentual label="Ano" sub={`${totalAno.concluidas}/${totalAno.total} tarefas`} pct={totalAno.pct} destaque />
            </div>
          )}
        </section>

        {/* Achievements Bento Grid */}
        <section className="mb-stack-lg">
          <div className="grid grid-cols-2 gap-gutter-grid">
            {/* Feature Card: Active Achievement */}
            {conquistas.filter(c => c.desbloqueada).slice(0, 1).map(c => (
              <div
                key={c.id}
                className="col-span-2 p-6 bg-surface-card rounded-[24px] border border-page-frutos/20 flex items-center justify-between overflow-hidden relative cursor-pointer active:scale-[0.96] transition-all"
              >
                <div className="relative z-10">
                  <span className="bg-page-frutos/10 text-page-frutos px-3 py-1 rounded-full font-label-sm text-label-sm mb-2 inline-block">Mestre do Solo</span>
                  <h4 className="font-section-heading text-section-heading text-white">{c.titulo}</h4>
                  <p className="font-caption text-caption text-text-muted">{c.descricao}</p>
                </div>
                <div className="w-24 h-24 bg-page-frutos/10 rounded-full flex items-center justify-center relative z-10">
                  <span className="material-symbols-outlined text-5xl text-page-frutos" style={{ fontVariationSettings: "'FILL' 1" }}>{c.icone}</span>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-page-frutos/5 blur-3xl -mr-10 -mt-10" />
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
                  <span className={`material-symbols-outlined ${c.desbloqueada ? 'text-page-frutos' : 'text-outline'}`}>
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
                  a.cor === 'highlight-orange' ? 'bg-page-frutos/20' : a.cor === 'primary' ? 'bg-primary/20' : 'bg-secondary/20'
                }`}>
                  <span className={`material-symbols-outlined text-sm ${
                    a.cor === 'highlight-orange' ? 'text-page-frutos' : a.cor === 'primary' ? 'text-primary' : 'text-secondary'
                  }`}>{a.icone}</span>
                </div>
                <div className="flex-grow">
                  <p className="font-label-sm text-label-sm text-white">
                    {a.usuario} {a.acao} <span className={`font-bold ${
                      a.cor === 'highlight-orange' ? 'text-page-frutos' : a.cor === 'primary' ? 'text-primary' : 'text-secondary'
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
