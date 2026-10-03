import { IsString, IsNumber, IsOptional, IsBoolean, Min, MaxLength, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import type { UpdateMeetingRequest, MeetingStatus } from '@shared/api.interface';

export class UpdateMeetingDto implements UpdateMeetingRequest {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsIn(['scheduled', 'ongoing', 'ended', 'cancelled'])
  status?: MeetingStatus;
}
