import { Module } from '@nestjs/common';

import { SystemConfigModule } from '../system-config/system-config.module';
import { DesignerAssignmentController } from './designer-assignment.controller';
import { DesignerAssignmentService } from './designer-assignment.service';

@Module({
  imports: [SystemConfigModule],
  controllers: [DesignerAssignmentController],
  providers: [DesignerAssignmentService],
  exports: [DesignerAssignmentService],
})
export class DesignerAssignmentModule {}
