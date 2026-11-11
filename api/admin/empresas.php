<?php
declare(strict_types=1);
// CRUD de empresas (solo admins con sesión).
// GET              -> {empresas: [...], rubros: [...], resumen: {...}}
// POST             -> crear (solo admin; multipart/form-data, campo opcional "logo")
// POST ?id=N       -> actualizar datos
// DELETE ?id=N     -> eliminar (solo admin)
//
// Roles: el editor puede crear y editar datos de contacto y logo; estatus, fechas y roles solo la pueden editar sistemas una vez que se creo la empresa.
// Reglas:
//  - El estatus NUNCA viene del formulario: se calcula con la vigencia (vigencia >= hoy => Acreditada).
//  - La vigencia NUNCA viene del formulario: es fecha_acreditacion + 365 días.
//  - Editor: edita datos de contacto y logo; no crea, no elimina, no cambia la fecha de acreditación.
//  - Renovar lo pueden hacer los dos roles (cambia RENOVAR_SOLO_ADMIN a true para restringirlo).
//  - Todo cambio queda en la bitácora, dentro de la misma transacción que el cambio.


require __DIR__ . '/../bootstrap.php';
require __DIR__ . '/../vigencia.php';
$user = require_auth();

const LOGO_DIR_REL = 'src/logo';
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
    'image/webp' => 'webp',
];
const RENOVAR_SOLO_ADMIN = false;

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$action = (string) ($_GET['action'] ?? '');
$actor = bit_actor($pdo, $user);

// Antes de cualquier cosa, el estatus guardado se alinea con las vigencias de hoy
vig_sincronizar($pdo);

function logo_dir_abs(): string
{
    return dirname(__DIR__, 2) . '/' . LOGO_DIR_REL;
}

function valid_date(?string $s): bool
{
    if ($s === null || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
        return false;
    }
    $d = DateTimeImmutable::createFromFormat('Y-m-d', $s);
    return $d !== false && $d->format('Y-m-d') === $s;
}

function fetch_empresas(PDO $pdo, int $onlyId = 0): array
{
    $sql = 'SELECT e.id, e.nombre, e.rubro_id, r.nombre AS rubro, e.logo, e.municipio, e.telefono,
                   e.estatus, e.fecha_acreditacion, e.fecha_vigencia, e.fecha_cambio_estatus
            FROM empresas e JOIN rubros r ON r.id = e.rubro_id';
    $params = [];
    if ($onlyId > 0) {
        $sql .= ' WHERE e.id = ?';
        $params[] = $onlyId;
    }
    $sql .= ' ORDER BY e.nombre';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $emails = [];
    $stmt = $pdo->prepare(
        'SELECT empresa_id, email FROM empresa_emails' . ($onlyId > 0 ? ' WHERE empresa_id = ?' : '') . ' ORDER BY empresa_id, orden, id'
    );
    $stmt->execute($onlyId > 0 ? [$onlyId] : []);
    foreach ($stmt as $m) {
        $emails[$m['empresa_id']][] = $m['email'];
    }
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['rubro_id'] = (int) $r['rubro_id'];
        $r['emails'] = $emails[$r['id']] ?? [];
    }
    return $rows;
}

