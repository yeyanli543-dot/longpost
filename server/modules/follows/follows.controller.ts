import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FollowsService } from './follows.service';
import { JwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard';
import { validateUUIDParam } from '@server/common/utils/validation';
import type {
  FollowUserResponse,
  FollowListResponse,
  UserPublicProfile,
} from '@shared/api.interface';

@Controller('api/follows')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @UseGuards(JwtAuthGuard)
  @Post(':userId')
  async toggleFollow(
    @Req() req: AuthRequest,
    @Param('userId') userId: string,
  ): Promise<FollowUserResponse> {
    validateUUIDParam(userId, 'userId');
    const followerId = req.user!.id;
    return this.followsService.toggleFollow(followerId, userId);
  }

  @Get('following/:userId')
  async getFollowing(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<FollowListResponse> {
    validateUUIDParam(userId, 'userId');
    const parsedLimit = Math.min(50, limit ? parseInt(limit, 10) : 20);
    return this.followsService.getFollowing(userId, cursor ?? null, parsedLimit);
  }

  @Get('followers/:userId')
  async getFollowers(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<FollowListResponse> {
    validateUUIDParam(userId, 'userId');
    const parsedLimit = Math.min(50, limit ? parseInt(limit, 10) : 20);
    return this.followsService.getFollowers(userId, cursor ?? null, parsedLimit);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/following')
  async getMyFollowing(@Req() req: AuthRequest): Promise<UserPublicProfile[]> {
    const userId = req.user!.id;
    return this.followsService.getMyFollowing(userId);
  }
}
