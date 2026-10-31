// Moedas do jogo: ganhos, bônus diário, compras e limites por dia. Sem DOM, para testar no Node.
//
// As moedas não valem dinheiro: não se compram nem se trocam por nada fora do jogo. Ficam só no
// aparelho do jogador (quem mexer no armazenamento só engana a si mesmo).

import { LEVELS } from "./puzzle.js";

export const INICIAIS = 50;
export const BONUS_DIARIO = [10, 15, 20, 25, 30, 40, 60]; // 7º dia em diante: 60
export const VIDEO_MOEDAS = 25;
export const LIMITES = { videoMoedas: 5, videoAjuda: 3, treinosPremiados: 10 };
export const TREINO_MOEDAS = 5;

export const PRECOS = {
  proxima: 30, // destaca a próxima palavra de um caminho que chega
  apagar: 20, // apaga 5 casas que não servem para nada
  rota: 60, // mostra a rota oficial inteira
  escudo: 120, // guarda a sequência se faltar um dia
};

export const TEMAS = {
  neon: { nome: "Neon", preco: 0 },
  oceano: { nome: "Oceano", preco: 250 },
  pordosol: { nome: "Pôr do sol", preco: 400 },
  ouro: { nome: "Ouro", preco: 800 },
};

/** Moedas por vencer o desafio do dia: base do nível + 5 por estrela. */
export const premioVitoria = (level, estrelas) => LEVELS[level].moedas + 5 * estrelas;

export function novaCarteira() {
  return { moedas: INICIAIS, escudos: 0, temas: ["neon"], tema: "neon", bonus: null, hoje: null };
}

const ontemDe = (key) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Contadores que zeram a cada dia (vídeos assistidos, treinos premiados). */
function doDia(c, hoje) {
  if (c.hoje?.data !== hoje) c.hoje = { data: hoje, videoMoedas: 0, videoAjuda: 0, treinosPremiados: 0 };
  return c.hoje;
}

export const restante = (c, hoje, tipo) => LIMITES[tipo] - (doDia(structuredClone(c), hoje)[tipo] || 0);

/** Bônus da primeira abertura do dia. Devolve { carteira, valor, dia } ou null se já recebeu. */
export function bonusDiario(carteira, hoje) {
  const c = structuredClone(carteira);
  if (c.bonus?.data === hoje) return null;
  const seq = c.bonus?.data === ontemDe(hoje) ? c.bonus.seq + 1 : 1;
  const valor = BONUS_DIARIO[Math.min(seq, BONUS_DIARIO.length) - 1];
  c.bonus = { data: hoje, seq };
  c.moedas += valor;
  return { carteira: c, valor, dia: seq };
}

export function ganhar(carteira, valor) {
  return { ...carteira, moedas: carteira.moedas + valor };
}

/** Gasta se tiver saldo. Devolve a carteira nova ou null. */
export function gastar(carteira, valor) {
  return carteira.moedas >= valor ? { ...carteira, moedas: carteira.moedas - valor } : null;
}

/** Usa uma das cotas do dia (vídeo por moedas, vídeo por ajuda, treino premiado). Null se acabou. */
export function usarCota(carteira, hoje, tipo) {
  const c = structuredClone(carteira);
  const d = doDia(c, hoje);
  if ((d[tipo] || 0) >= LIMITES[tipo]) return null;
  d[tipo] = (d[tipo] || 0) + 1;
  return c;
}

export function comprarTema(carteira, id) {
  if (carteira.temas.includes(id)) return { ...carteira, tema: id };
  const c = gastar(carteira, TEMAS[id].preco);
  return c && { ...c, temas: [...c.temas, id], tema: id };
}

/**
 * Sequência de dias com vitória. Faltou exatamente um dia e tem escudo: gasta o escudo e mantém.
 * Devolve { stats, carteira, usouEscudo }.
 */
export function registrarDia(stats, carteira, hoje) {
  const st = { ...stats };
  let c = carteira;
  let usouEscudo = false;
  if (st.ultimo === hoje) return { stats: st, carteira: c, usouEscudo };
  if (st.ultimo === ontemDe(hoje)) st.seq += 1;
  else if (st.ultimo === ontemDe(ontemDe(hoje)) && c.escudos > 0) {
    c = { ...c, escudos: c.escudos - 1 };
    st.seq += 1;
    usouEscudo = true;
  } else st.seq = 1;
  st.melhor = Math.max(st.melhor, st.seq);
  st.ultimo = hoje;
  return { stats: st, carteira: c, usouEscudo };
}
