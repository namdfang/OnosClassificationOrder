export const Marketplace = {
  Tiktok: 'Tiktok',
  Amazon: 'Amazon',
  Etsy: 'Etsy',
  Ebay: 'Ebay',
  Temu: 'Temu',
  Shein: 'Shein',
  Walmart: 'Walmart',
  Shopify: 'Shopify',
  WooCommerce: 'WooCommerce',
} as const;
export type Marketplace = (typeof Marketplace)[keyof typeof Marketplace];
