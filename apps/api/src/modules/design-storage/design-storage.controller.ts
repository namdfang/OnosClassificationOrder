import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  ConfirmDesignUploadDto,
  ConfirmDesignUploadResDto,
  GetDesignFileResDto,
  GetDesignUploadConfigResDto,
  PresignDesignUploadDto,
  PresignDesignUploadResDto,
  RoleType,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';
import type { CustomerDocument } from '@/modules/customer/customer.entity';

import { DesignStorageService } from './design-storage.service';

@Controller('customer/designs')
@ApiTags('customer-designs')
@UsePipes(ZodValidationPipe)
export class DesignStorageController {
  constructor(
    private readonly designStorageService: DesignStorageService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Post('presign')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Cấp presigned URL upload design trực tiếp lên R2 (dedup theo sha256)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PresignDesignUploadResDto })
  async presign(
    @Body() dto: PresignDesignUploadDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<PresignDesignUploadResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'POST',
        url: '/customer/designs/presign',
        customerId: customer._id,
        sha256: dto.sha256,
        size: dto.size,
      }),
    });
    return { success: true, data: await this.designStorageService.presign(customer, dto) };
  }

  @Post('confirm')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Xác nhận upload xong → verify + đẩy job design-worker xử lý' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ConfirmDesignUploadResDto })
  async confirm(
    @Body() dto: ConfirmDesignUploadDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<ConfirmDesignUploadResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'POST',
        url: '/customer/designs/confirm',
        customerId: customer._id,
        sha256: dto.sha256,
      }),
    });
    return { success: true, data: await this.designStorageService.confirm(customer, dto) };
  }

  // Route static khai TRƯỚC `:sha256` — Nest match theo thứ tự khai báo.
  @Get('upload-config')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Giới hạn kích thước + định dạng cho ô tải design (FE khỏi chép cứng)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetDesignUploadConfigResDto })
  uploadConfig(): GetDesignUploadConfigResDto {
    return { success: true, data: this.designStorageService.getUploadConfig() };
  }

  @Get('lifecycle/cron')
  @Auth([], [], { public: true })
  @ApiOperation({ summary: 'Cron vòng đời design: archive IA sau 60 ngày không dùng + xóa sau 12 tháng IA' })
  @HttpCode(HttpStatus.OK)
  async lifecycleCron(): Promise<{ success: true; data: { archived: number; deleted: number; failedStale: number } }> {
    this.logger.info({ message: JSON.stringify({ method: 'GET', url: '/customer/designs/lifecycle/cron' }) });
    return { success: true, data: await this.designStorageService.runLifecycle() };
  }

  @Get(':sha256')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Poll trạng thái 1 design file (FE chờ ready để hiện thumb)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetDesignFileResDto })
  async getBySha(@Param('sha256') sha256: string): Promise<GetDesignFileResDto> {
    return { success: true, data: await this.designStorageService.getBySha(sha256.toLowerCase()) };
  }
}
