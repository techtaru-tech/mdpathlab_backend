import { loadRazorpayScript } from "@/lib/razorpay";
import { paymentsApi, session, type Order } from "@/lib/api";

// Shared by the checkout flow and the dashboard's "retry payment" action so there is exactly
// one place that opens Razorpay and interprets its outcome — success (server-verified),
// genuine failure (card declined etc., via Razorpay's own payment.failed event), or the user
// simply closing the modal (cancelled). Real Razorpay SDK, no mocked states.
export type PaymentOutcome =
  | { status: "success"; order: Order }
  | { status: "failed"; message: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export async function payForOrder(order: Order): Promise<PaymentOutcome> {
  try {
    await loadRazorpayScript();
    const rp = await paymentsApi.createRazorpayOrder(order.id);

    return await new Promise<PaymentOutcome>((resolve) => {
      const rzp = new window.Razorpay({
        key: rp.keyId,
        amount: rp.amount,
        currency: rp.currency,
        order_id: rp.razorpayOrderId,
        name: "MD Path Lab",
        description: order.items.map((i) => i.itemName).join(", "),
        ...(session.getUser()?.phone ? { prefill: { contact: session.getUser()!.phone } } : {}),
        theme: { color: "#38768C" },
        handler: (response) => {
          paymentsApi
            .verify(order.id, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            })
            .then((updated) => resolve({ status: "success", order: updated }))
            .catch(() =>
              resolve({
                status: "error",
                message: `Payment went through but verification failed — please contact support with order ${order.orderNumber}`,
              }),
            );
        },
        modal: { ondismiss: () => resolve({ status: "cancelled" }) },
      });
      rzp.on("payment.failed", (resp) => {
        resolve({ status: "failed", message: resp?.error?.description || "Payment failed — please try again" });
      });
      rzp.open();
    });
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Something went wrong — please try again" };
  }
}
