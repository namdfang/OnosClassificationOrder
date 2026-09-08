/**
 * Kiểm địa chỉ giao hàng trước khi đặt đơn.
 *
 * Vì sao cần (phản hồi vận hành 08/09/2026): form cũ chỉ đòi "có điền" — gõ gì
 * cũng qua. Địa chỉ sai chỉ lộ ra khi MUA VẬN ĐƠN (hãng từ chối) hoặc tệ hơn là
 * khi hàng bị trả về, lúc đó đã tốn tiền in, tiền sản xuất và tiền ship.
 *
 * Hai lớp, cố ý tách bạch:
 *  1. `checkAddressFormat` — luật hình thức, chạy ngay tại trình duyệt, KHÔNG
 *     gọi mạng. Bắt được phần lớn lỗi gõ tay (thiếu bang, mã bưu điện sai, số
 *     điện thoại thiếu số).
 *  2. Xác minh USPS thật (`shipping-vnp/check-address`) — chỉ hub gọi được, là
 *     bước tuỳ chọn ở màn ops; không chặn seller đặt đơn khi hãng đang lỗi.
 */

export interface AddressInput {
  firstName?: string;
  lastName?: string;
  address1?: string;
  address2?: string;
  company?: string;
  city?: string;
  postcode?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
}

/** Mã 2 chữ cái của 50 bang + DC + vùng lãnh thổ USPS nhận. */
const US_STATES = new Set(
  ('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY ' +
    'DC AS GU MP PR VI AA AE AP')
    .split(' '),
);

/** Nhận cả `US`, `USA`, `United States` — người nhập mỗi kiểu một khác. */
export function isUsCountry(country?: string): boolean {
  const c = (country ?? '').trim().toUpperCase();

  return c === 'US' || c === 'USA' || c === 'UNITED STATES' || c === 'UNITED STATES OF AMERICA' || c === '';
}

/**
 * Trả lỗi theo từng trường (khoá i18n ở `seller:addressCheck.*`).
 * Rỗng = qua vòng hình thức.
 */
export function checkAddressFormat(a: AddressInput): Partial<Record<keyof AddressInput, string>> {
  const err: Partial<Record<keyof AddressInput, string>> = {};
  const v = (x?: string) => (x ?? '').trim();

  if (v(a.firstName).length < 2) err.firstName = 'nameTooShort';
  // Địa chỉ Mỹ hầu như luôn có số nhà — chuỗi không chứa chữ số gần như chắc chắn thiếu.
  if (v(a.address1).length < 5) err.address1 = 'addressTooShort';
  else if (!/\d/.test(v(a.address1))) err.address1 = 'addressNoNumber';
  if (v(a.city).length < 2) err.city = 'cityTooShort';

  const phoneDigits = v(a.phone).replace(/\D/g, '');
  if (phoneDigits.length < 9 || phoneDigits.length > 15) err.phone = 'phoneDigits';

  if (v(a.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v(a.email))) err.email = 'emailInvalid';

  if (isUsCountry(a.country)) {
    const st = v(a.state).toUpperCase();
    if (!st) err.state = 'stateRequiredUs';
    else if (!US_STATES.has(st)) err.state = 'stateInvalidUs';
    const zip = v(a.postcode);
    if (!zip) err.postcode = 'zipRequiredUs';
    else if (!/^\d{5}(-\d{4})?$/.test(zip)) err.postcode = 'zipInvalidUs';
  } else if (!v(a.postcode)) {
    err.postcode = 'zipRequired';
  }

  return err;
}

/** Chuẩn hoá nhẹ trước khi gửi: bang viết hoa, bỏ khoảng trắng thừa. */
export function normalizeAddress<T extends AddressInput>(a: T): T {
  const out = { ...a };
  for (const k of Object.keys(out) as (keyof AddressInput)[]) {
    const val = out[k];
    if (typeof val === 'string') out[k] = val.trim() as T[keyof AddressInput];
  }
  if (isUsCountry(out.country) && out.state) out.state = out.state.toUpperCase() as T['state'];

  return out;
}
