import assert from "node:assert/strict";

// Only plugged into the loopback CMS fixture; no production credentials or writes.
export function createTradeExchangeFixture() {
  const state = {
    enabled: false,
    products: [],
    leads: [],
    reads: [],
    expired: false,
    failCatalog: false,
  };
  function handle(req, res, url) {
    if (!state.enabled) return false;
    if (url.pathname === "/items/leads" && req.method === "POST") {
      let body = "";
      req.on("data", (part) => (body += part));
      req.on("end", () => {
        state.leads.push(JSON.parse(body));
        res.end(JSON.stringify({ data: { id: "local-lead" } }));
      });
      return true;
    }
    if (req.method !== "GET") return false;
    if (url.pathname === "/items/products") {
      state.reads.push(url);
      if (state.failCatalog) {
        res.writeHead(503);
        res.end("{}");
        return true;
      }
      const id = url.searchParams.get("filter[id][_eq]");
      const offset = Number(url.searchParams.get("offset") || 0),
        limit = Number(url.searchParams.get("limit") || 48);
      const data = state.products
        .filter(
          (p) =>
            (!id || p.id === id) &&
            p.status === "published" &&
            p.content_status === "ready" &&
            p.stock_quantity > 0 &&
            p.stock_status !== "hidden",
        )
        .slice(offset, offset + limit);
      res.end(JSON.stringify({ data }));
      return true;
    }
    if (url.pathname.startsWith("/items/trade_quotes/")) {
      res.end(
        JSON.stringify({
          data: {
            id: "quote-exchange-local",
            status: "active",
            valid_until: state.expired ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
            range_min: 35000,
            range_max: 40000,
            is_test: false,
            device_config: {
              id: "config-0",
              storage: "128 ГБ",
              device_model: { id: "iphone-13-pro", name: "iPhone 13 Pro" },
            },
            pricing_version: { version: "test-v3" },
          },
        }),
      );
      return true;
    }
    if (url.pathname === "/items/leads") {
      res.end(
        JSON.stringify({
          data: state.leads.filter(
            (l) => l.idempotency_key === url.searchParams.get("filter[idempotency_key][_eq]"),
          ),
        }),
      );
      return true;
    }
    return false;
  }
  return { state, handle };
}

export async function tradeExchangeApiCases(base, fixture) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const state = fixture.state;
  state.enabled = true;
  state.products = Array.from({ length: 17 }, (_, i) => ({
    id: `exchange-product-${i}`,
    title: `Local exchange ${i}`,
    product_type: "device",
    status: "published",
    content_status: "ready",
    stock_status: "available",
    stock_quantity: 1,
    offers: [
      {
        id: `exchange-offer-${String(i).padStart(2, "0")}`,
        product: `exchange-product-${i}`,
        status: "published",
        stock_status: "available",
        stock_quantity: 1,
        price: 45000 + i * 1000,
        pickup_enabled: true,
        location: {
          id: "store-test",
          slug: "belgorod",
          status: "published",
          name: "Тестовый магазин",
          city: "Белгород",
          pickup_enabled: true,
        },
      },
    ],
  }));
  const endpoint =
    base + "/api/trade/exchange?quote_id=quote-exchange-local&store_location_id=store-test";
  const get = async (url) => {
    const r = await fetch(url);
    return { status: r.status, body: await r.json() };
  };
  try {
    const first = await get(endpoint);
    assert.equal(first.status, 200);
    assert.equal(first.body.total, 17);
    assert.equal(first.body.offers.length, 12);
    const second = await get(endpoint + "&cursor=" + first.body.nextCursor);
    assert.equal(second.body.offers.length, 5);
    assert.equal(second.body.nextCursor, null);
    assert.equal(
      new Set([...first.body.offers, ...second.body.offers].map((o) => o.offerId)).size,
      17,
    );
    for (const cursor of ["bad!", "x".repeat(1025), ""]) {
      const invalid = await get(endpoint + "&cursor=" + encodeURIComponent(cursor));
      assert.equal(invalid.status, 400);
      assert.equal(invalid.body.error, "validation_error");
    }
    assert.equal((await get(endpoint.replace("store-test", "unknown"))).status, 400);
    state.expired = true;
    state.reads = [];
    assert.equal(
      (await get(endpoint + "&cursor=" + first.body.nextCursor)).body.error,
      "quote_expired",
    );
    assert.equal(state.reads.length, 0, "expired quote must not load catalog");
    state.expired = false;
    const last = second.body.offers.at(-1);
    const body = {
      kind: "trade",
      scenario: "exchange",
      quote_id: "quote-exchange-local",
      target_product_id: last.productId,
      target_offer_id: last.offerId,
      store_location_id: "store-test",
      contact: "+79990000000",
      contact_channel: "phone",
      trade_consent_accepted: true,
      trade_consent_version: "test-consent",
      source: "/trade",
      idempotency_key: "local-exchange-success",
    };
    const post = async (data) => {
      const r = await fetch(base + "/lead-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    };
    state.reads = [];
    assert.equal((await post(body)).ok, true, "second-page offer must submit");
    assert.equal(state.leads.length, 1);
    assert.equal(state.leads[0].target_offer_id, last.offerId);
    assert(
      state.reads.length > 0 &&
        state.reads.every((u) => u.searchParams.get("filter[id][_eq]") === last.productId),
      "validation must query only selected product",
    );
    assert.equal((await post(body)).ok, true);
    assert.equal(state.leads.length, 1, "idempotent replay");
    state.products[16].offers[0].stock_quantity = 0;
    assert.equal(
      (await post({ ...body, idempotency_key: "local-exchange-sold" })).error,
      "product_unavailable",
      "fresh stock, not cached list",
    );
    state.products[16].offers[0].stock_quantity = 1;
    state.products[16].content_status = "draft";
    assert.equal(
      (await post({ ...body, idempotency_key: "local-exchange-unpublished" })).error,
      "product_unavailable",
    );
    assert.equal(state.leads.length, 1, "unavailable selections never write leads");
    state.failCatalog = true;
    assert.equal(
      (await get(endpoint)).body.error,
      "pricing_unavailable",
      "network failure is not an empty catalog",
    );
    state.failCatalog = false;
    state.products = [];
    assert.deepEqual((await get(endpoint)).body, {
      ok: true,
      offers: [],
      total: 0,
      nextCursor: null,
    });
    console.log(
      "Exchange API: 12+5, invalid cursor/store, expiry, second-page lead, idempotency, fresh stock/publication, outage and empty catalog OK",
    );
  } finally {
    state.enabled = false;
  }
}
