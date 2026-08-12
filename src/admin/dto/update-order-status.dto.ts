import { IsIn, IsOptional, IsString } from 'class-validator';

const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PHLEBOTOMIST_ASSIGNED',
  'SAMPLE_COLLECTED',
  'IN_LAB',
  'REPORT_READY',
  'CANCELLED',
] as const;

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES)
  status!: (typeof ORDER_STATUSES)[number];

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  phlebotomistId?: string;
}
