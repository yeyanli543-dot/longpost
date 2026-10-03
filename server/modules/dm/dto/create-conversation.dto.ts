import { IsString, IsUUID } from 'class-validator';
import type { DMCreateConversationRequest } from '@shared/api.interface';

export class CreateConversationDto implements DMCreateConversationRequest {
  @IsString()
  @IsUUID()
  userId!: string;
}
