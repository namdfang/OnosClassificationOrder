import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
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

const placeOrderSchema = z.object({
  type: z.string().min(1, 'Loại sản phẩm là bắt buộc'),
  color: z.string().optional(),
  size: z.string().optional(),
  quantity: z.coerce.number().int().positive().default(1),
  mockupUrl: z.string().optional(),
  printMethod: z.string().optional(),
  referent: z.string().optional(),
});

type PlaceOrderFormValues = z.infer<typeof placeOrderSchema>;

function CustomerOrderNew() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const form = useForm<PlaceOrderFormValues>({
    resolver: zodResolver(placeOrderSchema),
    defaultValues: { type: '', color: '', size: '', quantity: 1, mockupUrl: '', printMethod: '', referent: '' },
  });

  const onSubmit = async (values: PlaceOrderFormValues) => {
    try {
      setLoading(true);
      const res = await RepositoryRemote.customerOrder.placeOrder(values);
      toast.success(`Đặt đơn thành công — mã đơn ${res?.data?.data?.productionId}`);
      navigate(PATHS.CUSTOMER_ORDERS);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold mb-5">Đặt đơn mới</h1>

      <div className="bg-card border border-border rounded-xl p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại sản phẩm</FormLabel>
                  <FormControl>
                    <Input placeholder="Vd: Áo thun, Cốc sứ..." className="h-10" {...field} />
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
                    <FormLabel>Màu</FormLabel>
                    <FormControl>
                      <Input placeholder="Đen" className="h-10" {...field} />
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
                    <FormLabel>Size</FormLabel>
                    <FormControl>
                      <Input placeholder="M" className="h-10" {...field} />
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
                  <FormLabel>Số lượng</FormLabel>
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
                  <FormLabel>Link ảnh mockup/thiết kế (không bắt buộc)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." className="h-10" {...field} />
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
                  <FormLabel>Phương pháp in (không bắt buộc)</FormLabel>
                  <FormControl>
                    <Input placeholder="DTG, DTF..." className="h-10" {...field} />
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
                  <FormLabel>Ghi chú (không bắt buộc)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Ghi chú thêm cho đơn hàng..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={loading} className="w-full h-10">
              {loading && <Spinner size={14} className="text-primary-foreground" />}
              Đặt đơn
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}

export default CustomerOrderNew;
