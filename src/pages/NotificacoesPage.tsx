import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { TopAppBar } from '@/components/TopAppBar';
import { syncBadgeCount } from '@/utils/badge';

interface Notificacao {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: 'convite' | 'tarefa' | 'sistema';
  lida: boolean;
  createdAt: string;
}

export function NotificacoesPage() {
  const { user } = useAuthStore();
  const [notifs, setNotifs] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregarNotificacoes(); }, [user?.uid]);

  async function carregarNotificacoes() {
    if (!user?.uid) { setLoading(false); return; }
    try {
      const q = query(collection(db, 'notificacoes'), where('destinatarioId', '==', user.uid));
      const snap = await getDocs(q);
      const lista: Notificacao[] = [];
      snap.forEach(d => {
        const data = d.data();
        lista.push({
          id: d.id,
          titulo: data.titulo || 'Notificacao',
          mensagem: data.mensagem || '',
          tipo: data.tipo || 'sistema',
          lida: data.lida || false,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString('pt-BR') : data.createdAt,
        });
      });
      setNotifs(lista.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (e) { console.error(e); }
    setLoading(false);
    syncBadgeCount(user?.uid);
  }

  async function marcarLida(notifId: string) {
    try {
      await updateDoc(doc(db, 'notificacoes', notifId), { lida: true });
      setNotifs(prev => prev.map(n => n.id === notifId ? { ...n, lida: true } : n));
      syncBadgeCount(user?.uid);
    } catch (e) { console.error(e); }
  }

  async function excluirNotificacao(notifId: string) {
    if (!confirm('Excluir esta notificação?')) return;
    try {
      await deleteDoc(doc(db, 'notificacoes', notifId));
      setNotifs(prev => prev.filter(n => n.id !== notifId));
      syncBadgeCount(user?.uid);
    } catch (e) { console.error(e); }
  }

  const tipoIcon = { convite: 'mail', tarefa: 'check_circle', sistema: 'info' };
  const tipoColor = { convite: 'text-tertiary', tarefa: 'text-primary', sistema: 'text-on-surface-variant' };

  return (
    <div className="min-h-screen bg-surface text-text-body font-body-md pb-32">
      <TopAppBar title="Notificações" showMenu={false} showNotifications={false} />
      <main className="px-margin-page mt-stack-md space-y-4">
        <div className="mb-stack-lg">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Notificações</h2>
          <p className="text-text-muted font-body-md">{notifs.filter(n => !n.lida).length} nao lidas</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><span className="material-symbols-outlined animate-spin text-primary text-3xl">refresh</span></div>
        ) : notifs.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">notifications_off</span>
            <p className="text-text-muted">Nenhuma notificacao</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifs.map(n => (
              <div
                key={n.id}
                className={`w-full bg-surface-card rounded-xl border p-4 transition-all relative ${
                  n.lida ? 'border-outline-variant/50' : 'border-primary/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`material-symbols-outlined text-2xl flex-shrink-0 ${tipoColor[n.tipo]}`}>{tipoIcon[n.tipo]}</span>
                  <div className="flex-1 min-w-0">
                    <h4 className={`font-bold text-base ${n.lida ? 'text-on-surface-variant' : 'text-on-surface'}`}>{n.titulo}</h4>
                    <div className="text-sm mt-2 leading-relaxed bg-white rounded-xl p-3 w-full overflow-x-auto" dangerouslySetInnerHTML={{ __html: n.mensagem }} />
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[10px] text-on-surface-variant/60 bg-surface-container-high px-2 py-0.5 rounded-full font-medium">
                        {n.createdAt}
                      </span>
                      {!n.lida && (
                        <button
                          onClick={() => marcarLida(n.id)}
                          className="text-[10px] text-primary font-bold hover:underline"
                        >
                          Marcar como lida
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {!n.lida && <div className="w-2.5 h-2.5 bg-primary rounded-full" />}
                    <button
                      onClick={() => excluirNotificacao(n.id)}
                      className="p-1.5 text-error/60 hover:text-error hover:bg-error/10 rounded-lg transition-all"
                      title="Excluir notificação"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
