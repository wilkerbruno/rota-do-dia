// Interface do Rota do Dia: tabuleiro, traço por arrasto ou toque, níveis, moedas, ajudas, loja,
// vídeos premiados, som, confete e estatísticas.
import {
  LEVELS, canExtend, dailyPuzzle, dateKey, dayNumber, fasePuzzle, isStuck, isWon, isWord, loadExtra,
  makePuzzle, newGame, solve, stars, submit, traceWord, undo, uselessCells, warmUp,
} from "./puzzle.js";
import {
  BAU_A_CADA, BAU_MOEDAS, BONUS_DIARIO, MAX_VIDAS, PRECOS, TEMAS, TREINO_MOEDAS, VIDEO_MOEDAS,
  bonusDiario, comprarTema, gastar, ganhar, ganharVida, novaCarteira, perderVida, premioFase,
  premioVitoria, registrarDia, restante, usarCota, vidasAgora,
} from "./carteira.js";
import { anunciosAtivos, desligarIntersticial, iniciarAnuncios, intersticial, videoPremiado } from "./anuncios.js";
import {
  abrirPagamento, ambienteTeste, codigoRecuperacao, fecharPagamento, iniciarLoja, pacotes, recuperar, sincronizar,
} from "./loja.js";

const CORES = ["#3cff9b", "#4dd7ff", "#ff6ad5", "#ffb547", "#a78bfa", "#ff5c7a"];
const EMOJIS = ["🟩", "🟦", "🟪", "🟧", "🟨", "🟥"];
const NOTAS = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
const $ = (id) => document.getElementById(id);

// ---------- armazenamento (falha em silêncio: o jogo funciona sem ele) ----------
const guardar = (k, v) => { try { localStorage.setItem(`rota:v1:${k}`, JSON.stringify(v)); } catch {} };
const ler = (k, padrao) => {
  try { const v = localStorage.getItem(`rota:v1:${k}`); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
};
const STATS_VAZIO = { jogos: 0, vitorias: 0, seq: 0, melhor: 0, estrelas: { 1: 0, 2: 0, 3: 0 } };

// ---------- estado ----------
let modo = ["jornada", "diario", "treino"].includes(ler("modo", "diario")) ? ler("modo", "diario") : "diario";
let jornada = ler("jornada", null) || { atual: 1, estrelas: {} };
let fase = jornada.atual;
let jogadas = 0; // palavras aceitas na tentativa (desfazer não devolve)
let extras = 0; // palavras compradas ou ganhas com vídeo
let extraVideoUsado = false;
let moedasPegas = [];
let fasesSeguidas = 0;
let nivel = LEVELS[ler("nivel", "medio")] ? ler("nivel", "medio") : "medio";
let hoje = dateKey();
let puzzle, game, trace = [], arrastando = false, cresceuNoArrasto = false, travado = false;
let sugestao = [];
let premio = null; // { moedas, dobrado } da partida vencida
let treinosSeguidos = 0;
let carteira = ler("carteira", null) || novaCarteira();
let somLigado = ler("som", true);
let mudoPorAnuncio = false;

const tabuleiro = $("tabuleiro");
const svg = $("linhas");
let casas = [];

function salvarCarteira() { guardar("carteira", carteira); atualizarSaldo(); }

// ---------- som ----------
let audio;
function tom(freq, dur = 0.12, tipo = "triangle", vol = 0.12, quando = 0) {
  if (!somLigado || mudoPorAnuncio) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime + quando;
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {}
}
// o navegador só deixa vibrar depois de um toque de verdade na página
const vibrar = (ms) => { try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(ms); } catch {} };
const somPasso = (i) => tom(NOTAS[Math.min(i, NOTAS.length - 1)], 0.09, "sine", 0.1);
const somAcerto = () => [0, 2, 4, 7].forEach((n, i) => tom(NOTAS[n], 0.18, "triangle", 0.12, i * 0.06));
const somErro = () => { tom(160, 0.18, "sawtooth", 0.06); tom(120, 0.22, "sawtooth", 0.05, 0.08); };
const somVitoria = () => [0, 2, 4, 5, 7, 9].forEach((n, i) => tom(NOTAS[n], 0.3, "triangle", 0.13, i * 0.09));
const somMoeda = () => [7, 9].forEach((n, i) => tom(NOTAS[n] * 1.5, 0.12, "square", 0.05, i * 0.07));

// ---------- confete e moedas voando ----------
function confete() {
  const cv = $("confete");
  const ctx = cv.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const pecas = Array.from({ length: 170 }, () => ({
    x: innerWidth / 2, y: innerHeight * 0.45,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 15 - 4,
    r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4,
    c: CORES[Math.floor(Math.random() * CORES.length)],
  }));
  const inicio = performance.now();
  (function quadro(agora) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pecas) {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    }
    if (agora - inicio < 3200) requestAnimationFrame(quadro);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(inicio);
}

/** Moedas saem de `origem` e voam até o saldo; o número sobe quando chegam. */
function moedasVoando(origem, valor) {
  const alvo = $("btn-moedas").getBoundingClientRect();
  const de = origem?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const n = Math.min(10, Math.max(3, Math.round(valor / 8)));
  for (let i = 0; i < n; i++) {
    const m = document.createElement("span");
    m.className = "moeda-voa";
    m.textContent = "🪙";
    m.style.left = `${de.left + de.width / 2 + (Math.random() - 0.5) * 60}px`;
    m.style.top = `${de.top + de.height / 2 + (Math.random() - 0.5) * 30}px`;
    document.body.appendChild(m);
    setTimeout(() => {
      const r = m.getBoundingClientRect();
      m.style.transform = `translate(${alvo.left + 16 - r.left}px, ${alvo.top + 4 - r.top}px) scale(.6)`;
      m.style.opacity = "0.2";
    }, 30 + i * 60);
    setTimeout(() => m.remove(), 950 + i * 60);
  }
  setTimeout(() => { somMoeda(); $("btn-moedas").classList.add("pula"); atualizarSaldo(); }, 800);
  setTimeout(() => $("btn-moedas").classList.remove("pula"), 1500);
}

// ---------- aviso ----------
let toastTimer;
function aviso(texto, ms = 2200) {
  const t = $("toast");
  t.textContent = texto;
  t.classList.add("mostra");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("mostra"), ms);
}

