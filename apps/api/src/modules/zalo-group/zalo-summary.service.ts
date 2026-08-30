import { query } from '@anthropic-ai/claude-agent-sdk';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Queue } from 'bullmq';
import { Model } from 'mongoose';
import type {
  GetZaloSummariesDto,
  SummarizeZaloGroupDto,
  ZaloMessageInput,
  ZaloSummaryQueueItem,
  ZaloSummaryTask,
} from 'shared';
import {
  FULFILLMENT_STAGE_LABELS,
  ZALO_GROUP_ANALYZABLE_KINDS,
  ZALO_IDENTITY_CHAT_LABELS,
  ZaloIdentityKind,
  ZaloSummaryLevel,
} from 'shared';

import { OrderEntity } from '../order/order.entity';
import { ZaloGroupLinkEntity } from './zalo-group-link.entity';
import type { ZaloGroupSummaryDocument } from './zalo-group-summary.entity';
import { ZaloGroupSummaryEntity } from './zalo-group-summary.entity';
import { ZaloIdentityService } from './zalo-identity.service';
import type { ZaloSummaryJobData } from './zalo-summary.queue';
import { ZALO_SUMMARY_QUEUE } from './zalo-summary.queue';

/**
 * Mô hình. Agent SDK nhận ALIAS (`opus`/`sonnet`/`haiku`), không phải model id
 * đầy đủ — giống `HUB_ASSISTANT_MODEL` bên thghub.
 */
const MODEL = process.env.ZALO_SUMMARY_MODEL || 'opus';

/**
 * Trần thời gian một lượt gọi. Nginx cắt ở 60 giây, một lượt bình thường ~30
 * giây. Tự dừng ở 50 để còn kịp trả lỗi có nội dung — để nginx cắt thì người
 * dùng nhận một trang lỗi trống không nói được gì. (Bài học của thghub.)
 */
const HAN_GIAY = Number(process.env.ZALO_SUMMARY_TIMEOUT_SEC || 50);

/**
 * Đường dẫn CLI `claude`. Agent SDK KHÔNG tự gọi API — nó `spawn` tiến trình
 * CLI này, nên máy chạy API bắt buộc phải có Claude Code cài sẵn.
 *
 * Vì sao phải khai tường minh thay vì để SDK tự tìm trong PATH: bản cài mặc
 * định đặt CLI ở `~/.local/bin`, mà tiến trình PM2 lại chạy với PATH hệ thống
 * (`/usr/local/bin:/usr/bin:...`) — không có thư mục đó. Kết quả là `spawn`
 * hỏng, còn lỗi nổi lên chỉ nói chung chung về xác thực, dẫn người đọc đi tìm
 * nhầm phía thông tin đăng nhập. Đã mất vài lượt truy vì đúng chỗ này.
 */
const CLAUDE_CLI = process.env.CLAUDE_CLI_PATH;

/** Bao lâu thì phải đọc lại từ đầu để cắt bệnh trôi dần của tóm tắt cuốn chiếu. */
const NGAY_DOC_LAI = Number(process.env.ZALO_SUMMARY_REREAD_DAYS || 7);

/** Nhóm im lâu hơn mức này thì không tốn tiền tóm tắt lại. */
const NGAY_BO_QUA_NHOM_IM = Number(process.env.ZALO_SUMMARY_IDLE_DAYS || 14);

