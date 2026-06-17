import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FactoryModule } from '../factory/factory.module';
import { MachineTypeModule } from '../machine-type/machine-type.module';
import { WorkshopConfigModule } from '../workshop-config/workshop-config.module';
import { ProductConfigController } from './product-config.controller';
import { ProductConfigEntity, ProductConfigSchema } from './product-config.entity';
import { ProductConfigRepository } from './product-config.repository';
import { ProductConfigService } from './product-config.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ProductConfigEntity.name, schema: ProductConfigSchema }]),
    FactoryModule,
    MachineTypeModule,
    WorkshopConfigModule,
  ],
  controllers: [ProductConfigController],
  providers: [ProductConfigService, ProductConfigRepository],
  exports: [ProductConfigService, ProductConfigRepository],
})
export class ProductConfigModule {}
