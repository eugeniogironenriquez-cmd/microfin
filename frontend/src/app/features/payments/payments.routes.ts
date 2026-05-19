import { Routes } from '@angular/router';

export const paymentsRoutes: Routes = [
  { path: '', loadComponent: () => import('./payments-register.component').then(m => m.PaymentsRegisterComponent) },
  { path: 'schedule/:loanId', loadComponent: () => import('./payment-schedule.component').then(m => m.PaymentScheduleComponent) },
];
