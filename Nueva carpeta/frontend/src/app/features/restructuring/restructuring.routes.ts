import { Routes } from '@angular/router';

export const restructuringRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./restructuring.component').then(m => m.RestructuringComponent),
  },
];