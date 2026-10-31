// node --test jogos/rota-do-dia/tests
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DICT, LEVELS, WORDS, dailyPuzzle, dayNumber, isAdjacent, isStuck, isWon, isWord, loadExtra,
  makePuzzle, neighbors, newGame, solve, stars, submit, undo, uselessCells,
} from "../puzzle.js";

test("dicionário completo aceita palavras fora da lista básica", () => {
  assert.equal(isWord("CO-ME-MO-RA-ÇÃO"), false);
  const n = loadExtra(readFileSync(new URL("../palavras-validas.txt", import.meta.url), "utf-8"));
  assert.ok(n > 100000, `só ${n} palavras`);
  for (const w of ["CO-ME-MO-RA-ÇÃO", "PI-PO-CAS", "CA-NE-TA", "TO-MA-TE"]) assert.ok(isWord(w), w);
  for (const w of ["CA-TO-PI", "ZE-ZE-ZE"]) assert.equal(isWord(w), false, w);
  for (const w of WORDS) assert.ok(isWord(w.join("-")));
});

function play(puzzle) {
  let game = newGame(puzzle);
  for (const step of puzzle.route) {
    const r = submit(puzzle, game, step.cells);
    assert.ok(r.ok, `rota oficial recusada: ${step.word}`);
    game = r.game;
  }
  return game;
}

test("dicionário só tem sílabas limpas e palavras sem repetição", () => {
  assert.equal(DICT.size, WORDS.length);
  for (const w of WORDS) {
    assert.ok(w.length >= 2, w.join("-"));
    for (const s of w) assert.match(s, /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{1,4}$/, w.join("-"));
  }
});

test("dois anos de desafios diários: rota oficial válida e vencível em 3 estrelas", () => {
  const day = new Date("2026-11-01T12:00:00");
  for (let i = 0; i < 730; i++) {
    const key = day.toISOString().slice(0, 10);
    const p = dailyPuzzle(key);
    assert.equal(p.grid.length, 25);
    assert.notEqual(p.start, p.finish);
    for (const { word, cells } of p.route) {
      assert.ok(DICT.has(word), word);
      for (let k = 1; k < cells.length; k++) assert.ok(isAdjacent(cells[k - 1], cells[k]));
    }
    const game = play(p);
    assert.ok(isWon(p, game), key);
    assert.equal(stars(p, game), 3);
    day.setDate(day.getDate() + 1);
  }
});

test("mesmo dia gera o mesmo desafio; dias diferentes mudam", () => {
  assert.deepEqual(dailyPuzzle("2026-11-05"), dailyPuzzle("2026-11-05"));
  assert.notDeepEqual(dailyPuzzle("2026-11-05").grid, dailyPuzzle("2026-11-06").grid);
});

test("numeração começa no lançamento", () => {
  assert.equal(dayNumber("2026-11-01"), 1);
  assert.equal(dayNumber("2026-11-30"), 30);
});

test("regras: palavra precisa sair da cabeça, existir e não reusar casa", () => {
  const p = makePuzzle("teste");
  const game = newGame(p);
  const first = p.route[0].cells;
  assert.equal(submit(p, game, first.slice(1)).ok, false);
  assert.equal(submit(p, game, [first[0]]).reason, "curta");
  const ok = submit(p, game, first);
  assert.ok(ok.ok);
  assert.equal(ok.game.head, first.at(-1));
  const back = undo(p, ok.game);
  assert.deepEqual(back, game);
});

test("estrelas caem com palavra extra ou dica", () => {
  const p = makePuzzle("estrelas");
  const won = play(p);
  assert.equal(stars(p, { ...won, hints: 1 }), 2);
  assert.equal(stars(p, { ...won, words: [...won.words, won.words[0]] }), 2);
  assert.equal(isStuck(p, won), false);
});

test("três níveis geram um ano de desafios com rota oficial vencível", () => {
  for (const level of Object.keys(LEVELS)) {
    const { words, cells } = LEVELS[level];
    const day = new Date("2026-11-01T12:00:00");
    for (let i = 0; i < 365; i++) {
      const p = dailyPuzzle(day.toISOString().slice(0, 10), level);
      assert.ok(p.par >= words[0] && p.par <= words[1], `${level} par ${p.par}`);
      const len = p.route.reduce((n, r) => n + r.cells.length, 0) - (p.route.length - 1);
      assert.ok(len >= cells[0] && len <= cells[1], `${level} ${len} casas`);
      assert.ok(isWon(p, play(p)));
      day.setDate(day.getDate() + 1);
    }
  }
});

test("solucionador acha caminho até a chegada, no máximo do tamanho da rota oficial", () => {
  for (const level of Object.keys(LEVELS)) {
    for (let i = 0; i < 40; i++) {
      const p = makePuzzle(`solver-${level}-${i}`, level);
      let game = newGame(p);
      const sol = solve(p, game);
      assert.ok(sol && sol.length <= p.par, `${level} ${i}: ${sol?.length} > ${p.par}`);
      for (const w of sol) {
        const r = submit(p, game, w);
        assert.ok(r.ok);
        game = r.game;
      }
      assert.ok(isWon(p, game));
      // a partir do meio da rota oficial também
      const meio = submit(p, newGame(p), p.route[0].cells).game;
      assert.ok(solve(p, meio));
    }
  }
});

test("sem saída: solucionador devolve null", () => {
  const p = makePuzzle("preso");
  const viz = neighbors(p.start);
  const preso = { ...newGame(p), used: [p.start, ...viz] };
  assert.equal(solve(p, preso), null);
  assert.ok(uselessCells(p, newGame(p), solve(p, newGame(p))).every((c) => !p.route[0].cells.includes(c)));
});

test("treino: sementes aleatórias também geram desafio", () => {
  for (let i = 0; i < 300; i++) assert.ok(isWon(makePuzzle(`treino-${i}`), play(makePuzzle(`treino-${i}`))));
});
