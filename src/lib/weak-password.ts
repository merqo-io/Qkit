export const PASSWORD_REQUIREMENTS_HINT =
  "Use at least 8 characters, with a lowercase letter, an uppercase letter, a number and a symbol.";

export type WeakPasswordInput = {
  reasons?: readonly string[];
  message?: string;
};

const GENERIC = "That password is too weak. Choose a longer, less common one.";

function lengthSentence(message: string): string {
  const n = /at least (\d+) characters/i.exec(message)?.[1];
  return n
    ? `Password is too short. Use at least ${n} characters.`
    : "Password is too short. Use a longer one.";
}

function charactersSentence(message: string): string {
  const classes: string[] = [];
  if (message.includes("abcdefghijklmnopqrstuvwxyz"))
    classes.push("a lowercase letter");
  if (message.includes("ABCDEFGHIJKLMNOPQRSTUVWXYZ"))
    classes.push("an uppercase letter");
  if (message.includes("0123456789")) classes.push("a number");
  if (message.includes("!@#$")) classes.push("a symbol");
  if (classes.length === 0) {
    return "Password needs a wider mix of characters, such as upper and lower case letters, numbers and symbols.";
  }
  const last = classes.pop();
  const list = classes.length ? `${classes.join(", ")} and ${last}` : last;
  return `Password must include ${list}.`;
}

/** Friendly, rule-specific copy derived from the server's reasons and message. */
export function weakPasswordMessage({
  reasons,
  message = "",
}: WeakPasswordInput): string {
  const known = (reasons ?? []).filter((r) =>
    ["length", "characters", "pwned"].includes(r),
  );
  const rules = known.length
    ? known
    : [
        /at least \d+ characters/i.test(message) ? "length" : null,
        /character of each/i.test(message) ? "characters" : null,
      ].filter((r): r is string => r !== null);
  if (rules.length === 0) return GENERIC;
  const sentences: Record<string, (m: string) => string> = {
    length: lengthSentence,
    characters: charactersSentence,
    pwned: () =>
      "This password has appeared in a data breach. Choose a different one.",
  };
  return rules.map((rule) => sentences[rule]!(message)).join(" ");
}

/** Toast text for a signup or password-update error: friendly if weak, else the server message. */
export function passwordErrorToast(
  error: { code?: string; message: string } & WeakPasswordInput,
): string {
  return error.code === "weak_password"
    ? weakPasswordMessage(error)
    : error.message;
}