function fetch_emails(PDO $pdo, int $empresaId): array
{
    $stmt = $pdo->prepare('SELECT email FROM empresa_emails WHERE empresa_id = ? ORDER BY orden, id');
    $stmt->execute([$empresaId]);
    return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function rubro_nombre(PDO $pdo, int $rubroId): ?string
{
    $stmt = $pdo->prepare('SELECT nombre FROM rubros WHERE id = ?');
    $stmt->execute([$rubroId]);
    $n = $stmt->fetchColumn();
    return $n === false ? null : (string) $n;
}

// Valida y normaliza los datos del formulario. Devuelve [datos, correos, errores].
// $acredActual: la fecha de acreditación que ya tenía la empresa (si es edición).
function validate_input(PDO $pdo, array $in, ?string $acredActual = null): array
{
    $errors = [];
    $nombre = trim((string) ($in['nombre'] ?? ''));
    if ($nombre === '' || mb_strlen($nombre) > 150) {
        $errors['nombre'] = 'El nombre es obligatorio (máximo 150 caracteres).';
    }

    $rubroId = (int) ($in['rubro_id'] ?? 0);
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM rubros WHERE id = ?');
    $stmt->execute([$rubroId]);
    if (!$stmt->fetchColumn()) {
        $errors['rubro_id'] = 'Selecciona un rubro válido.';
    }

    $municipio = trim((string) ($in['municipio'] ?? ''));
    if (mb_strlen($municipio) > 100) {
        $errors['municipio'] = 'Máximo 100 caracteres.';
    }
    $telefono = trim((string) ($in['telefono'] ?? ''));
    if (mb_strlen($telefono) > 30 || ($telefono !== '' && !preg_match('/^[0-9 +().-]{7,30}$/', $telefono))) {
        $errors['telefono'] = 'Teléfono inválido.';
    }

    $emails = [];
    foreach ((array) ($in['emails'] ?? []) as $m) {
        $m = trim((string) $m);
        if ($m === '') {
            continue;
        }
        if (mb_strlen($m) > 150 || !filter_var($m, FILTER_VALIDATE_EMAIL)) {
            $errors['emails'] = "Correo inválido: $m";
            break;
        }
        $emails[strtolower($m)] = $m;
    }
    $emails = array_values($emails);
    if (count($emails) === 0 && !isset($errors['emails'])) {
        $errors['emails'] = 'Captura al menos un correo.';
    }
    if (count($emails) > 5) {
        $errors['emails'] = 'Máximo 5 correos.';
    }

    $acred = trim((string) ($in['fecha_acreditacion'] ?? ''));
    if (!valid_date($acred)) {
        $errors['fecha_acreditacion'] = 'Fecha de acreditación obligatoria (AAAA-MM-DD).';
    } elseif ($acred > vig_hoy() && $acred !== $acredActual) {
        $errors['fecha_acreditacion'] = 'La fecha de acreditación no puede ser futura.';
    }

    // Vigencia y estatus se DERIVAN; lo que mande el navegador no cuenta.
    $vig = '';
    $estatus = '';
    if (!isset($errors['fecha_acreditacion'])) {
        $vig = vig_calcular($acred);
        $estatus = vig_estatus($vig);
    }
        
    $data = [
        'nombre' => $nombre,
        'rubro_id' => $rubroId,
        'municipio' => $municipio !== '' ? $municipio : null,
        'telefono' => $telefono !== '' ? $telefono : null,
        'estatus' => $estatus,
        'fecha_acreditacion' => $acred,
        'fecha_vigencia' => $vig,
    ];
    return [$data, $emails, $errors];
}

// Guarda el logo subido en src/logo/ y devuelve la ruta relativa (la que se guarda en la BD).
function save_logo(array $file, string $nombre): string
{
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $msg = in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
            ? 'El logo excede el tamaño permitido (2 MB).'
            : 'No se pudo subir el logo.';
        fail(422, $msg, ['errors' => ['logo' => $msg]]);
    }
    if ($file['size'] > LOGO_MAX_BYTES) {
        fail(422, 'El logo no debe pesar más de 2 MB.', ['errors' => ['logo' => 'El logo no debe pesar más de 2 MB.']]);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    if (!isset(LOGO_TYPES[$mime]) || @getimagesize($file['tmp_name']) === false) {
        fail(422, 'Formato de logo no permitido (usa PNG, JPG o WEBP).', ['errors' => ['logo' => 'Formato no permitido (PNG, JPG o WEBP).']]);
    }

    $ascii = function_exists('iconv') ? @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $nombre) : false;
    $slug = strtolower(trim((string) preg_replace('/[^A-Za-z0-9]+/', '_', $ascii !== false ? $ascii : ''), '_'));
    $slug = substr($slug !== '' ? $slug : 'logo', 0, 40);
    $name = $slug . '_' . bin2hex(random_bytes(3)) . '.' . LOGO_TYPES[$mime];

    $dir = logo_dir_abs();
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        fail(500, 'No se pudo crear la carpeta de logos.');
    }
    if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $name)) {
        fail(500, 'No se pudo guardar el logo.');
    }
    return $name;
}

