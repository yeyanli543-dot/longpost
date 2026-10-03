import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, Min, MaxLength } from 'class-validator';
import type { CreateMeetingRequest } from '@shared/api.interface';

export class CreateMeetingDto implements CreateMeetingRequest {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  startTime!: string;

  @IsNumber()
  @Min(1)
  durationMinutes!: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participantIds?: string[];
}
