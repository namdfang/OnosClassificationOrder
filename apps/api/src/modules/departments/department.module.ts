import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { DepartmentController } from './department.controller';
import { DepartmentEntity, DepartmentSchema } from './department.entity';
import { DepartmentRepository } from './department.repository';
import { DepartmentService } from './department.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: DepartmentEntity.name,
        schema: DepartmentSchema,
      },
    ]),
  ],
  controllers: [DepartmentController],
  providers: [DepartmentService, DepartmentRepository],
  exports: [DepartmentService],
})
export class DepartmentModule {}
