import { useSearchParams } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';

/**
 * Xưởng đang được lọc cho trang hiện tại.
 *
 * Nguồn duy nhất là query param `?factoryId=` — "cụm menu theo xưởng" ở
 * Sidebar gắn param này vào mọi link của cụm. Để trên URL (thay vì một store
 * ẩn) nên F5 / copy link gửi nhau vẫn đúng xưởng, và không bao giờ có chuyện
 * đang xem số của xưởng khác mà không biết.
 *
 * Tài khoản Fulfillment bị KHÓA vào xưởng của họ ở tầng API rồi, nên param có
 * đổi cũng vô nghĩa — trả thẳng `profile.factoryId` cho khớp với dữ liệu BE
 * thực sự trả về.
 */
export function useFactoryScope(): string | undefined {
  const [searchParams] = useSearchParams();
  const profile = useAuthStore((s) => s.profile);
  if (profile?.role?.name === 'Fulfillment') return profile.factoryId || undefined;
  return searchParams.get('factoryId') || undefined;
}
