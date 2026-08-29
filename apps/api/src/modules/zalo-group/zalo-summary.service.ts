import Anthropic from '@anthropic-ai/sdk';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  GetZaloSummariesDto,
  SummarizeZaloGroupDto,
  ZaloMessageInput,
  ZaloSummaryQueueItem,
  ZaloSummaryTask,
} from 'shared';
import { ZALO_GROUP_ANALYZABLE_KINDS, ZaloSummaryLevel } from 'shared';

import { ZaloGroupLinkEntity } from './zalo-group-link.entity';
import type { ZaloGroupSummaryDocument } from './zalo-group-summary.entity';
import { ZaloGroupSummaryEntity } from './zalo-group-summary.entity';

/**
 * Mô hình dùng để tóm tắt. Đổi được qua env nhưng mặc định là Opus 5 — đây là
 * việc đọc hội thoại tiếng Việt lẫn lộn nhiều người rồi rút ra việc cần làm,
 * chất lượng kết luận quan trọng hơn tiền một lượt gọi.
 */
const MODEL = process.env.ZALO_SUMMARY_MODEL || 'claude-opus-5';

/**
 * Tóm tắt là việc đọc-rồi-rút-gọn, không phải bài toán suy luận nhiều bước —
 * `medium` đủ và rẻ hơn `high` đáng kể khi nhân với hơn trăm nhóm mỗi lượt.
 */
const EFFORT = (process.env.ZALO_SUMMARY_EFFORT || 'medium') as 'low' | 'medium' | 'high';

/** Bao lâu thì phải đọc lại từ đầu để cắt bệnh trôi dần của tóm tắt cuốn chiếu. */
const NGAY_DOC_LAI = Number(process.env.ZALO_SUMMARY_REREAD_DAYS || 7);

/** Nhóm im lâu hơn mức này thì không tốn tiền tóm tắt lại. */
const NGAY_BO_QUA_NHOM_IM = Number(process.env.ZALO_SUMMARY_IDLE_DAYS || 14);

const HE_THONG = `Bạn đọc hội thoại của một nhóm Zalo giữa nhân viên công ty in ấn và khách hàng, rồi rút ra tình hình.

Mục tiêu là giúp quản lý biết nhóm này có đang được xử lý tốt không. KHÔNG tóm tắt lại nội dung chat.

Quy tắc:
- Viết tiếng Việt, ngắn gọn, đi thẳng vào việc.
- "checklist" là việc NHÂN VIÊN cần làm tiếp, mỗi dòng một việc làm được ngay. Không gộp nhiều việc vào một dòng. Không có việc gì thì để mảng rỗng.
- "tonDong" là thứ khách đã hỏi/yêu cầu mà chưa được giải quyết. Không có thì để chuỗi rỗng.
- "mucDo": "gap" khi khách đang bức xúc hoặc có việc quá hạn rõ ràng; "can-chu-y" khi có tồn đọng chưa xử lý; còn lại "binh-thuong".
- Nếu được cung cấp bản tóm tắt lần trước, hãy CẬP NHẬT nó theo tin nhắn mới, đừng viết lại từ đầu.
- "nghiNgo": việc trong danh sách lần trước đã được đánh dấu xong nhưng bạn KHÔNG thấy bằng chứng trong hội thoại. Không có thì để mảng rỗng.
- Chỉ kết luận từ những gì có trong hội thoại. Không suy đoán.`;