const HE_THONG = `Bạn đọc một đoạn hội thoại nhóm Zalo giữa nhân viên công ty in ấn và khách hàng.
Nhiệm vụ: rút ra tình hình, viết TIẾNG VIỆT, mỗi ô 1–2 câu ngắn, cụ thể. KHÔNG kể lại nội dung chat.

🔴 MỌI KẾT LUẬN PHẢI KÈM MỐC THỜI GIAN VÀ TÊN NGƯỜI. Mỗi dòng chat có dạng
"[DD/MM HH:MM] VAI TRÒ/Tên:" với VAI TRÒ là KHÁCH, NHÂN VIÊN, TRỢ LÝ AI hoặc CHƯA RÕ — hãy DÙNG nó:
- "khách hỏi X" → phải là "20/08 khách (Tên) hỏi X"
- "đã trả lời" → phải là "21/08 (Tên nhân viên) trả lời rằng…" — nêu ĐÍCH DANH ai
- việc còn treo → phải nói TREO TỪ NGÀY NÀO và ĐÃ BAO NHIÊU NGÀY
Không có mốc thời gian và tên người thì không chấm được ai chậm — đó là mục đích của bản tóm tắt này.
"TRỢ LÝ AI" là tài khoản tự động trực nhóm. Nếu chỉ có TRỢ LÝ AI trả lời khách mà KHÔNG nhân viên
nào vào, hãy nêu rõ điều đó trong "tonDong" — đó là nhóm cần người thật tiếp quản.
Dòng ghi "CHƯA RÕ" là người chưa được phân loại: đừng khẳng định họ là nhân viên hay khách.
Chỉ ghi tên/ngày CÓ THẬT trong chat. Không thấy thì ghi "không rõ", tuyệt đối không đoán.

Nếu có khối "DỮ LIỆU ĐƠN HÀNG THẬT", đó là trạng thái tra từ hệ thống sản xuất — nó ĐÚNG hơn
những gì người ta nói trong chat. Dùng nó để:
- Trả lời được câu khách hỏi: đơn đang ở công đoạn nào, có bị giữ/lỗi không, đã bao nhiêu ngày.
- Bác bỏ lời hứa sai: ai đó nói "đã xử lý xong" mà đơn vẫn đang kẹt thì đưa vào "nghiNgo".
- Chấm mức độ: đơn đang BỊ GIỮ hoặc CÓ LỖI là căn cứ chắc chắn cho "gap", chắc hơn nhiều so với
  suy đoán từ giọng điệu chat.
Đơn nào chat có nhắc mà khối dữ liệu ghi "không tra được" thì nói rõ là không tra được, đừng đoán.

Nếu có khối "TÓM TẮT LẦN TRƯỚC", bạn đang cập nhật tiếp chứ không viết lại từ đầu. Làm ĐÚNG BA việc:
  a) XÁC MINH việc đã đánh dấu xong: tìm bằng chứng trong tin nhắn mới. KHÔNG thấy bằng chứng thì
     đưa vào "nghiNgo". Thấy rồi thì thôi, đừng nhắc lại.
  b) GIỮ TIẾP việc còn treo nếu tin nhắn mới không cho thấy nó đã xong. Việc nào tin nhắn mới cho
     thấy ĐÃ XONG thì BỎ khỏi checklist — đừng giữ chỉ vì lần trước có.
  c) THÊM việc mới phát sinh.
Tin nhắn mới là bên có tiếng nói cuối. Tóm tắt lần trước chỉ để nhớ, không phải để bảo vệ.

Trả về DUY NHẤT một khối JSON, không thêm chữ nào ngoài nó:
{
  "tieuDe": "tối đa 12 chữ, nêu đúng việc đang treo",
  "khachQuanTam": "NGÀY + ai bên khách + hỏi/cần gì",
  "salePhanHoi": "NGÀY + TÊN nhân viên + đã trả lời/xử lý gì",
  "tonDong": "việc còn treo + TREO TỪ NGÀY NÀO + đã bao nhiêu ngày. Không có thì ghi 'Không có'",
  "checklist": ["mỗi phần tử là MỘT việc làm được ngay, bắt đầu bằng động từ, tối đa 24 chữ, tối đa 5 việc"],
  "nghiNgo": ["việc đã tick xong nhưng không thấy bằng chứng, kèm lý do ngắn"],
  "mucDo": "gap" | "can-chu-y" | "binh-thuong"
}

Chấm mức độ — CHỈ dựa vào bằng chứng CỨNG, không chấm theo giọng điệu hay cảm giác:
- "gap": CHỈ khi có ít nhất một trong các dấu hiệu tra được từ hệ thống hoặc nói rõ trong chat:
    · khối dữ liệu đơn hàng cho thấy đơn ĐANG BỊ GIỮ hoặc ĐANG CÓ LỖI
    · khách nói rõ đang khiếu nại, đòi hoàn tiền, doạ huỷ hợp tác
    · có mốc hạn cụ thể đã trôi qua (hạn giao, hạn hải quan, hạn thanh toán)
  Chậm trả lời KHÔNG phải căn cứ cho "gap".
- "can-chu-y": còn việc treo, hoặc khách hỏi đã quá 3 ngày chưa ai đáp.
- "binh-thuong": việc đang chạy theo nhịp bình thường, kể cả khi còn vài việc chưa xong.

Đây là nhóm khách B2B — chờ báo giá, chờ mẫu, chờ hợp đồng vài ngày là NHỊP BÌNH THƯỜNG, không
phải sự cố. Chấm "gap" cho quá nhiều nhóm thì cái nhãn đó mất hết tác dụng cảnh báo.`;

