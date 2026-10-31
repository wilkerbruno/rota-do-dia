// node --test jogos/rota-do-dia/tests
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { faseRegras, fasePuzzle, isWon, loadExtra, newGame, solve, submit } from "../puzzle.js";

loadExtra(readFileSync(new URL("../palavras-validas.txt", import.meta.url), "utf-8"));

const jogo = (p) => ({ ...newGame(p), blocked: p.pedras });

test("200 fases: rota oficial evita pedras, passa pela ⭐ e cabe no limite de palavras", () => {
  for (let n = 1; n <= 200; n++) {
    const p = fasePuzzle(n);
    const naRota = new Set(p.route.flatMap((r) => r.cells));
    for (const c of [...p.pedras, ...p.moedas]) assert.ok(!naRota.has(c), `fase ${n}: extra na rota`);
    assert.equal(new Set([...p.pedras, ...p.moedas]).size, p.pedras.length + p.moedas.length);
    if (p.obrigatoria !== null) assert.ok(naRota.has(p.obrigatoria) && p.obrigatoria !== p.start);
    let g = jogo(p);
    for (const r of p.route) {
      const s = submit(p, g, r.cells);
      assert.ok(s.ok, `fase ${n}: ${r.word}`);
      g = s.game;
    }
    assert.ok(isWon(p, g), `fase ${n}`);
    assert.ok(p.par <= p.maxPalavras);
  }
});

test("dificuldade sobe: menos folga, mais pedras, rota mais longa", () => {
  const a = faseRegras(1);
  const z = faseRegras(80);
  assert.ok(a.folga > z.folga && a.pedras < z.pedras && a.cells[1] < z.cells[1]);
  assert.equal(faseRegras(25).obrigatoria, true);
  assert.equal(faseRegras(3).obrigatoria, false);
});

test("mesma fase gera o mesmo tabuleiro", () => {
  assert.deepEqual(fasePuzzle(17), fasePuzzle(17));
});

test("chegar sem passar pela ⭐ não vence; solucionador respeita a ⭐", () => {
  let achou = false;
  for (let n = 21; n <= 60; n++) {
    const p = fasePuzzle(n);
    const sol = solve(p, jogo(p));
    assert.ok(sol && sol.length <= p.maxPalavras, `fase ${n}: solução ${sol?.length}`);
    assert.ok(sol.flat().includes(p.obrigatoria), `fase ${n}: solução sem ⭐`);
    const semEstrela = { ...jogo(p), head: p.finish, used: [p.start, p.finish] };
    assert.equal(isWon(p, semEstrela), false);
    achou = true;
  }
  assert.ok(achou);
});
