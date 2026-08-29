// Normalizes user-typed or GV-displayed numbers ("(555) 123-4567", "+1 555-123-4567") to E.164. US default.
export function normalizePhone(input: string, defaultCountryCode = "1"): string | null {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (hasPlus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith(defaultCountryCode)) return `+${digits}`;
  return null;
}

export function findPhoneNumber(text: string): string | null {
  const m = text.match(/\+?\d[\d\s().-]{8,}\d/);
  return m ? normalizePhone(m[0]) : null;
}
