import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  Globe,
  Lock,
  Video,
  Pencil,
  Trash2,
  LogOut,
  LogIn,
  Copy,
  Check,
  UserPlus,
  X,
  FileText,
  Loader2,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { useAuth } from '@client/src/hooks/useAuth';
import { Image } from '@client/src/components/ui/image';
import { Textarea } from '@client/src/components/ui/textarea';
import { meetingsApi } from '@client/src/api';
import type {
  MeetingDetail,
  MeetingParticipant,
  MeetingMinutes,
  MeetingStatus,
} from '@shared/api.interface';
import EditMeetingModal from './EditMeetingModal';
import { showConfirm } from '@/lib';

const getStatusColor = (status: MeetingStatus) => {
  switch (status) {
    case 'ongoing':
      return 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30';
    case 'scheduled':
      return 'bg-primary/15 text-primary border-primary/30';
    case 'ended':
      return 'bg-muted text-muted-foreground border-border';
    case 'cancelled':
      return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

const getStatusLabel = (status: MeetingStatus) => {
  switch (status) {
    case 'scheduled':
      return '即将开始';
    case 'ongoing':
      return '进行中';
    case 'ended':
      return '已结束';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
};

const getParticipantStatusColor = (status: MeetingParticipant['status']) => {
  switch (status) {
    case 'online':
      return 'bg-green-500';
    case 'offline':
      return 'bg-gray-500';
    case 'left':
      return 'bg-gray-600';
    default:
      return 'bg-yellow-500';
  }
};

const getParticipantStatusText = (status: MeetingParticipant['status']) => {
  switch (status) {
    case 'online':
      return '在线';
    case 'offline':
      return '离线';
    case 'left':
      return '已离开';
    default:
      return '已邀请';
  }
};

const MeetingDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Minutes state
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(null);
  const [minutesLoading, setMinutesLoading] = useState(false);
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [minutesContent, setMinutesContent] = useState('');
  const [savingMinutes, setSavingMinutes] = useState(false);

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

  const loadMinutes = useCallback(async () => {
    if (!id || !user) return;
    try {
      setMinutesLoading(true);
      const data = await meetingsApi.getMinutes(id);
      setMinutes(data);
      if (data) setMinutesContent(data.content);
    } catch (err) {
      logger.error('加载会议纪要失败', err);
    } finally {
      setMinutesLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    void loadMeeting();
  }, [loadMeeting]);

  useEffect(() => {
    if (meeting?.status === 'ended') {
      void loadMinutes();
    }
  }, [meeting?.status, loadMinutes]);

  const handleCopyLink = () => {
    const url = window.location.href;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoinMeeting = async () => {
    if (!id || !user) return;
    setActionLoading('join');
    try {
      await meetingsApi.joinMeeting(id);
      navigate(`/meetings/${id}/room`);
    } catch (err) {
      logger.error('加入会议失败', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLeaveMeeting = async () => {
    if (!id) return;
    if (!await showConfirm('确定要退出会议吗？')) return;
    setActionLoading('leave');
    try {
      await meetingsApi.leaveMeeting(id);
      await loadMeeting();
    } catch (err) {
      logger.error('退出会议失败', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelMeeting = async () => {
    if (!id) return;
    if (!await showConfirm('确定要取消这个会议吗？此操作不可撤销。')) return;
    setActionLoading('cancel');
    try {
      await meetingsApi.cancelMeeting(id);
      await loadMeeting();
    } catch (err) {
      logger.error('取消会议失败', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEndMeeting = async () => {
    if (!id) return;
    if (!await showConfirm('确定要结束会议吗？结束后所有人将被移出会议。')) return;
    setActionLoading('end');
    try {
      await meetingsApi.endMeeting(id);
      await loadMeeting();
    } catch (err) {
      logger.error('结束会议失败', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!id) return;
    if (!await showConfirm('确定要移除该参会人吗？')) return;
    try {
      await meetingsApi.removeParticipant(id, userId);
      await loadMeeting();
    } catch (err) {
      logger.error('移除参会人失败', err);
    }
  };

  const handleSaveMinutes = async () => {
    if (!id) return;
    setSavingMinutes(true);
    try {
      const response = await meetingsApi.updateMinutes(id, minutesContent);
      setMinutes(response.minutes);
      setEditingMinutes(false);
    } catch (err) {
      logger.error('保存会议纪要失败', err);
    } finally {
      setSavingMinutes(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${y}年${m}月${day}日 ${h}:${min}`;
  };

  const formatTimeRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const sh = s.getHours().toString().padStart(2, '0');
    const sm = s.getMinutes().toString().padStart(2, '0');
    const eh = e.getHours().toString().padStart(2, '0');
    const em = e.getMinutes().toString().padStart(2, '0');
    return `${sh}:${sm} - ${eh}:${em}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <Video className="w-16 h-16 text-muted-foreground/60 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">
          {error || '会议不存在'}
        </h2>
        <button
          onClick={() => navigate('/meetings')}
          className="mt-4 px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full transition-colors"
          data-ai-section-type="button"
        >
          返回会议列表
        </button>
      </div>
    );
  }

  const isCreator = meeting.isCurrentUserCreator;
  const isParticipant = meeting.isCurrentUserParticipant;
  const canJoin = meeting.status === 'scheduled' || meeting.status === 'ongoing';
  const canEnterRoom = meeting.status === 'ongoing' && isParticipant;
  const creatorAvatarInitial = meeting.creatorName
    ? meeting.creatorName.charAt(0).toUpperCase()
    : '?';

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 pt-safe">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/meetings')}
            className="p-2 rounded-full hover:bg-accent transition-colors text-foreground -ml-2"
            data-ai-section-type="button"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-foreground truncate">
            会议详情
          </h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Title & status */}
        <div>
          <div className="flex items-start justify-between gap-3 mb-2">
            <h2 className="text-2xl font-bold text-foreground leading-tight">
              {meeting.title}
            </h2>
            <span
              className={`flex-shrink-0 px-3 py-1 text-xs font-semibold rounded-full border ${getStatusColor(meeting.status)}`}
            >
              {getStatusLabel(meeting.status)}
            </span>
          </div>

          {/* Creator */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
              {meeting.creatorAvatarUrl ? (
                <Image
                  src={meeting.creatorAvatarUrl}
                  alt={meeting.creatorName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[10px] font-bold text-muted-foreground">
                  {creatorAvatarInitial}
                </span>
              )}
            </div>
            <span>{meeting.creatorName}</span>
            <span className="text-muted-foreground/60">·</span>
            <span>主持人</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {canEnterRoom && (
            <button
              onClick={() => navigate(`/meetings/${id}/room`)}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full transition-colors"
              data-ai-section-type="button"
            >
              <Video className="w-5 h-5" />
              进入会议室
            </button>
          )}
          {!canEnterRoom && canJoin && user && !isParticipant && (
            <button
              onClick={handleJoinMeeting}
              disabled={actionLoading === 'join'}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-bold rounded-full transition-colors"
              data-ai-section-type="button"
            >
              {actionLoading === 'join' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              加入会议
            </button>
          )}
          {!user && canJoin && (
            <button
              onClick={() => navigate('/login')}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full transition-colors"
              data-ai-section-type="button"
            >
              <LogIn className="w-5 h-5" />
              登录后加入
            </button>
          )}
          {isParticipant && meeting.status === 'ongoing' && !canEnterRoom && (
            <button
              onClick={() => navigate(`/meetings/${id}/room`)}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full transition-colors"
              data-ai-section-type="button"
            >
              <Video className="w-5 h-5" />
              进入会议室
            </button>
          )}
          {isParticipant && canJoin && (
            <button
              onClick={handleLeaveMeeting}
              disabled={actionLoading === 'leave'}
              className="flex items-center justify-center gap-2 px-4 py-3 border border-border text-foreground hover:bg-card disabled:opacity-50 font-bold rounded-full transition-colors"
              data-ai-section-type="button"
            >
              {actionLoading === 'leave' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogOut className="w-5 h-5" />
              )}
              <span className="hidden sm:inline">退出</span>
            </button>
          )}
          <button
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-2 px-4 py-3 border border-border text-foreground hover:bg-card font-bold rounded-full transition-colors"
            data-ai-section-type="button"
          >
            {copied ? (
              <Check className="w-5 h-5 text-green-400" />
            ) : (
              <Copy className="w-5 h-5" />
            )}
            <span className="hidden sm:inline">{copied ? '已复制' : '复制链接'}</span>
          </button>
        </div>

        {/* Meeting info card */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-sm text-muted-foreground">开始时间</p>
              <p className="text-foreground font-medium">
                {formatDate(meeting.startTime)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-sm text-muted-foreground">时长</p>
              <p className="text-foreground font-medium">
                {formatTimeRange(meeting.startTime, meeting.endTime)}
                <span className="text-muted-foreground ml-2">
                  ({meeting.durationMinutes} 分钟)
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {meeting.isPublic ? (
              <Globe className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            ) : (
              <Lock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">可见性</p>
              <p className="text-foreground font-medium">
                {meeting.isPublic ? '公开会议' : '私密会议'}
              </p>
            </div>
          </div>
          {meeting.description && (
            <div className="pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground mb-2">描述</p>
              <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                {meeting.description}
              </p>
            </div>
          )}
        </div>

        {/* Creator actions */}
        {isCreator && (meeting.status === 'scheduled' || meeting.status === 'ongoing') && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="font-bold text-foreground mb-3">会议管理</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center justify-center gap-2 py-2.5 bg-secondary hover:bg-accent text-foreground rounded-xl transition-colors text-sm font-medium"
                data-ai-section-type="button"
              >
                <Pencil className="w-4 h-4" />
                编辑会议
              </button>
              <button
                onClick={() => navigate(`/meetings/${id}/room`)}
                className="flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-colors text-sm font-medium"
                data-ai-section-type="button"
              >
                <UserPlus className="w-4 h-4" />
                管理参会人
              </button>
              {meeting.status === 'ongoing' && (
                <button
                  onClick={handleEndMeeting}
                  disabled={actionLoading === 'end'}
                  className="flex items-center justify-center gap-2 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-xl transition-colors text-sm font-medium disabled:opacity-50"
                  data-ai-section-type="button"
                >
                  {actionLoading === 'end' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <X className="w-4 h-4" />
                  )}
                  结束会议
                </button>
              )}
              {meeting.status === 'scheduled' && (
                <button
                  onClick={handleCancelMeeting}
                  disabled={actionLoading === 'cancel'}
                  className="flex items-center justify-center gap-2 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-xl transition-colors text-sm font-medium disabled:opacity-50"
                  data-ai-section-type="button"
                >
                  {actionLoading === 'cancel' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  取消会议
                </button>
              )}
            </div>
          </div>
        )}

        {/* Participants */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5" />
              参会人 ({meeting.participants.length})
            </h3>
          </div>
          <div className="space-y-2">
            {meeting.participants.map((p) => {
              const initial = p.userName
                ? p.userName.charAt(0).toUpperCase()
                : '?';
              const isCreatorUser = p.userId === meeting.creatorId;
              return (
                <div
                  key={p.userId}
                  className="flex items-center gap-3 py-2 group"
                >
                  <div className="relative w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {p.userAvatarUrl ? (
                      <Image
                        src={p.userAvatarUrl}
                        alt={p.userName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-bold text-foreground/90">
                        {initial}
                      </span>
                    )}
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${getParticipantStatusColor(p.status)} ring-2 ring-card`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {p.userName}
                      {isCreatorUser && (
                        <span className="ml-1.5 text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded">
                          主持人
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getParticipantStatusText(p.status)}
                    </p>
                  </div>
                  {isCreator && !isCreatorUser && meeting.status === 'scheduled' && (
                    <button
                      onClick={() => handleRemoveParticipant(p.userId)}
                      className="p-2 rounded-full text-muted-foreground hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                      data-ai-section-type="button"
                      title="移除参会人"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Meeting minutes (only when ended) */}
        {meeting.status === 'ended' && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <FileText className="w-5 h-5" />
                会议纪要
              </h3>
              {isCreator && !editingMinutes && (
                <button
                  onClick={() => {
                    setEditingMinutes(true);
                    if (minutes) setMinutesContent(minutes.content);
                  }}
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
                  data-ai-section-type="button"
                >
                  <Pencil className="w-4 h-4" />
                  编辑
                </button>
              )}
            </div>
            {minutesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : editingMinutes ? (
              <div className="space-y-3">
                <Textarea
                  value={minutesContent}
                  onChange={(e) => setMinutesContent(e.target.value)}
                  placeholder="记录会议要点、决议、待办事项..."
                  className="min-h-[200px] bg-background border-border text-foreground text-sm resize-y"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setEditingMinutes(false);
                      if (minutes) setMinutesContent(minutes.content);
                    }}
                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-ai-section-type="button"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveMinutes}
                    disabled={savingMinutes}
                    className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-bold rounded-full transition-colors"
                    data-ai-section-type="button"
                  >
                    {savingMinutes ? (
                      <Loader2 className="w-4 h-4 animate-spin inline" />
                    ) : (
                      '保存'
                    )}
                  </button>
                </div>
              </div>
            ) : minutes ? (
              <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {minutes.content}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无会议纪要</p>
            )}
            {minutes && (
              <p className="mt-3 text-xs text-muted-foreground">
                最后更新：{minutes.updatedByName} ·{' '}
                {formatDate(minutes.updatedAt)}
              </p>
            )}
          </div>
        )}
      </div>

      <EditMeetingModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        meeting={meeting}
        onUpdated={() => {
          setShowEditModal(false);
          void loadMeeting();
        }}
      />
    </div>
  );
};

export default MeetingDetailPage;
