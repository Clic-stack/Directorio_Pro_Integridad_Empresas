<?php
declare(strict_types=1);
// Administración de usuarios (solo rol admin).
// GET             -> lista
// POST            -> crear {usuario, password, rol}
// POST ?id=N      -> actualizar {password?, rol?}
// DELETE ?id=N    -> eliminar (no a uno mismo)

require __DIR__ . '/../bootstrap.php';
$me = require_admin();
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

const ROLES = ['admin', 'editor'];

function check_password(string $p): void
{
    if (strlen($p) < 8) {
        fail(422, 'La contraseña debe tener al menos 8 caracteres.');
    }
}

function check_rol(string $rol): void
{
    if (!in_array($rol, ROLES, true)) {
        fail(422, 'Rol inválido.');
    }
}

if ($method === 'GET') {
    $rows = $pdo->query('SELECT id, usuario, rol, creado_en FROM usuarios ORDER BY usuario')->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['es_actual'] = $r['id'] === $me['id'];
    }
    json_out(200, ['usuarios' => $rows]);
}

if ($method === 'DELETE') {
    if ($id <= 0) {
        fail(400, 'Falta el id');
    }
    if ($id === $me['id']) {
        fail(422, 'No puedes eliminar tu propio usuario.');
    }
    $stmt = $pdo->prepare('DELETE FROM usuarios WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) {
        fail(404, 'Usuario no encontrado');
    }
    json_out(200, ['ok' => true]);
}

if ($method !== 'POST') {
    fail(405, 'Método no permitido');
}

$in = read_json();

// ---- Actualizar contraseña y/o rol
if ($id > 0) {
    $exists = $pdo->prepare('SELECT COUNT(*) FROM usuarios WHERE id = ?');
    $exists->execute([$id]);
    if (!(int) $exists->fetchColumn()) {
        fail(404, 'Usuario no encontrado');
    }
    $hasPass = isset($in['password']) && $in['password'] !== '';
    $hasRol = isset($in['rol']);
    if (!$hasPass && !$hasRol) {
        fail(400, 'Nada que actualizar.');
    }
    if ($hasRol) {
        check_rol((string) $in['rol']);
        // Evita que un admin se quite el acceso a sí mismo (y deje el sistema sin admins)
        if ($id === $me['id'] && $in['rol'] !== $me['rol']) {
            fail(422, 'No puedes cambiar tu propio rol.');
        }
    }
    if ($hasPass) {
        check_password((string) $in['password']);
        $pdo->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
            ->execute([password_hash((string) $in['password'], PASSWORD_DEFAULT), $id]);
    }
    if ($hasRol) {
        $pdo->prepare('UPDATE usuarios SET rol = ? WHERE id = ?')->execute([$in['rol'], $id]);
    }
    json_out(200, ['ok' => true]);
}

// ---- Crear
$usuario = trim((string) ($in['usuario'] ?? ''));
if (!preg_match('/^[A-Za-z0-9_.-]{3,50}$/', $usuario)) {
    fail(422, 'Usuario inválido: 3 a 50 caracteres (letras, números, _ . -).');
}
$password = (string) ($in['password'] ?? '');
check_password($password);
$rol = (string) ($in['rol'] ?? 'editor');
check_rol($rol);

try {
    $pdo->prepare('INSERT INTO usuarios (usuario, password_hash, rol) VALUES (?, ?, ?)')
        ->execute([$usuario, password_hash($password, PASSWORD_DEFAULT), $rol]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000') {
        fail(409, 'Ese usuario ya existe.');
    }
    throw $e;
}
json_out(201, ['ok' => true]);
