import { IsIn } from 'class-validator';

export class UpdateFranchiseInquiryStatusDto {
  @IsIn(['NEW', 'CONTACTED'])
  status!: 'NEW' | 'CONTACTED';
}
