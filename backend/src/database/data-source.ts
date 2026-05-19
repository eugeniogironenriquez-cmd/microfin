import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import {
  User, Customer, CustomerDocument, LoanType, Loan,
  PaymentSchedule, Payment, CollectionVisit, CollectorAssignment,
  CashSession, AuditLog, CompanySettings, LateFeeRule,
  State, Municipality, Guarantor, ExpenseCategory, Expense,
} from '../common/entities';
config();

export const AppDataSource = new DataSource({
  type: 'mysql',
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '12345678',
  database: process.env.DB_NAME     || 'microfin',
  charset:  'utf8mb4',
  entities: [
    User, Customer, CustomerDocument, LoanType, Loan,
    PaymentSchedule, Payment, CollectionVisit, CollectorAssignment,
    CashSession, AuditLog, CompanySettings, LateFeeRule,
    State, Municipality, Guarantor, ExpenseCategory, Expense,
  ],
  migrations: ['src/database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
});