interface KetQua {
  tieuDe: string;
  khachQuanTam: string;
  salePhanHoi: string;
  tonDong: string;
  checklist: string[];
  nghiNgo: string[];
  mucDo: string;
}

@Injectable()
export class ZaloSummaryService {
  private readonly logger = new Logger(ZaloSummaryService.name);

  constructor(
    @InjectModel(ZaloGroupSummaryEntity.name)
    private readonly summaryModel: Model<ZaloGroupSummaryEntity>,
    @InjectModel(ZaloGroupLinkEntity.name)
    private readonly linkModel: Model<ZaloGroupLinkEntity>,
    @InjectModel(OrderEntity.name)
    private readonly orderModel: Model<OrderEntity>,
    @InjectQueue(ZALO_SUMMARY_QUEUE) private readonly summaryQueue: Queue<ZaloSummaryJobData>,
    private readonly identityService: ZaloIdentityService,
  ) {}

  /**
   * Đẩy một nhóm vào hàng đợi thay vì tóm tắt ngay trong request.
   *
   * `jobId` gồm CẢ mốc tin cuối, không chỉ mã nhóm. Dùng riêng mã nhóm thì
   * BullMQ coi mọi lần đẩy sau là trùng và nuốt luôn — kể cả khi nhóm đã có
   * tin mới — vì job đã hoàn thành vẫn nằm lại Redis theo `removeOnComplete`.
   * Đã dẫm phải: đẩy lại nhóm DESI hai lần, hàng đợi trống, không job nào
   * thất bại, mà bản tóm tắt không hề đổi.
   *
   * Ghép thêm mốc tin cho đúng ý định ban đầu: cùng nhóm + cùng nội dung thì
   * bỏ qua (khỏi tốn một lượt gọi mô hình), có tin mới thì chạy lại.
   */
  async enqueue(dto: SummarizeZaloGroupDto): Promise<{ queued: boolean }> {
    // Chặn ngay ở cửa vào: nhóm chưa phân loại thì báo lỗi cho người gọi thay
    // vì xếp hàng rồi để job hỏng lặng lẽ trong worker.
    await this.assertDuocDocChat(dto.groupGlobalId);

    const mocCuoi = dto.messages.reduce<number>((max, m) => {
      const t = m.luc ? new Date(m.luc).getTime() : 0;

      return t > max ? t : max;
    }, 0);
    const jobId = `${dto.groupGlobalId}:${mocCuoi}${dto.docLaiTuDau ? ':full' : ''}`;

    // Xoá job CÙNG jobId còn sót lại trước khi thêm. `removeOnFail` giữ job
    // hỏng tới 500 bản / 14 ngày, mà BullMQ coi jobId trùng là trùng — nên một
    // job từng hỏng sẽ chặn mọi lần thử lại của đúng nhóm đó, im lặng: endpoint
    // vẫn báo "đã xếp hàng", hàng đợi không nhúc nhích, không lỗi mới nào.
    // Đã dẫm phải trên production: 52 job hỏng vì thiếu CLI, sửa xong CLI rồi
    // mà chạy lại vẫn không có gì xảy ra.
    await this.summaryQueue.remove(jobId).catch(() => undefined);

    const job = await this.summaryQueue.add(
      'summarize',
      { groupGlobalId: dto.groupGlobalId, messages: dto.messages, docLaiTuDau: dto.docLaiTuDau },
      { jobId },
    );

    return { queued: !!job.id };
  }

  /**
   * Danh sách nhóm đang chờ tóm tắt, kèm mốc tin cần lấy từ.
   *
   * Script bên ngoài gọi cái này trước, rồi mới sang `onosceo` kéo tin — như
   * vậy nó chỉ kéo phần MỚI thay vì tải lại toàn bộ lịch sử mỗi lượt.
   */
  async getQueue(): Promise<ZaloSummaryQueueItem[]> {
    // Chốt riêng tư: chỉ nhóm đã phân loại seller/operation mới được đọc chat.
    const groups = await this.linkModel
      .find({ kind: { $in: ZALO_GROUP_ANALYZABLE_KINDS }, deletedAt: { $exists: false } })
      .select('groupGlobalId title lastMessageAt')
      .lean();

    const summaries = await this.summaryModel.find({}).select('groupGlobalId denMocTin docDayDuLuc').lean();
    const byGroup = new Map(summaries.map((s) => [String(s.groupGlobalId), s]));

    const now = Date.now();
    const nguongIm = now - NGAY_BO_QUA_NHOM_IM * 86_400_000;
    const out: ZaloSummaryQueueItem[] = [];

    for (const g of groups) {
      const gid = String((g as { groupGlobalId: string }).groupGlobalId);
      const lastMsg = (g as { lastMessageAt?: Date }).lastMessageAt;
      // Nhóm chưa có tin, hoặc im quá lâu → bỏ qua, khỏi tốn tiền gọi mô hình.
      if (!lastMsg || new Date(lastMsg).getTime() < nguongIm) continue;

      const prev = byGroup.get(gid);
      // Đã tóm tắt tới đúng tin cuối rồi thì không có gì mới để đọc.
      if (prev?.denMocTin && new Date(prev.denMocTin).getTime() >= new Date(lastMsg).getTime()) continue;

      const docLai =
        !prev?.docDayDuLuc || now - new Date(prev.docDayDuLuc).getTime() > NGAY_DOC_LAI * 86_400_000;

      out.push({
        groupGlobalId: gid,
        title: (g as { title?: string }).title,
        // Đọc lại từ đầu thì bỏ mốc, lấy toàn bộ.
        tuMoc: docLai ? null : (prev?.denMocTin ?? null),
        docLaiTuDau: docLai,
      });
    }

    return out;
  }

