/*
 * Makes the page cross-origin isolated on static hosts that cannot send the
 * COOP/COEP headers themselves, by re-serving every response with them from a
 * service worker. Does nothing when the page is already isolated (e.g. `vite dev`).
 */
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', (e) => {
    const r = e.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;
    e.respondWith(
      fetch(r).then((res) => {
        if (res.status === 0) return res;
        const headers = new Headers(res.headers);
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      }).catch(() => Response.error())
    );
  });
}
