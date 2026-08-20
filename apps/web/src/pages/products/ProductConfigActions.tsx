import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CloudDownload, FileSpreadsheet, PackagePlus, Plus, Receipt, RotateCw, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { PATHS } from '@/constants/paths';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { handleAxiosError } from '@/utils';

import { ImportFullProductFileDialog } from './ImportFullProductFileDialog';
import { ImportProductConfigDialog } from './ImportProductConfigDialog';
import { UploadConfigFileDialog } from './UploadConfigFileDialog';

interface ProductConfigActionsProps {
  /** Gọi sau khi một hành động đổi dữ liệu — tab danh sách tải lại. */
  onChanged: () => void;
}

interface ActionButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'ghost';
}

/**
 * Nút hành động thu gọn còn biểu tượng — tên đầy đủ hiện khi rê chuột (PRD-1).
 * Dùng Radix Tooltip thay `title` để nhãn hiện nhanh và đọc được trên nền tối;
 * vẫn giữ `aria-label` cho trình đọc màn hình.
 */
function ActionButton({ label, icon, onClick, disabled, variant = 'ghost' }: ActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={variant} size="icon" onClick={onClick} disabled={disabled} aria-label={label}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Vạch ngăn giữa các nhóm hành động — nhóm mới là thứ phân biệt 3 nút import gần giống nhau. */
function GroupDivider() {
  return <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />;
}

/**
 * Khu hành động của tab "Cấu hình sản phẩm" — đặt ngang tiêu đề trang, tách hẳn
 * khỏi khu bộ lọc bên dưới (PRD-1). Component tự giữ state dialog + tiến trình
 * của các việc chạy dài; đổi dữ liệu xong thì báo ra ngoài qua `onChanged`.
 *
 * Hành vi từng nút GIỮ NGUYÊN như thanh công cụ cũ — chỉ đổi cách trình bày.
 */
export function ProductConfigActions({ onChanged }: ProductConfigActionsProps) {
  const { t } = useTranslation('products');
  const navigate = useNavigate();
  const loadConfig = useWorkshopConfigStore((s) => s.load);

  const [importOpen, setImportOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [importFullOpen, setImportFullOpen] = useState(false);
  const [onospodImporting, setOnospodImporting] = useState(false);
  const [pageInfoCrawling, setPageInfoCrawling] = useState(false);
  const [progress, setProgress] = useState('');

  const handleBackfill = async () => {
    try {
      const res = await RepositoryRemote.order.backfillFabric();
      const { scanned, updated } = res.data.data;
      toast.success(t('configTab.backfill.success', { updated, scanned }));
    } catch (error) {
      handleAxiosError(error);
    }
  };

  /**
   * Import TẤT CẢ sản phẩm từ OnosPod — gọi lặp từng trang tới khi `nextPage`
   * null. Fill-only: KHÔNG đè field đã có, KHÔNG đụng xưởng/phòng/vải hiện tại.
   */
  const handleImportFromOnospod = async () => {
    if (!window.confirm(t('configTab.onospodImport.confirm'))) return;
    setOnospodImporting(true);
    const totals = { created: 0, filled: 0, skipped: 0 };
    const errors: { sku: string; name: string; reason: string }[] = [];
    let defaultsCreated = 0;
    try {
      let nextPage: number | null = 1;
      // Limit LỚN (1 request cho toàn bộ catalog) — phân trang bên OnosPod
      // không ổn định, chia trang nhỏ sẽ trùng + LỌT sản phẩm.
      const limit = 500;
      while (nextPage) {
        const res = await RepositoryRemote.productConfig.importFromOnospod({ page: nextPage, limit });
        const d = res.data?.data;
        if (!d) break;
        totals.created += d.created;
        totals.filled += d.filled;
        totals.skipped += d.skipped;
        defaultsCreated += d.defaultVariationsCreated ?? 0;
        errors.push(...(d.errors ?? []));
        setProgress(t('configTab.onospodImport.progress', { done: Math.min(nextPage * limit, d.total), total: d.total }));
        nextPage = d.nextPage;
      }
      toast.success(t('configTab.onospodImport.done', totals));
      if (defaultsCreated > 0) {
        toast.info(t('configTab.onospodImport.defaultsCreated', { count: defaultsCreated }), { duration: 10000 });
      }
      if (errors.length > 0) {
        toast.warning(t('configTab.onospodImport.errors', { count: errors.length, first: errors[0].reason }), {
          duration: 10000,
        });
      }
      onChanged();
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setOnospodImporting(false);
      setProgress('');
    }
  };

  /**
   * Crawl "Import US Tax" + "Package gram" từ trang sản phẩm public hệ cũ —
   * gọi lặp theo `cursor` tới khi `done` (2 giá trị này chỉ có trên trang WP,
   * import GraphQL không lấy được).
   */
  const handleCrawlPageInfo = async () => {
    if (!window.confirm(t('configTab.pageInfoCrawl.confirm'))) return;
    setPageInfoCrawling(true);
    let updated = 0;
    let processed = 0;
    try {
      let cursor: string | undefined;
      let done = false;
      while (!done) {
        const res = await RepositoryRemote.productConfig.crawlPageInfo({ limit: 10, cursor });
        const d = res.data?.data;
        if (!d) break;
        processed += d.processed;
        updated += d.updated;
        setProgress(t('configTab.pageInfoCrawl.progress', { done: processed, remaining: d.remaining }));
        cursor = d.nextCursor;
        done = d.done || !d.nextCursor;
      }
      toast.success(t('configTab.pageInfoCrawl.done', { updated, processed }));
      onChanged();
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setPageInfoCrawling(false);
      setProgress('');
    }
  };

  const handleDialogSuccess = () => {
    onChanged();
    loadConfig(true);
  };

  const running = onospodImporting || pageInfoCrawling;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
          <ActionButton
            label={t('configTab.addButton')}
            icon={<Plus size={16} />}
            onClick={() => navigate(PATHS.PRODUCT_DETAIL.replace(':id', 'new'))}
            variant="default"
          />
          <GroupDivider />
          {/* Ba nút nạp từ FILE — icon phải phân biệt được, đừng dùng chung một icon. */}
          <ActionButton
            label={t('configTab.importButton')}
            icon={<FileSpreadsheet size={16} />}
            onClick={() => setImportOpen(true)}
          />
          <ActionButton
            label={t('configTab.uploadButton')}
            icon={<Upload size={16} />}
            onClick={() => setUploadOpen(true)}
          />
          <ActionButton
            label={t('configTab.importFullButton')}
            icon={<PackagePlus size={16} />}
            onClick={() => setImportFullOpen(true)}
          />
          <GroupDivider />
          {/* Hai nút gọi OnosPod (tích hợp ngoài) — chạy dài, có tiến trình. */}
          <ActionButton
            label={t('configTab.onospodImport.button')}
            icon={onospodImporting ? <Spinner size={16} /> : <CloudDownload size={16} />}
            onClick={handleImportFromOnospod}
            disabled={onospodImporting}
          />
          <ActionButton
            label={t('configTab.pageInfoCrawl.button')}
            icon={pageInfoCrawling ? <Spinner size={16} /> : <Receipt size={16} />}
            onClick={handleCrawlPageInfo}
            disabled={pageInfoCrawling}
          />
          <GroupDivider />
          <ActionButton
            label={t('configTab.backfill.button')}
            icon={<RotateCw size={16} />}
            onClick={handleBackfill}
          />
        </div>
        {running && (
          <span className="text-xs text-muted-foreground">
            {progress || t(onospodImporting ? 'configTab.onospodImport.importing' : 'configTab.pageInfoCrawl.crawling')}
          </span>
        )}
      </div>

      <ImportProductConfigDialog open={importOpen} onOpenChange={setImportOpen} onSuccess={handleDialogSuccess} />

      <UploadConfigFileDialog open={uploadOpen} onOpenChange={setUploadOpen} onSuccess={handleDialogSuccess} />

      <ImportFullProductFileDialog
        open={importFullOpen}
        onOpenChange={setImportFullOpen}
        onSuccess={handleDialogSuccess}
      />
    </TooltipProvider>
  );
}
