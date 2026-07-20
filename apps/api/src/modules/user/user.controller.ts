import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query, UsePipes } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import type { UpdateUserResDto } from 'shared';
import {
  ActionType,
  ChangePasswordDto,
  CreateUserDto,
  CreateUserResDto,
  GetUsersDto,
  GetUsersResDto,
  PageQueryDto,
  ResDto,
  ResetPasswordDto,
  RoleType,
  UpdateUserDto,
} from 'shared';
import { Logger } from 'winston';

import { AccessToken, Auth, ClientIp, UserAgent } from '@/decorators';
import { extractIpLocation } from '@/utils/extract-ip-location';

import { ActionRepository } from '../actions/action.repository';
import { UserDocument } from './user.entity';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

@Controller('users')
@ApiTags('users')
@UsePipes(ZodValidationPipe)
export class UserController {
  constructor(
    private userService: UserService,
    private actionRepository: ActionRepository,
    private jwtService: JwtService,
    private readonly userRepository: UserRepository,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Post()
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Create user (Phase 5)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateUserResDto })
  async createUser(@Body() dto: CreateUserDto, @AuthUser() user: UserDocument): Promise<CreateUserResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'POST', url: '/users', userId: user._id }) });
    const newUser = await this.userService.createUser(dto, user);
    return { success: true, data: newUser };
  }

  @Patch(':userId')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Admin: update a target user (Phase 5)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async adminUpdateUser(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
    @AuthUser() actor: UserDocument,
  ): Promise<ResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'PATCH', url: `/users/${userId}`, actorId: actor._id }) });
    const updated = await this.userService.adminUpdateUser(userId, dto, actor);
    return { success: true, data: updated };
  }

  @Delete(':userId')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Admin: soft-delete a user (Phase 5)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async adminDeleteUser(@Param('userId') userId: string, @AuthUser() actor: UserDocument): Promise<ResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'DELETE', url: `/users/${userId}`, actorId: actor._id }) });
    await this.userService.adminDeleteUser(userId, actor);
    return { success: true };
  }

  @Post(':userId/toggle-active')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Admin: toggle user active/inactive (Phase 5)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async adminToggleActive(@Param('userId') userId: string, @AuthUser() actor: UserDocument): Promise<ResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'POST', url: `/users/${userId}/toggle-active`, actorId: actor._id }) });
    const updated = await this.userService.adminToggleActive(userId, actor);
    return { success: true, data: updated };
  }

  @Get()
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Get users' })
  @HttpCode(HttpStatus.OK)
  @ApiCreatedResponse({ type: GetUsersResDto })
  async getUsers(@AuthUser() user: UserDocument, @Query() getUsersDto: GetUsersDto): Promise<GetUsersResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'getUsers',
        method: 'GET',
        url: '/users',
        message: 'Get users',
        query: getUsersDto,
      }),
    });

    return await this.userService.getUsers(user, getUsersDto);
  }

  @Post('/update')
  @Auth()
  @ApiOperation({ summary: 'Update user' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateUserDto })
  async updateUser(@Body() updateUserDto: UpdateUserDto, @AuthUser() user: UserDocument): Promise<UpdateUserResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'updateUser',
        method: 'POST',
        url: '/users',
        message: 'Update user',
        userId: user._id,
        body: updateUserDto,
      }),
    });

    return await this.userService.updateUser(updateUserDto, user);
  }

  @Post(':userId/reset-password')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Reset password' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResetPasswordDto })
  async resetPassword(
    @Param('userId') userId: string,
    @Body() resetPasswordDto: ResetPasswordDto,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
    @AccessToken() accessToken: string,
    @AuthUser() user: UserDocument,
  ): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'resetPassword',
        method: 'POST',
        url: '/users',
        message: 'Reset password',
      }),
    });

    // Cast type-only: token đã qua AuthGuard nên luôn là object payload có
    // sessionId (mirror roles.guard.ts).
    const userInfo = this.jwtService.decode(accessToken) as { sessionId?: string };
    const ipInfo = await extractIpLocation(ip);

    await this.actionRepository.create({
      userId,
      type: ActionType.ChangePassword,
      userAgent,
      sessionId: userInfo.sessionId,
      active: true,
      ...ipInfo,
    });

    return {
      success: true,
      message: await this.userService.resetPassword(userId, resetPasswordDto, user),
    };
  }

  @Get('logs/:userId')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Get user logs' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async getLogs(@Query() pageQueryDto: PageQueryDto, @Param('userId') userId: string): Promise<ResDto> {
    return {
      success: true,
      ...(await this.userService.getLogs(pageQueryDto, userId)),
    };
  }

  @Post('/change-password')
  @Auth()
  @ApiOperation({ summary: 'Change password' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async changePassword(@Body() changePasswordDto: ChangePasswordDto, @AuthUser() user: UserDocument): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'changePassword',
        method: 'POST',
        url: '/change-password',
        message: 'Change password',
        userId: user._id,
      }),
    });

    return {
      success: true,
      message: await this.userService.changePassword(changePasswordDto, user),
    };
  }

  @Get('/force-change-password/:userId')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Force change password' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async forceChangePassword(@AuthUser() user: UserDocument, @Param('userId') userId: string): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'forceChangePassword',
        method: 'POST',
        url: '/force-change-password',
        userId: user._id,
      }),
    });

    await this.userRepository.updateOne({ _id: userId }, { forcePassChange: true });

    return { success: true };
  }

  @Post(':userId/clear-user-cache')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Clear user cache' })
  async clearUserCache(@Param('userId') userId: string) {
    return { success: true, data: await this.userService.clearUserCache(userId) };
  }
}
