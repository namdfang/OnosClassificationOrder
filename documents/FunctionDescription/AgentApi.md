# Agent API — Function Description

> **File BE:** `apps/api/src/modules/agent-api/` (controller, guard, repository, 4 service, registry 5 file, 2 hàm thuần che dữ liệu)
> **File FE:** không có — bên tiêu thụ là AI agent nội bộ, không phải trình duyệt
> **Shared:** `packages/shared/dtos/agent-api.dto.ts`
> **Tài liệu cho agent:** `documents/AgentGuide/DataDictionary.md`, `documents/AgentGuide/ImportantNotes.md`
> **API:** `/api/v1/agent/*`
> **Nguồn yêu cầu:** task `API-1` — SRS `.devtasks/srs/API-1.md`, thiết kế `.devtasks/design/API-1.md`

## 1. Overview

Bộ API **chỉ đọc** phục vụ một AI agent nội bộ trả lời khách hàng qua tin nhắn. Agent cần hai thứ: **hiểu nghiệp vụ** (đọc tài liệu) và **tra được dữ liệu thực** (đọc đơn của khách).

Vì agent nói chuyện trực tiếp với khách, **mọi dữ liệu agent đọc được đều phải coi là có nguy cơ bị nói ra cho khách**. Toàn bộ thiết kế xoay quanh một nguyên tắc:

> **Danh sách trắng ở tầng TRƯỜNG, cấm là mặc định.**

Bảng không có tên trong registry là không tồn tại. Trường không được liệt kê tường minh thì không đọc được, không lọc được, không nhóm được, không sắp xếp được.

**Ba loại câu hỏi agent cố ý KHÔNG trả lời được**, đều chuyển cho người thật: địa chỉ giao hàng · tiền của đơn · ai đang xử lý đơn.

## 2. Luồng hoạt động

```
Agent  ──[X-Agent-Api-Key]──►  AgentApiKeyGuard          401 nếu thiếu/sai/rỗng, thân lỗi GIỐNG HỆT NHAU
                                     │
                                     ▼
                               AgentApiController         log Winston, đo thời gian
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
              AgentReadService  AgentQueryService  AgentDocsService
                    │                │                │
                    └──── registry ──┘                │  danh mục dựng 1 lần lúc boot
                              │                       │
                              ▼                       ▼
                      AgentApiRepository        đọc file .md
                       (find / aggregate)
                              │
                              ▼
                     mask-free-text + order-log-value-policy
                              │
                              ▼
                        AgentAuditService  → collection `agentApiLogs`
```

Guard chạy **trước** mọi validate tham số. Nếu làm ngược lại, một lời gọi thiếu khoá tới bảng sai sẽ nhận 400 thay vì 401, và chính sự khác biệt đó xác nhận cho người dò biết bảng nào tồn tại.

