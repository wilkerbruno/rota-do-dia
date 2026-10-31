// Anúncios do jogo pela Ad Placement API do Google (H5 Games Ads, dentro do AdSense).
//
// Três modos:
//   google — ADSENSE_CLIENT preenchido em config.js. Vídeo premiado e tela cheia de verdade.
//   teste  — localhost ou ?anuncios=teste na URL. Simula o vídeo (5 s) para testar o fluxo.
//   off    — publicado sem conta aprovada. Botões de vídeo ficam escondidos.
// Doc: https://developers.google.com/ad-placement/apis

import { ADSENSE_CLIENT, FREQUENCIA_INTERSTICIAL } from "./config.js";

let modo = "off";
let semIntersticial = false; // comprou "sem anúncios": tela cheia some; vídeo premiado continua opcional
export const desligarIntersticial = (v) => { semIntersticial = !!v; };
let aoPausar = () => {};
let aoRetomar = () => {};

function querTeste() {
  try {
    if (new URLSearchParams(location.search).get("anuncios") === "teste") sessionStorage.setItem("rota:anuncios", "teste");
    return sessionStorage.getItem("rota:anuncios") === "teste";
  } catch {
    return false;
  }
}

export function iniciarAnuncios({ pausar, retomar } = {}) {
  aoPausar = pausar || aoPausar;
  aoRetomar = retomar || aoRetomar;
  const local = /^(localhost|127\.)/.test(location.hostname);
  if (querTeste() || (local && !ADSENSE_CLIENT)) modo = "teste";
  else if (ADSENSE_CLIENT) modo = "google";
  if (modo !== "google") return modo;

  window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = window.adConfig = (o) => window.adsbygoogle.push(o);
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  s.crossOrigin = "anonymous";
  s.dataset.adClient = ADSENSE_CLIENT;
  s.dataset.adFrequencyHint = FREQUENCIA_INTERSTICIAL;
  document.head.appendChild(s);
  window.adConfig({ preloadAdBreaks: "on", sound: "on" });
  return modo;
}

export const anunciosAtivos = () => modo !== "off";
export const modoAnuncios = () => modo;

/**
 * Vídeo premiado. Resolve { ok: true } se a pessoa assistiu até o fim; { ok: false, motivo } se
 * fechou antes ou se não havia anúncio.
 */
export function videoPremiado(nome) {
  if (modo === "off") return Promise.resolve({ ok: false, motivo: "desligado" });
  if (modo === "teste") return simular(true);
  return new Promise((resolve) => {
    let viu = false;
    let mostrou = false;
    window.adBreak({
      type: "reward",
      name: nome,
      beforeAd: aoPausar,
      afterAd: aoRetomar,
      beforeReward: (mostrar) => { mostrou = true; mostrar(); },
      adDismissed: () => { viu = false; },
      adViewed: () => { viu = true; },
      adBreakDone: (info) => resolve(viu ? { ok: true } : { ok: false, motivo: mostrou ? "fechou" : info?.breakStatus || "semAnuncio" }),
    });
  });
}

/** Anúncio de tela cheia entre partidas. O Google decide se mostra (frequência). */
export function intersticial(nome) {
  if (modo === "off" || semIntersticial) return Promise.resolve();
  if (modo === "teste") return simular(false).then(() => {});
  return new Promise((resolve) => {
    window.adBreak({ type: "next", name: nome, beforeAd: aoPausar, afterAd: aoRetomar, adBreakDone: () => resolve() });
  });
}

// ---- simulação local: mesma sequência de eventos, sem rede ----
function simular(premiado) {
  return new Promise((resolve) => {
    aoPausar();
    const total = premiado ? 5 : 3;
    const el = document.createElement("div");
    el.className = "anuncio-teste";
    el.innerHTML = `
      <div class="anuncio-caixa">
        <p class="anuncio-tag">ANÚNCIO DE TESTE</p>
        <p class="anuncio-titulo">${premiado ? "Vídeo premiado" : "Anúncio entre partidas"}</p>
        <p class="anuncio-nota">No jogo publicado, aqui passa um vídeo do Google.</p>
        <div class="anuncio-barra"><i></i></div>
        <button class="anuncio-fechar">Fechar</button>
      </div>`;
    document.body.appendChild(el);
    const barra = el.querySelector(".anuncio-barra i");
    const botao = el.querySelector(".anuncio-fechar");
    let s = 0;
    const tick = setInterval(() => {
      s += 1;
      barra.style.width = `${(s / total) * 100}%`;
      if (s >= total) {
        clearInterval(tick);
        botao.textContent = premiado ? "✓ Pegar recompensa" : "Continuar";
        botao.classList.add("pronto");
      }
    }, 1000);
    botao.addEventListener("click", () => {
      clearInterval(tick);
      el.remove();
      aoRetomar();
      resolve(s >= total ? { ok: true } : { ok: false, motivo: "fechou" });
    });
  });
}
