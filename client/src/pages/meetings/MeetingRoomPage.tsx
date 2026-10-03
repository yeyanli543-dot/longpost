import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Video,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  MonitorUp,
  MessageSquare,
  Users,
  LogOut,
  ChevronLeft,
  Send,
  X,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { useAuth } from '@client/src/hooks/useAuth';
import { useMeetingRoom } from '@client/src/hooks/useMeetingRoom';
import { Image } from '@client/src/components/ui/image';
import { Input } from '@client/src/components/ui/input';
import LoginGate from '@client/src/components/LoginGate';
import { meetingsApi } from '@client/src/api';
import { getToken } from '@client/src/api/auth';
import type {
  MeetingDetail,
  MeetingChatMessage,
  MeetingParticipant,
  RoomParticipant,
} from '@shared/api.interface';

type PanelTab = 'participants' | 'chat';

const MeetingRoomPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);

  // Media state
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  // Panel state
  const [panelOpen, setPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<PanelTab>('chat');
  const [isMobile, setIsMobile] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<MeetingChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleChatMessage = useCallback((message: MeetingChatMessage) => {
    setChatMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev;
      const next = [...prev, message];
      return next;
    });
  }, []);

  const handleMeetingEnded = useCallback(() => {
    setError('会议已结束');
    setTimeout(() => {
      if (id) navigate(`/meetings/${id}`);
    }, 2000);
  }, [id, navigate]);

  const {
    connected,
    participants: roomParticipants,
    remoteStreams,
    joinRoom,
    leaveRoom,
    sendMediaState,
    sendChatMessage,
    setLocalStream,
    localStreamRef,
    screenStreamRef,
  } = useMeetingRoom({
    meetingId: id ?? '',
    userId: user?.id ?? '',
    userName: user?.nickname ?? '用户',
    userAvatarUrl: user?.avatarUrl ?? null,
    onChatMessage: handleChatMessage as (msg: unknown) => void,
    onMeetingEnded: handleMeetingEnded,
  });

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) setPanelOpen(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const loadMeeting = useCallback(async () => {
    if (!id) return;
    try {
      const response = await meetingsApi.getMeeting(id);
      setMeeting(response.meeting);
      setError(null);
    } catch (err) {
      logger.error('加载会议详情失败', err);
      setError('加载会议失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadChat = useCallback(async () => {
    if (!id) return;
    try {
      const response = await meetingsApi.getChatMessages(id, undefined, 100);
      setChatMessages(response.items.reverse());
    } catch (err) {
      logger.error('加载聊天消息失败', err);
    }
  }, [id]);

  useEffect(() => {
    if (authLoading || !id || !user) return;

    let mounted = true;
    const init = async () => {
      try {
        await loadMeeting();
        await loadChat();
        const token = getToken();
        if (token) {
          joinRoom(token);
        } else {
          setWsError('未登录');
        }
      } catch (err) {
        if (mounted) {
          logger.error('初始化会议失败', err);
        }
      }
    };

    void init();

    const statusTimer = setInterval(() => {
      void loadMeeting();
    }, 30000);

    return () => {
      mounted = false;
      clearInterval(statusTimer);
      leaveRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading, id]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  useEffect(() => {
    return () => {
      stopLocalStream();
      stopScreenShare();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopLocalStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setLocalStream(null);
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    setScreenOn(false);
    if (roomParticipants.some((p) => p.userId === user?.id && p.screenSharing)) {
      sendMediaState({ screenSharing: false });
    }
  };

  const toggleMic = async () => {
    try {
      if (micOn) {
        if (localStreamRef.current) {
          localStreamRef.current
            .getAudioTracks()
            .forEach((track) => (track.enabled = false));
        }
        setMicOn(false);
        sendMediaState({ audioEnabled: false });
      } else {
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: cameraOn,
          });
          localStreamRef.current = stream;
          setLocalStream(stream);
          if (localVideoRef.current && cameraOn) {
            localVideoRef.current.srcObject = stream;
          }
        } else {
          localStreamRef.current
            .getAudioTracks()
            .forEach((track) => (track.enabled = true));
        }
        setMicOn(true);
        sendMediaState({ audioEnabled: true });
      }
    } catch (err) {
      logger.error('麦克风操作失败', err);
    }
  };

  const toggleCamera = async () => {
    try {
      if (cameraOn) {
        if (localStreamRef.current) {
          const videoTracks = localStreamRef.current.getVideoTracks();
          for (const track of videoTracks) {
            track.stop();
            localStreamRef.current.removeTrack(track);
          }
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
          }
          setLocalStream(localStreamRef.current);
        }
        setCameraOn(false);
        sendMediaState({ videoEnabled: false });
      } else {
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: micOn,
            video: true,
          });
          localStreamRef.current = stream;
          setLocalStream(stream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        } else {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          const videoTrack = videoStream.getVideoTracks()[0];
          if (videoTrack) {
            localStreamRef.current.addTrack(videoTrack);
            setLocalStream(localStreamRef.current);
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
          }
        }
        setCameraOn(true);
        sendMediaState({ videoEnabled: true });
      }
    } catch (err) {
      logger.error('摄像头操作失败', err);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (screenOn) {
        stopScreenShare();
      } else {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        screenStreamRef.current = stream;
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
        }
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          stopScreenShare();
        });
        setScreenOn(true);
        sendMediaState({ screenSharing: true });
      }
    } catch (err) {
      logger.error('屏幕共享失败', err);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !chatInput.trim()) return;
    const content = chatInput.trim();
    setChatInput('');
    try {
      sendChatMessage(content);
    } catch (err) {
      logger.error('发送消息失败', err);
      setChatInput(content);
    }
  };

  const handleLeave = () => {
    leaveRoom();
    stopLocalStream();
    stopScreenShare();
    if (id) navigate(`/meetings/${id}`);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  // --- Media handlers ---
  const onlineParticipants = roomParticipants;
  const otherParticipants = roomParticipants.filter(
    (p) => p.userId !== user?.id,
  );

  const setRemoteVideoRef = (userId: string, el: HTMLVideoElement | null) => {
    if (el) {
      remoteVideoRefs.current.set(userId, el);
      const stream = remoteStreams.get(userId);
      if (stream) {
        el.srcObject = stream;
      }
    } else {
      remoteVideoRefs.current.delete(userId);
    }
  };

  useEffect(() => {
    for (const [userId, stream] of remoteStreams) {
      const el = remoteVideoRefs.current.get(userId);
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
      }
    }
  }, [remoteStreams]);

  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="w-10 h-10 border-4 border-[#2f3336] border-t-[#1d9bf0] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-black z-50 overflow-y-auto">
        <LoginGate
          icon={<Video className="w-12 h-12 text-[#2f3336]" />}
          title="登录后加入会议"
          description="登录后即可加入视频会议、开启摄像头和麦克风、参与会中聊天"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="w-10 h-10 border-4 border-[#2f3336] border-t-[#1d9bf0] rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50 p-6 text-center">
        <Video className="w-16 h-16 text-[#2f3336] mb-4" />
        <h2 className="text-xl font-bold text-[#e7e9ea] mb-2">
          {error || '会议不存在'}
        </h2>
        <button
          onClick={() => navigate('/meetings')}
          className="mt-4 px-6 py-2 bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-bold rounded-full transition-colors"
          data-ai-section-type="button"
        >
          返回会议列表
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black text-[#e7e9ea] flex flex-col z-50 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2f3336] bg-[#16181c] flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleLeave}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-[#e7e9ea] flex-shrink-0"
            data-ai-section-type="button"
            title="返回"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-bold truncate">{meeting.title}</h1>
            <p className="text-xs text-[#71767b] truncate">
              {formatTime(meeting.startTime)} - {formatTime(meeting.endTime)} ·{' '}
              {onlineParticipants.length} 人在线
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isMobile && (
            <button
              onClick={() => setPanelOpen((p) => !p)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-[#e7e9ea]"
              data-ai-section-type="button"
              title={panelOpen ? '隐藏面板' : '显示面板'}
            >
              <MessageSquare className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-colors text-sm flex items-center gap-2"
            data-ai-section-type="button"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">离开</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Video area */}
        <div className="flex-1 min-w-0 relative p-2 md:p-4 overflow-hidden">
          {screenOn ? (
            <div className="w-full h-full flex items-center justify-center bg-[#16181c] rounded-xl overflow-hidden">
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          ) : otherParticipants.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#16181c] rounded-xl">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-[#2f3336] flex items-center justify-center mb-4">
                <Users className="w-12 h-12 md:w-16 md:h-16 text-[#71767b]" />
              </div>
              <p className="text-lg font-bold text-[#e7e9ea]">
                {meeting.title}
              </p>
              <p className="text-sm text-[#71767b] mt-1">
                等待其他人加入...
              </p>
            </div>
          ) : (
            <div
              className={`w-full h-full grid gap-2 md:gap-3 ${
                otherParticipants.length === 1
                  ? 'grid-cols-1'
                  : otherParticipants.length <= 4
                    ? 'grid-cols-2'
                    : 'grid-cols-2 md:grid-cols-3'
              }`}
            >
              {otherParticipants.map((p) => {
                const initial = p.userName
                  ? p.userName.charAt(0).toUpperCase()
                  : '?';
                const hasVideo = remoteStreams.has(p.userId) && p.videoEnabled;
                return (
                  <div
                    key={p.userId}
                    className="relative bg-[#16181c] rounded-xl flex flex-col items-center justify-center overflow-hidden aspect-video"
                  >
                    {hasVideo ? (
                      <video
                        ref={(el) => setRemoteVideoRef(p.userId, el)}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#2f3336] flex items-center justify-center overflow-hidden">
                        {p.userAvatarUrl ? (
                          <Image
                            src={p.userAvatarUrl}
                            alt={p.userName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-2xl md:text-3xl font-bold text-gray-300">
                            {initial}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="absolute bottom-2 left-3 text-sm font-medium text-white drop-shadow truncate max-w-[80%]">
                      {p.userName}
                    </p>
                    <div className="absolute bottom-2 right-2 flex items-center gap-1">
                      {!p.audioEnabled && (
                        <MicOff className="w-4 h-4 text-red-400 drop-shadow" />
                      )}
                      <span
                        className={`w-3 h-3 rounded-full bg-green-500 ring-2 ring-[#16181c]`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Self view picture-in-picture */}
          {cameraOn && (
            <div className="absolute bottom-20 right-2 md:bottom-24 md:right-4 w-32 h-24 md:w-48 md:h-36 bg-black rounded-lg overflow-hidden shadow-lg border border-[#2f3336]">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <p className="absolute bottom-1 left-2 text-xs text-white drop-shadow">
                {user?.nickname || '我'}
              </p>
            </div>
          )}
        </div>

        {/* Side panel (desktop) */}
        {!isMobile && panelOpen && (
          <div className="w-80 border-l border-[#2f3336] bg-[#16181c] flex flex-col flex-shrink-0">
            <div className="flex border-b border-[#2f3336]">
              <button
                onClick={() => setActiveTab('participants')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'participants'
                    ? 'text-[#1d9bf0] border-b-2 border-[#1d9bf0]'
                    : 'text-[#71767b] hover:text-[#e7e9ea]'
                }`}
                data-ai-section-type="button"
              >
                参会人 ({roomParticipants.length})
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'chat'
                    ? 'text-[#1d9bf0] border-b-2 border-[#1d9bf0]'
                    : 'text-[#71767b] hover:text-[#e7e9ea]'
                }`}
                data-ai-section-type="button"
              >
                聊天
              </button>
            </div>

             {activeTab === 'participants' && (
               <div className="flex-1 overflow-y-auto p-3 space-y-1">
                 {roomParticipants.map((p) => {
                   const initial = p.userName
                     ? p.userName.charAt(0).toUpperCase()
                     : '?';
                   return (
                     <div
                       key={p.userId}
                       className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5"
                     >
                       <div className="relative w-10 h-10 rounded-full bg-[#2f3336] flex items-center justify-center flex-shrink-0 overflow-hidden">
                         {p.userAvatarUrl ? (
                           <Image
                             src={p.userAvatarUrl}
                             alt={p.userName}
                             className="w-full h-full object-cover"
                           />
                         ) : (
                           <span className="text-sm font-bold text-gray-300">
                             {initial}
                           </span>
                         )}
                         <span
                           className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 ring-2 ring-[#16181c]"
                         />
                       </div>
                       <div className="flex-1 min-w-0">
                         <p className="text-sm font-medium text-[#e7e9ea] truncate">
                           {p.userName}
                           {p.userId === meeting.creatorId && (
                             <span className="ml-1 text-xs text-[#71767b]">
                               (主持人)
                             </span>
                           )}
                         </p>
                         <div className="flex items-center gap-2 text-xs text-[#71767b]">
                           <span>在线</span>
                           {p.videoEnabled && <Camera className="w-3 h-3" />}
                           {!p.audioEnabled && <MicOff className="w-3 h-3 text-red-400" />}
                           {p.screenSharing && <MonitorUp className="w-3 h-3" />}
                         </div>
                       </div>
                     </div>
                   );
                 })}
               </div>
             )}

            {activeTab === 'chat' && (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-8">
                      <MessageSquare className="w-10 h-10 text-[#2f3336] mb-2" />
                      <p className="text-sm text-[#71767b]">暂无消息</p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => {
                      const isOwn = msg.senderId === user?.id;
                      const initial = msg.senderName
                        ? msg.senderName.charAt(0).toUpperCase()
                        : '?';
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}
                        >
                          <div className="w-8 h-8 rounded-full bg-[#2f3336] flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {msg.senderAvatarUrl ? (
                              <Image
                                src={msg.senderAvatarUrl}
                                alt={msg.senderName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-bold text-gray-300">
                                {initial}
                              </span>
                            )}
                          </div>
                          <div
                            className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}
                          >
                            {!isOwn && (
                              <p className="text-xs text-[#71767b] mb-1">
                                {msg.senderName}
                              </p>
                            )}
                            <div
                              className={`px-3 py-2 rounded-2xl text-sm break-words ${
                                isOwn
                                  ? 'bg-[#1d9bf0] text-white rounded-br-md'
                                  : 'bg-[#2f3336] text-[#e7e9ea] rounded-bl-md'
                              }`}
                            >
                              {msg.content}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>
                <form
                  onSubmit={handleSendChat}
                  className="p-3 border-t border-[#2f3336] flex gap-2"
                >
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="输入消息..."
                    className="bg-[#2f3336] border-0 text-sm text-[#e7e9ea]"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="p-2 bg-[#1d9bf0] hover:bg-[#1a8cd8] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    data-ai-section-type="button"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom control bar */}
      <div className="flex items-center justify-center gap-3 md:gap-4 py-3 border-t border-[#2f3336] bg-[#16181c] flex-shrink-0">
        {isMobile && (
          <button
            onClick={() => setPanelOpen(true)}
            className="p-3 rounded-full bg-[#2f3336] hover:bg-[#3e4246] text-[#e7e9ea] transition-colors"
            data-ai-section-type="button"
            title="聊天"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={toggleMic}
          className={`p-3 md:p-4 rounded-full transition-colors ${
            micOn
              ? 'bg-[#2f3336] hover:bg-[#3e4246] text-[#e7e9ea]'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
          data-ai-section-type="button"
          title={micOn ? '关闭麦克风' : '开启麦克风'}
        >
          {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        <button
          onClick={toggleCamera}
          className={`p-3 md:p-4 rounded-full transition-colors ${
            cameraOn
              ? 'bg-[#2f3336] hover:bg-[#3e4246] text-[#e7e9ea]'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
          data-ai-section-type="button"
          title={cameraOn ? '关闭摄像头' : '开启摄像头'}
        >
          {cameraOn ? (
            <Camera className="w-5 h-5" />
          ) : (
            <CameraOff className="w-5 h-5" />
          )}
        </button>

        <button
          onClick={toggleScreenShare}
          className={`p-3 md:p-4 rounded-full transition-colors ${
            screenOn
              ? 'bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white'
              : 'bg-[#2f3336] hover:bg-[#3e4246] text-[#e7e9ea]'
          }`}
          data-ai-section-type="button"
          title={screenOn ? '停止共享' : '共享屏幕'}
        >
          <MonitorUp className="w-5 h-5" />
        </button>

        {!isMobile && (
          <button
            onClick={() => setPanelOpen((p) => !p)}
            className="p-3 md:p-4 rounded-full bg-[#2f3336] hover:bg-[#3e4246] text-[#e7e9ea] transition-colors"
            data-ai-section-type="button"
            title={panelOpen ? '隐藏聊天' : '显示聊天'}
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={handleLeave}
          className="p-3 md:p-4 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors"
          data-ai-section-type="button"
          title="离开会议"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile bottom sheet panel */}
      {isMobile && panelOpen && (
        <div className="fixed inset-0 z-50 flex flex-col">
          <div
            className="flex-1 bg-black/60"
            onClick={() => setPanelOpen(false)}
          />
          <div className="bg-[#16181c] rounded-t-2xl max-h-[70vh] flex flex-col">
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-[#2f3336] rounded-full" />
            </div>
            <div className="flex border-b border-[#2f3336]">
              <button
                onClick={() => setActiveTab('participants')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'participants'
                    ? 'text-[#1d9bf0] border-b-2 border-[#1d9bf0]'
                    : 'text-[#71767b]'
                }`}
                data-ai-section-type="button"
              >
                参会人 ({roomParticipants.length})
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'chat'
                    ? 'text-[#1d9bf0] border-b-2 border-[#1d9bf0]'
                    : 'text-[#71767b]'
                }`}
                data-ai-section-type="button"
              >
                聊天
              </button>
            </div>

            {activeTab === 'participants' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {roomParticipants.map((p) => {
                  const initial = p.userName
                    ? p.userName.charAt(0).toUpperCase()
                    : '?';
                  return (
                    <div
                      key={p.userId}
                      className="flex items-center gap-3 p-2 rounded-lg"
                    >
                      <div className="relative w-10 h-10 rounded-full bg-[#2f3336] flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {p.userAvatarUrl ? (
                          <Image
                            src={p.userAvatarUrl}
                            alt={p.userName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-bold text-gray-300">
                            {initial}
                          </span>
                        )}
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 ring-2 ring-[#16181c]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#e7e9ea] truncate">
                          {p.userName}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-[#71767b]">
                          <span>在线</span>
                          {p.videoEnabled && <Camera className="w-3 h-3" />}
                          {!p.audioEnabled && <MicOff className="w-3 h-3 text-red-400" />}
                          {p.screenSharing && <MonitorUp className="w-3 h-3" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'chat' && (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <MessageSquare className="w-10 h-10 text-[#2f3336] mb-2" />
                      <p className="text-sm text-[#71767b]">暂无消息</p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => {
                      const isOwn = msg.senderId === user?.id;
                      const initial = msg.senderName
                        ? msg.senderName.charAt(0).toUpperCase()
                        : '?';
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}
                        >
                          <div className="w-8 h-8 rounded-full bg-[#2f3336] flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {msg.senderAvatarUrl ? (
                              <Image
                                src={msg.senderAvatarUrl}
                                alt={msg.senderName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-bold text-gray-300">
                                {initial}
                              </span>
                            )}
                          </div>
                          <div className={`max-w-[70%] ${isOwn ? 'items-end' : ''}`}>
                            <div
                              className={`px-3 py-2 rounded-2xl text-sm break-words ${
                                isOwn
                                  ? 'bg-[#1d9bf0] text-white rounded-br-md'
                                  : 'bg-[#2f3336] text-[#e7e9ea] rounded-bl-md'
                              }`}
                            >
                              {msg.content}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>
                <form
                  onSubmit={handleSendChat}
                  className="p-3 border-t border-[#2f3336] flex gap-2"
                >
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="输入消息..."
                    className="bg-[#2f3336] border-0 text-sm text-[#e7e9ea]"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="p-2 bg-[#1d9bf0] hover:bg-[#1a8cd8] disabled:opacity-50 text-white rounded-lg transition-colors"
                    data-ai-section-type="button"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingRoomPage;
