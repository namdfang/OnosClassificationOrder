import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Controller, HttpCode, HttpStatus, Inject, Post, UsePipes } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import { RoleType } from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { DesignerMigrationService } from './designer-migration.service';

@Controller('designer')
@ApiTags('designer')
@UsePipes(ZodValidationPipe)
export class DesignerMigrationController {
  constructor(
    private readonly migrationService: DesignerMigrationService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Post('migrate-leader')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({
    summary:
      'One-time migration: promote single Designer user → DesignerLeader role + email designerleader@onospod.com (idempotent).',
  })
  @HttpCode(HttpStatus.OK)
  async migrateLeader(@AuthUser() actor: UserDocument) {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/designer/migrate-leader', actorId: actor._id }),
    });
    const result = await this.migrationService.migrateLeader();
    return { success: true, data: result };
  }
}
