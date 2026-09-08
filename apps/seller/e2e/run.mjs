/**
 * Bộ kiểm end-to-end cho Seller Portal + Hub (chạy bằng Playwright, KHÔNG thêm
 * dependency vào workspace — dùng bản Playwright có sẵn trên máy, đường dẫn khai
 * ở env `PLAYWRIGHT_PATH`).
 *
 * Vì sao có file này (08/09/2026): làm tính năng mới đã hai lần làm hỏng tính
 * năng cũ — thêm cột tick làm mã đơn văng khỏi vị trí cố định, đổi kiểu dữ liệu
 * `printArea` làm catalog 500. Những lỗi đó đều nhìn thấy bằng mắt trong 5 giây
 * nhưng không ai nhìn kịp mọi màn sau mỗi lần sửa. Bộ này chạy hết luồng chính
 * và ASSERT từng thứ, kể cả mấy chi tiết đã từng hỏng.
 *
 * Chạy:
 *   node apps/seller/e2e/run.mjs                     # dev mặc định
 *   E2E_BASE=https://seller.onosfactory.com node ... # môi trường khác
 *
 * Env: E2E_BASE, E2E_SELLER_EMAIL, E2E_SELLER_PASSWORD, E2E_STAFF_EMAIL,
 *      E2E_STAFF_PASSWORD, PLAYWRIGHT_PATH.
 */

// `import` không nhận biểu thức — nạp động để đường dẫn Playwright đặt được qua env.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/root/.vibedev/repos/auto_facebook/node_modules/playwright/index.mjs');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3017';
const SELLER = { userEmail: process.env.E2E_SELLER_EMAIL || 'seller-smoke@onos.test', password: process.env.E2E_SELLER_PASSWORD || 'Smoke@12345' };
const STAFF = { email: process.env.E2E_STAFF_EMAIL || 'admin@local.dev', password: process.env.E2E_STAFF_PASSWORD || 'nQKE@@!129' };
const LINE = process.env.E2E_LINE || 'wood';

const results = [];
let failed = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function step(name, fn) {
  console.log(`\n## ${name}`);
  try {
    await fn();
  } catch (err) {
    check(`${name} (chạy được)`, false, String(err).slice(0, 160));
  }
}

/** Ô/th có thực sự dính khi cuộn ngang không — đọc `position` đã tính của trình duyệt. */
async function isSticky(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { position: cs.position, left: cs.left };
  }, selector);
}

const browser = await chromium.launch();

// ─────────────────────────────────────────────────────────── SELLER
const sellerCtx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const seller = await sellerCtx.newPage();

await step('Seller đăng nhập', async () => {
  const res = await seller.request.post(`${BASE}/api/auth/login`, { data: SELLER });
  check('POST /api/auth/login trả 200', res.status() === 200, `status ${res.status()}`);
});

