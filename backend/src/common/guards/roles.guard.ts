import {
  Injectable, CanActivate, ExecutionContext, SetMetadata,
  applyDecorators, UseGuards, createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '../entities';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return user && required.includes(user.role);
  }
}

export function Auth(...roles: UserRole[]) {
  const guards: any[] = [AuthGuard('jwt'), RolesGuard];
  const decorators: any[] = [UseGuards(...guards)];
  if (roles.length > 0) decorators.push(Roles(...roles));
  return applyDecorators(...decorators);
}

export const CurrentUser = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user;
    return field ? user?.[field] : user;
  },
);
