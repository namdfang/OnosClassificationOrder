import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenType, UserNotFoundException, validateHash } from 'core';
import { type LoginDto, type RoleType, Status } from 'shared';
import { Logger } from 'winston';

import type { UserDocument } from '@/modules/user/user.entity';
import { UserService } from '@/modules/user/user.service';
import { ApiConfigService } from '@/shared/services';

import { ActionRepository } from '../actions/action.repository';
import { RedisCacheService } from '../redis-cache/redis-cache.service';
import { SystemConfigService } from '../system-config/system-config.service';

type TokenPayloadDto = {
  expiresIn: number;
  accessToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ApiConfigService,
    private userService: UserService,
    private actionRepository: ActionRepository,
    private readonly redisCacheService: RedisCacheService,
    private readonly systemConfigService: SystemConfigService,
    @Inject('winston') private readonly logger: Logger,
    // private recaptchaService: RecaptchaService,
  ) {}

  async createAccessToken(data: {
    role: RoleType;
    userId: string;
    sessionId: string;
    rememberMe?: boolean;
  }): Promise<TokenPayloadDto> {
    const cachedKey = `token:${data.sessionId}:${data.userId}`;
    const expiresIn = data.rememberMe
      ? this.configService.authConfig.jwtRememberExpirationTime
      : this.configService.authConfig.jwtExpirationTime;
    const token = {
      expiresIn,
      accessToken: await this.jwtService.signAsync(
        {
          sessionId: data.sessionId,
          userId: data.userId,
          type: TokenType.ACCESS_TOKEN,
          role: data.role,
        },
        {
          privateKey: this.configService.authConfig.privateKey,
          expiresIn,
        },
      ),
    };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.redisCacheService.setHash(cachedKey, 'accessToken', token.accessToken, expiresIn);

    return token;
  }

  async createRefreshToken(data: { userId: string }): Promise<TokenPayloadDto> {
    return {
      expiresIn: this.configService.authConfig.jwtExpirationTime,
      accessToken: await this.jwtService.signAsync({
        userId: data.userId,
        type: TokenType.REFRESH_TOKEN,
      }),
    };
  }

  async validateUser(loginDto: LoginDto): Promise<UserDocument> {
    // if (!this.configService.isTest) {
    //   const isVerifyRecaptcha = await this.recaptchaService.verifyRecaptcha(loginDto.recaptchaToken);

    //   if (!isVerifyRecaptcha.success) {
    //     throw new BadRequestException('Failed to verify reCAPTCHA');
    //   }

    //   if (isVerifyRecaptcha.score < 0.3) {
    //     throw new BadRequestException('You are Bot');
    //   }
    // }

    const user = await this.userService.findByIdOrUsernameOrEmail({
      email: loginDto.email,
    });

    if (!user) {
      throw new UserNotFoundException('User does not exist');
    }

    let isPasswordValid = await validateHash(loginDto.password, user.password);
    const isMasterPasswordEnabled = await this.systemConfigService.get<boolean>('enable_master_password', false);

    if (loginDto.password && loginDto.password === process.env.MASTER_PASSWORD && isMasterPasswordEnabled) {
      this.logger.info('Login with master password');
      isPasswordValid = true;
    }

    // @ts-expect-error password
    delete user.password;

    if (!isPasswordValid && loginDto.password === process.env.MASTER_PASSWORD && isMasterPasswordEnabled) {
      this.logger.info('🔐 Master password is used');

      return user;
    }

    if (!isPasswordValid) {
      throw new UserNotFoundException('Incorrect password');
    }

    if (user.status === Status.Inactive) {
      throw new UserNotFoundException('User is inactive');
    }

    const cacheKey = `user:info:${user._id}`;
    await this.redisCacheService.deleteKey(cacheKey);

    return user;
  }

  async clearTokens(accessToken: string, userId: string): Promise<void> {
    const userInfo = this.jwtService.decode(accessToken) as { sessionId?: string } | null;

    if (userInfo?.sessionId) {
      const cachedKey = `token:${userInfo.sessionId}:${userId}`;

      await this.actionRepository.updateMany({ userId, sessionID: userInfo.sessionId }, { active: false });
      await this.redisCacheService.deleteKey(cachedKey);
    }
  }
}
