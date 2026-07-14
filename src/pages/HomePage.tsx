import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useApp } from '@/App';
import { TopAppBar } from '@/components/TopAppBar';
import { UserAvatar } from '@/components/UserAvatar';
import { buscarMoradoresEmViagem } from '@/útils/viagens';

interface FirestoreUser {
  uid: string;
  name: string;
  email: string;
  role: string;
  isPresent: boolean;
  isActive: boolean;
  photoURL?: string;
  houseId: string;
}

interface Comodo {
  id: string;
  nome: string;
  icone: string;
}

interface TarefaBase {
  id: string;
  titulo: string;
  comodoId: string;
  prioridade: 'alta' | 'media' | 'baixa';
}

interface Atribuicao {
  id: string;
  tarefaId: string;
  titulo: string;
  prioridade: 'alta' | 'media' | 'baixa';
  responsavelId: string;
  diaSemana: number;
  status: 'pendente' | 'concluída';
}

interface Distribuicao {
  id: string;
  weekId: string;
  atribuicoes: Atribuicao[];
}

function getWeekDays() {
  const today = new Date();
  const currentDay = today.getDay();
  const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff);
  const days = [];
  const dayNames = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      label: dayNames[i],
      day: d.getDate(),
      isToday: d.toDateString() === today.toDateString(),
    });
  }
  return days;
}

