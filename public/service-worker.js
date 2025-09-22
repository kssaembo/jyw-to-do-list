const CACHE_NAME = 'jw-yw-checklist-cache-v2'; // 버전을 올려 이전 캐시를 무효화합니다.
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.webmanifest'
];

// 1. 서비스 워커 설치: 캐시를 열고 핵심 파일들을 저장합니다.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache and caching core assets');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. 서비스 워커 활성화: 이전 버전의 캐시를 삭제합니다.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. 요청 가로채기 (Fetch): '네트워크 우선, 실패 시 캐시' 전략
self.addEventListener('fetch', (event) => {
  // GET 요청이 아니면 처리하지 않습니다.
  if (event.request.method !== 'GET') {
    return;
  }

  // Supabase API 요청은 항상 네트워크를 통하도록 합니다 (캐시 제외).
  if (event.request.url.includes('supabase')) {
    return;
  }

  event.respondWith(
    // 먼저 네트워크에서 리소스를 가져오려고 시도합니다.
    fetch(event.request)
      .then((response) => {
        // 유효한 응답인지 확인합니다.
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // 응답을 복제합니다. 응답은 스트림이므로 한 번만 사용할 수 있기 때문입니다.
        // 하나는 브라우저가 사용하고, 다른 하나는 캐시에 저장합니다.
        const responseToCache = response.clone();

        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // 네트워크 요청이 실패하면 (오프라인 상태 등), 캐시에서 응답을 찾습니다.
        return caches.match(event.request);
      })
  );
});
