<?php
// Credenciales de la base de datos (archivo de EJEMPLO, sin datos reales).
// 1. Copia este archivo con el nombre config.php, en esta misma carpeta.
// 2. Cambia los valores por los del servidor.
// config.php NO se sube a git (está en .gitignore).
// XAMPP por defecto: usuario root sin contraseña.
// En el servidor Linux: crea un usuario propio con permisos SELECT, INSERT, UPDATE y DELETE
// solo sobre esta base (no uses root).
return [
    'db_host' => 'localhost',
    'db_name' => 'directorio_pro_integridad',
    'db_user' => 'CAMBIAR_USUARIO',
    'db_pass' => 'CAMBIAR_CONTRASEÑA',
    'db_charset' => 'utf8mb4',
];