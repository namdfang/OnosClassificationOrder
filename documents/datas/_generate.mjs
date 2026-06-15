import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = join(__dirname, 'datamau.csv');
const outputPath = join(__dirname, 'paste_from_excel.csv');

const SIZES_ORDER = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'XXXXXL'];
const PRINT_SIDES = ['Blank', 'Front', 'Back', '2 Side'];
const SHIPPING_METHODS = ['Ship By Label', 'Ship By Seller'];
const TYPE_PRINTS = ['dtg', 'dtf'];
const PROVIDER_ID = 'Q3RAIR07ZDH7DCLZ';

const HEADERS = [
  'key',
  'price',
  'providerPrice',
  'weight',
  'shippingFee',
  'extraItemFee',
  'sku',
  'Color',
  'Size',
  'Print Side',
  'Shipping Method',
  'Type Print',
  '_id',
  'productId',
  'providerId',
  'code',
  'options',
];

function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split(','));
}

function isSkuLike(value) {
  if (!value) return false;
  const parts = value.split('-');
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1].trim().toUpperCase();
  return SIZES_ORDER.includes(last);
}

function extractSizeFromSku(value) {
  const parts = value.split('-');
  return parts[parts.length - 1].trim().toUpperCase();
}

function collectColumn(rows, colIndex) {
  const items = [];
  let currentColor = null;

  for (const row of rows) {
    const cell = (row[colIndex] || '').trim();
    if (!cell) continue;

    if (isSkuLike(cell)) {
      if (!currentColor) continue;
      const size = extractSizeFromSku(cell);
      items.push({ color: currentColor, size, sku: cell });
    } else {
      currentColor = cell;
    }
  }

  return items;
}

function escapeCsv(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function main() {
  const raw = readFileSync(inputPath, 'utf8');
  const rows = parseCsv(raw);

  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const allEntries = [];
  for (let c = 0; c < columnCount; c++) {
    allEntries.push(...collectColumn(rows, c));
  }

  const output = [HEADERS.join(',')];

  for (const { color, size, sku } of allEntries) {
    for (const printSide of PRINT_SIDES) {
      for (const shippingMethod of SHIPPING_METHODS) {
        for (const typePrint of TYPE_PRINTS) {
          const row = [
            '',
            1,
            1,
            0,
            0,
            0,
            sku,
            color,
            size,
            printSide,
            shippingMethod,
            typePrint,
            '',
            '',
            PROVIDER_ID,
            '',
            '',
          ];
          output.push(row.map(escapeCsv).join(','));
        }
      }
    }
  }

  writeFileSync(outputPath, output.join('\n'), 'utf8');
  console.log(`Generated ${output.length - 1} rows from ${allEntries.length} color/size pairs.`);
  console.log(`Output: ${outputPath}`);
}

main();
