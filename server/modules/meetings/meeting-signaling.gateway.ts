import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { MeetingsService } from './meetings.service';
import { AuthService } from '../auth/auth.service';

interface MeetingUser {
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  socketId: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
  screenSharing: boolean;
}

interface ActiveRoom {
  meetingId: string;
  users: Map<string, MeetingUser>;
}

@WebSocketGateway({
  namespace: '/meetings',
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class MeetingSignalingGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger(MeetingSignalingGateway.name);

  @WebSocketServer()
  server: Server;

  private rooms = new Map<string, ActiveRoom>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly meetingsService: MeetingsService,
    private readonly authService: AuthService,
  ) {}

  afterInit(): void {
    this.logger.log('会议信令 WebSocket Gateway 已初始化');
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.emit('error', { message: '未提供认证令牌' });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const user = await this.authService.validateUserActive(payload.sub);
      if (!user || !user.isActive || user.isBanned) {
        client.emit('error', { message: '账号已被封禁或停用' });
        client.disconnect();
        return;
      }
      client.data.userId = user.id;
      client.data.role = user.role;
      client.data.userName = user.nickname || payload.username || '用户';
    } catch (err) {
      this.logger.warn('连接鉴权失败');
      client.emit('error', { message: '认证失败' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    const { userId } = client.data;
    if (!userId) return;

    for (const [meetingId, room] of this.rooms.entries()) {
      if (room.users.has(userId)) {
        room.users.delete(userId);
        const participants = this.getParticipantsList(room);

        client.to(`meeting:${meetingId}`).emit('user_left', {
          userId,
          participants,
        });

        void this.meetingsService.leaveMeetingSilent(meetingId, userId);

        if (room.users.size === 0) {
          this.rooms.delete(meetingId);
        }
        break;
      }
    }
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @MessageBody() data: { meetingId: string; userName?: string; userAvatarUrl?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const { userId } = client.data;
    const { meetingId, userName, userAvatarUrl } = data;

    if (!userId || !meetingId) {
      client.emit('error', { message: '缺少必要参数' });
      return;
    }

    try {
      await this.meetingsService.joinMeeting(meetingId, userId);
    } catch (err) {
      client.emit('error', { message: '无权加入此会议' });
      return;
    }

    const room = this.getOrCreateRoom(meetingId);
    const existingUser = room.users.get(userId);

    const user: MeetingUser = {
      userId,
      userName: userName || existingUser?.userName || client.data.userName || '用户',
      userAvatarUrl: userAvatarUrl ?? existingUser?.userAvatarUrl ?? null,
      socketId: client.id,
      videoEnabled: existingUser?.videoEnabled ?? false,
      audioEnabled: existingUser?.audioEnabled ?? false,
      screenSharing: existingUser?.screenSharing ?? false,
    };

    room.users.set(userId, user);
    client.join(`meeting:${meetingId}`);
    client.data.meetingId = meetingId;

    const participants = this.getParticipantsList(room);

    client.emit('joined_room', {
      meetingId,
      participants,
      yourUserId: userId,
    });

    client.to(`meeting:${meetingId}`).emit('user_joined', {
      user: this.toParticipantInfo(user),
      participants,
    });
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @MessageBody() data: { meetingId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const { userId } = client.data;
    const { meetingId } = data;
    if (!userId || !meetingId) return;

    const room = this.rooms.get(meetingId);
    if (!room) return;

    room.users.delete(userId);
    client.leave(`meeting:${meetingId}`);

    const participants = this.getParticipantsList(room);
    client.to(`meeting:${meetingId}`).emit('user_left', {
      userId,
      participants,
    });

    void this.meetingsService.leaveMeetingSilent(meetingId, userId);

    if (room.users.size === 0) {
      this.rooms.delete(meetingId);
    }
  }

  @SubscribeMessage('signal_offer')
  handleOffer(
    @MessageBody() data: { to: string; offer: RTCSessionDescriptionInit; meetingId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const { userId } = client.data;
    const { to, offer, meetingId } = data;
    if (!userId || !meetingId) return;

    const room = this.rooms.get(meetingId);
    if (!room || !room.users.has(userId)) return;
    const target = room.users.get(to);
    if (!target) return;

    client.to(target.socketId).emit('signal_offer', {
      from: userId,
      offer,
    });
  }

  @SubscribeMessage('signal_answer')
  handleAnswer(
    @MessageBody() data: { to: string; answer: RTCSessionDescriptionInit; meetingId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const { userId } = client.data;
    const { to, answer, meetingId } = data;
    if (!userId || !meetingId) return;

    const room = this.rooms.get(meetingId);
    if (!room || !room.users.has(userId)) return;
    const target = room.users.get(to);
    if (!target) return;

    client.to(target.socketId).emit('signal_answer', {
      from: userId,
      answer,
    });
  }

  @SubscribeMessage('signal_ice')
  handleIceCandidate(
    @MessageBody() data: { to: string; candidate: RTCIceCandidateInit; meetingId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const { userId } = client.data;
    const { to, candidate, meetingId } = data;
    if (!userId || !meetingId) return;

    const room = this.rooms.get(meetingId);
    if (!room || !room.users.has(userId)) return;
    const target = room.users.get(to);
    if (!target) return;

    client.to(target.socketId).emit('signal_ice', {
      from: userId,
      candidate,
    });
  }

  @SubscribeMessage('media_state')
  handleMediaState(
    @MessageBody()
    data: {
      meetingId: string;
      videoEnabled?: boolean;
      audioEnabled?: boolean;
      screenSharing?: boolean;
    },
    @ConnectedSocket() client: Socket,
  ): void {
    const { userId } = client.data;
    const { meetingId } = data;
    if (!userId) return;

    const room = this.rooms.get(meetingId);
    const user = room?.users.get(userId);
    if (!user) return;

    if (data.videoEnabled !== undefined) user.videoEnabled = data.videoEnabled;
    if (data.audioEnabled !== undefined) user.audioEnabled = data.audioEnabled;
    if (data.screenSharing !== undefined) user.screenSharing = data.screenSharing;

    const participants = this.getParticipantsList(room);
    client.to(`meeting:${meetingId}`).emit('media_state_changed', {
      userId,
      videoEnabled: user.videoEnabled,
      audioEnabled: user.audioEnabled,
      screenSharing: user.screenSharing,
      participants,
    });
  }

  @SubscribeMessage('chat_message')
  async handleChatMessage(
    @MessageBody() data: { meetingId: string; content: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const { userId } = client.data;
    const { meetingId, content } = data;

    if (!userId || !content?.trim()) return;

    try {
      const message = await this.meetingsService.sendChatWithSender(
        meetingId,
        userId,
        content.trim(),
      );

      this.server.to(`meeting:${meetingId}`).emit('chat_message', {
        message,
      });
    } catch (err) {
      this.logger.error('发送聊天消息失败');
    }
  }

  @SubscribeMessage('end_meeting')
  async handleEndMeeting(
    @MessageBody() data: { meetingId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const { userId, role } = client.data;
    const { meetingId } = data;
    if (!userId || !meetingId) return;

    try {
      const detail = await this.meetingsService.getMeeting(meetingId, userId);
      if (detail.meeting.creatorId !== userId && role !== 'admin') {
        client.emit('error', { message: '仅会议主持人可结束会议' });
        return;
      }
      if (detail.meeting.status !== 'ended') {
        try {
          await this.meetingsService.endMeeting(meetingId, userId);
        } catch {
          // ignore if already ended
        }
      }
      this.server.to(`meeting:${meetingId}`).emit('meeting_ended', {
        meetingId,
      });
      this.rooms.delete(meetingId);
    } catch (err) {
      client.emit('error', { message: '结束会议失败或无权限' });
    }
  }

  private getOrCreateRoom(meetingId: string): ActiveRoom {
    let room = this.rooms.get(meetingId);
    if (!room) {
      room = { meetingId, users: new Map() };
      this.rooms.set(meetingId, room);
    }
    return room;
  }

  private getParticipantsList(room: ActiveRoom) {
    return Array.from(room.users.values()).map((u) => this.toParticipantInfo(u));
  }

  private toParticipantInfo(user: MeetingUser) {
    return {
      userId: user.userId,
      userName: user.userName,
      userAvatarUrl: user.userAvatarUrl,
      videoEnabled: user.videoEnabled,
      audioEnabled: user.audioEnabled,
      screenSharing: user.screenSharing,
    };
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.auth?.token;
    if (authHeader) return authHeader;

    const queryToken = client.handshake.query?.token;
    if (queryToken) {
      return Array.isArray(queryToken) ? queryToken[0] : queryToken;
    }

    return null;
  }
}
