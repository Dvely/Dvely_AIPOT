import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtUserPayload } from '../domain.types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { rolePriority, UserRole } from '../enums/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtUserPayload | undefined;
    if (!user) {
      throw new ForbiddenException('인증된 사용자만 접근할 수 있습니다.');
    }

    const allowed = requiredRoles.some(
      (role) => rolePriority[user.role] >= rolePriority[role],
    );

    if (!allowed) {
      throw new ForbiddenException('권한이 없습니다.');
    }

    return true;
  }
}
