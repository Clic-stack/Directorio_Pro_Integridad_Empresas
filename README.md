# Directorio Web Interactivo Pro Integridad Empresas

Directorio público de empresas acreditadas y panel de administración para mantenerlo.
Contraloría del Estado de Jalisco.

## Cómo está armada la aplicación

### 1. Visión general

Es una aplicación de tres capas, sin framework:

- **Cliente:** HTML, CSS y JavaScript vanilla. Son dos aplicaciones separadas: la página pública y el panel de administración.
- **API:** scripts PHP que responden JSON. Usan PDO con consultas preparadas y sesiones nativas de PHP.
- **Datos:** MySQL o MariaDB, y los logos como archivos en disco.

La regla de diseño es que **el navegador nunca es la autoridad**. Todo lo que oculta o bloquea la interfaz (roles, campos deshabilitados, estatus, vigencia) se vuelve a validar o a calcular en el servidor.

### 2. Organización de archivos

```
directorio/
├── index.html
├── js/   admin.js · app.js · login.js
├── css/  styles.css · admin.css
│
├── admin/
│   ├── login.html          → acceso
│   └── index.html          → panel (Empresas, Usuarios y Bitácora)
│
├── api/
│   ├── config.php          credenciales reales (devuelve un arreglo; NO se sube a git)
│   ├── config.example.php  plantilla de config.php, sin datos reales
│   ├── db.php              db(): PDO singleton, excepciones, sin emulación de prepares
│   ├── bootstrap.php       sesión, CSRF, json_out/fail, require_auth, require_admin
│   ├── vigencia.php        reglas de vigencia y estatus, sincronización y registro en bitácora
│   ├── auth.php            GET estado+CSRF · POST login · POST logout
│   ├── empresas.php        GET público (solo vigentes)
│   ├── crear_admin.php     solo CLI: crea o restablece un admin
│   ├── .htaccess           bloquea acceso web a config, db, bootstrap, crear_admin y vigencia
│   └── admin/
│       ├── empresas.php    CRUD, renovar y resumen (GET / POST crear-editar / POST renovar / DELETE)
│       ├── usuarios.php    gestión de usuarios y roles (solo admin)
│       └── bitacora.php    consulta de la bitácora (admin y editor)
│
├── sql/  schema.sql · seed.sql · migracion_bitacora.sql · .htaccess (deny all)
│
└── src/
    ├── logo_distintivo_pro-integridad.png
    └── logo/               logos de las empresas
```

La separación de `api/` y `api/admin/` define el perímetro: todo lo que está en `api/admin/` empieza con `require_auth()` o `require_admin()`, y lo de `api/` fuera de esa carpeta es público o es de sesión.

### 3. Modelo de datos

| Tabla | Para qué sirve |
|---|---|
| `rubros` | Catálogo de 20 rubros. Evita errores de captura que rompían el filtro. |
| `empresas` | Datos principales. `rubro_id` es llave foránea. `estatus` es un ENUM (`Acreditada`, `Desacreditada`). `fecha_acreditacion` y `fecha_vigencia` son obligatorias. `fecha_cambio_estatus` guarda cuándo cambió el estatus por última vez. |
| `empresa_emails` | Relación 1 a N, con `ON DELETE CASCADE`. El correo no es único global, porque hay 18 repetidos entre empresas. |
| `usuarios` | `password_hash` (bcrypt) y `rol` (`admin` o `editor`). |
| `bitacora` | Historial de movimientos: fecha y hora, usuario, rol, acción, empresa (id y nombre) y un JSON `cambios` con el formato `{"campo": [antes, después]}`. **No tiene llaves foráneas a propósito**: así el registro sobrevive aunque se elimine la empresa o el usuario. |

### 4. Reglas de negocio

**Vigencia y estatus (automáticos)**

- La vigencia siempre es `fecha_acreditacion + 365 días`.
- El estatus se deriva de la vigencia: `vigencia >= hoy` → `Acreditada`; si no, `Desacreditada`.
- Ninguno de los dos viene del formulario: el navegador no los envía y el servidor los calcula.
- Una empresa vencida **no se elimina**: queda como `Desacreditada`, deja de mostrarse en el directorio público y se registra en la bitácora como baja por vencimiento.

