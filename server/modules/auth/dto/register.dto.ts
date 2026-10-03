import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(100)
  password!: string;

  @IsString()
  @MinLength(1, { message: '昵称不能为空' })
  @MaxLength(50, { message: '昵称最多 50 个字符' })
  nickname!: string;
}
