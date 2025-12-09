import { sanitizeSensitiveText } from "../lib/security";

describe("sanitizeSensitiveText", () => {
  it("masks email addresses", () => {
    const input = "Contact me at user@example.com for details.";
    const result = sanitizeSensitiveText(input);
    expect(result).not.toContain("user@example.com");
    expect(result).toContain("***@***");
  });

  it("masks phone numbers", () => {
    const input = "My phone is +1 (555) 123-4567.";
    const result = sanitizeSensitiveText(input);
    expect(result).not.toContain("555");
    expect(result).toMatch(/\*\*\*-?\*\*\*-?\d{2}/);
  });

  it("removes basic SQL injection attempts", () => {
    const input = `Robert'); DROP TABLE appointments;--`;
    const result = sanitizeSensitiveText(input);
    expect(result).not.toMatch(/--/);
  });
});

