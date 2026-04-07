import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUserPayload } from '../domain.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUserPayload => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as JwtUserPayload;
  },
);
