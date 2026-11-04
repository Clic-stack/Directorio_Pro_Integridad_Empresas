<?php
declare(strict_types=1);
// CRUD de empresas (solo admins con sesión).
// GET              -> {empresas: [...], rubros: [...]}
// POST             -> crear (multipart/form-data, campo opcional "logo")
// POST ?id=N       -> actualizar
// DELETE ?id=N     -> eliminar (solo admin)
//
// Roles: el editor puede crear y editar datos de contacto y logo; estatus y fechas son solo del admin.

require __DIR__ . '/../bootstrap.php';
$user = require_auth();

const LOGO_DIR_REL = 'src/logo';
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
    'image/webp' => 'webp',
];

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

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

// Valida y normaliza los datos del formulario. Devuelve [datos, correos, errores].
function validate_input(PDO $pdo, array $in): array
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

    $estatus = (string) ($in['estatus'] ?? '');
    if (!in_array($estatus, ['Acreditada', 'Desacreditada'], true)) {
        $errors['estatus'] = 'Estatus inválido.';
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
    }
    $vig = trim((string) ($in['fecha_vigencia'] ?? ''));
    if ($vig !== '' && !valid_date($vig)) {
        $errors['fecha_vigencia'] = 'Fecha inválida.';
    }
    if ($vig === '' && !$errors) {
        $vig = (new DateTimeImmutable($acred))->modify('+365 days')->format('Y-m-d');
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

// ---------------------------------------------------------------- GET
if ($method === 'GET') {
    $rubros = $pdo->query('SELECT id, nombre FROM rubros ORDER BY nombre')->fetchAll();
    json_out(200, ['empresas' => fetch_empresas($pdo), 'rubros' => $rubros]);
}

// ---------------------------------------------------------------- DELETE
if ($method === 'DELETE') {
    if (!$user['is_admin']) {
        fail(403, 'Solo un administrador puede eliminar empresas.');
    }
    if ($id <= 0) {
        fail(400, 'Falta el id');
    }
    $stmt = $pdo->prepare('SELECT logo FROM empresas WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        fail(404, 'Empresa no encontrada');
    }
    $pdo->prepare('DELETE FROM empresas WHERE id = ?')->execute([$id]);
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
if (!$user['is_admin']) {
    if ($existing) {
        foreach (['estatus', 'fecha_acreditacion', 'fecha_vigencia'] as $campo) {
            $input[$campo] = (string) ($existing[$campo] ?? '');
        }
    } else {
        $input['estatus'] = 'Acreditada';
        $input['fecha_acreditacion'] = date('Y-m-d');
        $input['fecha_vigencia'] = '';
    }
}

[$data, $emails, $errors] = validate_input($pdo, $input);
if ($errors) {
    fail(422, 'Revisa los campos marcados.', ['errors' => $errors]);
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

try {
    $pdo->beginTransaction();
    if ($existing) {
        // Si cambia el estatus se registra la fecha del cambio
        $cambio = $existing['estatus'] !== $data['estatus'] ? date('Y-m-d') : $existing['fecha_cambio_estatus'];
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
