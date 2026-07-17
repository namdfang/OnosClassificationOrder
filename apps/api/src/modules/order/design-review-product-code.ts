/**
 * Map `OrderEntity.type` (tên sản phẩm tiếng Anh, khớp `ProductConfig.fullName`
 * lúc import) → mã ngắn cho tool duyệt thiết kế bên ngoài. Chỉ dùng ở
 * `getNextDesignReviewOrder()` — KHÔNG liên quan tới mapping xưởng/machine
 * (`productConfigId`, xem `importOrders`).
 */
const PRODUCT_TYPE_CODE_MAP: Record<string, string> = {
  'all-over print satin short-sleeve pajama shirt': 'SSHIRTV',
  'all-over print satin long pajama pants - no piping': 'LPJM',
  'all-over print satin short-sleeve pajama set': 'SPJMV',
  'all-over print satin long pajama pants': 'LPJMV',
  'all-over print v-neck soccer jersey': 'TXV',
  "all-over print women's leggings": 'LG',
  'all-over print satin long-sleeve pajama shirt': 'SHIRTLPJMV',
  'all-over print basketball v-neck mesh shirt': 'TTOPVAICOTIM',
  'all-over print string bikini': 'BKNTG',
  'all-over print casual bikini set': 'BKN',
  'crop top baseball jersey': 'CRTOP',
  'all-over print v-neck sleeveless jersey tank top': 'TTOPV',
  'all-over print sports bra': 'BRA',
  'all-over print sleeveless jersey tank top': 'TTOP',
  "all-over print premium women's polo shirt": 'PLN',
  "women's sleeveless performance polo shirt": 'PLNSN',
  'all-over print sweatpants 270 gsm': 'SP270',
  'all-over print kids hoodie': 'HDKIDS',
  'double-sided printed canvas flag': 'CANVASFLAG',
  "all-over print women's t-shirt": 'TXWOMEN',
  "all-over print and embroidered men's polo shirt": 'PLNGUC',
  "all-over print chest embroidered logo men's polo shirt us tag": 'PLUSTAG',
  "all-over print embroidered logo men's polo shirt": 'PLTRU',
  "aop men's polo shirt with woven placket label": 'PLMAC',
  'all-over print curved hem t-shirt': 'TXMEXICO',
  'all-over print baseball jersey - no piping': 'BR-KL',
  'all-over print vietnam football jersey': 'FBVN',
  'all-over print satin long-sleeve pajama set': 'PJMV',
  'all-over print satin short-sleeve pajama set with long pants': 'LPANTSSHIRTV',
  "all-over print women's racerback tank top": 'TTOPNU',
  "all-over print women's sport shorts": 'QCNU',
  'all-over print youth sport mesh shorts': 'QCLUOIKID',
  'all-over print hawaiian shorts': 'HWSHORTS',
  'all-over print unisex t-shirtg': 'TXG',
  'all-over print short-sleeve hawaiian shirt06': 'HWANHDUC06',
  'all-over print pique & mesh football jersey': 'FBVAILUOI',
  'all-over print overlap v-neck mesh football crop top jersey': 'FBCROPTOP',
  'all-over print youth hawaiian shorts': 'QCKIDS',
  'all-over print overlap v-neck mesh football crop top jerseykhop': 'FBCRTKHOP',
};

/** Case-insensitive, trim khoảng trắng thừa. Không khớp → null. */
export function mapProductTypeToCode(type?: string | null): string | null {
  if (!type) return null;
  return PRODUCT_TYPE_CODE_MAP[type.trim().toLowerCase()] ?? null;
}