**Renovar**

- La fecha de renovación pasa a ser la nueva fecha de acreditación (y la vigencia se recalcula desde ella).
- Debe ser una fecha válida, no futura y posterior a la acreditación actual.
- La fecha anterior queda guardada en la bitácora.
- Está disponible en el formulario de edición y en las listas de avisos. Por defecto la pueden usar los dos roles; para restringirla al admin, cambiar `RENOVAR_SOLO_ADMIN` a `true` en `api/admin/empresas.php`.

**Rubro y fecha de acreditación**

- Solo se capturan al **crear** la empresa. Después quedan bloqueados en el panel y el servidor ignora cualquier valor que llegue del navegador.
- La fecha de acreditación solo cambia con **Renovar**. Una corrección del rubro o de una fecha mal capturada se hace directamente en la base de datos (ver "Correcciones manuales").

**Roles**

| Acción | Admin | Editor |
|---|---|---|
| Ver y buscar empresas, banners y bitácora | Sí | Sí |
| Editar contacto (municipio, teléfono, correos) y logo | Sí | Sí |
| Renovar | Sí | Sí (configurable) |
| Crear empresas | Sí | No |
| Eliminar empresas | Sí | No |
| Gestionar usuarios y roles | Sí | No |
| Ver movimientos de usuarios en la bitácora | Sí | No |

### 5. Flujos

#### 5.1 Página pública

```
index.html → app.js → GET api/empresas.php
   vig_sincronizar() alinea los estatus con las vigencias de hoy
   SQL: estatus='Acreditada' AND fecha_vigencia >= hoy AND EXISTS(email)
   → JSON con la misma forma que json-server
   → app.js: isValidCompany → getEffectiveStatus → render de tarjetas
   → búsqueda, filtro por rubro y paginación: todo en el cliente
```

La vigencia se verifica en varios puntos: en la sincronización, en el SQL y otra vez en `getEffectiveStatus` del cliente. Esa redundancia es intencional, por si el navegador queda abierto horas. El HTML que viene de la base se escapa con `escapeHTML` antes de insertarse con `innerHTML`.

#### 5.2 Login y sesión

```
login.js → GET auth.php        → {authenticated:false, csrf}
         → POST ?action=login  (header X-CSRF-Token)
              ├─ throttle: 5 fallos por sesión → bloqueo de 60 s
              ├─ password_verify siempre (hash falso si el usuario no existe)
              └─ session_regenerate_id + CSRF nuevo → {is_admin, csrf}
```

La cookie lleva HttpOnly, SameSite=Lax y Secure si hay HTTPS. Todo POST, PUT o DELETE exige el token CSRF en el header, comparado con `hash_equals`.

#### 5.3 Panel: carga, alta y edición

```
admin.js init() → GET auth.php → rol → applyRole() → GET admin/empresas.php
   (todas las empresas + rubros + resumen; filtro y paginación de 20 en el cliente)

Guardar:  FormData (multipart) → POST admin/empresas.php[?id=N]
   1. require_auth (lee el rol de la BD) + CSRF
   2. crear: solo admin. Editar: si ya existe, rubro y fecha de acreditación se toman de la BD
   3. validate_input: campos, correos únicos, fechas; vigencia y estatus se DERIVAN
   4. logo: save_logo()
   5. transacción: INSERT/UPDATE empresa + reemplazo de correos + fila en bitácora (solo si hubo cambios)
   6. si cambia el estatus → fecha_cambio_estatus = hoy
   7. responde la empresa guardada → el cliente actualiza su arreglo local y re-renderiza
```

#### 5.4 Renovar

```
POST admin/empresas.php?id=N&action=renovar   (fecha_renovacion)
   valida la fecha → nueva vigencia = fecha + 365 días → nuevo estatus
   transacción: UPDATE empresa + fila 'renovar' en bitácora (acreditación y vigencia antes → después)
```

#### 5.5 Eliminar

