<?php
// Contador anônimo do Rota do Dia. Recebe só: evento, número do desafio e se o aparelho jogou ontem.
// Não grava IP, cookie, identificador nem user agent. Soma por dia num JSON fora da pasta pública.
//
// Corpo: {"e":"inicio|vitoria|compartilhar|video","d":<nº do desafio>,"r":0|1}

header('Content-Type: application/json');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit('{"ok":false}');
}

$raw = file_get_contents('php://input', false, null, 0, 200);
$in = json_decode($raw ?: '', true);
$eventos = ['inicio', 'vitoria', 'compartilhar', 'video'];

if (!is_array($in) || !in_array($in['e'] ?? null, $eventos, true)
    || !is_int($in['d'] ?? null) || $in['d'] < 1 || $in['d'] > 100000
    || !in_array($in['r'] ?? null, [0, 1], true)) {
    http_response_code(400);
    exit('{"ok":false}');
}

// pasta ao lado de public_html, para os números não ficarem acessíveis pela web
$base = __DIR__;
while ($base !== dirname($base) && basename($base) !== 'public_html') {
    $base = dirname($base);
}
$dir = getenv('ROTA_DADOS') ?: (basename($base) === 'public_html' ? dirname($base) : dirname(__DIR__, 2)) . '/rota-dados';
if (!is_dir($dir) && !mkdir($dir, 0750, true)) {
    http_response_code(500);
    exit('{"ok":false}');
}

$arquivo = $dir . '/contagem.json';
$fp = fopen($arquivo, 'c+');
if (!$fp || !flock($fp, LOCK_EX)) {
    http_response_code(500);
    exit('{"ok":false}');
}

$dados = json_decode(stream_get_contents($fp) ?: '{}', true) ?: [];
$dia = (string) $in['d'];
$chave = $in['e'] . ($in['r'] ? '_retorno' : '');
$dados[$dia][$chave] = ($dados[$dia][$chave] ?? 0) + 1;

ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($dados, JSON_PRETTY_PRINT));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

echo '{"ok":true}';
