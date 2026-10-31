<?php
// Conta anônima do jogador para guardar compras. Sem nome, e-mail ou telefone.
//   {"acao":"novo"}                       -> {jogador, segredo, codigo}
//   {"acao":"recuperar","codigo":"ABCD-…"} -> {jogador, segredo, codigo} (segredo novo; o antigo deixa de valer)
require __DIR__ . '/_loja.php';

$in = entrada();
$acao = $in['acao'] ?? '';

if ($acao === 'novo') {
    $id = aleatorio(16);
    $seg = aleatorio(32);
    $pdo = db();
    for ($i = 0; $i < 5; $i++) {
        $codigo = novo_codigo();
        try {
            $pdo->prepare('INSERT INTO jogadores (id, segredo_hash, codigo, criado) VALUES (?, ?, ?, ?)')
                ->execute([$id, hash('sha256', $seg), $codigo, time()]);
            responder(200, ['ok' => true, 'jogador' => $id, 'segredo' => $seg, 'codigo' => $codigo]);
        } catch (PDOException $e) {
            // código repetido: tenta outro
        }
    }
    responder(500, ['ok' => false]);
}

if ($acao === 'recuperar') {
    usleep(400000); // freia tentativa de adivinhar código
    $codigo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($in['codigo'] ?? '')));
    if (strlen($codigo) !== 12) {
        responder(400, ['ok' => false]);
    }
    $codigo = substr($codigo, 0, 4) . '-' . substr($codigo, 4, 4) . '-' . substr($codigo, 8, 4);
    $st = db()->prepare('SELECT id FROM jogadores WHERE codigo = ?');
    $st->execute([$codigo]);
    $id = $st->fetchColumn();
    if (!$id) {
        responder(404, ['ok' => false]);
    }
    $seg = aleatorio(32);
    db()->prepare('UPDATE jogadores SET segredo_hash = ? WHERE id = ?')->execute([hash('sha256', $seg), $id]);
    responder(200, ['ok' => true, 'jogador' => $id, 'segredo' => $seg, 'codigo' => $codigo]);
}

responder(400, ['ok' => false]);
