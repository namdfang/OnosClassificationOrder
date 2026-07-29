import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PackageSearch, Search, X } from 'lucide-react';
import type { CustomerCatalogItem } from 'shared';

import { PATHS } from '@/constants/paths';

import { RepositoryRemote } from '@/services';

import { LoadingOverlay } from '@/components/common/LoadingOverlay';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Spinner } from '@/components/common/Spinner';
import { CatalogProductCard } from '@/components/customer/CatalogProductCard';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';

import { useDebounce } from '@/hooks/useDebounce';

function CustomerCatalog() {
  const { t } = useTranslation('customerPortal');
  const navigate = useNavigate();
  const [items, setItems] = useState<CustomerCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [total, setTotal] = useState(0);
  const debouncedSearch = useDebounce(search, 300);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (debouncedSearch) params.set('search', debouncedSearch);
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
  }, [page, pageSize, debouncedSearch]);

  // Đổi search → luôn quay về trang 1 (bỏ qua lần render đầu, tránh ghi đè page đọc từ URL nếu có).
  const isFirstRender = React.useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">{t('catalog.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('catalog.subtitle')}</p>
        </div>
        <div className="relative w-full sm:w-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('catalog.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-9 pr-8 sm:w-72"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              aria-label={t('catalog.clearSearch')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {!loading && items.length > 0 && (
        <p className="text-xs text-muted-foreground mb-3">{t('catalog.resultsCount', { count: total })}</p>
      )}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <PackageSearch size={32} className="mb-3" />
          <p className="text-sm">{t('catalog.empty')}</p>
        </div>
      ) : (
        <LoadingOverlay active={loading} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <CatalogProductCard
              key={item._id}
              item={item}
              onSelect={() => navigate(PATHS.CUSTOMER_CATALOG_DETAIL.replace(':id', item._id))}
            />
          ))}
        </LoadingOverlay>
      )}

      {items.length > 0 && (
        <div className="mt-4">
          <PaginationBar
            position="bottom"
            page={page}
            pageSize={pageSize}
            total={total}
            loading={loading}
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
