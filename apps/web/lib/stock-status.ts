export function stockStatusLabel(status: string, quantity: number): string {
  if (status === "reserved") return "Бронь";
  if (status === "sold") return "Продано";
  if (quantity <= 0) return "Нет в наличии";
  return "В наличии";
}
