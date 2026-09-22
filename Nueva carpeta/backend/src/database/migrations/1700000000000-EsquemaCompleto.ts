import { MigrationInterface, QueryRunner } from 'typeorm';

export class EsquemaCompleto1700000000000 implements MigrationInterface {
  name = 'EsquemaCompleto1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── USUARIOS ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE usuarios (
        id                VARCHAR(36)  NOT NULL DEFAULT (UUID()),
        nombre            VARCHAR(150) NOT NULL,
        correo            VARCHAR(100) NOT NULL,
        contrasena_hash   VARCHAR(255) NOT NULL,
        rol               ENUM('ADMIN','CAJERO','AUTORIZADOR','COBRADOR') NOT NULL DEFAULT 'CAJERO',
        activo            TINYINT(1)   NOT NULL DEFAULT 1,
        ultimo_acceso     DATETIME     NULL,
        token_refresco    TEXT         NULL,
        token_reset       VARCHAR(255) NULL,
        expira_reset      DATETIME     NULL,
        creado_en         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_usuario_correo (correo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── ESTADOS ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE estados (
        id     SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
        clave  VARCHAR(5)   NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_estado_clave (clave)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── MUNICIPIOS ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE municipios (
        id        SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
        estado_id SMALLINT UNSIGNED NOT NULL,
        nombre    VARCHAR(150) NOT NULL,
        PRIMARY KEY (id),
        KEY idx_mun_estado (estado_id),
        CONSTRAINT fk_mun_estado FOREIGN KEY (estado_id) REFERENCES estados(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── CLIENTES ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE clientes (
        id              VARCHAR(36)    NOT NULL DEFAULT (UUID()),
        curp            VARCHAR(18)    NOT NULL,
        rfc             VARCHAR(13)    NULL,
        nombre_completo VARCHAR(150)   NOT NULL,
        telefono        VARCHAR(15)    NOT NULL,
        correo          VARCHAR(100)   NULL,
        fecha_nacimiento DATE          NULL,
        domicilio       JSON           NULL,
        referencias     JSON           NULL,
        estado_id       SMALLINT UNSIGNED NULL,
        municipio_id    SMALLINT UNSIGNED NULL,
        estatus         ENUM('ACTIVO','INACTIVO','LISTA_NEGRA') NOT NULL DEFAULT 'ACTIVO',
        ocupacion       VARCHAR(100)   NULL,
        ingreso_mensual DECIMAL(12,2)  NULL,
        giro_negocio    VARCHAR(100)   NULL COMMENT 'Catálogo de giro de negocio',
        giro_otro       VARCHAR(150)   NULL COMMENT 'Giro personalizado cuando es Otro',
        foto_ruta       VARCHAR(500)   NULL COMMENT 'Ruta de la foto del cliente',
        notas           TEXT           NULL,
        creado_por      VARCHAR(36)    NULL,
        creado_en       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_cliente_curp (curp),
        CONSTRAINT fk_cliente_estado     FOREIGN KEY (estado_id)    REFERENCES estados(id),
        CONSTRAINT fk_cliente_municipio  FOREIGN KEY (municipio_id) REFERENCES municipios(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── DOCUMENTOS DEL CLIENTE ────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE documentos_cliente (
        id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
        cliente_id      VARCHAR(36)  NOT NULL,
        tipo_documento  VARCHAR(50)  NOT NULL,
        ruta_archivo    VARCHAR(500) NOT NULL,
        nombre_original VARCHAR(255) NOT NULL,
        subido_por      VARCHAR(36)  NOT NULL,
        creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_doc_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── TIPOS DE PRÉSTAMO ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE tipos_prestamo (
        id                   VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        nombre               VARCHAR(100)  NOT NULL,
        tasa_default         DECIMAL(6,4)  NOT NULL,
        tasa_minima          DECIMAL(6,4)  NOT NULL,
        tasa_maxima          DECIMAL(6,4)  NOT NULL,
        monto_minimo         DECIMAL(12,2) NOT NULL,
        monto_maximo         DECIMAL(12,2) NOT NULL,
        plazo_minimo_semanas INT           NOT NULL DEFAULT 1,
        plazo_maximo_semanas INT           NOT NULL DEFAULT 52,
        frecuencia           VARCHAR(20)   NOT NULL DEFAULT 'SEMANAL',
        dias_periodo         INT           NOT NULL DEFAULT 7,
        unidad_periodo       VARCHAR(20)   NOT NULL DEFAULT 'SEMANAS',
        dias_gracia          INT           NOT NULL DEFAULT 0,
        activo               TINYINT(1)    NOT NULL DEFAULT 1,
        creado_en            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── PRÉSTAMOS ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE prestamos (
        id                    VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        cliente_id            VARCHAR(36)   NOT NULL,
        tipo_prestamo_id      VARCHAR(36)   NOT NULL,
        prestamo_padre_id     VARCHAR(36)   NULL,
        monto_principal       DECIMAL(12,2) NOT NULL,
        tasa_interes          DECIMAL(6,4)  NOT NULL,
        plazo_semanas         INT           NOT NULL,
        frecuencia            VARCHAR(20)   NOT NULL DEFAULT 'SEMANAL',
        estatus               ENUM('SOLICITUD','AUTORIZADO','RECHAZADO','ACTIVO','VENCIDO','REESTRUCTURADO','LIQUIDADO','CASTIGADO') NOT NULL DEFAULT 'SOLICITUD',
        monto_total           DECIMAL(12,2) NULL,
        pago_periodico        DECIMAL(12,2) NULL,
        autorizado_por        VARCHAR(36)   NULL,
        autorizado_en         DATETIME      NULL,
        razon_rechazo         TEXT          NULL,
        desembolsado_en       DATETIME      NULL,
        forma_desembolso      VARCHAR(50)   NULL,
        desembolsado_por      VARCHAR(36)   NULL,
        razon_reestructura    TEXT          NULL,
        contador_reestructuras INT          NOT NULL DEFAULT 0,
        cobrador_id           VARCHAR(36)   NULL,
        notas                 TEXT          NULL,
        creado_por            VARCHAR(36)   NULL,
        creado_en             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_prestamo_cliente    FOREIGN KEY (cliente_id)       REFERENCES clientes(id),
        CONSTRAINT fk_prestamo_tipo       FOREIGN KEY (tipo_prestamo_id) REFERENCES tipos_prestamo(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── AVALES ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE avales (
        id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        prestamo_id     VARCHAR(36)   NOT NULL,
        nombre_completo VARCHAR(150)  NOT NULL,
        curp            VARCHAR(18)   NOT NULL,
        rfc             VARCHAR(13)   NULL,
        telefono        VARCHAR(15)   NOT NULL,
        correo          VARCHAR(100)  NULL,
        fecha_nacimiento DATE         NULL,
        domicilio       TEXT          NULL,
        ocupacion       VARCHAR(100)  NULL,
        ingreso_mensual DECIMAL(12,2) NULL,
        parentesco      VARCHAR(80)   NULL,
        creado_por      VARCHAR(36)   NULL,
        creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_aval_prestamo (prestamo_id),
        CONSTRAINT fk_aval_prestamo FOREIGN KEY (prestamo_id) REFERENCES prestamos(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── CALENDARIO DE PAGOS ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE calendario_pagos (
        id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        prestamo_id     VARCHAR(36)   NOT NULL,
        numero_periodo  INT           NOT NULL,
        fecha_vencimiento DATE        NOT NULL,
        capital_adeudado  DECIMAL(12,2) NOT NULL,
        interes_adeudado  DECIMAL(12,2) NOT NULL,
        total_adeudado    DECIMAL(12,2) NOT NULL,
        saldo_adeudado    DECIMAL(12,2) NOT NULL,
        interes_moratorio DECIMAL(12,2) NOT NULL DEFAULT 0,
        estatus         ENUM('PENDIENTE','PAGADO','PARCIAL','VENCIDO') NOT NULL DEFAULT 'PENDIENTE',
        pagado_en       DATETIME      NULL,
        actualizado_en  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_cal_prestamo (prestamo_id),
        CONSTRAINT fk_cal_prestamo FOREIGN KEY (prestamo_id) REFERENCES prestamos(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── SESIONES DE CAJA ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE sesiones_caja (
        id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        cajero_id       VARCHAR(36)   NOT NULL,
        saldo_apertura  DECIMAL(12,2) NOT NULL,
        saldo_cierre    DECIMAL(12,2) NULL,
        abierta_en      DATETIME      NOT NULL,
        cerrada_en      DATETIME      NULL,
        notas           TEXT          NULL,
        creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── PAGOS ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE pagos (
        id                 VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        prestamo_id        VARCHAR(36)   NOT NULL,
        cobrador_id        VARCHAR(36)   NULL,
        sesion_caja_id     VARCHAR(36)   NULL,
        monto_pagado       DECIMAL(12,2) NOT NULL,
        capital_aplicado   DECIMAL(12,2) NOT NULL DEFAULT 0,
        interes_aplicado   DECIMAL(12,2) NOT NULL DEFAULT 0,
        moratorio_aplicado DECIMAL(12,2) NOT NULL DEFAULT 0,
        fecha_pago         DATE          NOT NULL,
        forma_pago         ENUM('EFECTIVO','TRANSFERENCIA','TARJETA') NOT NULL DEFAULT 'EFECTIVO',
        fuente             ENUM('CAJA','COBRADOR','TRANSFERENCIA')    NOT NULL DEFAULT 'CAJA',
        referencia         VARCHAR(100)  NULL,
        numero_comprobante VARCHAR(20)   NULL,
        geolocalizacion    VARCHAR(100)  NULL,
        id_local           VARCHAR(100)  NULL,
        estatus_sync       ENUM('PENDIENTE','SYNCED','ERROR')         NOT NULL DEFAULT 'SYNCED',
        notas              TEXT          NULL,
        creado_por         VARCHAR(36)   NOT NULL,
        creado_en          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_pago_prestamo (prestamo_id),
        CONSTRAINT fk_pago_prestamo FOREIGN KEY (prestamo_id) REFERENCES prestamos(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── VISITAS DE COBRANZA ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE visitas_cobranza (
        id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
        prestamo_id     VARCHAR(36)  NOT NULL,
        cobrador_id     VARCHAR(36)  NOT NULL,
        tipo_visita     VARCHAR(50)  NOT NULL,
        resultado       VARCHAR(100) NULL,
        notas           TEXT         NULL,
        geolocalizacion VARCHAR(100) NULL,
        visitado_en     DATETIME     NOT NULL,
        creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── ASIGNACIONES DE COBRADOR ──────────────────────────────
    await queryRunner.query(`
      CREATE TABLE asignaciones_cobrador (
        id           VARCHAR(36) NOT NULL DEFAULT (UUID()),
        cobrador_id  VARCHAR(36) NOT NULL,
        prestamo_id  VARCHAR(36) NOT NULL,
        asignado_en  DATETIME    NOT NULL,
        activo       TINYINT(1)  NOT NULL DEFAULT 1,
        creado_en    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── BITÁCORA DE AUDITORÍA ─────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE bitacora_auditoria (
        id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
        usuario_id      VARCHAR(36)  NULL,
        accion          VARCHAR(100) NOT NULL,
        entidad         VARCHAR(100) NOT NULL,
        entidad_id      VARCHAR(36)  NULL,
        datos_anteriores JSON        NULL,
        datos_nuevos     JSON        NULL,
        ip_address      VARCHAR(45)  NULL,
        creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── CONFIGURACIÓN DE LA EMPRESA ───────────────────────────
    await queryRunner.query(`
      CREATE TABLE configuracion_empresa (
        id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
        nombre          VARCHAR(150) NOT NULL,
        rfc             VARCHAR(13)  NULL,
        domicilio       TEXT         NULL,
        telefono        VARCHAR(20)  NULL,
        correo          VARCHAR(100) NULL,
        sitio_web       VARCHAR(200) NULL,
        ruta_logo       VARCHAR(500) NULL,
        regimen_fiscal  VARCHAR(100) NULL,
        ciudad          VARCHAR(100) NULL,
        estado          VARCHAR(100) NULL,
        codigo_postal   VARCHAR(10)  NULL,
        pie_legal       TEXT         NULL,
        creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── REGLAS DE MORATORIO ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE reglas_moratorio (
        id               VARCHAR(36)  NOT NULL DEFAULT (UUID()),
        tipo_prestamo_id VARCHAR(36)  NOT NULL,
        dia_desde        INT          NOT NULL,
        dia_hasta        INT          NULL,
        tipo_cargo       ENUM('FIJO','PORCENTAJE') NOT NULL DEFAULT 'FIJO',
        importe          DECIMAL(10,4) NOT NULL,
        dias_gracia      INT          NOT NULL DEFAULT 0,
        activo           TINYINT(1)   NOT NULL DEFAULT 1,
        descripcion      VARCHAR(200) NULL,
        creado_en        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_moratorio_tipo FOREIGN KEY (tipo_prestamo_id) REFERENCES tipos_prestamo(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── CATEGORÍAS DE GASTO ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE categorias_gasto (
        id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
        nombre      VARCHAR(100) NOT NULL,
        descripcion TEXT         NULL,
        activo      TINYINT(1)   NOT NULL DEFAULT 1,
        creado_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── GASTOS OPERATIVOS ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE gastos (
        id               VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        categoria_id     VARCHAR(36)   NOT NULL,
        sesion_caja_id   VARCHAR(36)   NULL,
        monto            DECIMAL(12,2) NOT NULL,
        descripcion      TEXT          NOT NULL,
        fecha_gasto      DATE          NOT NULL,
        forma_pago       ENUM('EFECTIVO','TRANSFERENCIA','TARJETA') NOT NULL DEFAULT 'EFECTIVO',
        comprobante_ruta VARCHAR(500)  NULL,
        registrado_por   VARCHAR(36)   NOT NULL,
        creado_en        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_gasto_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_gasto(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── SECUENCIA PARA FOLIOS DE COMPROBANTE ──────────────────
    await queryRunner.query(`
      CREATE TABLE secuencia_comprobantes (
        id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
        dummy TINYINT(1) DEFAULT 1,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB
    `);

    // ── DATOS INICIALES ───────────────────────────────────────
    // Empresa por defecto
    await queryRunner.query(`
      INSERT INTO configuracion_empresa (nombre, pie_legal)
      VALUES ('Mi Empresa Microfinanciera', 'Este documento es un comprobante válido de operación financiera.')
    `);

    // Categorías de gasto iniciales
    await queryRunner.query(`
      INSERT INTO categorias_gasto (nombre, descripcion) VALUES
      ('Renta', 'Pago de renta del local u oficina'),
      ('Servicios', 'Luz, agua, internet, teléfono'),
      ('Papelería', 'Material de oficina y papelería'),
      ('Viáticos', 'Gastos de traslado y comidas de cobranza'),
      ('Nómina', 'Pago de sueldos y salarios'),
      ('Mantenimiento', 'Mantenimiento de equipo e instalaciones'),
      ('Publicidad', 'Gastos de publicidad y marketing'),
      ('Otros', 'Gastos no clasificados en otras categorías')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'secuencia_comprobantes', 'gastos', 'categorias_gasto',
      'reglas_moratorio', 'configuracion_empresa', 'bitacora_auditoria',
      'asignaciones_cobrador', 'visitas_cobranza', 'pagos', 'sesiones_caja',
      'calendario_pagos', 'avales', 'prestamos', 'tipos_prestamo',
      'documentos_cliente', 'clientes', 'municipios', 'estados', 'usuarios',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${t}`);
    }
  }
}
