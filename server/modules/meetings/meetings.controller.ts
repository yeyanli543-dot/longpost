import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard, OptionalJwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { AddParticipantsDto } from './dto/add-participants.dto';
import { SendChatDto } from './dto/send-chat.dto';
import { UpdateMinutesDto } from './dto/update-minutes.dto';
import { validateUUIDParam } from '@server/common/utils/validation';
import type {
  MeetingListResponse,
  MeetingDetailResponse,
  MeetingChatListResponse,
  MeetingChatMessage,
  MeetingMinutes,
  IceConfigResponse,
} from '@shared/api.interface';

@Controller('api/meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  // ========== Public Read (no guard) ==========

  @Get('ice/config')
  getIceConfig(): IceConfigResponse {
    const iceServers: IceConfigResponse['iceServers'] = [];

    const stunServers = process.env.WEBRTC_STUN_SERVERS;
    if (stunServers) {
      iceServers.push({ urls: stunServers.split(',') });
    } else {
      iceServers.push({ urls: 'stun:stun.l.google.com:19302' });
    }

    const turnServer = process.env.WEBRTC_TURN_SERVER;
    const turnUsername = process.env.WEBRTC_TURN_USERNAME;
    const turnCredential = process.env.WEBRTC_TURN_CREDENTIAL;
    if (turnServer) {
      iceServers.push({
        urls: turnServer.split(','),
        username: turnUsername,
        credential: turnCredential,
      });
    }

    const transportPolicy = process.env.WEBRTC_TRANSPORT_POLICY;
    return {
      iceServers,
      iceTransportPolicy:
        transportPolicy === 'relay' ? 'relay' : 'all',
    };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('code/:code')
  async findByCode(
    @Param('code') code: string,
  ): Promise<{ meetingId: string }> {
    return this.meetingsService.findByCode(code);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async getDetail(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<MeetingDetailResponse> {
    validateUUIDParam(id, 'meetingId');
    const userId = req.user?.id ?? null;
    return this.meetingsService.getDetail(id, userId);
  }

  // ========== Authenticated APIs ==========

  @UseGuards(JwtAuthGuard)
  @Get()
  async listMyMeetings(
    @Req() req: AuthRequest,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<MeetingListResponse> {
    const userId = req.user!.id;
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSizeNum = pageSize ? parseInt(pageSize, 10) : 20;
    return this.meetingsService.listMyMeetings(
      userId,
      status,
      pageNum,
      pageSizeNum,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Req() req: AuthRequest,
    @Body() dto: CreateMeetingDto,
  ): Promise<{ meetingId: string }> {
    const userId = req.user!.id;
    return this.meetingsService.create(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
  ): Promise<{ success: true }> {
    validateUUIDParam(id, 'meetingId');
    const userId = req.user!.id;
    return this.meetingsService.update(id, userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async cancel(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    validateUUIDParam(id, 'meetingId');
    const userId = req.user!.id;
    return this.meetingsService.cancel(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/participants')
  async addParticipants(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: AddParticipantsDto,
  ): Promise<{ success: true }> {
    validateUUIDParam(id, 'meetingId');
    const userId = req.user!.id;
    return this.meetingsService.addParticipants(id, userId, dto.userIds);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/participants/:userId')
  async removeParticipant(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ): Promise<{ success: true }> {
    validateUUIDParam(id, 'meetingId');
    validateUUIDParam(targetUserId, 'userId');
    const userId = req.user!.id;
    return this.meetingsService.removeParticipant(id, userId, targetUserId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/join')
  async join(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    validateUUIDParam(id, 'meetingId');
    const userId = req.user!.id;
    return this.meetingsService.joinMeeting(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/leave')
  async leave(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    validateUUIDParam(id, 'meetingId');
    const userId = req.user!.id;
    return this.meetingsService.leaveMeeting(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/end')
  async end(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    validateUUIDParam(id, 'meetingId');
    const userId = req.user!.id;
    return this.meetingsService.endMeeting(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/chat')
  async getChat(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<MeetingChatListResponse> {
    validateUUIDParam(id, 'meetingId');
    const userId = req.user!.id;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.meetingsService.getChatMessages(id, userId, cursor, limitNum);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/chat')
  async sendChat(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: SendChatDto,
  ): Promise<{ message: MeetingChatMessage }> {
    validateUUIDParam(id, 'meetingId');
    const userId = req.user!.id;
    return this.meetingsService.sendChatMessage(id, userId, dto.content);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/minutes')
  async getMinutes(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<MeetingMinutes | null> {
    validateUUIDParam(id, 'meetingId');
    const userId = req.user!.id;
    return this.meetingsService.getMinutes(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/minutes')
  async updateMinutes(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateMinutesDto,
  ): Promise<{ minutes: MeetingMinutes }> {
    validateUUIDParam(id, 'meetingId');
    const userId = req.user!.id;
    return this.meetingsService.updateMinutes(id, userId, dto.content);
  }
}