// ---------- contador anônimo (sem cookie e sem identificador) ----------
function evento(e) {
  if (dayNumber(hoje) < 1 || /^(localhost|127\.)/.test(location.hostname) || location.protocol === "file:") return;
  const ontem = dateKey(new Date(Date.now() - 86400000));
  const corpo = JSON.stringify({ e, d: dayNumber(hoje), r: ler("stats", {}).ultimo === ontem ? 1 : 0 });
  try { navigator.sendBeacon?.("api/evento.php", corpo) || fetch("api/evento.php", { method: "POST", body: corpo, keepalive: true }); } catch {}
}

// Antes do lançamento o desafio do dia aparece como prévia (sem número e sem contador).
const nomeDoDesafio = () => (dayNumber(hoje) >= 1 ? `Desafio nº ${dayNumber(hoje)}` : "Prévia");
const chaveDia = (lv = nivel) => `dia:${hoje}:${lv}`;

// ---------- montagem ----------
function carregar() {
  trace = [];
  sugestao = [];
  travado = false;
  premio = null;
  if (modo === "diario") {
    hoje = dateKey();
    puzzle = dailyPuzzle(hoje, nivel);
    game = newGame(puzzle);
    const salvo = ler(chaveDia(), null);
    if (salvo) {
      for (const cells of salvo.words) {
        const r = submit(puzzle, game, cells);
        if (r.ok) game = r.game;
      }
      game = { ...game, hints: salvo.hints || 0, blocked: salvo.blocked || [] };
      premio = salvo.premio || null;
    }
    $("subtitulo").textContent = `${nomeDoDesafio()} · ${LEVELS[nivel].nome}`;
  } else if (modo === "jornada") {
    puzzle = fasePuzzle(fase);
    game = { ...newGame(puzzle), blocked: [...puzzle.pedras] };
    jogadas = 0;
    extras = 0;
    extraVideoUsado = false;
    moedasPegas = [];
    const salvo = ler("partida-fase", null);
    if (salvo?.fase === fase) {
      for (const cells of salvo.words) {
        const r = submit(puzzle, game, cells);
        if (r.ok) game = r.game;
      }
      game = { ...game, hints: salvo.hints || 0, blocked: salvo.blocked || game.blocked };
      ({ jogadas, extras, extraVideoUsado, moedasPegas } = salvo);
    }
    $("subtitulo").textContent = `Fase ${fase}`;
    $("fase-regras").textContent = [
      `Máx. ${puzzle.maxPalavras} palavras`,
      puzzle.pedras.length ? "🪨 pedras" : "",
      puzzle.obrigatoria !== null ? "passe pela ⭐" : "",
      puzzle.moedas.length ? "pegue as 🪙" : "",
    ].filter(Boolean).join(" · ");
  } else {
    puzzle = makePuzzle(`treino:${Date.now()}:${Math.random()}`, nivel);
    game = newGame(puzzle);
    $("subtitulo").textContent = `Treino livre · ${LEVELS[nivel].nome}`;
  }
  $("faixa-fase").hidden = modo !== "jornada";
  document.querySelector(".niveis").hidden = modo === "jornada";
  guardar("modo", modo);
  montarTabuleiro();
  desenhar();
  (window.requestIdleCallback || setTimeout)(() => warmUp(puzzle));
  if (isWon(puzzle, game)) {
    travado = true;
    if (modo === "diario") setTimeout(() => mostrarVitoria(false), 500);
  }
  if (modo === "jornada" && vidasAgora(carteira).n <= 0) {
    travado = true;
    desenhar();
    setTimeout(abrirVidas, 400);
  }
}

function montarTabuleiro() {
  tabuleiro.innerHTML = "";
  casas = puzzle.grid.map((silaba, i) => {
    const b = document.createElement("div");
    b.className = "casa";
    b.setAttribute("role", "gridcell");
    b.style.animationDelay = `${(Math.floor(i / 5) + (i % 5)) * 35}ms`;
    b.textContent = silaba;
    if (i === puzzle.start) b.insertAdjacentHTML("beforeend", '<span class="rot">INÍCIO</span>');
    if (i === puzzle.finish) b.insertAdjacentHTML("beforeend", '<span class="rot">CHEGADA</span>');
    if (puzzle.moedas?.includes(i)) b.insertAdjacentHTML("beforeend", '<span class="selo-moeda">🪙</span>');
    if (puzzle.obrigatoria === i) b.insertAdjacentHTML("beforeend", '<span class="selo-estrela">⭐</span>');
    if (puzzle.pedras?.includes(i)) b.textContent = "";
    tabuleiro.appendChild(b);
    return b;
  });
}

function salvar() {
  if (modo === "jornada") {
    if (isWon(puzzle, game)) return guardar("partida-fase", null);
    return guardar("partida-fase", {
      fase, words: game.words.map((w) => w.cells), hints: game.hints, blocked: game.blocked || [],
      jogadas, extras, extraVideoUsado, moedasPegas,
    });
  }
  if (modo !== "diario") return;
  guardar(chaveDia(), {
    words: game.words.map((w) => w.cells), hints: game.hints, blocked: game.blocked || [],
    won: isWon(puzzle, game), premio,
  });
}

// ---------- desenho ----------
function corDaCasa() {
  const cor = new Map();
  game.words.forEach((w, i) => w.cells.forEach((c) => cor.set(c, CORES[i % CORES.length])));
  return cor;
}

// Geometria pela grade (não pelo retângulo da casa, que muda com animação e escala).
const GAP = 7;
function medida() {
  const a = tabuleiro.getBoundingClientRect();
  return { a, lado: (a.width - 4 * GAP) / 5 };
}
function centro(c) {
  const { lado } = medida();
  return [(c % 5) * (lado + GAP) + lado / 2, Math.floor(c / 5) * (lado + GAP) + lado / 2];
}

function atualizarSaldo() {
  $("saldo").textContent = carteira.moedas;
  $("loja-saldo").textContent = carteira.moedas;
  const st = ler("stats", STATS_VAZIO);
  const ontem = dateKey(new Date(Date.now() - 86400000));
  $("seq-topo").textContent = `🔥 ${st.ultimo === hoje || st.ultimo === ontem ? st.seq : 0}`;
}

function atualizarNiveis() {
  document.querySelectorAll(".nivel").forEach((b) => {
    const lv = b.dataset.nivel;
    b.classList.toggle("ativo", lv === nivel);
    b.querySelector("i").textContent = modo === "diario" && ler(`dia:${hoje}:${lv}`, {})?.won ? " ✓" : "";
  });
}

