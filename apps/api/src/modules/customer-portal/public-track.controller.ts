import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Controller, Get, HttpCode, HttpStatus, Inject, Param, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GetPublicOrderTrackResDto } from 'shared';
import type { Logger } from 'winston';

import { Auth, ClientIp } from '@/decorators';

import { PublicTrackService } from './public-track.service';

/**
 * Tra cứu đơn CÔNG KHAI — trang `/track/:productionId` ở FE.
 *
 * KHÔNG đăng nhập, KHÔNG API key: cửa vào chính là mã sản xuất, để khách gửi
 * thẳng link cho người mua cuối. Bù lại dữ liệu trả về là danh sách trắng hẹp
 * (xem `PublicTrackService`) và endpoint bị siết nhịp theo IP để mã đơn không
 * bị dò quét hàng loạt — `RateLimiterGuard` bỏ qua route public (nó đếm theo
 * token/user, mà ở đây không có ai để đếm), nên `@Throttle` là lớp chặn duy nhất.
 */
@Controller('public/track')
@ApiTags('public-track')
@UsePipes(ZodValidationPipe)
export class PublicTrackController {
  constructor(
    private readonly publicTrackService: PublicTrackService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get(':code')
  @Auth([], [], { public: true })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Tra cứu 1 đơn theo mã sản xuất — không cần đăng nhập' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetPublicOrderTrackResDto })
  async getTrack(@Param('code') code: string, @ClientIp() ip: string): Promise<GetPublicOrderTrackResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'GET', url: '/public/track', code, ip }) });
    return this.publicTrackService.getTrack(code) as Promise<GetPublicOrderTrackResDto>;
  }
}
