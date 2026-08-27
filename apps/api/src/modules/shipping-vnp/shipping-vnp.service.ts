import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CreateVnpFromAddressDto,
  CreateVnpShipmentDto,
  GetVnpShipmentsDto,
  ProductionOrderShippingAddress,
  SaveVnpShippingMapDto,
  VnpShipmentInfo,
  VnpShipmentRecord,
  VnpShipmentStats,
  VnpShippingConfig,
  VnpShippingStatus,
} from 'shared';
import { SHIPMENT_PROVIDER_VNP, VNP_SHIPPING_CONFIG_KEY } from 'shared';
import { Logger } from 'winston';

import { genCode } from '@/utils/gen-code';

import { ApiConfigService } from '../../shared/services/api-config.service';
import { OrderEntity } from '../order/order.entity';
import { SystemConfigService } from '../system-config/system-config.service';
import { ShipmentDocument, ShipmentEntity } from './shipment.entity';
import { ShippingPackageEntity } from './shipping-package.entity';
import { VnpEglobalClient } from './vnp-eglobal.client';

/**
 * Điều phối luồng vận đơn VNP eGlobal cho 1 đơn sản xuất (giai đoạn TEST —
 * kích hoạt tay qua nút "Vận đơn VNP" ở bảng đơn hàng, chưa auto-hook vào
 * công đoạn Đóng hàng).
 *
 * Spec VNP không khai response body → mọi hàm trả kèm `raw` nguyên văn và
 * dùng `digString()` dò các tên field phổ biến để nhặt id/tracking/label.
 */

/** Dò sâu (BFS) giá trị string đầu tiên có key nằm trong danh sách ứng viên. */
function digString(root: unknown, keys: string[]): string | undefined {
  const queue: unknown[] = [root];
  let guard = 0;
  while (queue.length > 0 && guard < 200) {
    guard += 1;
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    const rec = node as Record<string, unknown>;
    for (const key of keys) {
      const val = rec[key];
      if (typeof val === 'string' && val.trim()) return val;
      if (typeof val === 'number') return String(val);
    }
    for (const v of Object.values(rec)) {
      if (v && typeof v === 'object') queue.push(v);
    }
  }
  return undefined;
}

/** Response VNP kiểu chuẩn thấy ở endpoint public: {code, message, result...}. */
function looksOk(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return true; // không đoán được → coi như ok, FE soi raw
  const rec = raw as Record<string, unknown>;
  if (typeof rec.code === 'number' && rec.code >= 400) return false;
  if (typeof rec.status === 'number' && rec.status >= 400) return false;
  if (rec.error) return false;
  return true;
}

/**
 * Carrier sau VNP validate phone: bắt đầu khác 0, 8-15 chữ số. Chuẩn hóa về
 * digits-only; không đạt → fallback số placeholder (label vẫn in được, phone
 * người nhận không in trên label USPS).
 */
function normalizeVnpPhone(phone?: string): string {
  const digits = (phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length >= 8 && digits.length <= 15) return digits;
  return '9999999999';
}

/** Tên bang Mỹ → mã 2 ký tự — khách portal hay gõ tên đầy đủ ("North Carolina"). */
const US_STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC', 'puerto rico': 'PR', guam: 'GU',
};

