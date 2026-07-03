/**
 * Service Worker para Caule PWA
 * Cache-first strategy para assets estáticos
 * Network-first para dados dinâmicos (Firebase)
 */

const CACHE_NAME = 'caule-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Instalação: pré-cachear assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch((err) => {
      console.warn('[SW] Falha ao cachear assets:', err);
    })
  );
  self.skipWaiting();
});

// Ativação: limpar caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first para assets, network-first para APIs
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Firebase e APIs: sempre rede (não cachear)
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('google') ||
      request.method !== 'GET') {
    return;
  }

  // Assets estáticos: cache-first
  if (STATIC_ASSETS.some((asset) => url.pathname === asset) ||
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Cachear resposta nova
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Páginas do app: network-first, fallback para cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Se não tem cache, retorna a página inicial
          return caches.match('/');
        });
      })
  );
});
