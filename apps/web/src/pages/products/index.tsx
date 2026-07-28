import React from 'react';
import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { CollectionTab } from './CollectionTab';
import { FactoryTab } from './FactoryTab';
import { ProductCategoryTab } from './ProductCategoryTab';
import { ProductConfigTab } from './ProductConfigTab';

export default function Products() {
  const { t } = useTranslation('products');
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
          <Package size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('page.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('page.subtitle')}</p>
        </div>
      </div>

      <Tabs defaultValue="config" className="w-full">
        <TabsList>
          <TabsTrigger value="config">{t('page.tabs.config')}</TabsTrigger>
          <TabsTrigger value="category">{t('page.tabs.category')}</TabsTrigger>
          <TabsTrigger value="collection">{t('page.tabs.collection')}</TabsTrigger>
          <TabsTrigger value="factory">{t('page.tabs.factory')}</TabsTrigger>
        </TabsList>
        <TabsContent value="config">
          <ProductConfigTab />
        </TabsContent>
        <TabsContent value="category">
          <ProductCategoryTab />
        </TabsContent>
        <TabsContent value="collection">
          <CollectionTab />
        </TabsContent>
        <TabsContent value="factory">
          <FactoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
