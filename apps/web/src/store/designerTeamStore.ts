import type { DesignerTeamMember } from 'shared';
import { RoleType } from 'shared';
import { create } from 'zustand';

import { useAuthStore } from '@/store/authStore';

import { RepositoryRemote } from '@/services';

/**
 * AUTH-8 — vai được phép ĐỌC danh sách đội designer, MIRROR nguyên si `@Auth`
 * của `GET /designer/team` (`designer-team.controller.ts`). Sửa bên đó thì sửa
 * cả ở đây.
 *
 * Vì sao mirror theo VAI chứ không theo mã quyền: endpoint này gác bằng danh
 * sách vai, và KHÔNG có mã `page.*`/`designer.*` nào phủ đúng tập đó —
 * `page.designer_team` thì Designer KHÔNG có (chỉ Leader có), lấy mã đó gác sẽ
 * cắt mất danh sách đội của chính Designer ở màn "Task của tôi". Đây đúng cái
 * "ẩn nhầm" mà yêu cầu AUTH-8 ghi là rủi ro nặng nhất.
 */
const DESIGNER_TEAM_READ_ROLES: string[] = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.DesignerLeader,
  RoleType.Designer,
];

const canReadDesignerTeam = (): boolean => {
  const roleName = useAuthStore.getState().profile?.role?.name;
  return !!roleName && DESIGNER_TEAM_READ_ROLES.includes(roleName);
};

/**
 * Lightweight store cache designer team list — load 1 lần khi mount cell
 * "Người thực hiện" / dialog assign. Refetch khi onCreate/onUpdate được gọi.
 *
 * Member = sub-designer (role=Designer), key = user._id.
 */
type DesignerTeamStore = {
  members: DesignerTeamMember[];
  loading: boolean;
  loaded: boolean;
  /** Map userId → DesignerTeamMember để resolve fullName nhanh. */
  byId: Record<string, DesignerTeamMember>;
  fetch: () => Promise<void>;
  invalidate: () => void;
};

export const useDesignerTeamStore = create<DesignerTeamStore>((set, get) => ({
  members: [],
  loading: false,
  loaded: false,
  byId: {},
  fetch: async () => {
    if (get().loading) return;
    // AUTH-8 — vai không được đọc danh sách này thì ĐỪNG GỌI (không phải "cho
    // phép gọi"): trước đây Support vừa đăng nhập là Dashboard bắn ngay
    // GET /designer/team và ăn 403. Store rỗng nên các ô hiển thị rơi về nhãn
    // rút gọn sẵn có — không ô trống, không vòng xoay, không dòng lỗi đỏ.
    //
    // CỐ Ý KHÔNG set `loaded: true` ở đây: store này sống ở module scope và
    // KHÔNG bị xoá khi đăng xuất, nên đánh dấu đã-tải sẽ khoá luôn danh sách
    // rỗng cho người đăng nhập KẾ TIẾP trong cùng tab. Để `loaded` nguyên false
    // thì mỗi lần mount caller gọi lại hàm này và nó thoát ngay — không tốn một
    // lời gọi mạng nào.
    if (!canReadDesignerTeam()) return;
    set({ loading: true });
    try {
      const res = await RepositoryRemote.designer.listTeam();
      const data = (res.data?.data || []) as DesignerTeamMember[];
      const byId: Record<string, DesignerTeamMember> = {};
      for (const m of data) byId[m._id] = m;
      set({ members: data, byId, loaded: true });
    } catch {
      // Silent — caller xử lý lỗi ở handleAxiosError nếu cần.
    } finally {
      set({ loading: false });
    }
  },
  invalidate: () => set({ loaded: false }),
}));
