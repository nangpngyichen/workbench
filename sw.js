/* 工作台 Service Worker —— 缓存应用外壳，支持离线 / 添加到主屏幕
   更新策略：
   - 应用核心（index.html / app.js / styles.css / manifest）：网络优先，
     每次在线都拉取最新版本，离线时才回退到缓存。
   - 只缓存「成功(200)」的响应，绝不缓存错误页 / 空白页，避免手机端白屏。
   - 图标等静态资源：缓存优先（几乎不变，省流量），同样只缓存 200。
   - 缓存版本号：每次大改请 +1，强制旧缓存失效。 */
const CACHE = 'workbench-v63';
// 相对路径：兼容 GitHub Pages 子路径（/workbench/）部署，避免预缓存 404
const SHELL = ['./', './index.html', './app.js', './styles.css', './manifest.webmanifest'];
const ICONS = [
  './assets/icons/icon1.png',
  './assets/icons/icon2.png',
  './assets/icons/icon3.png',
  './assets/icons/icon4.png',
  './assets/icons/icon5.png',
  './assets/icons/icon6.png',
  './assets/icons/icon7.png',
  './assets/icons/app-icon-192.png',
  './assets/icons/app-icon-512.png'
];

// 只缓存成功且非跨域(opaque)的响应，防止把错误/空白页存进缓存导致白屏
function cachePut(cache, req, resp) {
  if (resp && resp.status === 200 && resp.type !== 'opaque') {
    cache.put(req, resp.clone());
  }
}

self.addEventListener('install', (e) => {
  // 只预缓存核心外壳（不缓存图标，避免某个图标缺失导致整个 SW 安装失败）
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 只处理同源请求
  const path = url.pathname;

  // 导航请求：网络优先，离线时回退到已缓存的核心页面
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((resp) => {
        caches.open(CACHE).then((c) => cachePut(c, './index.html', resp));
        return resp;
      }      ).catch(() =>
        caches.match('./index.html')
          .then((r) => r || caches.match('./'))
      )
    );
    return;
  }

  // 应用核心文件：网络优先（保证拿到最新代码），失败再回退缓存
  if (SHELL.includes(path)) {
    e.respondWith(
      fetch(req).then((resp) => {
        caches.open(CACHE).then((c) => cachePut(c, req, resp));
        return resp;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // 图标等静态资源：缓存优先，同样只缓存 200
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        caches.open(CACHE).then((c) => cachePut(c, req, resp));
        return resp;
      });
    })
  );
});