  /**
   * Chốt riêng tư: chỉ nhóm đã phân loại `seller`/`operation` mới được đọc chat.
   *
   * Gọi ở CẢ hai chỗ — lúc xếp hàng và lúc worker chạy. Chỉ kiểm ở worker thì
   * người gọi nhận `queued: true` rồi job âm thầm hỏng, lại còn tốn 3 lần thử
   * lại cho một lỗi không bao giờ tự khỏi. Chỉ kiểm ở cửa vào thì job cũ nằm
   * sẵn trong hàng đợi vẫn chạy được sau khi nhóm bị đổi sang `internal`.
   */
  private async assertDuocDocChat(groupGlobalId: string): Promise<Record<string, unknown>> {
    const link = await this.linkModel.findOne({ groupGlobalId }).lean();
    if (!link) throw new NotFoundException('Không tìm thấy nhóm Zalo.');

    const kind = (link as { kind?: string }).kind;
    if (!kind || !ZALO_GROUP_ANALYZABLE_KINDS.includes(kind as never)) {
      throw new BadRequestException(
        'Nhóm này chưa được phân loại là nhóm khách hoặc nhóm vận hành — không đọc nội dung chat.',
      );
    }

    return link as Record<string, unknown>;
  }

  /** Gọi mô hình tóm tắt một nhóm rồi lưu kết quả. */
  async summarize(dto: SummarizeZaloGroupDto): Promise<ZaloGroupSummaryDocument> {
    const link = await this.assertDuocDocChat(dto.groupGlobalId);

    const prev = await this.summaryModel.findOne({ groupGlobalId: dto.groupGlobalId }).lean();
    const docLaiTuDau = dto.docLaiTuDau ?? false;

    const duLieuDon = await this.layDuLieuDon(
      link as { customerId?: string; userSku?: string },
      dto.messages,
    );

    const ketQua = await this.goiMoHinh({
      title: (link as { title?: string }).title,
      messages: dto.messages,
      truoc: docLaiTuDau ? null : prev,
      duLieuDon,
    });

    const now = new Date();
    const mocCuoi = dto.messages.reduce<Date | undefined>((max, m) => {
      if (!m.luc) return max;
      const d = new Date(m.luc);

      return !max || d > max ? d : max;
    }, undefined);

    const set: Record<string, unknown> = {
      groupGlobalId: dto.groupGlobalId,
      customerId: (link as { customerId?: string }).customerId,
      userSku: (link as { userSku?: string }).userSku,
      title: (link as { title?: string }).title,
      tieuDe: ketQua.tieuDe,
      khachQuanTam: ketQua.khachQuanTam,
      salePhanHoi: ketQua.salePhanHoi,
      tonDong: ketQua.tonDong,
      // Giữ trạng thái tick của việc trùng nội dung — nếu không, mỗi lượt tóm
      // tắt lại xoá sạch công người vận hành đã tick.
      checklist: gopChecklist(ketQua.checklist, (prev?.checklist as ZaloSummaryTask[]) ?? [], now),
      nghiNgo: ketQua.nghiNgo,
      mucDo: ketQua.mucDo,
      soTin: dto.messages.length,
      model: MODEL,
      tomTatLuc: now,
      ...(mocCuoi ? { denMocTin: mocCuoi } : {}),
      ...(docLaiTuDau ? { docDayDuLuc: now } : {}),
    };

    const saved = await this.summaryModel.findOneAndUpdate(
      { groupGlobalId: dto.groupGlobalId },
      { $set: set },
      { upsert: true, new: true },
    );

    return saved;
  }

