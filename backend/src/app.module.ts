import { Module, OnApplicationBootstrap, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuleRef } from '@nestjs/core';
import { join } from 'path';
import {
  User, Customer, CustomerDocument, LoanType, Loan,
  PaymentSchedule, Payment, CollectionVisit, CollectorAssignment,
  CashSession, AuditLog, CompanySettings, LateFeeRule,
  State, Municipality, Guarantor, ExpenseCategory, Expense,
  Role, Permiso, PlazoCredito, ConfigMora,
  ConfigSemaforo, HistorialComportamiento,
} from './common/entities';
import { AuthModule }        from './auth/auth.module';
import { UsersModule }       from './users/users.module';
import { RolesModule }       from './roles/roles.module';
import { CustomersModule }   from './customers/customers.module';
import { LoansModule }       from './loans/loans.module';
import { PaymentsModule }    from './payments/payments.module';
import { CashModule }        from './cash/cash.module';
import { CollectionModule }  from './collection/collection.module';
import { ReportsModule }     from './reports/reports.module';
import { SettingsModule }    from './settings/settings.module';
import { RateRangesModule }  from './common/modules';
import { CompanyModule }     from './company/company.module';
import { LateFeeRulesModule }from './late-fee-rules/late-fee-rules.module';
import { LocationModule }    from './location/location.module';
import { GuarantorModule }   from './guarantor/guarantor.module';
import { DisbursementModule }from './disbursement/disbursement.module';
import { ExpensesModule }    from './expenses/expenses.module';
import { OverdueJobModule, OverdueJobService } from './jobs/overdue-job.module';
import { LoanDocumentsModule } from './loan-documents/loan-documents.module';
import { PlazosCreditoModule } from './plazos-credito/plazos-credito.module';
import { ConfigMoraModule } from './config-mora/config-mora.module';
import { SemaforoModule } from './semaforo/semaforo.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host:     config.get('DB_HOST', 'localhost'),
        port:     config.get<number>('DB_PORT', 3306),
        username: config.get('DB_USER', 'root'),
        password: config.get('DB_PASSWORD', '12345678'),
        database: config.get('DB_NAME', 'microfin'),
        charset:  'utf8mb4',
        entities: [
          User, Customer, CustomerDocument, LoanType, Loan,
          PaymentSchedule, Payment, CollectionVisit, CollectorAssignment,
          CashSession, AuditLog, CompanySettings, LateFeeRule,
          State, Municipality, Guarantor, ExpenseCategory, Expense,
          Role, Permiso, PlazoCredito, ConfigMora,
          ConfigSemaforo, HistorialComportamiento,
        ],
        synchronize: false,
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    AuthModule, UsersModule, RolesModule, CustomersModule, LoansModule, PaymentsModule,
    CashModule, CollectionModule, ReportsModule, SettingsModule, RateRangesModule,
    CompanyModule, LateFeeRulesModule, LocationModule, GuarantorModule,
    DisbursementModule, ExpensesModule, OverdueJobModule, LoanDocumentsModule,
    PlazosCreditoModule, ConfigMoraModule, SemaforoModule,
  ],
})
export class AppModule implements OnApplicationBootstrap, NestModule {
  constructor(private moduleRef: ModuleRef) {}

  // Corre al arrancar el servidor
  async onApplicationBootstrap() {
    try {
      const svc = this.moduleRef.get(OverdueJobService, { strict: false });
      const result = await svc.markOverdueLoans();
      console.log(`[OverdueJob] Inicio: ${result.marked} marcados vencidos, ${result.restored} restaurados`);
    } catch (e: any) {
      console.warn('[OverdueJob] Error al iniciar:', e.message);
    }
  }

  // Middleware que corre el job una vez por día con cada petición
  configure(consumer: MiddlewareConsumer) {
    const moduleRef = this.moduleRef;
    consumer.apply(async (req: any, res: any, next: () => void) => {
      try {
        const svc = moduleRef.get(OverdueJobService, { strict: false });
        svc.runIfNeeded().catch(() => {}); // fire and forget
      } catch {}
      next();
    }).forRoutes('*');
  }
}