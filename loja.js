// Loja de moedas com dinheiro: conta anônima do jogador, Payment Brick do Mercado Pago (Pix e
// cartão dentro da nossa tela) e sincronização das compras aprovadas pelo servidor.
//
// A loja só aparece quando o servidor diz que está pública, ou com ?loja=teste na URL.

const guardar = (k, v) => { try { localStorage.setItem(`rota:v1:${k}`, JSON.stringify(v)); } catch {} };
const ler = (k, padrao) => {
  try { const v = localStorage.getItem(`rota:v1:${k}`); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
};

let config = null;

async function api(arquivo, corpo) {
  const r = await fetch(`api/${arquivo}`, {
    method: corpo ? "POST" : "GET",
    headers: corpo ? { "Content-Type": "application/json" } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  return { status: r.status, ...dados };
}

function querTeste() {
  try {
    if (new URLSearchParams(location.search).get("loja") === "teste") sessionStorage.setItem("rota:loja", "teste");
    return sessionStorage.getItem("rota:loja") === "teste";
  } catch {
    return false;
  }
}

/** Carrega a configuração pública. Devolve true se a loja deve aparecer. */
export async function iniciarLoja() {
  try {
    config = await api("config-loja.php");
  } catch {
    config = null;
  }
  return lojaVisivel();
}

export const lojaVisivel = () => !!config?.configurada && (config.publica || querTeste());
export const pacotes = () => config?.pacotes || [];
export const ambienteTeste = () => config?.ambiente === "teste";

/** Conta anônima: cria na primeira compra. */
export async function garantirJogador() {
  let j = ler("jogador", null);
  if (j?.jogador && j?.segredo) return j;
  const r = await api("jogador.php", { acao: "novo" });
  if (!r.ok) throw new Error("não foi possível criar a conta");
  j = { jogador: r.jogador, segredo: r.segredo, codigo: r.codigo };
  guardar("jogador", j);
  return j;
}

export const codigoRecuperacao = () => ler("jogador", null)?.codigo || "";

export async function recuperar(codigo) {
  const r = await api("jogador.php", { acao: "recuperar", codigo });
  if (!r.ok) return false;
  guardar("jogador", { jogador: r.jogador, segredo: r.segredo, codigo: r.codigo });
  guardar("creditado", 0); // aparelho novo: recebe tudo o que já foi comprado
  return true;
}

/**
 * Pergunta ao servidor o total comprado e devolve só o que ainda não entrou neste aparelho:
 * { novasMoedas, semAnuncios, pendentes }.
 */
export async function sincronizar() {
  const j = ler("jogador", null);
  if (!j) return { novasMoedas: 0, semAnuncios: ler("semAnuncios", false), pendentes: 0 };
  const r = await api("compras.php", { jogador: j.jogador, segredo: j.segredo });
  if (r.status === 401) return { novasMoedas: 0, semAnuncios: ler("semAnuncios", false), pendentes: 0, outroAparelho: true };
  if (!r.ok) return { novasMoedas: 0, semAnuncios: ler("semAnuncios", false), pendentes: 0 };
  const creditado = ler("creditado", 0);
  const novas = Math.max(0, r.moedasCompradas - creditado);
  guardar("creditado", Math.max(creditado, r.moedasCompradas));
  if (r.semAnuncios) guardar("semAnuncios", true);
  const pendentes = r.compras.filter((c) => ["pending", "in_process", "authorized"].includes(c.status)).length;
  return { novasMoedas: novas, semAnuncios: !!r.semAnuncios || ler("semAnuncios", false), pendentes };
}

// ---- pagamento ----

let sdk = null;
function carregarSdk() {
  sdk ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://sdk.mercadopago.com/js/v2";
    s.onload = () => resolve(window.MercadoPago);
    s.onerror = () => reject(new Error("SDK do Mercado Pago não carregou"));
    document.head.appendChild(s);
  });
  return sdk;
}

let brickAtual = null;

/**
 * Monta o Payment Brick no elemento `container` para o pacote. `aoResultado` recebe
 * { status, pix } quando o servidor criar o pagamento, ou { erro }.
 */
export async function abrirPagamento(container, pacoteId, aoResultado) {
  const pacote = pacotes().find((p) => p.id === pacoteId);
  if (!pacote) return aoResultado({ erro: "Pacote não encontrado" });
  const j = await garantirJogador();
  const MP = await carregarSdk();
  await fecharPagamento();
  const mp = new MP(config.publicKey, { locale: "pt-BR" });
  const aviso = setTimeout(() => {
    if (!container.children.length) aoResultado({ erro: "Não foi possível abrir o pagamento agora. Tente de novo em instantes." });
  }, 8000);
  brickAtual = await mp.bricks().create("payment", container.id, {
    initialization: { amount: pacote.preco },
    customization: {
      paymentMethods: { bankTransfer: ["pix"], creditCard: "all", maxInstallments: 1 },
      visual: { style: { theme: "dark" } },
    },
    callbacks: {
      onReady: () => clearTimeout(aviso),
      onError: (e) => {
        console.warn("brick", e);
        if (e?.type === "critical") aoResultado({ erro: "Não foi possível abrir o pagamento agora. Tente de novo em instantes." });
      },
      onSubmit: ({ formData }) =>
        api("pagar.php", { jogador: j.jogador, segredo: j.segredo, pacote: pacoteId, formData })
          .then((r) => aoResultado(r.ok ? { status: r.status, pix: r.pix } : { erro: "Pagamento não foi aceito. Confira os dados." }))
          .catch(() => aoResultado({ erro: "Sem conexão com o servidor" })),
    },
  });
}

export async function fecharPagamento() {
  try { await brickAtual?.unmount(); } catch {}
  brickAtual = null;
}