Solo admin. En una transacción se guarda en la bitácora una "foto" de la empresa (nombre, rubro, correos, fechas y estatus) y después se borra. Es lo único que queda de ella.

#### 5.6 Logos

`save_logo()` valida el tamaño (2 MB) y el tipo real con `finfo` más `getimagesize` (PNG, JPG o WEBP; el SVG se rechaza a propósito). Guarda el archivo en `src/logo/`.

Al reemplazar o eliminar, `delete_logo_if_unused()` borra el archivo solo si ninguna otra empresa lo usa, porque varios logos están compartidos (Dalton, Hersa). Si falla la transacción, se borra el archivo recién subido.

#### 5.7 Usuarios y roles

- `require_auth()` consulta `usuarios` en cada petición. Un cambio de rol o una baja tiene efecto inmediato, y si el usuario ya no existe la sesión se invalida.
- Un admin no puede cambiarse el rol ni eliminarse a sí mismo, lo que garantiza que siempre quede al menos un admin.
- Crear, cambiar rol, cambiar contraseña y eliminar usuarios queda en la bitácora (nunca se guarda la contraseña ni su hash, solo el hecho de que cambió).
- `crear_admin.php`, solo por línea de comandos, sirve para el primer admin y para recuperar acceso.

### 6. Panel: avisos y bitácora

**Banners** (arriba de la lista de empresas, cada uno con su botón):

| Color | Aviso | Botón |
|---|---|---|
| Naranja | Empresas que vencen en los próximos 30 días | Ver empresas (con Renovar) |
| Rojo | Empresas dadas de baja por vencimiento | Ver empresas (Renovar y, solo admin, Eliminar) |
| Amarillo | Empresas sin ningún medio de contacto | Ver empresas (Editar) |
| Verde | Renovaciones registradas | Ver renovaciones (abre la bitácora filtrada) |

**Bitácora:** pestaña con filtro por acción, búsqueda por empresa o usuario y paginación de 25. Para renovaciones muestra la acreditación original y, debajo, la fecha de renovación con su vigencia nueva; si la empresa estaba desacreditada y quedó acreditada, se marca como reactivada.

Acciones registradas: alta, edición, renovación, eliminación, baja por vencimiento, reactivación y movimientos de usuarios.

### 7. Mecanismos transversales

- **Sincronización de vigencias (sin cron).** `vig_sincronizar()` corre en cada petición al directorio público y al panel. Busca las empresas cuyo estatus guardado no coincide con su vigencia, lo corrige y registra la baja por vencimiento o la reactivación. Cada actualización se condiciona al estatus anterior, de modo que dos peticiones simultáneas no duplican el registro.
- **Zona horaria.** PHP fija `America/Mexico_City` y la fecha de hoy se pasa como parámetro, en lugar de usar `CURDATE()`, para no depender de la zona del servidor MySQL.
- **Defensa en profundidad.** Consultas preparadas, escape de HTML en ambos clientes, CSRF, `.htaccess` que bloquea archivos internos y ejecución de scripts en `src/logo/`, y errores internos que van al log sin exponerse.
- **Atomicidad.** Cada cambio y su registro en la bitácora van en la misma transacción: si falla uno, no se guarda ninguno.

### 8. Limitaciones conocidas

- Las bajas por vencimiento se registran en la **primera petición posterior** a la fecha de vencimiento (no hay tarea programada). El directorio público oculta la empresa de inmediato porque el SQL también compara la vigencia.
- Una empresa que se crea ya vencida (por ejemplo, con una fecha de acreditación de hace más de un año) entra como `Desacreditada` y **no genera** un registro de baja, porque nunca estuvo vigente en el sistema.
- Los cambios hechos directamente en la base de datos no quedan en la bitácora.
- Como el directorio público también sincroniza vigencias, **el usuario de MySQL necesita permisos de lectura y escritura** (SELECT, INSERT, UPDATE y DELETE).
- El freno de fuerza bruta es por sesión; un atacante que borre cookies lo evade. Conviene fail2ban o límites en Apache.
- El GET del admin trae todas las empresas. Con cientos va bien; con miles habría que paginar en el servidor.
- No hay recuperación de contraseña (decisión deliberada: solo entra personal con permisos; un admin puede cambiar la contraseña de otro, y el primero se restablece con `crear_admin.php`). El endpoint público no usa caché.
- En la bitácora, los movimientos de usuarios muestran el usuario afectado en la columna "Empresa".
- La lista de los 20 rubros y sus íconos está escrita también en `index.html` (filtro) y en `js/app.js` (`iconsByCategory`). Si se agrega o renombra un rubro en la base de datos, hay que actualizar esos dos archivos con el nombre exacto.

