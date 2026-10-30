// node --test jogos/rota-do-dia/tests
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DICT, WORDS, dailyPuzzle, dayNumber, isAdjacent, isStuck, isWon, makePuzzle, newGame, stars,
  submit, undo,
} from "../puzzle.js";

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

test("treino: sementes aleatórias também geram desafio", () => {
  for (let i = 0; i < 300; i++) assert.ok(isWon(makePuzzle(`treino-${i}`), play(makePuzzle(`treino-${i}`))));
});
