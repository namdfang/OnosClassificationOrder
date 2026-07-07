import React, { useEffect, useState } from 'react';
import { BarChart3, ClipboardList, Factory, FileSearch, Palette, TriangleAlert, Workflow } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/usePermission';

import DesignerStatsTab from './DesignerStatsTab';
import LifecycleStrip from './LifecycleStrip';
import LifecycleTab from './LifecycleTab';
import OrderFactoryTab from './OrderFactoryTab';
import OrderStatsTab from './OrderStatsTab';
import OrderStatusTab from './OrderStatusTab';
import PersonErrorTab from './PersonErrorTab';
import ToolCheckTab from './ToolCheckTab';
import { SendTelegramReportButton } from './SendTelegramReportButton';

const TABS = ['factory', 'stats', 'status', 'lifecycle', 'tool-check', 'person-error', 'designer'] as const;
type TabKey = (typeof TABS)[number];

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { has, isAdmin } = usePermission();
  const canSeeDesigner = has('page.designer_stats');
  // Tab "Vòng đời đơn" chi tiết — mở cho mọi tài khoản (Fulfillment tự khóa xưởng ở BE).
  const canSeeLifecycle = true;
  // Tab "Soát tool" chỉ Support + Admin.
  const canSeeToolCheck = isAdmin || has('page.tool_check');
  // Tab "Lỗi theo người" — quản lý (dùng chung quyền xem thống kê designer/tool).
  const canSeePersonError = isAdmin || has('page.designer_stats') || has('page.tool_check');
  const isTabAllowed = (t: TabKey) =>
    t === 'lifecycle'
      ? canSeeLifecycle
      : t === 'tool-check'
        ? canSeeToolCheck
        : t === 'person-error'
          ? canSeePersonError
          : true;
  const initial = (searchParams.get('tab') as TabKey) || 'factory';
  const [activeTab, setActiveTab] = useState<TabKey>(
    TABS.includes(initial) && isTabAllowed(initial) ? initial : 'stats',
  );

  useEffect(() => {
    const fromUrl = searchParams.get('tab') as TabKey;
    if (fromUrl && TABS.includes(fromUrl) && isTabAllowed(fromUrl) && fromUrl !== activeTab) {
      setActiveTab(fromUrl);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (val: string) => {
    setActiveTab(val as TabKey);
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      sp.set('tab', val);
      // Mỗi tab có namespace riêng (xem hook / component tương ứng):
      //   stats:   sfrom, sto, stype, suser
      //   status:  printStatus*, toolResult*, errorFile, assignee*, factoryId,
      //            machineTypeId, readyForFulfill, createdFrom, createdTo, search
      //   factory: ffrom, fto, ffactory, fmode, fstage, ftype, ffabric, ftool,
      //            fmachine, fpage, fsize
      // Đổi tab → strip param của 2 tab kia để URL không lẫn.
      if (val !== 'stats') {
        ['sfrom', 'sto', 'stype', 'suser'].forEach((k) => sp.delete(k));
      }
      if (val !== 'status') {
        ['printStatus', 'printStatusNote', 'toolResult', 'toolResultNote', 'errorFile', 'assignee', 'assigneeNote', 'factoryId', 'machineTypeId', 'readyForFulfill', 'createdFrom', 'createdTo', 'search'].forEach((k) => sp.delete(k));
      }
      if (val !== 'factory') {
        ['ffrom', 'fto', 'fview', 'ffactory', 'fmode', 'fstage', 'ftype', 'ffabric', 'ftool', 'fmachine', 'fmnum', 'ftoolnote', 'fuser', 'fpage', 'fsize'].forEach((k) => sp.delete(k));
      }
      if (val !== 'lifecycle') {
        ['lfrom', 'lto', 'lfactory'].forEach((k) => sp.delete(k));
      }
      return sp;
    }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
          <BarChart3 size={20} className="text-indigo-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Tổng quan hoạt động xưởng</p>
        </div>
        {isAdmin && <SendTelegramReportButton />}
      </div>

      {/* Strip vòng đời đơn — gọn, hiện trên đầu mọi tab, cho mọi tài khoản */}
      <LifecycleStrip />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="factory" className="gap-1.5">
            <Factory size={14} /> Đơn hàng theo xưởng
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5">
            <BarChart3 size={14} /> Thống kê đơn & sản phẩm
          </TabsTrigger>
          <TabsTrigger value="status" className="gap-1.5">
            <ClipboardList size={14} /> Tình trạng đơn hàng
          </TabsTrigger>
          {canSeeLifecycle && (
            <TabsTrigger value="lifecycle" className="gap-1.5">
              <Workflow size={14} /> Vòng đời đơn
            </TabsTrigger>
          )}
          {canSeeToolCheck && (
            <TabsTrigger value="tool-check" className="gap-1.5">
              <FileSearch size={14} /> Soát tool
            </TabsTrigger>
          )}
          {canSeePersonError && (
            <TabsTrigger value="person-error" className="gap-1.5">
              <TriangleAlert size={14} /> Lỗi theo người
            </TabsTrigger>
          )}
          {canSeeDesigner && (
            <TabsTrigger value="designer" className="gap-1.5">
              <Palette size={14} /> Designer
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="stats">
          <OrderStatsTab />
        </TabsContent>
        <TabsContent value="status">
          <OrderStatusTab />
        </TabsContent>
        <TabsContent value="factory">
          <OrderFactoryTab />
        </TabsContent>
        {canSeeLifecycle && (
          <TabsContent value="lifecycle">
            <LifecycleTab />
          </TabsContent>
        )}
        {canSeeToolCheck && (
          <TabsContent value="tool-check">
            <ToolCheckTab />
          </TabsContent>
        )}
        {canSeePersonError && (
          <TabsContent value="person-error">
            <PersonErrorTab />
          </TabsContent>
        )}
        {canSeeDesigner && (
          <TabsContent value="designer">
            <DesignerStatsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
