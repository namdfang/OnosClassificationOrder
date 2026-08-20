import { patchNestjsSwagger } from '@anatine/zod-nestjs';
import type { INestApplication } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import crypto from 'crypto';

import { AgentApiModule } from './modules/agent-api/agent-api.module';

/** Tên định danh của ô nhập khoá agent trong Swagger — dùng ở `@ApiSecurity`. */
export const SWAGGER_AGENT_KEY_SECURITY = 'agent-api-key';

/**
 * Biến môi trường giữ khoá mở trang Swagger.
 *
 * DÙNG CHUNG với khoá của bộ API agent (`API-7`) — người dùng chọn vậy sau khi
 * được nêu rõ hệ quả: `AGENT_API_KEY` hiển thị công khai trên trang quản trị
 * của `API-3`, nên ai mở được trang đó cũng vào được Swagger, tức thấy **toàn
 * bộ** bề mặt API chứ không riêng nhóm agent. Cả hai đều giới hạn ở
 * SuperAdmin/Admin nên phạm vi người thấy là như nhau; cái mất là tính tách
 * bạch giữa hai mức nhạy cảm. Đây là RỦI RO ĐÃ CHẤP NHẬN, không phải bug.
 *
 * Hệ quả vận hành: thiếu biến này thì **đóng cùng lúc** cả bộ API agent lẫn
 * trang Swagger.
 */
export const SWAGGER_KEY_ENV = 'AGENT_API_KEY';

const ACCESS_COOKIE = 'swagger_access';
const COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;

const sha256 = (value: string): Buffer => crypto.createHash('sha256').update(value).digest();

const sameSecret = (a: string, b: string): boolean => crypto.timingSafeEqual(sha256(a), sha256(b));

/**
 * `?key=` mở trang, cookie giữ phiên (`API-5`).
 *
 * Vì sao cần cookie chứ không chỉ đọc query: Swagger UI tải tiếp
 * `swagger-ui-init.js` — file CHỨA TOÀN BỘ đặc tả API — và những request đó
 * không mang lại query của trang. Cho asset đi tự do thì coi như không khoá gì;
 * bắt mọi request phải có `?key=` thì trang vỡ. Nên lần đầu có khoá đúng sẽ đặt
 * một cookie ngắn hạn, giới hạn `Path=/documentation`, `HttpOnly`.
 *
 * Cookie mang **bản băm** của khoá, không mang khoá thô: nó nằm trong máy người
 * dùng và không có lý do gì để cất bí mật ở đó.
 */
