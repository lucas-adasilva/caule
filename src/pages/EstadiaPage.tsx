import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { TopAppBar } from '@/components/TopAppBar';
import { redistribuirPorEntrada, redistribuirPorSaida } from '@/utils/distribuicao';
import { getSemanaDaData } from '@/utils/semana';

export function EstadiaPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [estadiaInicio, setEstadiaInicio] = useState('');
  const [estadiaFim, setEstadiaFim] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.estadiaInicio) setEstadiaInicio(user.estadiaInicio);
    if (user?.estadiaFim) setEstadiaFim(user.estadiaFim);
  }, [user]);

  async function handleSalvar() {
    setErro(''); setSucesso('');
    if (!estadiaInicio || !estadiaFim) {
      setErro('Preencha a data de início e a data de fim da estadia.');
      return;
    }
    if (estadiaFim <= estadiaInicio) {
      setErro('A data de fim deve ser após a data de início.');
      return;
    }
    if (!user?.uid) {
      setErro('Usuário não autenticado.');
      return;
    }
    setLoading(true);
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const estadiaAtiva = estadiaInicio <= hoje && estadiaFim > hoje;
      const estavaAtiva = user?.estadiaInicio && user?.estadiaFim && user.estadiaInicio <= hoje && user.estadiaFim > hoje;
      await updateDoc(doc(db, 'users', user.uid), {
        estadiaInicio,
        estadiaFim,
        isPresent: estadiaAtiva,
        updatedAt: new Date().toISOString(),
      });
      setSucesso(estadiaAtiva
        ? 'Estadia definida! Você pode usar o app normalmente.'
        : `Estadia definida, mas ainda não está ativa. Volte em ${estadiaInicio}.`);
      // Redistribui tarefas se o estado mudou
      if (user?.houseId && estavaAtiva !== estadiaAtiva) {
        const semanaAtual = getSemanaDaData(new Date());
        try {
          if (!estavaAtiva && estadiaAtiva) {
            await redistribuirPorEntrada(user.uid, user.houseId, semanaAtual.weekId, 'estadia_iniciada', estadiaInicio, estadiaFim);
          } else if (estavaAtiva && !estadiaAtiva) {
            await redistribuirPorSaida(user.uid, user.houseId, semanaAtual.weekId, 'estadia_terminada');
          }
        } catch (err: any) {
          console.error('Erro ao redistribuir por mudança de estadia:', err);
        }
      }
      // Atualiza localmente e redireciona se ativa
      if (estadiaAtiva) {
        setTimeout(() => navigate('/app', { replace: true }), 1500);
      }
    } catch (e: any) {
      setErro('Erro ao salvar: ' + e.message);
    }
    setLoading(false);
  }

  const hoje = new Date().toISOString().split('T')[0];
  const estadiaExpirada = user?.estadiaFim && user.estadiaFim <= hoje;
  const estadiaFutura = user?.estadiaInicio && user.estadiaInicio > hoje;

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <TopAppBar title="Minha Estadia" showMenu={false} showNotifications={false} />
      <main className="px-margin-page mt-stack-md space-y-6 pb-10">
        {/* Header */}
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-tertiary mb-3">luggage</span>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Bem-vindo, Hóspede!</h2>
          <p className="text-text-muted font-body-md mt-2">
            Para usar o app, defina o período da sua estadia nesta casa.
          </p>
        </div>

        {/* Status atual */}
        {user?.estadiaInicio && user?.estadiaFim && (
          <div className={`rounded-xl border p-4 text-center ${estadiaExpirada ? 'bg-error/10 border-error/30' : estadiaFutura ? 'bg-tertiary/10 border-tertiary/30' : 'bg-primary/10 border-primary/30'}`}>
            <span className={`material-symbols-outlined text-3xl mb-2 ${estadiaExpirada ? 'text-error' : estadiaFutura ? 'text-tertiary' : 'text-primary'}`}>
              {estadiaExpirada ? 'event_busy' : estadiaFutura ? 'event_upcoming' : 'event_available'}
            </span>
            <p className={`text-sm font-bold ${estadiaExpirada ? 'text-error' : estadiaFutura ? 'text-tertiary' : 'text-primary'}`}>
              {estadiaExpirada
                ? 'Sua estadia expirou. Defina novas datas.'
                : estadiaFutura
                ? `Sua estadia começa em ${user.estadiaInicio}.`
                : 'Sua estadia está ativa!'}
            </p>
            {user.estadiaInicio && user.estadiaFim && (
              <p className="text-[10px] text-on-surface-variant mt-1">
                {user.estadiaInicio} → {user.estadiaFim}
              </p>
            )}
          </div>
        )}

        {/* Form */}
        <div className="bg-surface-card rounded-xl border border-outline-variant p-5 space-y-4">
          <h3 className="font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">edit_calendar</span>
            Definir Período de Estadia
          </h3>

          <div>
            <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Data de Início *</label>
            <input
              type="date"
              value={estadiaInicio}
              onChange={(e) => setEstadiaInicio(e.target.value)}
              className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
            />
          </div>

          <div>
            <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Data de Fim *</label>
            <input
              type="date"
              value={estadiaFim}
              onChange={(e) => setEstadiaFim(e.target.value)}
              min={estadiaInicio || hoje}
              className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
            />
          </div>

          {/* Mensagens */}
          {erro && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>{erro}
            </div>
          )}
          {sucesso && (
            <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-primary text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">check_circle</span>{sucesso}
            </div>
          )}

          <button
            onClick={handleSalvar}
            disabled={loading}
            className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin">refresh</span>
            ) : (
              <>
                <span className="material-symbols-outlined">save</span>
                Salvar Estadia
              </>
            )}
          </button>
        </div>

        {/* Info */}
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/50 p-4 text-center">
          <span className="material-symbols-outlined text-on-surface-variant text-2xl mb-2">info</span>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Durante sua estadia, você poderá ver as tarefas da casa e participar da rotina. 
            Fora do período, seu acesso será limitado. Fale com um morador da casa para ajudar.
          </p>
        </div>
      </main>
    </div>
  );
}