// Borra el archivo solo si ninguna otra empresa lo usa (varios logos están compartidos, p. ej. Dalton).
function delete_logo_if_unused(PDO $pdo, ?string $path): void
{
    if (!$path || !preg_match('#^' . LOGO_DIR_REL . '/[A-Za-z0-9_.-]+$#', $path)) {
        return;
    }
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM empresas WHERE logo = ?');
    $stmt->execute([$path]);
    if ((int) $stmt->fetchColumn() === 0) {
        $abs = dirname(__DIR__, 2) . '/' . $path;
        if (is_file($abs)) {
            @unlink($abs);
        }
    }
}

function replace_emails(PDO $pdo, int $empresaId, array $emails): void
{
    $pdo->prepare('DELETE FROM empresa_emails WHERE empresa_id = ?')->execute([$empresaId]);
    $ins = $pdo->prepare('INSERT INTO empresa_emails (empresa_id, email, orden) VALUES (?, ?, ?)');
    foreach ($emails as $i => $m) {
        $ins->execute([$empresaId, $m, $i]);
    }
}

// Compara "antes" y "después" y devuelve solo lo que cambió: ['campo' => [antes, después]]
function diff_cambios(array $antes, array $despues): array
{
    $out = [];
    foreach ($despues as $campo => $nuevo) {
        $viejo = $antes[$campo] ?? null;
        if ($campo === 'correos') {
            // Cambiar solo el orden de los correos no cuenta como cambio
            $a = array_map('strtolower', (array) $viejo);
            $b = array_map('strtolower', (array) $nuevo);
            sort($a);
            sort($b);
            if ($a === $b) {
                continue;
            }
        } elseif ($viejo === $nuevo) {
            continue;
        }
        $out[$campo] = [$viejo, $nuevo];
    }
    return $out;
}

// ---------------------------------------------------------------- GET
if ($method === 'GET') {
    $rubros = $pdo->query('SELECT id, nombre FROM rubros ORDER BY nombre')->fetchAll();
    json_out(200, ['empresas' => fetch_empresas($pdo), 'rubros' => $rubros, 'resumen' => bit_resumen($pdo)]);
}

