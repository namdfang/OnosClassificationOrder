import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'lucide-react';
import { Status } from 'shared';
import { toast } from 'sonner';

import { useDesignerTeamStore } from '@/store/designerTeamStore';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { SelectPopover } from './SelectPopover';

interface Props {
  orderId: string;
  /** Giá trị `assignee` của order — = user._id của sub-designer (hoặc null). */
  value?: string | null;
  canEdit: boolean;
  /** Nếu set → khoá gán (vd đơn đã 'ok'), hiện lý do qua tooltip. */
  blockedReason?: string;
  onUpdated?: (newUserId: string | null) => void;
}

/**
 * Cell "Người thực hiện" — load list sub-designer từ DesignerTeamStore +
 * dùng user._id làm value. Fullname hiển thị; nếu user bị xoá (không tìm
 * thấy trong store) thì hiển thị fallback ngắn.
 */
export function AssigneeSelectCell({ orderId, value, canEdit, blockedReason, onUpdated }: Props) {
  const members = useDesignerTeamStore((s) => s.members);
  const byId = useDesignerTeamStore((s) => s.byId);
  const loaded = useDesignerTeamStore((s) => s.loaded);
  const fetch = useDesignerTeamStore((s) => s.fetch);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loaded) fetch();
  }, [loaded, fetch]);

  const current = value ? byId[value] : undefined;

  // Chỉ GÁN được cho designer đang bật (active). Nhưng nếu đơn đang gán cho một
  // designer đã tắt → vẫn giữ họ trong options để hiển thị đúng tên (không cho
  // mất assignment lịch sử). Memo để giữ identity mảng (SelectPopover so sánh ref).
  const options = useMemo(() => {
    const active = members.filter((m) => m.status === Status.Active);
    if (current && current.status !== Status.Active && !active.some((m) => m._id === current._id)) {
      active.push(current);
    }
    return active.map((m) => ({ _id: m._id, code: m._id, name: m.fullName, icon: 'User' }));
  }, [members, current]);

  const handleSelect = async (newId: string | null) => {
    if (newId === (value || null)) return;
    try {
      setSaving(true);
      await RepositoryRemote.order.updateField(orderId, { field: 'assignee', value: newId });
      toast.success(newId ? `Đã gán cho ${byId[newId]?.fullName || 'designer'}` : 'Đã bỏ chọn');
      onUpdated?.(newId);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const trigger = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap',
        current ? 'bg-accent/60 text-foreground' : 'text-muted-foreground',
        blockedReason && 'opacity-60 cursor-not-allowed',
      )}
      title={blockedReason || current?.fullName}
    >
      {saving ? <Spinner size={10} className="text-current" /> : <User size={12} />}
      <span className="truncate max-w-[120px]">{current?.fullName || (value ? `#${value.slice(-4)}` : '—')}</span>
    </span>
  );

  return (
    <SelectPopover
      options={options}
      value={value || undefined}
      onSelect={handleSelect}
      disabled={!canEdit || saving || !!blockedReason}
      renderOption={(it) => (
        <span className="inline-flex items-center gap-2">
          <User size={13} />
          {it.name}
        </span>
      )}
    >
      {trigger}
    </SelectPopover>
  );
}
