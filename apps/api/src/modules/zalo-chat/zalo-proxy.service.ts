import { Readable } from 'node:stream';

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ZaloProxyOptions } from '@zero-126/zalo-sdk/next';
import { createZaloProxyHandler, createZaloSocketProxyHandler } from '@zero-126/zalo-sdk/next';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { ApiConfigService } from '../../shared/services/api-config.service';
import { ZALO_PROXY_PREFIX } from './zalo-chat.constants';
import { ZaloChatService } from './zalo-chat.service';

type Handler = (req: Request, ctx?: { params?: Promise<{ path?: string[] }> }) => Promise<Response>;

/**
 * Cầu nối giữa app và Zalo Engine.
 *
 * Vì sao DÙNG LẠI handler của nhà cung cấp thay vì tự viết forward: hợp đồng
 * với engine không chỉ là "ký HMAC rồi chuyển tiếp" — còn có danh sách header
 * phải bỏ, trần chờ RIÊNG cho các đường chậm (gửi tệp 60s, phần còn lại 30s),
 * đường `push/sw.js` phải phục vụ tại app với đúng MIME, và `directory` KHÔNG
 * được chuyển sang engine. Chép tay bốn thứ đó là bốn chỗ để lệch âm thầm mỗi
 * lần nhà cung cấp ra bản mới.
 *
 * Việc còn lại chỉ là dịch Fastify ⇄ Web `Request`/`Response`.
 *
 * Gắn ở hook `onRequest`, KHÔNG phải controller Nest: hook chạy TRƯỚC khâu đọc
 * body, nên `req.raw` còn nguyên luồng — điều kiện bắt buộc để chuyển tiếp
 * multipart (gửi ảnh/tệp) mà không phải nạp cả tệp vào RAM.
 */
@Injectable()
export class ZaloProxyService implements OnModuleInit {
  private readonly logger = new Logger(ZaloProxyService.name);
  private rest!: Record<string, Handler>;
  private socket!: Record<string, Handler>;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly configService: ApiConfigService,
    private readonly chatService: ZaloChatService,
  ) {}

  onModuleInit(): void {
    const { url, secret } = this.configService.zaloEngine;
    const opts: ZaloProxyOptions = {
      engineUrl: url,
      engineSecret: secret,
      getUser: (req) => this.chatService.docPhien(req.headers.get('cookie') ?? undefined),
    };
    this.rest = createZaloProxyHandler(opts) as unknown as Record<string, Handler>;
    this.socket = createZaloSocketProxyHandler(opts) as unknown as Record<string, Handler>;

    if (!url || !secret) {
      this.logger.warn('[zalo-chat] chưa cấu hình ZALO_ENGINE_URL/ZALO_ENGINE_SECRET — màn chat sẽ báo lỗi cấu hình.');
    }

    // `main-nest.ts` còn dựng một tiến trình MICROSERVICE nạp cùng AppModule —
    // ở đó không có HTTP adapter, `httpAdapter` là null. Không chặn ở đây thì
    // tiến trình đó sập ngay lúc khởi động (đã dính một lần).
    const adapter = this.adapterHost?.httpAdapter;
    if (!adapter || typeof adapter.getInstance !== 'function') {
      this.logger.log('[zalo-chat] không có HTTP adapter (tiến trình microservice) — bỏ qua gắn proxy.');

      return;
    }

    const fastify = adapter.getInstance<FastifyInstance>();
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.url.startsWith(`${ZALO_PROXY_PREFIX}/`) && req.url !== ZALO_PROXY_PREFIX) return;
      await this.chuyenTiep(req, reply);
    });
    this.logger.log(`[zalo-chat] proxy sẵn sàng tại ${ZALO_PROXY_PREFIX}/* → ${url || '(chưa cấu hình)'}`);
  }

  private async chuyenTiep(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const duongDan = req.url.split('?')[0];
    const doanSau = duongDan.slice(ZALO_PROXY_PREFIX.length).replace(/^\//, '');
    // Giải mã từng đoạn: handler của nhà cung cấp mã hoá lại khi dựng URL đích,
    // giống hệt cách Next đưa `params.path` vào (đã giải mã).
    const doan = doanSau ? doanSau.split('/').map((s) => decodeURIComponent(s)) : [];
    const laSocket = doan[0] === 'socket';

    const co = laSocket ? this.socket : this.rest;
    const handler = co[req.method] as Handler | undefined;
    if (!handler) {
      await reply.status(405).send({ error: 'method_not_allowed' });

      return;
    }

    const request = this.doiSangWebRequest(req);
    let res: Response;
    try {
      res = await handler(request, { params: Promise.resolve({ path: laSocket ? doan.slice(1) : doan }) });
    } catch (error) {
      this.logger.error(`[zalo-chat] proxy hỏng ở ${duongDan}: ${(error as Error).message}`);
      await reply.status(502).send({ error: 'proxy_failed' });

      return;
    }

    res.headers.forEach((value, key) => {
      // `set-cookie` có thể nhiều dòng — Headers gộp bằng dấu phẩy, tách lại.
      if (key.toLowerCase() === 'set-cookie') reply.header(key, value.split(/,(?=[^;]+?=)/));
      else reply.header(key, value);
    });
    reply.status(res.status);
    await reply.send(res.body ? Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]) : null);
  }

  private doiSangWebRequest(req: FastifyRequest): Request {
    const host = req.headers.host ?? 'localhost';
    const scheme = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol ?? 'http';
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      for (const item of Array.isArray(v) ? v : [v]) headers.append(k, String(item));
    }

    const coBody = req.method !== 'GET' && req.method !== 'HEAD';

    return new Request(`${scheme}://${host}${req.url}`, {
      method: req.method,
      headers,
      // Luồng thô: chưa qua bộ đọc body của Fastify vì hook này chạy ở `onRequest`.
      body: coBody ? (Readable.toWeb(req.raw) as ReadableStream) : undefined,
      // Bắt buộc khi body là luồng (fetch của Node 18+).
      duplex: 'half',
    } as RequestInit);
  }
}
