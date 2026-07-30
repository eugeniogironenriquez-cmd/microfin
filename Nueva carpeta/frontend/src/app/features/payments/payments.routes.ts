import { Routes } from '@angular/router';

export const paymentsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./payments-register.component').then(m => m.PaymentsRegisterComponent),
  },
  {
    path: 'monitor',
    loadComponent: () => import('./payments-monitor.component').then(m => m.PaymentsMonitorComponent),
  },
  {
    path: 'schedule/:loanId',
    loadComponent: () => import('./payment-schedule.component').then(m => m.PaymentScheduleComponent),
  },
  { 
    path: 'consulta-pagos',
    loadComponent: () => import('./payments-query.component').then(m => m.PaymentsQueryComponent),
  }
];