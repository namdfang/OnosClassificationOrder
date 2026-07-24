export interface CategoryTreeItem {
  _id: string;
  parentId?: string;
}

/**
 * Sắp xếp danh mục dạng cây (`parentId` tự tham chiếu — xem `ProductCategory`
 * đa cấp độ) thành mảng phẳng theo thứ tự depth-first (cha trước con, con
 * ngay sau cha) kèm `depth` để FE render indent. Node mồ côi (`parentId` trỏ
 * tới id không tồn tại) rơi về depth 0 để không bị ẩn khỏi danh sách; vòng
 * lặp dữ liệu lỗi (nếu có) bị chặn qua `visited` — mỗi node chỉ render 1 lần.
 */
export function sortCategoryTree<T extends CategoryTreeItem>(items: T[]): Array<T & { depth: number }> {
  const ids = new Set(items.map((i) => i._id));
  const byParent = new Map<string, T[]>();
  for (const item of items) {
    const key = item.parentId && ids.has(item.parentId) ? item.parentId : '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(item);
  }

  const result: Array<T & { depth: number }> = [];
  const visited = new Set<string>();
  const visit = (parentKey: string, depth: number) => {
    for (const child of byParent.get(parentKey) || []) {
      if (visited.has(child._id)) continue;
      visited.add(child._id);
      result.push({ ...child, depth });
      visit(child._id, depth + 1);
    }
  };
  visit('__root__', 0);
  return result;
}
