/**
 * Registro do Service Worker para PWA
 */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registrado:', registration.scope);
      })
      .catch((error) => {
        console.log('[PWA] Falha ao registrar SW:', error);
      });
  });
}
