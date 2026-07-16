/**
 * Registro do Service Worker para PWA
 * NÃO registra SW no Capacitor (Android/iOS nativo) para evitar conflitos
 */

if ('serviceWorker' in navigator) {
  // Detecta se está rodando no Capacitor (nativo)
  var isCapacitor = typeof window.Capacitor !== 'undefined' ||
    /capacitor/.test(navigator.userAgent.toLowerCase());

  if (!isCapacitor) {
    // Quando o novo SW assume o controle, a aba ainda esta rodando o bundle JS antigo
    // em memoria - recarrega uma vez pra pegar a versao nova de verdade.
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    window.addEventListener('load', function() {
      navigator.serviceWorker
        .register('/sw.js')
        .then(function(registration) {
          console.log('[PWA] Service Worker registrado:', registration.scope);
          // Navegacao sozinha nem sempre dispara o recheck do SW (abas ficam
          // abertas por dias) - forca a checagem periodicamente e ao voltar o foco.
          setInterval(function() { registration.update(); }, 60000);
          document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') registration.update();
          });
        })
        .catch(function(error) {
          console.log('[PWA] Falha ao registrar SW:', error);
        });
    });
  } else {
    console.log('[Capacitor] Service Worker desabilitado no nativo');
  }
}
