export type ContinuationLink = {
  platform: "telegram" | "max" | "vk";
  label: string;
  url: string;
};

export function continuationLinks(value: unknown): ContinuationLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (
      candidate.platform !== "telegram" &&
      candidate.platform !== "max" &&
      candidate.platform !== "vk"
    )
      return [];
    if (
      typeof candidate.label !== "string" ||
      !candidate.label.trim() ||
      candidate.label.length > 80 ||
      typeof candidate.url !== "string"
    )
      return [];
    try {
      const url = new URL(candidate.url),
        expectedHost = { telegram: "t.me", max: "max.ru", vk: "vk.me" }[candidate.platform],
        parameter = candidate.platform === "vk" ? "ref" : "start";
      if (
        url.protocol !== "https:" ||
        url.hostname !== expectedHost ||
        !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get(parameter) || "")
      )
        return [];
      return [{ platform: candidate.platform, label: candidate.label.trim(), url: url.toString() }];
    } catch {
      return [];
    }
  });
}
