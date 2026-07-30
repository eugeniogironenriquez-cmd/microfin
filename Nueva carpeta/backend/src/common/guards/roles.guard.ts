import {
  Injectable, CanActivate, ExecutionContext, SetMetadata,
  applyDecorators, UseGuards, createParamDecorator, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '../entities';

// ════════════════════════════════════════════════════════════
// CLAVES DE METADATOS
// ════════════════════════════════════════════════════════════
export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

// ════════════════════════════════════════════════════════════
// GUARD DE ROLES (legacy — se mantiene por compatibilidad)
// ════════════════════════════════════════════════════════════
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = ctx.switchToHttp().getRequest();
    if (!user) return false;
    // El super admin pasa siempre
    if (user.isAdmin) return true;
    // Compatibilidad: validar contra el nombre del rol o el enum legacy
    const roleName = user.roleName || user.role;
    return required.includes(roleName);
  }
}

// ════════════════════════════════════════════════════════════
// GUARD DE PERMISOS (nuevo — sistema dinámico)
// ════════════════════════════════════════════════════════════
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = ctx.switchToHttp().getRequest();
    if (!user) return false;
    // El super admin pasa siempre
    if (user.isAdmin) return true;
    const userPerms: string[] = user.permissions || [];
    // Requiere TENER al menos uno de los permisos solicitados
    const ok = required.some(p => userPerms.includes(p));
    if (!ok) throw new ForbiddenException('No tienes permiso para esta acción');
    return true;
  }
}

// ════════════════════════════════════════════════════════════
// DECORADORES COMPUESTOS
// ════════════════════════════════════════════════════════════

// @Auth() — solo autenticación
// @Auth(UserRole.ADMIN) — autenticación + rol (legacy, sigue funcionando)
export function Auth(...roles: UserRole[]) {
  const decorators: any[] = [UseGuards(AuthGuard('jwt'), RolesGuard)];
  if (roles.length > 0) decorators.push(Roles(...roles));
  return applyDecorators(...decorators);
}

// @AuthPermission('clientes.crear', 'clientes.editar')
// Autenticación + validación de permisos dinámicos
export function AuthPermission(...perms: string[]) {
  const decorators: any[] = [UseGuards(AuthGuard('jwt'), PermissionsGuard)];
  if (perms.length > 0) decorators.push(RequirePermissions(...perms));
  return applyDecorators(...decorators);
}

// ════════════════════════════════════════════════════════════
// DECORADOR DE USUARIO ACTUAL
// ════════════════════════════════════════════════════════════
export const CurrentUser = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user;
    return field ? user?.[field] : user;
  },
);