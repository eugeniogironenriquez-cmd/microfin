// ── collection.routes.ts
import { Routes } from '@angular/router';

export const collectionRoutes: Routes = [
  { path: '', loadComponent: () => import('./collection-dashboard.component').then(m => m.CollectionDashboardComponent) },
  { path: 'overdue', loadComponent: () => import('./overdue-list.component').then(m => m.OverdueListComponent) },
  { path: 'assignments', loadComponent: () => import('./assignments.component').then(m => m.AssignmentsComponent) },
];