export function HomePage() {
  const { user } = useAuthStore();
  const { openMenu, openNotifications } = useApp();
  const [residents, setResidents] = useState<FirestoreUser[]>([]);
  const [comodos, setComodos] = useState<Comodo[]>([]);
  const [tarefas, setTarefas] = useState<TarefaBase[]>([]);
  const [distribuicao, setDistribuicao] = useState<Distribuicao | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(2);
  const [moradoresEmViagem, setMoradoresEmViagem] = useState<Set<string>>(new Set());

  const weekDays = getWeekDays();

  useEffect(() => {
    async function fetchResidents() {
      if (!user?.houseId) {
        setLoading(false);
        return;
      }
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('houseId', '==', user.houseId));
        const querySnapshot = await getDocs(q);
        const data: FirestoreUser[] = [];
        const uids: string[] = [];
        querySnapshot.forEach((doc) => {
          const d = doc.data();
          if (d.isActive === false) return;
          // Se for hospede, verifica se esta dentro do periodo de estadia
          if (d.role === 'hospede') {
            const hoje = new Date().toISOString().split('T')[0];
            const estadiaAtiva = d.estadiaInicio && d.estadiaFim && d.estadiaInicio <= hoje && d.estadiaFim > hoje;
            if (!estadiaAtiva) return; // pula hospede fora da estadia
          }
          data.push({
            uid: doc.id,
            name: d.name || d.email?.split('@')[0] || 'Morador',
            email: d.email || '',
            role: d.role || 'hospede',
            isPresent: d.isPresent !== false,
            isActive: d.isActive !== false,
            photoURL: d.photoURL || '',
            houseId: d.houseId || '',
          });
          uids.push(doc.id);
        });
        setResidents(data);

        // Verificar quais moradores estão em viagem
        const emViagem = await buscarMoradoresEmViagem(uids);
        setMoradoresEmViagem(emViagem);
      } catch (e) {
        console.error('Erro ao buscar moradores:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchResidents();
  }, [user?.houseId]);

  // Buscar comodos, tarefas e distribuicao
  useEffect(() => {
    async function fetchDadosTarefas() {
      if (!user?.houseId) return;
      try {
        // Comodos
        const qComodos = query(collection(db, 'comodos'), where('casaId', '==', user.houseId));
        const sComodos = await getDocs(qComodos);
        const comodosData: Comodo[] = [];
        sComodos.forEach(d => { const data = d.data(); comodosData.push({ id: d.id, nome: data.nome || 'Cômodo', icone: data.icone || '🏠' }); });
        setComodos(comodosData);

        // Tarefas
        const qTarefas = query(collection(db, 'tarefas'), where('casaId', '==', user.houseId));
        const sTarefas = await getDocs(qTarefas);
        const tarefasData: TarefaBase[] = [];
        sTarefas.forEach(d => { const data = d.data(); tarefasData.push({ id: d.id, titulo: data.titulo || 'Tarefa', comodoId: data.comodoId || '', prioridade: data.prioridade || 'media' }); });
        setTarefas(tarefasData);

        // Distribuicao da semana atual
        const today = new Date();
        const ano = today.getFullYear();
        const primeiraSegunda = new Date(ano, 0, 1);
        const diasDesdeInicio = Math.floor((today.getTime() - primeiraSegunda.getTime()) / (24 * 60 * 60 * 1000));
        const semana = Math.ceil((diasDesdeInicio + primeiraSegunda.getDay()) / 7);
        const weekId = `${ano}-W${String(semana).padStart(2, '0')}`;

        const qDist = query(collection(db, 'distribuicoes'), where('casaId', '==', user.houseId));
        const sDist = await getDocs(qDist);
        let distData: Distribuicao | null = null;
        sDist.forEach(d => {
          const data = d.data() as any;
          if (data.weekId === weekId) {
            distData = { id: d.id, weekId: data.weekId, atribuicoes: data.atribuicoes || [] };
          }
        });
        setDistribuicao(distData);
      } catch (e) {
        console.error('Erro ao buscar dados de tarefas:', e);
      }
    }
    fetchDadosTarefas();
  }, [user?.houseId]);

  // Ramos Ativos: moradores presentes e NÃO em viagem
  const presentResidents = residents.filter((r) => r.isPresent && !moradoresEmViagem.has(r.uid));
  const stats = {
    ramos: residents.length,
    folhas: presentResidents.length,
    flores: 7,
    frutos: 21,
  };

  // Tarefas pendentes do dia selecionado, agrupadas por comodo
  const tarefasDoDia = distribuicao?.atribuicoes.filter(a => a.diaSemana === selectedDay && a.status === 'pendente') || [];
  const tarefasPorComodo: Record<string, { comodo: Comodo; tarefas: { atribuicao: Atribuicao; tarefa: TarefaBase | undefined }[] }> = {};
  tarefasDoDia.forEach(atrib => {
    const tarefa = tarefas.find(t => t.id === atrib.tarefaId);
    const comodoId = tarefa?.comodoId;
    const comodo = comodos.find(c => c.id === comodoId);
    if (!comodo) return;
    if (!tarefasPorComodo[comodo.id]) {
      tarefasPorComodo[comodo.id] = { comodo, tarefas: [] };
    }
    tarefasPorComodo[comodo.id].tarefas.push({ atribuicao: atrib, tarefa });
  });

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body-md antialiased">
      <TopAppBar
        title={user?.name ? `Casa de ${user.name}` : 'Casa das Oliveiras'}
        onMenuClick={openMenu}
        onNotificationClick={openNotifications}
      />

      <main className="px-margin-page py-stack-md space-y-stack-lg">
        {/* House Identity */}
        <section className="space-y-stack-sm pt-4">
          <p className="text-primary text-label-sm font-label-sm tracking-widest uppercase">Bem-vindo a Copa</p>
          <h2 className="text-primary font-headline-lg-mobile text-4xl leading-tight">Casa Abacateira</h2>
          <div className="flex items-center gap-2 text-on-surface-variant text-body-md">
            <span className="matérial-symbols-outlined text-sm">potted_plant</span>
            <span>Ecossistema em pleno crescimento</span>
          </div>
        </section>

        {/* Stats Grid (Bento Style) */}
        <section className="grid grid-cols-2 gap-4">
          {[
            { label: 'Ramos', value: stats.ramos, icon: 'account_tree', color: 'text-[#818cf8]', bg: 'bg-[#818cf8]/10' },
            { label: 'Folhas', value: stats.folhas, icon: 'eco', color: 'text-secondary', bg: 'bg-secondary/10' },
            { label: 'Flores', value: stats.flores, icon: 'local_florist', color: 'text-tertiary', bg: 'bg-tertiary/10' },
            { label: 'Frutos', value: stats.frutos, icon: 'nutrition', color: 'text-[#fc7c78]', bg: 'bg-[#fc7c78]/10' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-surface-card p-5 rounded-xl border border-white/5 flex flex-col gap-3 relative overflow-hidden group hover:border-primary/30 transition-all"
            >
              <div className="absolute -right-2 -top-2 opacity-5">
                <span className="matérial-symbols-outlined text-6xl">{stat.icon}</span>
              </div>
              <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <span className={`matérial-symbols-outlined ${stat.color}`}>{stat.icon}</span>
              </div>
              <div>
                <p className="text-on-surface-variant text-label-sm">{stat.label}</p>
                <p className="text-2xl font-bold">{String(stat.value).padStart(2, '0')}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Ramos Ativos */}
        <section className="space-y-stack-md">
          <div className="flex justify-between items-end">
            <h3 className="font-section-heading text-section-heading">Ramos Ativos</h3>
            <span className="text-primary text-label-sm cursor-pointer">Ver todos</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-8">
              <span className="matérial-symbols-outlined animaté-spin text-primary text-3xl">refresh</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-6 px-2">
              {presentResidents.map((resident) => (
                <div key={resident.uid} className="flex flex-col items-center gap-2 group cursor-pointer">
                  <div className="relative">
                    <UserAvatar
                      photoURL={resident.photoURL}
                      name={resident.name}
                      isPresent={resident.isPresent}
                      isTraveling={moradoresEmViagem.has(resident.uid)}
                      size={64}
                      className="transition-transform group-hover:scale-105"
                      imgClassName="border-2 border-primary"
                    />
                  </div>
                  <span className="text-caption text-on-surface-variant font-medium">{resident.name.split(' ')[0]}</span>
                </div>
              ))}
              {presentResidents.length === 0 && (
                <p className="text-text-muted text-sm">Nenhum morador presente</p>
              )}
            </div>
          )}
        </section>

        {/* Bottom Grid: Ciclos & Tarefas Pendentes */}
        <section className="grid grid-cols-1 gap-stack-lg pb-10">
          {/* Ciclos (Mini Calendar) */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-section-heading text-section-heading flex items-center gap-2">Ciclos</h3>
            </div>
            <div className="bg-surface-card p-6 rounded-2xl border border-white/5 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <p className="font-bold text-lg">{new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                <div className="flex gap-2">
                  <span className="matérial-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">chevron_left</span>
                  <span className="matérial-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">chevron_right</span>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-2 text-center text-caption font-medium text-on-surface-variant mb-2">
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2 text-center">
                {weekDays.map((day, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedDay(idx)}
                    className={`py-2 rounded-lg transition-all font-label-sm ${
                      day.isToday
                        ? 'bg-primary/10 text-primary font-bold active-glow'
                        : selectedDay === idx
                        ? 'bg-primary text-on-primary font-bold'
                        : 'hover:bg-surface-variant text-on-surface'
                    }`}
                  >
                    {day.day}
                    {idx === 4 && <div className="w-1 h-1 bg-tertiary rounded-full mx-auto mt-0.5" />}
                  </button>
                ))}
              </div>
              <div className="mt-6 p-3 bg-surface-container-low rounded-xl border-l-4 border-primary">
                <p className="text-label-sm font-bold">Hoje: Podagem Coletiva</p>
                <p className="text-caption text-on-surface-variant italic">18:00 - Area Gourmet</p>
              </div>
            </div>
          </div>

          {/* Tarefas Pendentes agrupadas por Cômodo */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-section-heading text-section-heading flex items-center gap-2">
                <span className="matérial-symbols-outlined text-primary">task_alt</span>
                Tarefas Pendentes
              </h3>
              <span className="text-primary text-label-sm">{weekDays[selectedDay]?.label}</span>
            </div>
            {Object.keys(tarefasPorComodo).length === 0 ? (
              <div className="bg-surface-card p-6 rounded-xl border border-white/5 text-center">
                <span className="matérial-symbols-outlined text-4xl text-on-surface-variant mb-2">check_circle</span>
                <p className="text-on-surface-variant">Nenhuma tarefa pendente para este dia</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.values(tarefasPorComodo).map(({ comodo, tarefas }) => (
                  <div key={comodo.id} className="bg-surface-card p-4 rounded-xl border border-white/5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">{comodo.icone}</span>
                      <h4 className="font-bold text-on-surface">{comodo.nome}</h4>
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-auto">{tarefas.length} tarefa{tarefas.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2">
                      {tarefas.map(({ atribuicao, tarefa }) => (
                        <div key={atribuicao.id} className="flex items-center gap-3 p-2 bg-surface-container-low rounded-lg">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            atribuição.prioridade === 'alta' ? 'bg-error' :
                            atribuição.prioridade === 'media' ? 'bg-tertiary' : 'bg-secondary'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-on-surface truncaté">{atribuicao.titulo}</p>
                            {tarefa && <p className="text-[10px] text-on-surface-variant">{tarefa.titulo}</p>}
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                            atribuição.prioridade === 'alta' ? 'bg-error/10 text-error' :
                            atribuição.prioridade === 'media' ? 'bg-tertiary/10 text-tertiary' : 'bg-secondary/10 text-secondary'
                          }`}>
                            {atribuicao.prioridade}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