  /**
   * Tra dữ liệu ĐƠN HÀNG THẬT cho nhóm, để mô hình đối chiếu với lời nói trong chat.
   *
   * Đây là điểm ăn tiền của việc đặt tính năng trong OnosFactory thay vì ở máy
   * Zalo: chat chỉ cho biết người ta NÓI gì, còn bảng `orders` cho biết đơn
   * THỰC SỰ đang ở đâu. Không có vế thứ hai thì bản tóm tắt chỉ chép lại lời hứa.
   */
  private async layDuLieuDon(
    link: { customerId?: string; userSku?: string },
    messages: ZaloMessageInput[],
  ): Promise<string> {
    const phan: string[] = [];

    // ─── Đơn được nhắc đích danh trong chat ───────────────────────
    // Khách gọi đơn bằng MÃ ĐƠN OnosPod (`orderId`) chứ hiếm khi dùng
    // `productionId` — kiểm trên dữ liệu thật: mã trong chat khớp `orderId`.
    // Tra cả hai trường để không hụt.
    const maTrongChat = [
      ...new Set(
        messages
          .flatMap((m) => m.noiDung.match(/\b[A-Z]{1,3}-\d{4,6}-\d{4,6}\b/gi) ?? [])
          .map((x) => x.toUpperCase()),
      ),
    ].slice(0, 15);

    if (maTrongChat.length > 0) {
      const dons = await this.orderModel
        .find({ $or: [{ productionId: { $in: maTrongChat } }, { orderId: { $in: maTrongChat } }] })
        .select('productionId orderId type currentFulfillmentStage designerStatus heldAt holdReason productionError productionErrorNote inProductionAt fulfillmentCompletedAt cancelledAt')
        .limit(20)
        .lean();

      const thay = new Set<string>();
      const dong: string[] = [];
      for (const d of dons as Record<string, unknown>[]) {
        const pid = String(d.productionId ?? '');
        const oid = String(d.orderId ?? '');
        thay.add(pid.toUpperCase());
        thay.add(oid.toUpperCase());
        dong.push(`  · ${oid || pid}: ${moTaDon(d)}`);
      }
      const khongThay = maTrongChat.filter((c) => !thay.has(c));

      if (dong.length > 0) phan.push(`ĐƠN ĐƯỢC NHẮC TRONG CHAT:\n${dong.join('\n')}`);
      if (khongThay.length > 0) {
        phan.push(`Mã nhắc trong chat nhưng KHÔNG TRA ĐƯỢC trong hệ thống: ${khongThay.join(', ')}`);
      }
    }

    // ─── Bức tranh chung của khách ────────────────────────────────
    const sku = link.userSku?.trim();
    if (sku) {
      const [dangChay, giu, loi, cuNhat] = await Promise.all([
        this.orderModel.countDocuments({
          userSku: sku,
          cancelledAt: null,
          fulfillmentCompletedAt: { $exists: false },
        }),
        this.orderModel.countDocuments({ userSku: sku, heldAt: { $exists: true, $ne: null }, cancelledAt: null }),
        this.orderModel.countDocuments({
          userSku: sku,
          productionError: { $exists: true, $nin: [null, ''] },
          cancelledAt: null,
          fulfillmentCompletedAt: { $exists: false },
        }),
        this.orderModel
          .find({ userSku: sku, cancelledAt: null, fulfillmentCompletedAt: { $exists: false }, inProductionAt: { $exists: true } })
          .sort({ inProductionAt: 1 })
          .select('productionId orderId inProductionAt currentFulfillmentStage')
          .limit(1)
          .lean(),
      ]);

      const dòng = [`  · đang chạy: ${dangChay} đơn`, `  · đang bị giữ: ${giu}`, `  · đang có lỗi: ${loi}`];
      const cu = (cuNhat as Record<string, unknown>[])[0];
      if (cu?.inProductionAt) {
        const ngay = Math.floor((Date.now() - new Date(cu.inProductionAt as Date).getTime()) / 86_400_000);
        dòng.push(
          `  · đơn nằm lâu nhất: ${String(cu.orderId ?? cu.productionId)} vào sản xuất ${ngay} ngày trước, đang ở ${nhanChang(cu.currentFulfillmentStage as string | undefined)}`,
        );
      }
      phan.push(`TÌNH HÌNH CHUNG CỦA KHÁCH (${sku}):\n${dòng.join('\n')}`);
    }

    if (phan.length === 0) return '';

    return `\n\n--- DỮ LIỆU ĐƠN HÀNG THẬT (tra từ hệ thống, đúng hơn lời nói trong chat) ---\n${phan.join('\n\n')}`;
  }

