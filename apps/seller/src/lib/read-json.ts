"use client";

/**
 * THG-QC-2026-07-30 — Đọc thân phản hồi HTTP thành JSON mà KHÔNG bao giờ để lỗi thô của
 * `JSON.parse` lọt ra mặt người dùng.
 *
 * VÌ SAO CÓ: ops báo seller đẩy đơn thì nhận được đúng dòng này —
 *   Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 * Đó là câu của trình duyệt khi `res.json()` gặp một trang HTML. Đo log prod ngày hôm đó:
 * 0 lỗi 5xx ở app, 0 lỗi 502/504 ở nginx ⇒ HTML không do Hub trả, mà đến từ tầng trước
 * (Cloudflare/nginx: trang lỗi, trang chặn, hoặc lúc container khởi động lại). Hub không
 * chặn được việc đó, nhưng PHẢI dịch nó thành câu người dùng hiểu và ghi lại vết.
 *
 * Tách riêng khỏi `hooks/use-api.ts` để test được trong môi trường node (file kia import
 * react + swr) và để mọi nơi dùng chung một cách đọc.
 */
import { logClientError } from "@/lib/client-logger";

/** Câu hiển thị khi tầng proxy trả HTML thay vì dữ liệu. Tiếng Anh cho khớp UI cổng seller. */
export const PROXY_HTML_MESSAGE =
  "Server is busy or restarting — please wait a few seconds and try again.";

/** Thân phản hồi có phải trang HTML? Chỉ soi phần đầu — trang lỗi proxy luôn mở bằng thẻ. */
export function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 512).trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<?xml");
}

/**
 * HTML này là trang đăng nhập (hết phiên) hay trang lỗi của proxy?
 * Phân biệt quan trọng: hết phiên thì đưa về /login, còn proxy lỗi thì TUYỆT ĐỐI không
 * được đá người dùng ra khỏi trang — họ vừa nhập nửa cái phiếu, mất hết là lỗi nặng hơn.
 */
function looksLikeLoginPage(res: Response, text: string): boolean {
  if (res.url && res.url.includes("/login")) return true;
  const head = text.slice(0, 2000).toLowerCase();
  return head.includes("callbackurl") || head.includes("/api/auth/signin") || head.includes('name="csrftoken"');
}

export interface ReadJsonOptions {
  /** Gọi khi phát hiện phiên đã hết (mặc định: không làm gì — caller tự quyết). */
  onSessionExpired?: () => void;
  /** Nhãn để tra log phía server (thường là đường dẫn API). */
  label?: string;
}

/** Đánh dấu lỗi "thân phản hồi không dùng được" để caller phân biệt với lỗi nghiệp vụ. */
export class NonJsonResponseError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "NonJsonResponseError";
    this.status = status;
  }
}

/**
 * Lõi: đọc thân một lần rồi tự parse. CỐ Ý không dùng `res.json()` — body chỉ đọc được MỘT
 * lần, mà muốn phân biệt HTML với JSON thì buộc phải xem chữ trước khi parse.
 *
 * Ném `NonJsonResponseError` khi: HTML của proxy · thân không parse được · thân rỗng mà mã lỗi.
 * Ném Error("Session expired") khi HTML là trang đăng nhập.
 * Trả `null` khi thân rỗng và mã 2xx (204 No Content).
 */
async function parseBody(res: Response, opts: ReadJsonOptions): Promise<unknown> {
  const label = opts.label ?? res.url ?? "";
  let text: string;
  try {
    text = await res.text();
  } catch {
    // Mất kết nối giữa lúc tải thân phản hồi.
    throw new NonJsonResponseError(
      res.ok ? "Connection lost while reading the response — please try again." : `HTTP ${res.status}`,
      res.status,
    );
  }

  if (looksLikeHtml(text)) {
    if (looksLikeLoginPage(res, text)) {
      opts.onSessionExpired?.();
      throw new Error("Session expired");
    }
    logClientError(new Error("non-json-response"), {
      event: "client.non_json_response",
      label,
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      bodyHead: text.slice(0, 300),
    });
    throw new NonJsonResponseError(PROXY_HTML_MESSAGE, res.status);
  }

  if (!text.trim()) {
    if (res.ok) return null; // 204 / thân rỗng hợp lệ
    throw new NonJsonResponseError(`HTTP ${res.status}`, res.status);
  }

  try {
    return JSON.parse(text);
  } catch {
    logClientError(new Error("unparsable-response"), {
      event: "client.unparsable_response",
      label,
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      bodyHead: text.slice(0, 300),
    });
    throw new NonJsonResponseError(res.ok ? PROXY_HTML_MESSAGE : `HTTP ${res.status}`, res.status);
  }
}

/**
 * Đọc `res` thành JSON, hoặc ném Error có thông điệp dùng được ngay trên UI.
 * `!res.ok` mà thân là JSON → ném đúng `error` của server (giữ thông điệp nghiệp vụ).
 */
export async function readJsonOrThrow<T>(res: Response, opts: ReadJsonOptions = {}): Promise<T> {
  const parsed = await parseBody(res, opts);
  if (!res.ok) {
    const body = parsed as { error?: unknown; message?: unknown } | null;
    const msg = typeof body?.error === "string" ? body.error : typeof body?.message === "string" ? body.message : "";
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return parsed as T;
}

/**
 * Như `readJsonOrThrow` nhưng KHÔNG ném khi server trả 4xx — trả cả `ok`/`status`/`body`.
 *
 * Dùng cho những chỗ mà thân phản hồi lỗi LÀ dữ liệu cần hiển thị: import hàng loạt trả 400
 * kèm bảng dòng lỗi, form tạo phiếu trả 400 kèm `error` để hiện cạnh ô nhập. Ném ở những chỗ
 * đó là xoá mất thứ người dùng cần đọc.
 *
 * Vẫn ném với HTML / thân không parse được — đó mới là trường hợp không có gì để hiện.
 */
export async function readJsonAllowError<T>(
  res: Response,
  opts: ReadJsonOptions = {},
): Promise<{ ok: boolean; status: number; body: T }> {
  const parsed = await parseBody(res, opts);
  return { ok: res.ok, status: res.status, body: (parsed ?? {}) as T };
}
