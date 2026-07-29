import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { AlertCircle, Circle, CircleCheck, CircleDot } from 'lucide-react';
import type { CustomerCatalogItem, CustomerOrderSummary, LifecycleTrack } from 'shared';
import { toast } from 'sonner';

import { FileUrlOrUploadInput } from '@/components/common/FileUrlOrUploadInput';
import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { RepositoryRemote } from '../../../services';
import { handleAxiosError } from '../../../utils';

type TrackData = { order: CustomerOrderSummary; track: LifecycleTrack };

interface ShippingFormState {
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
}

const EMPTY_SHIPPING: ShippingFormState = {
  firstName: '',
  lastName: '',
  company: '',
  phone: '',
  email: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postcode: '',
  country: '',
};

function stageIcon(status: string) {
  if (status === 'done') return <CircleCheck size={18} className="text-emerald-500" />;
  if (status === 'current') return <CircleDot size={18} className="text-primary" />;
  if (status === 'error' || status === 'rework') return <AlertCircle size={18} className="text-destructive" />;
  return <Circle size={18} className="text-muted-foreground" />;
}

function CustomerOrderTrack() {
  const { t } = useTranslation('customerPortal');
  const { productionId } = useParams<{ productionId: string }>();
  const [data, setData] = useState<TrackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [product, setProduct] = useState<CustomerCatalogItem | null>(null);

  const [mockupUrl, setMockupUrl] = useState('');
  const [designUrls, setDesignUrls] = useState<Record<string, string>>({});
  const [shipping, setShipping] = useState<ShippingFormState>(EMPTY_SHIPPING);
  const [saving, setSaving] = useState(false);

  const fetchOrder = () => {
    if (!productionId) return;
    RepositoryRemote.customerOrder
      .trackOrder(productionId)
      .then((res) => {
        const payload = (res.data?.data ?? null) as TrackData | null;
        setData(payload);
        if (payload?.order) {
          setMockupUrl(payload.order.mockupUrl ?? '');
          setDesignUrls((payload.order.designs as Record<string, string> | undefined) ?? {});
          const addr = payload.order.shippingAddress;
          setShipping({
            firstName: addr?.firstName ?? '',
            lastName: addr?.lastName ?? '',
            company: addr?.company ?? '',
            phone: addr?.phone ?? '',
            email: addr?.email ?? '',
            address1: addr?.address1 ?? '',
            address2: addr?.address2 ?? '',
            city: addr?.city ?? '',
            state: addr?.state ?? '',
            postcode: addr?.postcode ?? '',
            country: addr?.country ?? '',
          });
        }
      })
      .catch((error) => {
        setNotFound(true);
        handleAxiosError(error);
      })
      .finally(() => setLoading(false));
  };

  useEffect(fetchOrder, [productionId]);

  useEffect(() => {
    const productConfigId = data?.order?.productConfigId;
    if (!productConfigId) {
      setProduct(null);
      return;
    }
    RepositoryRemote.customerCatalog
      .getCatalogItem(productConfigId)
      .then((res) => setProduct((res.data?.data ?? null) as CustomerCatalogItem | null))
      .catch(() => setProduct(null));
  }, [data?.order?.productConfigId]);

  const printAreas = product?.printArea ?? [];

  const canEdit = !!data?.order && !data.order.cancelledAt;

  const handleSave = async () => {
    if (!productionId) return;
    if (!shipping.firstName.trim() || !shipping.phone.trim() || !shipping.address1.trim() || !shipping.city.trim()) {
      toast.error(t('track.missingRequiredFields'));
      return;
    }
    try {
      setSaving(true);
      await RepositoryRemote.customerOrder.updateOrder(productionId, {
        mockupUrl: mockupUrl || undefined,
        designs: Object.keys(designUrls).length ? designUrls : undefined,
        shippingAddress: {
          firstName: shipping.firstName.trim(),
          lastName: shipping.lastName.trim() || undefined,
          company: shipping.company.trim() || undefined,
          phone: shipping.phone.trim(),
          email: shipping.email.trim() || undefined,
          address1: shipping.address1.trim(),
          address2: shipping.address2.trim() || undefined,
          city: shipping.city.trim(),
          state: shipping.state.trim() || undefined,
          postcode: shipping.postcode.trim() || undefined,
          country: shipping.country.trim() || undefined,
        },
      });
      toast.success(t('track.saveSuccess'));
      fetchOrder();
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setSaving(false);
    }
  };

  const shippingFields: Array<{ key: keyof ShippingFormState; label: string; required?: boolean }> = useMemo(
    () => [
      { key: 'firstName', label: t('orderNew.shippingFirstName'), required: true },
      { key: 'lastName', label: t('orderNew.shippingLastName') },
      { key: 'company', label: t('orderNew.shippingCompany') },
      { key: 'phone', label: t('orderNew.shippingPhone'), required: true },
      { key: 'email', label: t('orderNew.shippingEmail') },
      { key: 'address1', label: t('orderNew.shippingAddress1'), required: true },
      { key: 'address2', label: t('orderNew.shippingAddress2') },
      { key: 'city', label: t('orderNew.shippingCity'), required: true },
      { key: 'state', label: t('orderNew.shippingState') },
      { key: 'postcode', label: t('orderNew.shippingPostcode') },
      { key: 'country', label: t('orderNew.shippingCountry') },
    ],
    [t],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={24} />
      </div>
    );
  }

  if (notFound || !data) {
    return <p className="text-sm text-muted-foreground py-16 text-center">{t('track.notFound')}</p>;
  }

  const { order, track } = data;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">{order.productionId}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {order.type || '-'} · {order.color || '-'} / {order.size || '-'} · {t('track.quantityShort')}{' '}
            {order.quantity ?? '-'}
          </p>
        </div>
        {order.cancelledAt ? (
          <Badge variant="destructive">
            {t('track.cancelled')}
            {order.cancelReason ? `: ${order.cancelReason}` : ''}
          </Badge>
        ) : track.completed ? (
          <Badge variant="success">{t('track.completed')}</Badge>
        ) : (
          <Badge variant="secondary">{t('track.processing')}</Badge>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4">{t('track.progressTitle')}</h2>
        <ol className="space-y-4">
          {track.stages.map((stage) => (
            <li key={stage.key} className="flex items-start gap-3">
              {stageIcon(stage.status)}
              <div>
                <p
                  className={
                    stage.status === 'pending' ? 'text-sm text-muted-foreground' : 'text-sm font-medium text-foreground'
                  }
                >
                  {stage.label}
                </p>
                {stage.at && (
                  <p className="text-xs text-muted-foreground">{dayjs(stage.at).format('DD/MM/YYYY HH:mm')}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold mb-4">{t('track.editTitle')}</h2>

        {!canEdit ? (
          <p className="text-xs text-muted-foreground">{t('track.editCancelledHint')}</p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">{t('orderNew.mockupUrl')}</label>
              <FileUrlOrUploadInput value={mockupUrl} onChange={setMockupUrl} placeholder={t('orderNew.mockupUrlPlaceholder')} />
            </div>

            {printAreas.map((area) => (
              <div key={area.key} className="space-y-1.5">
                <label className="text-sm font-medium leading-none">{t('orderNew.designUrl', { area: area.label })}</label>
                <FileUrlOrUploadInput
                  value={designUrls[area.key] ?? ''}
                  onChange={(v) => setDesignUrls((prev) => ({ ...prev, [area.key]: v }))}
                  placeholder={t('orderNew.designUrlPlaceholder')}
                />
              </div>
            ))}

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {t('orderNew.shippingTitle')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {shippingFields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <label className="text-sm font-medium leading-none">
                      {f.label}
                      {f.required && <span className="text-destructive"> *</span>}
                    </label>
                    <Input
                      className="h-9"
                      type={f.key === 'email' ? 'email' : 'text'}
                      value={shipping[f.key]}
                      onChange={(e) => setShipping((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="h-10">
              {saving && <Spinner size={14} className="text-primary-foreground" />}
              {t('track.saveChanges')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerOrderTrack;
