import { IsIn } from 'class-validator';

export class DecideServiceAreaRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';
}
