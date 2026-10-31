<?php
// Base da loja de moedas do Rota do Dia (PHP 7.4). Não é endpoint: os outros arquivos incluem este.
//
// Credenciais ficam FORA da public_html, em ~/config/mercadopago.env (formato CHAVE=valor):
//   MP_AMBIENTE=teste|producao   MP_PUBLIC_KEY=   MP_ACCESS_TOKEN=   MP_WEBHOOK_SECRET=   LOJA_PUBLICA=0|1
// Compras ficam em ~/rota-dados/loja.sqlite. O preço vem sempre daqui, nunca do navegador.

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

header('Content-Type: application/json');
header('Cache-Control: no-store');

const PACOTES = [
    'p300' => ['nome' => '300 moedas', 'moedas' => 300, 'preco' => 4.90, 'semAnuncios' => false],
    'p800' => ['nome' => '800 moedas', 'moedas' => 800, 'preco' => 9.90, 'semAnuncios' => false],
    'p2000' => ['nome' => '2.000 moedas', 'moedas' => 2000, 'preco' => 19.90, 'semAnuncios' => false],
    'semanuncio' => ['nome' => 'Sem anúncios de tela cheia', 'moedas' => 0, 'preco' => 14.90, 'semAnuncios' => true],
];

function home_dir(): string
{
    $base = __DIR__;
    while ($base !== dirname($base) && basename($base) !== 'public_html') {
        $base = dirname($base);
    }
    return basename($base) === 'public_html' ? dirname($base) : dirname(__DIR__, 2);
}

function cfg(): array
{
    static $c = null;
    if ($c === null) {
        $arq = home_dir() . '/config/mercadopago.env';
        $c = is_readable($arq) ? (parse_ini_file($arq, false, INI_SCANNER_RAW) ?: []) : [];
    }
    return $c;
}

function cfg_ok(): bool
{
    $c = cfg();
    return !empty($c['MP_PUBLIC_KEY']) && !empty($c['MP_ACCESS_TOKEN']);
}

/** Vende de verdade só com LOJA_PUBLICA=1; com a loja escondida, só aceita credencial de teste. */
function pode_vender(): bool
{
    $c = cfg();
    return cfg_ok() && (($c['LOJA_PUBLICA'] ?? '0') === '1' || ($c['MP_AMBIENTE'] ?? '') === 'teste');
}

function responder(int $codigo, array $dados): void
{
    http_response_code($codigo);
    echo json_encode($dados);
    exit;
}

function entrada(): array
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        responder(405, ['ok' => false]);
    }
    $raw = file_get_contents('php://input', false, null, 0, 20000);
    $in = json_decode($raw ?: '', true);
    return is_array($in) ? $in : [];
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $dir = home_dir() . '/rota-dados';
    if (!is_dir($dir)) {
        mkdir($dir, 0750, true);
    }
    $pdo = new PDO('sqlite:' . $dir . '/loja.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('CREATE TABLE IF NOT EXISTS jogadores (
        id TEXT PRIMARY KEY, segredo_hash TEXT NOT NULL, codigo TEXT UNIQUE NOT NULL, criado INTEGER NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS compras (
        id TEXT PRIMARY KEY, jogador TEXT NOT NULL, pacote TEXT NOT NULL, valor REAL NOT NULL,
        mp_id TEXT, status TEXT NOT NULL, detalhe TEXT, criado INTEGER NOT NULL, conferido INTEGER NOT NULL DEFAULT 0)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS compras_jogador ON compras (jogador)');
    return $pdo;
}

function aleatorio(int $bytes): string
{
    return bin2hex(random_bytes($bytes));
}

/** Código de recuperação legível: 12 letras/números sem caracteres ambíguos, em 3 blocos. */
function novo_codigo(): string
{
    $alfa = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    $s = '';
    for ($i = 0; $i < 12; $i++) {
        $s .= $alfa[random_int(0, strlen($alfa) - 1)];
    }
    return substr($s, 0, 4) . '-' . substr($s, 4, 4) . '-' . substr($s, 8, 4);
}

/** Confere jogador + segredo. Devolve o id ou encerra com 401. */
function autenticar(array $in): string
{
    $id = (string)($in['jogador'] ?? '');
    $seg = (string)($in['segredo'] ?? '');
    if (!preg_match('/^[a-f0-9]{32}$/', $id) || !preg_match('/^[a-f0-9]{64}$/', $seg)) {
        responder(401, ['ok' => false]);
    }
    $st = db()->prepare('SELECT segredo_hash FROM jogadores WHERE id = ?');
    $st->execute([$id]);
    $hash = $st->fetchColumn();
    if (!$hash || !hash_equals($hash, hash('sha256', $seg))) {
        responder(401, ['ok' => false]);
    }
    return $id;
}

function mp(string $metodo, string $caminho, ?array $corpo = null, ?string $idempotencia = null): array
{
    $h = ['Authorization: Bearer ' . cfg()['MP_ACCESS_TOKEN'], 'Content-Type: application/json'];
    if ($idempotencia) {
        $h[] = 'X-Idempotency-Key: ' . $idempotencia;
    }
    $ch = curl_init('https://api.mercadopago.com' . $caminho);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $metodo,
        CURLOPT_HTTPHEADER => $h,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 25,
    ]);
    if ($corpo !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($corpo));
    }
    $resp = curl_exec($ch);
    $codigo = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$codigo, json_decode($resp ?: '', true) ?: []];
}

/** Atualiza a compra com o que o Mercado Pago diz do pagamento (fonte da verdade). */
function atualizar_pela_api(string $mpId): ?array
{
    [$codigo, $p] = mp('GET', '/v1/payments/' . rawurlencode($mpId));
    if ($codigo !== 200 || empty($p['external_reference'])) {
        return null;
    }
    $ref = (string)$p['external_reference'];
    $st = db()->prepare('SELECT valor FROM compras WHERE id = ?');
    $st->execute([$ref]);
    $valor = $st->fetchColumn();
    if ($valor === false) {
        return null; // pagamento que não é desta loja
    }
    // valor pago tem de bater com o preço do pacote; senão não credita
    $status = abs((float)($p['transaction_amount'] ?? 0) - (float)$valor) < 0.01 ? (string)$p['status'] : 'divergente';
    $st = db()->prepare('UPDATE compras SET status = ?, detalhe = ?, mp_id = ?, conferido = ? WHERE id = ?');
    $st->execute([$status, (string)($p['status_detail'] ?? ''), (string)$p['id'], time(), $ref]);
    return $p;
}