### 9. Correcciones manuales (solo desde la base de datos)

Si se capturó mal el rubro o la fecha de acreditación al crear una empresa, se corrige en phpMyAdmin (pestaña SQL). Siempre con `WHERE id = ...`.

Fecha de acreditación (la vigencia se corrige junto con ella; el estatus se alinea solo en la siguiente carga):

```sql
UPDATE empresas
SET fecha_acreditacion = '2026-05-01',
    fecha_vigencia = DATE_ADD('2026-05-01', INTERVAL 365 DAY)
WHERE id = 123;
```

Rubro:

```sql
UPDATE empresas SET rubro_id = 5 WHERE id = 123;
```

---

## Instalación

### Local (XAMPP)

1. Copia esta carpeta a `htdocs/(nombre_proyecto)` y arranca Apache y MySQL.
2. En phpMyAdmin crea la base `directorio_pro_integridad` (cotejamiento `utf8mb4_unicode_ci`) e importa `sql/schema.sql` y luego `sql/seed.sql`. `seed.sql` carga las 528 empresas iniciales. `schema.sql` ya incluye la tabla `bitacora`; si trabajas con una base ya existente, ejecuta `sql/migracion_bitacora.sql`.
3. Copia `api/config.example.php` con el nombre `api/config.php` y revisa los valores (en XAMPP, `root` sin contraseña). `config.php` no se sube a git.
4. Crea el primer admin (desde la carpeta del proyecto):
   `C:\xampp\php\php.exe api\crear_admin.php miusuario "MiClaveSegura123"`
5. Público: `http://localhost/(nombre_proyecto)/` · Admin: `http://localhost/(nombre_proyecto)/admin/login.html`.
   Los demás usuarios (admin o editor) se crean desde la pestaña **Usuarios**.

### Servidor Linux (Apache + PHP + MySQL)

1. Paquetes: `apache2 php php-mysql php-mbstring mysql-server` (o `mariadb-server`).
2. Crea un usuario MySQL propio (no `root`) con permisos SELECT, INSERT, UPDATE y DELETE solo sobre `directorio_pro_integridad`, y ponlo en `api/config.php` (cópialo desde `api/config.example.php`).
3. Importa `schema.sql` y `seed.sql`; crea el admin con `php api/crear_admin.php usuario 'clave'`.
4. Permisos: `sudo chown -R www-data:www-data src/logo` (ahí se guardan los logos subidos).
5. Apache necesita `AllowOverride All` (o `FileInfo Limit`) en el directorio para que funcionen los `.htaccess`.
6. Usa HTTPS (certbot). Si PHP limita las subidas, `upload_max_filesize` y `post_max_size` deben ser >= 3M.
7. Después de desplegar puedes borrar la carpeta `sql/` o dejarla bloqueada por su `.htaccess`.
8. Antes de abrirlo al público: cambiar la contraseña del admin, no dejar contraseñas reales en el repositorio y vaciar los datos de prueba (`TRUNCATE TABLE bitacora;`).

## Pendientes antes de producción

- Cargar las fechas reales de acreditación (de ellas salen la vigencia y el estatus) y los logos faltantes.
- Decidir si solo el admin puede renovar (`RENOVAR_SOLO_ADMIN`).
- Autorización para publicar correos y teléfonos de las empresas.
- Credenciales de la base de datos y contraseña del admin definitivas (solo en el `api/config.php` del servidor, nunca en el repositorio).