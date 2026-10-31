// Interface do Rota do Dia: tabuleiro, traço por arrasto ou toque, som, confete, estatísticas.
import {
  canExtend, dailyPuzzle, dateKey, dayNumber, isStuck, isWon, isWord, loadExtra, makePuzzle, newGame,
  stars, submit, traceWord, undo,
} from "./puzzle.js";

const CORES = ["#3cff9b", "#4dd7ff", "#ff6ad5", "#ffb547", "#a78bfa", "#ff5c7a"];
const EMOJIS = ["🟩", "🟦", "🟪", "🟧", "🟨", "🟥"];
const NOTAS = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
const $ = (id) => document.getElementById(id);

// ---------- armazenamento (falha em silêncio: o jogo funciona sem ele) ----------
const guardar = (k, v) => { try { localStorage.setItem(`rota:v1:${k}`, JSON.stringify(v)); } catch {} };
const ler = (k, padrao) => {
  try { const v = localStorage.getItem(`rota:v1:${k}`); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
};

// ---------- estado ----------
let modo = "diario";
let hoje = dateKey();
let puzzle, game, trace = [], arrastando = false, cresceuNoArrasto = false, travado = false;
let somLigado = ler("som", true);

const tabuleiro = $("tabuleiro");
const svg = $("linhas");
let casas = [];

// ---------- som ----------
let audio;
function tom(freq, dur = 0.12, tipo = "triangle", vol = 0.12, quando = 0) {
  if (!somLigado) return;
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

// ---------- confete ----------
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
  if (modo !== "diario" || dayNumber(hoje) < 1 || /^(localhost|127\.)/.test(location.hostname) || location.protocol === "file:") return;
  const ontem = dateKey(new Date(Date.now() - 86400000));
  const corpo = JSON.stringify({ e, d: dayNumber(hoje), r: ler("stats", {}).ultimo === ontem ? 1 : 0 });
  try { navigator.sendBeacon?.("api/evento.php", corpo) || fetch("api/evento.php", { method: "POST", body: corpo, keepalive: true }); } catch {}
}

// Antes do lançamento o desafio do dia aparece como prévia (sem número e sem contador).
const nomeDoDesafio = () => (dayNumber(hoje) >= 1 ? `Desafio nº ${dayNumber(hoje)}` : "Prévia");

// ---------- montagem ----------
function carregar() {
  trace = [];
  travado = false;
  if (modo === "diario") {
    hoje = dateKey();
    puzzle = dailyPuzzle(hoje);
    game = newGame(puzzle);
    const salvo = ler(`dia:${hoje}`, null);
    if (salvo) {
      for (const cells of salvo.words) {
        const r = submit(puzzle, game, cells);
        if (r.ok) game = r.game;
      }
      game = { ...game, hints: salvo.hints || 0 };
    }
    $("subtitulo").textContent = nomeDoDesafio();
  } else {
    puzzle = makePuzzle(`treino:${Date.now()}:${Math.random()}`);
    game = newGame(puzzle);
    $("subtitulo").textContent = "Treino livre";
  }
  montarTabuleiro();
  desenhar();
  if (isWon(puzzle, game)) {
    travado = true;
    if (modo === "diario") setTimeout(() => mostrarVitoria(false), 500);
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
    tabuleiro.appendChild(b);
    return b;
  });
}

