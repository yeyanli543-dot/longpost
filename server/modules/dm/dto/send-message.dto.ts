import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import type { DMSendMessageRequest } from '@shared/api.interface';

export class SendMessageDto implements DMSendMessageRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}
