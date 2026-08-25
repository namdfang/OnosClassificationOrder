import { escapeRegExp } from './escape-regex';

/**
 * Tìm kiếm BỎ DẤU tiếng Việt cho `$regex` (AUTH-4).
 *
 * Vì sao không dùng collation của MongoDB: **collation KHÔNG áp dụng cho
 * `$regex`** — query vẫn so khớp nguyên văn, nên hướng đó là ngõ cụt.
 *
 * Cách làm: đổi từng ký tự chữ cái của chuỗi người dùng gõ thành một lớp ký tự
 * gồm CẢ chữ không dấu lẫn mọi biến thể có dấu của nó (`a` → `[aàáảãạăằắẳẵặâầấẩẫậ]`).
 * Nhờ vậy:
 *  - gõ không dấu ra được bản ghi có dấu (`me linh` → `Mê Linh`);
 *  - gõ CÓ dấu vẫn ra y như cũ, vì lớp ký tự là TẬP CHA của chữ vừa gõ — đây là
 *    điều giữ đúng ràng buộc "không mất kết quả nào so với hiện tại";
 *  - `đ`/`Đ` khớp với `d` (NFD KHÔNG tách được `đ` nên phải gộp tay vào lớp `d`).
 *
 * Ký tự không phải chữ cái được escape như cũ, nên chuỗi có `.`/`(`/`*` vẫn an
 * toàn trước injection `$regex`.
 */

/** Nhóm biến thể có dấu theo chữ cái gốc — `đ` cố ý nằm trong nhóm `d`. */
const DIACRITIC_GROUPS: Record<string, string> = {
  a: 'aàáảãạăằắẳẵặâầấẩẫậ',
  d: 'dđ',
  e: 'eèéẻẽẹêềếểễệ',
  i: 'iìíỉĩị',
  o: 'oòóỏõọôồốổỗộơờớởỡợ',
  u: 'uùúủũụưừứửữự',
  y: 'yỳýỷỹỵ',
};

/** Chữ có dấu → chữ cái gốc, để chuỗi gõ CÓ dấu cũng nở ra đúng lớp ký tự. */
const BASE_OF: Record<string, string> = Object.entries(DIACRITIC_GROUPS).reduce<Record<string, string>>(
  (acc, [base, variants]) => {
    for (const ch of variants) acc[ch] = base;
    return acc;
  },
  {},
);

/**
 * Chuỗi regex khớp `input` theo kiểu bỏ dấu. Dùng kèm `$options: 'i'` để giữ
 * nguyên tính không phân biệt hoa thường như trước.
 *
 * Trả về chuỗi rỗng khi `input` rỗng — nơi gọi tự quyết định bỏ qua điều kiện.
 */
export function diacriticInsensitiveRegex(input: string | undefined | null): string {
  if (!input) return '';
  return [...input.toLowerCase()]
    .map((ch) => {
      const base = BASE_OF[ch] ?? ch;
      const group = DIACRITIC_GROUPS[base];
      // Lớp ký tự chỉ chứa chữ cái nên không cần escape bên trong `[...]`.
      return group ? `[${group}]` : escapeRegExp(ch);
    })
    .join('');
}
