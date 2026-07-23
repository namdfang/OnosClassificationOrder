import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import type { Promotion } from 'shared';
import { Status } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { PaginationBar } from '@/components/common/PaginationBar';
import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { handleAxiosError } from '@/utils';

import { PromotionEditDialog } from './PromotionEditDialog';

export interface ProductConfigOption {
  _id: string;
  fullName: string;
  shortName: string;
}

export interface ProductCategoryOption {
  _id: string;
  name: string;
  shortName: string;
}

interface Stats {
  total: number;
  active: number;
  expiringSoon: number;
  byTier: Record<string, number>;
}

const SCOPE_LABEL: Record<string, string> = {
  all: 'Toàn bộ',
  category: 'Theo danh mục',
  product: 'Sản phẩm cụ thể',
};

function formatDiscount(p: Promotion): string {
  return p.discountType === 'percentage' ? `${p.discountValue}%` : `${p.discountValue.toLocaleString('vi-VN')}đ`;
}

export default function PromotionsPage() {
  const [items, setItems] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [productOptions, setProductOptions] = useState<ProductConfigOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<ProductCategoryOption[]>([]);
  const [editItem, setEditItem] = useState<Promotion | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search);
      const resp = await RepositoryRemote.promotion.getPromotions(`?${params.toString()}`);
      setItems(resp.data.data || []);
      setTotal(resp.data.total || 0);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const resp = await RepositoryRemote.promotion.getStats();
      setStats(resp.data.data);
    } catch (error) {
      handleAxiosError(error);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [pResp, cResp] = await Promise.all([
          RepositoryRemote.productConfig.getProductConfigs('?page=1&limit=500'),
          RepositoryRemote.productCategory.getProductCategories('?page=1&limit=200'),
        ]);
        setProductOptions((pResp.data.data || []) as ProductConfigOption[]);
        setCategoryOptions((cResp.data.data || []) as ProductCategoryOption[]);
      } catch (error) {
        handleAxiosError(error);
      }
    })();
  }, []);

  useEffect(() => {
    fetchData();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const handleSearch = () => {
    if (page !== 1) setPage(1);
    else fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xoá chương trình giảm giá này?')) return;
    try {
      await RepositoryRemote.promotion.deletePromotion(id);
      toast.success('Đã xoá');
      fetchData();
      fetchStats();
    } catch (error) {
      handleAxiosError(error);
    }
  };

  const openCreate = () => {
    setEditItem(null);
    setDialogOpen(true);
  };
  const openEdit = (p: Promotion) => {
    setEditItem(p);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center">
          <Tag size={20} className="text-rose-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chương trình giảm giá</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý discount theo tier khách hàng (VIP 0..5) — áp dụng cho giá tham khảo ở Customer Portal.
          </p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Tổng chương trình</p>
            <p className="text-xl font-semibold">{stats.total}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Đang hoạt động</p>
            <p className="text-xl font-semibold text-emerald-600">{stats.active}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Sắp hết hạn (7 ngày)</p>
            <p className="text-xl font-semibold text-amber-600">{stats.expiringSoon}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Tìm theo tên hoặc mã coupon…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="max-w-sm"
        />
        <Button onClick={openCreate}>
          <Plus size={14} />
          Tạo chương trình
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Mã</TableHead>
              <TableHead>Giảm giá</TableHead>
              <TableHead>Phạm vi</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Hiệu lực</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Spinner size={20} className="text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Chưa có chương trình giảm giá nào.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              items.map((p) => (
                <TableRow key={String(p._id)}>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>}
                  </TableCell>
                  <TableCell>{p.code ? <Badge variant="outline">{p.code}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                  <TableCell className="font-medium text-rose-600">{formatDiscount(p)}</TableCell>
                  <TableCell className="text-sm">{SCOPE_LABEL[p.scope]}</TableCell>
                  <TableCell className="text-sm">
                    {p.applicableTiers?.length ? p.applicableTiers.map((t) => `VIP ${t}`).join(', ') : 'Mọi tier'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.startDate ? new Date(p.startDate).toLocaleDateString('vi-VN') : '—'}
                    {' → '}
                    {p.endDate ? new Date(p.endDate).toLocaleDateString('vi-VN') : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.status === Status.Active ? 'secondary' : 'outline'}>
                      {p.status === Status.Active ? 'Hoạt động' : 'Tạm tắt'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Sửa">
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(String(p._id))} title="Xoá">
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        <PaginationBar
          position="bottom"
          page={page}
          pageSize={pageSize}
          total={total}
          loading={loading && items.length === 0}
          onChange={(p, ps) => {
            setPage(p);
            setPageSize(ps);
          }}
        />
      </div>

      <PromotionEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editItem}
        productOptions={productOptions}
        categoryOptions={categoryOptions}
        onSaved={() => {
          fetchData();
          fetchStats();
        }}
      />
    </div>
  );
}
