import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard, permissionGuard } from './core/guards/role.guard';

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
      { path: 'customers', loadChildren: () => import('./features/customers/customers.routes').then((m) => m.customersRoutes), canActivate: [permissionGuard(['clientes.ver'])] },
      { path: 'loans/:id/renovar', loadComponent: () => import('./features/loans/loan-renovacion.component').then(m => m.LoanRenovacionComponent), canActivate: [permissionGuard(['prestamos.reestructurar'])] },
      { path: 'loans/:id/convenio', loadComponent: () => import('./features/loans/loan-convenio.component').then(m => m.LoanConvenioComponent), canActivate: [permissionGuard(['prestamos.reestructurar'])] },
      { path: 'loans', loadChildren: () => import('./features/loans/loans.routes').then((m) => m.loansRoutes), canActivate: [permissionGuard(['prestamos.ver'])] },
      { path: 'proximos-liquidar', loadComponent: () => import('./features/loans/proximos-liquidar.component').then(m => m.ProximosLiquidarComponent), canActivate: [permissionGuard(['prestamos.ver'])] },
      { path: 'payments', loadChildren: () => import('./features/payments/payments.routes').then((m) => m.paymentsRoutes), canActivate: [permissionGuard(['pagos.ver'])] },
      { path: 'restructuring', loadChildren: () => import('./features/restructuring/restructuring.routes').then((m) => m.restructuringRoutes), canActivate: [permissionGuard(['prestamos.reestructurar'])] },
      { path: 'collection', loadChildren: () => import('./features/collection/collection.routes').then((m) => m.collectionRoutes), canActivate: [permissionGuard(['cobranza.ver'])] },
      { path: 'cash', loadChildren: () => import('./features/cash/cash.routes').then((m) => m.cashRoutes), canActivate: [permissionGuard(['caja.ver'])] },
      { path: 'reports', loadChildren: () => import('./features/reports/reports.routes').then((m) => m.reportsRoutes), canActivate: [permissionGuard(['reportes.ver'])] },
      { path: 'plazos', loadComponent: () => import('./features/settings/plazos-config.component').then(m => m.PlazosConfigComponent), canActivate: [permissionGuard(['config.editar'])] },
      { path: 'config-mora', loadComponent: () => import('./features/settings/mora-config.component').then(m => m.MoraConfigComponent), canActivate: [permissionGuard(['config.editar'])] },
      { path: 'users', loadChildren: () => import('./features/users/users.routes').then((m) => m.usersRoutes), canActivate: [permissionGuard(['usuarios.ver'])] },
      // Gestión de roles y permisos
      { path: 'roles', loadChildren: () => import('./features/roles/roles.routes').then((m) => m.ROLES_ROUTES), canActivate: [permissionGuard(['roles.ver'])] },
      // Nuevas rutas — DENTRO del shell para conservar el sidebar
      { path: 'portfolio', loadComponent: () => import('./features/portfolio/portfolio.component').then(m => m.PortfolioComponent), canActivate: [permissionGuard(['cartera.ver'])] },
      { path: 'company', loadComponent: () => import('./features/settings/company-settings.component').then(m => m.CompanySettingsComponent), canActivate: [permissionGuard(['empresa.editar'])] },
      { path: 'late-fee-rules', loadComponent: () => import('./features/settings/late-fee-rules.component').then(m => m.LateFeeRulesComponent), canActivate: [permissionGuard(['moratorios.editar'])] },
      { path: 'disbursements', loadComponent: () => import('./features/disbursements/disbursements.component').then(m => m.DisbursementsComponent), canActivate: [permissionGuard(['prestamos.desembolsar'])] },
      { path: 'reports/location', loadComponent: () => import('./features/reports/location-report.component').then(m => m.LocationReportComponent), canActivate: [permissionGuard(['reportes.ubicacion'])] },
      { path: 'expenses', loadComponent: () => import('./features/expenses/expenses.component').then(m => m.ExpensesComponent), canActivate: [permissionGuard(['gastos.ver'])] },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];