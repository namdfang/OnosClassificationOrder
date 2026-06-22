import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/usePermission';

import { ListOrderTab } from './ListOrderTab';
import { ErrorLogTab } from './ErrorLogTab';
import { ImportOrderTab } from './ImportOrderTab';
import { OrderTableWorkshop } from './OrderTableWorkshop';

const ALL_TABS = ['list', 'error-log', 'workshop', 'import'] as const;
type TabKey = (typeof ALL_TABS)[number];

export default function Orders() {
  const { canViewAdminTable, canViewWorkshopTable, has } = usePermission();

  const adminVisible = canViewAdminTable();
  const workshopVisible = canViewWorkshopTable();
  const canImport = has('order.import');

  const tabs = useMemo(() => {
    const out: { key: TabKey; label: string }[] = [];
    if (adminVisible) out.push({ key: 'list', label: 'List Order' });
    // Nhật ký bù lỗi — hiển thị cho mọi role có quyền xem orders (kể cả
    // Designer/Fulfillment; visibility filter ở BE đảm bảo scope đúng).
    out.push({ key: 'error-log', label: 'Nhật ký bù lỗi' });
    if (workshopVisible) out.push({ key: 'workshop', label: 'Bảng Workshop' });
    if (canImport) out.push({ key: 'import', label: 'Import Order' });
    return out;
  }, [adminVisible, workshopVisible, canImport]);

  const [searchParams, setSearchParams] = useSearchParams();
  const initial = (searchParams.get('tab') as TabKey) || tabs[0]?.key || 'workshop';
  const valid = tabs.some((t) => t.key === initial) ? initial : tabs[0]?.key || 'workshop';
  const [activeTab, setActiveTab] = useState<TabKey>(valid);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fromUrl = searchParams.get('tab') as TabKey;
    if (fromUrl && tabs.some((t) => t.key === fromUrl) && fromUrl !== activeTab) {
      setActiveTab(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tabs]);

  // Param prefix per tab (xem ListOrderTab / OrderTableWorkshop / ErrorLogTab).
  // Khi đổi tab, strip param của tab khác để URL không lẫn lộn.
  const LIST_PARAMS = ['lsearch', 'lmapped', 'lpage', 'lsize'];
  const WORKSHOP_PARAMS = ['wsearch', 'wfrom', 'wto', 'wprint', 'wnote', 'wassign', 'wpage', 'wsize'];
  const ERROR_LOG_PARAMS = [
    'esearch',
    'eassign',
    'efabric',
    'etool',
    'ecode',
    'esource',
    'eurg',
    'epage',
    'esize',
  ];

  const handleTabChange = (val: string) => {
    setActiveTab(val as TabKey);
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        sp.set('tab', val);
        if (val !== 'list') LIST_PARAMS.forEach((k) => sp.delete(k));
        if (val !== 'workshop') WORKSHOP_PARAMS.forEach((k) => sp.delete(k));
        if (val !== 'error-log') ERROR_LOG_PARAMS.forEach((k) => sp.delete(k));
        return sp;
      },
      { replace: true },
    );
  };

  if (tabs.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Bạn không có quyền xem trang Orders.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
          <ShoppingCart size={20} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground">Quản lý production orders</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {adminVisible && (
          <TabsContent value="list">
            <ListOrderTab refreshKey={refreshKey} />
          </TabsContent>
        )}

        <TabsContent value="error-log">
          <ErrorLogTab />
        </TabsContent>

        {workshopVisible && (
          <TabsContent value="workshop">
            <OrderTableWorkshop />
          </TabsContent>
        )}

        {canImport && (
          <TabsContent value="import">
            <ImportOrderTab
              onImported={() => {
                setRefreshKey((k) => k + 1);
                handleTabChange(adminVisible ? 'list' : 'workshop');
              }}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