function salvar() {
  if (modo !== "diario") return;
  guardar(`dia:${hoje}`, { words: game.words.map((w) => w.cells), hints: game.hints, won: isWon(puzzle, game) });
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

function desenhar() {
  const cor = corDaCasa();
  const fim = trace.at(-1);
  casas.forEach((b, i) => {
    b.className = "casa";
    b.style.background = "";
    if (i === puzzle.start) b.classList.add("inicio");
    if (i === puzzle.finish) b.classList.add("fim");
    if (cor.has(i)) { b.classList.add("usada"); b.style.background = cor.get(i); }
    if (i === game.head && !travado) b.classList.add("cabeca");
    if (trace.includes(i)) { b.classList.add("no-traco"); b.style.background = ""; }
    else if (trace.length && canExtend(game, trace, i)) b.classList.add("livre");
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
  $("contagem").textContent = game.words.length;
  $("estrelas-prev").textContent = "⭐".repeat(stars(puzzle, game)) || "—";
  $("btn-desfazer").disabled = travado || !game.words.length;
  $("btn-recomecar").disabled = travado || !game.words.length;
  $("btn-dica").disabled = travado;

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
  somAcerto();
  vibrar(20);
  desenhar();
  feitas.forEach((c, i) => setTimeout(() => casas[c].classList.add("acerto"), i * 50));
  salvar();
  if (primeira && modo === "diario") evento("inicio");
  if (isWon(puzzle, game)) return vencer();
  if (isStuck(puzzle, game)) aviso("Sem saída! Toque em ↩ Desfazer", 3000);
}

function vencer() {
  travado = true;
  salvar();
  if (modo === "diario") {
    const st = ler("stats", { jogos: 0, vitorias: 0, seq: 0, melhor: 0, estrelas: { 1: 0, 2: 0, 3: 0 } });
    const ontem = dateKey(new Date(Date.now() - 86400000));
    if (st.ultimo !== hoje) {
      st.jogos += 1;
      st.vitorias += 1;
      st.seq = st.ultimo === ontem ? st.seq + 1 : 1;
      st.melhor = Math.max(st.melhor, st.seq);
      st.estrelas[stars(puzzle, game)] += 1;
      st.ultimo = hoje;
      guardar("stats", st);
    }
    evento("vitoria");
  }
  setTimeout(() => { desenhar(); somVitoria(); confete(); vibrar([40, 60, 40, 60, 80]); }, 350);
  setTimeout(() => mostrarVitoria(true), 1300);
}

// ---------- vitória e compartilhamento ----------
function textoCompartilhar() {
  const n = stars(puzzle, game);
  const quadrados = game.words.map((_, i) => EMOJIS[i % EMOJIS.length]).join("");
  const dica = game.hints ? " 💡" : "";
  return `Rota do Dia ${nomeDoDesafio().replace("Desafio ", "")} ${"⭐".repeat(n)}${dica}\n🟢${quadrados}🏁 ${game.words.length} palavras (meta ${puzzle.par})\n${location.origin}${location.pathname}`;
}

let relogio;
function mostrarVitoria(comAnimacao) {
  const n = stars(puzzle, game);
  $("vit-selo").textContent = n === 3 ? "Rota perfeita!" : n === 2 ? "Rota completa!" : "Chegou lá!";
  $("vit-estrelas").innerHTML = [1, 2, 3]
    .map((i) => `<span class="${i <= n ? "" : "apagada"}" style="animation-delay:${comAnimacao ? i * 180 : 0}ms">⭐</span>`)
    .join("");
  $("vit-resumo").textContent = `${game.words.length} palavras · meta ${puzzle.par}${game.hints ? " · com dica" : ""}`;
  $("vit-rota").innerHTML = $("trilha").innerHTML;
  const diario = modo === "diario";
  $("btn-compartilhar").hidden = !diario;
  $("vit-proximo").hidden = !diario;
  $("btn-treinar").textContent = diario ? "Treinar mais" : "Novo treino";
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

$("btn-compartilhar").addEventListener("click", async () => {
  const texto = textoCompartilhar();
  evento("compartilhar");
  try {
    if (navigator.share) { await navigator.share({ text: texto }); return; }
  } catch (e) { if (e?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(texto); aviso("Resultado copiado! Cole no WhatsApp 📲"); }
  catch { aviso("Não deu para copiar neste navegador"); }
});

$("btn-treinar").addEventListener("click", () => {
  $("dlg-vitoria").close();
  trocarModo("treino");
});

// ---------- botões ----------
$("btn-ok").addEventListener("click", () => trace.length >= 2 && confirmar());
$("btn-limpar").addEventListener("click", () => { trace = []; desenhar(); });
$("btn-desfazer").addEventListener("click", () => { trace = []; game = undo(puzzle, game); salvar(); tom(330, 0.1); desenhar(); });
$("btn-recomecar").addEventListener("click", () => {
  trace = [];
  game = { ...newGame(puzzle), hints: game.hints };
  salvar();
  tom(260, 0.15);
  desenhar();
});
$("btn-dica").addEventListener("click", () => {
  game = { ...game, hints: game.hints + 1 };
  salvar();
  const cells = [...new Set(puzzle.route.flatMap((r) => r.cells))];
  cells.forEach((c, i) => setTimeout(() => {
    casas[c].classList.add("dica");
    somPasso(i);
    setTimeout(() => casas[c].classList.remove("dica"), 1250);
  }, i * 140));
  aviso("Essa é a rota oficial. Com dica, no máximo ⭐⭐", 3200);
  desenhar();
});

function trocarModo(novo) {
  modo = novo;
  document.querySelectorAll(".modo").forEach((b) => b.classList.toggle("ativo", b.dataset.modo === modo));
  carregar();
}
document.querySelectorAll(".modo").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.modo !== modo || modo === "treino") trocarModo(b.dataset.modo);
}));

function atualizarSom() {
  $("btn-som").textContent = somLigado ? "🔊" : "🔇";
  $("btn-som").setAttribute("aria-label", somLigado ? "Som ligado" : "Som desligado");
}
$("btn-som").addEventListener("click", () => { somLigado = !somLigado; guardar("som", somLigado); atualizarSom(); tom(660, 0.1); });

$("btn-ajuda").addEventListener("click", () => $("dlg-ajuda").showModal());
$("btn-stats").addEventListener("click", () => {
  const st = ler("stats", { jogos: 0, vitorias: 0, seq: 0, melhor: 0, estrelas: { 1: 0, 2: 0, 3: 0 } });
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
  if (!document.hidden && modo === "diario" && dateKey() !== hoje) carregar();
});

// ---------- início ----------
atualizarSom();
carregar();
fetch("palavras-validas.txt")
  .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
  .then((t) => { loadExtra(t); if (trace.length) desenhar(); })
  .catch(() => aviso("Dicionário completo não carregou; valendo a lista básica", 3500));
if (!ler("visto", false)) { guardar("visto", true); setTimeout(() => $("dlg-ajuda").showModal(), 600); }
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
