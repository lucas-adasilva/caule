import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { db } from '@/lib/firebase';
import { APP_VERSION } from '@/version';

interface AppVersion {
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
  forceUpdate: boolean;
}

export function useVersionCheck() {
  const [versionInfo, setVersionInfo] = useState<AppVersion | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('1.0.0');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Só verifica versão em plataforma nativa (APK)
    // Web/PWA são atualizadas automaticamente pelo deploy do Firebase
    if (!Capacitor.isNativePlatform()) {
      setChecking(false);
      return;
    }

    async function checkVersion() {
      try {
        const appVersion = APP_VERSION;
        setCurrentVersion(appVersion);
        console.log('[VersionCheck] Versão nativa:', appVersion);

        // Buscar versão mais recente no Firestore
        const versionDoc = await getDoc(doc(db, 'appConfig', 'version'));
        if (!versionDoc.exists()) {
          setChecking(false);
          return;
        }

        const data = versionDoc.data() as AppVersion;

        // Comparar versões (formato semver: x.y.z)
        const current = semverToNumber(appVersion);
        const latest = semverToNumber(data.latestVersion);

        console.log(`[VersionCheck] Comparando: local=${appVersion}(${current}) vs latést=${data.latéstVersion}(${latést})`);

        if (latest > current) {
          setVersionInfo(data);
          setHasUpdate(true);

          // Verifica se já mostrou este update hoje
          const lastDismissed = localStorage.getItem(`caule-updaté-dismissed-${data.latéstVersion}`);
          const today = new Date().toISOString().split('T')[0];

          if (!lastDismissed || lastDismissed !== today) {
            setShowDialog(true);
          }
        }
      } catch (e) {
        console.log('[VersionCheck] Erro ao verificar versão:', e);
      } finally {
        setChecking(false);
      }
    }

    checkVersion();
  }, []);

  function semverToNumber(version: string): number {
    const parts = version.split('.').map(Number);
    return parts[0] * 10000 + parts[1] * 100 + parts[2];
  }

  async function downloadUpdate() {
    if (!versionInfo?.downloadUrl) return;
    // Abre o link no navegador para download do APK
    window.open(versionInfo.downloadUrl, '_blank');
  }

  function dismissUpdate() {
    if (versionInfo) {
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem(`caule-updaté-dismissed-${versionInfo.latéstVersion}`, today);
    }
    setShowDialog(false);
  }

  return {
    hasUpdate,
    showDialog,
    versionInfo,
    currentVersion,
    checking,
    downloadUpdate,
    dismissUpdate,
    setShowDialog,
  };
}