function guardDocumentationRoute(app: INestApplication): void {
  const fastify = (app as NestFastifyApplication).getHttpAdapter().getInstance();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- chỉ đọc url/headers/query, generics của Fastify hook quá nặng cho việc này
  fastify.addHook('onRequest', async (request: any, reply: any) => {
    const url: string = request.url ?? '';
    if (!url.startsWith('/documentation')) return;

    const expected = process.env[SWAGGER_KEY_ENV] || '';

    // Chưa cấu hình thì ĐÓNG HẲN, kèm tên biến cần đặt (AC-02). Mở-khi-thiếu-cấu-hình
    // nghĩa là triển khai xong trang vẫn tự do cho tới khi ai đó nhớ ra — yêu cầu
    // bị vô hiệu trong im lặng, đúng thứ không được phép xảy ra ở đây.
    if (!expected) {
      await reply
        .code(503)
        .type('text/plain; charset=utf-8')
        .send(`Trang tài liệu đang đóng: chưa cấu hình ${SWAGGER_KEY_ENV}. Đặt biến này rồi khởi động lại.`);
      return;
    }

    const fromQuery = typeof request.query?.key === 'string' ? request.query.key : '';
    if (fromQuery && sameSecret(fromQuery, expected)) {
      const token = sha256(expected).toString('hex');
      void reply.header(
        'set-cookie',
        `${ACCESS_COOKIE}=${token}; Path=/documentation; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; SameSite=Strict`,
      );
      return;
    }

    const cookie = readCookie(request.headers?.cookie, ACCESS_COOKIE);
    if (cookie && cookie === sha256(expected).toString('hex')) return;

    await reply
      .code(401)
      .type('text/plain; charset=utf-8')
      .send('Trang tài liệu cần khoá truy cập. Mở lại kèm ?key=<khoá> trên địa chỉ.');
  });
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

export function setupSwagger(app: INestApplication) {
  const documentBuilder = new DocumentBuilder()
    .setTitle('OnosFactory Agent API')
    .setDescription(
      `Trang này mô tả **bộ API dành cho AI agent** — 5 endpoint chỉ đọc dưới \`/api/v1/agent\`.

Đây **không** phải bản đồ toàn hệ thống. Endpoint nội bộ của OnosFactory cố ý không có mặt ở đây, kể cả
trong đặc tả JSON thô: chúng vẫn chạy bình thường, chỉ là không được mô tả trên trang này.

**Xác thực:** header \`X-Agent-Api-Key\`. Bấm *Authorize* rồi dán khoá vào ô \`${SWAGGER_AGENT_KEY_SECURITY}\`;
nhập một lần là mọi lời gọi thử bên dưới đều mang đúng khoá đó.

**Tài liệu nghiệp vụ** cho agent — bảng dữ liệu, ý nghĩa từng giá trị, cách viết điều kiện lọc, và những
thứ agent không được phép thấy — lấy qua \`GET /api/v1/agent/docs\`.`,
    )
    // KHÔNG khai `addBearerAuth()` (`HF-1`). Trang này chỉ mô tả nhóm endpoint
    // agent, mà cửa của chúng là `AgentApiKeyGuard` chứ không phải JWT — khai
    // bearer sẽ thêm một ô "bearer (http, Bearer)" vào hộp Authorize, ô đó
    // không dùng được vào việc gì và khiến người đọc tưởng phải đăng nhập.
    // Nếu sau này dựng lại trang tài liệu cho API nội bộ thì khai bearer ở
    // trang ĐÓ, không khai lại ở đây.
    // MỘT ô nhập duy nhất cho khoá agent, thay cho `@ApiHeader` lặp ở từng
    // endpoint (`API-5`). Cùng `persistAuthorization: true` bên dưới: nhập một
    // lần là mọi lời gọi thử trong nhóm agent đều mang đúng khoá đó.
    .addApiKey({ type: 'apiKey', name: 'X-Agent-Api-Key', in: 'header' }, SWAGGER_AGENT_KEY_SECURITY);

  if (process.env.API_VERSION) {
    documentBuilder.setVersion(process.env.API_VERSION);
  }

  patchNestjsSwagger();

  // `include` là chỗ yêu cầu `API-15` được thực thi, và nó nằm ở tầng SINH ĐẶC
  // TẢ chứ không phải tầng hiển thị: bộ quét của `@nestjs/swagger` chỉ đi vào
  // module được liệt kê, nên controller nội bộ không được đọc tới lần nào.
  // Đường dẫn của chúng vì thế KHÔNG CÓ MẶT trong JSON mà trang tải về, không
  // phải là có mặt nhưng bị giấu khỏi màn hình — ẩn ở lớp hiển thị thì ai mở
  // đặc tả thô vẫn thấy đủ, mà người mở được chính là người ta muốn giấu.
  //
  // Đây thuần tuý là thay đổi TÀI LIỆU: `include` không đụng gì tới bộ định
  // tuyến. Mọi endpoint nội bộ vẫn đăng ký, vẫn chạy, vẫn cùng cơ chế xác thực
  // như trước.
  //
  // Bên trong module này còn `AgentApiAdminController` — bề mặt quản trị nội
  // bộ — bị loại riêng bằng `@ApiExcludeController` tại chỗ khai báo nó.
  const document = SwaggerModule.createDocument(app, documentBuilder.build(), {
    include: [AgentApiModule],
  });

  guardDocumentationRoute(app);

  SwaggerModule.setup(
    'documentation',
    app,
    { ...document, openapi: '3.1.0' },
    {
      swaggerOptions: {
        persistAuthorization: true,
      },
    },
  );

  console.info(`Documentation: http://localhost:${process.env.PORT}/documentation?key=<${SWAGGER_KEY_ENV}>`);
}
