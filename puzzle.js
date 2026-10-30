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

/** Caminho sem repetir casa, de tamanho exato, com início e fim afastados. */
function placePath(rng, length) {
  const start = Math.floor(rng() * SIZE * SIZE);
  const path = [start];
  const seen = new Set(path);
  let steps = 0;
  const walk = () => {
    if (++steps > 4000) return false;
    if (path.length === length) {
      const [r0, c0] = rowCol(path[0]);
      const [r1, c1] = rowCol(path[path.length - 1]);
      return Math.max(Math.abs(r0 - r1), Math.abs(c0 - c1)) >= 3;
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

/**
 * Desafio determinístico para a semente. `words` e `cells` controlam o tamanho da rota oficial.
 * Retorna { grid, start, finish, route: [{ word, cells }], par }.
 */
export function makePuzzle(seedText, { words = [3, 5], cells = [8, 11] } = {}) {
  const rng = makeRng(hashSeed(seedText));
  for (let attempt = 0; attempt < 500; attempt++) {
    const chain = buildChain(rng, words, cells);
    if (!chain) continue;
    const length = chain.reduce((n, w) => n + w.length, 0) - (chain.length - 1);
    const path = placePath(rng, length);
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
    return { grid, start: path[0], finish: path[path.length - 1], route, par: chain.length };
  }
  throw new Error(`sem desafio para a semente ${seedText}`);
}

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayNumber(key) {
  const ms = Date.parse(`${key}T12:00:00Z`) - Date.parse(`${LAUNCH}T12:00:00Z`);
  return Math.round(ms / 86400000) + 1;
}

export function dailyPuzzle(key = dateKey()) {
  return makePuzzle(`rota-do-dia:${key}`);
}

// ---- estado da partida (imutável) ----

export function newGame(puzzle) {
  return { head: puzzle.start, used: [puzzle.start], words: [], hints: 0 };
}

/** Pode acrescentar `cell` ao traço atual (que começa na cabeça)? */
export function canExtend(game, trace, cell) {
  if (!trace.length) return cell === game.head;
  return isAdjacent(trace[trace.length - 1], cell) && !trace.includes(cell) && !game.used.includes(cell);
}

export function traceWord(puzzle, trace) {
  return trace.map((c) => puzzle.grid[c]).join("-");
}

/** Resultado: { ok: true, game } ou { ok: false, reason }. */
export function submit(puzzle, game, trace) {
  if (trace.length < 2 || trace[0] !== game.head) return { ok: false, reason: "curta" };
  const word = traceWord(puzzle, trace);
  if (!DICT.has(word)) return { ok: false, reason: "desconhecida", word };
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

export const isWon = (puzzle, game) => game.head === puzzle.finish;

/** Sem saída: nenhuma vizinha livre da cabeça. */
export const isStuck = (puzzle, game) =>
  !isWon(puzzle, game) && neighbors(game.head).every((c) => game.used.includes(c));

export function stars(puzzle, game) {
  const extra = game.words.length - puzzle.par;
  const base = extra <= 0 ? 3 : extra === 1 ? 2 : 1;
  return game.hints ? Math.min(base, 2) : base;
}
