// ── customers.routes.ts
import { Routes } from '@angular/router';

export const customersRoutes: Routes = [
  { path: '', loadComponent: () => import('./customers-list.component').then(m => m.CustomersListComponent) },
  { path: 'new', loadComponent: () => import('./customer-form.component').then(m => m.CustomerFormComponent) },
  { path: ':id', loadComponent: () => import('./customer-detail.component').then(m => m.CustomerDetailComponent) },
  { path: ':id/edit', loadComponent: () => import('./customer-form.component').then(m => m.CustomerFormComponent) },
];
