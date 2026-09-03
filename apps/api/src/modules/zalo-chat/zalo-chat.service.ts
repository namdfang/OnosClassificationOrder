import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ZaloProxyUser } from '@zero-126/zalo-sdk/next';
import { RoleType } from 'shared';

import { ApiConfigService } from '../../shared/services/api-config.service';
import { ZALO_SESSION_COOKIE, ZALO_SESSION_TTL_SEC } from './zalo-chat.constants';

/** Payload của cookie phiên — vừa đủ để proxy dựng 4 header danh tính. */
interface PhienZalo {
  sub: string;
  ten: string;
  vai: ZaloProxyUser['role'];
}

/**
 * Cấp và đọc phiên cho màn chat Zalo.
 *
 * Cố ý KHÔNG tự nghĩ ra cơ chế ký mới: dùng luôn cặp khoá RS256 của hệ thống
 * (`JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`) — một nơi để xoay khoá, một nơi để hỏng.
 */
@Injectable()
export class ZaloChatService {
  private readonly logger = new Logger(ZaloChatService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ApiConfigService,
  ) {}

  /**
   * Vai trò trong engine suy từ vai trò hệ thống.
   *
   * Đợt đầu CHỈ SuperAdmin/Admin được vào, và vào là `owner` (thấy mọi hội
   * thoại). Người khác trả `null` → controller từ chối, không cấp cookie.
   * Muốn mở cho Manager/Support sau này thì thêm nhánh `member` ở đây, KHÔNG
   * phải nới ở proxy — proxy chỉ đọc lại thứ đã ký.
   */
  vaiTro(role?: string): ZaloProxyUser['role'] | null {
    if (role === RoleType.SuperAdmin || role === RoleType.Admin) return 'owner';

    return null;
  }

  /** Ký cookie phiên. Trả về chuỗi `Set-Cookie` đầy đủ. */
  async cookiePhien(userId: string, displayName: string, vai: ZaloProxyUser['role']): Promise<string> {
    const token = await this.jwtService.signAsync(
      { sub: userId, ten: displayName, vai } satisfies PhienZalo,
      { privateKey: this.configService.authConfig.privateKey, expiresIn: ZALO_SESSION_TTL_SEC },
    );

    // `Path` hẹp đúng đường proxy: cookie này không đi kèm mọi request của app.
    // `SameSite=Lax` đủ vì SDK gọi same-origin; `Secure` chỉ bật ở production
    // (dev có thể chạy http trên máy trong mạng).
    const phan = [
      `${ZALO_SESSION_COOKIE}=${token}`,
      'Path=/api/zalo-multi',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${ZALO_SESSION_TTL_SEC}`,
    ];
    if (this.configService.isProduction) phan.push('Secure');

    return phan.join('; ');
  }

  /** Cookie xoá phiên (đăng xuất khỏi màn chat). */
  cookieXoa(): string {
    return `${ZALO_SESSION_COOKIE}=; Path=/api/zalo-multi; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  /** Đọc phiên từ header `cookie` thô. Trả `null` nếu thiếu/hỏng/hết hạn. */
  async docPhien(cookieHeader?: string): Promise<ZaloProxyUser | null> {
    const token = this.layCookie(cookieHeader, ZALO_SESSION_COOKIE);
    if (!token) return null;

    try {
      const payload = await this.jwtService.verifyAsync<PhienZalo>(token, {
        publicKey: this.configService.authConfig.publicKey,
        algorithms: ['RS256'],
      });
      if (!payload?.sub || !payload.vai) return null;

      return { id: payload.sub, displayName: payload.ten, role: payload.vai, scopes: [] };
    } catch {
      // Hết hạn là chuyện thường (phiên 8 giờ) — không ghi log ồn.
      return null;
    }
  }

  /** Tự tách cookie thay vì thêm plugin: chỉ cần đúng một tên, không cần ký/giải mã. */
  private layCookie(header: string | undefined, ten: string): string | null {
    if (!header) return null;
    for (const phan of header.split(';')) {
      const i = phan.indexOf('=');
      if (i < 0) continue;
      if (phan.slice(0, i).trim() === ten) return phan.slice(i + 1).trim();
    }

    return null;
  }
}
