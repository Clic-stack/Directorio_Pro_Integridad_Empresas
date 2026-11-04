<?php
declare(strict_types=1);
// Utilidades compartidas: sesión, CSRF, respuestas JSON.

require_once __DIR__ . '/db.php';

date_default_timezone_set('America/Mexico_City');

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('dir_admin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function json_out(int $code, array $data): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $code, string $message, array $extra = []): never
{
    json_out($code, ['error' => $message] + $extra);
}

function read_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail(400, 'JSON inválido');
    }
    return $data;
}

function csrf_token(): string
{
    start_session();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function check_csrf(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($sent) || $sent === '' || !hash_equals(csrf_token(), $sent)) {
        fail(403, 'Token de seguridad inválido. Recarga la página.');
    }
}

// Exige sesión iniciada y, en peticiones que escriben, token CSRF.
// El rol se lee de la BD en cada petición: si cambias o eliminas a un usuario, el efecto es inmediato.
function require_auth(): array
{
    start_session();
    if (empty($_SESSION['uid'])) {
        fail(401, 'Sesión no iniciada');
    }
    $stmt = db()->prepare('SELECT id, usuario, rol FROM usuarios WHERE id = ?');
    $stmt->execute([(int) $_SESSION['uid']]);
    $user = $stmt->fetch();
    if (!$user) {
        $_SESSION = [];
        session_destroy();
        fail(401, 'Sesión no válida');
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        check_csrf();
    }
    return [
        'id' => (int) $user['id'],
        'usuario' => $user['usuario'],
        'rol' => $user['rol'],
        'is_admin' => $user['rol'] === 'admin',
    ];
}

// Igual que require_auth(), pero solo deja pasar a administradores.
function require_admin(): array
{
    $user = require_auth();
    if (!$user['is_admin']) {
        fail(403, 'Esta acción requiere rol de administrador.');
    }
    return $user;
}
