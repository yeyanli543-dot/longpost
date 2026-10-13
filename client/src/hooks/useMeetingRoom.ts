import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { logger } from '@/lib/logger';
import { axiosForBackend } from '@/lib/axios';
import type { RoomParticipant, IceConfigResponse } from '@shared/api.interface';

interface UseMeetingRoomOptions {
  meetingId: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  onChatMessage?: (message: unknown) => void;
  onMeetingEnded?: () => void;
}

interface PeerConnection {
  userId: string;
  pc: RTCPeerConnection;
  stream: MediaStream;
}

async function fetchIceConfig(): Promise<IceConfigResponse> {
  try {
    const response = await axiosForBackend.get('/api/meetings/ice/config');
    return response.data;
  } catch (err) {
    logger.warn('获取ICE配置失败，使用默认STUN', err);
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  }
}

function getSocketPath(): string {
  const basePath = (window as unknown as { __BASE_PATH__?: string }).__BASE_PATH__ || '';
  return `${basePath}/socket.io`;
}

export function useMeetingRoom({
  meetingId,
  userId,
  userName,
  userAvatarUrl,
  onChatMessage,
  onMeetingEnded,
}: UseMeetingRoomOptions) {
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const iceConfigRef = useRef<IceConfigResponse | null>(null);
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const ensureIceConfig = useCallback(async () => {
    if (!iceConfigRef.current) {
      iceConfigRef.current = await fetchIceConfig();
    }
    return iceConfigRef.current;
  }, []);

  const createPeerConnection = useCallback(
    async (remoteUserId: string, isInitiator: boolean): Promise<RTCPeerConnection> => {
      const iceConfig = await ensureIceConfig();
      const pc = new RTCPeerConnection({
        iceServers: iceConfig.iceServers,
        iceTransportPolicy: iceConfig.iceTransportPolicy,
      });

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      const remoteStream = new MediaStream();
      pc.ontrack = (event) => {
        for (const track of event.streams[0]?.getTracks() ?? []) {
          if (!remoteStream.getTrackById(track.id)) {
            remoteStream.addTrack(track);
          }
        }
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(remoteUserId, remoteStream);
          return next;
        });
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('signal_ice', {
            to: remoteUserId,
            candidate: event.candidate,
            meetingId,
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          logger.warn(`ICE连接状态变更: ${remoteUserId} -> ${state}`);
          if (state === 'closed') {
            setRemoteStreams((prev) => {
              const next = new Map(prev);
              next.delete(remoteUserId);
              return next;
            });
          }
        }
      };

      if (isInitiator) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (socketRef.current) {
            socketRef.current.emit('signal_offer', {
              to: remoteUserId,
              offer,
              meetingId,
            });
          }
        } catch (err) {
          logger.error('创建offer失败', err);
        }
      }

      peerConnectionsRef.current.set(remoteUserId, { userId: remoteUserId, pc, stream: remoteStream });
      return pc;
    },
    [ensureIceConfig, meetingId],
  );

  const handleUserJoined = useCallback(
    async (data: { user: RoomParticipant; participants: RoomParticipant[] }) => {
      setParticipants(data.participants);
      const remoteUserId = data.user.userId;
      if (remoteUserId === userId) return;
      if (peerConnectionsRef.current.has(remoteUserId)) return;

      await createPeerConnection(remoteUserId, true);
    },
    [userId, createPeerConnection],
  );

  const handleUserLeft = useCallback((data: { userId: string; participants: RoomParticipant[] }) => {
    setParticipants(data.participants);

    const peer = peerConnectionsRef.current.get(data.userId);
    if (peer) {
      try {
        peer.pc.close();
      } catch (err) {
        logger.warn('关闭PeerConnection失败', err);
      }
      peerConnectionsRef.current.delete(data.userId);
    }

    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(data.userId);
      return next;
    });
  }, []);

  const handleSignalOffer = useCallback(
    async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
      const { from, offer } = data;
      let peer = peerConnectionsRef.current.get(from);
      let pc: RTCPeerConnection;

      if (peer) {
        pc = peer.pc;
      } else {
        pc = await createPeerConnection(from, false);
        peer = peerConnectionsRef.current.get(from)!;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (socketRef.current) {
          socketRef.current.emit('signal_answer', {
            to: from,
            answer,
            meetingId,
          });
        }
      } catch (err) {
        logger.error('处理offer失败', err);
      }
    },
    [createPeerConnection, meetingId],
  );

  const handleSignalAnswer = useCallback(
    async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      const peer = peerConnectionsRef.current.get(data.from);
      if (!peer) return;

      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      } catch (err) {
        logger.error('处理answer失败', err);
      }
    },
    [],
  );

  const handleSignalIce = useCallback(
    async (data: { from: string; candidate: RTCIceCandidateInit }) => {
      const peer = peerConnectionsRef.current.get(data.from);
      if (!peer || !data.candidate) return;

      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        logger.error('添加ICE candidate失败', err);
      }
    },
    [],
  );

  const handleMediaStateChanged = useCallback(
    (data: { userId: string; participants: RoomParticipant[] }) => {
      setParticipants(data.participants);
    },
    [],
  );

  const joinRoom = useCallback(
    (token: string) => {
      const socketPath = getSocketPath();
      const socket = io('/meetings', {
        path: socketPath,
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        socket.emit('join_room', {
          meetingId,
          userName,
          userAvatarUrl,
        });
      });

      socket.on('disconnect', () => {
        setConnected(false);
      });

      socket.on('joined_room', (data: { participants: RoomParticipant[]; yourUserId: string }) => {
        setParticipants(data.participants);

        const others = data.participants.filter((p) => p.userId !== userId);
        for (const other of others) {
          if (!peerConnectionsRef.current.has(other.userId)) {
            void createPeerConnection(other.userId, true);
          }
        }
      });

      socket.on('user_joined', handleUserJoined);
      socket.on('user_left', handleUserLeft);
      socket.on('signal_offer', handleSignalOffer);
      socket.on('signal_answer', handleSignalAnswer);
      socket.on('signal_ice', handleSignalIce);
      socket.on('media_state_changed', handleMediaStateChanged);

      socket.on('chat_message', (data: { message: unknown }) => {
        onChatMessage?.(data.message);
      });

      socket.on('meeting_ended', () => {
        onMeetingEnded?.();
      });

      socket.on('error', (err: { message: string }) => {
        logger.error('信令服务器错误', err.message);
      });
    },
    [
      meetingId,
      userName,
      userAvatarUrl,
      userId,
      createPeerConnection,
      handleUserJoined,
      handleUserLeft,
      handleSignalOffer,
      handleSignalAnswer,
      handleSignalIce,
      handleMediaStateChanged,
      onChatMessage,
      onMeetingEnded,
    ],
  );

  const leaveRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('leave_room', { meetingId });
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    for (const [, peer] of peerConnectionsRef.current) {
      try {
        peer.pc.close();
      } catch (err) {
        logger.warn('关闭PeerConnection失败', err);
      }
    }
    peerConnectionsRef.current.clear();
    setRemoteStreams(new Map());
    setParticipants([]);
    setConnected(false);
  }, [meetingId]);

  const sendMediaState = useCallback(
    (state: { videoEnabled?: boolean; audioEnabled?: boolean; screenSharing?: boolean }) => {
      if (socketRef.current) {
        socketRef.current.emit('media_state', {
          meetingId,
          ...state,
        });
      }
    },
    [meetingId],
  );

  const sendChatMessage = useCallback(
    (content: string) => {
      if (socketRef.current) {
        socketRef.current.emit('chat_message', { meetingId, content });
      }
    },
    [meetingId],
  );

  const setLocalStream = useCallback(
    (stream: MediaStream | null) => {
      const oldStream = localStreamRef.current;
      localStreamRef.current = stream;

      if (peerConnectionsRef.current.size === 0) return;

      for (const [peerUserId, peer] of peerConnectionsRef.current) {
        void (async () => {
          try {
            if (stream) {
              const senders = peer.pc.getSenders();
              for (const track of stream.getTracks()) {
                const existing = senders.find((s) => s.track?.kind === track.kind);
                if (existing) {
                  await existing.replaceTrack(track);
                } else {
                  peer.pc.addTrack(track, stream);
                }
              }
            } else if (oldStream) {
              for (const track of oldStream.getTracks()) {
                const senders = peer.pc.getSenders();
                const sender = senders.find((s) => s.track?.id === track.id);
                if (sender) {
                  try {
                    peer.pc.removeTrack(sender);
                  } catch {
                    // track already removed
                  }
                }
              }
            }

            const offer = await peer.pc.createOffer();
            await peer.pc.setLocalDescription(offer);
            socketRef.current?.emit('signal_offer', {
              meetingId,
              to: peerUserId,
              offer,
            });
          } catch (err) {
            logger.error('本地媒体流重协商失败', err);
          }
        })();
      }
    },
    [meetingId],
  );

  const replaceVideoTrack = useCallback(
    async (newTrack: MediaStreamTrack | null) => {
      for (const [peerUserId, peer] of peerConnectionsRef.current) {
        try {
          const senders = peer.pc.getSenders();
          const videoSender = senders.find(
            (s) => s.track?.kind === 'video' || (!s.track && s.dtmf === null),
          );
          if (videoSender) {
            await videoSender.replaceTrack(newTrack);
          } else if (newTrack) {
            const targetStream =
              screenStreamRef.current || localStreamRef.current || new MediaStream([newTrack]);
            peer.pc.addTrack(newTrack, targetStream);
            const offer = await peer.pc.createOffer();
            await peer.pc.setLocalDescription(offer);
            socketRef.current?.emit('signal_offer', {
              meetingId,
              to: peerUserId,
              offer,
            });
          }
        } catch (err) {
          logger.error('替换视频轨道失败', err);
        }
      }
    },
    [meetingId],
  );

  useEffect(() => {
    return () => {
      leaveRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    connected,
    participants,
    remoteStreams,
    joinRoom,
    leaveRoom,
    sendMediaState,
    sendChatMessage,
    setLocalStream,
    replaceVideoTrack,
    localStreamRef,
    screenStreamRef,
    socketRef,
  };
}

