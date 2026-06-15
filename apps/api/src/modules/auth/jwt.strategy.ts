import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { TokenType } from 'core';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { type RoleType, Status } from 'shared';

import { UserService } from '@/modules/user/user.service';
import { ApiConfigService } from '@/shared/services';

import type { UserDocument } from '../user/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ApiConfigService,
    private userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.authConfig.publicKey,
    });
  }

  async validate(args: { userId: string; role: RoleType; type: TokenType }): Promise<UserDocument> {
    if (args.type !== TokenType.ACCESS_TOKEN) {
      throw new UnauthorizedException();
    }

    const user = await this.userService.getUserById(args.userId);

    if (user.status === Status.Inactive) {
      // throw new UnauthorizedException();
      throw new BadRequestException('Your account is inactive, please contact support');
    }

    // @ts-expect-error hide password
    user.password = undefined;

    return user;
  }
}
