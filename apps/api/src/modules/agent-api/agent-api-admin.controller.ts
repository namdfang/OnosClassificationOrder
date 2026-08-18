import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import { RoleType } from 'shared';
import { GetAgentAdminKeyResDto, GetAgentAdminOverviewResDto } from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import type { UserDocument } from '../user/user.entity';
import { AgentAdminService } from './agent-admin.service';

/**
 * Bề mặt QUẢN TRỊ của bộ API agent (`API-3`) — dữ liệu cho trang hướng dẫn
 * trong `/adm`.
 *
 * Cố ý là controller RIÊNG, prefix riêng, KHÔNG thêm route vào
 * `AgentApiController`: class đó gắn `@UseGuards(AgentApiKeyGuard)` ở **cấp
 * class** nên mọi route trong nó đòi khoá agent, còn ở đây xác thực là JWT +
 * vai + quyền — ngược hoàn toàn. Trộn hai cơ chế vào một class là cách chắc
 * chắn nhất để một ngày nào đó có route lọt sai cửa.
 *
 * Prefix `agent-admin` cũng giữ cho bề mặt `/v1/agent/*` đúng bằng 5 endpoint
 * đã công bố với agent: người dò `/v1/agent/` không tìm thấy thêm gì.
 *
 * Phân quyền (AC-02): chặn bằng **vai** ở `RolesGuard` — `RoleType.Admin`, và
 * SuperAdmin đi qua vô điều kiện. Manager không có vai đó nên không vào được.
 *
 * KHÔNG truyền `page.agent_api` vào tham số permission của `@Auth`, dù mã quyền
 * đó có thật: `PermissionsGuard` của repo chạy trên cơ chế cũ
 * (`customRole.permissionIds`) và khi khớp thì đặt `request.passAuth = true`,
 * mà `RolesGuard` thấy cờ đó là cho qua **bỏ luôn kiểm tra vai**. Truyền vào
 * đây sẽ biến một custom role bất kỳ có chứa chuỗi ấy thành cửa sau — đúng thứ
 * AC-02 muốn chặn. `page.agent_api` là quyền của **FE** (ẩn/hiện entry) cộng
 * với việc Manager bị loại trừ trong `ADMIN_ONLY_PAGE_CODES`. Cùng khuôn mẫu
 * `customer.controller.ts` đang chạy cho trang Quản trị khách hàng.
 */
@Controller('agent-admin')
@ApiTags('agent-api')
export class AgentApiAdminController {
  constructor(
    private readonly admin: AgentAdminService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get('overview')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Bảng/trường agent đọc được, hạn mức, tình trạng khoá' })
  @HttpCode(HttpStatus.OK)
  overview(@AuthUser() user: UserDocument): GetAgentAdminOverviewResDto {
    this.logger.info({ message: JSON.stringify({ method: 'GET', url: '/agent-admin/overview', userId: user._id }) });
    return { success: true, data: this.admin.overview() };
  }

  /**
   * KHÔNG ghi giá trị khoá ra nhật ký và không nhận tham số nào — khoá không
   * bao giờ đi vào đường dẫn hay query (`API-3` BR-3).
   */
  @Get('key')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Giá trị khoá agent — chỉ gọi khi người xem bấm hiện' })
  @HttpCode(HttpStatus.OK)
  key(@AuthUser() user: UserDocument): GetAgentAdminKeyResDto {
    this.logger.info({ message: JSON.stringify({ method: 'GET', url: '/agent-admin/key', userId: user._id }) });
    return { success: true, data: this.admin.key() };
  }
}
