import type {
  ProductCardData,
  TradeExchangeOffer,
  TradeExchangePage,
  TradeQuoteRange,
} from "@vtoroy/shared";

export const TRADE_EXCHANGE_PAGE_SIZE = 12;

export function tradeExchangeOffer(
  product: ProductCardData,
  storeId: string | undefined,
  range: TradeQuoteRange,
  offerId?: string,
): TradeExchangeOffer | undefined {
  const available = product.offers.filter(
    (offer) =>
      offer.status === "published" &&
      offer.stockStatus === "available" &&
      offer.stockQuantity > 0 &&
      offer.location.status === "published" &&
      Number.isFinite(offer.price) &&
      offer.price >= 0 &&
      ((offer.location.id === storeId && offer.pickupEnabled && offer.location.pickupEnabled) ||
        (offer.location.id !== storeId &&
          offer.intercityDeliveryEnabled &&
          offer.location.intercityDeliveryEnabled)),
  );
  const selected = offerId
    ? available.find((offer) => offer.id === offerId)
    : (available.find((offer) => offer.location.id === storeId) ?? available[0]);
  if (!selected) return undefined;
  return {
    productId: product.id,
    offerId: selected.id,
    title: product.title,
    detailHref: product.detailHref,
    image: product.listingImage || undefined,
    imageAlt: product.listingAlt || product.title,
    price: selected.price,
    priceText: selected.priceText,
    location: {
      id: selected.location.id,
      slug: selected.location.slug,
      name: selected.location.name,
      city: selected.location.city,
    },
    fulfillment: selected.location.id === storeId ? "pickup" : "intercity_delivery",
    deliveryEstimate: selected.deliveryEstimate,
    topUpRange: {
      from: Math.max(0, selected.price - range.max),
      to: Math.max(0, selected.price - range.min),
    },
  };
}

type Position = [number, number, string];
const position = (offer: TradeExchangeOffer): Position => [
  Number(offer.fulfillment !== "pickup"),
  offer.price,
  offer.offerId,
];
const compare = (a: Position, b: Position) =>
  a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);

// Price order is also top-up order for a fixed quote. Unique offer IDs break price ties.
export function tradeExchangePage(
  offers: TradeExchangeOffer[],
  scope: string,
  cursor?: string,
): TradeExchangePage {
  let after: Position | undefined;
  if (cursor) {
    try {
      if (cursor.length > 1024 || !/^[\w-]+$/.test(cursor)) throw new Error();
      const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (
        parsed.scope !== scope ||
        !Array.isArray(parsed.after) ||
        parsed.after.length !== 3 ||
        ![0, 1].includes(parsed.after[0]) ||
        !Number.isFinite(parsed.after[1]) ||
        parsed.after[1] < 0 ||
        typeof parsed.after[2] !== "string" ||
        !parsed.after[2] ||
        parsed.after[2].length > 80
      )
        throw new Error();
      after = parsed.after;
    } catch {
      throw new RangeError("Invalid exchange cursor");
    }
  }
  const sorted = [...offers].sort((a, b) => compare(position(a), position(b)));
  const remaining = after ? sorted.filter((offer) => compare(position(offer), after!) > 0) : sorted;
  const page = remaining.slice(0, TRADE_EXCHANGE_PAGE_SIZE);
  return {
    offers: page,
    total: sorted.length,
    nextCursor:
      remaining.length > page.length
        ? Buffer.from(JSON.stringify({ scope, after: position(page[page.length - 1]) })).toString(
            "base64url",
          )
        : null,
  };
}
