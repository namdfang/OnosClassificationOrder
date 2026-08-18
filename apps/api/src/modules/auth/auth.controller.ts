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
  StartImpersonationDto,
  StartImpersonationResDto,
  StopImpersonationResDto,
} from 'shared';
import { Logger } from 'winston';

import { AccessToken, Auth, ClientIp, UserAgent } from '@/decorators';
import { UserDocument } from '@/modules/user/user.entity';
import { UserService } from '@/modules/user/user.service';

import { ActionRepository } from '../actions/action.repository';
import { RedisCacheService } from '../redis-cache/redis-cache.service';
import { AuthService } from './auth.service';
import { ImpersonationService } from './impersonation.service';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(
    private userService: UserService,
    private authService: AuthService,
    private actionRepository: ActionRepository,
    private impersonationService: ImpersonationService,
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
      rememberMe: loginDto.rememberMe,
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
      expiresIn: token.expiresIn,
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

  /**
   * AUTH-1 — bắt đầu phiên mạo danh.
   *
   * `@Auth()` chỉ yêu cầu ĐÃ ĐĂNG NHẬP; việc chặn "chỉ SuperAdmin" (BR-1) nằm
   * TƯỜNG MINH trong service. Lý do: AC-02 đòi lần thử trái phép cũng phải được
   * ghi vết, mà `@Auth([SuperAdmin])` ném ngay ở guard nên không có chỗ nào ghi.
   * Đánh đổi có ý thức, CHỈ áp cho endpoint này — đừng nhân rộng.
   */
  @Post('impersonate')
  @Auth()
  @ApiOperation({ summary: 'SuperAdmin bắt đầu mạo danh tài khoản khác' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StartImpersonationResDto })
  async startImpersonation(
    @Body() dto: StartImpersonationDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<StartImpersonationResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'startImpersonation',
        method: 'POST',
        url: '/auth/impersonate',
        actorId: user?._id,
        target: dto,
      }),
    });

    return {
      success: true,
      data: await this.impersonationService.start(user, dto, {
        ip,
        userAgent,
        // Có claim này nghĩa là người gọi ĐANG ở trong phiên mạo danh → cấm
        // mạo danh lồng nhau (BR-6/AC-08). `impersonatedBy` do JwtStrategy đính.
        actorImpersonatorId: user?.impersonatedBy?._id,
      }),
    };
  }

  /**
   * AUTH-1 — thoát phiên mạo danh, trả token SuperAdmin mới.
   *
   * `@Auth([], [], { public: true })` là CỐ Ý: token mạo danh có thể ĐÃ HẾT HẠN
   * lúc người dùng bấm thoát, và guard `jwt` sẽ chặn nó. Nếu chặn thì AC-09
   * trượt đúng tại kịch bản nó sinh ra để bảo vệ. Service tự xác thực chữ ký
   * (bỏ qua hạn) rồi siết bằng 3 lớp khác — xem `impersonation.service.ts`.
   */
  @Post('impersonate/stop')
  @Auth([], [], { public: true })
  @ApiOperation({ summary: 'Thoát phiên mạo danh, trả về token SuperAdmin ban đầu' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StopImpersonationResDto })
  async stopImpersonation(
    @AccessToken() accessToken: string,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<StopImpersonationResDto> {
    this.logger.info({
      message: JSON.stringify({ action: 'stopImpersonation', method: 'POST', url: '/auth/impersonate/stop' }),
    });

    return { success: true, data: await this.impersonationService.stop(accessToken, { ip, userAgent }) };
  }
}