## 3. API / Schema

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/v1/agent/tables` | Liệt kê 11 bảng đọc được, kèm mô tả và danh sách trường trả về |
| `GET` | `/v1/agent/tables/:table/rows` | Đọc thô, phân trang theo con trỏ trên `_id`. Query: `limit`, `cursor`, `fields`, `filter` (`API-6`) |
| `POST` | `/v1/agent/query` | Truy vấn có kiểm soát: lọc, sắp xếp, đếm, nhóm, tổng hợp |
| `GET` | `/v1/agent/docs` | Danh mục tài liệu nghiệp vụ |
| `GET` | `/v1/agent/docs/:slug` | Nội dung markdown của một tài liệu |

Tất cả yêu cầu header `X-Agent-Api-Key`, khớp env `AGENT_API_KEY`.

**`filter` trên endpoint đọc bảng** (`API-6`) là điều kiện **dạng chuỗi JSON** — `GET` không có thân
yêu cầu nên nó phải đi qua query string. Nó **dùng lại đúng** bộ dịch của `POST /query`, không có bộ
luật thứ hai: hai đường lọc với hai bộ luật là cách chắc chắn để một ngày chúng lệch nhau, và đường
lỏng hơn sẽ thành lỗ hổng. Chính sách trường giữ nguyên hiệu lực — `filter: 'none'` vẫn không lọc được,
`filter: 'eq'` vẫn chỉ so bằng.

JSON hỏng hoặc toán tử ngoài danh sách trắng trả `400 INVALID_QUERY` chứ không rơi vào 422 của tầng
validate: bảng mã lỗi là hợp đồng với agent. Điều kiện của bên gọi và con trỏ phân trang ghép bằng `$and`, không trộn
nông — điều kiện chạm `_id` mà đè mất con trỏ thì trang sau sẽ lặp lại trang trước.

### DSL truy vấn

```ts
{
  table: string;
  filter?: object;                       // cú pháp MongoDB, sâu tối đa 5 mức
  select?: { kind: 'rows'; fields?: string[]; sort?: AgentSort[]; limit?: number; offset?: number };
  aggregate?: { groupBy?: string[]; metrics: AgentMetric[]; sort?: AgentSort[]; limit?: number };
}
```

`select` và `aggregate` loại trừ nhau. Metric: `count · sum · avg · min · max`.

**Điều kiện lọc dùng cú pháp MongoDB** (`API-8` thay hẳn DSL cây `{field, op, value}` cũ — cú pháp cũ nay bị từ chối kèm thông điệp chỉ sang dạng mới, không im lặng trả kết quả sai). Ba dạng:

```jsonc
{ "status": "active" }                          // rút gọn, ngầm hiểu $eq
{ "productionId": { "$eq": "SQ-01964-03971" } } // một toán tử
{ "quantity": { "$gte": 1, "$lte": 9 } }        // nhiều toán tử trên cùng trường
```

Danh sách trắng toán tử — **ngoài bảng này là bị từ chối**:

| Nhóm | Toán tử |
|---|---|
| So sánh | `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` |
| Tập hợp | `$in` `$nin` (mảng nguyên thuỷ, không rỗng) |
| Tồn tại | `$exists` (boolean) |
| Ghép | `$and` `$or` `$nor` `$not` |
| Tiền tố | `$startsWith` — xem dưới |

Không có `$between` (MongoDB không có); khoảng giá trị viết bằng dạng nhiều toán tử. Mất cú pháp, **không** mất năng lực.

**`$startsWith` là tên không tồn tại trong MongoDB, và đó là chủ ý.** Bên gọi truyền **chuỗi thường**; server escape rồi tự neo `^`, nên không có đường nào để một mẫu biểu thức đi vào và không có ReDoS. `$regex` bị từ chối như mọi toán tử ngoài danh sách trắng. Vì sao không mượn luôn tên `$regex` cho năng lực này: một toán tử mang tên chuẩn MongoDB nhưng ngữ nghĩa khác là **bẫy im lặng** — agent quen Mongo sẽ gửi `".*abc.*"` rồi nhận kết quả rỗng mà không hiểu vì sao. Tên lạ buộc nó tra tài liệu.

**Cú pháp đổi, quyền KHÔNG đổi.** Mỗi cặp (trường, toán tử) vẫn đi qua đúng bộ kiểm cũ: trường `filter: 'none'` không lọc được, trường `filter: 'eq'` chỉ nhận `$eq/$ne/$in/$nin`. Dạng rút gọn tính là `$eq` **trước khi** kiểm mức lọc, nên `{ "userEmail": "a@b.c" }` qua được còn `{ "userEmail": { "$gt": "a" } }` thì không — hai câu chỉ khác nhau một lớp object.

**Không nhận pipeline aggregation thô.** Lý do: tên trường đầu ra khi đó do chính bên gọi đặt (`$project { x: "$shippingAddress.email" }`), nên không có cách nào lọc đầu ra theo tên trường.

### Chính sách trường

```ts
type AgentFieldPolicy = {
  type: 'string' | 'number' | 'date' | 'bool' | 'objectId' | 'enum';
  read: boolean;                      // được xuất hiện trong dữ liệu trả về
  filter: 'none' | 'eq' | 'full';     // 'eq' = chỉ eq/ne/in/nin (thông tin liên hệ khách)
  sortable: boolean;
  groupable: boolean;
  aggregatable?: boolean;
  freeText?: boolean;                 // văn bản gõ tay: đọc nguyên văn nhưng BẮT BUỘC filter='none'
};
```

### Collection mới — `agentApiLogs`

```ts
{ at: Date; capability: string; table?: string; docSlug?: string;
  queryDigest?: unknown; returned: number; durationMs: number;
  outcome: 'ok' | 'denied' | 'error' | 'timeout'; errorCode?: string }
