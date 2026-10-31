// Regras e gerador do Rota do Dia. Sem DOM: roda no navegador e no Node (testes).
//
// Tabuleiro 5x5 de sílabas. O jogador sai da casa de início e forma palavras arrastando por casas
// vizinhas (8 direções). Cada palavra começa na última sílaba da anterior. Casa usada não volta.
// Chegou à casa final: venceu. A rota oficial do dia é uma corrente de palavras do dicionário.

import { PALAVRAS } from "./palavras.js";

export const SIZE = 5;
export const LAUNCH = "2026-11-01"; // desafio nº 1

export const WORDS = PALAVRAS.split(/\s+/).filter(Boolean).map((w) => w.toUpperCase().split("-"));
export const DICT = new Set(WORDS.map((s) => s.join("-")));

// Dicionário completo (palavras-validas.txt), carregado depois da abertura. Até chegar, vale a lista básica.
const EXTRA = new Set();
export function loadExtra(text) {
  for (const line of text.split("\n")) if (line && line[0] !== "#") EXTRA.add(line.trim());
  return EXTRA.size;
}
export const isWord = (word) => DICT.has(word) || EXTRA.has(word);

const BY_FIRST = new Map();
for (const w of WORDS) {
  if (!BY_FIRST.has(w[0])) BY_FIRST.set(w[0], []);
  BY_FIRST.get(w[0]).push(w);
}
const SYLLABLES = WORDS.flat();

export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

