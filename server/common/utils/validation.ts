import { BadRequestException } from '@nestjs/common';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function validateUUIDParam(value: string, paramName: string): void {
  if (!isValidUUID(value)) {
    throw new BadRequestException(`无效的 ${paramName} 格式`);
  }
}
