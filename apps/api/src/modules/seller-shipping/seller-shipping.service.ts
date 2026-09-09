import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  BuySellerLabelDto,
  SellerShipPriceRow,
  SellerShipPriceTable,
  SellerShipQuote,
} from 'shared';
import {
  computeChargeableWeightGram,
  DIM_WEIGHT_DIVISOR,
  resolveSellerShipPrice,
  SELLER_SHIPPING_PRICE_CONFIG_KEY,
  SHIPMENT_PROVIDER_VNP,
} from 'shared';
import { Logger } from 'winston';

import type { CustomerDocument } from '@/modules/customer/customer.entity';
import { CustomerOrderEntity } from '@/modules/customer-portal/customer-order.entity';
import { CustomerWalletService, WalletInsufficientFundsException } from '@/modules/customer-wallet/customer-wallet.service';
import { OrderEntity } from '@/modules/order/order.entity';
import { ShipmentEntity } from '@/modules/shipping-vnp/shipment.entity';
import { ShippingVnpService } from '@/modules/shipping-vnp/shipping-vnp.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { ApiConfigService } from '@/shared/services/api-config.service';

import { checkSellerLabelEligibility, sumStagingWeights } from './seller-label-eligibility';

/**
 * Seller tự mua label VNP (plan `SellerWallet-LabelPurchase.md`) — quote/buy
 * cho đơn cod/tiktok đã push. Thứ tự tiền theo ShippingLabelPatterns.md:
 * **trừ ví TRƯỚC** (fail-closed, không đủ tiền chết ngay chưa đụng VNP) →
 * gọi luồng mua VNP sẵn có (giữ chỗ `purchasing`, unique index chống trùng) →
 * VNP lỗi → **hoàn tự động** cùng requestId.
 *
 * LỖI PHÍA SELLER: message = đúng 1 mã trong `SELLER_SHIP_ERROR_CODES` (FE map
 * i18n). Chi tiết thật (raw VNP, địa chỉ, ví công ty) CHỈ vào Winston log +
 * record `shipments` — filter global chỉ trả `message` nên không rò được gì khác.
 */
