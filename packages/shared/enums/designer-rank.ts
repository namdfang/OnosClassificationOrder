/**
 * Hạng hiệu suất designer (S cao nhất → D thấp nhất).
 *
 * Dùng cho 2 việc:
 * - Hạng THEO KỲ trong bảng "Xếp hạng hiệu suất" (tab Dashboard Designer) —
 *   tính từ điểm 0-100 của kỳ lọc.
 * - `UserEntity.designerLevel` — level CHÍNH THỨC admin set (có gợi ý từ
 *   điểm rolling 60 ngày), về sau dùng để gán task khó/dễ theo level sản phẩm.
 */
export enum DesignerRank {
  S = 'S',
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
}

export const DESIGNER_RANKS = Object.values(DesignerRank);

/** Ngưỡng điểm 0-100 → hạng: S≥85 · A≥70 · B≥55 · C≥40 · D<40. */
export function rankFromScore(score: number): DesignerRank {
  if (score >= 85) return DesignerRank.S;
  if (score >= 70) return DesignerRank.A;
  if (score >= 55) return DesignerRank.B;
  if (score >= 40) return DesignerRank.C;
  return DesignerRank.D;
}
