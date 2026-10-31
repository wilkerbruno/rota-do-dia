// node --test jogos/rota-do-dia/tests
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INICIAIS, LIMITES, PRECOS, bonusDiario, comprarTema, gastar, ganhar, novaCarteira, premioVitoria,
  registrarDia, restante, usarCota,
} from "../carteira.js";

test("carteira nova começa com saldo e tema padrão", () => {
  const c = novaCarteira();
  assert.equal(c.moedas, INICIAIS);
  assert.deepEqual(c.temas, ["neon"]);
});

test("bônus diário cresce com dias seguidos, reinicia se pular e não paga duas vezes", () => {
  let c = novaCarteira();
  const valores = [];
  for (const d of ["2026-11-01", "2026-11-02", "2026-11-03"]) {
    const r = bonusDiario(c, d);
    valores.push(r.valor);
    c = r.carteira;
  }
  assert.deepEqual(valores, [10, 15, 20]);
  assert.equal(bonusDiario(c, "2026-11-03"), null);
  assert.equal(bonusDiario(c, "2026-11-05").valor, 10);
  assert.equal(c.moedas, INICIAIS + 45);
});

test("gastar só com saldo; prêmio maior no difícil", () => {
  const c = novaCarteira();
  assert.equal(gastar(c, INICIAIS + 1), null);
  assert.equal(gastar(c, PRECOS.proxima).moedas, INICIAIS - PRECOS.proxima);
  assert.ok(premioVitoria("dificil", 3) > premioVitoria("medio", 3));
  assert.ok(premioVitoria("medio", 3) > premioVitoria("medio", 1));
});

test("cotas diárias de vídeo acabam e voltam no dia seguinte", () => {
  let c = novaCarteira();
  for (let i = 0; i < LIMITES.videoMoedas; i++) c = usarCota(c, "2026-11-01", "videoMoedas");
  assert.equal(usarCota(c, "2026-11-01", "videoMoedas"), null);
  assert.equal(restante(c, "2026-11-01", "videoMoedas"), 0);
  assert.equal(restante(c, "2026-11-02", "videoMoedas"), LIMITES.videoMoedas);
  assert.ok(usarCota(c, "2026-11-02", "videoMoedas"));
});

test("tema: compra uma vez, depois só troca", () => {
  let c = ganhar(novaCarteira(), 300);
  c = comprarTema(c, "oceano");
  assert.equal(c.moedas, INICIAIS + 300 - 250);
  assert.equal(c.tema, "oceano");
  c = comprarTema(c, "neon");
  c = comprarTema(c, "oceano");
  assert.equal(c.moedas, INICIAIS + 50);
  assert.equal(comprarTema(c, "ouro"), null);
});

test("sequência: dia seguido soma, escudo cobre um dia de falta, sem escudo zera", () => {
  const st = { seq: 4, melhor: 4, ultimo: "2026-11-03" };
  assert.equal(registrarDia(st, novaCarteira(), "2026-11-04").stats.seq, 5);
  const semEscudo = registrarDia(st, novaCarteira(), "2026-11-05");
  assert.equal(semEscudo.stats.seq, 1);
  const comEscudo = registrarDia(st, { ...novaCarteira(), escudos: 1 }, "2026-11-05");
  assert.equal(comEscudo.stats.seq, 5);
  assert.equal(comEscudo.carteira.escudos, 0);
  assert.ok(comEscudo.usouEscudo);
  assert.equal(registrarDia(st, novaCarteira(), "2026-11-03").stats.seq, 4);
});
