import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TopAppBar } from '@/components/TopAppBar';
import { UserAvatar } from '@/components/UserAvatar';
import { useApp } from '@/App';
import { useAuthStore } from '@/stores/authStore';
import { buscarMoradoresEmViagem } from '@/utils/viagens';
import { formatPhoneCompleto } from '@/utils/formatters';

interface Pessoa {
  uid: string;
  name: string;
  photoURL?: string;
  phone?: string;
  role: string;
}

function estadiaAtiva(estadiaInicio?: string, estadiaFim?: string): boolean {
  if (!estadiaInicio || !estadiaFim) return false;
  const hoje = new Date().toISOString().split('T')[0];
  return estadiaInicio <= hoje && estadiaFim > hoje;
}

function PessoaCard({ pessoa, tag }: { pessoa: Pessoa; tag?: string }) {
  const telefone = pessoa.phone ? pessoa.phone.replace(/\D/g, '') : '';
  return (
    <div className="flex flex-col items-center gap-1 w-20 text-center">
      <UserAvatar photoURL={pessoa.photoURL} name={pessoa.name} size={56} showPresence={false} />
      <span className="text-xs font-bold text-on-surface truncate w-full">{pessoa.name.split(' ')[0]}</span>
      {tag && <span className="text-[9px] text-page-ramos -mt-1">{tag}</span>}
      {telefone ? (
        <a
          href={`https://wa.me/${telefone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 text-[10px] text-on-surface-variant hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[12px]">call</span>
          <span className="truncate">{formatPhoneCompleto(pessoa.phone || '')}</span>
        </a>
      ) : (
        <span className="text-[10px] text-on-surface-variant">Sem contato</span>
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
        const pessoa: Pessoa = { uid: d.id, name: data.name || 'Sem nome', photoURL: data.photoURL || '', phone: data.phone || '', role: data.role || 'hospede' };
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

  useEffect(() => { carregarDados(); }, [user?.houseId]);

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
                  {presentes.map(p => <PessoaCard key={p.uid} pessoa={p} tag={p.role === 'hospede' ? 'Hóspede' : undefined} />)}
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
          </div>
        )}
      </main>
    </div>
  );
}
