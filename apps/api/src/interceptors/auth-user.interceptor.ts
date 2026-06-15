import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

import type { UserDocument } from '@/modules/user/user.entity';
import { ContextProvider } from '@/providers';

@Injectable()
export class AuthUserInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();

    const user = <UserDocument>request.user;
    ContextProvider.setAuthUser(user);

    return next.handle();
  }
}
