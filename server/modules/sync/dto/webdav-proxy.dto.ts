import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class WebdavProxyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'GET', 'POST', 'PUT', 'DELETE', 'PROPFIND', 'MKCOL', 'HEAD', 'OPTIONS',
    'get', 'post', 'put', 'delete', 'propfind', 'mkcol', 'head', 'options',
  ])
  method?: string;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  body?: string | null;
}
