import { patchNestjsSwagger } from '@anatine/zod-nestjs';
import type { INestApplication } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import crypto from 'crypto';

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
    .setTitle('PrintEra Private API')
    .setDescription(
      `### REST

Routes is following REST standard (Richardson level 3)

<details><summary>Detailed specification</summary>
<p>

**List:**
- \`GET /<resources>/\`
  - Get the list of **<resources>** as admin
- \`GET /user/<user_id>/<resources>/\`
  - Get the list of **<resources>** for a given **<user_id>**
  - Output a **403** if logged user is not **<user_id>**

**Detail:**
- \`GET /<resources>/<resource_id>\`
  - Get the detail for **<resources>** of id **<resource_id>**
  - Output a **404** if not found
- \`GET /user/<user_id>/<resources>/<resource_id>\`
  - Get the list of **<resources>** for a given **user_id**
  - Output a **404** if not found
  - Output a **403** if:
    - Logged user is not **<user_id>**
    - The **<user_id>** have no access to **<resource_id>**

**Creation / Edition / Replacement / Suppression:**
- \`<METHOD>\` is:
  - **POST** for creation
  - **PATCH** for update (one or more fields)
  - **PUT** for replacement (all fields, not used)
  - **DELETE** for suppression (all fields, not used)
- \`<METHOD> /<resources>/<resource_id>\`
  - Create **<resources>** with id **<resource_id>** as admin
  - Output a **400** if **<resource_id>** conflicts with existing **<resources>**
- \`<METHOD> /user/<user_id>/<resources>/<resource_id>\`
  - Create **<resources>** with id **<resource_id>** as a given **user_id**
  - Output a **409** if **<resource_id>** conflicts with existing **<resources>**
  - Output a **403** if:
    - Logged user is not **<user_id>**
    - The **<user_id>** have no access to **<resource_id>**
</p>
</details>`,
    )
    .addBearerAuth()
    // MỘT ô nhập duy nhất cho khoá agent, thay cho `@ApiHeader` lặp ở từng
    // endpoint (`API-5`). Cùng `persistAuthorization: true` bên dưới: nhập một
    // lần là mọi lời gọi thử trong nhóm agent đều mang đúng khoá đó.
    .addApiKey({ type: 'apiKey', name: 'X-Agent-Api-Key', in: 'header' }, SWAGGER_AGENT_KEY_SECURITY);

  if (process.env.API_VERSION) {
    documentBuilder.setVersion(process.env.API_VERSION);
  }

  patchNestjsSwagger();
  const document = SwaggerModule.createDocument(app, documentBuilder.build());

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
