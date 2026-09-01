# Site integrations editor guide

The integration registry connects reviewed analytics, chat and support scripts
to the public Next.js site. It is not a general HTML injection surface.

## Safe workflow

1. Open `Интеграции сайта` and create or duplicate a draft.
2. Choose the consent category before adding provider settings.
3. Leave hostnames empty for every host, or enter exact names such as
   `isvoi.ru` and `club.isvoi.ru` without protocol.
4. Use route prefixes such as `/catalog`; `/catalogue` does not match
   `/catalog`. Exclusions override inclusions.
5. Verify the privacy page and consent dialog copy.
6. Publish only after local/browser QA. To disable a service, return it to
   `draft` or archive it instead of deleting history.

## Yandex Metrika

The seeded row is a disabled draft and contains no real counter ID. Fill
`provider_settings.counterId` with digits and review the optional flags:

```json
{
  "counterId": "12345678",
  "webvisor": false,
  "clickmap": true,
  "trackLinks": true,
  "accurateTrackBounce": true
}
```

The site initializes Metrika with `defer`, sends one `hit` for each allowed
Next.js route and calls `destruct` when the route or consent no longer permits
the counter. There is intentionally no `noscript` tracking pixel because it
cannot respect an interactive consent choice.

## Custom JavaScript

Only Administrator and `ISVOI Advanced Editor` may access executable custom
fields. Use an absolute HTTPS `script_url`, `bootstrap_code`, or both. Do not
paste `<script>`, `<iframe>` or other HTML wrappers.

When include/exclude paths are present, `cleanup_code` is mandatory. It must
remove globals, event listeners and widget DOM created by the provider. Consent
revocation reloads the document after saving so a previously active service is
fully stopped.

Custom code has the same browser authority as application JavaScript. Review
the vendor, data destination and exact snippet before publication.

## Consent settings

`Согласие на интеграции` is a singleton. The visitor choice is stored in the
first-party `isvoi_integrations_consent_v1` cookie for 180 days by default and
is shared across `*.isvoi.ru`. It contains only the consent version, timestamp
and three booleans for analytics, marketing and support.

Change `version` only when existing choices must be requested again. Keep the
canonical policy route in `Настройки сайта` → `privacy_url`.

## Setup and verification

```bash
npm run directus:setup:site-integrations
npm run directus:setup:site-content-revalidation
npm run directus:setup:public-permissions
npm run directus:setup:technical-permissions
npm run directus:setup:admin-guardrails
npm run directus:audit-site-integrations
npm run directus:audit-api-policy
```

After applying schema/permissions, restart Directus, wait for health, clear the
permission cache if necessary, revalidate site content and export the sanitized
production schema snapshot. A production apply requires a verified PostgreSQL
and uploads backup and separate release authorization.
