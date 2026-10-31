<?php
// Cria o pagamento no Mercado Pago a partir do formulário do Payment Brick.
// Entrada: {jogador, segredo, pacote, formData}. O valor vem do pacote no servidor, não do navegador.
require __DIR__ . '/_loja.php';

$in = entrada();
$jogador = autenticar($in);
if (!pode_vender()) {
    responder(503, ['ok' => false, 'erro' => 'loja fechada']);
}
$pacoteId = (string)($in['pacote'] ?? '');
if (!isset(PACOTES[$pacoteId])) {
    responder(400, ['ok' => false, 'erro' => 'pacote']);
}
$pacote = PACOTES[$pacoteId];
$f = is_array($in['formData'] ?? null) ? $in['formData'] : [];
$metodo = (string)($f['payment_method_id'] ?? '');
$email = (string)($f['payer']['email'] ?? '');
if ($metodo === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    responder(400, ['ok' => false, 'erro' => 'dados']);
}

$compra = aleatorio(12);
db()->prepare('INSERT INTO compras (id, jogador, pacote, valor, status, criado) VALUES (?, ?, ?, ?, ?, ?)')
    ->execute([$compra, $jogador, $pacoteId, $pacote['preco'], 'criada', time()]);

$corpo = [
    'transaction_amount' => $pacote['preco'],
    'description' => 'Rota do Dia - ' . $pacote['nome'],
    'payment_method_id' => $metodo,
    'external_reference' => $compra,
    'notification_url' => 'https://' . $_SERVER['HTTP_HOST'] . '/api/webhook-mp.php',
    'statement_descriptor' => 'ROTADODIA',
    'payer' => ['email' => $email],
];
if ($metodo === 'pix') {
    // Pix vence em 30 min: não deixa compra pendente para sempre
    $corpo['date_of_expiration'] = (new DateTime('+30 minutes'))->format('Y-m-d\TH:i:s.vP');
}
if (!empty($f['token'])) { // cartão
    $corpo['token'] = (string)$f['token'];
    $corpo['installments'] = 1;
    if (!empty($f['issuer_id'])) { // sem ele o Mercado Pago recusa com 10113 (excludes_by_rule)
        $corpo['issuer_id'] = (string)$f['issuer_id'];
    }
    $doc = $f['payer']['identification'] ?? null;
    if (is_array($doc) && !empty($doc['type']) && !empty($doc['number'])) {
        $corpo['payer']['identification'] = ['type' => (string)$doc['type'], 'number' => (string)$doc['number']];
    }
}

[$codigo, $p] = mp('POST', '/v1/payments', $corpo, $compra);
if ($codigo < 200 || $codigo >= 300 || empty($p['id'])) {
    db()->prepare('UPDATE compras SET status = ?, detalhe = ? WHERE id = ?')
        ->execute(['erro', substr((string)($p['message'] ?? $codigo), 0, 200), $compra]);
    $resp = ['ok' => false, 'erro' => 'pagamento recusado'];
    if ((cfg()['MP_AMBIENTE'] ?? '') === 'teste') { // só em teste: mostra o motivo do Mercado Pago na tela
        $resp['motivo'] = substr('[' . $metodo . '] ' . $codigo . ' ' . ($p['message'] ?? '') . ' ' . json_encode($p['cause'] ?? ''), 0, 300);
    }
    responder(502, $resp);
}

db()->prepare('UPDATE compras SET mp_id = ?, status = ?, detalhe = ?, conferido = ? WHERE id = ?')
    ->execute([(string)$p['id'], (string)$p['status'], (string)($p['status_detail'] ?? ''), time(), $compra]);

$pix = $p['point_of_interaction']['transaction_data'] ?? null;
responder(200, [
    'ok' => true,
    'compra' => $compra,
    'status' => $p['status'],
    'detalhe' => $p['status_detail'] ?? '',
    'pix' => $pix ? [
        'copiaECola' => $pix['qr_code'] ?? '',
        'qrBase64' => $pix['qr_code_base64'] ?? '',
        'link' => $pix['ticket_url'] ?? '',
    ] : null,
]);
