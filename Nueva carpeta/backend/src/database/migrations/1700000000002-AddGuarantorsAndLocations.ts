import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGuarantorsAndLocations1700000000002 implements MigrationInterface {
  name = 'AddGuarantorsAndLocations1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {

    // ─── STATES ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS states (
        id   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
        code VARCHAR(5)   NOT NULL,
        name VARCHAR(100) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_state_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── MUNICIPALITIES ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS municipalities (
        id       SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
        state_id SMALLINT UNSIGNED NOT NULL,
        name     VARCHAR(150) NOT NULL,
        PRIMARY KEY (id),
        KEY idx_mun_state (state_id),
        CONSTRAINT fk_mun_state FOREIGN KEY (state_id) REFERENCES states(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── GUARANTORS ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE guarantors (
        id             VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        loan_id        VARCHAR(36)   NOT NULL,
        full_name      VARCHAR(150)  NOT NULL,
        curp           VARCHAR(18)   NOT NULL,
        rfc            VARCHAR(13)   NULL,
        phone          VARCHAR(15)   NOT NULL,
        email          VARCHAR(100)  NULL,
        birth_date     DATE          NULL,
        address        TEXT          NULL,
        occupation     VARCHAR(100)  NULL,
        monthly_income DECIMAL(12,2) NULL,
        relationship   VARCHAR(80)   NULL,
        created_by     VARCHAR(36)   NULL,
        created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_guarantor_loan (loan_id),
        CONSTRAINT fk_guarantor_loan FOREIGN KEY (loan_id) REFERENCES loans(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`CREATE INDEX idx_guarantors_loan ON guarantors(loan_id)`);

    // ─── ACTUALIZAR customers: agregar state_id y municipality_id ──
    await queryRunner.query(`
      ALTER TABLE customers
        ADD COLUMN state_id        SMALLINT UNSIGNED NULL,
        ADD COLUMN municipality_id SMALLINT UNSIGNED NULL,
        ADD CONSTRAINT fk_customer_state FOREIGN KEY (state_id) REFERENCES states(id),
        ADD CONSTRAINT fk_customer_mun   FOREIGN KEY (municipality_id) REFERENCES municipalities(id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE customers DROP FOREIGN KEY fk_customer_mun, DROP FOREIGN KEY fk_customer_state, DROP COLUMN municipality_id, DROP COLUMN state_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS guarantors`);
    await queryRunner.query(`DROP TABLE IF EXISTS municipalities`);
    await queryRunner.query(`DROP TABLE IF EXISTS states`);
  }
}
