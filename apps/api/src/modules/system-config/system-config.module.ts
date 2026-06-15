import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemConfigController } from './system-config.controller';
import { SystemConfigEntity, SystemConfigSchema } from './system-config.entity';
import { SystemConfigRepository } from './system-config.repository';
import { SystemConfigService } from './system-config.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemConfigEntity.name, schema: SystemConfigSchema },
    ]),
  ],
  controllers: [SystemConfigController],
  providers: [SystemConfigService, SystemConfigRepository],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
