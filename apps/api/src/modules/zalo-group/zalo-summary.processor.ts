import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';

import type { ZaloSummaryJobData } from './zalo-summary.queue';
import { ZALO_SUMMARY_QUEUE } from './zalo-summary.queue';
import { ZaloSummaryService } from './zalo-summary.service';

/**
 * Worker tóm tắt nhóm Zalo.
 *
 * Vì sao phải qua hàng đợi thay vì gọi thẳng trong request: một lượt tóm tắt
 * mất ~40 giây. Giữ nó trong một request HTTP nghĩa là bất cứ thứ gì cắt kết
 * nối trong 40 giây đó — deploy, API restart, nginx timeout, mạng chập — là
 * mất trắng cả lượt. Đã đứt hai lần trong lúc phát triển vì đúng lý do này.
 *
 * `concurrency: 2` — chạy song song vừa phải. Mỗi job là một lượt gọi mô hình;
 * đẩy cao hơn thì vừa tốn tiền dồn cục vừa dễ chạm giới hạn tần suất, mà công
 * việc này không ai chờ theo giây.
 */
@Processor(ZALO_SUMMARY_QUEUE, { concurrency: 2 })
export class ZaloSummaryProcessor extends WorkerHost {
  private readonly logger = new Logger(ZaloSummaryProcessor.name);

  constructor(private readonly zaloSummaryService: ZaloSummaryService) {
    super();
  }

  async process(job: Job<ZaloSummaryJobData>): Promise<void> {
    const { groupGlobalId, messages, docLaiTuDau, epDocLai } = job.data;
    try {
      await this.zaloSummaryService.summarize({ groupGlobalId, messages, docLaiTuDau, epDocLai });
    } catch (err) {
      // Lỗi NGHIỆP VỤ (nhóm chưa phân loại, nhóm đã xoá) không bao giờ tự khỏi —
      // thử lại 3 lần chỉ tổ lấp log. `UnrecoverableError` bảo BullMQ bỏ ngay.
      // Lỗi hạ tầng (mô hình quá tải, mạng chập) vẫn thử lại như thường.
      // 422 = mô hình trả sai khuôn / hết lượt: gọi lại y nguyên cũng hỏng y
      // nguyên, và mỗi lần là một lượt gọi tốn tiền.
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException ||
        err instanceof UnprocessableEntityException
      ) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ZaloSummaryJobData>, err: Error) {
    this.logger.error(
      `[zalo-summary] nhóm ${job?.data?.groupGlobalId} thất bại (lần ${job?.attemptsMade}): ${err?.message}`,
    );
  }
}
