import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';

import { CustomerEntity, CustomerSchema } from '@/modules/customer/customer.entity';
import { CustomerModule } from '@/modules/customer/customer.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import { UserEntity, UserSchema } from '@/modules/user/user.entity';
import { UserModule } from '@/modules/user/user.module';
import { ApiConfigService } from '@/shared/services';

import { ActionEntity, ActionSchema } from '../actions/action.entity';
import { ActionRepository } from '../actions/action.repository';
import { RedisCacheService } from '../redis-cache/redis-cache.service';
import { AuthConsumer } from './auth.consumer';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ImpersonationService } from './impersonation.service';
import { JwtStrategy } from './jwt.strategy';
import { PublicStrategy } from './public.strategy';

@Module({
  imports: [
    forwardRef(() => UserModule),
    CustomerModule,
    SystemConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ApiConfigService) => ({
        privateKey: configService.authConfig.privateKey,
        publicKey: configService.authConfig.publicKey,
        signOptions: {
          algorithm: 'RS256',
          expiresIn: configService.authConfig.jwtExpirationTime,
        },
        verifyOptions: {
          algorithms: ['RS256'],
        },
      }),
      inject: [ApiConfigService],
    }),
    MongooseModule.forFeature([
      {
        name: ActionEntity.name,
        schema: ActionSchema,
      },
      // AUTH-1 — ImpersonationService ghi mật khẩu mặc định (BR-8) thẳng qua
      // model với update CÓ ĐIỀU KIỆN, không qua service, để giữ tính nguyên tử.
      { name: UserEntity.name, schema: UserSchema },
      { name: CustomerEntity.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    ImpersonationService,
    JwtStrategy,
    PublicStrategy,
    RedisCacheService,
    ActionRepository,
    AuthConsumer,
  ],
  // AUTH-3 — `ImpersonationService` xuất ra cho `CustomerAuthController` dùng
  // CHUNG đường dừng mạo danh (endpoint thoát của khách phải nằm dưới prefix
  // `/customer/` mới đi qua được `RolesGuard`).
  exports: [JwtModule, AuthService, ImpersonationService],
})
export class AuthModule {}
