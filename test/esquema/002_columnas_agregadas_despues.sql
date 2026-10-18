-- Columnas que el sistema fue sumando después del esquema base.
-- En una base que ya las tiene, el corredor ignora "columna duplicada".
ALTER TABLE empresa_barberia ADD COLUMN descripcion TEXT NULL;
ALTER TABLE empresa_barberia ADD COLUMN greenapi_instance_id VARCHAR(50) NULL;
ALTER TABLE empresa_barberia ADD COLUMN greenapi_api_token VARCHAR(100) NULL;
ALTER TABLE gastos ADD COLUMN idusuario_barbero INT NULL;
ALTER TABLE gastos ADD COLUMN archivado TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE pago_servicio ADD COLUMN archivado TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE venta_producto ADD COLUMN archivado TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE retiro_caja ADD COLUMN archivado TINYINT(1) NOT NULL DEFAULT 0;
