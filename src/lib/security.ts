const EMAIL_REGEX = /([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})/gi;
const PHONE_REGEX = /\b(\+?\d[\d\s().-]{7,})\b/g;
const CARD_REGEX = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;

export function sanitizeSensitiveText(value: string) {
  let sanitized = value;
  sanitized = sanitized.replace(EMAIL_REGEX, "***@***");
  sanitized = sanitized.replace(PHONE_REGEX, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 7) {
      return match;
    }
    const visible = digits.slice(-2);
    return `***-***-${visible}`;
  });
  sanitized = sanitized.replace(CARD_REGEX, "****-****-****-****");
  sanitized = sanitized.replace(/(['"`])[\s;]*--|(['"`])\s*or\s+1=1/gi, "$1");
  return sanitized;
}

export function sanitizeObject<T extends Record<string, unknown> | Array<unknown>>(
  value: T
): T {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") {
        return sanitizeSensitiveText(item);
      }
      if (item && typeof item === "object") {
        return sanitizeObject(item as Record<string, unknown>);
      }
      return item;
    }) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, val]) => {
    if (typeof val === "string") {
      result[key] = sanitizeSensitiveText(val);
    } else if (val && typeof val === "object") {
      result[key] = sanitizeObject(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  });
  return result as T;
}

