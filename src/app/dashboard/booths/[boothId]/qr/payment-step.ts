import type { PaymentSetup } from "@/lib/paykit/payment-setup";
import type { PaymentStep } from "./go-live-card";

export function paymentStepOf(state: PaymentSetup["state"]): PaymentStep {
  if (state === "unreachable") return "unknown";
  return state === "none" ? "missing" : "ready";
}
