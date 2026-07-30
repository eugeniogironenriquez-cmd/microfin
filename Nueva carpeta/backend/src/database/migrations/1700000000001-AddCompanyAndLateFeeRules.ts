import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyAndLateFeeRules1700000000001 implements MigrationInterface {
  name = 'AddCompanyAndLateFeeRules1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {

    // ─── COMPANY SETTINGS ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE company_settings (
        id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        name          VARCHAR(150)  NOT NULL,
        rfc           VARCHAR(13)   NULL,
        address       TEXT          NULL,
        phone         VARCHAR(20)   NULL,
        email         VARCHAR(100)  NULL,
        website       VARCHAR(200)  NULL,
        logo_path     VARCHAR(500)  NULL,
        fiscal_regime VARCHAR(100)  NULL,
        city          VARCHAR(100)  NULL,
        state         VARCHAR(100)  NULL,
        zip           VARCHAR(10)   NULL,
        legal_footer  TEXT          NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Insertar registro inicial
    await queryRunner.query(`
      INSERT INTO company_settings (name, legal_footer)
      VALUES ('Mi Empresa Microfinanciera', 'Este documento es un comprobante válido de operación financiera.')
    `);

    // ─── LATE FEE RULES ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE late_fee_rules (
        id           VARCHAR(36)    NOT NULL DEFAULT (UUID()),
        loan_type_id VARCHAR(36)    NOT NULL,
        day_from     INT            NOT NULL,
        day_to       INT            NULL COMMENT 'NULL = sin límite superior',
        charge_type  ENUM('FIJO','PORCENTAJE') NOT NULL DEFAULT 'FIJO',
        amount       DECIMAL(10,4)  NOT NULL,
        grace_days   INT            NOT NULL DEFAULT 0,
        is_active    TINYINT(1)     NOT NULL DEFAULT 1,
        description  VARCHAR(200)   NULL,
        created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_late_fee_loan_type FOREIGN KEY (loan_type_id) REFERENCES loan_types(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`CREATE INDEX idx_late_fee_rules_type ON late_fee_rules(loan_type_id, is_active)`);

    // ─── ACTUALIZAR loan_types: periodicidad en días ──────────
    // Agregar columna period_days (número real de días entre pagos)
    await queryRunner.query(`
      ALTER TABLE loan_types
        ADD COLUMN period_days INT NOT NULL DEFAULT 7 COMMENT 'Días entre cada pago (7=semanal, 15=quincenal, 30=mensual)',
        ADD COLUMN period_unit ENUM('DIAS','SEMANAS','MESES') NOT NULL DEFAULT 'SEMANAS'
    `);

    // Migrar datos existentes
    await queryRunner.query(`UPDATE loan_types SET period_days = 7,  period_unit = 'SEMANAS' WHERE frequency = 'SEMANAL'`);
    await queryRunner.query(`UPDATE loan_types SET period_days = 15, period_unit = 'DIAS'    WHERE frequency = 'QUINCENAL'`);
    await queryRunner.query(`UPDATE loan_types SET period_days = 30, period_unit = 'MESES'   WHERE frequency = 'MENSUAL'`);

    // ─── TABLA DE PAGOS: agregar referencia al comprobante ────
    await queryRunner.query(`
      ALTER TABLE payments
        ADD COLUMN receipt_number VARCHAR(20) NULL COMMENT 'Folio del comprobante de pago'
    `);

    // Auto-incremento para folios de comprobante
    await queryRunner.query(`
      CREATE TABLE payment_receipt_sequence (
        id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
        dummy     TINYINT(1) DEFAULT 1,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payment_receipt_sequence`);
    await queryRunner.query(`ALTER TABLE payments DROP COLUMN receipt_number`);
    await queryRunner.query(`ALTER TABLE loan_types DROP COLUMN period_days, DROP COLUMN period_unit`);
    await queryRunner.query(`DROP TABLE IF EXISTS late_fee_rules`);
    await queryRunner.query(`DROP TABLE IF EXISTS company_settings`);
  }
}