@Injectable()
export class SellerShippingService {
  constructor(
    @InjectModel(CustomerOrderEntity.name)
    private readonly customerOrderModel: Model<CustomerOrderEntity>,
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    @InjectModel(ShipmentEntity.name) private readonly shipmentModel: Model<ShipmentEntity>,
    private readonly systemConfigService: SystemConfigService,
    private readonly walletService: CustomerWalletService,
    private readonly shippingVnpService: ShippingVnpService,
    private readonly apiConfigService: ApiConfigService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  // -------------------------------------------------------------------------
  // Bảng giá
  // -------------------------------------------------------------------------

  async getPriceTable(): Promise<SellerShipPriceTable | null> {
    return this.systemConfigService.get<SellerShipPriceTable>(SELLER_SHIPPING_PRICE_CONFIG_KEY);
  }

  async importPriceTable(rows: SellerShipPriceRow[]): Promise<{ rowCount: number; maxWeightGram: number }> {
    const sorted = [...rows].sort((a, b) => a.weightGram - b.weightGram);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].weightGram === sorted[i - 1].weightGram) {
        throw new BadRequestException(`Mốc cân trùng nhau: ${sorted[i].weightGram}g`);
      }
    }
    const prev = await this.getPriceTable();
    const table: SellerShipPriceTable = { rows: sorted, enabled: prev?.enabled ?? true, updatedAt: new Date() };
    await this.systemConfigService.set(SELLER_SHIPPING_PRICE_CONFIG_KEY, table, 'Bảng giá label bán cho seller (USD)');
    return { rowCount: sorted.length, maxWeightGram: sorted[sorted.length - 1].weightGram };
  }

  async toggle(enabled: boolean): Promise<void> {
    const prev = await this.getPriceTable();
    if (!prev) throw new BadRequestException('Chưa import bảng giá — import trước rồi mới bật/tắt.');
    await this.systemConfigService.set(SELLER_SHIPPING_PRICE_CONFIG_KEY, { ...prev, enabled, updatedAt: new Date() });
  }

  // -------------------------------------------------------------------------
  // Quote + Buy
  // -------------------------------------------------------------------------

  async quote(customer: CustomerDocument, stagingId: string, weightGram?: number): Promise<SellerShipQuote> {
    const ctx = await this.loadContext(customer, stagingId);
    return this.quoteFromContext(customer, ctx, weightGram);
  }

  private async quoteFromContext(
    customer: CustomerDocument,
    ctx: Awaited<ReturnType<SellerShippingService['loadContext']>>,
    weightGram?: number,
  ): Promise<SellerShipQuote> {
    const wallet = await this.walletService.getWallet(String(customer._id));
    const base: SellerShipQuote = {
      eligible: false,
      prefillGram: ctx.prefillGram,
      actualGram: 0,
      dimGram: ctx.dimGram,
      chargeableGram: 0,
      walletBalance: wallet.balance,
      creditLimit: wallet.creditLimit,
    };
    if (!ctx.eligibility.ok) return { ...base, errorCode: ctx.eligibility.errorCode };
    if (!ctx.featureOn) return { ...base, errorCode: 'service_unavailable' };

    const actual = weightGram && weightGram > 0 ? weightGram : ctx.prefillGram;
    const { actualGram, chargeableGram } = computeChargeableWeightGram({ actualGram: actual });
    const chargeable = Math.max(chargeableGram, ctx.dimGram);
    const priced = resolveSellerShipPrice(chargeable, ctx.table);
    if (!priced.ok) {
      const errorCode = priced.error === 'no_price_table' ? 'service_unavailable' : priced.error;
      return { ...base, actualGram, chargeableGram: chargeable, errorCode };
    }
    return {
      ...base,
      eligible: true,
      actualGram,
      chargeableGram: chargeable,
      tierGram: priced.tierGram,
      price: priced.price,
    };
  }

  async buy(
    customer: CustomerDocument,
    stagingId: string,
    dto: BuySellerLabelDto,
  ): Promise<{ trackingCode?: string; labelUrl?: string; price: number; balanceAfter: number }> {
    const ctx = await this.loadContext(customer, stagingId);
    const quote = await this.quoteFromContext(customer, ctx, dto.weightGram);
    if (!quote.eligible || quote.price == null) {
      throw new BadRequestException(quote.errorCode ?? 'not_eligible');
    }
    const anchorOrder = ctx.productionOrders[0];

    // 1) TRỪ VÍ TRƯỚC — không đủ tiền chết ngay tại đây, chưa đụng VNP.
    let txn;
    try {
      txn = await this.walletService.applyTransaction({
        customerId: String(customer._id),
        kind: 'label',
        amount: -quote.price,
        note: `Mua label ${quote.chargeableGram}g (mốc ${quote.tierGram}g)`,
        refs: {
          requestId: dto.requestId,
          stagingOrderId: stagingId,
          orderIds: ctx.productionOrders.map((o) => String(o._id)),
        },
      });
    } catch (err) {
      if (err instanceof WalletInsufficientFundsException) throw new BadRequestException('insufficient_funds');
      throw err;
    }

    // Retry cùng requestId sau khi ĐÃ mua xong lượt trước → trả lại nhãn cũ
    // (applyTransaction trả record cũ, createShipment cũng replay theo purchaseKey).
    // 2) Mua VNP — luồng sẵn có giữ nguyên chống trùng/giữ chỗ/đối soát ví công ty.
    try {
      const result = await this.shippingVnpService.createShipment(
        String(anchorOrder._id),
        {
          // Cùng mặc định với nút mua ở hub — service/shippingType không cho seller chọn.
          service: 'Standard',
          shippingType: 'GDE',
          packages: 1,
          requestId: dto.requestId,
          weightGram: quote.chargeableGram,
        },
        { userName: `seller:${customer.userSku || customer.userEmail}` },
      );
      // 3) Stamp giá seller lên record shipments — margin = sellerPrice − shippingCost.
      await this.shipmentModel.updateOne(
        { provider: SHIPMENT_PROVIDER_VNP, purchaseKey: dto.requestId },
        {
          $set: {
            sellerPrice: quote.price,
            sellerCustomerId: String(customer._id),
            sellerWalletTxnId: String(txn._id),
          },
        },
      );
      return {
        trackingCode: result.shipment.trackingCode,
        labelUrl: result.shipment.labelUrl,
        price: quote.price,
        balanceAfter: txn.balanceAfter,
      };
    } catch (err) {
      // 4) VNP lỗi → HOÀN TỰ ĐỘNG cùng requestId (idempotent — retry không hoàn 2 lần).
      // HOÀN TIỀN TRƯỚC, log sau — lệnh log mà ném (đã xảy ra: LoggerWrapper thiếu
      // `.error`, Common_Pitfalls.md §10) thì tiền seller vẫn phải về ví.
      let refundError: unknown;
      try {
        await this.walletService.applyTransaction({
          customerId: String(customer._id),
          kind: 'label_refund',
          amount: quote.price,
          note: 'Hoàn tự động — mua label không thành công',
          refs: { requestId: dto.requestId, stagingOrderId: stagingId },
        });
      } catch (err2) {
        refundError = err2;
      }
      this.logger.error({
        message: JSON.stringify({
          scope: 'seller-shipping.buy',
          stagingId,
          customerId: String(customer._id),
          requestId: dto.requestId,
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      if (refundError !== undefined) {
        // Hoàn lỗi = tiền seller đang treo — log để admin xử tay, KHÔNG nuốt lỗi gốc.
        this.logger.error({
          message: JSON.stringify({
            scope: 'seller-shipping.refund-failed',
            customerId: String(customer._id),
            requestId: dto.requestId,
            error: refundError instanceof Error ? refundError.message : String(refundError),
          }),
        });
      }
      throw new BadRequestException('service_unavailable');
    }
  }

  // -------------------------------------------------------------------------
  // Nội bộ
  // -------------------------------------------------------------------------

  private async loadContext(customer: CustomerDocument, stagingId: string) {
    const staging = await this.customerOrderModel.findById(stagingId);
    // Sai chủ và không tồn tại trả CÙNG lỗi — không lộ đơn có tồn tại hay không.
    if (!staging || String(staging.customerId) !== String(customer._id)) {
      throw new NotFoundException('not_eligible');
    }
    const productionIds = staging.items.map((it) => it.productionId).filter((v): v is string => !!v);
    const productionOrders = productionIds.length
      ? await this.orderModel
          .find({ productionId: { $in: productionIds } })
          .select('productionId orderId heldAt cancelledAt tracking vnpShipment')
      : [];
    const eligibility = checkSellerLabelEligibility(String(customer._id), staging, productionOrders);
    const { prefillGram, totalVolumeCm3 } = sumStagingWeights(staging.items);
    const dimGram = totalVolumeCm3 > 0 ? Math.ceil(totalVolumeCm3 / DIM_WEIGHT_DIVISOR) : 0;
    const table = await this.getPriceTable();
    const featureOn = (table?.enabled ?? true) && !!table && !!this.apiConfigService.vnpEglobalConfig;
    return { staging, productionOrders, eligibility, prefillGram, dimGram, table, featureOn };
  }
}
