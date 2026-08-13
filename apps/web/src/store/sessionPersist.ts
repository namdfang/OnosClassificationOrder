import type { StateStorage } from 'zustand/middleware';

/**
 * Hạ tầng persist dùng chung cho `authStore` (nhân viên) và `customerAuthStore`
 * (Customer Portal) — nơi hiện thực chức năng "Ghi nhớ đăng nhập".
 *
 * Ngữ nghĩa:
 *   - remember = true  → blob state nằm ở `localStorage`  → sống qua restart trình duyệt.
 *   - remember = false → blob state nằm ở `sessionStorage` → mất khi đóng trình duyệt.
 *
 * `sessionStorage` là **per-tab**: tab mới mở thẳng bằng URL sẽ KHÔNG thấy phiên
 * của tab đang mở → người dùng bị đá ra trang đăng nhập dù trình duyệt chưa hề
 * đóng. `requestSessionHandoff()` xử lý đúng chỗ này: tab mới hỏi các tab khác
 * qua `storage` event; nếu còn tab nào sống thì nó chuyền lại blob. Đóng HẾT tab
 * ⇒ không ai trả lời ⇒ phiên mất — đúng ngữ nghĩa "không ghi nhớ".
 */

/**
 * Key blob persist + marker "Ghi nhớ đăng nhập" của 2 store. Khai báo Ở ĐÂY
 * (không phải trong file store) để `main.tsx` chạy handoff được mà không phải
 * import store — import store là tạo store, mà store phải hydrate SAU handoff.
 */
export const AUTH_STORE_KEY = 'auth-store';
export const AUTH_REMEMBER_KEY = 'onosfactory-remember-me';
export const CUSTOMER_STORE_KEY = 'customer-auth-store';
export const CUSTOMER_REMEMBER_KEY = 'onosfactory-customer-remember-me';

/**
 * Email của lần đăng nhập có tick "Ghi nhớ" gần nhất — dùng để prefill form và
 * tick sẵn checkbox. Cố ý KHÔNG bị xóa bởi `clearAll()`: đăng xuất là kết thúc
 * phiên, không phải quên luôn người dùng. Chỉ lưu email, KHÔNG bao giờ lưu mật khẩu.
 */
export const AUTH_IDENTITY_KEY = 'onosfactory-remembered-email';
export const CUSTOMER_IDENTITY_KEY = 'onosfactory-customer-remembered-email';

export function getRememberedIdentity(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function setRememberedIdentity(key: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage bị chặn (chế độ riêng tư) — bỏ qua, không ảnh hưởng đăng nhập */
  }
}

/** Kênh truyền tạm giữa các tab (ghi rồi xóa ngay, không lưu lại gì). */
const reqKey = (storeKey: string) => `${storeKey}:handoff-req`;
const resKey = (storeKey: string) => `${storeKey}:handoff-res`;
/** Cờ "trong trình duyệt này đang có tab giữ phiên không-ghi-nhớ" — xem `requestSessionHandoff`. */
const aliveKey = (storeKey: string) => `${storeKey}:alive`;

/**
 * Blob persist có chứa phiên THẬT không (token khác null).
 *
 * KHÔNG được thay bằng phép kiểm tra "có key hay không": zustand `persist` ghi
 * blob state RỖNG (`token: null`) ngay khi hydrate, nên tab từng hụt handoff sẽ
 * có key nhưng không có phiên — nếu chỉ nhìn sự tồn tại của key thì tab đó vĩnh
 * viễn không đi xin nữa và kẹt ở màn đăng nhập.
 */
function hasSession(raw: string | null): boolean {
  if (!raw) return false;
  try {
    return !!(JSON.parse(raw) as { state?: { token?: string | null } })?.state?.token;
  } catch {
    return false;
  }
}

export interface SessionPersist {
  /** Storage cho zustand `persist` — tự route giữa local/session theo marker. */
  storage: StateStorage;
  /** Đọc marker "ghi nhớ đăng nhập" hiện tại. */
  isRemembered: () => boolean;
  /** Ghi marker. PHẢI gọi TRƯỚC khi set state để `storage.setItem` route đúng chỗ. */
  setRemembered: (remember: boolean) => void;
  /** Xóa sạch dấu vết phiên ở cả 2 storage (kể cả marker). */
  clearAll: () => void;
}

