import { IsIn, IsInt, Min } from 'class-validator';

// FSD §2.4: "Enter Amount Collected, Payment Mode (Cash/UPI)". No exact-match/partial/overpayment
// rule is specified by the FSD, so only a basic positive-integer check is applied here — the same
// representation Order.total/subtotal already use (plain rupee integers, not paise).
export class CollectPaymentDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsIn(['CASH', 'UPI'])
  paymentMode!: 'CASH' | 'UPI';
}
