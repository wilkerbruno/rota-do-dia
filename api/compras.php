<?php
// Saldo de compras do jogador. Pagamentos ainda pendentes são reconferidos no Mercado Pago (no
// máximo a cada 10 s cada um), então funciona mesmo se o webhook atrasar.
// Entrada: {jogador, segredo} -> {moedasCompradas, semAnuncios, compras: [{id, pacote, status}]}
require __DIR__ . '/_loja.php';

$in = entrada();
$jogador = autenticar($in);

if (cfg_ok()) {
    $st = db()->prepare("SELECT mp_id FROM compras WHERE jogador = ? AND mp_id IS NOT NULL
        AND status IN ('pending', 'in_process', 'authorized') AND conferido < ? AND criado > ?");
    $st->execute([$jogador, time() - 10, time() - 86400]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $mpId) {
        atualizar_pela_api($mpId);
    }
}

$st = db()->prepare('SELECT id, pacote, status, criado FROM compras WHERE jogador = ? ORDER BY criado DESC LIMIT 50');
$st->execute([$jogador]);
$moedas = 0;
$semAnuncios = false;
$lista = [];
foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $c) {
    $p = PACOTES[$c['pacote']] ?? null;
    if ($p && $c['status'] === 'approved') {
        $moedas += $p['moedas'];
        $semAnuncios = $semAnuncios || $p['semAnuncios'];
    }
    $lista[] = ['id' => $c['id'], 'pacote' => $c['pacote'], 'status' => $c['status'], 'criado' => (int)$c['criado']];
}
responder(200, ['ok' => true, 'moedasCompradas' => $moedas, 'semAnuncios' => $semAnuncios, 'compras' => $lista]);
