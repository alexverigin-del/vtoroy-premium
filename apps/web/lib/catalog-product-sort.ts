export function catalogProductSort(sort = "default"): string {
  if (sort === "price-asc") return "price,sort";
  if (sort === "price-desc") return "-price,sort";
  if (sort === "updated-desc") return "-updated_at,sort";
  return "stock_status,sort,-updated_at";
}
