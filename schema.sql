-- ============================================================
--  Sistema Barbería — Schema MySQL
--  Generado desde modelos Sequelize
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- empresa_barberia
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `empresa_barberia` (
  `idbarberia`           INT           NOT NULL AUTO_INCREMENT,
  `nombre_negocio`       VARCHAR(100)  NOT NULL,
  `subdominio`           VARCHAR(50)   NOT NULL UNIQUE,
  `plan_suscripcion`     ENUM('bronze','silver','gold') NOT NULL DEFAULT 'bronze',
  `estado_cuenta`        ENUM('activo','suspendido')    NOT NULL DEFAULT 'activo',
  `logo_url`             VARCHAR(500)  NULL,
  `color_primario`       VARCHAR(7)    NULL DEFAULT '#d4a843',
  `telefono`             VARCHAR(30)   NULL,
  `direccion`            VARCHAR(200)  NULL,
  `correo_negocio`       VARCHAR(200)  NULL,
  `slogan`               VARCHAR(150)  NULL,
  `color_portada`        VARCHAR(7)    NULL DEFAULT '#ffffff',
  `color_nombre_1`       VARCHAR(7)    NULL DEFAULT '#ffffff',
  `color_nombre_2`       VARCHAR(7)    NULL DEFAULT '#d4a843',
  `texto_portada_1`      VARCHAR(100)  NULL,
  `texto_portada_2`      VARCHAR(100)  NULL,
  `color_header_1`       VARCHAR(7)    NULL DEFAULT '#ffffff',
  `color_header_2`       VARCHAR(7)    NULL DEFAULT '#d4a843',
  `fuente_header`        VARCHAR(50)   NULL DEFAULT 'Cinzel',
  `maps_embed`           VARCHAR(800)  NULL,
  `horario_lv_desde`     VARCHAR(5)    NULL DEFAULT '09:00',
  `horario_lv_hasta`     VARCHAR(5)    NULL DEFAULT '19:00',
  `horario_sab_desde`    VARCHAR(5)    NULL DEFAULT '09:00',
  `horario_sab_hasta`    VARCHAR(5)    NULL DEFAULT '15:00',
  `domingo_cerrado`      TINYINT(1)    NULL DEFAULT 1,
  `duracion_turno`       INT           NULL DEFAULT 40,
  `tiempo_cancelacion`   INT           NULL DEFAULT 60,
  `tiempo_confirmacion`  INT           NULL DEFAULT 60,
  `reservas_online`      TINYINT(1)    NULL DEFAULT 1,
  `orden_llegada`        TINYINT(1)    NULL DEFAULT 1,
  `dias_inactividad`     INT           NULL DEFAULT 60,
  `instagram`            VARCHAR(100)  NULL,
  `facebook`             VARCHAR(100)  NULL,
  `whatsapp_negocio`     VARCHAR(30)   NULL,
  `notif_nueva_reserva`  TINYINT(1)    NOT NULL DEFAULT 1,
  `notif_recordatorio`   TINYINT(1)    NOT NULL DEFAULT 1,
  `notif_barbero`        TINYINT(1)    NOT NULL DEFAULT 1,
  `gmail_remitente`      VARCHAR(200)  NULL,
  `gmail_password`       VARCHAR(200)  NULL,
  `whatsapp_barbero`     VARCHAR(20)   NULL,
  `callmebot_apikey`     VARCHAR(50)   NULL,
  `fecha_alta`           DATETIME      NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt`            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idbarberia`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- persona
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `persona` (
  `idpersona`          INT          NOT NULL AUTO_INCREMENT,
  `idbarberia`         INT          NOT NULL,
  `nombre_completo`    VARCHAR(100) NOT NULL,
  `telefono`           VARCHAR(20)  NOT NULL,
  `correo_electronico` VARCHAR(100) NULL,
  `foto_url`           VARCHAR(500) NULL,
  `fecha_registro`     DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idpersona`),
  CONSTRAINT `fk_persona_barberia` FOREIGN KEY (`idbarberia`) REFERENCES `empresa_barberia`(`idbarberia`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- usuario  (barberos / admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `usuario` (
  `idusuario`              INT           NOT NULL AUTO_INCREMENT,
  `idpersona`              INT           NOT NULL UNIQUE,
  `rol`                    ENUM('admin','barbero','owner') NOT NULL,
  `pin_acceso`             VARCHAR(255)  NULL,
  `password_hash`          VARCHAR(255)  NULL,
  `comision_porcentaje`    DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  `rating_promedio`        DECIMAL(3,2)  NOT NULL DEFAULT 5.00,
  `estado`                 ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  `puede_cobrar`           TINYINT(1)    NOT NULL DEFAULT 0,
  `puede_vender`           TINYINT(1)    NOT NULL DEFAULT 0,
  `reset_token`            VARCHAR(100)  NULL,
  `reset_token_expira`     DATETIME      NULL,
  `especialidades`         VARCHAR(300)  NULL,
  `createdAt`              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idusuario`),
  CONSTRAINT `fk_usuario_persona` FOREIGN KEY (`idpersona`) REFERENCES `persona`(`idpersona`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- cliente
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cliente` (
  `idcliente`      INT  NOT NULL AUTO_INCREMENT,
  `idpersona`      INT  NOT NULL UNIQUE,
  `notas_cliente`  TEXT NULL,
  `estado`         ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  `createdAt`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idcliente`),
  CONSTRAINT `fk_cliente_persona` FOREIGN KEY (`idpersona`) REFERENCES `persona`(`idpersona`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- servicio
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `servicio` (
  `idservicio`        INT            NOT NULL AUTO_INCREMENT,
  `idbarberia`        INT            NOT NULL,
  `nombre_servicio`   VARCHAR(100)   NOT NULL,
  `descripcion`       TEXT           NULL,
  `precio`            DECIMAL(10,2)  NOT NULL,
  `duracion_minutos`  INT            NOT NULL,
  `estado`            ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  `imagen_url`        VARCHAR(500)   NULL,
  `createdAt`         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idservicio`),
  CONSTRAINT `fk_servicio_barberia` FOREIGN KEY (`idbarberia`) REFERENCES `empresa_barberia`(`idbarberia`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- producto
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `producto` (
  `idproducto`       INT            NOT NULL AUTO_INCREMENT,
  `idbarberia`       INT            NOT NULL,
  `nombre_producto`  VARCHAR(100)   NOT NULL,
  `descripcion`      TEXT           NULL,
  `categoria`        VARCHAR(50)    NOT NULL,
  `precio_venta`     DECIMAL(10,2)  NOT NULL,
  `stock_actual`     INT            NOT NULL DEFAULT 0,
  `stock_minimo`     INT            NOT NULL DEFAULT 5,
  `createdAt`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idproducto`),
  CONSTRAINT `fk_producto_barberia` FOREIGN KEY (`idbarberia`) REFERENCES `empresa_barberia`(`idbarberia`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- agenda_turno
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `agenda_turno` (
  `idagenda`          INT      NOT NULL AUTO_INCREMENT,
  `idbarberia`        INT      NOT NULL,
  `idcliente`         INT      NULL,
  `idusuario_barbero` INT      NOT NULL,
  `idservicio`        INT      NOT NULL,
  `servicios_ids`     JSON     NULL,
  `fecha`             DATE     NOT NULL,
  `hora_inicio`       TIME     NOT NULL,
  `hora_fin`          TIME     NOT NULL,
  `estado`            ENUM('pendiente','confirmado','atendido','cobrado','ausente','cancelado','archivado') NOT NULL DEFAULT 'pendiente',
  `tipo_alta`         ENUM('web','orden_de_llegada') NOT NULL DEFAULT 'web',
  `fecha_creacion`    DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idagenda`),
  CONSTRAINT `fk_agenda_barberia` FOREIGN KEY (`idbarberia`)        REFERENCES `empresa_barberia`(`idbarberia`) ON DELETE RESTRICT,
  CONSTRAINT `fk_agenda_cliente`  FOREIGN KEY (`idcliente`)         REFERENCES `cliente`(`idcliente`)           ON DELETE SET NULL,
  CONSTRAINT `fk_agenda_barbero`  FOREIGN KEY (`idusuario_barbero`) REFERENCES `usuario`(`idusuario`),
  CONSTRAINT `fk_agenda_servicio` FOREIGN KEY (`idservicio`)        REFERENCES `servicio`(`idservicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- pago_servicio
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pago_servicio` (
  `idpago`                   INT            NOT NULL AUTO_INCREMENT,
  `idbarberia`               INT            NOT NULL,
  `idagenda`                 INT            NOT NULL,
  `monto_pago`               DECIMAL(10,2)  NOT NULL,
  `monto_comision_barbero`   DECIMAL(10,2)  NOT NULL,
  `metodo_pago`              ENUM('efectivo','transferencia','tarjeta') NOT NULL,
  `fecha_pago`               DATETIME       NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt`                DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`                DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idpago`),
  CONSTRAINT `fk_pago_barberia` FOREIGN KEY (`idbarberia`) REFERENCES `empresa_barberia`(`idbarberia`) ON DELETE RESTRICT,
  CONSTRAINT `fk_pago_agenda`   FOREIGN KEY (`idagenda`)   REFERENCES `agenda_turno`(`idagenda`)       ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- venta_producto
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `venta_producto` (
  `idventa`                      INT            NOT NULL AUTO_INCREMENT,
  `idbarberia`                   INT            NOT NULL,
  `idproducto`                   INT            NOT NULL,
  `idusuario_barbero`            INT            NOT NULL,
  `idcliente`                    INT            NULL,
  `cantidad`                     INT            NOT NULL DEFAULT 1,
  `precio_unitario_historico`    DECIMAL(10,2)  NOT NULL,
  `monto_total`                  DECIMAL(10,2)  NOT NULL,
  `metodo_pago`                  ENUM('efectivo','transferencia','tarjeta') NOT NULL,
  `fecha_venta`                  DATETIME       NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt`                    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`                    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idventa`),
  CONSTRAINT `fk_venta_barberia` FOREIGN KEY (`idbarberia`)        REFERENCES `empresa_barberia`(`idbarberia`) ON DELETE RESTRICT,
  CONSTRAINT `fk_venta_producto` FOREIGN KEY (`idproducto`)        REFERENCES `producto`(`idproducto`),
  CONSTRAINT `fk_venta_barbero`  FOREIGN KEY (`idusuario_barbero`) REFERENCES `usuario`(`idusuario`),
  CONSTRAINT `fk_venta_cliente`  FOREIGN KEY (`idcliente`)         REFERENCES `cliente`(`idcliente`)           ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- gastos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `gastos` (
  `idgasto`          INT            NOT NULL AUTO_INCREMENT,
  `idbarberia`       INT            NOT NULL,
  `descripcion`      VARCHAR(255)   NOT NULL,
  `monto`            DECIMAL(10,2)  NOT NULL,
  `categoria_gasto`  VARCHAR(50)    NOT NULL,
  `fecha_gasto`      DATE           NOT NULL,
  `fecha_registro`   DATETIME       NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idgasto`),
  CONSTRAINT `fk_gastos_barberia` FOREIGN KEY (`idbarberia`) REFERENCES `empresa_barberia`(`idbarberia`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- horarios_atencion
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `horarios_atencion` (
  `idhorario`         INT  NOT NULL AUTO_INCREMENT,
  `idusuario_barbero` INT  NOT NULL,
  `dia_semana`        INT  NOT NULL COMMENT '1=Lunes ... 7=Domingo',
  `hora_apertura`     TIME NOT NULL,
  `hora_cierre`       TIME NOT NULL,
  `createdAt`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idhorario`),
  CONSTRAINT `fk_horario_usuario` FOREIGN KEY (`idusuario_barbero`) REFERENCES `usuario`(`idusuario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- notificaciones
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notificaciones` (
  `idnotificacion`    INT           NOT NULL AUTO_INCREMENT,
  `idbarberia`        INT           NOT NULL,
  `idusuario_barbero` INT           NOT NULL,
  `tipo`              ENUM('reserva','recordatorio','promocion','sistema','pago') NOT NULL DEFAULT 'sistema',
  `titulo`            VARCHAR(100)  NOT NULL DEFAULT 'Notificación',
  `mensaje`           VARCHAR(500)  NOT NULL,
  `leido`             TINYINT(1)    NOT NULL DEFAULT 0,
  `fecha_creacion`    DATETIME      NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idnotificacion`),
  CONSTRAINT `fk_notif_barberia` FOREIGN KEY (`idbarberia`)        REFERENCES `empresa_barberia`(`idbarberia`) ON DELETE RESTRICT,
  CONSTRAINT `fk_notif_usuario`  FOREIGN KEY (`idusuario_barbero`) REFERENCES `usuario`(`idusuario`)           ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- imagenes_galeria
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `imagenes_galeria` (
  `idimagen`      INT           NOT NULL AUTO_INCREMENT,
  `idbarberia`    INT           NOT NULL,
  `url_imagen`    VARCHAR(255)  NOT NULL,
  `tipo_seccion`  ENUM('perfil_usuario','landing_galeria') NOT NULL,
  `id_referencia` INT           NULL,
  `createdAt`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idimagen`),
  CONSTRAINT `fk_galeria_barberia` FOREIGN KEY (`idbarberia`) REFERENCES `empresa_barberia`(`idbarberia`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- imagenes_carrusel
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `imagenes_carrusel` (
  `idimagen`   INT          NOT NULL AUTO_INCREMENT,
  `idbarberia` INT          NOT NULL,
  `url`        VARCHAR(500) NOT NULL,
  `orden`      INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`idimagen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- turno_token
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `turno_token` (
  `idtoken`   INT          NOT NULL AUTO_INCREMENT,
  `idagenda`  INT          NOT NULL,
  `token`     VARCHAR(100) NOT NULL UNIQUE,
  `tipo`      ENUM('confirmar','cancelar') NOT NULL,
  `usado`     TINYINT(1)   NOT NULL DEFAULT 0,
  `expira_en` DATETIME     NOT NULL,
  PRIMARY KEY (`idtoken`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- retiro_caja
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `retiro_caja` (
  `idretiro`           INT            NOT NULL AUTO_INCREMENT,
  `idbarberia`         INT            NOT NULL,
  `idusuario_barbero`  INT            NOT NULL,
  `monto`              DECIMAL(10,2)  NOT NULL,
  `descripcion`        VARCHAR(200)   NULL,
  `estado`             ENUM('pendiente','devuelto') NOT NULL DEFAULT 'pendiente',
  `fecha_retiro`       DATETIME       NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_devolucion`   DATETIME       NULL,
  `createdAt`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idretiro`),
  CONSTRAINT `fk_retiro_barberia` FOREIGN KEY (`idbarberia`)        REFERENCES `empresa_barberia`(`idbarberia`) ON DELETE RESTRICT,
  CONSTRAINT `fk_retiro_barbero`  FOREIGN KEY (`idusuario_barbero`) REFERENCES `usuario`(`idusuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
