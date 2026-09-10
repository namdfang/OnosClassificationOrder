import { Injectable, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Connection, Model } from 'mongoose';
import type { CeoOverview, CustomerReport, CustomerReportIssue, CustomerReportRow } from 'shared';
import { CUSTOMER_REPORT_RULES } from 'shared';

import { laTienTrinhChayCron } from '@/utils/cron-guard';

import { CeoDashboardService } from '../ceo-dashboard/ceo-dashboard.service';
import { CustomerReportDocument, CustomerReportEntity } from './customer-report.entity';
import { dungDong, khachTang, khachTut, phanTramDoi, soNgayTonDong, vietTomTat } from './customer-report.logic';

const TZ = 'Asia/Ho_Chi_Minh';
/** Cửa sổ trượt 7 ngày, kết thúc ở HÔM QUA — hôm nay chưa đủ ngày để so. */
const WINDOW_DAYS = 7;

/** `yyyy-mm-dd` theo giờ VN. */
function vnDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Báo cáo KHÁCH HÀNG cho agent (`documents/AgentGuide/CustomerReport.md`).
 *
 * Nguồn số là `CeoDashboardService.getOverview()`, KHÔNG gộp lại từ
 * `customer_orders`. Đo 11/09/2026 cùng kỳ 04→10/09: gộp từ staging ra 81
 * khách / 5.373 đơn, CEO Dashboard ra 80 khách / 5.337 đơn — vì CEO loại đơn
 * hủy, đơn chưa map xưởng, đơn xưởng US. Hai báo cáo cùng gửi Chủ tịch một
 * buổi sáng mà lệch nhau thì không ai giải thích được.
 *
 * Phần chữ viết bằng LUẬT, không gọi mô hình: báo cáo chạy mỗi sáng và phải ra
 * cùng một câu cho cùng bộ số, để hôm nay đối chiếu được với hôm qua.
 */
@Injectable()
export class CustomerReportService {
  private readonly logger = new Logger(CustomerReportService.name);
  private readonly dangChay = new Set<string>();

