import { IsArray, IsString } from 'class-validator';
import type { AddParticipantsRequest } from '@shared/api.interface';

export class AddParticipantsDto implements AddParticipantsRequest {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}
