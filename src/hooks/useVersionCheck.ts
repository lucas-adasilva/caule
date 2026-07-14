import { useState, useEffect, useCallback, useRef } from 'react';
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

interface VersionCheckState {
  versionInfo: AppVersion | null;
  hasUpdate: boolean;
  showDialog: boolean;
  currentVersion: string;
  checking: boolean;
  checkError: string | null;
}

const STORAGE_KEY_PREFIX = 'caule-update-dismissed-';

function semverToNumber(version: string): number {
  const parts = version.split('.').map(Number);
  return parts[0] * 10000 + parts[1] * 100 + parts[2];
}

function shouldShowDialog(latestVersion: string): boolean {
  try {
    const lastDismissed = localStorage.getItem(`${STORAGE_KEY_PREFIX}${latestVersion}`);
    const today = new Date().toISOString().split('T')[0];
    return !lastDismissed || lastDismissed !== today;
  } catch {
    return true;
  }
}

export function useVersionCheck() {
  const [state, setState] = useState<VersionCheckState>({
    versionInfo: null,
    hasUpdate: false,
    showDialog: false,
    currentVersion: APP_VERSION,
    checking: true,
    checkError: null,
  });

  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const isNativeRef = useRef(Capacitor.isNativePlatform());

  const checkVersion = useCallback(async (isManual = false) => {
    // Só verifica em plataforma nativa (APK). Web/PWA atualiza automaticamente.
    if (!isNativeRef.current) {
      setState(prev => ({ ...prev, checking: false }));
      return;
    }

    setState(prev => ({ ...prev, checking: true, checkError: null }));

    try {
      const versionDoc = await getDoc(doc(db, 'appConfig', 'version'));

      if (!versionDoc.exists()) {
        setState(prev => ({ ...prev, checking: false, checkError: 'Configuração de versão não encontrada' }));
        return;
      }

      const data = versionDoc.data() as AppVersion;
      const current = semverToNumber(APP_VERSION);
      const latest = semverToNumber(data.latestVersion);

      const hasUpdate = latest > current;
      const showDialog = hasUpdate && (isManual || shouldShowDialog(data.latestVersion));

      setState({
        versionInfo: data,
        hasUpdate,
        showDialog,
        currentVersion: APP_VERSION,
        checking: false,
        checkError: null,
      });

      retryCountRef.current = 0;
    } catch (e: any) {
      console.error('[VersionCheck] Erro:', e);
      const errorMsg = e?.message || 'Erro ao verificar versão';

      if (retryCountRef.current < maxRetries && !isManual) {
        retryCountRef.current++;
        const delay = 2000 * retryCountRef.current;
        setTimeout(() => checkVersion(false), delay);
      }

      setState(prev => ({
        ...prev,
        checking: false,
        checkError: errorMsg,
      }));
    }
  }, []);

  // Check inicial + retry automático
  useEffect(() => {
    checkVersion(false);
  }, [checkVersion]);

  // Re-check quando app volta ao foreground
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        retryCountRef.current = 0;
        checkVersion(false);
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [checkVersion]);

  function downloadUpdate() {
    if (!state.versionInfo?.downloadUrl) return;
    window.open(state.versionInfo.downloadUrl, '_blank');
  }

  function dismissUpdate() {
    if (state.versionInfo) {
      try {
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${state.versionInfo.latestVersion}`, today);
      } catch { /* silent */ }
    }
    setState(prev => ({ ...prev, showDialog: false }));
  }

  function forceCheck() {
    retryCountRef.current = 0;
    checkVersion(true);
  }

  return {
    ...state,
    downloadUpdate,
    dismissUpdate,
    forceCheck,
  };
}
