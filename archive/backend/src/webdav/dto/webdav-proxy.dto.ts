import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class WebDavProxyDto {
  @IsNotEmpty({ message: 'WebDAV 端点不能为空' })
  @IsString({ message: 'WebDAV 端点必须为字符串' })
  endpoint!: string;

  @IsNotEmpty({ message: '用户名不能为空' })
  @IsString({ message: '用户名必须为字符串' })
  username!: string;

  @IsNotEmpty({ message: '密码不能为空' })
  @IsString({ message: '密码必须为字符串' })
  password!: string;

  @IsOptional()
  @IsString({ message: '备份文件名必须为字符串' })
  filename?: string;

  @IsOptional()
  @IsString({ message: '备份负载必须为字符串' })
  payload?: string;
}
