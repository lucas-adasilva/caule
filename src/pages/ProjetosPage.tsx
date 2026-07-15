import { TopAppBar } from '@/components/TopAppBar';
import { useApp } from '@/App';

export function ProjetosPage() {
  const { openMenu, openNotifications } = useApp();

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body-md pb-32">
      <TopAppBar
        onMenuClick={openMenu}
        onNotificationClick={openNotifications}
        title="Projetos"
        titleColor="text-page-sementes" />

      <main className="px-margin-page pb-8">
        <section className="mt-6 mb-8">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-page-sementes">Sementes</h2>
          <p className="font-body-md text-text-muted">Projetos da Casa</p>
        </section>

        <section className="flex flex-col items-center text-center py-16 px-6 bg-surface-card rounded-2xl border border-outline-variant">
          <span className="text-7xl mb-6">🌰</span>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-page-sementes/15 rounded-full mb-6">
            <div className="w-2 h-2 bg-page-sementes rounded-full animate-pulse" />
            <span className="text-page-sementes text-sm font-medium">Em desenvolvimento</span>
          </div>
          <p className="text-on-surface text-base leading-relaxed max-w-sm">
            Estamos cultivando esta sessão com carinho! 🌿
          </p>
          <p className="text-text-muted text-sm mt-3 max-w-sm">
            Em breve você poderá aproveitar tudo o que estamos preparando por aqui.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <div className="w-3 h-3 bg-page-sementes rounded-full" />
            <div className="w-3 h-3 bg-page-sementes/60 rounded-full" />
            <div className="w-3 h-3 bg-page-sementes/30 rounded-full" />
            <div className="w-3 h-3 bg-surface-container-highest rounded-full" />
            <div className="w-3 h-3 bg-surface-container-highest rounded-full" />
          </div>
        </section>
      </main>
    </div>
  );
}
