import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { AlertCircle, Circle, CircleCheck, CircleDot } from 'lucide-react';
import type { CustomerOrderSummary, LifecycleTrack } from 'shared';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';

import { RepositoryRemote } from '../../../services';
import { handleAxiosError } from '../../../utils';

type TrackData = { order: CustomerOrderSummary; track: LifecycleTrack };

function stageIcon(status: string) {
  if (status === 'done') return <CircleCheck size={18} className="text-emerald-500" />;
  if (status === 'current') return <CircleDot size={18} className="text-primary" />;
  if (status === 'error' || status === 'rework') return <AlertCircle size={18} className="text-destructive" />;
  return <Circle size={18} className="text-muted-foreground" />;
}

function CustomerOrderTrack() {
  const { productionId } = useParams<{ productionId: string }>();
  const [data, setData] = useState<TrackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!productionId) return;
    RepositoryRemote.customerOrder
      .trackOrder(productionId)
      .then((res) => setData(res?.data?.data ?? null))
      .catch((error) => {
        setNotFound(true);
        handleAxiosError(error);
      })
      .finally(() => setLoading(false));
  }, [productionId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={24} />
      </div>
    );
  }

  if (notFound || !data) {
    return <p className="text-sm text-muted-foreground py-16 text-center">Không tìm thấy đơn hàng này.</p>;
  }

  const { order, track } = data;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">{order.productionId}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {order.type || '-'} · {order.color || '-'} / {order.size || '-'} · SL {order.quantity ?? '-'}
          </p>
        </div>
        {order.cancelledAt ? (
          <Badge variant="destructive">Đã hủy{order.cancelReason ? `: ${order.cancelReason}` : ''}</Badge>
        ) : track.completed ? (
          <Badge variant="success">Hoàn thành</Badge>
        ) : (
          <Badge variant="secondary">Đang xử lý</Badge>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold mb-4">Tiến trình đơn hàng</h2>
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
    </div>
  );
}

export default CustomerOrderTrack;
