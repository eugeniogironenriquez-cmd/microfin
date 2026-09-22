import { Routes } from '@angular/router';
export const settingsRoutes: Routes = [
  { path: '', loadComponent: () => import('./settings-dashboard.component').then(m => m.SettingsDashboardComponent) },
];