export function createSessionPersist(storeKey: string, rememberKey: string): SessionPersist {
  const isRemembered = () => localStorage.getItem(rememberKey) === '1';

  const storage: StateStorage = {
    getItem: (name) => localStorage.getItem(name) ?? sessionStorage.getItem(name),
    setItem: (name, value) => {
      const remember = isRemembered();
      // Chỉ 1 trong 2 storage được giữ data tại mọi thời điểm — dọn cái còn lại
      // để không sót bản cũ (đổi chế độ ghi nhớ giữa 2 lần đăng nhập).
      (remember ? localStorage : sessionStorage).setItem(name, value);
      (remember ? sessionStorage : localStorage).removeItem(name);
      if (!remember && hasSession(value)) localStorage.setItem(aliveKey(name), '1');
    },
    removeItem: (name) => {
      localStorage.removeItem(name);
      sessionStorage.removeItem(name);
    },
  };

  return {
    storage,
    isRemembered,
    setRemembered: (remember) => localStorage.setItem(rememberKey, remember ? '1' : '0'),
    clearAll: () => {
      localStorage.removeItem(rememberKey);
      localStorage.removeItem(storeKey);
      localStorage.removeItem(aliveKey(storeKey));
      sessionStorage.removeItem(storeKey);
    },
  };
}

/**
 * Tab đang có phiên "không ghi nhớ" đóng vai người trả lời. Gọi 1 lần lúc app
 * khởi động. `storage` event chỉ bắn sang CÁC TAB KHÁC nên không tự vọng lại.
 */
export function serveSessionHandoff(storeKey: string): void {
  // Tab này đang giữ phiên → bật cờ để tab mới biết là "có người trả lời" mà chờ.
  if (hasSession(sessionStorage.getItem(storeKey))) localStorage.setItem(aliveKey(storeKey), '1');

  window.addEventListener('storage', (event) => {
    if (event.key !== reqKey(storeKey) || !event.newValue) return;

    const blob = sessionStorage.getItem(storeKey);
    if (!blob) return;

    localStorage.setItem(resKey(storeKey), blob);
    localStorage.removeItem(resKey(storeKey)); // chỉ mượn localStorage làm ống dẫn
  });
}

/**
 * Tab mới xin phiên từ các tab anh em. Trả về khi nhận được blob hoặc hết
 * `timeoutMs`. Phải `await` TRƯỚC khi mount React để store hydrate đúng ngay
 * lần render đầu (tránh chớp trang login rồi mới vào được).
 */
export function requestSessionHandoff(storeKey: string, rememberKey: string, timeoutMs = 1500): Promise<void> {
  // Chỉ đi xin khi HỘI ĐỦ: tab này chưa có phiên thật, không ở chế độ ghi nhớ,
  // lần đăng nhập gần nhất là kiểu "không ghi nhớ" (marker '0'), và đang có tab
  // khác giữ phiên (cờ alive). Thiếu cờ alive ⇒ chắc chắn không ai trả lời ⇒
  // return ngay, người dùng đã đăng xuất/đóng hết tab không phải chờ tí nào.
  if (
    typeof window === 'undefined' ||
    hasSession(sessionStorage.getItem(storeKey)) ||
    hasSession(localStorage.getItem(storeKey)) ||
    localStorage.getItem(rememberKey) !== '0' ||
    !localStorage.getItem(aliveKey(storeKey))
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== resKey(storeKey) || !event.newValue) return;
      sessionStorage.setItem(storeKey, event.newValue);
      finish(true);
    };

    const finish = (answered: boolean) => {
      window.removeEventListener('storage', onStorage);
      clearTimeout(timer);
      // Hết giờ mà không ai trả lời ⇒ cờ alive là rác của phiên trước (đã đóng
      // hết tab): xóa đi để những lần khởi động sau không phải chờ nữa.
      if (!answered) localStorage.removeItem(aliveKey(storeKey));
      resolve();
    };

    // Ngân sách phải RỘNG: `storage` event của tab trả lời bị xếp hàng sau việc
    // load/parse app của chính tab này, timer 150ms nổ trước nên tab bỏ cuộc
    // dù bên kia đã trả lời (đo được: trả lời trong ~1ms khi main thread rảnh).
    // Chờ lâu chỉ xảy ra khi cờ alive là rác — và chỉ đúng 1 lần.
    const timer = setTimeout(() => finish(false), timeoutMs);
    window.addEventListener('storage', onStorage);

    // Giá trị phải KHÁC nhau mỗi lần: setItem cùng giá trị cũ không bắn event.
    localStorage.setItem(reqKey(storeKey), `${Date.now()}-${Math.random()}`);
    localStorage.removeItem(reqKey(storeKey));
  });
}
