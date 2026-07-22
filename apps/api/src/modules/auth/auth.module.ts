import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';

import { CustomerModule } from '@/modules/customer/customer.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import { UserModule } from '@/modules/user/user.module';
import { ApiConfigService } from '@/shared/services';

import { ActionEntity, ActionSchema } from '../actions/action.entity';
import { ActionRepository } from '../actions/action.repository';
import { RedisCacheService } from '../redis-cache/redis-cache.service';
import { AuthConsumer } from './auth.consumer';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
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
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PublicStrategy, RedisCacheService, ActionRepository, AuthConsumer],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
