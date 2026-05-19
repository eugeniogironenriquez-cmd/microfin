import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'customers', loadChildren: () => import('./features/customers/customers.routes').then((m) => m.customersRoutes) },
      { path: 'loans', loadChildren: () => import('./features/loans/loans.routes').then((m) => m.loansRoutes) },
      { path: 'payments', loadChildren: () => import('./features/payments/payments.routes').then((m) => m.paymentsRoutes) },
      { path: 'restructuring', loadChildren: () => import('./features/restructuring/restructuring.routes').then((m) => m.restructuringRoutes), canActivate: [roleGuard(['ADMIN', 'AUTORIZADOR'])] },
      { path: 'collection', loadChildren: () => import('./features/collection/collection.routes').then((m) => m.collectionRoutes) },
      { path: 'cash', loadChildren: () => import('./features/cash/cash.routes').then((m) => m.cashRoutes), canActivate: [roleGuard(['ADMIN', 'CAJERO'])] },
      { path: 'reports', loadChildren: () => import('./features/reports/reports.routes').then((m) => m.reportsRoutes) },
      { path: 'settings', loadChildren: () => import('./features/settings/settings.routes').then((m) => m.settingsRoutes), canActivate: [roleGuard(['ADMIN'])] },
      { path: 'users', loadChildren: () => import('./features/users/users.routes').then((m) => m.usersRoutes), canActivate: [roleGuard(['ADMIN'])] },
      // Nuevas rutas — DENTRO del shell para conservar el sidebar
      { path: 'portfolio', loadComponent: () => import('./features/portfolio/portfolio.component').then(m => m.PortfolioComponent) },
      { path: 'company', loadComponent: () => import('./features/settings/company-settings.component').then(m => m.CompanySettingsComponent) },
      { path: 'late-fee-rules', loadComponent: () => import('./features/settings/late-fee-rules.component').then(m => m.LateFeeRulesComponent) },
      { path: 'disbursements', loadComponent: () => import('./features/disbursements/disbursements.component').then(m => m.DisbursementsComponent) },
      { path: 'reports/location', loadComponent: () => import('./features/reports/location-report.component').then(m => m.LocationReportComponent) },
      { path: 'expenses', loadComponent: () => import('./features/expenses/expenses.component').then(m => m.ExpensesComponent) },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
