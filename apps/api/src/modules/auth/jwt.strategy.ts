import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { TokenType } from 'core';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RoleType, Status } from 'shared';

import { CustomerService } from '@/modules/customer/customer.service';
import { UserService } from '@/modules/user/user.service';
import { ApiConfigService } from '@/shared/services';

import type { CustomerDocument } from '../customer/customer.entity';
import type { UserDocument } from '../user/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ApiConfigService,
    private userService: UserService,
    private customerService: CustomerService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.authConfig.publicKey,
    });
  }

  async validate(args: { userId: string; role: RoleType; type: TokenType }): Promise<UserDocument | CustomerDocument> {
    if (args.type !== TokenType.ACCESS_TOKEN) {
      throw new UnauthorizedException();
    }

    // Token của tài khoản Customer Portal — load từ `customers`, KHÔNG phải
    // `users`. `role` được "giả lập" thủ công (CustomerEntity không có
    // roleId/RoleEntity) để RolesGuard/PermissionsGuard tái dùng nguyên vẹn.
    if (args.role === RoleType.Customer) {
      const customer = await this.customerService.getById(args.userId);
      if (!customer) throw new NotFoundException('Tài khoản không tồn tại');
      if (customer.status === Status.Inactive) {
        throw new BadRequestException('Your account is inactive, please contact support');
      }

      // @ts-expect-error hide password
      customer.password = undefined;
      // @ts-expect-error gắn role ảo — CustomerEntity không lưu roleId
      customer.role = { name: RoleType.Customer };

      return customer;
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
