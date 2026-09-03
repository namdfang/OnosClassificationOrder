import { useEffect, useState } from 'react';

import { CONFIG } from '@/constants';

import { useAuthStore } from '@/store/authStore';

/**
 * Đổi JWT của app lấy cookie phiên cho màn chat Zalo.
 *
 * Vì sao phải có bước này: SDK của nhà cung cấp gọi engine bằng `fetch` với
 * `credentials: 'same-origin'` và KHÔNG gắn `Authorization` — nên JWT trong
 * localStorage không tới được proxy.
 *
 * Vì sao gọi bằng `fetch` đường TƯƠNG ĐỐI thay vì `RepositoryRemote`: cookie
 * chỉ có tác dụng nếu nó thuộc ĐÚNG origin của trang. Bản dev qua tunnel tự suy
 * ra host API riêng (`api-dev-onos.…`), nên gọi qua axios sẽ đặt cookie cho host
 * đó, còn SDK lại gọi host của trang — cookie không bao giờ đi kèm và mọi lời
 * gọi trả 401. Đường tương đối `/api/v1/...` luôn trỏ về chính origin đang mở,
 * ở cả dev (tunnel định tuyến `^/api`) lẫn production (nginx).
 */
export function useZaloSession(): { sanSang: boolean; loi: string | null } {
  const [sanSang, setSanSang] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    let huy = false;
    void (async () => {
      try {
        const token = useAuthStore.getState().getToken();
        const res = await fetch(`/api/${CONFIG.API_VERSION}/zalo-chat/session`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: '{}',
        });
        if (!res.ok) throw new Error(`session ${res.status}`);
        if (!huy) setSanSang(true);
      } catch {
        if (!huy) setLoi('session');
      }
    })();

    return () => {
      huy = true;
    };
  }, []);

  return { sanSang, loi };
}
