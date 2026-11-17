import { describe, it, expect } from "vitest";
import { weakPasswordMessage, passwordErrorToast } from "./weak-password";

const CHARS =
  "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()_+-=[]{};':\"|<>?,./`~.";

describe("weakPasswordMessage", () => {
  it("names the minimum length when the message has a number", () => {
    expect(
      weakPasswordMessage({
        reasons: ["length"],
        message: "Password should be at least 8 characters.",
      }),
    ).toBe("Password is too short. Use at least 8 characters.");
  });

  it("falls back for length without a number", () => {
    expect(weakPasswordMessage({ reasons: ["length"], message: "" })).toBe(
      "Password is too short. Use a longer one.",
    );
  });

  it("names parsed character classes", () => {
    expect(
      weakPasswordMessage({ reasons: ["characters"], message: CHARS }),
    ).toBe(
      "Password must include a lowercase letter, an uppercase letter, a number and a symbol.",
    );
    expect(
      weakPasswordMessage({
        reasons: ["characters"],
        message:
          "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, 0123456789.",
      }),
    ).toBe("Password must include a lowercase letter and a number.");
  });

  it("names all four classes for the full Supabase characters message", () => {
    expect(
      weakPasswordMessage({
        reasons: ["characters"],
        message:
          "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()_+-=[]{};':\"|<>?,./`~.",
      }),
    ).toBe(
      "Password must include a lowercase letter, an uppercase letter, a number and a symbol.",
    );
  });

  it("falls back when character classes are unparseable", () => {
    expect(weakPasswordMessage({ reasons: ["characters"], message: "" })).toBe(
      "Password needs a wider mix of characters, such as upper and lower case letters, numbers and symbols.",
    );
  });

  it("handles pwned", () => {
    expect(weakPasswordMessage({ reasons: ["pwned"] })).toBe(
      "This password has appeared in a data breach. Choose a different one.",
    );
  });

  it("joins several reasons with a space", () => {
    expect(
      weakPasswordMessage({
        reasons: ["length", "pwned"],
        message: "Password should be at least 8 characters.",
      }),
    ).toBe(
      "Password is too short. Use at least 8 characters. This password has appeared in a data breach. Choose a different one.",
    );
  });

  it("infers rules from the message when reasons are missing", () => {
    expect(
      weakPasswordMessage({
        reasons: [],
        message: "Password should be at least 6 characters.",
      }),
    ).toBe("Password is too short. Use at least 6 characters.");
    expect(weakPasswordMessage({ message: CHARS })).toContain(
      "Password must include",
    );
  });

  it("uses the generic copy when nothing is recognisable", () => {
    expect(weakPasswordMessage({ message: "nope" })).toBe(
      "That password is too weak. Choose a longer, less common one.",
    );
  });
});

describe("passwordErrorToast", () => {
  it("returns friendly copy for weak_password and the server message otherwise", () => {
    expect(
      passwordErrorToast({
        code: "weak_password",
        reasons: ["pwned"],
        message: "raw",
      }),
    ).toMatch(/data breach/);
    expect(passwordErrorToast({ code: "other", message: "x" })).toBe("x");
    expect(passwordErrorToast({ message: "y" })).toBe("y");
  });
});
