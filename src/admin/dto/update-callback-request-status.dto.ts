import { IsIn } from 'class-validator';

export class UpdateCallbackRequestStatusDto {
  @IsIn(['NEW', 'CONTACTED'])
  status!: 'NEW' | 'CONTACTED';
}
