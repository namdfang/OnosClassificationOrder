import { WorkshopConfigCategory } from 'shared';

export type WorkshopConfigSeed = {
  category: WorkshopConfigCategory;
  code: string;
  name: string;
  color?: string;
  icon?: string;
  order: number;
  errorSource?: 'designer' | 'factory';
};

export const WORKSHOP_CONFIG_SEED: WorkshopConfigSeed[] = [
  // print_status (color badge)
  { category: WorkshopConfigCategory.PrintStatus, code: 'not-printed', name: 'Chưa in', color: '#9CA3AF', order: 0 },
  { category: WorkshopConfigCategory.PrintStatus, code: 'machine-1', name: 'Đã in (máy 1)', color: '#3B82F6', order: 1 },
  { category: WorkshopConfigCategory.PrintStatus, code: 'machine-2', name: 'Đã in (máy 2)', color: '#10B981', order: 2 },
  { category: WorkshopConfigCategory.PrintStatus, code: 'machine-3', name: 'Đã in (máy 3)', color: '#F59E0B', order: 3 },
  { category: WorkshopConfigCategory.PrintStatus, code: 'machine-4', name: 'Đã in (máy 4)', color: '#8B5CF6', order: 4 },
  { category: WorkshopConfigCategory.PrintStatus, code: 'machine-94', name: 'Đã in máy 94', color: '#EC4899', order: 5 },

  // print_status_note (icon)
  { category: WorkshopConfigCategory.PrintStatusNote, code: 'printed-1', name: 'Đã in lần 1', icon: 'Hash', order: 0 },
  { category: WorkshopConfigCategory.PrintStatusNote, code: 'printed-2', name: 'Đã in lần 2', icon: 'Hash', order: 1 },
  { category: WorkshopConfigCategory.PrintStatusNote, code: 'printed-3', name: 'Đã in lần 3', icon: 'Hash', order: 2 },
  { category: WorkshopConfigCategory.PrintStatusNote, code: 'printed-4', name: 'Đã in lần 4', icon: 'Hash', order: 3 },
  { category: WorkshopConfigCategory.PrintStatusNote, code: 'not-printed', name: 'Chưa in', icon: 'Minus', order: 4 },

  // tool_result (icon)
  { category: WorkshopConfigCategory.ToolResult, code: 'has-tool', name: 'Có Tool', icon: 'Wrench', order: 0 },
  { category: WorkshopConfigCategory.ToolResult, code: 'no-tool', name: 'Không có Tool', icon: 'Ban', order: 1 },

  // tool_result_note (color badge)
  { category: WorkshopConfigCategory.ToolResultNote, code: 'no-tool', name: 'Không có tool', color: '#9CA3AF', order: 0 },
  { category: WorkshopConfigCategory.ToolResultNote, code: 'error', name: 'Lỗi', color: '#EF4444', order: 1 },
  { category: WorkshopConfigCategory.ToolResultNote, code: 'ok', name: 'Ok', color: '#10B981', order: 2 },
  { category: WorkshopConfigCategory.ToolResultNote, code: 'no-pdf', name: 'Không có file PDF', color: '#F59E0B', order: 3 },

  // error_file_type (icon)
  { category: WorkshopConfigCategory.ErrorFileType, code: 'mismatch', name: 'Không khớp', icon: 'AlertCircle', order: 0 },
  { category: WorkshopConfigCategory.ErrorFileType, code: 'front', name: 'Thân trước', icon: 'Shirt', order: 1 },
  { category: WorkshopConfigCategory.ErrorFileType, code: 'back', name: 'Thân sau', icon: 'Shirt', order: 2 },
  { category: WorkshopConfigCategory.ErrorFileType, code: 'column', name: 'Trụ', icon: 'AlignVerticalJustifyCenter', order: 3 },
  { category: WorkshopConfigCategory.ErrorFileType, code: 'sleeves', name: '2 tay', icon: 'ArrowLeftRight', order: 4 },
  { category: WorkshopConfigCategory.ErrorFileType, code: 'placket', name: 'Nẹp áo', icon: 'Rows', order: 5 },
  { category: WorkshopConfigCategory.ErrorFileType, code: 'collar', name: 'Cổ viền', icon: 'CircleDot', order: 6 },
  { category: WorkshopConfigCategory.ErrorFileType, code: 'stamp', name: 'Dấu', icon: 'Stamp', order: 7 },
  { category: WorkshopConfigCategory.ErrorFileType, code: 'pants', name: 'Quần', icon: 'PersonStanding', order: 8 },
  { category: WorkshopConfigCategory.ErrorFileType, code: 'no-sleeve-hem', name: 'Không may viền tay áo', icon: 'Scissors', order: 9 },
  { category: WorkshopConfigCategory.ErrorFileType, code: 'ask-designer', name: 'Hỏi des khách', icon: 'MessageCircleQuestion', order: 10 },
  { category: WorkshopConfigCategory.ErrorFileType, code: 'temp', name: 'Temp', icon: 'Clock', order: 11 },

  // assignee_note (icon)
  { category: WorkshopConfigCategory.AssigneeNote, code: 'no-tool', name: 'Không có tool', icon: 'Ban', order: 0 },
  { category: WorkshopConfigCategory.AssigneeNote, code: 'error', name: 'Lỗi', icon: 'XCircle', order: 1 },
  { category: WorkshopConfigCategory.AssigneeNote, code: 'ok', name: 'Ok', icon: 'CheckCircle', order: 2 },

  // production_error (color badge) — xưởng báo lý do lỗi đơn hàng.
  // `errorSource='designer'` → đơn auto chuyển designerStatus='rework' khi
  // xưởng set code này. `'factory'` chỉ ghi stats.
  { category: WorkshopConfigCategory.ProductionError, code: 'wrong-size', name: 'Sai size', color: '#EF4444', order: 0, errorSource: 'factory' },
  { category: WorkshopConfigCategory.ProductionError, code: 'wrong-color', name: 'Sai màu', color: '#F97316', order: 1, errorSource: 'factory' },
  { category: WorkshopConfigCategory.ProductionError, code: 'wrong-fabric', name: 'Sai loại vải', color: '#F59E0B', order: 2, errorSource: 'factory' },
  { category: WorkshopConfigCategory.ProductionError, code: 'print-misalign', name: 'In lệch', color: '#DC2626', order: 3, errorSource: 'factory' },
  { category: WorkshopConfigCategory.ProductionError, code: 'print-blur', name: 'In mờ/nhòe', color: '#B91C1C', order: 4, errorSource: 'factory' },
  { category: WorkshopConfigCategory.ProductionError, code: 'fabric-damage', name: 'Vải lỗi/rách', color: '#A855F7', order: 5, errorSource: 'factory' },
  { category: WorkshopConfigCategory.ProductionError, code: 'wrong-design', name: 'Sai design', color: '#7C3AED', order: 6, errorSource: 'designer' },
  { category: WorkshopConfigCategory.ProductionError, code: 'missing-design', name: 'Thiếu file design', color: '#9333EA', order: 7, errorSource: 'designer' },
  { category: WorkshopConfigCategory.ProductionError, code: 'machine-jam', name: 'Máy lỗi/kẹt', color: '#0EA5E9', order: 8, errorSource: 'factory' },
  { category: WorkshopConfigCategory.ProductionError, code: 'other', name: 'Lỗi khác', color: '#64748B', order: 9, errorSource: 'factory' },

  // fabric_type (icon) — full list of fabrics / blanks used in production
  { category: WorkshopConfigCategory.FabricType, code: 'poly-2-da', name: 'POLY 2 DA', icon: 'Shirt', order: 0 },
  { category: WorkshopConfigCategory.FabricType, code: 'me-64', name: 'MÈ 64', icon: 'Shirt', order: 1 },
  { category: WorkshopConfigCategory.FabricType, code: 'lua-4b', name: 'LỤA 4B', icon: 'Shirt', order: 2 },
  { category: WorkshopConfigCategory.FabricType, code: 'lua-van-go', name: 'LỤA VÂN GỖ', icon: 'Shirt', order: 3 },
  { category: WorkshopConfigCategory.FabricType, code: 'thun-lanh', name: 'THUN LẠNH', icon: 'Shirt', order: 4 },
  { category: WorkshopConfigCategory.FabricType, code: 'ni-bong', name: 'NỈ BÔNG', icon: 'Shirt', order: 5 },
  { category: WorkshopConfigCategory.FabricType, code: 'me-caro', name: 'MÈ CARO', icon: 'Shirt', order: 6 },
  { category: WorkshopConfigCategory.FabricType, code: 'lua-ngoc-trai', name: 'LỤA NGỌC TRAI', icon: 'Shirt', order: 7 },
  { category: WorkshopConfigCategory.FabricType, code: 'luoi', name: 'LƯỚI', icon: 'Shirt', order: 8 },
  { category: WorkshopConfigCategory.FabricType, code: 'tho-moc', name: 'THÔ MỘC', icon: 'Shirt', order: 9 },
  { category: WorkshopConfigCategory.FabricType, code: 'lua', name: 'LỤA', icon: 'Shirt', order: 10 },
  { category: WorkshopConfigCategory.FabricType, code: 'canvas', name: 'CANVAS', icon: 'Shirt', order: 11 },
  { category: WorkshopConfigCategory.FabricType, code: 'thun-bot', name: 'THUN BỘT', icon: 'Shirt', order: 12 },
  { category: WorkshopConfigCategory.FabricType, code: 'phi-bong', name: 'PHI BÓNG', icon: 'Shirt', order: 13 },
  { category: WorkshopConfigCategory.FabricType, code: '60-cotton-40-poly', name: '60% COTTON 40% POLY', icon: 'Shirt', order: 14 },
  { category: WorkshopConfigCategory.FabricType, code: 'long-chan', name: 'LÔNG- CHĂN', icon: 'Shirt', order: 15 },
  { category: WorkshopConfigCategory.FabricType, code: 'ao-lua-4b-quan-me-caro', name: 'ÁO: LỤA 4B- QUẦN: MÈ CARO', icon: 'Shirt', order: 16 },
  { category: WorkshopConfigCategory.FabricType, code: 'vai-me-moi', name: 'VẢI MÈ MỚI', icon: 'Shirt', order: 17 },
  { category: WorkshopConfigCategory.FabricType, code: 'mix-vai-luoi', name: 'MIX VẢI + LƯỚI', icon: 'Shirt', order: 18 },
  { category: WorkshopConfigCategory.FabricType, code: 'me-ca-sau', name: 'MÈ CA SẤU', icon: 'Shirt', order: 19 },
  { category: WorkshopConfigCategory.FabricType, code: 'theu', name: 'THÊU', icon: 'Shirt', order: 20 },
  { category: WorkshopConfigCategory.FabricType, code: 'gia-len', name: 'GIẢ LEN', icon: 'Shirt', order: 21 },

  // machine (color badge) — physical printer machines in the workshop
  { category: WorkshopConfigCategory.Machine, code: 'machine-94', name: '94', color: '#3B82F6', order: 0 },
  { category: WorkshopConfigCategory.Machine, code: 'machine-27', name: '27', color: '#10B981', order: 1 },
  { category: WorkshopConfigCategory.Machine, code: 'machine-56', name: '56', color: '#F59E0B', order: 2 },
];
