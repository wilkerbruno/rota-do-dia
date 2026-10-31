<?php
// Notificações do Mercado Pago. Confere a assinatura (x-signature) com MP_WEBHOOK_SECRET e, se
// válida, consulta o pagamento na API (o corpo da notificação não é usado como verdade).
// Doc: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
require __DIR__ . '/_loja.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    responder(405, ['ok' => false]);
}
$segredo = cfg()['MP_WEBHOOK_SECRET'] ?? '';
$assinatura = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
$requestId = $_SERVER['HTTP_X_REQUEST_ID'] ?? '';
$dataId = (string)($_GET['data_id'] ?? $_GET['data.id'] ?? '');
if ($dataId === '') {
    $corpo = json_decode(file_get_contents('php://input', false, null, 0, 20000) ?: '', true);
    $dataId = (string)($corpo['data']['id'] ?? '');
}

$ts = '';
$v1 = '';
foreach (explode(',', $assinatura) as $parte) {
    $kv = explode('=', trim($parte), 2);
    if (count($kv) === 2) {
        if ($kv[0] === 'ts') {
            $ts = $kv[1];
        } elseif ($kv[0] === 'v1') {
            $v1 = $kv[1];
        }
    }
}
if ($segredo === '' || $ts === '' || $v1 === '' || $dataId === '') {
    responder(401, ['ok' => false]);
}
$manifesto = 'id:' . strtolower($dataId) . ';request-id:' . $requestId . ';ts:' . $ts . ';';
if (!hash_equals(hash_hmac('sha256', $manifesto, $segredo), $v1)) {
    responder(401, ['ok' => false]);
}

if (cfg_ok() && preg_match('/^\d+$/', $dataId)) {
    atualizar_pela_api($dataId);
}
responder(200, ['ok' => true]);
