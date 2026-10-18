import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AiMessageDto {
  @IsString()
  @IsIn(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @IsString()
  @MaxLength(20000)
  content!: string;
}

export class AiChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiMessageDto)
  messages!: AiMessageDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;
}

export class AiKeyDto {
  @IsOptional()
  @IsString()
  @IsIn(['openai', 'gemini', 'ollama'])
  provider?: 'openai' | 'gemini' | 'ollama';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  /** 传空字符串表示清除已托管的 Key */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  apiKey?: string;
}
