import { Routes } from '@angular/router';

export const reportsRoutes: Routes = [
  { path: '', loadComponent: () => import('./reports-dashboard.component').then(m => m.ReportsDashboardComponent) },
];
