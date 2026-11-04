# Cómo está armada la aplicación

## 1. Visión general

Es una aplicación de tres capas, sin framework:

- **Cliente:** HTML, CSS y JavaScript vanilla. Son dos aplicaciones separadas: la página pública y el panel de administración.
- **API:** scripts PHP que responden JSON. Usan PDO con consultas preparadas y sesiones nativas de PHP.
- **Datos:** MySQL o MariaDB, y los logos como archivos en disco.

La regla de diseño es que el navegador nunca es la autoridad. Todo lo que oculta o bloquea la interfaz (roles, campos deshabilitados) se vuelve a validar en el servidor.

## 2. Organización de archivos

```
directorio/
├── index.html
├── js/   admin.js   · app.js  · login.js
├── css/  styles.css   · admin.css
│
├── admin/
│   ├── login.html        → acceso
│   └── index.html        → panel (empresas y usuarios)
│
├── api/
│   ├── config.php        credenciales (devuelve un arreglo; no se sirve como texto)
│   ├── db.php            db(): PDO singleton, excepciones, sin emulación de prepares
│   ├── bootstrap.php     sesión, CSRF, json_out/fail, require_auth, require_admin
│   ├── auth.php          GET estado+CSRF · POST login · POST logout
│   ├── empresas.php      GET público (solo vigentes)
│   ├── crear_admin.php   solo CLI: crea o restablece un admin
│   ├── .htaccess         bloquea acceso web a config/db/bootstrap/crear_admin
│   └── admin/
│       ├── empresas.php  CRUD (GET / POST crear-editar / DELETE)
│       └── usuarios.php  gestión de usuarios y roles (solo admin)
│
├── sql/  schema.sql · seed.sql · migracion_roles.sql · .htaccess (deny all)
│
└── src/  
      ├──logo_distintivo_pro-integridad.png
      └──logo/ 
```

La separación de `api/` y `api/admin/` define el perímetro: todo lo que está en `api/admin/` empieza con `require_auth()` o `require_admin()`, y lo de `api/` fuera de esa carpeta es público o es de sesión.

## 3. Modelo de datos

| Tabla | Para qué sirve |
|---|---|
| `rubros` | Catálogo de 20 rubros. Evita errores de captura que rompían el filtro. |
| `empresas` | Datos principales. `rubro_id` es llave foránea. `estatus` es un ENUM (Acreditada, Desacreditada). `fecha_acreditacion` y `fecha_vigencia` son obligatorias. |
| `empresa_emails` | Relación 1 a N, con `ON DELETE CASCADE`. El correo no es único global, porque hay 18 repetidos entre empresas. |
| `usuarios` | `password_hash` (bcrypt) y `rol` (admin o editor). |


## 4. Flujos

### 4.1 Página pública

```
index.html → app.js → GET api/empresas.php
   SQL: estatus='Acreditada' AND fecha_vigencia >= hoy AND EXISTS(email)
   → JSON con la misma forma que json-server
   → app.js: isValidCompany → getEffectiveStatus → render de tarjetas
   → búsqueda, filtro por rubro y paginación: todo en el cliente
```

La vigencia se verifica dos veces: en el SQL y otra vez en `getEffectiveStatus` del cliente. Esa redundancia es intencional, por si el navegador queda abierto horas. El HTML que viene de la base se escapa con `escapeHTML` antes de insertarse con `innerHTML`.

### 4.2 Login y sesión

```
login.js → GET auth.php        → {authenticated:false, csrf}
         → POST ?action=login  (header X-CSRF-Token)
              ├─ throttle: 5 fallos por sesión → bloqueo de 60 s
              ├─ password_verify siempre (hash falso si el usuario no existe)
              └─ session_regenerate_id + CSRF nuevo → {is_admin, csrf}
```

La cookie lleva `HttpOnly`, `SameSite=Lax` y `Secure` si hay HTTPS. Todo POST, PUT o DELETE exige el token CSRF en el header, comparado con `hash_equals`.

### 4.3 Panel: carga, alta y edición

```
admin.js init() → GET auth.php → rol → applyRole() → GET admin/empresas.php
   (todas las empresas + rubros; filtro y paginación de 20 en el cliente)

Guardar:  FormData (multipart) → POST admin/empresas.php[?id=N]
   1. require_auth (lee el rol de la BD) + CSRF
   2. si es editor: se sobrescriben estatus y fechas (nueva → "En Proceso")
   3. validate_input: campos, correos únicos, fechas, vigencia por defecto = acreditación + 365 días
   4. logo: save_logo()
   5. transacción: INSERT/UPDATE empresa + reemplazo de correos
   6. si cambia el estatus → fecha_cambio_estatus = hoy
   7. responde la empresa guardada → el cliente actualiza su arreglo local y re-renderiza
```

### 4.4 Logos

`save_logo()` valida el tamaño (2 MB) y el tipo real con `finfo` más `getimagesize` (PNG, JPG o WEBP; el SVG se rechaza a propósito). Guarda el archivo en `src/logo/`.

Al reemplazar o eliminar, `delete_logo_if_unused()` borra el archivo solo si ninguna otra empresa lo usa, porque varios logos están compartidos (Dalton, Hersa). Si falla la transacción, se borra el archivo recién subido.

