import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {

    // ─── USERS ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE users (
        id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        name          VARCHAR(150)  NOT NULL,
        email         VARCHAR(100)  NOT NULL,
        password_hash VARCHAR(255)  NOT NULL,
        role          ENUM('ADMIN','CAJERO','AUTORIZADOR','COBRADOR') NOT NULL DEFAULT 'CAJERO',
        is_active     TINYINT(1)    NOT NULL DEFAULT 1,
        last_login_at DATETIME      NULL,
        refresh_token_hash       VARCHAR(255) NULL,
        password_reset_token     VARCHAR(255) NULL,
        password_reset_expires   DATETIME     NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at    DATETIME      NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`CREATE INDEX idx_users_role ON users(role)`);

    // ─── CUSTOMERS ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE customers (
        id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        curp            VARCHAR(18)   NOT NULL,
        rfc             VARCHAR(13)   NULL,
        full_name       VARCHAR(150)  NOT NULL,
        phone           VARCHAR(15)   NOT NULL,
        email           VARCHAR(100)  NULL,
        birth_date      DATE          NULL,
        address         JSON          NULL,
        customer_refs   JSON          NULL COMMENT 'referencias del cliente',
        status          ENUM('ACTIVO','INACTIVO','BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
        occupation      VARCHAR(100)  NULL,
        monthly_income  DECIMAL(12,2) NULL,
        notes           TEXT          NULL,
        created_by      VARCHAR(36)   NULL,
        created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at      DATETIME      NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_customers_curp  (curp),
        UNIQUE KEY uq_customers_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`CREATE INDEX idx_customers_rfc     ON customers(rfc)`);
    await queryRunner.query(`CREATE INDEX idx_customers_name    ON customers(full_name)`);
    await queryRunner.query(`CREATE INDEX idx_customers_status  ON customers(status)`);

    // ─── CUSTOMER DOCUMENTS ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE customer_documents (
        id            VARCHAR(36)  NOT NULL DEFAULT (UUID()),
        customer_id   VARCHAR(36)  NOT NULL,
        doc_type      VARCHAR(50)  NOT NULL,
        file_path     TEXT         NOT NULL,
        original_name TEXT         NOT NULL,
        uploaded_by   VARCHAR(36)  NOT NULL,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_docs_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`CREATE INDEX idx_customer_docs ON customer_documents(customer_id)`);

    // ─── LOAN TYPES ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE loan_types (
        id                    VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        name                  VARCHAR(100)  NOT NULL,
        default_rate          DECIMAL(6,4)  NOT NULL,
        min_rate              DECIMAL(6,4)  NOT NULL,
        max_rate              DECIMAL(6,4)  NOT NULL,
        min_amount            DECIMAL(12,2) NOT NULL,
        max_amount            DECIMAL(12,2) NOT NULL,
        min_term_weeks        INT           NOT NULL,
        max_term_weeks        INT           NOT NULL,
        frequency             VARCHAR(20)   NOT NULL DEFAULT 'SEMANAL',
        late_fee_factor       DECIMAL(4,2)  NOT NULL DEFAULT 1.5,
        grace_days            INT           NOT NULL DEFAULT 0,
        late_fee_type         VARCHAR(20)   NOT NULL DEFAULT 'DIARIO',
        late_fee_rate_basis   VARCHAR(20)   NOT NULL DEFAULT 'PERIODICA',
        late_fee_rate         DECIMAL(6,4)  NULL,
        late_fee_fixed_amount DECIMAL(12,2) NULL,
        is_active             TINYINT(1)    NOT NULL DEFAULT 1,
        created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── LOANS ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE loans (
        id                  VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        customer_id         VARCHAR(36)   NOT NULL,
        loan_type_id        VARCHAR(36)   NOT NULL,
        parent_loan_id      VARCHAR(36)   NULL,
        principal_amount    DECIMAL(12,2) NOT NULL,
        interest_rate       DECIMAL(6,4)  NOT NULL,
        term_weeks          INT           NOT NULL,
        frequency           VARCHAR(20)   NOT NULL DEFAULT 'SEMANAL',
        status              ENUM('SOLICITUD','AUTORIZADO','RECHAZADO','ACTIVO','VENCIDO','REESTRUCTURADO','LIQUIDADO','CASTIGADO') NOT NULL DEFAULT 'SOLICITUD',
        total_amount        DECIMAL(12,2) NULL,
        periodic_payment    DECIMAL(12,2) NULL,
        authorized_by       VARCHAR(36)   NULL,
        authorized_at       DATETIME      NULL,
        rejection_reason    TEXT          NULL,
        disbursed_by        VARCHAR(36)   NULL,
        disbursed_at        DATETIME      NULL,
        disbursement_method VARCHAR(50)   NULL,
        restructure_reason  TEXT          NULL,
        restructure_count   INT           NOT NULL DEFAULT 0,
        restructured_at     DATETIME      NULL,
        collector_id        VARCHAR(36)   NULL,
        created_by          VARCHAR(36)   NULL,
        notes               TEXT          NULL,
        created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_loans_customer  FOREIGN KEY (customer_id)    REFERENCES customers(id),
        CONSTRAINT fk_loans_type      FOREIGN KEY (loan_type_id)   REFERENCES loan_types(id),
        CONSTRAINT fk_loans_parent    FOREIGN KEY (parent_loan_id) REFERENCES loans(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`CREATE INDEX idx_loans_customer_status ON loans(customer_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_loans_status          ON loans(status)`);
    await queryRunner.query(`CREATE INDEX idx_loans_parent          ON loans(parent_loan_id)`);
    await queryRunner.query(`CREATE INDEX idx_loans_collector       ON loans(collector_id)`);
    await queryRunner.query(`CREATE INDEX idx_loans_disbursed       ON loans(disbursed_at)`);

    // ─── PAYMENT SCHEDULES ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE payment_schedules (
        id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        loan_id       VARCHAR(36)   NOT NULL,
        period_number INT           NOT NULL,
        due_date      DATE          NOT NULL,
        principal_due DECIMAL(12,2) NOT NULL,
        interest_due  DECIMAL(12,2) NOT NULL,
        total_due     DECIMAL(12,2) NOT NULL,
        balance_due   DECIMAL(12,2) NOT NULL,
        late_interest DECIMAL(12,2) NOT NULL DEFAULT 0,
        status        ENUM('PENDIENTE','PAGADO','PARCIAL','VENCIDO') NOT NULL DEFAULT 'PENDIENTE',
        paid_at       DATETIME      NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_schedule_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`CREATE INDEX idx_schedules_loan        ON payment_schedules(loan_id)`);
    await queryRunner.query(`CREATE INDEX idx_schedules_due         ON payment_schedules(due_date, status)`);
    await queryRunner.query(`CREATE INDEX idx_schedules_loan_period ON payment_schedules(loan_id, period_number)`);

    // ─── PAYMENTS ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE payments (
        id                    VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        loan_id               VARCHAR(36)   NOT NULL,
        collector_id          VARCHAR(36)   NULL,
        cash_session_id       VARCHAR(36)   NULL,
        amount_paid           DECIMAL(12,2) NOT NULL,
        capital_applied       DECIMAL(12,2) NOT NULL DEFAULT 0,
        interest_applied      DECIMAL(12,2) NOT NULL DEFAULT 0,
        late_interest_applied DECIMAL(12,2) NOT NULL DEFAULT 0,
        payment_date          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        method      ENUM('EFECTIVO','TRANSFERENCIA','TARJETA') NOT NULL DEFAULT 'EFECTIVO',
        source      ENUM('CAJA','COBRADOR','TRANSFERENCIA')    NOT NULL DEFAULT 'CAJA',
        reference             VARCHAR(100)  NULL,
        geolocation           VARCHAR(50)   NULL,
        sync_status ENUM('SYNCED','PENDING','CONFLICT')        NOT NULL DEFAULT 'SYNCED',
        local_id              VARCHAR(100)  NULL,
        notes                 TEXT          NULL,
        created_by            VARCHAR(36)   NOT NULL,
        created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_payments_loan FOREIGN KEY (loan_id) REFERENCES loans(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`CREATE INDEX idx_payments_loan     ON payments(loan_id, payment_date)`);
    await queryRunner.query(`CREATE INDEX idx_payments_date     ON payments(payment_date)`);
    await queryRunner.query(`CREATE INDEX idx_payments_local_id ON payments(local_id)`);

    // ─── COLLECTION VISITS ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE collection_visits (
        id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        loan_id         VARCHAR(36)   NOT NULL,
        collector_id    VARCHAR(36)   NOT NULL,
        type ENUM('NO_LOCALIZADO','PROMESA_PAGO','PAGO_RECIBIDO','RECHAZO') NOT NULL,
        promised_amount DECIMAL(12,2) NULL,
        promised_date   DATE          NULL,
        notes           TEXT          NULL,
        geolocation     VARCHAR(50)   NULL,
        sync_status ENUM('SYNCED','PENDING','CONFLICT') NOT NULL DEFAULT 'SYNCED',
        visited_at      DATETIME      NOT NULL,
        created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_visits_loan      FOREIGN KEY (loan_id)      REFERENCES loans(id),
        CONSTRAINT fk_visits_collector FOREIGN KEY (collector_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`CREATE INDEX idx_visits_loan      ON collection_visits(loan_id)`);
    await queryRunner.query(`CREATE INDEX idx_visits_collector ON collection_visits(collector_id, visited_at)`);

    // ─── COLLECTOR ASSIGNMENTS ────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE collector_assignments (
        id            VARCHAR(36)  NOT NULL DEFAULT (UUID()),
        collector_id  VARCHAR(36)  NOT NULL,
        loan_id       VARCHAR(36)  NOT NULL,
        assigned_date DATE         NOT NULL,
        assigned_by   VARCHAR(36)  NOT NULL,
        is_active     TINYINT(1)   NOT NULL DEFAULT 1,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_assign_collector FOREIGN KEY (collector_id) REFERENCES users(id),
        CONSTRAINT fk_assign_loan      FOREIGN KEY (loan_id)      REFERENCES loans(id),
        CONSTRAINT fk_assign_by        FOREIGN KEY (assigned_by)  REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`CREATE INDEX idx_assignments_date ON collector_assignments(collector_id, assigned_date)`);

    // ─── CASH SESSIONS ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE cash_sessions (
        id               VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        user_id          VARCHAR(36)   NOT NULL,
        opening_balance  DECIMAL(12,2) NOT NULL,
        closing_balance  DECIMAL(12,2) NULL,
        expected_balance DECIMAL(12,2) NULL,
        difference       DECIMAL(12,2) NULL,
        opened_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_at        DATETIME      NULL,
        notes            TEXT          NULL,
        created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_cash_user FOREIGN KEY (user_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`CREATE INDEX idx_cash_user ON cash_sessions(user_id, opened_at)`);

    // ─── AUDIT LOGS ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id     VARCHAR(36)  NULL,
        user_email  VARCHAR(100) NULL,
        action      VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50)  NOT NULL,
        entity_id   VARCHAR(36)  NULL,
        old_values  JSON         NULL,
        new_values  JSON         NULL,
        ip_address  VARCHAR(45)  NULL,
        user_agent  TEXT         NULL,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id)`);
    await queryRunner.query(`CREATE INDEX idx_audit_user   ON audit_logs(user_id)`);
    await queryRunner.query(`CREATE INDEX idx_audit_date   ON audit_logs(created_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS cash_sessions`);
    await queryRunner.query(`DROP TABLE IF EXISTS collector_assignments`);
    await queryRunner.query(`DROP TABLE IF EXISTS collection_visits`);
    await queryRunner.query(`DROP TABLE IF EXISTS payments`);
    await queryRunner.query(`DROP TABLE IF EXISTS payment_schedules`);
    await queryRunner.query(`DROP TABLE IF EXISTS loans`);
    await queryRunner.query(`DROP TABLE IF EXISTS loan_types`);
    await queryRunner.query(`DROP TABLE IF EXISTS customer_documents`);
    await queryRunner.query(`DROP TABLE IF EXISTS customers`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