  private async goiMoHinh(input: {
    title?: string;
    messages: ZaloMessageInput[];
    truoc: { tonDong?: string; checklist?: ZaloSummaryTask[] } | null;
    /** Khối dữ liệu đơn thật, rỗng khi nhóm chưa gắn khách hoặc chat không nhắc mã nào. */
    duLieuDon: string;
  }): Promise<KetQua> {
    // Khuôn dòng chat PHẢI khớp thứ mô tả trong lời nhắc: mô hình được yêu cầu
    // trích ngày + tên + vai trò vào mọi kết luận.
    //
    // Vai trò tra từ bảng ĐỊNH DANH theo `zaloUid`, không đoán từ `sender_type`:
    // engine chỉ đánh dấu `self` cho 2 tài khoản công ty nối vào nó, còn nhân
    // viên dùng Zalo cá nhân (Ngọc Mai 46 nhóm, Huyền 26 nhóm) đều rơi vào
    // `contact` y như khách. Dựa vào `sender_type` là để mô hình tự đoán ai là
    // nhân viên — nó đoán đúng nhờ ngữ cảnh, nhưng đó là may chứ không phải dữ liệu.
    const uids = [...new Set(input.messages.map((m) => m.zaloUid).filter((x): x is string => !!x))];
    const dinhDanh = await this.identityService.mapByUid(uids);

    const doanChat = input.messages
      .map((m) => {
        const dd = m.zaloUid ? dinhDanh.get(m.zaloUid) : undefined;
        // Tin của chính tài khoản công ty không mang uid — engine coi đó là
        // "mình", nên nhận diện bằng cờ `laTaiKhoanCongTy` từ script.
        const loai = m.laTroLyAi
          ? ZaloIdentityKind.AiSupport
          : (dd?.kind ?? ZaloIdentityKind.Unknown);
        const ten = m.nguoiGui || dd?.displayName || 'không rõ';
        const luc = m.luc ? dinhDangLuc(new Date(m.luc)) : '??/?? ??:??';

        return `[${luc}] ${ZALO_IDENTITY_CHAT_LABELS[loai]}/${ten}: ${m.noiDung}`;
      })
      .join('\n');

    const khoiTruoc = input.truoc
      ? [
          '',
          'BẢN TÓM TẮT LẦN TRƯỚC (cập nhật nó theo tin mới, đừng viết lại từ đầu):',
          `- Tồn đọng: ${input.truoc.tonDong || '(không có)'}`,
          `- Việc cần làm: ${
            (input.truoc.checklist ?? [])
              .map((c) => `${c.viec}${c.xong ? ' [đã tick XONG]' : ''}`)
              .join(' | ') || '(không có)'
          }`,
        ].join('\n')
      : '';

    const loiNhac = `${HE_THONG}

NHÓM: ${input.title ?? '(không tên)'}${input.duLieuDon}${khoiTruoc}

--- ${input.truoc ? 'TIN NHẮN MỚI TỪ LẦN TÓM TẮT TRƯỚC' : 'ĐOẠN CHAT'} ---
${doanChat}`;

    // Trần thời gian tự đặt: nginx cắt ở 60 giây mà không báo gì có nghĩa.
    let hetHan = false;
    const dongHo = setTimeout(() => {
      hetHan = true;
    }, HAN_GIAY * 1000);

    let vanBan = '';
    try {
      const it = query({
        prompt: loiNhac,
        options: {
          model: MODEL,
          ...(CLAUDE_CLI ? { pathToClaudeCodeExecutable: CLAUDE_CLI } : {}),
          // Không cho công cụ nào: đây là việc đọc-rồi-trả-lời, không phải
          // việc cần đọc file hay chạy lệnh.
          allowedTools: [],
          /**
           * `maxTurns: 3` chứ KHÔNG phải 1. thghub chạy thật trên prod 24/08:
           * một số nhóm hỏng với "Reached maximum number of turns (1)" — chat
           * dài thì mô hình cần thêm lượt mới viết xong khối JSON. Đặt 1 là ép
           * nó hỏng đúng ở những nhóm nhiều nội dung nhất, tức những nhóm đáng
           * đọc nhất.
           */
          maxTurns: 3,
        },
      });

      for await (const msg of it) {
        if (hetHan) break;
        if (msg.type === 'assistant') {
          for (const b of msg.message.content) if (b.type === 'text') vanBan += b.text;
        }
      }
    } catch (error) {
      const mo = error instanceof Error ? error.message : String(error);
      // GHI LẠI LỖI THÔ trước khi diễn giải. Bản trước chỉ ném ra câu đã viết
      // lại, nên khi đoán sai nguyên nhân thì không còn manh mối nào để lần —
      // đã mất nhiều lượt truy trên production vì đúng chỗ này.
      this.logger.error(`[zalo-summary] lỗi gốc từ Agent SDK: ${mo.slice(0, 500)}`);
      // Agent SDK dùng phiên đăng nhập Claude Code (thư mục ~/.claude). Thiếu
      // nó thì lỗi nói về xác thực/đăng nhập — dịch sang câu chỉ rõ phải làm gì.
      // Không tìm thấy CLI là lỗi CÀI ĐẶT, khác hẳn lỗi xác thực — tách riêng
      // để người đọc không đi tìm nhầm phía thông tin đăng nhập.
      if (/ENOENT|not found|spawn/i.test(mo)) {
        throw new ServiceUnavailableException(
          'Máy chạy API chưa có CLI `claude` (Agent SDK spawn tiến trình này). Cài Claude Code rồi đặt CLAUDE_CLI_PATH trỏ tới nó.',
        );
      }
      if (/auth|credential|login|unauthor|api[ _-]?key/i.test(mo)) {
        throw new ServiceUnavailableException(
          'Backend chưa đăng nhập được Claude — kiểm tra phiên Claude Code (~/.claude) của user chạy API.',
        );
      }
      throw new ServiceUnavailableException(`Gọi mô hình thất bại: ${mo.slice(0, 200)}`);
    } finally {
      clearTimeout(dongHo);
    }

    if (hetHan && !vanBan) {
      throw new ServiceUnavailableException(`Mô hình không trả lời trong ${HAN_GIAY} giây — thử lại nhóm này sau.`);
    }

    // Agent SDK trả văn bản tự do, không có structured output — phải tự tách
    // khối JSON ra khỏi phần mô hình có thể nói thêm xung quanh.
    const m = vanBan.match(/\{[\s\S]*\}/);
    if (!m) throw new ServiceUnavailableException('Mô hình không trả về JSON.');

    let parsed: unknown;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      throw new ServiceUnavailableException('Mô hình trả về dữ liệu không đọc được.');
    }

