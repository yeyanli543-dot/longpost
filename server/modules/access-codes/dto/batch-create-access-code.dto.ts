import { IsNumber, Min, Max, IsOptional, IsString, IsIn, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class BatchCreateAccessCodeDto {
  @IsNumber()
  @Min(1)
  @Max(100)
  count!: number;

  @IsOptional()
  @IsString()
  @IsIn(['admin', 'editor', 'user'])
  role?: 'admin' | 'editor' | 'user';

  @IsOptional()
  @Type(() => Date)
  expiresAt?: Date | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUses?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
