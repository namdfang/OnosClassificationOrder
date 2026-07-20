import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from 'core';
import {
  CreateUserDto,
  CreateUserResDto,
  GetMeResDto,
  LoginDto,
  LoginResDto,
  myNanoid,
  ResDto,
  RoleType,
} from 'shared';
import { Logger } from 'winston';

import { Auth, ClientIp, UserAgent } from '@/decorators';
import { UserDocument } from '@/modules/user/user.entity';
import { UserService } from '@/modules/user/user.service';

import { ActionRepository } from '../actions/action.repository';
import { RedisCacheService } from '../redis-cache/redis-cache.service';
import { AuthService } from './auth.service';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(
    private userService: UserService,
    private authService: AuthService,
    private actionRepository: ActionRepository,
    private redisCacheService: RedisCacheService,
    private readonly amqpConnection: AmqpConnection,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 100, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Login',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: LoginResDto,
    description: 'User info with access token',
  })
  async userLogin(
    @Body() loginDto: LoginDto,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<LoginResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'userLogin',
        method: 'POST',
        url: '/auth/login',
        body: { ...loginDto, password: '***' },
        message: 'Login',
      }),
    });

    const sessionId = myNanoid();

    const user = await this.authService.validateUser(loginDto);

    const token = await this.authService.createAccessToken({
      userId: user._id.toString(),
      role: user.role!.name,
      sessionId,
    });

    // const refreshToken = await this.authService.createRefreshToken({
    //   userId: user._id.toString(),
    // });

    // const action = await this.actionRepository.create({
    //   userId: user._id.toString(),
    //   type: ActionType.Login,
    //   userAgent,
    //   sessionId,
    //   active: true,
    //   ip,
    // });

    // await this.amqpConnection.publish(
    //   process.env.RABBITMQ_MAIN_EXCHANGE!,
    //   process.env.RABBITMQ_MAIN_EXCHANGE + '.auth.location',
    //   {
    //     ip,
    //     actionId: action._id,
    //   },
    // );

    return {
      userId: user._id.toString(),
      accessToken: token.accessToken,
      user,
      // refreshToken: refreshToken
    };
  }

  @Get('logout')
  @Auth()
  @ApiOperation({
    summary: 'Logout',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async userLogout(@AuthUser() user: UserDocument, @Headers() headers: Record<string, string>): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'userLogout',
        method: 'POST',
        url: '/auth/logout',
        message: 'Logout',
      }),
    });

    const accessToken = headers.authorization.replace('Bearer ', '');

    await this.authService.clearTokens(accessToken, user._id.toString());

    return { success: true, data: [] };
  }

  @Get('deactivate-session/:userId/:sessionId')
  @Auth([RoleType.Admin, RoleType.Seller])
  @ApiOperation({
    summary: 'Deactivate session',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async deactivateSession(@Param('sessionId') sessionId: string, @Param('userId') userId: string): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'deactivateSession',
        method: 'GET',
        url: `/auth/deactivate-session/${userId}/${sessionId}`,
        message: 'Deactivate Session',
      }),
    });

    await this.redisCacheService.deleteKey(`token:${sessionId}:${userId}`);
    await this.actionRepository.updateMany({ userId, sessionId }, { active: false });

    return { success: true, data: [] };
  }

  @Post()
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Create user',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: CreateUserResDto,
  })
  async createUser(
    @Body()
    createUserDto: CreateUserDto,
    @AuthUser()
    user: UserDocument,
  ): Promise<CreateUserResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'createUser',
        method: 'POST',
        url: '/users',
        message: 'Create user',
        query: createUserDto,
      }),
    });

    return {
      success: true,
      data: await this.userService.createUser(createUserDto, user),
    };
  }

  // @Post('/register')
  // @ApiOperation({
  //   summary: 'register',
  // })
  // @HttpCode(HttpStatus.OK)
  // @ApiOkResponse({
  //   type: RegisterDto,
  // })
  // async register(
  //   @Body()
  //   registerDto: RegisterDto,
  // ): Promise<CreateUserResDto> {
  //   this.logger.info({
  //     message: JSON.stringify({
  //       action: 'register',
  //       method: 'POST',
  //       url: '/register',
  //       message: 'Register',
  //       query: registerDto,
  //     }),
  //   });
  //
  //   const { password, passwordConfirm } = registerDto;
  //
  //   if (password !== passwordConfirm) {
  //     throw new HttpException('Passwords do not match', HttpStatus.BAD_REQUEST);
  //   }
  //
  //   return {
  //     success: true,
  //     data: await this.userService.register(registerDto),
  //   };
  // }

  @Get('/me')
  @Auth()
  @ApiOperation({
    summary: 'Get me',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: GetMeResDto,
  })
  async getMe(@AuthUser() user: UserDocument): Promise<GetMeResDto> {
    return { success: true, data: await this.userService.getMe(user._id, user) };
  }
}