    return chuanHoa(parsed);
  }

  async list(dto: GetZaloSummariesDto): Promise<{ data: ZaloGroupSummaryDocument[]; total: number }> {
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (dto.mucDo) filter.mucDo = dto.mucDo;
    if (dto.customerId) filter.customerId = dto.customerId;
    if (dto.conViec) filter['checklist.xong'] = false;
    if (dto.search?.trim()) {
      const q = dto.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ title: { $regex: q, $options: 'i' } }, { tieuDe: { $regex: q, $options: 'i' } }];
    }

    const { page, limit } = dto;
    const [data, total] = await Promise.all([
      this.summaryModel
        .find(filter)
        // Gấp lên đầu, trong cùng mức thì nhóm mới tóm tắt trước.
        .sort({ mucDo: 1, tomTatLuc: -1 })
        .skip(limit * (page - 1))
        .limit(limit)
        .lean(),
      this.summaryModel.countDocuments(filter),
    ]);

    return { data: data as ZaloGroupSummaryDocument[], total };
  }

  /** Người vận hành tick / bỏ tick một việc. */
  async toggleTask(groupGlobalId: string, index: number, xong: boolean): Promise<ZaloGroupSummaryDocument> {
    const truoc = await this.summaryModel.findOne({ groupGlobalId }).select('checklist').lean();
    if (!truoc) throw new NotFoundException('Chưa có bản tóm tắt cho nhóm này.');
    if (index < 0 || index >= (truoc.checklist?.length ?? 0)) {
      throw new BadRequestException('Việc không tồn tại.');
    }

    // Ghi thẳng vào đúng phần tử bằng `$set` theo chỉ số, KHÔNG đọc-sửa-ghi cả
    // mảng: lượt tóm tắt kế tiếp có thể đang thay `checklist` cùng lúc, ghi đè
    // cả mảng là nuốt mất kết quả của nó. Đây cũng là lý do repo cấm `.save()`.
    const updated = await this.summaryModel.findOneAndUpdate(
      { groupGlobalId },
      {
        $set: {
          [`checklist.${index}.xong`]: xong,
          [`checklist.${index}.xongLuc`]: xong ? new Date().toISOString() : null,
        },
      },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Chưa có bản tóm tắt cho nhóm này.');

    return updated;
  }
}

