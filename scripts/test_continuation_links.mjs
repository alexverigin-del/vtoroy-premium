import assert from "node:assert/strict";
import { continuationLinks } from "../apps/web/lib/continuation-links.ts";

const token = "a".repeat(43);
assert.deepEqual(
  continuationLinks([
    { platform: "telegram", label: " Telegram ", url: `https://t.me/isvoi_bot?start=${token}` },
    { platform: "max", label: "MAX", url: `https://max.ru/isvoi_bot?start=${token}` },
    { platform: "vk", label: "VK", url: `https://vk.me/isvoi?ref=${token}&ref_source=site` },
  ]),
  [
    { platform: "telegram", label: "Telegram", url: `https://t.me/isvoi_bot?start=${token}` },
    { platform: "max", label: "MAX", url: `https://max.ru/isvoi_bot?start=${token}` },
    { platform: "vk", label: "VK", url: `https://vk.me/isvoi?ref=${token}&ref_source=site` },
  ],
);

assert.deepEqual(
  continuationLinks([
    { platform: "telegram", label: "Подмена", url: `https://t.me.evil.test/x?start=${token}` },
    { platform: "max", label: "HTTP", url: `http://max.ru/x?start=${token}` },
    { platform: "vk", label: "Короткий ключ", url: "https://vk.me/isvoi?ref=short" },
    { platform: "email", label: "Почта", url: `https://example.test/?start=${token}` },
  ]),
  [],
);

console.log("Continuation links: platform hosts, HTTPS and one-time token format passed.");
