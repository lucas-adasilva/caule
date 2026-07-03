import { useVersionCheck } from '@/hooks/useVersionCheck';

export function UpdateDialog() {
  const { hasUpdate, showDialog, versionInfo, currentVersion, downloadUpdate, dismissUpdate } = useVersionCheck();

  if (!hasUpdate || !showDialog || !versionInfo) return null;

  const isForce = versionInfo.forceUpdate;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={isForce ? undefined : dismissUpdate} />
      <div className="relative bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-outline-variant space-y-4">
        {/* Ícone */}
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-primary">system_update</span>
          </div>
        </div>

        {/* Título */}
        <div className="text-center">
          <h3 className="font-bold text-lg text-on-surface">
            {isForce ? 'Atualização Obrigatória' : 'Nova Versão Disponível'}
          </h3>
          <p className="text-sm text-on-surface-variant mt-1">
            Versão {versionInfo.latestVersion} está disponível
            {currentVersion !== '1.0.0' && ` (você tem ${currentVersion})`}
          </p>
        </div>

        {/* Release Notes */}
        {versionInfo.releaseNotes && (
          <div className="bg-surface-container-low rounded-xl p-3 max-h-32 overflow-y-auto">
            <p className="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line">
              {versionInfo.releaseNotes}
            </p>
          </div>
        )}

        {/* Botões */}
        <div className="space-y-2">
          <button
            onClick={downloadUpdate}
            className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">download</span>
            Baixar Atualização
          </button>

          {!isForce && (
            <button
              onClick={dismissUpdate}
              className="w-full bg-surface-container text-on-surface font-bold py-3 rounded-xl border border-outline-variant hover:bg-surface-container-high transition-all"
            >
              Depois
            </button>
          )}
        </div>

        {/* Info */}
        <p className="text-[10px] text-on-surface-variant text-center">
          O download será feito pelo navegador. Instale o APK manualmente.
        </p>
      </div>
    </div>
  );
}
