-- Crear base de datos y usuario si no existen (ejecutado como root en Docker)
CREATE DATABASE IF NOT EXISTS microfin
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'microfin'@'%' IDENTIFIED BY 'microfin2024';
GRANT ALL PRIVILEGES ON microfin.* TO 'microfin'@'%';
FLUSH PRIVILEGES;
