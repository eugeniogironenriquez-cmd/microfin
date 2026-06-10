import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'clients', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage),
  },
  {
    path: 'clients',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/clients/clients.page').then(m => m.ClientsPage),
  },
  {
    path: 'client/:loanId',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/client-detail/client-detail.page').then(m => m.ClientDetailPage),
  },
  {
    path: 'payment/:loanId',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/payment/payment.page').then(m => m.PaymentPage),
  },
  {
    path: 'visit/:loanId',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/visit/visit.page').then(m => m.VisitPage),
  },
  {
    path: 'restructure/:loanId',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/restructure/restructure.page').then(m => m.RestructurePage),
  },
  {
    path: 'convenio/:loanId',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/convenio/convenio.page').then(m => m.ConvenioPage),
  },
];