function desenhar() {
  const cor = corDaCasa();
  const fim = trace.at(-1);
  const bloqueadas = game.blocked || [];
  casas.forEach((b, i) => {
    b.className = "casa";
    b.style.background = "";
    if (i === puzzle.start) b.classList.add("inicio");
    if (i === puzzle.finish) b.classList.add("fim");
    if (cor.has(i)) { b.classList.add("usada"); b.style.background = cor.get(i); }
    if (i === game.head && !travado) b.classList.add("cabeca");
    if (trace.includes(i)) { b.classList.add("no-traco"); b.style.background = ""; }
    else if (trace.length && canExtend(game, trace, i)) b.classList.add("livre");
    if (puzzle.pedras?.includes(i)) b.classList.add("pedra");
    else if (bloqueadas.includes(i)) b.classList.add("limpa");
    if (puzzle.obrigatoria === i && !game.used.includes(i)) b.classList.add("obrigatoria");
    const selo = b.querySelector(".selo-moeda");
    if (selo) selo.hidden = moedasPegas.includes(i);
    if (sugestao.includes(i) && !travado) b.classList.add("sugerida");
    if (travado && !cor.has(i)) b.classList.add("apagada");
    b.setAttribute("aria-label", `${puzzle.grid[i]}${i === puzzle.start ? ", início" : ""}${i === puzzle.finish ? ", chegada" : ""}`);
  });
  if (fim !== undefined) casas[fim].classList.add("no-traco");

  // linhas
  const { width, height } = tabuleiro.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const espessura = width / 22;
  let html = '<defs><filter id="brilho"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  const linha = (a, b, c, w, extra = "") => {
    const [x1, y1] = centro(a);
    const [x2, y2] = centro(b);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" ${extra}/>`;
  };
  game.words.forEach((w, i) => {
    for (let k = 1; k < w.cells.length; k++) html += linha(w.cells[k - 1], w.cells[k], CORES[i % CORES.length], espessura * 1.4, 'filter="url(#brilho)"');
  });
  for (let k = 1; k < trace.length; k++) html += linha(trace[k - 1], trace[k], "#ffffff", espessura * 1.4, 'filter="url(#brilho)"');
  svg.innerHTML = html;

  // painel
  $("meta").textContent = `${puzzle.par} palavras`;
  $("contagem").textContent = modo === "jornada" ? `${jogadas}/${puzzle.maxPalavras + extras}` : game.words.length;
  $("estrelas-prev").textContent = "⭐".repeat(stars(puzzle, game)) || "—";
  $("btn-desfazer").disabled = travado || !game.words.length;
  $("btn-recomecar").disabled = travado || !game.words.length;
  $("btn-dica").disabled = false;

  // trilha
  $("trilha").innerHTML = game.words
    .map((w, i) => `<span class="chip" style="background:${CORES[i % CORES.length]}">${w.word.replaceAll("-", "")}</span>`)
    .join("");

  // prévia
  const pv = $("previa-texto");
  pv.className = "previa-texto";
  $("btn-ok").hidden = trace.length < 2;
  $("btn-limpar").hidden = !trace.length;
  if (trace.length) {
    const palavra = traceWord(puzzle, trace);
    pv.textContent = palavra.replaceAll("-", "·");
    pv.classList.add(isWord(palavra) && trace.length > 1 ? "certo" : "ativo");
  } else if (travado) {
    pv.textContent = "Rota completa! 🏁";
    pv.classList.add("certo");
  } else if (!game.words.length) {
    pv.innerHTML = 'Arraste a partir do <b class="tag-inicio">INÍCIO</b>';
  } else {
    pv.textContent = `Continue de ${puzzle.grid[game.head]}…`;
  }
  atualizarSaldo();
  atualizarNiveis();
}

// ---------- entrada ----------
/** Casa sob o dedo; só conta perto do centro, para a diagonal não pegar a vizinha. */
function casaNoPonto(x, y) {
  const { a, lado } = medida();
  for (let i = 0; i < casas.length; i++) {
    const [cx, cy] = centro(i);
    const dx = x - a.left - cx;
    const dy = y - a.top - cy;
    if (dx * dx + dy * dy <= (lado * 0.46) ** 2) return i;
  }
  return -1;
}

function estender(c) {
  trace.push(c);
  somPasso(trace.length - 1);
  vibrar(8);
}

tabuleiro.addEventListener("pointerdown", (ev) => {
  if (travado) return;
  const c = casaNoPonto(ev.clientX, ev.clientY);
  if (c < 0) return;
  ev.preventDefault();
  cresceuNoArrasto = false;
  if (!trace.length) {
    if (c !== game.head) {
      casas[game.head].classList.add("acerto");
      setTimeout(() => casas[game.head]?.classList.remove("acerto"), 500);
      aviso(game.words.length ? `Comece em ${puzzle.grid[game.head]}, a última sílaba` : "Comece no INÍCIO (verde)");
      return;
    }
    estender(c);
  } else if (c === trace.at(-1) && trace.length >= 2) {
    confirmar();
    return;
  } else if (trace.includes(c)) {
    trace = trace.slice(0, trace.indexOf(c) + 1);
  } else if (canExtend(game, trace, c)) {
    estender(c);
  } else {
    return;
  }
  arrastando = true;
  desenhar();
});

window.addEventListener("pointermove", (ev) => {
  if (!arrastando) return;
  const c = casaNoPonto(ev.clientX, ev.clientY);
  if (c < 0 || c === trace.at(-1)) return;
  if (c === trace.at(-2)) {
    trace.pop();
  } else if (canExtend(game, trace, c)) {
    estender(c);
    cresceuNoArrasto = true;
  } else {
    return;
  }
  desenhar();
});

window.addEventListener("pointerup", () => {
  if (!arrastando) return;
  arrastando = false;
  if (cresceuNoArrasto && trace.length >= 2) confirmar();
});