/** Khuôn kết quả — ép mô hình trả đúng cấu trúc thay vì tự dò JSON trong văn bản. */
const KHUON_KET_QUA = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['tieuDe', 'khachQuanTam', 'salePhanHoi', 'tonDong', 'checklist', 'nghiNgo', 'mucDo'],
    properties: {
      tieuDe: { type: 'string', description: 'Một dòng dưới 100 ký tự tóm tắt tình hình nhóm' },
      khachQuanTam: { type: 'string', description: 'Khách đang hỏi/quan tâm điều gì' },
      salePhanHoi: { type: 'string', description: 'Nhân viên đã phản hồi ra sao' },
      tonDong: { type: 'string', description: 'Việc khách yêu cầu mà chưa xong. Rỗng nếu không có' },
      checklist: {
        type: 'array',
        items: { type: 'string' },
        description: 'Mỗi phần tử là MỘT việc nhân viên cần làm tiếp',
      },
      nghiNgo: {
        type: 'array',
        items: { type: 'string' },
        description: 'Việc đã tick xong nhưng không thấy bằng chứng trong hội thoại',
      },
      mucDo: { type: 'string', enum: ['binh-thuong', 'can-chu-y', 'gap'] },
    },
  },
};

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
  private readonly client = new Anthropic();

  constructor(
    @InjectModel(ZaloGroupSummaryEntity.name)
    private readonly summaryModel: Model<ZaloGroupSummaryEntity>,
    @InjectModel(ZaloGroupLinkEntity.name)
    private readonly linkModel: Model<ZaloGroupLinkEntity>,
  ) {}

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

  /** Gọi mô hình tóm tắt một nhóm rồi lưu kết quả. */
  async summarize(dto: SummarizeZaloGroupDto): Promise<ZaloGroupSummaryDocument> {
    const link = await this.linkModel.findOne({ groupGlobalId: dto.groupGlobalId }).lean();
    if (!link) throw new NotFoundException('Không tìm thấy nhóm Zalo.');

    const kind = (link as { kind?: string }).kind;
    // Chốt riêng tư lặp lại ở đây, KHÔNG chỉ dựa vào hàng đợi: endpoint này gọi
    // trực tiếp được, mà đọc nhầm nhóm nội bộ là đọc đời tư nhân viên.
    if (!kind || !ZALO_GROUP_ANALYZABLE_KINDS.includes(kind as never)) {
      throw new BadRequestException(
        'Nhóm này chưa được phân loại là nhóm khách hoặc nhóm vận hành — không đọc nội dung chat.',
      );
    }

    const prev = await this.summaryModel.findOne({ groupGlobalId: dto.groupGlobalId }).lean();
    const docLaiTuDau = dto.docLaiTuDau ?? false;

    const ketQua = await this.goiMoHinh({
      title: (link as { title?: string }).title,
      messages: dto.messages,
      truoc: docLaiTuDau ? null : prev,
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

  private async goiMoHinh(input: {
    title?: string;
    messages: ZaloMessageInput[];
    truoc: { tonDong?: string; checklist?: ZaloSummaryTask[] } | null;
  }): Promise<KetQua> {
    const doanChat = input.messages
      .map((m) => {
        const ai = m.phia === 'me' ? `NHÂN VIÊN ${m.nguoiGui ?? ''}`.trim() : (m.nguoiGui ?? 'KHÁCH');

        return `[${ai}] ${m.noiDung}`;
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

    let res: Anthropic.Message;
    try {
      res = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        output_config: { effort: EFFORT, format: KHUON_KET_QUA },
        system: HE_THONG,
        messages: [
          {
            role: 'user',
            content: `NHÓM: ${input.title ?? '(không tên)'}${khoiTruoc}\n\nHỘI THOẠI:\n${doanChat}`,
          },
        ],
      });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        throw new ServiceUnavailableException('Mô hình đang quá tải, thử lại sau.');
      }
      // Khoá sai (401 từ server) VÀ hoàn toàn chưa cấu hình khoá là hai lỗi
      // khác nhau nhưng cùng một cách chữa. Trường hợp thứ hai KHÔNG phải
      // `APIError`: SDK ném `Error` thường ngay khi dựng header, trước lúc gửi
      // request. Bắt cả hai, nếu không nó nổi lên thành 500 "Internal server
      // error" và người vận hành không có manh mối nào để lần.
      if (error instanceof Anthropic.AuthenticationError || !(error instanceof Anthropic.APIError)) {
        throw new ServiceUnavailableException(
          'Chưa cấu hình khoá Claude API cho backend — đặt ANTHROPIC_API_KEY trong apps/api/.env.<NODE_ENV> rồi khởi động lại API.',
        );
      }
      throw error;
    }

    // Mô hình có thể từ chối vì lý do an toàn — kiểm TRƯỚC khi đọc content.
    if (res.stop_reason === 'refusal') {
      throw new ServiceUnavailableException('Mô hình từ chối tóm tắt nội dung nhóm này.');
    }

    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
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
    const doc = await this.summaryModel.findOne({ groupGlobalId });
    if (!doc) throw new NotFoundException('Chưa có bản tóm tắt cho nhóm này.');
    if (index < 0 || index >= doc.checklist.length) throw new BadRequestException('Việc không tồn tại.');

    doc.checklist[index].xong = xong;
    doc.checklist[index].xongLuc = xong ? new Date().toISOString() : null;
    doc.markModified('checklist');
    await doc.save();

    return doc;
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
