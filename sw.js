// Cache para abrir rápido e funcionar offline. Troque VERSAO a cada publicação.
const VERSAO = "rota-v1";
const ARQUIVOS = [
  "./", "index.html", "estilo.css", "jogo.js", "puzzle.js", "palavras.js", "privacidade.html",
  "manifest.webmanifest", "icones/icone.svg", "icones/icone-192.png", "icones/icone-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Rede primeiro (pega a versão nova), cache se estiver offline. O contador nunca passa pelo cache.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).pathname.includes("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(VERSAO).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});
