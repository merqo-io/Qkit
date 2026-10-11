// The customer pages have no shared chrome, so this layout exists only to give
// them the page's main landmark: a screen reader's "jump to main content"
// lands on the menu, the payment or the order status.
export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main>{children}</main>;
}
