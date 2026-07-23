import React, { useEffect, useState } from 'react';
import { ImageIcon, PackageSearch } from 'lucide-react';
import type { CustomerCatalogItem } from 'shared';

import { RepositoryRemote } from '@/services';

import { CopyButton } from '@/components/common/CopyButton';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';

function formatPrice(value?: number): string {
  if (value == null) return '—';
  return value.toLocaleString('vi-VN') + 'đ';
}

function CustomerCatalog() {
  const [items, setItems] = useState<CustomerCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [total, setTotal] = useState(0);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search);
      const res = await RepositoryRemote.customerCatalog.getCatalog(`?${params.toString()}`);
      setItems(res?.data?.data ?? []);
      setTotal(res?.data?.total ?? 0);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const handleSearch = () => {
    if (page !== 1) setPage(1);
    else fetchData();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-lg font-semibold">Danh mục sản phẩm</h1>
          <p className="text-xs text-muted-foreground">Giá tham khảo — sao chép tên sản phẩm để điền vào form đặt đơn.</p>
        </div>
        <Input
          placeholder="Tìm sản phẩm…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="max-w-xs"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <PackageSearch size={32} className="mb-3" />
          <p className="text-sm">Chưa có sản phẩm nào trong danh mục.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item._id} className="bg-card border border-border rounded-xl p-4 flex gap-3">
              {item.mockup ? (
                <img
                  src={item.mockup}
                  alt={item.fullName}
                  className="w-20 h-20 rounded-lg object-cover border border-border bg-muted shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground shrink-0">
                  <ImageIcon size={18} />
                </div>
              )}

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-sm truncate">{item.fullName}</p>
                  <CopyButton value={item.fullName} label="tên sản phẩm" />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {item.printMethod && <Badge variant="outline">{item.printMethod}</Badge>}
                  {item.productCategory && <Badge variant="outline">{item.productCategory}</Badge>}
                </div>

                {item.description && <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>}

                <div className="space-y-1 pt-1">
                  {item.variations.slice(0, 4).map((v) => (
                    <div key={v.sku} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate">
                        {[v.color, v.size].filter(Boolean).join(' / ') || v.sku}
                      </span>
                      <span className="font-medium">
                        {v.discountedPrice != null && v.discountedPrice !== v.retailPrice ? (
                          <>
                            <span className="line-through text-muted-foreground mr-1">{formatPrice(v.retailPrice)}</span>
                            <span className="text-rose-600">{formatPrice(v.discountedPrice)}</span>
                          </>
                        ) : (
                          formatPrice(v.retailPrice)
                        )}
                      </span>
                    </div>
                  ))}
                  {item.variations.length > 4 && (
                    <p className="text-xs text-muted-foreground">+ {item.variations.length - 4} biến thể khác</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="mt-4">
          <PaginationBar
            position="bottom"
            page={page}
            pageSize={pageSize}
            total={total}
            loading={false}
            onChange={(p, ps) => {
              setPage(p);
              setPageSize(ps);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default CustomerCatalog;
