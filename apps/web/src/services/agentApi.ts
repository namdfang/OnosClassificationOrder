import type { AgentAdminOverview } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

/**
 * Trang huong dan Agent API (`API-3`) — xem
 * `documents/FunctionDescription/AgentApiGuide.md`.
 *
 * File nay co HAI nhom loi goi di HAI DUONG KHAC NHAU, va do la chu y:
 *
 *  1. `overview` / `key` — be mat quan tri `/v1/agent-admin/*`, di `callApi`
 *     nhu moi service khac (JWT nhan vien + interceptor chung).
 *  2. `callAgent` — 5 endpoint that cua agent `/api/v1/agent/*`, di `fetch`
 *     TRAN: khong Authorization, khong interceptor.
 *
 * Vi sao (2) khong dung `apiAxios`: interceptor chung bat loi thanh toast
 * chung chung va tu dieu huong khi 401 — dung nhu vay thi AC-08 (hien nguyen
 * `code` + thong diep goc) va AC-12 (phan biet 408 voi 4xx) khong the dat.
 * Ngoai ra JWT gan kem se lam dong `curl` hien tren trang KHONG con dung bang
 * loi goi vua chay (AC-07).
 */

const overview = () => callApi(`/${CONFIG.API_VERSION}/agent-admin/overview`, 'get');

/** Goi RIENG, chi khi nguoi xem bam "Hien khoa" hoac bam Chay lan dau (BR-3). */
const revealKey = () => callApi(`/${CONFIG.API_VERSION}/agent-admin/key`, 'get');

/** Origin cua API. `VITE_API_URL` rong (production cung domain) thi lay origin trang. */
export const apiOrigin = (): string => {
  const raw = CONFIG.API_URL as string | undefined;
  if (!raw) return window.location.origin;
  try {
    return new URL(raw, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
};

/** `basePath` BE tra ve la duong TUONG DOI (`/api/v1/agent`) — ghep voi origin o day. */
export const agentUrl = (basePath: string, suffix: string, query?: Record<string, string>): string => {
  const url = new URL(`${basePath}${suffix}`, apiOrigin());
  if (query) for (const [k, v] of Object.entries(query)) if (v) url.searchParams.set(k, v);
  return url.toString();
};

export interface AgentCallResult {
  /** HTTP 2xx. Phan biet "goi thanh cong nhung rong" voi "goi loi" — AC-13. */
  ok: boolean;
  /** 0 = khong toi duoc may chu (mat mang, CORS chan). */
  status: number;
  durationMs: number;
  /** Than phan hoi da dinh dang de hien; luon la chuoi day du, khong cat. */
  bodyText: string;
  /** So dong tra ve neu doc duoc tu `data.items` — AC-14 can so THAT. */
  rowCount?: number;
  /** `code` nguyen van cua bo API — AC-08 cam nuot thanh thong bao chung. */
  errorCode?: string;
  errorMessage?: string;
}

const readRowCount = (parsed: unknown): number | undefined => {
  const data = (parsed as { data?: unknown } | null)?.data;
  const items = (data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items.length : undefined;
};

/**
 * Doc `code`/`message` cua bo API. Ngoai lop `{ success, message, code }` cua
 * repo, NestJS con boc mot tang `response` — do ca hai, khong doan.
 */
const readError = (parsed: unknown): { errorCode?: string; errorMessage?: string } => {
  const root = (parsed || {}) as Record<string, unknown>;
  const nested = (root.response || {}) as Record<string, unknown>;
  const code = typeof root.code === 'string' ? root.code : typeof nested.code === 'string' ? nested.code : undefined;
  const message =
    typeof root.message === 'string'
      ? root.message
      : typeof nested.message === 'string'
        ? nested.message
        : undefined;
  return { errorCode: code, errorMessage: message };
};

export interface AgentCallInput {
  method: 'GET' | 'POST';
  url: string;
  apiKey: string;
  authHeader: string;
  body?: string;
}

/**
 * Chay THAT mot loi goi agent. Khong bao gio nem: moi ket qua — ke ca mat mang
 * — deu tro ve `AgentCallResult` de phan D hien duoc, thay vi bien thanh toast.
 */
export const callAgent = async ({ method, url, apiKey, authHeader, body }: AgentCallInput): Promise<AgentCallResult> => {
  const startedAt = performance.now();
  try {
    const res = await fetch(url, {
      method,
      headers: {
        [authHeader]: apiKey,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
    });
    const durationMs = Math.round(performance.now() - startedAt);
    const text = await res.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }

    const bodyText = parsed === undefined ? text : JSON.stringify(parsed, null, 2);
    if (res.ok) return { ok: true, status: res.status, durationMs, bodyText, rowCount: readRowCount(parsed) };

    return { ok: false, status: res.status, durationMs, bodyText, ...readError(parsed) };
  } catch (error) {
    // Mat mang / CORS chan: khong co status HTTP nao de hien.
    return {
      ok: false,
      status: 0,
      durationMs: Math.round(performance.now() - startedAt),
      bodyText: '',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Dong `curl` tuong duong. Mac dinh dung `$AGENT_API_KEY` chu KHONG phai khoa
 * that: copy ra ngoai van chay duoc, ma chup man hinh trang thi khong lo gi
 * (BR-3). Nguoi xem phai chu dong tick moi chen khoa that vao.
 */
export const buildCurl = (input: { method: 'GET' | 'POST'; url: string; authHeader: string; body?: string; key?: string }): string => {
  const keyPart = input.key ? input.key : '$AGENT_API_KEY';
  const lines = [`curl -H "${input.authHeader}: ${keyPart}" \\`];
  if (input.method === 'POST') {
    lines.push('     -X POST \\', '     -H "Content-Type: application/json" \\');
    if (input.body) lines.push(`     -d '${input.body.replace(/\n\s*/g, '')}' \\`);
  }
  lines.push(`     "${input.url}"`);
  return lines.join('\n');
};

export type { AgentAdminOverview };

export const agentApi = { overview, revealKey };
