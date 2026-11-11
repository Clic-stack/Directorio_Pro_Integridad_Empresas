<?php
declare(strict_types=1);
// GET público: devuelve el mismo formato JSON que tenía json-server (arreglo de empresas).

require __DIR__ . '/db.php';
require __DIR__ . '/vigencia.php';

date_default_timezone_set('America/Mexico_City');

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

try {
    $pdo = db();

    // Antes de listar, se pasan a "Desacreditada" las empresas cuya vigencia ya venció
    // (y se anotan en la bitácora). Así el estatus guardado siempre coincide con la fecha.
    vig_sincronizar($pdo);

    // Solo empresas acreditadas, con vigencia al día y con al menos un correo (lo exige isValidCompany en app.js)
    $sql = "SELECT e.id, e.nombre, r.nombre AS rubro, e.logo, e.municipio, e.telefono,
                   e.estatus, e.fecha_acreditacion,
                   e.fecha_vigencia, e.fecha_cambio_estatus
            FROM empresas e
            JOIN rubros r ON r.id = e.rubro_id
            WHERE e.estatus = 'Acreditada'
              AND e.fecha_vigencia >= :hoy
              AND EXISTS (SELECT 1 FROM empresa_emails m WHERE m.empresa_id = e.id)
            ORDER BY e.nombre";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':hoy' => vig_hoy()]);
    $empresas = $stmt->fetchAll();

    $emails = [];
    $stmt = $pdo->query("SELECT empresa_id, email FROM empresa_emails ORDER BY empresa_id, orden, id");
    foreach ($stmt as $row) {
        $emails[$row['empresa_id']][] = $row['email'];
    }

    $result = array_map(static function (array $e) use ($emails): array {
        return [
            'id' => (int) $e['id'],
            'nombre' => $e['nombre'],
            'rubro' => $e['rubro'],
            'logo' => $e['logo'],
            'municipio' => $e['municipio'],
            'contacto' => [
                'emails' => $emails[$e['id']] ?? [],
                'telefono' => $e['telefono'],
            ],
            'estatus' => $e['estatus'],
            'fecha_acreditacion' => $e['fecha_acreditacion'],
            'fecha_vigencia' => $e['fecha_vigencia'],
            'fecha_cambio_estatus' => $e['fecha_cambio_estatus'],
        ];
    }, $empresas);

    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    error_log($e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo obtener el directorio']);
}
