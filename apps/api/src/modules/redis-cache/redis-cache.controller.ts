import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Controller, Get, HttpCode, HttpStatus, Inject, UsePipes } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResDto, RoleType } from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { RedisCacheService } from './redis-cache.service';

@Controller('cache')
@ApiTags('cache')
@UsePipes(ZodValidationPipe)
export class RedisCacheController {
  constructor(
    private redisCacheService: RedisCacheService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get('/clear')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Clear all data',
  })
  @HttpCode(HttpStatus.OK)
  @ApiCreatedResponse({
    type: ResDto,
  })
  async clearAllCache(): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'clearAllCache',
        method: 'GET',
        url: '/cache/clear',
        message: 'Clear all cache',
      }),
    });

    await this.redisCacheService.clearAllData();

    return {
      success: true,
    };
  }

  @Get('/clear/products')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({
    summary: 'Clear all products',
  })
  @HttpCode(HttpStatus.OK)
  @ApiCreatedResponse({
    type: ResDto,
  })
  async clearAllProductsCache(): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'clearAllProductsCache',
        method: 'GET',
        url: '/cache/clear/products',
        message: 'Clear all products cache',
      }),
    });

    try {
      const cachedKeys = await this.redisCacheService.findKeysByPrefix('product');
      const promises = cachedKeys.map((key) => this.redisCacheService.deleteKey(key));

      await Promise.all(promises);

      return {
        success: true,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @Get('/clear/users')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({
    summary: 'Clear all users',
  })
  @HttpCode(HttpStatus.OK)
  @ApiCreatedResponse({
    type: ResDto,
  })
  async clearAllUsersCache(): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'clearAllUsersCache',
        method: 'GET',
        url: '/cache/clear/users',
        message: 'Clear all users cache',
      }),
    });

    try {
      const cachedKeys = await this.redisCacheService.findKeysByPrefix('user');
      const promises = cachedKeys.map((key) => this.redisCacheService.deleteKey(key));

      await Promise.all(promises);

      return {
        success: true,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