  constructor(
    @InjectModel(CustomerReportEntity.name) private readonly reportModel: Model<CustomerReportDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly dashboard: CeoDashboardService,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  isGenerating(from: string, to: string): boolean {
    return this.dangChay.has(`${from}_${to}`);
  }

  async getLatest(from: string, to: string): Promise<CustomerReport | null> {
    const doc = await this.reportModel.findOne({ periodKey: `${from}_${to}` }).sort({ generatedAt: -1 }).lean();

    return doc ? (this.toDto(doc as unknown as Record<string, unknown>) as CustomerReport) : null;
  }

  /** Kỳ mặc định của cron: 7 ngày kết thúc ở hôm qua (giờ VN). */
  kyMacDinh(): { from: string; to: string } {
    const homQua = new Date(Date.now() - 864e5);

    return { from: vnDay(new Date(homQua.getTime() - (WINDOW_DAYS - 1) * 864e5)), to: vnDay(homQua) };
  }

  @Cron('15 7 * * *', { name: 'customer-report-daily', timeZone: TZ })
  async cronDaily(): Promise<void> {
    // Chỉ chạy ở tiến trình HTTP — xem `utils/cron-guard.ts`.
    if (!laTienTrinhChayCron(this.adapterHost)) return;
    const { from, to } = this.kyMacDinh();
    try {
      await this.generate(from, to, 'cron');
    } catch (e) {
      this.logger.error(`[customer-report] cron ${from}_${to} thất bại: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async generate(from: string, to: string, trigger: 'cron' | 'manual'): Promise<CustomerReport> {
    const key = `${from}_${to}`;
    this.dangChay.add(key);
    try {
      const overview = await this.dashboard.getOverview(from, to);
      const [ten, issues] = await Promise.all([this.tenTheoSku(overview), this.vanDeTuZalo()]);

      const tho = overview.customers.top.map((c) => ({ userSku: c.userSku, orders: c.orders, prevOrders: c.prevOrders, tier: c.tier }));
      // `rising`/`dropping` của CEO là top theo mức đổi; lọc lại bằng ngưỡng của
      // báo cáo này để danh sách có ý nghĩa thương mại, không chỉ đổi nhiều %.
      const ungVien = [
        ...tho,
        ...overview.customers.rising.map((r) => ({ userSku: r.userSku, orders: r.orders, prevOrders: r.prevOrders })),
        ...overview.customers.dropping.map((r) => ({ userSku: r.userSku, orders: r.orders, prevOrders: r.prevOrders })),
      ];
      const loc = [...new Map(ungVien.map((r) => [r.userSku, r])).values()];
      const tut = khachTut(loc);
      const tang = khachTang(loc);
      const moi = loc.filter((r) => !r.prevOrders && r.orders > 0);

      const doc = await this.reportModel.create({
        periodKey: key,
        from,
        to,
        kind: overview.period.days === WINDOW_DAYS ? 'week' : 'custom',
        summary: vietTomTat(overview, tut, tang),
        metrics: {
          activeCustomers: overview.customers.active,
          activeCustomersPrev: overview.customers.prevActive,
          totalOrders: overview.production.in,
          totalOrdersPrev: overview.production.prevIn,
          changePct: phanTramDoi(overview.production.in, overview.production.prevIn),
          newCustomerCount: overview.customers.newCount,
          churnRiskCount: tut.length,
        },
        topCustomers: tho.slice(0, 10).map((r) => dungDong(r, ten.get(r.userSku))),
        surging: tang.slice(0, 10).map((r) => dungDong(r, ten.get(r.userSku))),
        declining: tut.slice(0, 10).map((r) => dungDong(r, ten.get(r.userSku))),
        newCustomers: moi.slice(0, 10).map((r) => dungDong(r, ten.get(r.userSku))),
        customerIssues: issues,
        conclusions: this.ketLuan(overview, tut, tang, issues),
        actionItems: this.viecCanLam(tut, issues),
        findings: [
          ...tut.map((r) => ({
            code: 'churn_risk',
            severity: 'warning' as const,
            params: { userSku: r.userSku, from: r.prevOrders, to: r.orders },
            action: 'Hỏi lại khách vì sao giảm đơn',
          })),
          ...issues
            .filter((i) => i.severity === 'gap')
            .map((i) => ({
              code: 'customer_issue_urgent',
              severity: 'critical' as const,
              params: { userSku: i.userSku, issue: i.issue, pendingDays: i.pendingDays },
              action: 'Xử lý dứt điểm vướng mắc đang treo',
            })),
        ],
        generatedAt: new Date(),
        trigger,
      });

      return this.toDto(doc.toObject() as Record<string, unknown>) as CustomerReport;
    } finally {
      this.dangChay.delete(key);
    }
  }

  /**
   * Tên người liên hệ theo mã khách — lấy từ danh tính Zalo ĐÃ DUYỆT
   * (`zalo_identities.customerId`, nối qua nhóm). Chưa nối thì để trống chứ
   * không lấy tạm từ tên nhóm: tên nhóm là chuỗi `OnosPod/ 2025/ MÃ/ …`, không
   * phải tên người.
   */
  private async tenTheoSku(o: CeoOverview): Promise<Map<string, string>> {
    const skus = [...new Set(o.customers.top.map((c) => c.userSku))];
    if (skus.length === 0) return new Map();

    const khach = await this.connection.collection('customers').find({ userSku: { $in: skus } }, { projection: { userSku: 1 } }).toArray();
    const skuTheoId = new Map(khach.map((c) => [String(c._id), String(c.userSku)]));
    if (skuTheoId.size === 0) return new Map();

    const nguoi = await this.connection
      .collection('zalo_identities')
      .find({ customerId: { $in: [...skuTheoId.keys()] }, kind: 'customer' }, { projection: { customerId: 1, displayName: 1, messageCount: 1 } })
      .sort({ messageCount: -1 })
      .toArray();

    const out = new Map<string, string>();
    for (const n of nguoi) {
      const sku = skuTheoId.get(String(n.customerId));
      // Một khách có thể có vài người; lấy người nhắn nhiều nhất làm đại diện.
      if (sku && !out.has(sku) && n.displayName) out.set(sku, String(n.displayName));
    }

    return out;
  }

  /**
   * Vướng mắc đang treo, lấy từ bản tóm tắt nhóm Zalo.
   *
   * Đây là ẢNH CHỤP HIỆN TẠI, không phải "phát sinh trong kỳ": mỗi nhóm chỉ giữ
   * MỘT bản tóm tắt mới nhất, không có chuỗi theo ngày. Báo cáo phải nói đúng
   * như vậy, đừng để người đọc tưởng là việc mới nảy trong 7 ngày.
   */
  private async vanDeTuZalo(): Promise<CustomerReportIssue[]> {
    // KHÔNG lọc theo top 10: một khách cỡ vừa đang có việc GẤP treo 12 ngày là
    // đúng thứ Chủ tịch cần nghe, mà lọc theo top thì họ biến mất khỏi báo cáo.
    const rows = await this.connection
      .collection('zalo_group_summaries')
      .find({ mucDo: { $in: ['gap', 'can-chu-y'] } }, { projection: { userSku: 1, mucDo: 1, tieuDe: 1, checklist: 1 } })
      .toArray();

    const now = new Date();

    return rows
      .filter((r) => r.userSku)
      .map((r) => ({
        userSku: String(r.userSku),
        severity: String(r.mucDo),
        issue: String(r.tieuDe ?? ''),
        pendingDays: soNgayTonDong(r.checklist as Array<{ xong?: boolean; taoLuc?: string }>, now),
      }))
      // Gấp lên trước, rồi tới việc treo lâu nhất.
      .sort((a, b) => (a.severity === b.severity ? (b.pendingDays ?? 0) - (a.pendingDays ?? 0) : a.severity === 'gap' ? -1 : 1))
      .slice(0, 15);
  }

  private ketLuan(o: CeoOverview, tut: ReturnType<typeof khachTut>, tang: ReturnType<typeof khachTang>, issues: CustomerReportIssue[]): string[] {
    const out: string[] = [];
    const d = phanTramDoi(o.production.in, o.production.prevIn);
    if (d != null) out.push(`Đơn vào ${d >= 0 ? 'tăng' : 'giảm'} ${Math.abs(d)}% so kỳ trước (${o.production.prevIn} → ${o.production.in}).`);
    if (o.customers.top10SharePct != null) out.push(`10 khách lớn nhất chiếm ${o.customers.top10SharePct}% đơn — càng cao càng phụ thuộc ít khách.`);
    if (tut.length > 0) {
      out.push(
        `${tut.length} khách giảm ≥ ${CUSTOMER_REPORT_RULES.decliningDropPct}% từ nền ≥ ${CUSTOMER_REPORT_RULES.decliningMinPrev} đơn: ` +
          tut.slice(0, 5).map((r) => `${r.userSku} (${r.prevOrders}→${r.orders})`).join(', ') + '.',
      );
    }
    if (tang.length > 0) out.push(`${tang.length} khách tăng mạnh: ` + tang.slice(0, 5).map((r) => `${r.userSku} (${r.prevOrders}→${r.orders})`).join(', ') + '.');
    const gap = issues.filter((i) => i.severity === 'gap');
    if (gap.length > 0) out.push(`${gap.length} khách đang có vướng mắc GẤP trong nhóm Zalo (ảnh chụp hiện tại, không riêng kỳ này).`);

    return out;
  }

  private viecCanLam(tut: ReturnType<typeof khachTut>, issues: CustomerReportIssue[]): string[] {
    const out: string[] = [];
    for (const r of tut.slice(0, 3)) out.push(`Sale phụ trách ${r.userSku}: hỏi lại vì sao đơn giảm từ ${r.prevOrders} xuống ${r.orders}, báo lại trong hôm nay.`);
    for (const i of issues.filter((x) => x.severity === 'gap').slice(0, 3)) {
      out.push(`Xử lý dứt điểm cho ${i.userSku}: ${i.issue}${i.pendingDays ? ` (đã treo ${i.pendingDays} ngày)` : ''}.`);
    }

    return out;
  }

  private toDto(d: Record<string, unknown>): CustomerReport {
    return {
      ...(d as unknown as CustomerReport),
      _id: String(d._id),
      generatedAt: new Date(d.generatedAt as Date).toISOString(),
    };
  }
}
