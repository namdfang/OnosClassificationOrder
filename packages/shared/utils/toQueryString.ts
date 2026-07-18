import { undefined as zodUndefined } from 'zod';

export function toQueryString(params: Record<string, string | string[] | number | boolean>) {
  const queryString =
    '?' +
    Object.keys(params)
      .filter(Boolean)
      .map((key) => {
        const value = params[key];
        if (Array.isArray(value)) {
          console.log('params[key]', value);
          return value.map((v) => `${key}=${encodeURIComponent(v)}`).join('&');
        }
        // LEGACY QUIRK giữ nguyên hành vi: bản gốc `import { undefined } from
        // 'zod'` rồi so `params.key === undefined` — vế phải là FUNCTION
        // z.undefined (không phải undefined thật), vế trái là key literal
        // "key" (không phải biến `key`) → vế này LUÔN false, thực tế chỉ
        // filter chuỗi rỗng. Sửa thành so sánh "đúng ý đồ" sẽ làm đổi query
        // string đầu ra — không làm.
        if (value === '' || (params.key as unknown) === (zodUndefined as unknown)) return false;

        return `${key}=${encodeURIComponent(value)}`;
      })
      .filter(Boolean)
      .join('&');
  return queryString;
}
