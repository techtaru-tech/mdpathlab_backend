import { IsIn } from 'class-validator';

export class UpdateContactQueryStatusDto {
  @IsIn(['NEW', 'CONTACTED'])
  status!: 'NEW' | 'CONTACTED';
}
