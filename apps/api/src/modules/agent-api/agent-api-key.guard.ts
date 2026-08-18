import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import crypto from 'crypto';

import { ApiConfigService } from '@/shared/services/api-config.service';

/**
 * Xác thực bộ API agent bằng khoá riêng trong cấu hình môi trường (`API-1`,
 * BR-1, AC-01). Cùng khuôn mẫu đang chạy của `TelegramWebhookController`:
 * route khai `@Auth([], [], { public: true })` để bỏ qua JWT, rồi guard này
 * chặn bằng header.
 *
 * Guard chạy TRƯỚC mọi validate tham số. Đây là điểm dễ hỏng nhất của AC-01:
 * nếu validate chạy trước, một lời gọi thiếu khoá tới bảng sai sẽ nhận 400
 * thay vì 401, và chính sự khác biệt đó xác nhận cho người dò biết bảng nào
 * tồn tại.
 *
 * Mọi trường hợp thiếu / sai / rỗng đều ném `UnauthorizedException` KHÔNG tham
 * số, nên thân phản hồi giống hệt nhau trên cả 5 endpoint.
 */
@Injectable()
export class AgentApiKeyGuard implements CanActivate {
  constructor(private readonly config: ApiConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const expected = this.config.agentApi.key;

    // Chưa cấu hình khoá thì ĐÓNG, không có chế độ "mở khi thiếu cấu hình".
    if (!expected) throw new UnauthorizedException();

    const raw = request.headers['x-agent-api-key'];
    const provided = typeof raw === 'string' ? raw : '';
    if (!provided) throw new UnauthorizedException();

    // So sánh trên bản băm: độ dài khác nhau không làm lộ thông tin qua thời gian.
    const a = crypto.createHash('sha256').update(provided).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    if (!crypto.timingSafeEqual(a, b)) throw new UnauthorizedException();

    return true;
  }
}
