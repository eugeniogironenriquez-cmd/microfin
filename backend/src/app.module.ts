import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ModuleRef } from '@nestjs/core';
import { join } from 'path';
import {
  User, Customer, CustomerDocument, LoanType, Loan,
  PaymentSchedule, Payment, CollectionVisit, CollectorAssignment,
  CashSession, AuditLog, CompanySettings, LateFeeRule,
  State, Municipality, Guarantor, ExpenseCategory, Expense,
} from './common/entities';
import { AuthModule }        from './auth/auth.module';
import { UsersModule }       from './users/users.module';
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
        ],
        synchronize: false,
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    AuthModule, UsersModule, CustomersModule, LoansModule, PaymentsModule,
    CashModule, CollectionModule, ReportsModule, SettingsModule, RateRangesModule,
    CompanyModule, LateFeeRulesModule, LocationModule, GuarantorModule,
    DisbursementModule, ExpensesModule, OverdueJobModule,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private moduleRef: ModuleRef) {}

  async onApplicationBootstrap() {
    try {
      const svc = this.moduleRef.get(OverdueJobService, { strict: false });
      const result = await svc.markOverdueLoans();
      console.log(`[OverdueJob] Inicio: ${result.marked} marcados vencidos, ${result.restored} restaurados`);
    } catch (e: any) {
      console.warn('[OverdueJob] Error al iniciar:', e.message);
    }
  }
}