/**
 * Gộp danh sách việc mới với danh sách cũ, GIỮ trạng thái tick của việc trùng
 * nội dung. Không có bước này thì mỗi lượt tóm tắt lại xoá sạch những gì người
 * vận hành đã tick, và cái nút tick thành vô nghĩa.
 */
function gopChecklist(moi: string[], cu: ZaloSummaryTask[], bayGio: Date): ZaloSummaryTask[] {
  const cuTheoViec = new Map(cu.map((c) => [c.viec.trim().toLowerCase(), c]));

  return moi.map((viec) => {
    const truoc = cuTheoViec.get(viec.trim().toLowerCase());

    return {
      viec,
      xong: truoc?.xong ?? false,
      taoLuc: truoc?.taoLuc ?? bayGio.toISOString(),
      xongLuc: truoc?.xongLuc ?? null,
    };
  });
}

/** Ép kết quả về đúng kiểu — structured output đã ràng buộc, đây là lưới cuối. */
function chuanHoa(o: unknown): KetQua {
  const r = (o ?? {}) as Record<string, unknown>;
  const chuoi = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const mangChuoi = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  const mucDo = chuoi(r.mucDo);

  return {
    tieuDe: chuoi(r.tieuDe),
    khachQuanTam: chuoi(r.khachQuanTam),
    salePhanHoi: chuoi(r.salePhanHoi),
    tonDong: chuoi(r.tonDong),
    checklist: mangChuoi(r.checklist),
    nghiNgo: mangChuoi(r.nghiNgo),
    mucDo: ([ZaloSummaryLevel.BinhThuong, ZaloSummaryLevel.CanChuY, ZaloSummaryLevel.Gap] as string[]).includes(
      mucDo,
    )
      ? mucDo
      : ZaloSummaryLevel.BinhThuong,
  };
}

/** `DD/MM HH:MM` theo giờ Việt Nam — khuôn mà lời nhắc yêu cầu mô hình trích lại. */
function dinhDangLuc(d: Date): string {
  const vn = new Date(d.getTime() + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');

  return `${p(vn.getUTCDate())}/${p(vn.getUTCMonth() + 1)} ${p(vn.getUTCHours())}:${p(vn.getUTCMinutes())}`;
}

/** Nhãn công đoạn tiếng Việt; đơn chưa vào xưởng thì nói rõ đang ở đâu. */
function nhanChang(stage?: string): string {
  if (!stage) return 'chưa vào công đoạn xưởng';

  return FULFILLMENT_STAGE_LABELS[stage as keyof typeof FULFILLMENT_STAGE_LABELS] ?? stage;
}

/**
 * Một dòng mô tả trạng thái đơn cho mô hình đọc.
 *
 * Thứ tự kiểm QUAN TRỌNG và giống `OrderJourney.md §2`: hủy → giữ → xong →
 * công đoạn. Đơn bị giữ vẫn còn nguyên công đoạn cũ trong dữ liệu, đọc sai thứ
 * tự là báo nhầm "đang chạy" cho một đơn đứng im.
 */
function moTaDon(d: Record<string, unknown>): string {
  if (d.cancelledAt) return 'ĐÃ HỦY';
  if (d.heldAt) {
    const ngay = Math.floor((Date.now() - new Date(d.heldAt as Date).getTime()) / 86_400_000);

    return `ĐANG BỊ GIỮ ${ngay} ngày${d.holdReason ? ` (lý do: ${String(d.holdReason)})` : ''}`;
  }
  if (d.fulfillmentCompletedAt) {
    const ngay = Math.floor((Date.now() - new Date(d.fulfillmentCompletedAt as Date).getTime()) / 86_400_000);

    return `đã xong sản xuất ${ngay} ngày trước`;
  }

  const phan: string[] = [nhanChang(d.currentFulfillmentStage as string | undefined)];
  if (d.productionError) {
    phan.push(`ĐANG CÓ LỖI: ${String(d.productionError)}${d.productionErrorNote ? ` — ${String(d.productionErrorNote)}` : ''}`);
  }
  if (d.inProductionAt) {
    const ngay = Math.floor((Date.now() - new Date(d.inProductionAt as Date).getTime()) / 86_400_000);
    phan.push(`vào sản xuất ${ngay} ngày trước`);
  }

  return phan.join(', ');
}