// ---------------------------------------------------------------- DELETE
if ($method === 'DELETE') {
    if (!$user['is_admin']) {
        fail(403, 'Solo un administrador puede eliminar empresas.');
    }
    if ($id <= 0) {
        fail(400, 'Falta el id');
    }
    $stmt = $pdo->prepare('SELECT * FROM empresas WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        fail(404, 'Empresa no encontrada');
    }
    try {
        $pdo->beginTransaction();
        // Se guarda un resumen de la empresa en la bitacora de lo que se eliminó: después de borrarla ya no habría de dónde consultarlo
        bit_registrar($pdo, $actor, 'eliminar', $id, $row['nombre'], [
            'nombre' => [$row['nombre'], null],
            'rubro' => [rubro_nombre($pdo, (int) $row['rubro_id']), null],
            'correos' => [fetch_emails($pdo, $id), null],
            'fecha_acreditacion' => [$row['fecha_acreditacion'], null],
            'fecha_vigencia' => [$row['fecha_vigencia'], null],
            'estatus' => [$row['estatus'], null],
        ]);
        $pdo->prepare('DELETE FROM empresas WHERE id = ?')->execute([$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log($e->getMessage());
        fail(500, 'No se pudo eliminar la empresa.');
    }
    delete_logo_if_unused($pdo, $row['logo']);
    json_out(200, ['ok' => true]);
}

// ---------------------------------------------------------------- POST (crear / actualizar)
if ($method !== 'POST') {
    fail(405, 'Método no permitido');
}

// Si el archivo supera post_max_size de PHP, $_POST y $_FILES llegan vacíos
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0 && !$_POST && !$_FILES) {
    fail(413, 'La petición es demasiado grande. Usa un logo de máximo 2 MB.');
}

// ------------------------- Renovar: la nueva fecha de renovación pasa a ser la fecha de acreditación
if ($action === 'renovar') {
    if (RENOVAR_SOLO_ADMIN && !$user['is_admin']) {
        fail(403, 'Solo un administrador puede renovar.');
    }
    if ($id <= 0) {
        fail(400, 'Falta el id');
    }
    $stmt = $pdo->prepare('SELECT * FROM empresas WHERE id = ?');
    $stmt->execute([$id]);
    $emp = $stmt->fetch();
    if (!$emp) {
        fail(404, 'Empresa no encontrada');
    }

    $fecha = trim((string) ($_POST['fecha_renovacion'] ?? ''));
    $err = null;
    if (!valid_date($fecha)) {
        $err = 'Captura la fecha de renovación (AAAA-MM-DD).';
    } elseif ($fecha > vig_hoy()) {
        $err = 'La fecha de renovación no puede ser futura.';
    } elseif ($fecha <= $emp['fecha_acreditacion']) {
        $err = 'La fecha de renovación debe ser posterior a la acreditación actual (' . $emp['fecha_acreditacion'] . ').';
    }
    if ($err !== null) {
        fail(422, $err, ['errors' => ['fecha_renovacion' => $err]]);
    }

    $nuevaVig = vig_calcular($fecha);
    $nuevoEstatus = vig_estatus($nuevaVig);
    $cambio = $emp['estatus'] !== $nuevoEstatus ? vig_hoy() : $emp['fecha_cambio_estatus'];
    $cambios = [
        'fecha_acreditacion' => [$emp['fecha_acreditacion'], $fecha],
        'fecha_vigencia' => [$emp['fecha_vigencia'], $nuevaVig],
    ];
    if ($emp['estatus'] !== $nuevoEstatus) {
        $cambios['estatus'] = [$emp['estatus'], $nuevoEstatus];
    }

    try {
        $pdo->beginTransaction();
        $pdo->prepare(
            'UPDATE empresas SET fecha_acreditacion=?, fecha_vigencia=?, estatus=?, fecha_cambio_estatus=? WHERE id=?'
        )->execute([$fecha, $nuevaVig, $nuevoEstatus, $cambio, $id]);
        bit_registrar($pdo, $actor, 'renovar', $id, $emp['nombre'], $cambios);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log($e->getMessage());
        fail(500, 'No se pudo renovar la empresa.');
    }
    json_out(200, ['empresa' => fetch_empresas($pdo, $id)[0]]);
}

// ------------------------- Crear / actualizar datos
if ($id <= 0 && !$user['is_admin']) {
    fail(403, 'Solo un administrador puede crear empresas.');
}

$existing = null;
if ($id > 0) {
    $stmt = $pdo->prepare('SELECT * FROM empresas WHERE id = ?');
    $stmt->execute([$id]);
    $existing = $stmt->fetch();
    if (!$existing) {
        fail(404, 'Empresa no encontrada');
    }
}

$input = $_POST;
if ($existing) {
    // Rubro y fecha de acreditación no se editan (ni siquiera el admin):
    // la fecha solo cambia con Renovar y el rubro solo desde la base de datos.
    $input['fecha_acreditacion'] = (string) $existing['fecha_acreditacion'];
    $input['rubro_id'] = (string) $existing['rubro_id'];
}

[$data, $emails, $errors] = validate_input($pdo, $input, $existing['fecha_acreditacion'] ?? null);
if ($errors) {
    fail(422, 'Revisa los campos marcados.', ['errors' => $errors]);
}

if (($data['estatus'] ?? '') === '' || ($data['fecha_vigencia'] ?? '') === '') {
    error_log('validate_input no calculó estatus/vigencia');
    fail(500, 'No se pudo calcular la vigencia.');
}

$oldLogo = $existing['logo'] ?? null;
$logo = $oldLogo;
$newLogo = null;
if (!empty($_FILES['logo']) && $_FILES['logo']['error'] !== UPLOAD_ERR_NO_FILE) {
    $newLogo = save_logo($_FILES['logo'], $data['nombre']);
    $logo = $newLogo;
} elseif (($_POST['remove_logo'] ?? '') === '1') {
    $logo = null;
}

// Resumen de cómo quedará la empresa, para compararla con la anterior y guardar el cambio en la bitácora
$despues = [
    'nombre' => $data['nombre'],
    'rubro' => rubro_nombre($pdo, $data['rubro_id']),
    'municipio' => $data['municipio'],
    'telefono' => $data['telefono'],
    'correos' => $emails,
    'fecha_acreditacion' => $data['fecha_acreditacion'],
    'fecha_vigencia' => $data['fecha_vigencia'],
    'estatus' => $data['estatus'],
    'logo' => $logo,
];
$antes = $existing ? [
    'nombre' => $existing['nombre'],
    'rubro' => rubro_nombre($pdo, (int) $existing['rubro_id']),
    'municipio' => $existing['municipio'],
    'telefono' => $existing['telefono'],
    'correos' => fetch_emails($pdo, $id),
    'fecha_acreditacion' => $existing['fecha_acreditacion'],
    'fecha_vigencia' => $existing['fecha_vigencia'],
    'estatus' => $existing['estatus'],
    'logo' => $existing['logo'],
] : array_fill_keys(array_keys($despues), null);

try {
    $pdo->beginTransaction();
    if ($existing) {
        // Si cambia el estatus se registra la fecha del cambio
        $cambio = $existing['estatus'] !== $data['estatus'] ? vig_hoy() : $existing['fecha_cambio_estatus'];
        $pdo->prepare(
            'UPDATE empresas SET nombre=?, rubro_id=?, logo=?, municipio=?, telefono=?, estatus=?,
                    fecha_acreditacion=?, fecha_vigencia=?, fecha_cambio_estatus=?
             WHERE id=?'
        )->execute([
            $data['nombre'], $data['rubro_id'], $logo, $data['municipio'], $data['telefono'], $data['estatus'],
            $data['fecha_acreditacion'], $data['fecha_vigencia'], $cambio, $id,
        ]);
        $empresaId = $id;
    } else {
        $pdo->prepare(
            'INSERT INTO empresas (nombre, rubro_id, logo, municipio, telefono, estatus,
                    fecha_acreditacion, fecha_vigencia)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $data['nombre'], $data['rubro_id'], $logo, $data['municipio'], $data['telefono'], $data['estatus'],
            $data['fecha_acreditacion'], $data['fecha_vigencia'],
        ]);
        $empresaId = (int) $pdo->lastInsertId();
    }
    replace_emails($pdo, $empresaId, $emails);

    $cambios = diff_cambios($antes, $despues);
    if ($cambios || !$existing) {
        bit_registrar($pdo, $actor, $existing ? 'editar' : 'crear', $empresaId, $data['nombre'], $cambios);
    }
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($newLogo) {
        @unlink(dirname(__DIR__, 2) . '/' . $newLogo);
    }
    error_log($e->getMessage());
    fail(500, 'No se pudo guardar la empresa.');
}

if ($oldLogo && $oldLogo !== $logo) {
    delete_logo_if_unused($pdo, $oldLogo);
}

$saved = fetch_empresas($pdo, $empresaId)[0];
json_out($existing ? 200 : 201, ['empresa' => $saved]);