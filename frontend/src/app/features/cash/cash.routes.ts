import { Routes } from '@angular/router';

export const cashRoutes: Routes = [
  { path: '', loadComponent: () => import('./cash-dashboard.component').then(m => m.CashDashboardComponent) },
];