function confirmar() {
  const r = submit(puzzle, game, trace);
  if (!r.ok) {
    const pv = $("previa-texto");
    pv.textContent = r.reason === "curta" ? "Use pelo menos 2 sílabas" : `${r.word.replaceAll("-", "·")} não vale`;
    pv.className = "previa-texto erro";
    tabuleiro.classList.add("treme");
    somErro();
    vibrar([30, 40, 30]);
    setTimeout(() => tabuleiro.classList.remove("treme"), 400);
    trace = [];
    setTimeout(desenhar, 900);
    $("btn-ok").hidden = true;
    $("btn-limpar").hidden = true;
    return;
  }
  const primeira = !game.words.length;
  game = r.game;
  const feitas = trace;
  trace = [];
  sugestao = [];
  somAcerto();
  vibrar(20);
  desenhar();
  feitas.forEach((c, i) => setTimeout(() => casas[c].classList.add("acerto"), i * 50));
  if (modo === "jornada") {
    jogadas += 1;
    const novas = feitas.filter((c) => puzzle.moedas.includes(c) && !moedasPegas.includes(c));
    if (novas.length) {
      moedasPegas = [...moedasPegas, ...novas];
      carteira = ganhar(carteira, 3 * novas.length);
      guardar("carteira", carteira);
      moedasVoando(casas[novas[0]], 3 * novas.length);
    }
    desenhar();
  }
  salvar();
  if (primeira && modo === "diario") evento("inicio");
  if (isWon(puzzle, game)) return vencer();
  if (game.head === puzzle.finish && puzzle.obrigatoria !== null) aviso("Falta passar pela ⭐ antes da chegada!", 3000);
  if (modo === "jornada" && jogadas >= puzzle.maxPalavras + extras) return setTimeout(derrota, 600);
  if (isStuck(puzzle, game)) aviso("Sem saída! Toque em ↩ Desfazer", 3000);
}

// ---------- Jornada: derrota, vidas e mapa ----------
let escolheuNaDerrota = false;
function derrota() {
  travado = true;
  escolheuNaDerrota = false;
  desenhar();
  somErro();
  $("derrota-resumo").textContent = `Você usou ${jogadas} de ${puzzle.maxPalavras + extras} palavras na fase ${fase}.`;
  $("btn-extra-video").hidden = !anunciosAtivos() || extraVideoUsado;
  $("btn-extra-moedas").disabled = carteira.moedas < PRECOS.palavrasExtras;
  $("dlg-derrota").showModal();
}

function continuarComExtras() {
  escolheuNaDerrota = true;
  extras += 2;
  travado = false;
  salvar();
  $("dlg-derrota").close();
  desenhar();
  aviso("+2 palavras! Continue a rota");
}

/** Perde 1 vida e recomeça a fase; sem vidas, abre a janela de vidas. */
function desistir(depois) {
  escolheuNaDerrota = true;
  if ($("dlg-derrota").open) $("dlg-derrota").close();
  const c = perderVida(carteira);
  guardar("partida-fase", null);
  if (!c) { carregar(); return abrirVidas(); }
  carteira = c;
  guardar("carteira", carteira);
  carregar();
  depois?.();
}

$("btn-extra-video").addEventListener("click", async () => {
  const r = await videoPremiado("palavras-extras");
  if (!r.ok) return aviso(r.motivo === "fechou" ? "Vídeo fechado antes do fim" : "Nenhum vídeo disponível agora");
  evento("video");
  extraVideoUsado = true;
  continuarComExtras();
});
$("btn-extra-moedas").addEventListener("click", () => { if (pagar(PRECOS.palavrasExtras)) continuarComExtras(); });
$("btn-desistir").addEventListener("click", () => desistir());
$("btn-derrota-mapa").addEventListener("click", () => desistir(abrirMapa));
$("dlg-derrota").addEventListener("close", () => { if (!escolheuNaDerrota) desistir(); });

