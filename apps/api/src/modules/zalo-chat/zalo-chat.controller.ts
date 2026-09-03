import { Controller, Delete, HttpCode, HttpStatus, Logger, Post, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import type { FastifyReply } from 'fastify';
import { RoleType } from 'shared';

import { Auth } from '@/decorators/http.decorator';

import type { UserDocument } from '../user/user.entity';
import { ZaloChatService } from './zalo-chat.service';

/**
 * Cấp phiên cho màn chat Zalo. Xem `zalo-chat.constants.ts` vì sao phải là cookie.
 */
@Controller('zalo-chat')
@ApiTags('zalo-chat')
export class ZaloChatController {
  private readonly logger = new Logger(ZaloChatController.name);

  constructor(private readonly zaloChatService: ZaloChatService) {}

  @Post('session')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Đổi JWT lấy cookie phiên cho màn chat Zalo' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  async createSession(
    @AuthUser() user: UserDocument,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ success: true; data: { role: string } }> {
    this.logger.log(JSON.stringify({ method: 'POST', url: '/zalo-chat/session', userId: user._id }));

    // Guard đã chặn role khác, nhưng vẫn hỏi lại service: nơi quyết định vai trò
    // phải là MỘT chỗ, không phải danh sách role rải ở decorator lẫn service.
    const vai = this.zaloChatService.vaiTro(user.role?.name);
    if (!vai) {
      void reply.header('set-cookie', this.zaloChatService.cookieXoa());
      reply.status(HttpStatus.FORBIDDEN);

      return { success: true, data: { role: 'none' } };
    }

    const ten = user.fullName || user.email || String(user._id);
    void reply.header('set-cookie', await this.zaloChatService.cookiePhien(String(user._id), ten, vai));

    return { success: true, data: { role: vai } };
  }

  @Delete('session')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Xoá cookie phiên chat Zalo' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  deleteSession(@Res({ passthrough: true }) reply: FastifyReply): { success: true } {
    void reply.header('set-cookie', this.zaloChatService.cookieXoa());

    return { success: true };
  }
}
