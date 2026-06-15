import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MachineTypeController } from './machine-type.controller';
import { MachineTypeEntity, MachineTypeSchema } from './machine-type.entity';
import { MachineTypeRepository } from './machine-type.repository';
import { MachineTypeService } from './machine-type.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: MachineTypeEntity.name, schema: MachineTypeSchema }])],
  controllers: [MachineTypeController],
  providers: [MachineTypeService, MachineTypeRepository],
  exports: [MachineTypeService, MachineTypeRepository],
})
export class MachineTypeModule {}
