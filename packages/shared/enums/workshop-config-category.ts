export enum WorkshopConfigCategory {
  PrintStatus = 'print_status',
  PrintStatusNote = 'print_status_note',
  ToolResult = 'tool_result',
  ToolResultNote = 'tool_result_note',
  ErrorFileType = 'error_file_type',
  Assignee = 'assignee',
  AssigneeNote = 'assignee_note',
  FabricType = 'fabric_type',
  ProductionError = 'production_error',
}

export const WORKSHOP_CONFIG_CATEGORIES = Object.values(WorkshopConfigCategory);

export type WorkshopConfigDisplayMode = 'color' | 'icon';

export const WORKSHOP_CONFIG_MODE: Record<WorkshopConfigCategory, WorkshopConfigDisplayMode> = {
  [WorkshopConfigCategory.PrintStatus]: 'color',
  [WorkshopConfigCategory.PrintStatusNote]: 'icon',
  [WorkshopConfigCategory.ToolResult]: 'icon',
  [WorkshopConfigCategory.ToolResultNote]: 'color',
  [WorkshopConfigCategory.ErrorFileType]: 'icon',
  [WorkshopConfigCategory.Assignee]: 'icon',
  [WorkshopConfigCategory.AssigneeNote]: 'icon',
  [WorkshopConfigCategory.FabricType]: 'icon',
  [WorkshopConfigCategory.ProductionError]: 'color',
};
