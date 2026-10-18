import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { WebDavService } from './webdav.service';
import { WebDavProxyDto } from './dto/webdav-proxy.dto';

@Controller('api/webdav')
export class WebDavController {
  constructor(private readonly webdavService: WebDavService) {}

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testConnection(@Body() dto: WebDavProxyDto) {
    return this.webdavService.testConnection(dto);
  }

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  async uploadBackup(@Body() dto: WebDavProxyDto) {
    return this.webdavService.uploadBackup(dto);
  }

  @Post('download')
  @HttpCode(HttpStatus.OK)
  async downloadBackup(@Body() dto: WebDavProxyDto) {
    return this.webdavService.downloadBackup(dto);
  }
}
