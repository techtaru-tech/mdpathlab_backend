import { loadRazorpayScript } from "@/lib/razorpay";
import { walletApi, session, type WalletTransaction } from "@/lib/api";

// Mirrors payForOrder's shape/outcome handling — same three real Razorpay outcomes (success,
// genuine failure, user-dismissed), just crediting the wallet instead of settling an order.
export type TopupOutcome =
  | { status: "success"; balance: number; transactions: WalletTransaction[] }
  | { status: "failed"; message: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export async function addMoneyToWallet(amount: number): Promise<TopupOutcome> {
  try {
    await loadRazorpayScript();
    const rp = await walletApi.createTopupOrder(amount);

    return await new Promise<TopupOutcome>((resolve) => {
      const rzp = new window.Razorpay({
        key: rp.keyId,
        amount: rp.amount,
        currency: rp.currency,
        order_id: rp.razorpayOrderId,
        name: "MD Path Lab",
        description: "Add money to wallet",
        ...(session.getUser()?.phone ? { prefill: { contact: session.getUser()!.phone } } : {}),
        theme: { color: "#38768C" },
        handler: (response) => {
          walletApi
            .verifyTopup({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            })
            .then((wallet) => resolve({ status: "success", ...wallet }))
            .catch(() =>
              resolve({
                status: "error",
                message: "Payment went through but we couldn't confirm it — please contact support before retrying.",
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
