# Guía de despliegue

**Directorio Web Interactivo Pro Integridad Empresas**
Para quien instale el sistema en el servidor Linux de la Contraloría del Estado de Jalisco.

Esta guía cubre la instalación desde cero, la configuración de seguridad, los respaldos y las pruebas de aceptación. Para entender cómo funciona el sistema por dentro, consulta el `README.md`.

> Los comandos son los habituales para Debian/Ubuntu con Apache. Ajusta rutas, nombres de usuario y dominio a la política del servidor. Los datos marcados con **[COMPLETAR]** los define la Contraloría.

---

## 0. Datos que hay que confirmar antes de empezar

| Dato | Valor |
|---|---|
| Dominio o URL pública | **[COMPLETAR]** |
| Ruta de instalación (por ejemplo `/var/www/directorio`) | **[COMPLETAR]** |
| Versión de PHP del servidor | **[COMPLETAR]** (mínimo 8.1) |
| Versión de MySQL o MariaDB | **[COMPLETAR]** |
| Responsable técnico del servidor | **[COMPLETAR]** |
| Certificado HTTPS (institucional o Let's Encrypt) | **[COMPLETAR]** |

## 1. Requisitos

- **Apache 2.4** con `mod_rewrite` y permiso para usar `.htaccess` (`AllowOverride All`).
- **PHP 8.1 o superior** (el código usa el tipo de retorno `never`). Probado en PHP 8.5 sobre XAMPP.
  - Extensiones: `pdo_mysql`, `mbstring`, `fileinfo`, `json`. `iconv` es opcional (mejora los nombres de los archivos de logo).
- **MySQL 5.7+ o MariaDB 10.4+**, con juego de caracteres `utf8mb4`.
- **HTTPS** activo.
- `git` (para descargar el código) y `curl` (para las pruebas de seguridad).

Paquetes en Debian/Ubuntu:

```bash
sudo apt install apache2 php php-mysql php-mbstring mysql-server git curl
# (o mariadb-server en lugar de mysql-server)
sudo a2enmod rewrite
```

## 2. Obtener el código

```bash
cd /var/www
sudo git clone https://github.com/Clic-stack/Directorio_Pro_Integridad_Empresas.git directorio
```

Para actualizar después: `cd /var/www/directorio && sudo git pull`. El archivo `api/config.php` no se sube a git, así que una actualización no lo toca.

## 3. Base de datos

1. Entra a MySQL como administrador y crea la base y un usuario **propio** (no uses `root`):

```sql
CREATE DATABASE directorio_pro_integridad CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'usuario_directorio'@'localhost' IDENTIFIED BY 'CONTRASEÑA_SEGURA';
GRANT SELECT, INSERT, UPDATE, DELETE ON directorio_pro_integridad.* TO 'usuario_directorio'@'localhost';
FLUSH PRIVILEGES;
```

   Los permisos de escritura son necesarios: aunque el directorio público solo muestra datos, también **sincroniza las vigencias** (marca como desacreditadas las empresas vencidas y lo anota en la bitácora). Con un usuario de solo lectura, las empresas vencidas no se darían de baja.

2. Importa el esquema y los datos iniciales, desde la carpeta del proyecto:

```bash
mysql -u root -p directorio_pro_integridad < sql/schema.sql
mysql -u root -p directorio_pro_integridad < sql/seed.sql
```

   > **Cuidado:** `schema.sql` borra y recrea las tablas (`DROP TABLE IF EXISTS`). Ejecútalo solo en una base nueva o vacía. Nunca sobre una base que ya tenga datos reales.

   `schema.sql` ya incluye la tabla `bitacora`. `sql/migracion_bitacora.sql` solo se usa para agregarla a una base que ya existía sin ella.

## 4. Configuración de la aplicación

```bash
cd /var/www/directorio
sudo cp api/config.example.php api/config.php
sudo nano api/config.php
```

Escribe los datos reales:

```php
return [
    'db_host' => 'localhost',
    'db_name' => 'directorio_pro_integridad',
    'db_user' => 'usuario_directorio',
    'db_pass' => 'CONTRASEÑA_SEGURA',
    'db_charset' => 'utf8mb4',
];
```

Restringe el archivo (solo lo debe poder leer Apache):

```bash
sudo chown root:www-data api/config.php
sudo chmod 640 api/config.php
```

`api/config.php` **nunca** debe subirse a GitHub.

## 5. Primer administrador

Se crea por línea de comandos (el script solo funciona desde la consola, no desde el navegador):

```bash
cd /var/www/directorio
php api/crear_admin.php NOMBRE_USUARIO 'CLAVE_SEGURA_DE_AL_MENOS_8_CARACTERES'
```

Usa una contraseña robusta y distinta de las de prueba. Los demás usuarios (administradores o editores) se crean desde el panel, en la pestaña **Usuarios**.

## 6. Permisos de archivos

```bash
sudo chown -R root:www-data /var/www/directorio
sudo chmod -R 750 /var/www/directorio
# Solo esta carpeta debe poder ser escrita por Apache (aquí se guardan los logos subidos desde el panel):
sudo chown -R www-data:www-data /var/www/directorio/src/logo
```

## 7. Apache

Ejemplo de sitio (ajusta dominio y rutas):

```apache
<VirtualHost *:80>
    ServerName DOMINIO.EJEMPLO.GOB.MX
    DocumentRoot /var/www/directorio

    <Directory /var/www/directorio>
        AllowOverride All
        Options -Indexes
        Require all granted
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/directorio_error.log
    CustomLog ${APACHE_LOG_DIR}/directorio_access.log combined
</VirtualHost>
```

- `AllowOverride All` es necesario para que funcionen los `.htaccess` del proyecto (bloqueo de archivos internos, de `sql/` y de la ejecución de scripts en `src/logo/`).
- `Options -Indexes` evita que se listen carpetas.

```bash
sudo a2ensite directorio
sudo systemctl reload apache2
```

## 8. HTTPS

Activa HTTPS con el certificado institucional o con Let's Encrypt (`sudo certbot --apache`). Redirige el tráfico HTTP a HTTPS.

Con HTTPS activo, la cookie de sesión se marca como `Secure` automáticamente. Sin HTTPS, el inicio de sesión viaja sin cifrar.

## 9. Configuración de PHP

En `php.ini` (para Apache, normalmente `/etc/php/X.Y/apache2/php.ini`):

```ini
upload_max_filesize = 3M      ; los logos pueden pesar hasta 2 MB
post_max_size = 4M
display_errors = Off          ; los errores no deben mostrarse al público
log_errors = On
```

Reinicia Apache: `sudo systemctl restart apache2`.

## 10. Verificación de seguridad

Estas direcciones **deben responder 403 (Forbidden) o 404**, nunca mostrar contenido:

```bash
for ruta in api/config.php api/db.php api/bootstrap.php api/crear_admin.php api/vigencia.php sql/schema.sql; do
  echo -n "$ruta -> "
  curl -s -o /dev/null -w "%{http_code}\n" https://DOMINIO/$ruta
done
```

Además:
- `https://DOMINIO/src/logo/` no debe listar archivos.
- Después de instalar, puedes **borrar la carpeta `sql/`** del servidor (ya no se necesita) o dejarla bloqueada por su `.htaccess`.

## 11. Respaldos

Hay dos cosas que respaldar: la **base de datos** y la carpeta **`src/logo/`** (los logos subidos desde el panel no están en git).

Ejemplo de respaldo diario con cron (`sudo crontab -e`):

```cron
# Respaldo a las 02:00 (ajusta rutas y conserva los respaldos fuera de este servidor)
0 2 * * * mysqldump --defaults-extra-file=/root/.my_directorio.cnf directorio_pro_integridad | gzip > /respaldos/directorio_$(date +\%F).sql.gz
15 2 * * * tar czf /respaldos/logos_$(date +\%F).tar.gz -C /var/www/directorio/src logo
```

(El archivo `/root/.my_directorio.cnf` guarda usuario y contraseña de MySQL con permisos `600`, para no escribirlos en el comando.) Prueba restaurar un respaldo al menos una vez.

## 12. Pruebas de aceptación

Con el sistema instalado, verifica:

**Público**
- [ ] La página carga con las tarjetas, el buscador, el filtro de rubros y la paginación.
- [ ] El buscador sugiere empresas al escribir y se puede navegar con ↑ ↓ y Esc.
- [ ] Una búsqueda sin resultados muestra el aviso y este desaparece solo.
- [ ] El modal de contacto abre el correo con un clic y el botón de copiar funciona.
- [ ] No aparecen empresas desacreditadas.
- [ ] En el footer, "Aviso de privacidad" y "Convocatoria" abren su PDF.
- [ ] La página se ve bien en celular.

**Panel (administrador)** — `https://DOMINIO/admin/login.html`
- [ ] Inicia y cierra sesión.
- [ ] Crea, edita (con logo) y elimina una empresa de prueba. Al eliminarla, su logo desaparece de `src/logo/`.
- [ ] Renueva una empresa y revisa que la Bitácora muestre el movimiento.
- [ ] Crea un usuario editor desde la pestaña Usuarios.
- [ ] Los banners (por vencer, bajas por vencimiento, sin contacto, renovaciones) se ven y sus botones funcionan.

**Seguridad**
- [ ] Las rutas de la sección 10 responden 403 o 404.
- [ ] `https://DOMINIO/src/logo/` no lista archivos.
- [ ] El sitio solo se puede usar por HTTPS.

**Panel (editor)**
- [ ] No ve el botón de crear ni de eliminar empresas.
- [ ] Rubro y fecha de acreditación aparecen bloqueados al editar.
- [ ] No ve los movimientos de usuarios en la Bitácora.


## 13. Antes de abrirlo al público

- [ ] **Datos reales:** cargar las fechas reales de acreditación de las empresas (de ellas salen la vigencia y el estatus) y los logos faltantes. Coordinarlo con quien mantiene el proyecto.
- [ ] **Limpiar datos de prueba:** eliminar empresas y usuarios de prueba y, **al final**, vaciar la bitácora:

```sql
TRUNCATE TABLE bitacora;
```

- [ ] **Contraseña del administrador** definitiva y distinta de las de prueba.
- [ ] Respaldos configurados y probados.

## 14. Operación y mantenimiento

- **Vigencias:** no se necesita ninguna tarea programada. El sistema alinea los estatus cada vez que alguien abre el directorio o el panel. Las bajas por vencimiento se registran en la primera visita posterior a la fecha de vencimiento.
- **Registro de cambios:** la pestaña **Bitácora** del panel muestra quién cambió qué y cuándo. Los cambios hechos directamente en la base de datos no quedan ahí.
- **Correcciones de rubro o fecha de acreditación** (después de crear una empresa) solo se hacen en la base de datos; el procedimiento está en el `README.md`, sección "Correcciones manuales".
- **Errores del sistema:** se escriben en el log de Apache (`/var/log/apache2/directorio_error.log` en el ejemplo de arriba). El panel no muestra detalles técnicos al usuario.
- **Recuperar acceso de administrador:** `php api/crear_admin.php USUARIO 'NUEVA_CLAVE'` desde la consola del servidor. No hay recuperación de contraseña por correo.
- **Protección contra intentos de acceso repetidos:** el sistema limita los intentos por sesión (5 fallos bloquean 60 segundos), pero se puede evadir borrando cookies. Se recomienda complementarlo con `fail2ban` o límites de peticiones en Apache.
- **Actualizar el código:** `sudo git pull` desde la carpeta del proyecto. Revisa el `README.md` por si hay cambios en la base de datos.
- **Logos de empresas eliminadas:** al eliminar una empresa desde el panel, su logo se borra solo si ninguna otra lo usa. Si se elimina directamente en la base de datos, el archivo queda en `src/logo/` y hay que borrarlo a mano.

## 15. Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| Error 500 en toda la API | Un `.htaccess` con error o `AllowOverride` sin permiso. Revisa el log de Apache. |
| "No se pudo cargar el directorio" | Credenciales incorrectas en `api/config.php` o la base no está importada. |
| No se pueden subir logos | `src/logo/` sin permiso de escritura para `www-data`, o `upload_max_filesize` muy bajo. |
| Las empresas vencidas no se dan de baja | El usuario de MySQL no tiene permisos de UPDATE o INSERT. |
| El inicio de sesión no se mantiene | El sitio se abre por HTTP mientras la cookie exige HTTPS, o hay un balanceador que no reenvía el encabezado de HTTPS. | El botón de copiar correo no funciona | El sitio se abre por HTTP; el portapapeles del navegador requiere HTTPS. |