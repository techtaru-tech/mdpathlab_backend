import { IsString, MinLength } from 'class-validator';

// Mirrors the FSD's "Enter Cancellation Reason, Submit" step — unlike the generic status-update
// endpoint's optional `note`, a reason is mandatory here since this DTO exists specifically for
// the admin cancellation action.
export class CancelOrderDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
