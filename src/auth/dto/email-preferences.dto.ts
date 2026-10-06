import { IsBoolean } from 'class-validator';

export class EmailPreferencesDto {
  @IsBoolean({ message: 'emailNotifications must be true or false' })
  emailNotifications!: boolean;
}
