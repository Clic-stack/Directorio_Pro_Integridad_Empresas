<?php
declare(strict_types=1);
// Solo línea de comandos. Crea un administrador (o, si ya existe, le restablece la contraseña y lo deja como admin).
// Sirve también para recuperar el acceso si te quedas sin admins.
// XAMPP (Windows):  C:\xampp\php\php.exe api\crear_admin.php miusuario "MiClaveSegura123"
// Linux:            php api/crear_admin.php miusuario 'MiClaveSegura123'

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/db.php';

[$script, $usuario, $password] = $argv + [null, null, null];
if (!$usuario || !$password) {
    fwrite(STDERR, "Uso: php crear_admin.php usuario contraseña\n");
    exit(1);
}
if (!preg_match('/^[A-Za-z0-9_.-]{3,50}$/', $usuario)) {
    fwrite(STDERR, "Usuario inválido: 3 a 50 caracteres (letras, números, _ . -)\n");
    exit(1);
}
if (strlen($password) < 8) {
    fwrite(STDERR, "La contraseña debe tener al menos 8 caracteres\n");
    exit(1);
}

$hash = password_hash($password, PASSWORD_DEFAULT);
$stmt = db()->prepare(
    "INSERT INTO usuarios (usuario, password_hash, rol) VALUES (?, ?, 'admin')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), rol = 'admin'"
);
$stmt->execute([$usuario, $hash]);
echo "Administrador '$usuario' listo.\n";
