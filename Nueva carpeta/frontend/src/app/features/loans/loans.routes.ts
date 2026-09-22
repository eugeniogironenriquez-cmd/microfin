// ============================================================
// LOANS FEATURE - List, Detail, Simulator, Authorization
// ============================================================

import { Routes } from '@angular/router';

export const loansRoutes: Routes = [
  { path: '', loadComponent: () => import('./loans-list.component').then(m => m.LoansListComponent) },
  { path: 'new', loadComponent: () => import('./loan-form.component').then(m => m.LoanFormComponent) },
  { path: 'simulator', loadComponent: () => import('./loan-simulator.component').then(m => m.LoanSimulatorComponent) },
  { path: ':id', loadComponent: () => import('./loan-detail.component').then(m => m.LoanDetailComponent) },
  { path: ':id/restructure', loadComponent: () => import('./loan-restructure.component').then(m => m.LoanRestructureComponent) },
];
