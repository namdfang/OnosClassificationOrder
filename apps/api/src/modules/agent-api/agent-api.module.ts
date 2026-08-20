import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AgentAdminService } from './agent-admin.service';
import { AgentApiController } from './agent-api.controller';
import { AgentApiRepository } from './agent-api.repository';
import { AgentApiAdminController } from './agent-api-admin.controller';
import { AgentApiKeyGuard } from './agent-api-key.guard';
import { AgentApiLogEntity, AgentApiLogSchema } from './agent-audit.entity';
import { AgentAuditService } from './agent-audit.service';
import { AgentDocsService } from './agent-docs.service';
import { AgentExceptionFilter } from './agent-exception.filter';
import { AgentQueryService } from './agent-query.service';
import { AgentReadService } from './agent-read.service';

/**
 * Bộ API nội bộ cho AI agent (`API-1`, mở hết ở `API-19`).
 *
 * KHÔNG còn bind model của các bảng nghiệp vụ: từ `API-19`, bề mặt là **mọi
 * collection**, nên `AgentApiRepository` đọc thẳng qua `Connection` thay vì tra
 * model. Bind một danh sách cố định ở đây sẽ là danh sách thứ hai để lệch với
 * thực tế, và nó không còn giới hạn được gì.
 *
 * Model duy nhất còn bind là bảng nhật ký gọi API — bảng của chính module này,
 * và là chỗ DUY NHẤT module được phép ghi.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: AgentApiLogEntity.name, schema: AgentApiLogSchema }]),
  ],
  controllers: [AgentApiController, AgentApiAdminController],
  providers: [
    AgentAdminService,
    AgentApiKeyGuard,
    AgentExceptionFilter,
    AgentApiRepository,
    AgentAuditService,
    AgentDocsService,
    AgentQueryService,
    AgentReadService,
  ],
})
export class AgentApiModule {}
