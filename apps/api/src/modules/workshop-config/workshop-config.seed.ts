import { WorkshopConfigCategory } from 'shared';

export type WorkshopConfigSeed = {
  category: WorkshopConfigCategory;
  code: string;
  name: string;
  color?: string;
  icon?: string;
  order: number;
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

  // assignee (icon)
  { category: WorkshopConfigCategory.Assignee, code: 'huy', name: 'Huy', icon: 'User', order: 0 },
  { category: WorkshopConfigCategory.Assignee, code: 'h-anh', name: 'H Anh', icon: 'User', order: 1 },
  { category: WorkshopConfigCategory.Assignee, code: 'an', name: 'An', icon: 'User', order: 2 },
  { category: WorkshopConfigCategory.Assignee, code: 'k-anh', name: 'K Anh', icon: 'User', order: 3 },
  { category: WorkshopConfigCategory.Assignee, code: 'hanh', name: 'Hạnh', icon: 'User', order: 4 },
  { category: WorkshopConfigCategory.Assignee, code: 'nga', name: 'Nga', icon: 'User', order: 5 },
  { category: WorkshopConfigCategory.Assignee, code: 'phuong-anh', name: 'Phương Anh', icon: 'User', order: 6 },
  { category: WorkshopConfigCategory.Assignee, code: 'huong', name: 'Hương', icon: 'User', order: 7 },

  // assignee_note (icon)
  { category: WorkshopConfigCategory.AssigneeNote, code: 'no-tool', name: 'Không có tool', icon: 'Ban', order: 0 },
  { category: WorkshopConfigCategory.AssigneeNote, code: 'error', name: 'Lỗi', icon: 'XCircle', order: 1 },
  { category: WorkshopConfigCategory.AssigneeNote, code: 'ok', name: 'Ok', icon: 'CheckCircle', order: 2 },

  // production_error (color badge) — xưởng báo lý do lỗi đơn hàng
  { category: WorkshopConfigCategory.ProductionError, code: 'wrong-size', name: 'Sai size', color: '#EF4444', order: 0 },
  { category: WorkshopConfigCategory.ProductionError, code: 'wrong-color', name: 'Sai màu', color: '#F97316', order: 1 },
  { category: WorkshopConfigCategory.ProductionError, code: 'wrong-fabric', name: 'Sai loại vải', color: '#F59E0B', order: 2 },
  { category: WorkshopConfigCategory.ProductionError, code: 'print-misalign', name: 'In lệch', color: '#DC2626', order: 3 },
  { category: WorkshopConfigCategory.ProductionError, code: 'print-blur', name: 'In mờ/nhòe', color: '#B91C1C', order: 4 },
  { category: WorkshopConfigCategory.ProductionError, code: 'fabric-damage', name: 'Vải lỗi/rách', color: '#A855F7', order: 5 },
  { category: WorkshopConfigCategory.ProductionError, code: 'wrong-design', name: 'Sai design', color: '#7C3AED', order: 6 },
  { category: WorkshopConfigCategory.ProductionError, code: 'missing-design', name: 'Thiếu file design', color: '#9333EA', order: 7 },
  { category: WorkshopConfigCategory.ProductionError, code: 'machine-jam', name: 'Máy lỗi/kẹt', color: '#0EA5E9', order: 8 },
  { category: WorkshopConfigCategory.ProductionError, code: 'other', name: 'Lỗi khác', color: '#64748B', order: 9 },

  // fabric_type (icon) — unique fabric / blank codes used in production
  { category: WorkshopConfigCategory.FabricType, code: 'cotton-jersey', name: 'Cotton Jersey', icon: 'Shirt', order: 0 },
  { category: WorkshopConfigCategory.FabricType, code: 'polyester-jersey', name: 'Polyester Jersey', icon: 'Shirt', order: 1 },
  { category: WorkshopConfigCategory.FabricType, code: '2d', name: '2D', icon: 'Layers', order: 2 },
  { category: WorkshopConfigCategory.FabricType, code: 'g5000', name: 'G5000', icon: 'Tag', order: 3 },
  { category: WorkshopConfigCategory.FabricType, code: 'g18500', name: 'G18500', icon: 'Tag', order: 4 },
  { category: WorkshopConfigCategory.FabricType, code: 'g18000', name: 'G18000', icon: 'Tag', order: 5 },
  { category: WorkshopConfigCategory.FabricType, code: 'c1717', name: 'C1717', icon: 'Tag', order: 6 },
];
