/**
 * Bản giả của `@anthropic-ai/claude-agent-sdk` cho Jest.
 *
 * Gói thật chỉ có bản ESM (`sdk.mjs`); ts-jest chạy CommonJS nên hễ một spec
 * nào lôi vào cây phụ thuộc có `ceo-report.service.ts` hoặc
 * `zalo-summary.service.ts` là cả suite chết ở bước parse — đúng thứ đã làm
 * `agent-api.constants.spec.ts` đỏ. Không spec nào gọi Agent SDK thật (tốn
 * tiền, cần mạng), nên chỉ cần một hàm ném lỗi rõ ràng nếu lỡ có ai gọi.
 */
export function query(): never {
  throw new Error('Agent SDK không chạy trong test — hãy mock hàm gọi nó.');
}