function textoTempo(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function atualizarVidas() {
  const v = vidasAgora(carteira);
  if (v.n !== carteira.vidas?.n || v.carteira.vidas.desde !== carteira.vidas?.desde) {
    carteira = v.carteira;
    guardar("carteira", carteira);
  }
  $("vidas-n").textContent = v.n;
  $("vidas-tempo").textContent = v.n < MAX_VIDAS ? textoTempo(v.proxima) : "";
  if ($("dlg-vidas").open) {
    $("dlg-vidas-n").textContent = v.n;
    $("dlg-vidas-tempo").textContent = v.n < MAX_VIDAS ? `Próxima vida em ${textoTempo(v.proxima)}` : "Vidas cheias!";
  }
  return v.n;
}
setInterval(atualizarVidas, 1000);

function abrirVidas() {
  const n = atualizarVidas();
  $("btn-vida-video").hidden = !anunciosAtivos();
  $("btn-vida-video").disabled = n >= MAX_VIDAS || restante(carteira, dateKey(), "videoVida") <= 0;
  $("btn-vida-moedas").disabled = n >= MAX_VIDAS || carteira.moedas < PRECOS.vidas;
  if (!$("dlg-vidas").open) $("dlg-vidas").showModal();
  atualizarVidas();
}

function vidasRecebidas() {
  atualizarVidas();
  if (modo === "jornada" && travado && !isWon(puzzle, game)) carregar();
}

async function vidaPorVideo() {
  const c = usarCota(carteira, dateKey(), "videoVida");
  if (!c) return aviso("Vídeos de vida de hoje acabaram");
  const r = await videoPremiado("vida");
  if (!r.ok) return aviso(r.motivo === "fechou" ? "Vídeo fechado antes do fim" : "Nenhum vídeo disponível agora");
  evento("video");
  carteira = ganharVida(c, 1);
  guardar("carteira", carteira);
  aviso("+1 ❤️");
  vidasRecebidas();
}
$("btn-vida-video").addEventListener("click", async () => { await vidaPorVideo(); if ($("dlg-vidas").open) abrirVidas(); });
$("btn-loja-vida").addEventListener("click", async () => { await vidaPorVideo(); if ($("dlg-loja").open) abrirLoja(); });
$("btn-vida-moedas").addEventListener("click", () => {
  if (!pagar(PRECOS.vidas)) return;
  carteira = ganharVida(carteira, MAX_VIDAS);
  guardar("carteira", carteira);
  $("dlg-vidas").close();
  vidasRecebidas();
});
$("btn-vidas").addEventListener("click", abrirVidas);
$("btn-vidas-diario").addEventListener("click", () => { $("dlg-vidas").close(); trocarModo("diario"); });

function abrirMapa() {
  const total = Object.values(jornada.estrelas).reduce((a, b) => a + b, 0);
  $("mapa-estrelas").textContent = `⭐ ${total}`;
  const ultima = Math.max(jornada.atual + 5, 12);
  let html = "";
  for (let n = 1; n <= ultima; n++) {
    const est = jornada.estrelas[n] || 0;
    const estado = n < jornada.atual || est ? "feita" : n === jornada.atual ? "atual" : "trancada";
    const bau = n % BAU_A_CADA === 0 ? `<span class="bau">${est ? "🎁✓" : "🎁"}</span>` : "";
    html += `<div class="linha-fase"><button class="no-fase ${estado}" data-fase="${n}" ${estado === "trancada" ? "disabled" : ""}>${n}<small>${"⭐".repeat(est)}</small></button>${bau}</div>`;
  }
  $("trilha-mapa").innerHTML = html;
  if (!$("dlg-mapa").open) $("dlg-mapa").showModal();
  $("trilha-mapa").querySelector(".atual")?.scrollIntoView({ block: "center" });
}
$("trilha-mapa").addEventListener("click", (e) => {
  const b = e.target.closest("[data-fase]");
  if (!b || b.disabled) return;
  $("dlg-mapa").close();
  fase = Number(b.dataset.fase);
  trocarModo("jornada", fase);
});
$("btn-mapa").addEventListener("click", abrirMapa);

function vencer() {
  travado = true;
  const n = stars(puzzle, game);
  if (modo === "jornada") {
    const antes = jornada.estrelas[fase] || 0;
    const ganho = n > antes ? premioFase(fase, n) - (antes ? premioFase(fase, antes) : 0) : 0;
    const bau = !antes && fase % BAU_A_CADA === 0 ? BAU_MOEDAS : 0;
    jornada = { atual: Math.max(jornada.atual, fase + 1), estrelas: { ...jornada.estrelas, [fase]: Math.max(antes, n) } };
    guardar("jornada", jornada);
    premio = ganho + bau > 0 ? { moedas: ganho + bau, dobrado: false, bau } : null;
    if (premio) carteira = ganhar(carteira, premio.moedas);
    fasesSeguidas += 1;
  } else if (modo === "diario") {
    let st = ler("stats", STATS_VAZIO);
    const dia = registrarDia(st, carteira, hoje);
    st = dia.stats;
    carteira = dia.carteira;
    if (dia.usouEscudo) setTimeout(() => aviso("🛡️ O escudo salvou sua sequência!", 3500), 1500);
    st.jogos += 1;
    st.vitorias += 1;
    st.estrelas[n] += 1;
    guardar("stats", st);
    premio = { moedas: premioVitoria(nivel, n), dobrado: false };
    carteira = ganhar(carteira, premio.moedas);
    evento("vitoria");
  } else {
    const c = usarCota(carteira, hoje, "treinosPremiados");
    premio = c ? { moedas: TREINO_MOEDAS + n, dobrado: false } : null;
    if (c) carteira = ganhar(c, premio.moedas);
    treinosSeguidos += 1;
  }
  salvar();
  guardar("carteira", carteira);
  setTimeout(() => { desenhar(); somVitoria(); confete(); vibrar([40, 60, 40, 60, 80]); }, 350);
  setTimeout(() => {
    mostrarVitoria(true);
    if (premio) moedasVoando($("vit-moedas"), premio.moedas);
  }, 1300);
}

// ---------- vitória e compartilhamento ----------
function textoCompartilhar() {
  const n = stars(puzzle, game);
  const quadrados = game.words.map((_, i) => EMOJIS[i % EMOJIS.length]).join("");
  const dica = game.hints ? " 💡" : "";
  const nome = modo === "jornada" ? `· Fase ${fase}` : `${nomeDoDesafio().replace("Desafio ", "")} · ${LEVELS[nivel].nome}`;
  return `Rota do Dia ${nome} ${"⭐".repeat(n)}${dica}\n🟢${quadrados}🏁 ${game.words.length} palavras (meta ${puzzle.par})\n${location.origin}${location.pathname}`;
}

let relogio;
function mostrarVitoria(comAnimacao) {
  const n = stars(puzzle, game);
  $("vit-selo").textContent = n === 3 ? "Rota perfeita!" : n === 2 ? "Rota completa!" : "Chegou lá!";
  $("vit-estrelas").innerHTML = [1, 2, 3]
    .map((i) => `<span class="${i <= n ? "" : "apagada"}" style="animation-delay:${comAnimacao ? i * 180 : 0}ms">⭐</span>`)
    .join("");
  $("vit-resumo").textContent = `${modo === "jornada" ? `Fase ${fase} · ` : ""}${game.words.length} palavras · meta ${puzzle.par}${game.hints ? " · com ajuda" : ""}${premio?.bau ? " · 🎁 baú aberto!" : ""}`;
  $("vit-rota").innerHTML = $("trilha").innerHTML;
  $("vit-premio").hidden = !premio;
  if (premio) {
    $("vit-moedas").textContent = premio.dobrado ? premio.moedas * 2 : premio.moedas;
    $("btn-dobrar").hidden = !anunciosAtivos() || premio.dobrado;
    $("btn-dobrar").textContent = `▶ Dobrar com vídeo (+${premio.moedas})`;
  }
  const diario = modo === "diario";
  $("btn-compartilhar").hidden = modo === "treino";
  $("vit-proximo").hidden = !diario;
  const proximoNivel = Object.keys(LEVELS).find((lv) => !ler(`dia:${hoje}:${lv}`, {})?.won);
  $("btn-treinar").textContent = modo === "jornada" ? `Fase ${fase + 1} ▶`
    : !diario ? "Novo treino" : proximoNivel ? `Jogar ${LEVELS[proximoNivel].nome}` : "Treinar mais";
  $("btn-treinar").dataset.nivel = diario ? proximoNivel || "" : "";
  clearInterval(relogio);
  if (diario) {
    const tick = () => {
      const meia = new Date(); meia.setHours(24, 0, 0, 0);
      const s = Math.max(0, Math.floor((meia - Date.now()) / 1000));
      const p = (v) => String(v).padStart(2, "0");
      $("contador").textContent = `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
      if (s === 0 && dateKey() !== hoje) { clearInterval(relogio); $("dlg-vitoria").close(); carregar(); }
    };
    tick();
    relogio = setInterval(tick, 1000);
  }
  if (!$("dlg-vitoria").open) $("dlg-vitoria").showModal();
}

$("btn-dobrar").addEventListener("click", async () => {
  if (!premio || premio.dobrado) return;
  $("btn-dobrar").disabled = true;
  const r = await videoPremiado("dobrar-vitoria");
  $("btn-dobrar").disabled = false;
  if (!r.ok) return aviso(r.motivo === "fechou" ? "Vídeo fechado antes do fim: sem bônus" : "Nenhum vídeo disponível agora");
  evento("video");
  carteira = ganhar(carteira, premio.moedas);
  premio = { ...premio, dobrado: true };
  salvar();
  guardar("carteira", carteira);
  $("vit-moedas").textContent = premio.moedas * 2;
  $("btn-dobrar").hidden = true;
  moedasVoando($("vit-moedas"), premio.moedas);
});

$("btn-compartilhar").addEventListener("click", async () => {
  const texto = textoCompartilhar();
  evento("compartilhar");
  try {
    if (navigator.share) { await navigator.share({ text: texto }); return; }
  } catch (e) { if (e?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(texto); aviso("Resultado copiado! Cole no WhatsApp 📲"); }
  catch { aviso("Não deu para copiar neste navegador"); }
});

$("btn-treinar").addEventListener("click", async () => {
  $("dlg-vitoria").close();
  if (modo === "jornada") {
    // anúncio de tela cheia a cada 3 fases vencidas (o Google ainda controla a frequência)
    if (fasesSeguidas >= 3) { fasesSeguidas = 0; await intersticial("entre-fases"); }
    fase += 1;
    return carregar();
  }
  const proximo = $("btn-treinar").dataset.nivel;
  if (proximo) return trocarNivel(proximo);
  // anúncio de tela cheia a cada 3 treinos vencidos (o Google ainda controla a frequência)
  if (modo === "treino" && treinosSeguidos >= 3) { treinosSeguidos = 0; await intersticial("entre-treinos"); }
  trocarModo("treino");
});

// ---------- ajudas e loja ----------
function pagar(preco) {
  const c = gastar(carteira, preco);
  if (!c) {
    aviso(anunciosAtivos() ? "Moedas insuficientes: assista um vídeo para ganhar mais" : "Moedas insuficientes");
    return false;
  }
  carteira = c;
  salvarCarteira();
  return true;
}

function ajudaProxima() {
  const sol = solve(puzzle, game);
  if (!sol) { aviso("Daqui não tem saída: desfaça a última palavra (grátis)", 3500); return false; }
  sugestao = sol[0];
  game = { ...game, hints: game.hints + 1 };
  sol[0].forEach((c, i) => setTimeout(() => { casas[c].classList.add("dica"); somPasso(i); setTimeout(() => casas[c].classList.remove("dica"), 1250); }, i * 160));
  aviso(`Siga as casas douradas: ${sol[0].map((c) => puzzle.grid[c]).join("·")}`, 3500);
  return true;
}

function ajudaApagar() {
  const livres = uselessCells(puzzle, game, solve(puzzle, game)).filter((c) => c !== game.head);
  if (!livres.length) { aviso("Não sobrou casa inútil para apagar"); return false; }
  const escolhidas = livres.sort(() => Math.random() - 0.5).slice(0, 5);
  game = { ...game, blocked: [...(game.blocked || []), ...escolhidas] };
  aviso(`${escolhidas.length} casas apagadas`);
  return true;
}

function ajudaRota() {
  game = { ...game, hints: game.hints + 1 };
  const cells = [...new Set(puzzle.route.flatMap((r) => r.cells))];
  cells.forEach((c, i) => setTimeout(() => {
    casas[c].classList.add("dica");
    somPasso(i);
    setTimeout(() => casas[c].classList.remove("dica"), 1250);
  }, i * 140));
  aviso("Essa é a rota oficial", 3200);
  return true;
}

const AJUDAS = { proxima: ajudaProxima, apagar: ajudaApagar, rota: ajudaRota };

function usarAjuda(tipo, gratis = false) {
  if (tipo === "escudo") {
    if (!pagar(PRECOS.escudo)) return;
    carteira = { ...carteira, escudos: carteira.escudos + 1 };
    salvarCarteira();
    aviso("🛡️ Escudo guardado");
    return abrirLoja();
  }
  if (tipo === "vidas") {
    if (vidasAgora(carteira).n >= MAX_VIDAS) return aviso("Suas vidas já estão cheias");
    if (!pagar(PRECOS.vidas)) return;
    carteira = ganharVida(carteira, MAX_VIDAS);
    guardar("carteira", carteira);
    aviso("❤️ Vidas cheias!");
    vidasRecebidas();
    return abrirLoja();
  }
  if (travado) return aviso("Partida já vencida: a ajuda fica para a próxima");
  if (tipo === "proxima" && !solve(puzzle, game)) return aviso("Daqui não tem saída: desfaça a última palavra (grátis)", 3500);
  if (!gratis && !pagar(PRECOS[tipo])) return;
  $("dlg-loja").close();
  trace = [];
  AJUDAS[tipo]();
  salvar();
  desenhar();
}

function abrirLoja() {
  atualizarSaldo();
  const hojeKey = dateKey();
  document.querySelectorAll("[data-ajuda]").forEach((b) => {
    b.disabled = carteira.moedas < PRECOS[b.dataset.ajuda] || (!["escudo", "vidas"].includes(b.dataset.ajuda) && travado);
  });
  const videos = anunciosAtivos();
  $("btn-loja-vida").hidden = !videos;
  $("btn-loja-vida").disabled = vidasAgora(carteira).n >= MAX_VIDAS || restante(carteira, hojeKey, "videoVida") <= 0;
  document.querySelectorAll("[data-video-ajuda]").forEach((b) => {
    b.hidden = !videos;
    b.disabled = travado || restante(carteira, hojeKey, "videoAjuda") <= 0;
    b.textContent = `▶ grátis (${restante(carteira, hojeKey, "videoAjuda")})`;
  });
  $("item-video-moedas").hidden = !videos;
  $("videos-restantes").textContent = restante(carteira, hojeKey, "videoMoedas");
  $("btn-video-moedas").disabled = restante(carteira, hojeKey, "videoMoedas") <= 0;
  $("escudos").textContent = carteira.escudos;
  $("temas").innerHTML = Object.entries(TEMAS).map(([id, t]) => {
    const tem = carteira.temas.includes(id);
    return `<button class="tema ${carteira.tema === id ? "ativo" : ""}" data-tema="${id}">
      <span class="amostra" data-tema-amostra="${id}"><i></i><i></i><i></i></span>
      ${t.nome}<small>${carteira.tema === id ? "Em uso" : tem ? "Usar" : `🪙 ${t.preco}`}</small></button>`;
  }).join("");
  pintarAmostras();
  desenharLojaPaga();
  if (!$("dlg-loja").open) $("dlg-loja").showModal();
}

// ---------- loja paga (Mercado Pago) ----------
let lojaAtiva = false;
let semAnunciosComprado = ler("semAnuncios", false);
let pollPix = null;

function desenharLojaPaga() {
  $("loja-paga").hidden = !lojaAtiva;
  if (!lojaAtiva) return;
  $("tag-teste").hidden = !ambienteTeste();
  $("pacotes").innerHTML = pacotes().map((p) => {
    const tem = p.semAnuncios && semAnunciosComprado;
    const fita = p.id === "p800" ? '<em class="fita">MAIS VENDIDO</em>' : "";
    const titulo = p.moedas ? `🪙 ${p.moedas.toLocaleString("pt-BR")}` : "🚫 Anúncios";
    const sub = p.moedas ? "moedas" : "sem tela cheia, para sempre";
    return `<button class="pacote" data-pacote="${p.id}" ${tem ? "disabled" : ""}>${fita}<b>${titulo}</b><span>${sub}</span>
      <i>${tem ? "Já é seu" : p.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</i></button>`;
  }).join("");
  const cod = codigoRecuperacao();
  $("meu-codigo").textContent = cod ? `Seu código de recuperação: ${cod}. Guarde para recuperar compras em outro celular.` : "Seu código aparece aqui depois da primeira compra.";
}

async function sincronizarCompras(silencioso = false) {
  const r = await sincronizar();
  if (r.semAnuncios) { semAnunciosComprado = true; desligarIntersticial(true); }
  if (r.outroAparelho && !silencioso) aviso("Suas compras foram recuperadas em outro aparelho");
  if (r.novasMoedas > 0) {
    carteira = ganhar(carteira, r.novasMoedas);
    guardar("carteira", carteira);
    moedasVoando($("btn-moedas"), r.novasMoedas);
    aviso(`+${r.novasMoedas} moedas da sua compra! Obrigado 💛`, 4000);
  }
  return r;
}

function pararPix() { clearInterval(pollPix); pollPix = null; }

let pacoteAtual = null;
async function abrirCompra(pacoteId) {
  pacoteAtual = pacoteId;
  pararPix();
  const p = pacotes().find((x) => x.id === pacoteId);
  $("pag-titulo").textContent = p.nome;
  $("pag-preco").textContent = p.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  $("pag-pix").hidden = true;
  $("brick-pagamento").hidden = false;
  $("pag-msg").textContent = ambienteTeste() ? "Modo teste: use os dados de teste do Mercado Pago. Nenhum valor é cobrado." : "";
  if ($("dlg-loja").open) $("dlg-loja").close();
  if (!$("dlg-pagamento").open) $("dlg-pagamento").showModal();
  try {
    await abrirPagamento($("brick-pagamento"), pacoteId, aoPagar);
  } catch {
    $("pag-msg").textContent = "Não foi possível abrir o pagamento agora. Tente de novo em instantes.";
  }
}

async function aoPagar(r) {
  if (r.erro) { $("pag-msg").textContent = r.erro; return; }
  if (r.status === "approved") {
    await fecharPagamento();
    await sincronizarCompras();
    $("dlg-pagamento").close();
    confete();
    return;
  }
  if (r.status === "rejected") { $("pag-msg").textContent = "Pagamento recusado. Tente outro cartão ou o Pix."; return; }
  // Pix (pending) ou cartão em análise: espera a confirmação
  await fecharPagamento();
  $("brick-pagamento").hidden = true;
  if (r.pix?.qrBase64) {
    $("pag-pix").hidden = false;
    $("pix-qr").src = `data:image/png;base64,${r.pix.qrBase64}`;
    $("btn-pix-copiar").onclick = async () => {
      try { await navigator.clipboard.writeText(r.pix.copiaECola); aviso("Código Pix copiado! Cole no app do seu banco"); }
      catch { aviso("Não deu para copiar; use o QR code"); }
    };
  } else {
    $("pag-msg").textContent = "Pagamento em análise. As moedas entram assim que for aprovado.";
  }
  pararPix();
  const inicio = Date.now();
  pollPix = setInterval(async () => {
    if (!$("dlg-pagamento").open || Date.now() - inicio > 15 * 60 * 1000) return pararPix();
    const s = await sincronizarCompras(true);
    if (s.novasMoedas > 0 || (s.semAnuncios && !s.pendentes)) {
      pararPix();
      $("dlg-pagamento").close();
      confete();
    }
  }, 5000);
}

$("pacotes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-pacote]");
  if (b && !b.disabled) abrirCompra(b.dataset.pacote);
});
$("btn-pag-fechar").addEventListener("click", () => $("dlg-pagamento").close());
$("btn-pix-cartao").addEventListener("click", () => pacoteAtual && abrirCompra(pacoteAtual));
$("dlg-pagamento").addEventListener("close", () => { pararPix(); fecharPagamento(); });
$("btn-recuperar").addEventListener("click", async () => {
  const ok = await recuperar($("codigo-recuperar").value);
  if (!ok) return aviso("Código não encontrado");
  await sincronizarCompras();
  aviso("Compras recuperadas neste aparelho");
  desenharLojaPaga();
});

const AMOSTRAS = {
  neon: ["#263066", "#3cff9b", "#ff6ad5"], oceano: ["#0a466e", "#4dd7ff", "#7cf2d0"],
  pordosol: ["#6e1e46", "#ff8a3d", "#ffcc33"], ouro: ["#46340a", "#ffcc33", "#fff1b8"],
};
function pintarAmostras() {
  document.querySelectorAll("[data-tema-amostra]").forEach((s) => {
    s.querySelectorAll("i").forEach((i, k) => (i.style.background = AMOSTRAS[s.dataset.temaAmostra][k]));
  });
}

function aplicarTema() { document.body.dataset.tema = carteira.tema; }

$("btn-dica").addEventListener("click", abrirLoja);
$("btn-moedas").addEventListener("click", abrirLoja);
document.querySelectorAll("[data-ajuda]").forEach((b) => b.addEventListener("click", () => usarAjuda(b.dataset.ajuda)));
document.querySelectorAll("[data-video-ajuda]").forEach((b) => b.addEventListener("click", async () => {
  const tipo = b.dataset.videoAjuda;
  if (tipo === "proxima" && !solve(puzzle, game)) return aviso("Daqui não tem saída: desfaça a última palavra (grátis)", 3500);
  const c = usarCota(carteira, dateKey(), "videoAjuda");
  if (!c) return aviso("Vídeos de ajuda de hoje acabaram");
  const r = await videoPremiado(`ajuda-${tipo}`);
  if (!r.ok) return aviso(r.motivo === "fechou" ? "Vídeo fechado antes do fim" : "Nenhum vídeo disponível agora");
  evento("video");
  carteira = c;
  salvarCarteira();
  usarAjuda(tipo, true);
}));
$("btn-video-moedas").addEventListener("click", async () => {
  const c = usarCota(carteira, dateKey(), "videoMoedas");
  if (!c) return aviso("Vídeos de hoje acabaram. Volte amanhã!");
  const r = await videoPremiado("moedas-gratis");
  if (!r.ok) return aviso(r.motivo === "fechou" ? "Vídeo fechado antes do fim" : "Nenhum vídeo disponível agora");
  evento("video");
  carteira = ganhar(c, VIDEO_MOEDAS);
  guardar("carteira", carteira);
  moedasVoando($("btn-video-moedas"), VIDEO_MOEDAS);
  setTimeout(abrirLoja, 900);
});
$("temas").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tema]");
  if (!b) return;
  const c = comprarTema(carteira, b.dataset.tema);
  if (!c) return aviso("Moedas insuficientes para esse tema");
  carteira = c;
  salvarCarteira();
  aplicarTema();
  somMoeda();
  abrirLoja();
});

// ---------- bônus diário ----------
let bonusAtual = null;
function verificarBonus() {
  const r = bonusDiario(carteira, dateKey());
  if (!r) return;
  carteira = r.carteira;
  guardar("carteira", carteira);
  bonusAtual = { valor: r.valor, dobrado: false };
  $("bonus-dia").textContent = `Dia ${r.dia} seguido`;
  $("bonus-valor").textContent = r.valor;
  $("bonus-trilha").innerHTML = BONUS_DIARIO.map((v, i) => `<span class="${i < Math.min(r.dia, 7) ? "feito" : ""}">${v}</span>`).join("");
  $("btn-bonus-dobrar").hidden = !anunciosAtivos();
  $("dlg-bonus").showModal();
}
$("dlg-bonus").addEventListener("close", () => {
  if (bonusAtual) moedasVoando($("bonus-valor"), bonusAtual.dobrado ? bonusAtual.valor * 2 : bonusAtual.valor);
  bonusAtual = null;
});
$("btn-bonus-dobrar").addEventListener("click", async () => {
  if (!bonusAtual || bonusAtual.dobrado) return;
  const r = await videoPremiado("dobrar-bonus");
  if (!r.ok) return aviso(r.motivo === "fechou" ? "Vídeo fechado antes do fim" : "Nenhum vídeo disponível agora");
  evento("video");
  carteira = ganhar(carteira, bonusAtual.valor);
  guardar("carteira", carteira);
  bonusAtual.dobrado = true;
  $("bonus-valor").textContent = bonusAtual.valor * 2;
  $("btn-bonus-dobrar").hidden = true;
  somMoeda();
});

// ---------- botões ----------
$("btn-ok").addEventListener("click", () => trace.length >= 2 && confirmar());
$("btn-limpar").addEventListener("click", () => { trace = []; desenhar(); });
$("btn-desfazer").addEventListener("click", () => { trace = []; sugestao = []; game = undo(puzzle, game); salvar(); tom(330, 0.1); desenhar(); });
$("btn-recomecar").addEventListener("click", () => {
  if (modo === "jornada") {
    if (jogadas > 0 && !confirm("Recomeçar a fase gasta 1 vida. Continuar?")) return;
    return jogadas > 0 ? desistir() : carregar();
  }
  trace = [];
  sugestao = [];
  game = { ...newGame(puzzle), hints: game.hints, blocked: game.blocked || [] };
  salvar();
  tom(260, 0.15);
  desenhar();
});

function trocarModo(novo, faseEscolhida) {
  modo = novo;
  if (novo === "jornada") fase = faseEscolhida || jornada.atual;
  document.querySelectorAll(".modo").forEach((b) => b.classList.toggle("ativo", b.dataset.modo === modo));
  carregar();
}
function trocarNivel(novo) {
  nivel = novo;
  guardar("nivel", nivel);
  carregar();
}
document.querySelectorAll(".modo").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.modo === "jornada" && modo === "jornada") return abrirMapa();
  if (b.dataset.modo !== modo || modo === "treino") trocarModo(b.dataset.modo);
}));
document.querySelectorAll(".nivel").forEach((b) => b.addEventListener("click", () => trocarNivel(b.dataset.nivel)));

function atualizarSom() {
  $("btn-som").textContent = somLigado ? "🔊" : "🔇";
  $("btn-som").setAttribute("aria-label", somLigado ? "Som ligado" : "Som desligado");
}
$("btn-som").addEventListener("click", () => { somLigado = !somLigado; guardar("som", somLigado); atualizarSom(); tom(660, 0.1); });

$("btn-ajuda").addEventListener("click", () => $("dlg-ajuda").showModal());
$("btn-stats").addEventListener("click", () => {
  const st = ler("stats", STATS_VAZIO);
  const ontem = dateKey(new Date(Date.now() - 86400000));
  const seqAtual = st.ultimo === hoje || st.ultimo === ontem ? st.seq : 0;
  $("st-jogos").textContent = st.jogos;
  $("st-vitorias").textContent = st.vitorias;
  $("st-seq").textContent = seqAtual;
  $("st-melhor").textContent = st.melhor;
  const max = Math.max(1, ...Object.values(st.estrelas));
  $("st-barras").innerHTML = [3, 2, 1]
    .map((n) => `<div class="barra"><span>${"⭐".repeat(n)}</span><i style="width:${(st.estrelas[n] / max) * 100}%">${st.estrelas[n]}</i></div>`)
    .join("");
  $("dlg-stats").showModal();
});
document.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

window.addEventListener("resize", desenhar);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && dateKey() !== hoje) { if (modo === "diario") carregar(); verificarBonus(); }
});

// ---------- início ----------
iniciarAnuncios({ pausar: () => { mudoPorAnuncio = true; }, retomar: () => { mudoPorAnuncio = false; } });
desligarIntersticial(semAnunciosComprado);
iniciarLoja().then((visivel) => { lojaAtiva = visivel; if (ler("jogador", null)) sincronizarCompras(true); }).catch(() => {});
aplicarTema();
atualizarSom();
document.querySelectorAll(".modo").forEach((b) => b.classList.toggle("ativo", b.dataset.modo === modo));
carregar();
atualizarVidas();
fetch("palavras-validas.txt")
  .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
  .then((t) => { loadExtra(t); if (trace.length) desenhar(); (window.requestIdleCallback || setTimeout)(() => warmUp(puzzle)); })
  .catch(() => aviso("Dicionário completo não carregou; valendo a lista básica", 3500));
if (!ler("visto", false)) {
  guardar("visto", true);
  setTimeout(() => $("dlg-ajuda").showModal(), 600);
  $("dlg-ajuda").addEventListener("close", verificarBonus, { once: true });
} else {
  setTimeout(verificarBonus, 700);
}
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
