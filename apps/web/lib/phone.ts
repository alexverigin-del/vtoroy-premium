const PHONE_FORMAT = /^\+?[\d\s()-]+$/;

export function sanitizePhoneInput(value: string): string {
  const allowed = value.replace(/[^\d+()\-\s]/g, "");
  const trimmedStart = allowed.trimStart();
  const hasLeadingPlus = trimmedStart.startsWith("+");
  const withoutPluses = allowed.replace(/\+/g, "");
  return `${hasLeadingPlus ? "+" : ""}${withoutPluses.trimStart()}`.slice(0, 24);
}

export function isValidPhoneNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!PHONE_FORMAT.test(trimmed)) return false;
  const digitCount = trimmed.replace(/\D/g, "").length;
  return digitCount >= 10 && digitCount <= 15;
}
