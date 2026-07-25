import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { PATHS } from '../../../constants/paths';
import { RepositoryRemote } from '../../../services';
import { handleAxiosError } from '../../../utils';

function buildPlaceOrderSchema(t: TFunction<'customerPortal'>) {
  return z.object({
    type: z.string().min(1, t('orderNew.validation.typeRequired')),
    color: z.string().optional(),
    size: z.string().optional(),
    quantity: z.coerce.number().int().positive().default(1),
    mockupUrl: z.string().optional(),
    printMethod: z.string().optional(),
    referent: z.string().optional(),
  });
}

type PlaceOrderFormValues = z.infer<ReturnType<typeof buildPlaceOrderSchema>>;

function CustomerOrderNew() {
  const navigate = useNavigate();
  const { t } = useTranslation('customerPortal');
  const [loading, setLoading] = useState(false);

  const placeOrderSchema = useMemo(() => buildPlaceOrderSchema(t), [t]);
  const form = useForm<PlaceOrderFormValues>({
    resolver: zodResolver(placeOrderSchema),
    defaultValues: { type: '', color: '', size: '', quantity: 1, mockupUrl: '', printMethod: '', referent: '' },
  });

  const onSubmit = async (values: PlaceOrderFormValues) => {
    try {
      setLoading(true);
      const res = await RepositoryRemote.customerOrder.placeOrder(values);
      toast.success(t('orderNew.success', { code: res?.data?.data?.productionId }));
      navigate(PATHS.CUSTOMER_ORDERS);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold mb-5">{t('orderNew.title')}</h1>

      <div className="bg-card border border-border rounded-xl p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('orderNew.type')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('orderNew.typePlaceholder')} className="h-10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('orderNew.color')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('orderNew.colorPlaceholder')} className="h-10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('orderNew.size')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('orderNew.sizePlaceholder')} className="h-10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('orderNew.quantity')}</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} className="h-10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mockupUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('orderNew.mockupUrl')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('orderNew.mockupUrlPlaceholder')} className="h-10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="printMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('orderNew.printMethod')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('orderNew.printMethodPlaceholder')} className="h-10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="referent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('orderNew.note')}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('orderNew.notePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={loading} className="w-full h-10">
              {loading && <Spinner size={14} className="text-primary-foreground" />}
              {t('orderNew.submit')}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}

export default CustomerOrderNew;
