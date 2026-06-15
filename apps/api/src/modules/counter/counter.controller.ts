import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResDto, RoleType } from 'shared';

import { CounterType } from '@/constants';
import { Auth } from '@/decorators';

import { CounterService } from './counter.service';

@Controller('counters')
@ApiTags('counters')
export class CounterController {
  constructor(private counterService: CounterService) {}

  @Get(':key')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Get counter',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async getCounter(@Param('key') key: string, @Query('type') type: CounterType): Promise<ResDto> {
    return { success: true, data: await this.counterService.getCounter(key, type) };
  }

  @Post(':key')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Update counter',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async findOneAndUpdateCounter(@Param('key') key: string, @Query('type') type: CounterType): Promise<ResDto> {
    return { success: true, data: await this.counterService.findAndUpdateCounter(key, type) };
  }
}
