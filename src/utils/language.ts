export const detectPreferredLanguage = (
  message: string
): "ar" | "en" => (/[\u0600-\u06FF]/.test(message) ? "ar" : "en");

export const joinByLanguage = (
  language: "ar" | "en",
  values: string[]
): string => (language === "ar" ? values.join("، ") : values.join(", "));

