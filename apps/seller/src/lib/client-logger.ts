'use client';

/** thghub gửi về `/api/log/client-error`; cổng Onos chưa có endpoint → chỉ ghi console. */
export function logClientError(error: Error, context?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') console.error('[client-error]', error.message, context);
}
