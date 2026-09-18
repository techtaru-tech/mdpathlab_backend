import { IsInt, Min } from 'class-validator';

export class CreateTopupOrderDto {
  @IsInt()
  @Min(1)
  amount!: number;
}