/** Chuẩn hóa state US về mã 2 ký tự; đã là mã thì uppercase, lạ thì giữ nguyên. */
function normalizeUsState(state?: string): string {
  const trimmed = (state ?? '').trim();
  if (!trimmed) return '';
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return US_STATE_CODES[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Mã bang/lãnh thổ US hợp lệ — dùng pre-check trước khi mua label vì carrier
 * validate mã bang trên RECORD VNP (district→state), còn USPS checkAddress tự
 * SỬA state theo zip nên không bao giờ báo lỗi state cho mình.
 */
const VALID_US_STATE_SET = new Set([...Object.values(US_STATE_CODES), 'VI', 'AS', 'MP']);

/** Nhánh verifications trong response USPS checkAddress (shape thật, soi staging 24/08). */
interface UspsVerification {
  success?: boolean;
  errors?: { code?: string; message?: string }[];
}

/**
 * Phân loại text tracking → status record. Shape response khi hàng chạy thật
 * CHƯA biết (label test chưa từng được scan) — chỉ nhận diện chuỗi chắc chắn,
 * còn lại coi là đang vận chuyển; bổ sung map khi có đơn thật đầu tiên.
 */
export function classifyTrackingStatus(text?: string): 'in_transit' | 'delivered' | undefined {
  if (!text?.trim()) return undefined;
  if (/delivered|đã giao/i.test(text)) return 'delivered';
  return 'in_transit';
}

const SHIPMENT_ID_KEYS = ['shipment_id', 'shipmentId', 'id', 'uuid'];
const TRACKING_KEYS = ['tracking_id', 'trackingId', 'tracking_code', 'trackingCode', 'tracking_number', 'trackingNumber'];
const LABEL_KEYS = ['image_url', 'label_url', 'labelUrl', 'label', 'label_pdf', 'labelPdf', 'label_link', 'pdf_url', 'pdfUrl'];
const ADDRESS_ID_KEYS = ['address_id', 'addressId', 'id', 'uuid'];
const STATUS_KEYS = ['status', 'shipment_status', 'tracking_status', 'state'];

@Injectable()
export class ShippingVnpService {
  constructor(
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    @InjectModel(ShippingPackageEntity.name) private readonly packageModel: Model<ShippingPackageEntity>,
    @InjectModel(ShipmentEntity.name) private readonly shipmentModel: Model<ShipmentEntity>,
    private readonly client: VnpEglobalClient,
    private readonly apiConfigService: ApiConfigService,
    private readonly systemConfigService: SystemConfigService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  // ── Cấu hình địa chỉ gửi theo xưởng (blob system_configs, sống theo môi
  // trường — production tự cấu hình qua UI Settings, không restore từ local).

  async getShippingConfig(): Promise<VnpShippingConfig> {
    // Đọc THẲNG Mongo, bỏ qua cache Redis của SystemConfigService — config
    // này nhỏ + đọc thưa, còn cache từng gây stale khi sửa DB tay/backfill
    // (cache TTL 1h giữ bản cũ dù Mongo đã đổi). `set()` vẫn dùng service.
    const doc = await this.orderModel.db
      .collection('system_configs')
      .findOne<{ value?: VnpShippingConfig }>({ key: VNP_SHIPPING_CONFIG_KEY });
    const cfg = doc?.value;
    return { addresses: cfg?.addresses ?? [], factoryMap: cfg?.factoryMap ?? {}, defaultAddressId: cfg?.defaultAddressId };
  }

  /** Danh sách địa chỉ đã lưu bên VNP (hub US có sẵn nằm ở đây) — raw. */
  async listRemoteAddresses(): Promise<{ raw: unknown }> {
    return { raw: await this.client.getShippingAddresses() };
  }

  /** Thêm địa chỉ ĐÃ TỒN TẠI bên VNP vào config bằng id (không tạo mới). */
  async importFromAddress(dto: { vnpAddressId: string; label: string; note?: string }): Promise<VnpShippingConfig> {
    const config = await this.getShippingConfig();
    config.addresses = [
      ...config.addresses.filter((a) => a.vnpAddressId !== dto.vnpAddressId),
      {
        vnpAddressId: dto.vnpAddressId,
        label: dto.label,
        name: dto.note || '(địa chỉ có sẵn trên VNP)',
        phoneNumber: '-',
        street1: dto.note || '-',
        ward: '-',
        district: '-',
        city: '-',
        country: 'US',
        createdAt: new Date(),
      },
    ];
    if (!config.defaultAddressId) config.defaultAddressId = dto.vnpAddressId;
    await this.systemConfigService.set(VNP_SHIPPING_CONFIG_KEY, config);
    this.logger.info({ message: JSON.stringify({ action: 'vnpImportFromAddress', vnpAddressId: dto.vnpAddressId }) });
    return config;
  }

  /** Tạo địa chỉ gửi (ShippingFrom) bên VNP rồi lưu snapshot + id vào blob. */
  async createFromAddress(dto: CreateVnpFromAddressDto): Promise<{ config: VnpShippingConfig; raw: unknown }> {
    // US: `district` PHẢI là mã bang — VNP map district→state phía carrier
    // (xác nhận với Nexo 24/08 + khớp curl mẫu tài liệu district:"TX"); field
    // `state` gửi lên bị BỎ QUA khi tạo shipment, `ward` là placeholder.
    const isUs = (dto.country || 'VN').toUpperCase() === 'US';
    const usState = normalizeUsState(dto.state);
    const raw = await this.client.createAddress({
      name: dto.name,
      phone_number: normalizeVnpPhone(dto.phoneNumber),
      city: dto.city,
      district: isUs && usState ? usState : dto.district,
      ward: isUs && usState ? usState : dto.ward,
      zip_code: dto.zipCode || undefined,
      country: dto.country || 'VN',
      street1: dto.street1,
      street2: dto.street2 || undefined,
      state: dto.state || undefined,
      address: [dto.street1, dto.street2, dto.ward, dto.district, dto.city].filter(Boolean).join(', '),
      is_default: false,
      type_of_address: 'ShippingFrom',
    });
    const vnpAddressId = digString(raw, ADDRESS_ID_KEYS);
    if (!looksOk(raw) || !vnpAddressId) {
      throw new BadRequestException(
        'VNP createAddress (ShippingFrom) không trả address id — response: ' + JSON.stringify(raw).slice(0, 6000),
      );
    }
    const config = await this.getShippingConfig();
    config.addresses = [
      ...config.addresses.filter((a) => a.vnpAddressId !== vnpAddressId),
      {
        vnpAddressId,
        label: dto.label,
        name: dto.name,
        phoneNumber: dto.phoneNumber,
        street1: dto.street1,
        street2: dto.street2,
        ward: dto.ward,
        district: dto.district,
        city: dto.city,
        state: dto.state,
        zipCode: dto.zipCode,
        country: dto.country || 'VN',
        createdAt: new Date(),
      },
    ];
    // Địa chỉ đầu tiên tự thành mặc định — đỡ 1 bước cấu hình.
    if (!config.defaultAddressId) config.defaultAddressId = vnpAddressId;
    await this.systemConfigService.set(VNP_SHIPPING_CONFIG_KEY, config);
    this.logger.info({ message: JSON.stringify({ action: 'vnpCreateFromAddress', vnpAddressId, label: dto.label }) });
    return { config, raw };
  }

  /** Lưu mapping xưởng → địa chỉ + mặc định. Validate id có trong addresses. */
  async saveShippingMap(dto: SaveVnpShippingMapDto): Promise<VnpShippingConfig> {
    const config = await this.getShippingConfig();
    const known = new Set(config.addresses.map((a) => a.vnpAddressId));
    for (const [factoryId, addrId] of Object.entries(dto.factoryMap)) {
      if (addrId && !known.has(addrId)) {
        throw new BadRequestException(`Địa chỉ ${addrId} (xưởng ${factoryId}) không tồn tại trong danh sách.`);
      }
    }
    if (dto.defaultAddressId && !known.has(dto.defaultAddressId)) {
      throw new BadRequestException('Địa chỉ mặc định không tồn tại trong danh sách.');
    }
    // Bỏ entry rỗng (FE gửi '' khi bỏ gán).
    config.factoryMap = Object.fromEntries(Object.entries(dto.factoryMap).filter(([, v]) => !!v));
    config.defaultAddressId = dto.defaultAddressId || undefined;
    await this.systemConfigService.set(VNP_SHIPPING_CONFIG_KEY, config);
    return config;
  }

  /** Gỡ địa chỉ khỏi blob (không xóa bên VNP) + dọn mapping trỏ vào nó. */
  async deleteFromAddress(vnpAddressId: string): Promise<VnpShippingConfig> {
    const config = await this.getShippingConfig();
    config.addresses = config.addresses.filter((a) => a.vnpAddressId !== vnpAddressId);
    config.factoryMap = Object.fromEntries(Object.entries(config.factoryMap).filter(([, v]) => v !== vnpAddressId));
    if (config.defaultAddressId === vnpAddressId) config.defaultAddressId = undefined;
    await this.systemConfigService.set(VNP_SHIPPING_CONFIG_KEY, config);
    return config;
  }

  /**
   * Resolve địa chỉ gửi cho 1 đơn: xưởng của đơn → mapping; chưa gán →
   * defaultAddressId; cuối cùng env VNP_EGLOBAL_FROM_ADDRESS_ID (fallback).
   */
  private async resolveFromAddressId(order: OrderEntity): Promise<string> {
    const config = await this.getShippingConfig();
    const byFactory = order.factoryId ? config.factoryMap[String(order.factoryId)] : undefined;
    const resolved = byFactory ?? config.defaultAddressId ?? this.apiConfigService.vnpEglobalConfig?.fromAddressId;
    if (!resolved) {
      throw new BadRequestException(
        'Chưa cấu hình địa chỉ gửi hàng (ShippingFrom) — vào Cài đặt → Vận chuyển VNP tạo địa chỉ kho và gán xưởng.',
      );
    }
    return resolved;
  }

  getStatus(): VnpShippingStatus {
    const config = this.apiConfigService.vnpEglobalConfig;
    const missing = this.apiConfigService.vnpEglobalMissingEnv;
    return {
      configured: !!config && missing.length === 0,
      missing,
      apiUrl: config?.apiUrl,
      shippingUnitId: config?.shippingUnitId || undefined,
    };
  }

  private async loadOrder(orderId: string) {
    const order = await this.orderModel.findOne({ _id: orderId });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * Nhóm item cùng đơn seller: phía mình mỗi item là 1 OrderEntity với
   * `productionId` riêng, nhưng seller đặt 1 đơn (`orderId`) nhiều item và
   * **1 đơn chỉ mua 1 label** → vận đơn tạo THEO NHÓM `orderId`, mỗi item
   * = 1 entry `package_details`. Đơn không có `orderId` → nhóm 1 mình nó.
   * Loại item đã hủy (`cancelledAt`) khỏi nhóm.
   */
  private async loadGroup(order: Awaited<ReturnType<ShippingVnpService['loadOrder']>>) {
    if (!order.orderId?.trim()) return [order];
    const siblings = await this.orderModel
      .find({ orderId: order.orderId.trim(), cancelledAt: null })
      .sort({ productionId: 1 });
    return siblings.length > 0 ? siblings : [order];
  }

  /** Số dư ví VNP — dò field balance trong response (spec không khai). */
  async getWallet(): Promise<{ balance?: string; raw: unknown }> {
    const raw = await this.client.availableBalance();
    return { balance: digString(raw, ['balance', 'available_balance', 'availableBalance', 'amount']), raw };
  }

  /** Nhóm item cùng orderId — FE hiện trước khi tạo label chung. */
  async getGroup(orderId: string): Promise<{
    orderId?: string;
    items: Array<{
      id: string;
      productionId: string;
      type?: string;
      quantity?: number;
      weight?: number;
      hasActiveShipment: boolean;
    }>;
  }> {
    const order = await this.loadOrder(orderId);
    const group = await this.loadGroup(order);
    return {
      orderId: order.orderId?.trim() || undefined,
      items: group.map((o) => ({
        id: String(o._id),
        productionId: o.productionId,
        type: o.type || undefined,
        quantity: o.quantity ?? undefined,
        weight: o.weight ?? undefined,
        hasActiveShipment: !!o.vnpShipment?.shipmentId && !o.vnpShipment.cancelledAt,
      })),
    };
  }

  private requireAddress(order: OrderEntity): ProductionOrderShippingAddress {
    const addr = order.shippingAddress;
    if (!addr || (!addr.address1 && !addr.city)) {
      throw new BadRequestException(
        'Đơn chưa có địa chỉ nhận hàng (shippingAddress) — không thể tạo vận đơn. ' +
          'Đơn khách portal luôn có; đơn import OnosPod dùng "Kiểm tra design mới" để kéo địa chỉ về trước.',
      );
    }
    return addr;
  }

  private async saveShipmentInfo(orderId: string, patch: Partial<VnpShipmentInfo>): Promise<VnpShipmentInfo> {
    const $set = Object.fromEntries(
      Object.entries(patch)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [`vnpShipment.${k}`, v]),
    );
    const updated = await this.orderModel.findOneAndUpdate({ _id: orderId }, { $set }, { new: true });
    return updated?.vnpShipment ?? (patch as VnpShipmentInfo);
  }

  /** Lưu cùng 1 patch vận đơn cho CẢ nhóm item cùng orderId (1 đơn 1 label). */
  private async saveShipmentInfoMany(orderIds: string[], patch: Partial<VnpShipmentInfo>): Promise<void> {
    const $set = Object.fromEntries(
      Object.entries(patch)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [`vnpShipment.${k}`, v]),
    );
    await this.orderModel.updateMany({ _id: { $in: orderIds } }, { $set });
  }

  /**
   * Bước 1 — kiểm tra địa chỉ nhận trước khi mua label. 2 lớp:
   * (a) pre-check LOCAL các gate mà createShipment chắc chắn chặn nhưng USPS
   *     bỏ qua/tự sửa: country phải US, state phải là mã bang hợp lệ;
   * (b) USPS checkAddress — parse CHÍNH XÁC `result.verifications.{zip4,delivery}`
   *     (delivery bắt cả số nhà không tồn tại: `E.ADDRESS.NOT_FOUND`); lưu ý
   *     `code` ngoài cùng LUÔN 200 kể cả khi địa chỉ sai — không dùng looksOk.
   */
  async checkAddress(orderId: string): Promise<{ valid: boolean; message?: string; raw: unknown }> {
    const order = await this.loadOrder(orderId);
    const addr = this.requireAddress(order);

    const problems: string[] = [];
    const notes: string[] = [];
    const country = (addr.country || 'US').trim().toUpperCase();
    const stateCode = normalizeUsState(addr.state);
    if (country !== 'US') {
      problems.push(`country="${addr.country}" — shipping unit hiện chỉ nhận địa chỉ US (DOMESTIC)`);
    } else if (!VALID_US_STATE_SET.has(stateCode)) {
      problems.push(`state="${addr.state ?? ''}" không phải mã bang US hợp lệ — tạo vận đơn sẽ dính "State field is invalid"`);
    }
    if (!addr.address1?.trim()) problems.push('Thiếu địa chỉ đường (address1)');
    if (!addr.city?.trim()) problems.push('Thiếu city');
    if (!addr.postcode?.trim()) problems.push('Thiếu zip (postcode)');

    const raw = await this.client.checkAddressUsps({
      street1: addr.address1 || '',
      street2: addr.address2 || undefined,
      city: addr.city || '',
      state: addr.state || '',
      zip: addr.postcode || '',
      country: addr.country || 'US',
    });

    const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const result = (rec.result && typeof rec.result === 'object' ? rec.result : {}) as Record<string, unknown>;
    const verifications = result.verifications as { zip4?: UspsVerification; delivery?: UspsVerification } | undefined;
    let uspsOk: boolean;
    if (verifications?.delivery || verifications?.zip4) {
      uspsOk = verifications.delivery?.success !== false && verifications.zip4?.success !== false;
      for (const v of [verifications.zip4, verifications.delivery]) {
        for (const e of v?.errors ?? []) {
          const msg = e?.message || e?.code;
          if (msg && !notes.includes(`USPS: ${msg}`)) notes.push(`USPS: ${msg}`);
        }
      }
      // USPS tự sửa state theo zip (gõ "ZZ" vẫn trả về "NC") — lệch với dữ
      // liệu đơn nghĩa là label sẽ in state sai → bắt sửa dữ liệu trước.
      const uspsState = typeof result.state === 'string' ? result.state.toUpperCase() : '';
      if (uspsOk && uspsState && stateCode && uspsState !== stateCode) {
        problems.push(`USPS trả state="${uspsState}" khác dữ liệu đơn ("${stateCode}") — sửa state của đơn trước khi mua label`);
      }
      const uspsZip = typeof result.zip === 'string' ? result.zip : '';
      if (uspsOk && uspsZip && uspsZip !== (addr.postcode || '')) notes.push(`USPS chuẩn hóa zip: ${uspsZip}`);
    } else {
      // Không thấy verifications (VNP đổi shape?) — rơi về heuristic cũ.
      uspsOk = looksOk(raw);
      notes.push('Không đọc được verifications từ response — kết quả theo heuristic, cần soi raw');
    }

    const valid = problems.length === 0 && uspsOk;
    const message = [...problems, ...notes].join(' • ') || digString(raw, ['message', 'error']);
    await this.saveShipmentInfo(orderId, { addressValid: valid, addressCheckedAt: new Date() });
    this.logger.info({
      message: JSON.stringify({ action: 'vnpCheckAddress', orderId, productionId: order.productionId, valid, problems }),
    });
    return { valid, message, raw };
  }

  /**
   * Bước 2 — tạo vận đơn: createAddress(ShippingTo) → createShipment.
   * Gộp theo `orderId` seller (1 đơn nhiều item = 1 label): mỗi item của nhóm
   * thành 1 entry `package_details`, `rep1` = productionId từng item (unique
   * bên VNP → chống trùng), `rep2` = orderId. Kết quả lưu lên CẢ nhóm.
   */
  async createShipment(
    orderId: string,
    dto: CreateVnpShipmentDto,
    createdBy?: { userId?: string; userName?: string },
  ): Promise<{ shipment: VnpShipmentInfo; groupProductionIds: string[]; raw: unknown; rawAddress?: unknown }> {
    const order = await this.loadOrder(orderId);
    const addr = this.requireAddress(order);
    if (!order.productionId) throw new BadRequestException('Đơn thiếu productionId.');
    const group = await this.loadGroup(order);
    const withShipment = group.find((o) => o.vnpShipment?.shipmentId && !o.vnpShipment.cancelledAt);
    if (withShipment) {
      throw new BadRequestException(
        `Đơn seller này đã có vận đơn VNP (${withShipment.vnpShipment?.shipmentId} — item ${withShipment.productionId}). ` +
          '1 đơn chỉ mua 1 label; hủy vận đơn cũ trước khi tạo lại.',
      );
    }
    const config = this.apiConfigService.vnpEglobalConfig;
    if (!config?.shippingUnitId) {
      throw new BadRequestException('Thiếu env VNP_EGLOBAL_SHIPPING_UNIT_ID (Nexo cấp theo môi trường).');
    }
    // Địa chỉ gửi theo XƯỞNG của đơn (nhiều xưởng dùng chung 1 địa chỉ được).
    const fromAddressId = await this.resolveFromAddressId(order);

    // Địa chỉ nhận US — convention VNP (xác nhận qua test cô lập 24/08 + curl
    // mẫu tài liệu của họ district:"TX"): `district` = mã bang, đó là field
    // carrier đọc làm STATE; field `state` gửi lên bị BỎ QUA lúc createShipment,
    // `ward` là placeholder tùy ý. Thiếu district=mã bang → "State field is
    // invalid" dù address lưu state đúng.
    // Phone carrier đòi bắt đầu khác 0, 8-15 số → chuẩn hóa.
    const name = [addr.firstName, addr.lastName].filter(Boolean).join(' ').trim() || 'Receiver';
    const stateCode = normalizeUsState(addr.state);
    const rawAddress = await this.client.createAddress({
      name,
      phone_number: normalizeVnpPhone(addr.phone),
      city: addr.city || '',
      district: stateCode || addr.city || '-',
      ward: stateCode || '-',
      zip_code: addr.postcode || undefined,
      country: addr.country || 'US',
      street1: addr.address1 || '',
      street2: addr.address2 || undefined,
      address: [addr.address1, addr.address2, addr.city, addr.state, addr.country].filter(Boolean).join(', '),
      is_default: false,
      type_of_address: 'ShippingTo',
      email: addr.email || undefined,
      state: stateCode || undefined,
    });
    const toAddressId = digString(rawAddress, ADDRESS_ID_KEYS);
    if (!looksOk(rawAddress) || !toAddressId) {
      throw new BadRequestException(
        'VNP createAddress không trả address id — response: ' + JSON.stringify(rawAddress).slice(0, 4000),
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    // 1 entry package_details / item trong nhóm — weight riêng từng item,
    // fallback dto.weightGram cho item thiếu weight.
    const raw = await this.client.createShipment({
      shipping_from_id: fromAddressId,
      shipping_to_id: toAddressId,
      package_details: group.map((o) => ({
        type_product: 'Item',
        packages: String(dto.packages ?? 1),
        weight_per_package: String(o.weight && o.weight > 0 ? o.weight : dto.weightGram),
        product_id: String(o.productConfigId ?? o.type ?? o.productionId),
        weight_unit: 'gram',
        length: dto.lengthCm ?? (o.length && o.length > 0 ? o.length : 1),
        wide: dto.wideCm ?? (o.width && o.width > 0 ? o.width : 1),
        height: dto.heightCm ?? (o.height && o.height > 0 ? o.height : 1),
        dimentions_unit: 'cm',
        rep1: o.productionId,
        rep2: o.orderId || undefined,
        quantity: o.quantity ?? 1,
        package_type: dto.packageType || undefined,
      })),
      shipping_unit_id: config.shippingUnitId,
      service: dto.service,
      ship_date: today,
      ready_time: today,
      last_time_available: today,
      confirmation: true,
      shipping_type: dto.shippingType,
      ...(dto.service === 'Uniuni' ? { disable_fallback: true } : {}),
    });
    if (!looksOk(raw)) {
      throw new BadRequestException('VNP createShipment lỗi — response: ' + JSON.stringify(raw).slice(0, 6000));
    }

    // Format thật (xác nhận 24/08): { code:200, result:[{ id, shipping_cost,
    // shipmentResults:{ id, tracking_code, image_url (LABEL PDF) } }] }.
    const rec = ((raw as Record<string, unknown> | null)?.result as Array<Record<string, unknown>> | undefined)?.[0];
    const shipmentResults = rec?.shipmentResults as Record<string, unknown> | undefined;
    const info: Partial<VnpShipmentInfo> = {
      shipmentId: (typeof rec?.id === 'string' ? rec.id : undefined) ?? digString(raw, SHIPMENT_ID_KEYS),
      trackingCode:
        (typeof shipmentResults?.tracking_code === 'string' ? shipmentResults.tracking_code : undefined) ??
        digString(raw, TRACKING_KEYS),
      labelUrl:
        (typeof shipmentResults?.image_url === 'string' ? shipmentResults.image_url : undefined) ??
        digString(raw, LABEL_KEYS),
      service: dto.service,
      shippingType: dto.shippingType,
      toAddressId,
      createdAt: new Date(),
    };
    const groupIds = group.map((o) => String(o._id));
    const groupProductionIds = group.map((o) => o.productionId);

    // Nguồn sự thật: pack (kiện — tự sinh ngầm, 1 pack = 1 đơn khách) +
    // record shipment MỚI mỗi lần mua (lịch sử không ghi đè).
    const pack = await this.packageModel.create({
      code: `PK-${genCode(10)}`,
      factoryId: order.factoryId || undefined,
      orderCodes: order.orderId?.trim() ? [order.orderId.trim()] : [],
      productionOrderIds: groupIds,
      productionIds: groupProductionIds,
      createdAt: new Date(),
    });
    const shipmentRecord = await this.shipmentModel.create({
      packageId: pack._id,
      provider: 'vnp-eglobal',
      vnpShipmentId: info.shipmentId,
      trackingCode: info.trackingCode,
      labelUrl: info.labelUrl,
      service: dto.service,
      shippingType: dto.shippingType,
      fromAddressId,
      toAddressId,
      shippingCost:
        typeof rec?.shipping_cost === 'string' || typeof rec?.shipping_cost === 'number'
          ? String(rec.shipping_cost)
          : undefined,
      status: 'created',
      createdByUserId: createdBy?.userId,
      createdByUserName: createdBy?.userName,
      createdAt: new Date(),
    });
    // Đối soát ví: chụp số dư NGAY SAU khi mua — lỗi thì bỏ qua, tuyệt đối
    // không làm fail luồng mua (label đã tạo xong bên VNP rồi).
    try {
      const balanceAfter = digString(await this.client.availableBalance(), [
        'balance',
        'available_balance',
        'availableBalance',
        'amount',
      ]);
      if (balanceAfter) {
        await this.shipmentModel.updateOne({ _id: shipmentRecord._id }, { $set: { balanceAfter } });
      }
    } catch {
      // ignore — chỉ mất 1 điểm đối soát
    }

    // Snapshot mỏng lên CẢ nhóm orders (1 orderId 1 label — item nào mở dialog
    // cũng thấy, list render không phải join). Xóa cancelledAt cũ nếu tạo lại.
    await this.saveShipmentInfoMany(groupIds, info);
    await this.orderModel.updateMany({ _id: { $in: groupIds } }, { $unset: { 'vnpShipment.cancelledAt': 1 } });
    const shipment = (await this.orderModel.findOne({ _id: orderId }))?.vnpShipment ?? (info as VnpShipmentInfo);
    this.logger.info({
      message: JSON.stringify({
        action: 'vnpCreateShipment',
        orderId,
        sellerOrderId: order.orderId,
        groupProductionIds,
        shipmentId: shipment.shipmentId,
        trackingCode: shipment.trackingCode,
        hasLabel: !!shipment.labelUrl,
      }),
    });
    return { shipment, groupProductionIds, raw, rawAddress };
  }

  /** Bước 3 — tra tracking (ưu tiên trackingCode, fallback shipmentId). */
  async getTracking(orderId: string): Promise<{ shipment?: VnpShipmentInfo; raw: unknown }> {
    const order = await this.loadOrder(orderId);
    const code = order.vnpShipment?.trackingCode || order.vnpShipment?.shipmentId;
    if (!code) throw new BadRequestException('Đơn chưa có vận đơn VNP — tạo vận đơn trước.');
    const raw = await this.client.getTracking(code);
    // Cập nhật trạng thái cho MỌI item cùng shipmentId (nhóm 1 đơn 1 label).
    const patch = { lastTrackingStatus: digString(raw, STATUS_KEYS), lastTrackingAt: new Date() };
    await this.orderModel.updateMany(
      { 'vnpShipment.shipmentId': order.vnpShipment?.shipmentId },
      {
        $set: {
          ...(patch.lastTrackingStatus ? { 'vnpShipment.lastTrackingStatus': patch.lastTrackingStatus } : {}),
          'vnpShipment.lastTrackingAt': patch.lastTrackingAt,
        },
      },
    );
    // Sync record shipments (nguồn sự thật) + ghi event vào lịch sử poll.
    await this.shipmentModel.updateMany(
      { vnpShipmentId: order.vnpShipment?.shipmentId, status: { $in: ['created', 'in_transit'] } },
      {
        $set: {
          ...(patch.lastTrackingStatus ? { lastTrackingStatus: patch.lastTrackingStatus } : {}),
          lastTrackingAt: patch.lastTrackingAt,
        },
        ...(patch.lastTrackingStatus
          ? { $push: { trackingEvents: { status: patch.lastTrackingStatus, at: patch.lastTrackingAt } } }
          : {}),
      },
    );
    const shipment = (await this.orderModel.findOne({ _id: orderId }))?.vnpShipment ?? undefined;
    return { shipment, raw };
  }

  /** Chi tiết shipment (GET /shipment/{id}) — soi response tìm label sau khi tạo. */
  async getShipmentDetail(orderId: string): Promise<{ raw: unknown }> {
    const order = await this.loadOrder(orderId);
    const shipmentId = order.vnpShipment?.shipmentId;
    if (!shipmentId) throw new BadRequestException('Đơn chưa có vận đơn VNP.');
    const raw = await this.client.getShipment(shipmentId);
    // Nhặt bù label/tracking nếu createShipment không trả mà get detail có —
    // lưu cho MỌI item cùng shipmentId (nhóm 1 đơn 1 label).
    const labelUrl = digString(raw, LABEL_KEYS);
    const trackingCode = digString(raw, TRACKING_KEYS);
    if (labelUrl || trackingCode) {
      const $set = {
        ...(labelUrl ? { labelUrl } : {}),
        ...(trackingCode && !order.vnpShipment?.trackingCode ? { trackingCode } : {}),
      };
      await this.orderModel.updateMany(
        { 'vnpShipment.shipmentId': shipmentId },
        {
          $set: {
            ...(labelUrl ? { 'vnpShipment.labelUrl': labelUrl } : {}),
            ...(trackingCode && !order.vnpShipment?.trackingCode ? { 'vnpShipment.trackingCode': trackingCode } : {}),
          },
        },
      );
      await this.shipmentModel.updateMany({ vnpShipmentId: shipmentId }, { $set });
    }
    return { raw };
  }

  /** Bước 4 — hủy vận đơn (để tạo lại khi test). */
  async cancelShipment(orderId: string): Promise<{ shipment: VnpShipmentInfo; raw: unknown }> {
    const order = await this.loadOrder(orderId);
    const shipmentId = order.vnpShipment?.shipmentId;
    if (!shipmentId) throw new BadRequestException('Đơn chưa có vận đơn VNP.');
    const raw = await this.client.cancelShipment(shipmentId);
    if (!looksOk(raw)) {
      throw new BadRequestException('VNP cancelShipment lỗi — response: ' + JSON.stringify(raw).slice(0, 6000));
    }
    // Đánh dấu hủy cho MỌI item cùng shipmentId (nhóm 1 đơn 1 label).
    const cancelledAt = new Date();
    await this.orderModel.updateMany(
      { 'vnpShipment.shipmentId': shipmentId },
      { $set: { 'vnpShipment.cancelledAt': cancelledAt } },
    );
    // Record shipments GIỮ NGUYÊN, chỉ chuyển trạng thái — lịch sử còn mãi.
    await this.shipmentModel.updateMany(
      { vnpShipmentId: shipmentId, status: { $in: ['created', 'in_transit'] } },
      { $set: { status: 'cancelled', cancelledAt } },
    );
    const shipment = (await this.orderModel.findOne({ _id: orderId }))?.vnpShipment ?? ({} as VnpShipmentInfo);
    this.logger.info({
      message: JSON.stringify({ action: 'vnpCancelShipment', orderId, productionId: order.productionId, shipmentId }),
    });
    return { shipment, raw };
  }

  // ── Lịch sử vận đơn (bảng shipments + shipping_packages) ─────────────────

  private toShipmentRecord(doc: ShipmentDocument): VnpShipmentRecord {
    const pack = doc.package;
    return {
      _id: String(doc._id),
      packageId: doc.packageId,
      provider: doc.provider,
      vnpShipmentId: doc.vnpShipmentId,
      trackingCode: doc.trackingCode,
      labelUrl: doc.labelUrl,
      carrier: doc.carrier,
      trackingUrl: doc.trackingUrl,
      service: doc.service,
      shippingType: doc.shippingType,
      fromAddressId: doc.fromAddressId,
      toAddressId: doc.toAddressId,
      shippingCost: doc.shippingCost,
      balanceAfter: doc.balanceAfter,
      status: doc.status,
      cancelledAt: doc.cancelledAt,
      lastTrackingStatus: doc.lastTrackingStatus,
      lastTrackingAt: doc.lastTrackingAt,
      trackingEvents: doc.trackingEvents ?? [],
      createdByUserId: doc.createdByUserId,
      createdByUserName: doc.createdByUserName,
      createdAt: doc.createdAt,
      package: pack
        ? {
            _id: String(pack._id),
            code: pack.code,
            factoryId: pack.factoryId,
            orderCodes: pack.orderCodes ?? [],
            productionOrderIds: pack.productionOrderIds ?? [],
            productionIds: pack.productionIds ?? [],
            parentPackageId: pack.parentPackageId,
            createdAt: pack.createdAt,
          }
        : undefined,
    };
  }

  /** Danh sách vận đơn toàn hệ thống — search khớp tracking/mã kiện/mã đơn. */
  async listShipments(dto: GetVnpShipmentsDto): Promise<{ data: VnpShipmentRecord[]; total: number }> {
    const search = dto.search?.trim();
    let filter: Record<string, unknown> = {};
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      // Kiện khớp theo mã kiện / productionId / orderId seller → OR với field shipment.
      const packIds = await this.packageModel
        .find({ $or: [{ code: rx }, { productionIds: rx }, { orderCodes: rx }] })
        .distinct('_id');
      filter = { $or: [{ trackingCode: rx }, { vnpShipmentId: rx }, { packageId: { $in: packIds } }] };
    }
    if (dto.status) filter.status = dto.status;
    const [docs, total] = await Promise.all([
      this.shipmentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((dto.page - 1) * dto.size)
        .limit(dto.size)
        .populate('package'),
      this.shipmentModel.countDocuments(filter),
    ]);
    return { data: (docs as ShipmentDocument[]).map((d) => this.toShipmentRecord(d)), total };
  }

  /** Lịch sử vận đơn của 1 đơn sản xuất — mọi record của các kiện chứa nó. */
  async getOrderShipments(orderId: string): Promise<VnpShipmentRecord[]> {
    const order = await this.loadOrder(orderId);
    const packIds = await this.packageModel.find({ productionOrderIds: String(order._id) }).distinct('_id');
    if (packIds.length === 0) return [];
    const docs = await this.shipmentModel
      .find({ packageId: { $in: packIds } })
      .sort({ createdAt: -1 })
      .populate('package');
    return (docs as ShipmentDocument[]).map((d) => this.toShipmentRecord(d));
  }

  // ── Cron poll tracking (2 lần/ngày — VNP KHÔNG có webhook cho partner) ────

  private trackingCronRunning = false;

  /**
   * Poll trạng thái các shipment đang "mở" (`created`/`in_transit`, tạo trong
   * 30 ngày — quá 30 ngày coi như label chết, dừng poll). Nguồn:
   * `tracking/public/track` (VietNamLogistics, không token, KHÔNG ăn quota
   * USPS). Chỉ ghi `trackingEvents` khi status text ĐỔI; text chứa "delivered"
   * → chuyển `status='delivered'` (hết poll). Khóa in-flight chống gọi chồng.
   */
  async pollTrackingCron(): Promise<{
    checked: number;
    updated: number;
    delivered: number;
    failed: number;
    skipped?: boolean;
  }> {
    if (this.trackingCronRunning) return { checked: 0, updated: 0, delivered: 0, failed: 0, skipped: true };
    this.trackingCronRunning = true;
    try {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      const open = await this.shipmentModel
        .find({
          // CHỈ label VNP hệ thống mua — label khách tự cấp (`provider='customer'`,
          // ORD-26) mua bên ngoài, tra qua VNP vô nghĩa.
          provider: SHIPMENT_PROVIDER_VNP,
          status: { $in: ['created', 'in_transit'] },
          createdAt: { $gte: since },
          trackingCode: { $exists: true, $nin: [null, ''] },
        })
        .sort({ createdAt: 1 })
        .limit(200);
      let updated = 0;
      let delivered = 0;
      let failed = 0;
      for (const doc of open) {
        try {
          const raw = await this.client.publicTrack(doc.trackingCode as string);
          const now = new Date();
          const statusText = digString(raw, STATUS_KEYS);
          const changed = !!statusText && statusText !== doc.lastTrackingStatus;
          const newStatus = classifyTrackingStatus(statusText);
          await this.shipmentModel.updateOne(
            { _id: doc._id },
            {
              $set: {
                lastTrackingAt: now,
                ...(statusText ? { lastTrackingStatus: statusText } : {}),
                ...(newStatus && newStatus !== doc.status ? { status: newStatus } : {}),
              },
              ...(changed ? { $push: { trackingEvents: { status: statusText, at: now } } } : {}),
            },
          );
          if (changed) {
            updated += 1;
            // Sync snapshot trên orders để bảng đơn hiện trạng thái mới.
            if (doc.vnpShipmentId) {
              await this.orderModel.updateMany(
                { 'vnpShipment.shipmentId': doc.vnpShipmentId },
                { $set: { 'vnpShipment.lastTrackingStatus': statusText, 'vnpShipment.lastTrackingAt': now } },
              );
            }
          }
          if (newStatus === 'delivered' && doc.status !== 'delivered') delivered += 1;
        } catch {
          failed += 1;
        }
        // Giãn nhịp giữa các call — tránh dồn tải/quota phía VNP.
        await new Promise((r) => setTimeout(r, 800));
      }
      this.logger.info({
        message: JSON.stringify({ action: 'vnpTrackingCron', checked: open.length, updated, delivered, failed }),
      });
      return { checked: open.length, updated, delivered, failed };
    } finally {
      this.trackingCronRunning = false;
    }
  }

  // ── Dashboard chi phí label (trang /adm/shipments) ────────────────────────

  /**
   * Cost = tổng `shippingCost` các record CHƯA HỦY (policy hoàn tiền khi hủy
   * của VNP chưa rõ — record hủy đếm riêng, không cộng cost). Bucket tháng
   * theo giờ VN.
   */
  async getShipmentStats(dto: { from?: string; to?: string }): Promise<VnpShipmentStats> {
    const match: Record<string, unknown> = {};
    if (dto.from || dto.to) {
      match.createdAt = {
        ...(dto.from ? { $gte: new Date(`${dto.from}T00:00:00+07:00`) } : {}),
        ...(dto.to ? { $lte: new Date(`${dto.to}T23:59:59.999+07:00`) } : {}),
      };
    }
    const costExpr = { $convert: { input: '$shippingCost', to: 'double', onError: 0, onNull: 0 } };
    const notCancelled = { $match: { status: { $ne: 'cancelled' } } };
    const [facet] = await this.shipmentModel.aggregate<{
      totals: { count: number; cost: number; active: number; delivered: number; cancelled: number }[];
      byMonth: { key: string; count: number; cost: number }[];
      byFactory: { key: string; count: number; cost: number; factoryName?: string }[];
      byService: { key: string; count: number; cost: number }[];
    }>([
      { $match: match },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                cost: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, costExpr, 0] } },
                active: { $sum: { $cond: [{ $in: ['$status', ['created', 'in_transit']] }, 1, 0] } },
                delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
                cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
              },
            },
            { $project: { _id: 0 } },
          ],
          byMonth: [
            notCancelled,
            {
              $group: {
                _id: { $dateToString: { date: '$createdAt', format: '%Y-%m', timezone: '+07:00' } },
                count: { $sum: 1 },
                cost: { $sum: costExpr },
              },
            },
            { $sort: { _id: -1 } },
            { $limit: 12 },
            { $project: { _id: 0, key: '$_id', count: 1, cost: 1 } },
          ],
          byFactory: [
            notCancelled,
            { $lookup: { from: 'shipping_packages', localField: 'packageId', foreignField: '_id', as: 'pack' } },
            { $addFields: { factoryId: { $ifNull: [{ $arrayElemAt: ['$pack.factoryId', 0] }, ''] } } },
            { $group: { _id: '$factoryId', count: { $sum: 1 }, cost: { $sum: costExpr } } },
            { $lookup: { from: 'factories', localField: '_id', foreignField: '_id', as: 'factory' } },
            {
              $project: {
                _id: 0,
                key: '$_id',
                count: 1,
                cost: 1,
                factoryName: { $arrayElemAt: ['$factory.shortName', 0] },
              },
            },
            { $sort: { cost: -1 } },
          ],
          byService: [
            notCancelled,
            { $group: { _id: { $ifNull: ['$service', ''] }, count: { $sum: 1 }, cost: { $sum: costExpr } } },
            { $project: { _id: 0, key: '$_id', count: 1, cost: 1 } },
            { $sort: { cost: -1 } },
          ],
        },
      },
    ]);
    return {
      totals: facet?.totals?.[0] ?? { count: 0, cost: 0, active: 0, delivered: 0, cancelled: 0 },
      byMonth: facet?.byMonth ?? [],
      byFactory: facet?.byFactory ?? [],
      byService: facet?.byService ?? [],
    };
  }
}
