<?php
declare(strict_types=1);
// GET            -> estado de sesión + token CSRF
// POST ?action=login  {usuario, password}
// POST ?action=logout

require __DIR__ . '/bootstrap.php';
start_session();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $user = null;
    if (!empty($_SESSION['uid'])) {
        $stmt = db()->prepare('SELECT usuario, rol FROM usuarios WHERE id = ?');
        $stmt->execute([(int) $_SESSION['uid']]);
        $user = $stmt->fetch() ?: null;
        if (!$user) { // el usuario fue eliminado: se cierra la sesión
            unset($_SESSION['uid'], $_SESSION['usuario']);
        }
    }
    json_out(200, [
        'authenticated' => $user !== null,
        'usuario' => $user['usuario'] ?? null,
        'rol' => $user['rol'] ?? null,
        'is_admin' => ($user['rol'] ?? '') === 'admin',
        'csrf' => csrf_token(),
    ]);
}

if ($method !== 'POST') {
    fail(405, 'Método no permitido');
}

check_csrf();
$action = $_GET['action'] ?? '';

if ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    json_out(200, ['ok' => true]);
}

if ($action !== 'login') {
    fail(400, 'Acción desconocida');
}

// Freno básico contra fuerza bruta (por sesión; complementar con límites del servidor al desplegar)
if (($_SESSION['block_until'] ?? 0) > time()) {
    fail(429, 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
}

$in = read_json();
$usuario = trim((string) ($in['usuario'] ?? ''));
$password = (string) ($in['password'] ?? '');

$stmt = db()->prepare('SELECT id, usuario, password_hash, rol FROM usuarios WHERE usuario = ?');
$stmt->execute([$usuario]);
$row = $stmt->fetch();

// Se verifica siempre contra un hash para que el tiempo de respuesta no revele si el usuario existe
$hash = $row['password_hash'] ?? '$2y$10$vpQyZIovQjZrvrBg8zfVSOz8B0BDE4ETwI4ptckHsiDExWfe3SBOS';
$ok = password_verify($password, $hash) && $row;

if (!$ok) {
    $_SESSION['fails'] = ($_SESSION['fails'] ?? 0) + 1;
    if ($_SESSION['fails'] >= 5) {
        $_SESSION['block_until'] = time() + 60;
        $_SESSION['fails'] = 0;
    }
    usleep(400000);
    fail(401, 'Usuario o contraseña incorrectos');
}

session_regenerate_id(true);
$_SESSION['uid'] = (int) $row['id'];
$_SESSION['usuario'] = $row['usuario'];
$_SESSION['fails'] = 0;
unset($_SESSION['block_until']);
$_SESSION['csrf'] = bin2hex(random_bytes(32));

json_out(200, [
    'ok' => true,
    'usuario' => $row['usuario'],
    'rol' => $row['rol'],
    'is_admin' => $row['rol'] === 'admin',
    'csrf' => $_SESSION['csrf'],
]);
