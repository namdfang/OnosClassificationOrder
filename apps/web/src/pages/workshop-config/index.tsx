import React from 'react';
import { Building2 } from 'lucide-react';
import { WORKSHOP_CONFIG_MODE, WorkshopConfigCategory } from 'shared';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { CategoryEditor } from './CategoryEditor';

const TABS: { key: WorkshopConfigCategory; label: string; description: string }[] = [
  { key: WorkshopConfigCategory.PrintStatus, label: 'Trạng thái in', description: 'Danh sách trạng thái in (hiển thị badge màu)' },
  { key: WorkshopConfigCategory.PrintStatusNote, label: 'Note trạng thái in', description: 'Ghi chú lần in (hiển thị icon)' },
  { key: WorkshopConfigCategory.ToolResult, label: 'Kết quả Tool', description: 'Có/không có tool (hiển thị icon)' },
  { key: WorkshopConfigCategory.ToolResultNote, label: 'Note kết quả Tool', description: 'OK / Lỗi / Không có file (hiển thị badge màu)' },
  { key: WorkshopConfigCategory.ErrorFileType, label: 'File sửa lỗi', description: 'Loại file lỗi (hiển thị icon)' },
  { key: WorkshopConfigCategory.Assignee, label: 'Người thực hiện', description: 'Danh sách nhân sự (hiển thị icon)' },
  { key: WorkshopConfigCategory.AssigneeNote, label: 'Note người thực hiện', description: 'Trạng thái xử lý (hiển thị icon)' },
  { key: WorkshopConfigCategory.FabricType, label: 'Loại vải', description: 'Loại vải / blank dùng cho đơn (hiển thị icon)' },
];

export default function WorkshopConfigPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
          <Building2 size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý xưởng</h1>
          <p className="text-sm text-muted-foreground">
            Cấu hình danh mục dùng cho cột nghiệp vụ của Order: trạng thái in, kết quả tool, file lỗi, người thực hiện...
          </p>
        </div>
      </div>

      <Tabs defaultValue={TABS[0].key} className="w-full">
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="space-y-3">
            <p className="text-xs text-muted-foreground">{t.description}</p>
            <CategoryEditor category={t.key} mode={WORKSHOP_CONFIG_MODE[t.key]} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