### 4.5 Usuarios y roles

- `require_auth()` consulta `usuarios` en cada petición. Un cambio de rol o una baja tiene efecto inmediato, y si el usuario ya no existe la sesión se invalida.
- Editor: crea y edita datos de contacto y logo, y no toca estatus ni fechas. Sus empresas nuevas quedan "En Proceso".
- Admin: además elimina empresas y gestiona usuarios. No puede cambiarse el rol ni eliminarse a sí mismo, lo que garantiza que siempre quede al menos un admin.
- `crear_admin.php`, solo por línea de comandos, sirve para el primer admin y para recuperar acceso.

## 5. Mecanismos transversales

- **Vigencia derivada.** "Vencida" no se guarda: se calcula comparando `fecha_vigencia` con la fecha de hoy. En la base una empresa vencida sigue como "Acreditada"; solo se oculta del público. Esto importa para el aviso de abajo.
- **Zona horaria.** PHP fija `America/Mexico_City` y la fecha de hoy se pasa como parámetro, en lugar de usar `CURDATE()`, para no depender de la zona del servidor MySQL.
- **Defensa en profundidad.** Consultas preparadas, escape de HTML en ambos clientes, CSRF, `.htaccess` que bloquea archivos internos y ejecución de scripts en `src/logo/`, y errores internos que van al log sin exponerse.

## 6. Limitaciones conocidas

- El freno de fuerza bruta es por sesión; un atacante que borre cookies lo evade. Conviene `fail2ban` o límites en Apache.
- No hay bitácora de auditoría: nadie sabe quién cambió qué.
- El GET del admin trae todas las empresas. Con cientos va bien; con miles habría que paginar en el servidor.
- No hay recuperación de contraseña, y el endpoint público no usa caché.

# Propuesta: aviso de vigencia próxima

Como "vencida" es un estado derivado, no hace falta guardar ningún estado nuevo: basta con calcular los días restantes. Lo propongo en tres capas, de menor a mayor esfuerzo. No he implementado ni ejecutado nada de esto todavía.

## Aviso visual en el panel (sin cambios de servidor)

Los datos ya llegan al cliente. En `admin.js` se puede agregar un estado visual "Por vencer":

```javascript
const DAYS_WARN = 30;

function daysLeft(e) {
    const d = (s) => new Date(`${s}T00:00:00`);
    return Math.round((d(e.fecha_vigencia) - d(today())) / 86400000);
}

function effectiveStatus(e) {
    if (e.estatus === "Acreditada") {
        const days = daysLeft(e);
        if (days < 0) return "Vencida";
        if (days <= DAYS_WARN) return "Por vencer";
    }
    return e.estatus;
}
```

Hay que ajustar tres cosas:
- Una opción "Por vencer" en el filtro de estatus.
- Que el filtro "Acreditada" incluya también las "Por vencer".
- Una clase `.badge.PorVencer` en ámbar.

Arriba de la tabla puede ir un banner con el conteo, por ejemplo "12 empresas vencen en los próximos 30 días", que al pulsarlo aplica el filtro. Esto resuelve el aviso para quien entra al panel, pero solo si alguien entra.


## Botón "Renovar"

Sin campo de renovación, renovar hoy exige editar la fecha de vigencia a mano. Un botón que llame a `POST admin/empresas.php?id=N&action=renovar`, haría en el servidor:

- `fecha_vigencia = MAX(fecha_vigencia, hoy) + 365 días`, así no se pierden días si renuevan con anticipación;


## Directorio Pro Integridad

### Local (XAMPP)
1. Copia esta carpeta a `htdocs/(nombre_proyecto)` y arranca Apache y MySQL.
2. En phpMyAdmin importa `sql/schema.sql` y luego `sql/seed.sql`.
3. Revisa `api/config.php` (por defecto root sin contraseña).
4. Crea el primer admin (desde la carpeta del proyecto):
   `C:\xampp\php\php.exe api\crear_admin.php miusuario "MiClaveSegura123"` (editor)
5. Público: http://localhost/(nombre_proyecto)/  ·  Admin: http://localhost/(nombre_proyecto)/admin/login.html
   Los demás admins se crean desde la pestaña "Administradores".

### Servidor Linux (Apache + PHP + MySQL) (opcional)
- Paquetes: `apache2 php php-mysql php-mbstring mysql-server` (o mariadb-server).
- Crea un usuario MySQL propio (no root) con permisos solo sobre `directorio_pro_integridad` y ponlo en `api/config.php`.
- Importa `schema.sql` y `seed.sql`; crea el admin con `php api/crear_admin.php usuario 'clave'`.
- Permisos: `sudo chown -R www-data:www-data src/logo` (ahí se guardan los logos subidos).
- Apache necesita `AllowOverride All` (o `FileInfo Limit`) en el directorio para que funcionen los `.htaccess`.
- Usa HTTPS (certbot). Si PHP limita las subidas, `upload_max_filesize` y `post_max_size` deben ser >= 3M.
- Después de desplegar puedes borrar la carpeta `sql/` o dejarla bloqueada por su `.htaccess`.
