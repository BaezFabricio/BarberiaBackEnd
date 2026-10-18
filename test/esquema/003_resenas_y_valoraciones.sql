CREATE TABLE IF NOT EXISTS resenas_barberia (
  idresena        INT AUTO_INCREMENT PRIMARY KEY,
  idbarberia      INT NOT NULL,
  estrellas       INT NOT NULL,
  comentario      TEXT,
  nombre_cliente  VARCHAR(100),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_resenas_barberia (idbarberia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS valoraciones_barberos (
  idvaloracion       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  idbarberia         INT,
  idusuario_barbero  INT NOT NULL,
  idagenda           INT UNIQUE,
  estrellas          INT CHECK (estrellas BETWEEN 1 AND 5),
  comentario         TEXT,
  nombre_cliente     VARCHAR(100),
  token              VARCHAR(64) UNIQUE,
  token_usado        TINYINT(1) DEFAULT 0,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_valoraciones_barbero (idusuario_barbero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
