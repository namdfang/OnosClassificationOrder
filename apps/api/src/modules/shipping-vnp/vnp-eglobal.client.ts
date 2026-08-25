import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';

import { ApiConfigService } from '../../shared/services/api-config.service';

/**
 * HTTP client bọc VNP eGlobal Shipment API (vnp-eglobal.itel.dev).
 *
 * - Auth: `POST /auth/signin` {email,password} → JWT Bearer. Token cache
 *   in-memory, KHÔNG biết TTL (spec không khai) → chiến lược: dùng tới khi
 *   dính 401 thì re-login đúng 1 lần rồi retry request.
 * - Response: spec khai `object` trống cho MỌI endpoint → client trả
 *   `unknown` nguyên văn, service phía trên tự dò field (giai đoạn test).
 * - Body field theo đúng OpenAPI schemas: `LoginRq`, `AddAddressRequest`,
 *   `ShipmentRequest`/`PackageRequest`, `CheckAddressRequest`.
 */

export interface VnpAddressPayload {
  name: string;
  phone_number: string;
  city: string;
  district: string;
  ward: string;
  zip_code?: string;
  zone?: string;
  country: string;
  street1: string;
  street2?: string;
  address?: string;
  note?: string;
  is_default?: boolean;
  type_of_address: 'ShippingFrom' | 'ShippingTo' | 'PickupDropOff';
  email?: string;
  state?: string;
}

export interface VnpPackagePayload {
  type_product: string;
  packages: string;
  weight_per_package: string;
  product_id: string;
  product_line_id?: string;
  weight_unit: string;
  length: number;
  wide: number;
  height: number;
  dimentions_unit: string;
  rep1: string;
  rep2?: string;
  quantity: number;
  package_type?: string;
}

export interface VnpShipmentPayload {
  shipping_from_id: string;
  shipping_to_id: string;
  package_details: VnpPackagePayload[];
  shipping_unit_id: string;
  service: string;
  ship_date: string;
  ready_time?: string;
  last_time_available?: string;
  confirmation?: boolean;
  shipping_type: string;
  disable_fallback?: boolean;
}

export interface VnpCheckAddressPayload {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

@Injectable()
export class VnpEglobalClient {
  private token: string | null = null;

  constructor(private readonly apiConfigService: ApiConfigService) {}

  private get config() {
    const config = this.apiConfigService.vnpEglobalConfig;
    if (!config) {
      throw new BadRequestException(
        'VNP eGlobal chưa cấu hình — cần env VNP_EGLOBAL_EMAIL / VNP_EGLOBAL_PASSWORD / VNP_EGLOBAL_SHIPPING_UNIT_ID.',
      );
    }
    return config;
  }

  private http(): AxiosInstance {
    return axios.create({ baseURL: this.config.apiUrl, timeout: 30_000, headers: { accept: '*/*' } });
  }

  private async signin(): Promise<string> {
    const { email, password } = this.config;
    try {
      const res = await this.http().post('/auth/signin', { email, password });
      // Spec không khai response — dò các tên field token phổ biến.
      const body = res.data as Record<string, unknown> | undefined;
      const result = (body?.result ?? body?.data ?? body) as Record<string, unknown> | undefined;
      const token = [result?.token, result?.accessToken, result?.access_token, result?.jwt].find(
        (v): v is string => typeof v === 'string' && v.length > 0,
      );
      if (!token) {
        throw new ServiceUnavailableException(
          'VNP signin không trả token nhận diện được — response: ' + JSON.stringify(body).slice(0, 2000),
        );
      }
      this.token = token;
      return token;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const ax = err as AxiosError;
      throw new ServiceUnavailableException(
        `VNP signin thất bại (${ax.response?.status ?? 'network'}): ` +
          JSON.stringify(ax.response?.data ?? ax.message).slice(0, 2000),
      );
    }
  }

  /**
   * Gọi API kèm Bearer; 401 → re-login 1 lần rồi retry. Lỗi MẠNG thuần
   * (ECONNRESET/timeout — không có response) → chờ 1.5s retry 1 lần: staging
   * VNP thi thoảng ngắt kết nối giữa chừng dù server vẫn sống.
   */
  private async request<T = unknown>(method: 'get' | 'post' | 'put' | 'delete', url: string, data?: unknown): Promise<T> {
    const token = this.token ?? (await this.signin());
    const attempt = async (bearer: string): Promise<T> => {
      const res = await this.http().request<T>({ method, url, data, headers: { Authorization: `Bearer ${bearer}` } });
      return res.data;
    };
    try {
      try {
        return await attempt(token);
      } catch (err) {
        const ax = err as AxiosError;
        if (ax.response?.status === 401) return await attempt(await this.signin());
        if (!ax.response) {
          // Lỗi mạng — retry đúng 1 lần sau 1.5s.
          await new Promise((r) => setTimeout(r, 1500));
          return await attempt(this.token ?? token);
        }
        throw err;
      }
    } catch (err) {
      const ax = err as AxiosError;
      throw new BadRequestException(
        `VNP ${method.toUpperCase()} ${url} lỗi (${ax.response?.status ?? 'network'}): ` +
          JSON.stringify(ax.response?.data ?? ax.message).slice(0, 6000),
      );
    }
  }

  checkAddressUsps(payload: VnpCheckAddressPayload): Promise<unknown> {
    return this.request('post', '/shipment/usps/checkAddress', payload);
  }

  createAddress(payload: VnpAddressPayload): Promise<unknown> {
    return this.request('post', '/shipment/createAddress', payload);
  }

  createShipment(payload: VnpShipmentPayload): Promise<unknown> {
    return this.request('post', '/shipment/createShipment', payload);
  }

  getShipment(shipmentId: string): Promise<unknown> {
    return this.request('get', `/shipment/${encodeURIComponent(shipmentId)}`);
  }

  getTracking(trackingId: string): Promise<unknown> {
    return this.request('get', `/shipment/tracking/${encodeURIComponent(trackingId)}`);
  }

  cancelShipment(shipmentId: string): Promise<unknown> {
    return this.request('put', `/shipment/${encodeURIComponent(shipmentId)}/cancel`);
  }

  /** Tra shipment theo rep1 (= productionId bên mình) — chống tạo trùng. */
  getByRef1(ref1: string): Promise<unknown> {
    return this.request('get', `/shipment/getByRef1/${encodeURIComponent(ref1)}`);
  }

  /** Số dư ví — VNP đòi tối thiểu $50 mới cho createShipment. */
  availableBalance(): Promise<unknown> {
    return this.request('get', '/availableBalance');
  }

  /**
   * Danh sách địa chỉ đã lưu trong tài khoản VNP — quan trọng vì with một số
   * shipping unit, `shipping_from_id` PHẢI là hub US của VNP (Carson CA /
   * Jamaica NY / Garden Grove CA...) thường đã tồn tại sẵn trong tài khoản.
   */
  getShippingAddresses(typeOfAddress: 'ShippingFrom' | 'ShippingTo' | 'PickupDropOff' = 'ShippingFrom'): Promise<unknown> {
    return this.request('get', `/shipment/getShippingAddress?typeOfAddress=${typeOfAddress}`);
  }
}
