import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(100)
  password!: string;
}
