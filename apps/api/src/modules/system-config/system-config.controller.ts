import { AuthUser } from 'core';
import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Patch, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { RoleType } from 'shared';

import { Auth } from '@/decorators';
import { UserDocument } from '../user/user.entity';
import { SystemConfigService } from './system-config.service';

@Controller('system-configs')
@ApiTags('system-configs')
@UsePipes(ZodValidationPipe)
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get('master-password')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Get master password enabled status' })
  @HttpCode(HttpStatus.OK)
  async getMasterPasswordStatus() {
    const isEnabled = await this.systemConfigService.get<boolean>('enable_master_password', false);
    return { success: true, data: { isEnabled } };
  }

  @Patch('master-password')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Toggle master password enabled status' })
  @HttpCode(HttpStatus.OK)
  async toggleMasterPassword(@Body() body: { isEnabled: boolean }, @AuthUser() user: UserDocument) {
    if (user.email !== 'namdfang@gmail.com') {
      throw new ForbiddenException('Only namdfang@gmail.com can toggle this setting');
    }
    await this.systemConfigService.set('enable_master_password', body.isEnabled, 'Enable/Disable Master Password login bypass');
    return { success: true };
  }
}
