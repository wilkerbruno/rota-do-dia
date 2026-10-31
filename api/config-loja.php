<?php
// O que o navegador pode saber da loja: se está aberta, a chave pública e os pacotes.
require __DIR__ . '/_loja.php';

$c = cfg();
$pacotes = [];
foreach (PACOTES as $id => $p) {
    $pacotes[] = ['id' => $id] + $p;
}
responder(200, [
    'configurada' => cfg_ok(),
    'publica' => ($c['LOJA_PUBLICA'] ?? '0') === '1' && cfg_ok(),
    'ambiente' => $c['MP_AMBIENTE'] ?? '',
    'publicKey' => cfg_ok() ? $c['MP_PUBLIC_KEY'] : '',
    'pacotes' => $pacotes,
]);
