import { useEffect, useState } from 'react';

import { RepositoryRemote } from '@/services';

import { handleAxiosError } from '@/utils';

/**
 * Đổi JWT của app lấy cookie phiên cho màn chat Zalo.
 *
 * Vì sao phải có bước này: SDK của nhà cung cấp gọi engine bằng `fetch` với
 * `credentials: 'same-origin'` và KHÔNG gắn `Authorization` — nên JWT trong
 * localStorage của app không tới được proxy. Trang xin cookie một lần trước khi
 * dựng giao diện; cookie sống 8 giờ, hết hạn thì lần vào sau xin lại.
 */
export function useZaloSession(): { sanSang: boolean; loi: string | null } {
  const [sanSang, setSanSang] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    let huy = false;
    void (async () => {
      try {
        await RepositoryRemote.zaloChat.createSession();
        if (!huy) setSanSang(true);
      } catch (error) {
        if (huy) return;
        setLoi('session');
        handleAxiosError(error);
      }
    })();

    return () => {
      huy = true;
    };
  }, []);

  return { sanSang, loi };
}
