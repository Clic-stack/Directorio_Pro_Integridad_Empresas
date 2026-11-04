-- Directorio Pro Integridad - esquema MySQL / MariaDB (compatible con XAMPP y Linux)
-- Uso: importar schema.sql y luego seed.sql
CREATE DATABASE IF NOT EXISTS directorio_pro_integridad
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE directorio_pro_integridad;

SET NAMES utf8mb4;
DROP TABLE IF EXISTS empresa_emails;
DROP TABLE IF EXISTS empresas;
DROP TABLE IF EXISTS rubros;
DROP TABLE IF EXISTS usuarios;

CREATE TABLE rubros (
  id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rubros_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE empresas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  rubro_id TINYINT UNSIGNED NOT NULL,
  logo VARCHAR(255) NULL,
  municipio VARCHAR(100) NULL,
  telefono VARCHAR(30) NULL,
  estatus ENUM('Acreditada','Desacreditada') NOT NULL DEFAULT 'Acreditada',
  fecha_acreditacion DATE NOT NULL,
  fecha_vigencia DATE NOT NULL,
  fecha_cambio_estatus DATE NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_empresas_legacy (legacy_id),
  KEY idx_empresas_rubro (rubro_id),
  KEY idx_empresas_estatus (estatus),
  KEY idx_empresas_nombre (nombre),
  CONSTRAINT fk_empresas_rubro FOREIGN KEY (rubro_id) REFERENCES rubros (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un correo puede repetirse entre empresas (hay 18 casos en los datos), por eso NO es UNIQUE global.
CREATE TABLE empresa_emails (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id INT UNSIGNED NOT NULL,
  email VARCHAR(150) NOT NULL,
  orden TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_empresa_email (empresa_id, email),
  CONSTRAINT fk_emails_empresa FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario VARCHAR(50) NOT NULL,
  rol ENUM('admin','editor') NOT NULL DEFAULT 'editor',
  password_hash VARCHAR(255) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_usuario (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
