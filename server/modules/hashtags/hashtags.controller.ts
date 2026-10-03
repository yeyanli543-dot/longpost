import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { HashtagsService } from './hashtags.service';
import type {
  HashtagTimelineResponse,
  TrendingHashtagsResponse,
} from '@shared/api.interface';

@Controller('api/hashtags')
export class HashtagsController {
  constructor(private readonly hashtagsService: HashtagsService) {}

  @Get('trending')
  async getTrending(
    @Query('limit') limit?: string,
  ): Promise<TrendingHashtagsResponse> {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const safeLimit = Math.min(Math.max(limitNum, 1), 20);
    return this.hashtagsService.getTrending(safeLimit);
  }

  @Get(':tag')
  async getHashtagTimeline(
    @Param('tag') tag: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<HashtagTimelineResponse> {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const safeLimit = Math.min(Math.max(limitNum, 1), 50);
    const cursorVal = cursor && cursor.trim() !== '' ? cursor : null;
    return this.hashtagsService.getHashtagTimeline(tag, cursorVal, safeLimit);
  }
}
