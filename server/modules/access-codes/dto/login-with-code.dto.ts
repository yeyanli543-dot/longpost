import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import type { AccessCodeLoginRequest } from '@shared/api.interface';

export class LoginWithCodeDto implements AccessCodeLoginRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;
}
