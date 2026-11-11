<?php
declare(strict_types=1);
// Administración de usuarios (solo rol admin).
// GET             -> lista
// POST            -> crear {usuario, password, rol}
// POST ?id=N      -> actualizar {password?, rol?}
// DELETE ?id=N    -> eliminar (no a uno mismo)

require __DIR__ . '/../bootstrap.php';
require __DIR__ . '/../vigencia.php';
$me = require_admin();
$pdo = db();
$actor = bit_actor($pdo, $me);
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
    // Se consulta antes de borrar: después ya no habría de dónde sacar el nombre
    $stmt = $pdo->prepare('SELECT usuario, rol FROM usuarios WHERE id = ?');
    $stmt->execute([$id]);
    $target = $stmt->fetch();
    if (!$target) {
        fail(404, 'Usuario no encontrado');
    }
    try {
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
        bit_registrar($pdo, $actor, 'usuario_eliminar', null, $target['usuario'], [
            'usuario' => [$target['usuario'], null],
            'rol' => [$target['rol'], null],
        ]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log($e->getMessage());
        fail(500, 'No se pudo eliminar el usuario.');
    }
    json_out(200, ['ok' => true]);
}

if ($method !== 'POST') {
    fail(405, 'Método no permitido');
}

$in = read_json();

// ---- Actualizar contraseña y/o rol
if ($id > 0) {
    $stmt = $pdo->prepare('SELECT usuario, rol FROM usuarios WHERE id = ?');
    $stmt->execute([$id]);
    $target = $stmt->fetch();
    if (!$target) {
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
    }
    try {
        $pdo->beginTransaction();
        if ($hasPass) {
            $pdo->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
                ->execute([password_hash((string) $in['password'], PASSWORD_DEFAULT), $id]);
            // Jamás se guarda la contraseña (ni su hash) en la bitácora: solo el hecho de que cambió
            bit_registrar($pdo, $actor, 'usuario_password', null, $target['usuario'], null);
        }
        if ($hasRol && (string) $in['rol'] !== $target['rol']) {
            $pdo->prepare('UPDATE usuarios SET rol = ? WHERE id = ?')->execute([$in['rol'], $id]);
            bit_registrar($pdo, $actor, 'usuario_rol', null, $target['usuario'], [
                'rol' => [$target['rol'], (string) $in['rol']],
            ]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log($e->getMessage());
        fail(500, 'No se pudo actualizar el usuario.');
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
    $pdo->beginTransaction();
    $pdo->prepare('INSERT INTO usuarios (usuario, password_hash, rol) VALUES (?, ?, ?)')
        ->execute([$usuario, password_hash($password, PASSWORD_DEFAULT), $rol]);
    bit_registrar($pdo, $actor, 'usuario_crear', null, $usuario, [
        'usuario' => [null, $usuario],
        'rol' => [null, $rol],
    ]);
    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($e->getCode() === '23000') {
        fail(409, 'Ese usuario ya existe.');
    }
    throw $e;
}
json_out(201, ['ok' => true]);
