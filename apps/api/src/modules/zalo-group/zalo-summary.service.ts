import { query } from '@anthropic-ai/claude-agent-sdk';
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

/** Bao lâu thì phải đọc lại từ đầu để cắt bệnh trôi dần của tóm tắt cuốn chiếu. */
const NGAY_DOC_LAI = Number(process.env.ZALO_SUMMARY_REREAD_DAYS || 7);

/** Nhóm im lâu hơn mức này thì không tốn tiền tóm tắt lại. */
const NGAY_BO_QUA_NHOM_IM = Number(process.env.ZALO_SUMMARY_IDLE_DAYS || 14);

const HE_THONG = `Bạn đọc một đoạn hội thoại nhóm Zalo giữa nhân viên công ty in ấn và khách hàng.
Nhiệm vụ: rút ra tình hình, viết TIẾNG VIỆT, mỗi ô 1–2 câu ngắn, cụ thể. KHÔNG kể lại nội dung chat.

🔴 MỌI KẾT LUẬN PHẢI KÈM MỐC THỜI GIAN VÀ TÊN NGƯỜI. Mỗi dòng chat có dạng
"[DD/MM HH:MM] KHÁCH/Tên:" hoặc "[DD/MM HH:MM] NHÂN VIÊN/Tên:" — hãy DÙNG nó:
- "khách hỏi X" → phải là "20/08 khách (Tên) hỏi X"
- "đã trả lời" → phải là "21/08 (Tên nhân viên) trả lời rằng…" — nêu ĐÍCH DANH ai
- việc còn treo → phải nói TREO TỪ NGÀY NÀO và ĐÃ BAO NHIÊU NGÀY
Không có mốc thời gian và tên người thì không chấm được ai chậm — đó là mục đích của bản tóm tắt này.
Chỉ ghi tên/ngày CÓ THẬT trong chat. Không thấy thì ghi "không rõ", tuyệt đối không đoán.

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

Chấm mức độ theo việc CÒN TREO, đừng chấm theo cảm giác:
- "gap": tiền hoặc hàng đang rủi ro (đơn kẹt, sai địa chỉ, khiếu nại, phạt), HOẶC khách hỏi mà quá
  24h chưa ai trả lời.
- "can-chu-y": còn việc treo nhưng chưa chạm tiền/hàng và chưa quá hạn.
- "binh-thuong": không còn gì treo.`;

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
    // Khuôn dòng chat PHẢI khớp thứ mô tả trong lời nhắc: mô hình được yêu cầu
    // trích ngày + tên vào mọi kết luận, không có hai thứ đó trong dòng thì nó
    // không thể làm được.
    const doanChat = input.messages
      .map((m) => {
        const ai = m.phia === 'me' ? `NHÂN VIÊN/${m.nguoiGui || 'không rõ'}` : `KHÁCH/${m.nguoiGui || 'không rõ'}`;
        const luc = m.luc ? dinhDangLuc(new Date(m.luc)) : '??/?? ??:??';

        return `[${luc}] ${ai}: ${m.noiDung}`;
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

NHÓM: ${input.title ?? '(không tên)'}${khoiTruoc}

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
      // Agent SDK dùng phiên đăng nhập Claude Code (thư mục ~/.claude). Thiếu
      // nó thì lỗi nói về xác thực/đăng nhập — dịch sang câu chỉ rõ phải làm gì.
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