function shuffle(rng, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const rowCol = (cell) => [Math.floor(cell / SIZE), cell % SIZE];

export function isAdjacent(a, b) {
  const [ra, ca] = rowCol(a);
  const [rb, cb] = rowCol(b);
  return a !== b && Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1;
}

export function neighbors(cell) {
  const out = [];
  for (let c = 0; c < SIZE * SIZE; c++) if (isAdjacent(cell, c)) out.push(c);
  return out;
}

/** Corrente de palavras em que cada uma começa pela última sílaba da anterior. */
function buildChain(rng, words, cells) {
  const chain = [pick(rng, WORDS.filter((w) => w.length <= 3))];
  let total = chain[0].length;
  while (chain.length < words[1] && (chain.length < words[0] || total < cells[0])) {
    const last = chain[chain.length - 1];
    const options = (BY_FIRST.get(last[last.length - 1]) || []).filter(
      (w) => !chain.some((c) => c.join("-") === w.join("-")),
    );
    if (!options.length) return null;
    const next = pick(rng, options);
    chain.push(next);
    total += next.length - 1;
  }
  return total >= cells[0] && total <= cells[1] ? chain : null;
}

/** Caminho sem repetir casa, de tamanho exato, com início e fim a pelo menos `dist` casas. */
function placePath(rng, length, dist) {
  const start = Math.floor(rng() * SIZE * SIZE);
  const path = [start];
  const seen = new Set(path);
  let steps = 0;
  const walk = () => {
    if (++steps > 6000) return false;
    if (path.length === length) {
      const [r0, c0] = rowCol(path[0]);
      const [r1, c1] = rowCol(path[path.length - 1]);
      return Math.max(Math.abs(r0 - r1), Math.abs(c0 - c1)) >= dist;
    }
    for (const n of shuffle(rng, neighbors(path[path.length - 1]))) {
      if (seen.has(n)) continue;
      path.push(n);
      seen.add(n);
      if (walk()) return true;
      path.pop();
      seen.delete(n);
    }
    return false;
  };
  return walk() ? path : null;
}

/** Tamanho da rota oficial por nível: palavras, casas e distância mínima entre início e chegada. */
export const LEVELS = {
  facil: { nome: "Fácil", words: [2, 3], cells: [5, 7], dist: 2, moedas: 10 },
  medio: { nome: "Médio", words: [3, 5], cells: [8, 11], dist: 3, moedas: 20 },
  dificil: { nome: "Difícil", words: [5, 7], cells: [12, 15], dist: 4, moedas: 35 },
};

/**
 * Desafio determinístico para a semente e o nível.
 * Retorna { grid, start, finish, route: [{ word, cells }], par, level }.
 */
export function makePuzzle(seedText, level = "medio") {
  const { words, cells, dist } = typeof level === "string" ? LEVELS[level] : level;
  const rng = makeRng(hashSeed(seedText));
  for (let attempt = 0; attempt < 800; attempt++) {
    const chain = buildChain(rng, words, cells);
    if (!chain) continue;
    const length = chain.reduce((n, w) => n + w.length, 0) - (chain.length - 1);
    const path = placePath(rng, length, dist);
    if (!path) continue;

    const grid = Array.from({ length: SIZE * SIZE }, () => pick(rng, SYLLABLES));
    const route = [];
    let at = 0;
    for (const w of chain) {
      const wordCells = path.slice(at, at + w.length);
      wordCells.forEach((c, i) => (grid[c] = w[i]));
      route.push({ word: w.join("-"), cells: wordCells });
      at += w.length - 1;
    }
    return { grid, start: path[0], finish: path[path.length - 1], route, par: chain.length, level };
  }
  throw new Error(`sem desafio para a semente ${seedText}`);
}

// ---- Jornada: fases numeradas que vão endurecendo ----

/**
 * Regras da fase n. `folga`: palavras além da rota oficial antes de perder. `pedras`: casas
 * bloqueadas. `moedas`: casas que dão moeda ao passar. `obrigatoria`: precisa passar pela ⭐.
 */
export function faseRegras(n) {
  const faixas = [
    [5, { words: [2, 3], cells: [5, 7], dist: 2, folga: 3, pedras: 0, moedas: 1, obrigatoria: false }],
    [10, { words: [3, 4], cells: [7, 9], dist: 3, folga: 2, pedras: 0, moedas: 2, obrigatoria: false }],
    [20, { words: [3, 5], cells: [8, 11], dist: 3, folga: 2, pedras: 2, moedas: 2, obrigatoria: false }],
    [30, { words: [4, 6], cells: [10, 12], dist: 3, folga: 1, pedras: 3, moedas: 2, obrigatoria: true }],
    [45, { words: [5, 7], cells: [11, 14], dist: 4, folga: 1, pedras: 4, moedas: 3, obrigatoria: true }],
    [Infinity, { words: [5, 7], cells: [12, 15], dist: 4, folga: 0, pedras: 5, moedas: 3, obrigatoria: true }],
  ];
  return faixas.find(([ate]) => n <= ate)[1];
}

/** Fase n da Jornada: mesmo tabuleiro para todo mundo, com pedras, moedas e casa obrigatória. */
export function fasePuzzle(n) {
  const regras = faseRegras(n);
  const p = makePuzzle(`fase:${n}`, regras);
  const rng = makeRng(hashSeed(`fase-extra:${n}`));
  const naRota = new Set(p.route.flatMap((r) => r.cells));
  const livres = shuffle(rng, p.grid.map((_, i) => i).filter((i) => !naRota.has(i)));
  const pedras = livres.slice(0, regras.pedras);
  const moedas = livres.slice(regras.pedras, regras.pedras + regras.moedas);
  const meio = [...naRota].filter((c) => c !== p.start && c !== p.finish);
  return {
    ...p,
    level: "fase",
    fase: n,
    maxPalavras: p.par + regras.folga,
    pedras,
    moedas,
    obrigatoria: regras.obrigatoria ? meio[Math.floor(rng() * meio.length)] : null,
  };
}

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayNumber(key) {
  const ms = Date.parse(`${key}T12:00:00Z`) - Date.parse(`${LAUNCH}T12:00:00Z`);
  return Math.round(ms / 86400000) + 1;
}

export function dailyPuzzle(key = dateKey(), level = "medio") {
  return makePuzzle(`rota-do-dia:${level}:${key}`, level);
}

// ---- solucionador (para as ajudas) ----

const MAX_SYL = 6;
const prefixCache = new WeakMap();

/** Prefixos das palavras que só usam sílabas presentes no tabuleiro: corta a busca cedo. */
function prefixes(puzzle) {
  let set = prefixCache.get(puzzle);
  if (set && set.extra === EXTRA.size) return set;
  set = new Set();
  set.extra = EXTRA.size;
  const noGrid = new Set(puzzle.grid);
  const add = (w) => {
    const s = w.split("-");
    if (s.length > MAX_SYL || !s.every((x) => noGrid.has(x))) return;
    for (let i = 1; i <= s.length; i++) set.add(s.slice(0, i).join("-"));
  };
  DICT.forEach(add);
  EXTRA.forEach(add);
  prefixCache.set(puzzle, set);
  return set;
}

/** Todas as palavras que dá para traçar saindo de `head` sem passar por casa usada (bitmask). */
function wordsFrom(puzzle, head, mask, pre) {
  const out = [];
  const trace = [head];
  const walk = (key) => {
    if (trace.length >= 2 && isWord(key)) out.push(trace.slice());
    if (trace.length === MAX_SYL) return;
    for (const n of NEIGHBORS[trace[trace.length - 1]]) {
      if (mask & (1 << n) || trace.includes(n)) continue;
      const k = `${key}-${puzzle.grid[n]}`;
      if (!pre.has(k)) continue;
      trace.push(n);
      walk(k);
      trace.pop();
    }
  };
  walk(puzzle.grid[head]);
  return out;
}

const NEIGHBORS = Array.from({ length: SIZE * SIZE }, (_, c) => neighbors(c));

/**
 * Menor sequência de palavras da posição atual até a chegada (busca em largura), ou null se não
 * houver saída. `limit` protege o celular de buscas longas.
 */
export function solve(puzzle, game, limit = 60000) {
  const pre = prefixes(puzzle);
  const fechadas = [...game.used, ...(game.blocked || [])];
  const start = { head: game.head, mask: fechadas.reduce((m, c) => m | (1 << c), 0), words: [] };
  const req = puzzle.obrigatoria ?? null;
  const chegou = (head, mask) => head === puzzle.finish && (req === null || (mask & (1 << req)) !== 0);
  if (chegou(start.head, start.mask)) return [];
  const seen = new Set([`${start.head}:${start.mask}`]);
  let fila = [start];
  while (fila.length) {
    const prox = [];
    for (const s of fila) {
      for (const w of wordsFrom(puzzle, s.head, s.mask, pre)) {
        const head = w[w.length - 1];
        const words = [...s.words, w];
        const mask = w.reduce((m, c) => m | (1 << c), s.mask);
        if (chegou(head, mask)) return words;
        const key = `${head}:${mask}`;
        if (seen.has(key)) continue;
        if (seen.size > limit) return null;
        seen.add(key);
        prox.push({ head, mask, words });
      }
    }
    fila = prox;
  }
  return null;
}

/** Prepara a busca das ajudas antes do clique (a primeira vez leva uns décimos de segundo). */
export const warmUp = (puzzle) => void prefixes(puzzle);

/** Casas que não aparecem na solução mais curta nem na rota oficial (para a ajuda "apagar casas"). */
export function uselessCells(puzzle, game, solution) {
  const keep = new Set([
    ...puzzle.route.flatMap((r) => r.cells), ...(solution || []).flat(), ...game.used, ...(game.blocked || []),
  ]);
  return puzzle.grid.map((_, i) => i).filter((i) => !keep.has(i));
}

// ---- estado da partida (imutável) ----

export function newGame(puzzle) {
  return { head: puzzle.start, used: [puzzle.start], words: [], hints: 0 };
}

/** Pode acrescentar `cell` ao traço atual (que começa na cabeça)? */
export function canExtend(game, trace, cell) {
  if (!trace.length) return cell === game.head;
  return isAdjacent(trace[trace.length - 1], cell) && !trace.includes(cell) && !game.used.includes(cell)
    && !(game.blocked || []).includes(cell);
}

export function traceWord(puzzle, trace) {
  return trace.map((c) => puzzle.grid[c]).join("-");
}

/** Resultado: { ok: true, game } ou { ok: false, reason }. */
export function submit(puzzle, game, trace) {
  if (trace.length < 2 || trace[0] !== game.head) return { ok: false, reason: "curta" };
  const word = traceWord(puzzle, trace);
  if (!isWord(word)) return { ok: false, reason: "desconhecida", word };
  return {
    ok: true,
    word,
    game: {
      ...game,
      head: trace[trace.length - 1],
      used: [...game.used, ...trace.slice(1)],
      words: [...game.words, { word, cells: trace }],
    },
  };
}

export function undo(puzzle, game) {
  if (!game.words.length) return game;
  const words = game.words.slice(0, -1);
  const removed = game.words[game.words.length - 1].cells.slice(1);
  return {
    ...game,
    words,
    head: words.length ? words[words.length - 1].cells.at(-1) : puzzle.start,
    used: game.used.filter((c) => !removed.includes(c)),
  };
}

/** Venceu: está na chegada e, se a fase tiver casa obrigatória (⭐), passou por ela. */
export const isWon = (puzzle, game) =>
  game.head === puzzle.finish && (puzzle.obrigatoria == null || game.used.includes(puzzle.obrigatoria));

/** Sem saída: nenhuma vizinha livre da cabeça. */
export const isStuck = (puzzle, game) =>
  !isWon(puzzle, game) && neighbors(game.head).every((c) => game.used.includes(c));

export function stars(puzzle, game) {
  const extra = game.words.length - puzzle.par;
  const base = extra <= 0 ? 3 : extra === 1 ? 2 : 1;
  return game.hints ? Math.min(base, 2) : base;
}
