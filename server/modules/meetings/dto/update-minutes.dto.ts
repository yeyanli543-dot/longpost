import { IsString } from 'class-validator';
import type { UpdateMeetingMinutesRequest } from '@shared/api.interface';

export class UpdateMinutesDto implements UpdateMeetingMinutesRequest {
  @IsString()
  content!: string;
}
