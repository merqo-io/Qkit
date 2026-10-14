import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { orderBoothIdSchema, orderTokenSchema } from "@/lib/schemas";
import { loadPreClaimContext } from "../[orderNumber]/payment-actions";
import { requestOrigin } from "@/lib/request-origin";

interface Props {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ t?: string }>;
}

export const revalidate = 0;

// An order that can no longer be paid for. Says so, and above all says not
// to pay: the QR for it may still be on the customer's screen or in their
// photos.
function ClosedOrder({
  boothId,
  title,
  detail,
}: {
  boothId: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="mx-auto max-w-sm space-y-4 px-5 py-10 text-center">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{detail}</p>
      <Link
        href={`/order/${boothId}`}
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
      >
        Order again from this stall
      </Link>
    </div>
  );
}

/**
 * The pay step for an order that has no order_number yet (numbering is
 * deferred until the payment is claimed). Reached from OrderForm's redirect
 * when placeOrder returns a null orderNumber. The customer pays on paykit's
 * own page, so a pending order is only sent there; paykit sends them back
 * here, and an order that is by then claimed gets its number in
 * loadPreClaimContext and goes on to the numbered status page.
 */
export default async function PayPage({ params, searchParams }: Props) {
  const { boothId } = await params;
  const { t: token } = await searchParams;

  if (
    !orderBoothIdSchema.safeParse(boothId).success ||
    !token ||
    !orderTokenSchema.safeParse(token).success
  )
    notFound();

  const origin = await requestOrigin();
  if (!origin) notFound();

  const context = await loadPreClaimContext(boothId, token, origin);
  if (!context) notFound();
  if (context.state === "placed")
    redirect(`/order/${boothId}/${context.orderNumber}?t=${token}`);
  if (context.state === "pay") redirect(context.payUrl);
  if (context.state === "cancelled")
    return (
      <ClosedOrder
        boothId={boothId}
        title="This order was cancelled"
        detail="Please do not make a payment for this order."
      />
    );
  if (context.state === "expired")
    return (
      <ClosedOrder
        boothId={boothId}
        title="This order has expired"
        detail="It was not paid in time, so the stall is not making it. Please do not pay for it."
      />
    );

  return (
    <div className="mx-auto max-w-sm space-y-4 px-5 py-10 text-center">
      <h1 className="font-display text-2xl font-semibold">
        Could not open the payment page
      </h1>
      <p className="text-sm text-muted-foreground">
        Nothing has been charged. Try again in a moment.
      </p>
      <Link
        href={`/order/${boothId}/pay?t=${token}`}
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
      >
        Try again
      </Link>
    </div>
  );
}