```

Index `{ at: -1 }` cộng TTL 90 ngày, tạo ở `AgentAuditService.onModuleInit()`. Collection này **nằm ngoài registry** nên agent không đọc được nhật ký của chính nó.

### Mã lỗi

| HTTP | `code` | Khi nào |
|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai / rỗng khoá. Thân lỗi giống hệt nhau ở cả 5 endpoint |
| 403 | `TABLE_NOT_ALLOWED` | Bảng ngoài registry. Dùng chung thân lỗi cho bảng cấm và bảng không tồn tại |
| 400 | `FIELD_NOT_ALLOWED` | Trường không đọc/lọc/nhóm/sắp xếp được |
| 400 | `WRITE_NOT_SUPPORTED` | Truy vấn mang ý ghi |
| 400 | `INVALID_QUERY` | Toán tử ngoài danh sách trắng (kể cả nhóm cấm), giá trị không phải nguyên thuỷ, cây quá sâu, JSON hỏng, hoặc **cú pháp lọc CŨ** |
| 408 | `QUERY_TIMEOUT` | Vượt `maxTimeMS` |
| 404 | `DOC_NOT_FOUND` | Slug không có; trả kèm danh mục đang có |
| 503 | `DOCS_UNAVAILABLE` | Không tìm thấy thư mục tài liệu lúc boot |

Thân lỗi: `{ statusCode, success: false, code, message }`, cộng `available` (danh sách slug đang có) ở
riêng `DOC_NOT_FOUND`, cộng `stackTrace` khi chạy môi trường dev.

**`code` tới được bên gọi là nhờ một bộ lọc RIÊNG** (`agent-exception.filter.ts`) gắn vào
`AgentApiController` — `CustomExceptionFilter` dùng chung của repo **dựng lại thân phản hồi từ đầu**
với đúng bốn khoá `statusCode/success/message/stackTrace`, nên mọi trường module ném kèm đều bị vứt
trong im lặng (`QA-2`). Sửa filter chung sẽ đổi hình dạng thân lỗi của **mọi** endpoint trong app, kể
cả Customer Portal, nên bộ lọc riêng chỉ phủ nhánh `/v1/agent/*` và giữ nguyên bốn khoá cũ — thân lỗi
là **siêu tập** của hình dạng trước, không phải hình dạng khác.

Bộ lọc riêng cũng chuyển lỗi của tầng validate (Zod ném `UnprocessableEntityException` → 422) thành
**400 `INVALID_QUERY`** kèm tên trường sai: bảng mã trên là hợp đồng với agent, mà agent không phân
biệt được "tôi gõ sai toán tử" với "máy chủ hỏng" nếu mã trả về không nằm trong bảng.

## 4. UI Components

Không có. Bộ API này không phục vụ trình duyệt và không có màn hình quản trị — khoá cấp bằng biến môi trường.

## 5. Backend logic

### 5.1 Registry — nguồn sự thật duy nhất

`apps/api/src/modules/agent-api/registry/index.ts` → `AGENT_TABLE_REGISTRY`, đúng 11 bảng: `orders`, `orderLogs`, `customers`, `productConfigs`, `productCategories`, `collections`, `promotions`, `factories`, `machineTypes`, `workshopConfigs`, `customer_notifications`.

Không nhánh code nào nhận tên collection từ bên gọi rồi truyền xuống mongoose — luôn phải qua `AgentQueryService.spec()` trước.

### 5.2 Ba lớp chặn ghi và chạy mã

1. `AgentQueryService.assertNoOperatorKeysOutsideFilter()` — quét sâu payload **trừ nhánh `filter`**, từ chối mọi khoá bắt đầu bằng `$` hoặc chứa dấu chấm. Nhánh `filter` có bộ kiểm riêng với danh sách trắng toán tử (`mongo-filter.ts`), chặt hơn vì nó kiểm cả chính sách trường. Hai **hàm riêng** chứ không phải một hàm mang cờ: một hàm có cờ "cho phép `$`" sẽ có ngày bị gọi với cờ bật ở chỗ không nên, mà không gì trong kiểu dữ liệu ngăn được (`API-8`). Chặn `$where`, `$function`, `$accumulator`, `$merge`, `$out`.
2. Zod `.strict()` ở mọi cấp của `AgentQueryZod`.
3. `AgentApiRepository` **chỉ phơi ra** `find`, `aggregate`, `insertLog`, `ensureLogTtlIndex`. Không service nào của module chạm được `save`/`updateOne`/`deleteOne` — BR-3 được giữ bằng hình dạng của lớp, không bằng kỷ luật người viết.

### 5.3 Che dữ liệu bằng cấu trúc

`$project` **luôn** dựng từ registry, không bao giờ từ tham số bên gọi. Trường bị che không được đọc lên khỏi DB — không có bước "lấy hết rồi xoá trường nhạy cảm", vì bước đó chỉ cần quên một nhánh là rò.

Hai bất biến không viết trong yêu cầu mà bắt buộc phải có:

- `sortable ⇒ read` — thứ tự sắp xếp để lộ quan hệ so sánh giữa các bản ghi.
- `groupable ⇒ read` — khoá nhóm hiện nguyên ở kết quả tổng hợp.

Giá vốn (`cost`, `nonShipCost`) và bốn trường giá nội bộ khác của biến thể **không có mặt trong registry ở bất kỳ vai trò nào**: cho lọc trên một trường số bị che là dựng sẵn một máy đoán nhị phân (`cost > 10` trả 0, `cost > 5` trả 3 → ra giá trị thật sau vài lời gọi).

Ranh giới của việc che là **giá nội bộ**, không phải "mọi con số tiền". Ba trường của `productConfigs` dưới đây đọc được vì chúng đã công khai với chính khách hàng ở Customer Portal Catalog (`customer-catalog.service.ts` `$project`) — agent thấy ít hơn khách là bất nhất chứ không an toàn hơn (quyết định `API-2`):

| Trường | Nghĩa | Chính sách |
|---|---|---|
| `printDocument` | URL tài liệu hướng dẫn design/template của sản phẩm | `plain('string')` |
| `printTemplate` | URL template thiết kế chung của sản phẩm | `plain('string')` |
| `usImportTaxPerUnit` | Thuế nhập khẩu US mỗi đơn vị (USD), số công bố với khách | `numeric` — cộng/trung bình được |

### 5.3b Trường lồng: chiếu rồi lọc lại theo từng trường con

`productConfigs` khai bốn trường con của mảng biến thể (`variations.sku`, `variations.attributes`,
`variations.retailPrice`, `variations.status`). Mongo chiếu đường dẫn có dấu chấm và trả về **hình
mảng** — `{ variations: [{ sku, retailPrice }] }` — chứ không phải một khoá tên `'variations.sku'`.

Bước lọc sau khi đọc (`pick-projected.ts`) vì thế phải đi theo đường dẫn, không đọc thẳng
`row['variations.sku']`. Bước này tồn tại để bỏ các khoá chỉ **mượn** để tính chính sách
(`before`/`after` của `orderLogs`, §5.5), nên nó không được nới thành "trả nguyên khối `variations`":
mỗi phần tử mảng chỉ giữ đúng các trường con trong danh sách trắng, nên `variations.cost` vẫn không
có đường nào ra ngoài.

`QA-1` là lúc điều này hỏng: bản đầu đọc `row[key]` với `key` có dấu chấm nên luôn nhận `undefined`
và **im lặng** vứt toàn bộ dữ liệu biến thể — không lỗi, không cảnh báo, agent chỉ thấy sản phẩm
không có biến thể nào. Hai bản sao của cùng đoạn lọc (ở `agent-query.service.ts` và
`agent-read.service.ts`) cùng mắc, nên nay chúng dùng chung một hàm.

### 5.3c Tổng hợp và nhóm trên trường lồng

`$group` chạy thẳng trên bản ghi sẽ nhận **cả mảng** `variations` thay vì từng phần tử: `$sum` ra `0`,
`$avg` ra `null`, `$min`/`$max` trả về chính cái mảng, và nhóm theo `variations.sku` gom theo **bản
ghi** chứ không theo sku. Mọi trường hợp đều HTTP 200 — bên gọi không có tín hiệu nào để biết câu trả
lời đã sai (`QA-3`).

Nên khi truy vấn tổng hợp chạm tới đường dẫn lồng, pipeline thêm `$unwind` gốc mảng **trước** `$group`.
Hai điều cố ý:

- **Chỉ thêm khi thật sự có đường dẫn lồng.** Truy vấn trên trường phẳng giữ nguyên pipeline cũ từng
  bước một, nên không bảng nào khác đổi kết quả.
- **Không `preserveNullAndEmptyArrays`.** Bản ghi không có biến thể nào thì không có giá nào để cộng;
  giữ lại chỉ tạo ra nhóm rỗng giả.

Hệ quả ngữ nghĩa cần biết khi đọc kết quả: một khi đã `$unwind`, `count` đếm theo **phần tử mảng**
(số biến thể) chứ không theo bản ghi. Đó là điều đúng cho câu hỏi "có bao nhiêu biến thể giá X", và là
điều phải nhớ khi trộn `count` với metric trên trường lồng trong cùng một truy vấn.

### 5.4 Văn bản tự do: đọc được nguyên văn, nhưng không lọc được

**Từ `API-11`, văn bản tự do KHÔNG còn bị che email/số điện thoại** — agent đọc nguyên văn. Người dùng
yêu cầu điều này vì văn bản bị cắt xén làm agent trả lời khách dựa trên một bản đã mất ngữ cảnh.

**Rủi ro đã được nêu rõ trước khi quyết, và người dùng vẫn chọn:** agent đang chăm sóc khách A có thể
đọc được email hoặc số điện thoại của khách B nằm trong ghi chú của một đơn khác, rồi vô tình nhắc tới
trong hội thoại. Đây là rò rỉ **chéo giữa các khách hàng**, không phải rò ra ngoài công ty — bộ API vẫn
nằm sau khoá và vẫn chỉ đọc. Ghi ở đây để về sau không ai coi là bug mới phát hiện; siết lại là change
request.

Văn bản tự do vẫn **`filter: 'none'`**, và lý do nay khác trước: không phải vì che chạy ở đầu ra, mà vì
**cho lọc là cho quét toàn bộ dữ liệu theo một mảnh thông tin liên hệ** — dò dần từng ký tự cho tới khi
ra đơn của một người cụ thể. Đọc được nguyên văn một ghi chú đã cầm trên tay là một chuyện; *tìm ra*
đơn nào chứa một số điện thoại là chuyện nặng hơn hẳn. Bất biến I6 giữ nguyên với lý do mới này.

`mask-free-text.ts` **vẫn còn** — nhưng chỉ ở §5.5 cho `before`/`after` của nhật ký,
là cơ chế riêng với danh sách trắng riêng. Ca kiểm quan trọng nhất của nó không đổi: mã sản xuất dạng
`XQ-91783-27005` **không** được che nhầm thành số điện thoại.

### 5.5 Giá trị cũ/mới của nhật ký

`order-log-value-policy.ts` — `before`/`after` chỉ trả khi tên trường bị đổi nằm trong danh sách trắng 17 tên trường nghiệp vụ. Trường ngoài danh sách trả `valueOmitted: true` để agent biết là bị lược, không phải giá trị vốn rỗng.

**Giá trị ra nguyên văn, không còn qua bộ che** (`API-12`). `API-11` bỏ che cho trường văn bản tự do nhưng chỗ này còn che, tạo ra một sự bất nhất agent không có cách nào hiểu: nội dung hiện tại của một ghi chú thì nguyên văn, còn *lịch sử thay đổi của chính ghi chú đó* lại là bản đã che — cùng một nội dung, hai câu trả lời khác nhau tuỳ đường hỏi.

Hệ quả: **danh sách trắng 17 tên nay là chốt chặn duy nhất ở đây**, không còn lớp thứ hai đỡ phía sau. Hai tên trong danh sách là văn bản gõ tay (`cancelReason`, `holdReason`) — đó chính là chỗ email/điện thoại có thể xuất hiện. Nới danh sách này là quyết định của BA, và bất biến I7 khoá cứng con số 17 để không ai nới lặng lẽ.

### 5.6 Tám bất biến có unit test

`registry.spec.ts` và `registry-schema.spec.ts` — đây là phần **thực sự** bảo đảm việc che dữ liệu, vì AC dạng "không bao giờ xuất hiện" không thể chứng minh bằng một bộ test hữu hạn chạy qua API.

| Mã | Bất biến |
|---|---|
| I1 | `sortable ⇒ read`, `groupable ⇒ read` |
| I2 | Danh sách bảng khớp chính xác 11 tên khoá cứng |
| I3 | Không tên trường bị cấm nào lọt vào registry |
| I4 | **Mọi** đường dẫn của schema phải hoặc nằm trong registry, hoặc nằm trong `deliberatelyExcluded` |
| I5 | Metric chỉ trên trường `aggregatable && read` |
| I6 | Văn bản tự do phải `filter: 'none'`, không sắp xếp, không nhóm |
| I6b | Văn bản tự do KHÔNG được nằm ở đường dẫn lồng — `maskRows` chỉ che được trường cấp một (`QA-1`) |
| I7 | Danh sách trắng `before`/`after` khớp chính xác 17 tên |

**I4 là bất biến quan trọng nhất**: thêm một field mới vào `OrderEntity` mà không quyết định gì về nó thì test đỏ. Đây là cơ chế duy nhất ngăn kiểu rò "field mới lọt vào theo mặc định" khi hệ thống tiến hoá — đúng loại lỗi mà test chạy qua API không bao giờ bắt được, vì lúc viết test thì field đó còn chưa tồn tại.

### 5.7 Tài liệu

`AgentDocsService` dựng danh mục **một lần lúc boot** từ `documents/{AgentGuide,FunctionDescription,Architecture}`; `documents/Plans/` cố ý bị loại. `:slug` chỉ tra trong danh mục đó nên bên gọi không bao giờ đưa được đường dẫn xuống `fs`.

Thứ tự tìm thư mục: env `AGENT_DOCS_DIR` → `<thư mục chạy>/agent-docs` → đi ngược lên tìm `documents/` ở gốc repo. `apps/api/scripts/copy-agent-docs.mjs` chạy sau `build`, chép tài liệu vào cả `dist/agent-docs` lẫn `dist-prod/agent-docs` — vì `start:prod` chạy `node dist-prod/main.js` và không có gì bảo đảm gốc repo nằm cạnh tiến trình.

## 6. Performance notes

| Ngưỡng | Giá trị | Env ghi đè |
|---|---|---|
| `limit` mặc định / trần | 50 / 200 (lớn hơn bị **kẹp**, không báo lỗi) | `AGENT_API_MAX_LIMIT` |
| `offset` tối đa | 10.000 | — |
| Số nhóm tối đa của `aggregate` | 1.000 | — |
| `maxTimeMS` đọc thô | 3.000 ms | `AGENT_API_READ_TIMEOUT_MS` |
| `maxTimeMS` truy vấn | 8.000 ms | `AGENT_API_QUERY_TIMEOUT_MS` |
| Tần suất | **600** lời gọi/phút (`API-9` nâng từ 60) | — (hằng số `AGENT_API_RATE_LIMIT_PER_MIN` trong `agent-api.constants.ts`) |

- Hạn mức gọi **không chỉnh được bằng biến môi trường**. `@Throttle(...)` được ước lượng lúc nạp module nên
  không đọc được cấu hình runtime; muốn hạn mức theo cấu hình thì phải chuyển sang named throttler ở
  `ThrottlerModule`, tức đổi cơ chế throttling của cả app. Đổi con số thì sửa hằng số trong
  `agent-api/agent-api.constants.ts` — đó là nơi DUY NHẤT, và trang hướng dẫn Agent API đọc đúng hằng số
  đó nên số hiển thị không lệch khỏi số chặn (`API-4`).
- `maxTimeMS` **chưa từng được dùng ở đâu khác trong repo**. Nó phải có mặt ở mọi `find()` và `aggregate()` của module; sót một chỗ là mất chốt chặn đúng ở chỗ đó.
- `readPreference: 'secondaryPreferred'` — tải đọc của agent rơi vào secondary của replica set, không vào primary đang phục vụ sản xuất.
- Phân trang đọc thô dùng **con trỏ trên `_id`**, không dùng `skip`: bảng `orders` lớn, `skip` sâu vừa chậm vừa vi phạm giới hạn tải.

## 7. Permissions

**Không dùng permission-catalog nội bộ và không dùng JWT.** Xác thực bằng một khoá bí mật duy nhất trong biến môi trường `AGENT_API_KEY`, tách hẳn khỏi mọi tài khoản người thật; thu hồi hoặc đổi khoá không ảnh hưởng tài khoản nào.

Cụm `partnerApi` sẵn có trong `ApiConfigService` **cố ý không được tái dùng**: nó thiết kế cho ký HMAC theo đối tác và chưa module nào dùng, kéo vào đây chỉ làm bề mặt xác thực phức tạp hơn mà không thêm bảo đảm nào cho một bên gọi duy nhất.

So sánh khoá bằng `crypto.timingSafeEqual` trên bản băm SHA-256 — độ dài khác nhau không làm lộ thông tin qua thời gian. Thiếu cấu hình khoá thì mọi endpoint **đóng**, không có chế độ "mở khi thiếu cấu hình".

## 8. Trang Swagger `/documentation` (`API-5`, `API-15`, `HF-1`, `API-16`)

Trang Swagger nằm **ngoài** global prefix `api/v1` và trước `API-5` thì mở tự do — ai biết địa chỉ là
đọc được toàn bộ bề mặt API. Nay nó cần khoá trên địa chỉ:

```
http://<host>/documentation?key=<AGENT_API_KEY>
```

| Tình huống | Hành vi |
|---|---|
| `AGENT_API_KEY` **chưa đặt** | Trang **đóng hẳn**, trả `503` kèm đúng tên biến cần đặt — và bộ API agent cũng đóng, vì cùng một biến |
| Mở không kèm `?key=` hoặc khoá sai | `401`, kèm câu nhắc mở lại kèm `?key=` |
| Khoá đúng | Trang mở, và server đặt cookie phiên `swagger_access` (8 giờ, `HttpOnly`, `Path=/documentation`, `SameSite=Strict`) |

**Vì sao cần cookie chứ không chỉ đọc query:** Swagger UI tải tiếp `swagger-ui-init.js` — file chứa
**toàn bộ** đặc tả API — và những request đó không mang lại query của trang. Cho asset đi tự do thì coi
như không khoá gì; bắt mọi request phải có `?key=` thì trang vỡ. Cookie mang **bản băm** của khoá,
không mang khoá thô.

`/documentation-json` (đặc tả thô) cũng nằm sau khoá, nhưng cookie `Path=/documentation` **không** áp
cho nó theo quy tắc so khớp đường dẫn của cookie — nên tải file này phải kèm `?key=` riêng. Đó là
hành vi mong muốn: mọi đường vào đặc tả đều đi qua khoá.

**Chưa cấu hình thì đóng, không mở** — đây là lựa chọn có chủ ý giữa hai hành vi mà yêu cầu cho phép:
mở-khi-thiếu-cấu-hình nghĩa là triển khai xong trang vẫn tự do cho tới khi ai đó nhớ ra, tức yêu cầu
khoá trang bị vô hiệu trong im lặng. Đóng kèm tên biến thì người dev biết ngay phải làm gì.

**Khoá nằm trên URL** nên đi vào lịch sử trình duyệt, log truy cập và referrer. Đó là hệ quả cố hữu của
cách mở bằng đường dẫn mà người dùng đã chọn, không phải lỗi cài đặt — đổi lại là dán link cho nhau
được.

Trang Swagger **dùng chung `AGENT_API_KEY`** với bộ API agent (`API-7`). Người dùng chọn vậy sau khi
được nêu rõ hệ quả: khoá agent hiển thị công khai trên trang quản trị của `API-3`, nên ai mở được trang
đó cũng vào được Swagger. Cả hai đều giới hạn ở SuperAdmin/Admin nên phạm vi người thấy là như nhau;
cái mất là tính tách bạch giữa hai mức nhạy cảm. Đây là **rủi ro đã chấp nhận**, không phải bug mới;
muốn tách lại thì mở change request.

`API-15` đã thu hẹp phần còn lại của rủi ro đó: người qua được khoá **không còn thấy toàn bộ bề mặt
API** nữa, chỉ thấy nhóm agent (xem §8.1).

Hệ quả vận hành: thiếu `AGENT_API_KEY` là **đóng cùng lúc** cả bộ API agent lẫn trang tài liệu.

Khoá agent trong Swagger là **ô nhập duy nhất trong hộp Authorize** (security scheme `agent-api-key`),
khai ở `DocumentBuilder.addApiKey(...)` và gắn vào controller bằng `@ApiSecurity`, thay cho `@ApiHeader`
vốn bắt nhập lại ở từng endpoint. Cùng với `persistAuthorization: true`, nhập một lần là mọi lời gọi thử
đều mang đúng khoá. Đây chỉ là phần khai báo tài liệu — cửa thật vẫn là `AgentApiKeyGuard`.

**Không còn ô `bearer` (`HF-1`).** Trước đó hộp Authorize có thêm một ô `bearer (http, Bearer)` không
dùng được vào việc gì, và đặc tả khai 5 endpoint agent là cần **cả** khoá agent lẫn JWT — sai, vì cửa
của chúng chỉ là `AgentApiKeyGuard`. Nguyên nhân ở `apps/api/src/decorators/http.decorator.ts`: `Auth()`
gắn `ApiBearerAuth()` **vô điều kiện**, nên route khai `{ public: true }` vẫn bị dán nhãn JWT. Nay nhãn
đó chỉ gắn cho route thật sự đi qua JWT, và `DocumentBuilder` không khai `addBearerAuth()` nữa.

`ApiBearerAuth` là decorator **tài liệu**, không phải guard — sửa nó không đổi quyền gọi của bất kỳ
route nào. Cửa vẫn là `AuthGuard({ public })` khai ngay cạnh nó. Dựng lại trang tài liệu cho API nội bộ
về sau thì khai bearer ở **trang đó**, đừng khai lại ở trang agent.

### 8.2. Mô tả endpoint dựng từ nguồn chung, không chép tay (`API-16`)

Yêu cầu người dùng: trang quản trị `/adm/settings/agent-api` là **chuẩn**, trang tài liệu phải nói cùng
một thứ và đạt cùng mức hướng dẫn. Điều then chốt là **"đồng bộ" không phải chép**: chép tay thì hai bản
lệch nhau ngay lần sửa đầu, và điều đó đã xảy ra ở `API-14` — trang còn dạy cú pháp lọc cũ sau khi
`API-8` đổi cú pháp.

Mô tả 5 endpoint nằm ở `apps/api/src/modules/agent-api/agent-swagger-guide.ts`, dựng từ hai nguồn:

| Phần nội dung | Nguồn | Sửa một chỗ thì |
|---|---|---|
| Danh sách bảng + mô tả từng bảng | `AGENT_TABLE_REGISTRY` — đúng nguồn trang quản trị đọc qua `GET /agent-admin/overview` | **cả hai nơi cùng đổi**, không phải sửa hai chỗ |
| Hạn mức gọi | `AGENT_API_RATE_LIMIT_PER_MIN` — đúng hằng số `@Throttle` dùng | con số trên tài liệu không thể lệch con số máy chủ áp |
| Nhãn năng lực · nghĩa 8 mã lỗi · mã HTTP · ví dụ curl | `packages/shared/constants/agent-api-guide.ts` | frontend vẫn giữ bản i18n riêng — xem đoạn dưới |

**Đã kiểm bằng cách làm thật, không suy luận:** đổi một dòng `description` trong registry rồi đọc lại cả
hai đầu ra — `swagger-ui-init.js` của trang tài liệu **và** `GET /agent-admin/overview` của trang quản
trị — cả hai cùng đổi theo.

**Phần chưa dùng chung được, và vì sao.** Nhãn năng lực và nghĩa mã lỗi hiện tồn tại hai bản: hằng số ở
`packages/shared` và key i18n trong `apps/web/src/i18n/locales/{vi,en}/agentApi.json`. Bỏ bản i18n đi
nghĩa là **đổi trang quản trị**, mà đó là thứ `API-16` §4 để ngoài phạm vi — trang là chuẩn, không phải
thứ bị sửa theo. Đặt hằng số ở `packages/shared` (chứ không ở `apps/api`) là để ngày phạm vi được mở,
frontend chỉ việc bỏ key i18n và đọc thẳng hằng số, **không phải đụng backend lần nữa**.

Trong lúc chờ, thứ giữ hai bên không lệch là `agent-guide-sync.spec.ts`:

- so **từng ký tự** nhãn năng lực và nghĩa mã lỗi với `vi/agentApi.json`;
- kiểm `en/agentApi.json` có **đúng bộ khoá** (bản dịch nên không so chuỗi);
- và phần đáng giá nhất: so bảng mã HTTP với **mã trạng thái thật** mà từng hàm trong `agent-errors.ts`
  ném ra, rồi mới so tiếp với bảng `ERROR_HTTP` của frontend. So hai bảng với nhau thì cả hai cùng sai
  vẫn xanh; neo vào hàm dựng lỗi thì không.

Test này là **test backend đọc file frontend** — trông sai, nhưng repo chỉ `apps/api` có Jest nên đó là
chỗ duy nhất đặt được. Lý do ghi ngay đầu file để nó không bị dọn nhầm.

> Vì sao phần neo-vào-lỗi-thật đáng giá: khi viết bảng mã HTTP lần đầu, DEV đoán sai **ba trên tám**
> dòng và chỉ phát hiện vì mở mã nguồn ra đọc. Ba bản chép mà không có gì đối chiếu thì sai kiểu đó chỉ
> lộ ra khi đã có người thật đọc tài liệu rồi làm theo.

### 8.1. Trang chỉ mô tả nhóm agent (`API-15`)

Đặc tả mà trang tải về **chỉ chứa 5 endpoint dưới `/api/v1/agent`**. Endpoint nội bộ — đơn hàng, khách
hàng, người dùng, phân quyền, Customer Portal, cấu hình — không có mặt trong đó.

**Chặn ở tầng sinh đặc tả, không ở tầng hiển thị.** `setup-swagger.ts` truyền
`{ include: [AgentApiModule] }` cho `SwaggerModule.createDocument`, nên bộ quét của `@nestjs/swagger`
không đi vào module nội bộ lần nào. Khác biệt này quan trọng: ẩn ở lớp hiển thị thì đường dẫn vẫn nằm
trong JSON, ai mở đặc tả thô vẫn đọc được đủ — mà người mở được chính là người ta muốn giấu.

`AgentApiAdminController` nằm **cùng module** nhưng là bề mặt quản trị nội bộ (JWT + vai), nên bị loại
riêng bằng `@ApiExcludeController()` tại chỗ khai báo nó. Không có nó thì `include` sẽ kéo theo cả
`/v1/agent-admin/*` — đúng loại endpoint yêu cầu này muốn giấu.

**Không endpoint nào đổi hành vi.** `include` chỉ tác động tới bộ sinh tài liệu, không tới bộ định
tuyến: mọi endpoint nội bộ vẫn đăng ký, vẫn chạy, vẫn cùng cơ chế xác thực. `/v1/agent-admin/*` vẫn
phục vụ trang hướng dẫn trong `/adm` bình thường dù đã biến mất khỏi tài liệu.

Số đo trước/sau, lấy từ `swagger-ui-init.js` mà trang thật tải về trên API dev:

| | Trước | Sau |
|---|---|---|
| Kích thước đặc tả | ~600 KB | **12,2 KB** |
| Số đường dẫn | toàn hệ thống | **5**, tất cả dưới `/api/v1/agent` |
| Số schema trong `components` | hàng trăm | **1** |

**Cái mất:** không còn Swagger cho API nội bộ, kể cả ở máy dev. Repo bù được phần lớn nhờ DTO Zod dùng
chung trong `packages/shared` — FE import thẳng cùng kiểu, nên Swagger không phải nguồn duy nhất biết
hình dạng request/response. Phần thật sự mất là chỗ **bấm thử endpoint nội bộ ngay trên trình duyệt**.
Nếu chỗ đó cần thiết thì hướng đã đề xuất là dựng trang thứ hai chỉ bật ngoài môi trường production —
xem note ký `implement` của `API-15`; BA duyệt trước khi làm.

## 9. Bề mặt quản trị `/v1/agent-admin/*` (`API-3`)

Trang hướng dẫn trong `/adm` đọc dữ liệu qua **bề mặt thứ hai**, tách hẳn khỏi bề mặt agent. Trang đó
được mô tả riêng ở [`AgentApiGuide.md`](AgentApiGuide.md); mục này chỉ nói phần backend.

| Endpoint | Trả về |
|---|---|
| `GET /v1/agent-admin/overview` | Bảng + từng trường kèm chính sách, tên trường **cố ý bị loại trừ**, hạn mức, `keyConfigured` |
| `GET /v1/agent-admin/key` | Giá trị khoá agent — chỉ gọi khi người xem bấm hiện |

**Controller riêng, prefix riêng — không phải cho gọn mà vì xác thực ngược nhau.**
`AgentApiController` gắn `@UseGuards(AgentApiKeyGuard)` ở **cấp class**: mọi route trong nó đòi khoá
agent. Hai endpoint trên xác thực bằng JWT + vai + quyền. Trộn hai cơ chế vào một class là cách chắc
chắn nhất để một ngày nào đó có route lọt sai cửa. Prefix `agent-admin` cũng giữ cho `/v1/agent/*`
đúng bằng 5 endpoint đã công bố với agent — người dò `/v1/agent/` không tìm thấy thêm gì.

**Phân quyền hai lớp:** `page.agent_api` ở `PermissionsGuard`, **và** `RoleType.Admin` ở `RolesGuard`.
Manager được gán mã quyền vẫn không qua lớp thứ hai. Điều này cần cả `ADMIN_ONLY_PAGE_CODES` trong
`permission-catalog.ts`: preset của Manager là "mọi mã trừ danh sách này", nên **mã admin-only mới mà
quên thêm vào danh sách thì Manager lặng lẽ có quyền** — không lỗi nào bật ra, chỉ lộ khi có người kiểm
thử phân quyền bằng tay.

**Dựng từ registry tại thời điểm gọi, không cache.** Thêm một trường vào registry là nó tự hiện trên
trang, không sửa dòng nào ở BE lẫn FE. Service này không chạm collection nghiệp vụ nào — chỉ đọc hằng
số trong bộ nhớ — nên việc trả ra *tên* các trường bị che không mở đường nào tới *giá trị* của chúng.

`allowedHeaders` trong `main-nest.ts` có thêm `X-Agent-Api-Key` để phần "Thử gọi" của trang gọi thẳng
`/v1/agent/*` từ trình duyệt. Chỉ nới header; whitelist `origin` giữ nguyên.
