import { Routes } from '@angular/router';
import { authGuard } from './core/api.service';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'monitor', pathMatch: 'full' },
      {
        path: 'monitor',
        loadComponent: () => import('./features/semaforo/monitor.component').then((m) => m.MonitorComponent),
      },
      {
        path: 'gestor',
        loadComponent: () => import('./features/gestor/gestor.component').then((m) => m.GestorComponent),
      },
      {
        path: 'credito/:loanId',
        loadComponent: () => import('./features/acciones/acciones.component').then((m) => m.AccionesComponent),
      },
      {
        path: 'config',
        loadComponent: () => import('./features/semaforo/config.component').then((m) => m.ConfigComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
