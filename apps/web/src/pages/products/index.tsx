import React from 'react';
import { Package } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { FactoryTab } from './FactoryTab';
import { ProductCategoryTab } from './ProductCategoryTab';
import { ProductConfigTab } from './ProductConfigTab';

export default function Products() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
          <Package size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sản phẩm</h1>
          <p className="text-sm text-muted-foreground">Quản lý product config, danh mục sản phẩm, xưởng và loại máy</p>
        </div>
      </div>

      <Tabs defaultValue="config" className="w-full">
        <TabsList>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="category">Danh mục</TabsTrigger>
          <TabsTrigger value="factory">Xưởng</TabsTrigger>
        </TabsList>
        <TabsContent value="config">
          <ProductConfigTab />
        </TabsContent>
        <TabsContent value="category">
          <ProductCategoryTab />
        </TabsContent>
        <TabsContent value="factory">
          <FactoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
