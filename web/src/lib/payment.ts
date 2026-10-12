import { loadRazorpayScript } from "@/lib/razorpay";
import { ApiError, ordersApi, paymentsApi, session, type CheckoutRequest, type Order } from "@/lib/api";

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

export type PayAndBookOutcome =
  | { status: "success"; order: Order }
  | { status: "cancelled" }
  | { status: "failed"; message: string }
  // Paid, but the booking could not be made (e.g. the slot filled up): the server refunded it in full.
  | { status: "refunded"; message: string }
  // Paid, but the confirmation call did not get through: the server books it from Razorpay's webhook.
  | { status: "pending"; message: string }
  | { status: "error"; message: string };

/**
 * Pay first, then book. Nothing is booked until the payment has been verified by the server: it prices the
 * booking and opens the Razorpay order, the customer pays, and the booking is created from the payment proof.
 */
export async function payAndBook(dto: CheckoutRequest, description: string): Promise<PayAndBookOutcome> {
  let rp: { orderId: string; amount: number; currency: string; keyId: string };
  try {
    await loadRazorpayScript();
    rp = await ordersApi.razorpayCheckoutOrder(dto);
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Something went wrong — please try again" };
  }

  return new Promise<PayAndBookOutcome>((resolve) => {
    const rzp = new window.Razorpay({
      key: rp.keyId,
      amount: rp.amount,
      currency: rp.currency,
      order_id: rp.orderId,
      name: "MD Path Lab",
      description,
      ...(session.getUser()?.phone ? { prefill: { contact: session.getUser()!.phone } } : {}),
      theme: { color: "#38768C" },
      handler: (response) => {
        ordersApi
          .checkout({
            ...dto,
            paymentMethod: "ONLINE",
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          })
          .then((order) => resolve({ status: "success", order }))
          .catch((err: unknown) => {
            if (err instanceof ApiError && err.status === 409) resolve({ status: "refunded", message: err.message });
            else if (err instanceof ApiError && err.status >= 400 && err.status < 500) resolve({ status: "error", message: err.message });
            else resolve({ status: "pending", message: "Payment received. Your booking will appear in My Bookings in a moment." });
          });
      },
      modal: { ondismiss: () => resolve({ status: "cancelled" }) },
    });
    rzp.on("payment.failed", (resp) => {
      resolve({ status: "failed", message: resp?.error?.description || "Payment failed — please try again" });
    });
    rzp.open();
  });
}
