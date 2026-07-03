import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

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
        // Versão atual do app (do capacitor.config.ts ou package.json)
        // Em produção, isso viria de um arquivo gerado no build
        const isNative = Capacitor.isNativePlatform();
        
        // Buscar versão mais recente no Firestore
        const versionDoc = await getDoc(doc(db, 'appConfig', 'version'));
        if (!versionDoc.exists()) {
          setChecking(false);
          return;
        }

        const data = versionDoc.data() as AppVersion;
        
        // Versão atual do app (hardcoded para APK, detectada para PWA)
        let appVersion = '1.0.0';
        if (isNative) {
          // Em app nativo, poderia vir do Info.plist (iOS) ou build.gradle (Android)
          // Por simplicidade, usamos uma versão armazenada localmente
          const localVersion = localStorage.getItem('caule-app-version');
          appVersion = localVersion || '1.0.0';
        } else {
          // PWA: verifica versão do build
          const buildVersion = (document as any).querySelector('meta[name="app-version"]')?.content;
          appVersion = buildVersion || '1.0.0';
        }
        
        setCurrentVersion(appVersion);

        // Comparar versões (formato semver: x.y.z)
        const current = semverToNumber(appVersion);
        const latest = semverToNumber(data.latestVersion);

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
    
    const isNative = Capacitor.isNativePlatform();
    
    if (isNative) {
      // Em app nativo, abre o link no navegador para download do APK
      await Browser.open({ url: versionInfo.downloadUrl });
    } else {
      // PWA: recarrega a página para pegar nova versão
      window.location.reload();
    }
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
