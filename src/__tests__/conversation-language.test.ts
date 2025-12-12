import {
  detectPreferredLanguage,
  joinByLanguage,
} from "../utils/language";

describe("conversation language helpers", () => {
  it("returns 'ar' when the message contains Arabic letters", () => {
    expect(detectPreferredLanguage("مرحبا، أحتاج حجز موعد")).toBe("ar");
  });

  it("returns 'en' when the message contains only Latin letters", () => {
    expect(detectPreferredLanguage("Hello, I need to book an appointment")).toBe(
      "en"
    );
  });

  it("joins missing fields using the appropriate punctuation for Arabic", () => {
    const fields = ["اسم الطبيب", "فرع العيادة", "وقت الموعد"];
    expect(joinByLanguage("ar", fields)).toBe(
      "اسم الطبيب، فرع العيادة، وقت الموعد"
    );
    expect(joinByLanguage("en", ["doctor", "branch", "time"])).toBe(
      "doctor, branch, time"
    );
  });
});

