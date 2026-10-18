import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubscribeDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;
}
