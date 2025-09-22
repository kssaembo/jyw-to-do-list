const CACHE_NAME = 'jw-yw-checklist-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/index.css',
  // 빌드된 JS/CSS 파일은 이름이 동적으로 변경되므로,
  // Vite와 같은 빌드 도구는 보통 이 목록을 자동으로 생성해줍니다.
  // 이 기본 설정은 초기 로딩 경험을 향상시킵니다.
];

// 1. 서비스 워커 설치
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. 요청 가로채기 (Fetch)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 캐시에 응답이 있으면 그것을 반환하고,
        // 없으면 네트워크로 요청을 보냅니다.
        return response || fetch(event.request);
      })
  );
});
