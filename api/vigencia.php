<?php
declare(strict_types=1);
// Funciones compartidas por la API pública y la del panel:
//   - reglas de vigencia (acreditación + 365 días) y estatus automático
//   - sincronización: pasa a "Desacreditada" las empresas vencidas y lo anota en la bitácora
//   - bitácora: quién hizo qué, cuándo y qué cambió
// Este archivo solo DEFINE funciones; no hace nada si alguien lo abre directamente.

date_default_timezone_set('America/Mexico_City');

const VIG_DIAS = 365;

function vig_hoy(): string
{
    return date('Y-m-d');
}

// Vigencia = fecha de acreditación + 365 días
function vig_calcular(string $acreditacion): string
{
    return (new DateTimeImmutable($acreditacion))->modify('+' . VIG_DIAS . ' days')->format('Y-m-d');
}

// El estatus NUNCA se captura: sale de comparar la vigencia con hoy.
function vig_estatus(string $vigencia, ?string $hoy = null): string
{
    return $vigencia >= ($hoy ?? vig_hoy()) ? 'Acreditada' : 'Desacreditada';
}

// ------------------------------------------------------------------ Bitácora
// Devuelve ['usuario' => ..., 'rol' => ...] a partir del usuario de la sesión.
function bit_actor(PDO $pdo, array $user): array
{
    $nombre = $user['usuario'] ?? $user['username'] ?? $user['nombre'] ?? null;
    if ($nombre === null && isset($user['id'])) {
        $stmt = $pdo->prepare('SELECT usuario FROM usuarios WHERE id = ?');
        $stmt->execute([(int) $user['id']]);
        $nombre = $stmt->fetchColumn() ?: null;
    }
    $rol = isset($user['rol']) ? (string) $user['rol'] : (!empty($user['is_admin']) ? 'admin' : 'editor');
    return ['usuario' => mb_substr((string) ($nombre ?? 'desconocido'), 0, 50), 'rol' => $rol];
}

function bit_sistema(): array
{
    return ['usuario' => 'sistema', 'rol' => null];
}

// Guarda una fila en la bitácora. $cambios tiene la forma ['campo' => [antes, despues]].
function bit_registrar(PDO $pdo, array $actor, string $accion, ?int $empresaId, ?string $empresaNombre, ?array $cambios = null): void
{
    $pdo->prepare(
        'INSERT INTO bitacora (fecha_hora, usuario, rol, accion, empresa_id, empresa_nombre, cambios)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        date('Y-m-d H:i:s'),
        $actor['usuario'],
        $actor['rol'],
        $accion,
        $empresaId,
        $empresaNombre !== null ? mb_substr($empresaNombre, 0, 150) : null,
        $cambios ? json_encode($cambios, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
    ]);
}

// Contadores para el panel: salidas por vencimiento y renovaciones registradas.
function bit_resumen(PDO $pdo): array
{
    $out = ['bajas_vencimiento' => 0, 'renovaciones' => 0];
    $rows = $pdo->query(
        "SELECT accion, COUNT(*) AS n FROM bitacora
         WHERE accion IN ('baja_vencimiento', 'renovar') GROUP BY accion"
    )->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $r) {
        if ($r['accion'] === 'baja_vencimiento') {
            $out['bajas_vencimiento'] = (int) $r['n'];
        } else {
            $out['renovaciones'] = (int) $r['n'];
        }
    }
    return $out;
}

// ------------------------------------------------------------------ Sincronización
// Alinea el estatus guardado con la fecha de vigencia. Se llama en cada petición, así que no
// hace falta ningún proceso programado (cron). Devuelve cuántas empresas cambió.
//   vigencia < hoy  y estatus Acreditada    -> Desacreditada (y queda en la bitácora como baja)
//   vigencia >= hoy y estatus Desacreditada -> Acreditada    (reactivación, p. ej. tras corregir una fecha)
function vig_sincronizar(PDO $pdo): int
{
    $hoy = vig_hoy();
    try {
        $stmt = $pdo->prepare(
            "SELECT id, nombre, estatus, fecha_vigencia FROM empresas
             WHERE (estatus = 'Acreditada' AND fecha_vigencia < ?)
                OR (estatus = 'Desacreditada' AND fecha_vigencia >= ?)"
        );
        $stmt->execute([$hoy, $hoy]);
        $pendientes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$pendientes) {
            return 0;
        }

        $propia = !$pdo->inTransaction();
        if ($propia) {
            $pdo->beginTransaction();
        }
        // El "AND estatus = ?" evita registrar dos veces el mismo cambio si dos
        // personas abren la página en el mismo instante: solo una petición lo logra.
        $upd = $pdo->prepare('UPDATE empresas SET estatus = ?, fecha_cambio_estatus = ? WHERE id = ? AND estatus = ?');
        $cambiadas = 0;
        foreach ($pendientes as $e) {
            $vencida = $e['estatus'] === 'Acreditada';
            $nuevo = $vencida ? 'Desacreditada' : 'Acreditada';
            // Si venció, la fecha del cambio es el día siguiente a la vigencia (no el día en que alguien abrió la página)
            $fecha = $vencida
                ? (new DateTimeImmutable($e['fecha_vigencia']))->modify('+1 day')->format('Y-m-d')
                : $hoy;
            $upd->execute([$nuevo, $fecha, (int) $e['id'], $e['estatus']]);
            if ($upd->rowCount() === 1) {
                bit_registrar(
                    $pdo,
                    bit_sistema(),
                    $vencida ? 'baja_vencimiento' : 'reactivacion',
                    (int) $e['id'],
                    $e['nombre'],
                    ['estatus' => [$e['estatus'], $nuevo], ($vencida ? 'vencio_el' : 'vigencia_actual') => [null, $e['fecha_vigencia']]]
                );
                $cambiadas++;
            }
        }
        if ($propia) {
            $pdo->commit();
        }
        return $cambiadas;
    } catch (Throwable $e) {
        if ($pdo->inTransaction() && isset($propia) && $propia) {
            $pdo->rollBack();
        }
        // Un fallo aquí no debe tumbar el directorio público: queda en el log del servidor.
        error_log('vig_sincronizar: ' . $e->getMessage());
        return 0;
    }
}
