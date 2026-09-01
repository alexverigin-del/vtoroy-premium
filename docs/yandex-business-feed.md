# Yandex Business product feed

ISVOI exposes the accepted YML product format at:

```text
https://isvoi.ru/integrations/yandex-business/feed.yml
```

The endpoint reads Catalog V3 from Directus on every request and uses a
five-minute shared cache. It does not expose purchase cost, margin, full
serial/IMEI, inventory notes or private diagnostic certificates.

## Initial scope

The automated feed intentionally matches the price list accepted on
2026-09-01:

- published Catalog V3 devices only;
- `content_status = ready`;
- used smartphones in the Apple or Samsung categories;
- positive product stock;
- a published, available Belgorod offer with positive stock and price;
- a public listing image;
- stable product ID and tracked product URL.

The Yandex categories are stable and match the accepted upload:

- `101` - `iPhone с пробегом`;
- `102` - `Samsung Galaxy с пробегом`.

Other brands and product categories stay out of the feed until a checked
category is added deliberately and accepted by Yandex Business.

## Enable and verify

Keep the endpoint closed until the release is deployed and checked:

```dotenv
YANDEX_BUSINESS_FEED_ENABLED=1
```

Then verify it before replacing the manual XLSX source in Yandex Business:

```bash
curl -fsS -D /tmp/isvoi-yandex-business.headers \
  https://isvoi.ru/integrations/yandex-business/feed.yml \
  -o /tmp/isvoi-yandex-business.yml
head -n 1 /tmp/isvoi-yandex-business.yml
grep -c '<offer id=' /tmp/isvoi-yandex-business.yml
```

Expected response headers include `Content-Type: application/xml`,
`X-Robots-Tag: noindex, nofollow` and a five-minute shared cache. If Directus
fails or no eligible offers remain, the endpoint returns an error instead of
silently replacing the accepted price list with an accidental empty feed.

After validation, select the feed-by-link option in Yandex Business and enter
the endpoint URL. A new price list replaces the previous one, so do not switch
the source until the offer count and prices match the accepted XLSX.
