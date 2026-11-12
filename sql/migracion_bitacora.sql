-- Migración: agrega la bitácora SIN borrar tus empresas ni usuarios.
-- Úsala en una base que ya tiene datos (importa este archivo en phpMyAdmin con tu base seleccionada).
-- Es segura de repetir: si la tabla ya existe, no hace nada.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS bitacora (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fecha_hora DATETIME NOT NULL,
  usuario VARCHAR(50) NOT NULL,
  rol VARCHAR(10) NULL,
  accion VARCHAR(30) NOT NULL,
  empresa_id INT UNSIGNED NULL,
  empresa_nombre VARCHAR(150) NULL,
  cambios TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_bitacora_fecha (fecha_hora),
  KEY idx_bitacora_accion (accion),
  KEY idx_bitacora_empresa (empresa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