await step('Trang Danh mục sản phẩm', async () => {
  await seller.goto(`${BASE}/portal/catalog`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await seller.waitForTimeout(5000);
  const body = await seller.evaluate(() => document.body.innerText);
  check('có entry Catalog ở sidebar', /Catalog|Danh mục/.test(body));
  check('không dính lỗi 500/Not found', !/500|Internal server error|not found/i.test(body));
  const cards = await seller.locator('a[href^="/portal/catalog/"]').count();
  check('render được thẻ sản phẩm', cards > 0, `${cards} thẻ`);
  const tabs = await seller.evaluate(() => document.body.innerText.match(/3D\s+\d+/)?.[0] ?? '');
  check('tab dòng sản phẩm có số đếm', !!tabs, tabs);
});

await step('Chi tiết sản phẩm hiện SKU (điền file import)', async () => {
  const href = await seller.evaluate(() => document.querySelector('a[href^="/portal/catalog/"]')?.getAttribute('href'));
  await seller.goto(BASE + href, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await seller.waitForTimeout(4000);
  const body = await seller.evaluate(() => document.body.innerText);
  check('có bảng biến thể kèm cột SKU', /SKU/.test(body));
  check('có ít nhất 1 mã SKU thật', /[A-Z0-9]{3,}-[A-Z0-9]/.test(body));
  check('không lộ giá vốn', !/giá vốn|\bcost\b/i.test(body));
});

await step(`Đặt đơn dịch vụ ${LINE}`, async () => {
  await seller.goto(`${BASE}/portal/orders/${LINE}/create`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await seller.waitForTimeout(5000);
  const picker = await seller.locator('button:has-text("variations"), [class*="card"]').count();
  check('màn đặt đơn có bộ chọn sản phẩm', picker > 0, `${picker} phần tử`);
  const body = await seller.evaluate(() => document.body.innerText);
  check('có ô địa chỉ giao', /ADDRESS|Địa chỉ/i.test(body));
});

await step(`Danh sách đơn dịch vụ ${LINE}`, async () => {
  await seller.goto(`${BASE}/portal/orders/${LINE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await seller.waitForTimeout(5000);
  const body = await seller.evaluate(() => document.body.innerText);
  check('có thẻ số tổng đơn', /TOTAL ORDERS|TỔNG ĐƠN/i.test(body));
  check('có pill trạng thái', /Pending|Chờ/i.test(body));
  const th = await seller.locator('thead th').count();
  check('bảng có tiêu đề cột', th > 3, `${th} cột`);
  const sticky = await isSticky(seller, 'thead th:nth-child(2)');
  check('cột mã đơn của seller vẫn cố định', sticky?.position === 'sticky', JSON.stringify(sticky));
});

await step('Trang import CSV có lối tra SKU', async () => {
  await seller.goto(`${BASE}/portal/orders/${LINE}/import`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await seller.waitForTimeout(4000);
  const body = await seller.evaluate(() => document.body.innerText);
  check('có nút tra SKU', /Look up SKU|Tra SKU/i.test(body));
  check('có nút tải template', /template/i.test(body));
});

// ─────────────────────────────────────────────────────────── HUB
const hubCtx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const hub = await hubCtx.newPage();

await step('Hub đăng nhập', async () => {
  const res = await hub.request.post(`${BASE}/api/hub/auth/login`, { data: STAFF });
  check('POST /api/hub/auth/login trả 200', res.status() === 200, `status ${res.status()}`);
});

await step('Hub — danh sách đơn mọi seller', async () => {
  await hub.goto(`${BASE}/hub/orders`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await hub.waitForTimeout(7000);
  const body = await hub.evaluate(() => document.body.innerText);
  check('có thẻ số + pill trạng thái', /TOTAL ORDERS|TỔNG ĐƠN/i.test(body) && /Pending|Chờ/i.test(body));
  const rows = await hub.locator('tbody tr').count();
  check('có dòng đơn', rows > 0, `${rows} dòng`);
  // Hai cột đầu PHẢI cùng dính — đây chính là chỗ đã hỏng 08/09/2026.
  const pick = await isSticky(hub, 'thead th:nth-child(1)');
  const order = await isSticky(hub, 'thead th:nth-child(2)');
  check('cột tick cố định ở mép trái', pick?.position === 'sticky' && pick?.left === '0px', JSON.stringify(pick));
  check('cột MÃ ĐƠN vẫn cố định (không bị cột tick đẩy đi)', order?.position === 'sticky' && order?.left !== 'auto', JSON.stringify(order));
  const heads = await hub.evaluate(() => Array.from(document.querySelectorAll('thead th')).map((th) => th.innerText.trim()));
  check('vẫn còn cột Nội bộ', heads.some((h) => /INTERNAL|NỘI BỘ/i.test(h)), heads.join('|'));
  check('có cột vận đơn', heads.some((h) => /TRACK|VẬN ĐƠN/i.test(h)), heads.join('|'));
});

await step('Hub — mua vận đơn', async () => {
  const buyBtn = await hub.locator('tbody button:has-text("Buy label"), tbody button:has-text("Mua label")').count();
  const tracked = await hub.evaluate(() => /\d{10,}/.test(document.body.innerText));
  check('có nút mua label hoặc đơn đã có mã vận đơn', buyBtn > 0 || tracked, `nút: ${buyBtn}`);
  const boxes = await hub.locator('tbody input[type=checkbox]').count();
  if (boxes > 0) {
    await hub.locator('tbody input[type=checkbox]').first().check();
    await hub.waitForTimeout(1200);
    const body = await hub.evaluate(() => document.body.innerText);
    check('chọn đơn hiện thanh mua hàng loạt', /selected|Đã chọn/i.test(body));
  } else {
    check('có ô tick để mua hàng loạt', false, 'không thấy ô tick nào');
  }
});

await step('Hub — trang Vận hành sản xuất', async () => {
  await hub.goto(`${BASE}/hub/operations`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await hub.waitForTimeout(7000);
  const body = await hub.evaluate(() => document.body.innerText);
  check('có phễu 8 chặng', /8-stage funnel|Phễu 8 chặng/i.test(body));
  check('có bảng trạng thái từng đơn', /Production status per order|Trạng thái sản xuất/i.test(body));
  check('có bộ lọc ngày dạng pill', /All time|Mọi thời gian/i.test(body) && /This month|Tháng này/i.test(body));
});

await step('Hub — danh sách seller', async () => {
  await hub.goto(`${BASE}/hub/sellers`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await hub.waitForTimeout(6000);
  const rows = await hub.locator('tbody tr').count();
  check('liệt kê được seller', rows > 0, `${rows} dòng`);
});

await browser.close();

console.log('\n────────────────────────────────');
console.log(`Tổng: ${results.length} kiểm tra · ${results.length - failed} đạt · ${failed} hỏng`);
if (failed > 0) {
  console.log('\nHỏng:');
  for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
}
process.exit(failed > 0 ? 1 : 0);
