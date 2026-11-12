<?php
declare(strict_types=1);
// Bitácora de cambios (solo lectura). Disponible para admin y editor con sesión.
// GET ?pagina=1&accion=renovar&q=texto
// El editor no ve los movimientos de gestión de usuarios (acciones "usuario_*").

require __DIR__ . '/../bootstrap.php';
require __DIR__ . '/../vigencia.php';
$user = require_auth();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    fail(405, 'Método no permitido');
}

const BIT_POR_PAGINA = 25;
const BIT_ACCIONES = [
    'crear', 'editar', 'renovar', 'eliminar', 'baja_vencimiento', 'reactivacion',
    'usuario_crear', 'usuario_rol', 'usuario_password', 'usuario_eliminar',
];

$pdo = db();
vig_sincronizar($pdo); // para que las bajas por vencimiento de hoy ya aparezcan

// Escapa % y _ para que el texto buscado se tome literal dentro de un LIKE
function like_literal(string $s): string
{
    return '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $s) . '%';
}

$where = [];
$params = [];

if (!$user['is_admin']) {
    $where[] = "accion NOT LIKE 'usuario!_%' ESCAPE '!'";
}
$accion = (string) ($_GET['accion'] ?? '');
if ($accion !== '' && in_array($accion, BIT_ACCIONES, true)) {
    $where[] = 'accion = ?';
    $params[] = $accion;
}
$q = trim((string) ($_GET['q'] ?? ''));
if ($q !== '') {
    $where[] = "(empresa_nombre LIKE ? ESCAPE '!' OR usuario LIKE ? ESCAPE '!')";
    $params[] = like_literal(mb_substr($q, 0, 100));
    $params[] = like_literal(mb_substr($q, 0, 100));
}
$cond = $where ? 'WHERE ' . implode(' AND ', $where) : '';

$stmt = $pdo->prepare("SELECT COUNT(*) FROM bitacora $cond");
$stmt->execute($params);
$total = (int) $stmt->fetchColumn();
$paginas = max(1, (int) ceil($total / BIT_POR_PAGINA));
$pagina = min($paginas, max(1, (int) ($_GET['pagina'] ?? 1)));

// Los dos números ya son enteros validados, por eso se pueden escribir directo en el SQL
$limit = BIT_POR_PAGINA;
$offset = ($pagina - 1) * BIT_POR_PAGINA;
$stmt = $pdo->prepare(
    "SELECT id, fecha_hora, usuario, rol, accion, empresa_id, empresa_nombre, cambios
     FROM bitacora $cond ORDER BY fecha_hora DESC, id DESC LIMIT $limit OFFSET $offset"
);
$stmt->execute($params);
$items = $stmt->fetchAll(PDO::FETCH_ASSOC);
foreach ($items as &$it) {
    $it['id'] = (int) $it['id'];
    $it['cambios'] = $it['cambios'] !== null ? json_decode((string) $it['cambios'], true) : null;
}

json_out(200, [
    'items' => $items,
    'total' => $total,
    'pagina' => $pagina,
    'paginas' => $paginas,
    'resumen' => bit_resumen($pdo),
]);
