import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, UserRole } from '../index';

// LEGACY: protección por rol. Se mantiene por compatibilidad.
export const roleGuard = (allowedRoles: UserRole[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (auth.hasRole(...allowedRoles)) return true;
    router.navigate(['/dashboard']);
    return false;
  };
};

// NUEVO: protección por permiso dinámico.
// Uso en rutas: canActivate: [permissionGuard(['caja.operar'])]
// El usuario pasa si tiene AL MENOS uno de los permisos indicados.
// El super admin siempre pasa (lo maneja auth.can()).
export const permissionGuard = (requiredPerms: string[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (auth.can(...requiredPerms)) return true;
    router.navigate(['/dashboard']);
    return false;
  };
};