import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { db } from '@/lib/firebase';

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
    async function checkVersion() {
      try {
        // Detectar versão nativa do app (Android/iOS) ou usar fallback
        let appVersion = '1.0.0';
        try {
          if (Capacitor.isNativePlatform()) {
            const { App } = await import('@capacitor/app');
            const info = await App.getInfo();
            appVersion = info.version || info.versionName || '1.0.0';
            console.log('[VersionCheck] Versão nativa detectada:', appVersion);
          } else {
            // No navegador, tenta ler do localStorage
            const localVersion = localStorage.getItem('caule-app-version');
            appVersion = localVersion || '1.0.0';
          }
        } catch (nativeErr) {
          console.log('[VersionCheck] Erro ao detectar versão nativa:', nativeErr);
          const localVersion = localStorage.getItem('caule-app-version');
          appVersion = localVersion || '1.0.0';
        }
        
        setCurrentVersion(appVersion);
        
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
        
        console.log(`[VersionCheck] Comparando: local=${appVersion}(${current}) vs latest=${data.latestVersion}(${latest})`);

        if (latest > current) {
          setVersionInfo(data);
          setHasUpdate(true);
          
          // Verifica se já mostrou este update hoje
          const lastDismissed = localStorage.getItem(`caule-update-dismissed-${data.latestVersion}`);
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
      localStorage.setItem(`caule-update-dismissed-${versionInfo.latestVersion}`, today);
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
