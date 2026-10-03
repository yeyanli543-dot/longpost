import { IsString, MaxLength } from 'class-validator';
import type { SendMeetingChatRequest } from '@shared/api.interface';

export class SendChatDto implements SendMeetingChatRequest {
  @IsString()
  @MaxLength(2000)
  content!: string;
}
