import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface ConfirmOptions {
  title: string;
  /** Nội dung — xuống dòng bằng `\n` được giữ nguyên. */
  message?: string;
  /** Nhãn nút xác nhận (mặc định `common:actions.confirm`). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Thao tác phá huỷ (xóa/hủy đơn) → nút đỏ. */
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * Hộp thoại xác nhận dùng chung — thay `window.confirm()` gốc của trình duyệt.
 *
 * `window.confirm` không theo giao diện hệ thống, nút OK/Cancel KHÔNG dịch theo
 * ngôn ngữ đang chọn, hiển thị kém trên màn hình nhỏ và chặn cứng cả tab (nên
 * cả công cụ kiểm thử tự động lẫn người dùng đều kẹt).
 *
 * ```tsx
 * const { confirm, confirmDialog } = useConfirm();
 * ...
 * if (!(await confirm({ title: t('...'), destructive: true }))) return;
 * ...
 * return (<>{confirmDialog}...</>);
 * ```
 */
export function useConfirm() {
  const { t } = useTranslation('common');
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const settle = useCallback(
    (ok: boolean) => {
      setPending((cur) => {
        cur?.resolve(ok);
        return null;
      });
    },
    [],
  );

  const confirmDialog = (
    <Dialog open={!!pending} onOpenChange={(open) => !open && settle(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          {pending?.message && (
            <DialogDescription className="whitespace-pre-line">{pending.message}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(false)}>
            {pending?.cancelLabel ?? t('actions.cancel')}
          </Button>
          <Button variant={pending?.destructive ? 'destructive' : 'default'} onClick={() => settle(true)}>
            {pending?.confirmLabel ?? t('actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, confirmDialog };
}
