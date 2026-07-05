/**
 * Registro do Service Worker para PWA
 * NÃO registra SW no Capacitor (Android/iOS nativo) para evitar conflitos
 */

if ('serviceWorker' in navigator) {
  // Detecta se está rodando no Capacitor (nativo)
  var isCapacitor = typeof window.Capacitor !== 'undefined' ||
    /capacitor/.test(navigator.userAgent.toLowerCase());

  if (!isCapacitor) {
    window.addEventListener('load', function() {
      navigator.serviceWorker
        .register('/sw.js')
        .then(function(registration) {
          console.log('[PWA] Service Worker registrado:', registration.scope);
        })
        .catch(function(error) {
          console.log('[PWA] Falha ao registrar SW:', error);
        });
    });
  } else {
    console.log('[Capacitor] Service Worker desabilitado no nativo');
  }
}
