import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video,
  Plus,
  Calendar,
  Clock,
  Users,
  Loader2,
  LogIn,
  ChevronRight,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { useAuth } from '@client/src/hooks/useAuth';
import LoginGate from '@client/src/components/LoginGate';
import { Image } from '@client/src/components/ui/image';
import { meetingsApi } from '@client/src/api';
import type { MeetingItem, MeetingStatus } from '@shared/api.interface';
import CreateMeetingModal from './CreateMeetingModal';

const statusTabs: { key: 'all' | MeetingStatus; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'scheduled', label: '即将开始' },
  { key: 'ongoing', label: '进行中' },
  { key: 'ended', label: '已结束' },
  { key: 'cancelled', label: '已取消' },
];

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

const MeetingsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | MeetingStatus>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const loadMeetings = async () => {
    try {
      setLoading(true);
      const params: { status?: string; page: number; pageSize: number } = {
        page,
        pageSize,
      };
      if (activeTab !== 'all') params.status = activeTab;
      const response = await meetingsApi.getMeetings(params);
      setMeetings(response.items);
      setTotal(response.total);
    } catch (error) {
      logger.error('加载会议列表失败', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    if (!user) return;
    void loadMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page, user]);

  const handleMeetingCreated = () => {
    setShowCreateModal(false);
    void loadMeetings();
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const month = d.getMonth() + 1;
    const day = d.getDate();
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');

    let dateStr = `${month}月${day}日`;
    if (sameDay) dateStr = '今天';
    else if (isTomorrow) dateStr = '明天';

    return `${dateStr} ${h}:${m}`;
  };

  const getTimeRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const sh = s.getHours().toString().padStart(2, '0');
    const sm = s.getMinutes().toString().padStart(2, '0');
    const eh = e.getHours().toString().padStart(2, '0');
    const em = e.getMinutes().toString().padStart(2, '0');
    return `${sh}:${sm} - ${eh}:${em}`;
  };

  const totalPages = Math.ceil(total / pageSize);

  if (!user) {
    return (
      <LoginGate
        icon={<Video className="w-12 h-12 text-muted-foreground/60" />}
        title="登录后查看会议"
        description="登录后即可预约会议、加入视频会议并查看会议纪要"
      />
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 pt-safe">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">会议</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full transition-colors text-sm"
            data-ai-section-type="button"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">创建会议</span>
            <span className="sm:hidden">创建</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-border px-2 sticky top-[57px] bg-background z-10 scrollbar-hide">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative flex-shrink-0 ${
              activeTab === tab.key
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-ai-section-type="button"
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Meeting list */}
      <div data-ai-section-type="card-list">
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <Video className="w-16 h-16 text-muted-foreground/60 mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">暂无会议</h2>
            <p className="text-muted-foreground text-sm mb-6">
              {activeTab === 'all'
                ? '创建第一个会议，开始高效协作'
                : `暂无${statusTabs.find((t) => t.key === activeTab)?.label}的会议`}
            </p>
            {user ? (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full transition-colors"
                data-ai-section-type="button"
              >
                创建会议
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full transition-colors"
                data-ai-section-type="button"
              >
                <LogIn className="w-4 h-4" />
                登录后创建
              </button>
            )}
          </div>
        ) : (
          meetings.map((meeting) => {
            const avatarInitial = meeting.creatorName
              ? meeting.creatorName.charAt(0).toUpperCase()
              : '?';
            const canJoin = meeting.status === 'ongoing' || meeting.status === 'scheduled';
            return (
              <div
                key={meeting.id}
                onClick={() => navigate(`/meetings/${meeting.id}`)}
                className="px-4 py-4 border-b border-border cursor-pointer hover:bg-white/[0.02] transition-colors group"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-bold text-foreground text-lg group-hover:text-primary transition-colors line-clamp-2">
                    {meeting.title}
                  </h3>
                  <span
                    className={`flex-shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full border ${getStatusColor(meeting.status)}`}
                  >
                    {getStatusLabel(meeting.status)}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDateTime(meeting.startTime)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span>{getTimeRange(meeting.startTime, meeting.endTime)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                      {meeting.creatorAvatarUrl ? (
                        <Image
                          src={meeting.creatorAvatarUrl}
                          alt={meeting.creatorName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {avatarInitial}
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {meeting.creatorName}
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>{meeting.participantCount}</span>
                    </div>
                    {meeting.isPublic && (
                      <>
                        <span className="text-muted-foreground/60">·</span>
                        <span className="text-xs px-2 py-0.5 bg-secondary rounded text-muted-foreground">
                          公开
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {canJoin && user && meeting.status === 'ongoing' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/meetings/${meeting.id}/room`);
                        }}
                        className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-full transition-colors"
                        data-ai-section-type="button"
                      >
                        加入
                      </button>
                    )}
                    <ChevronRight className="w-5 h-5 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm text-foreground border border-border rounded-full hover:bg-card disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-ai-section-type="button"
          >
            上一页
          </button>
          <span className="text-sm text-muted-foreground px-2">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 text-sm text-foreground border border-border rounded-full hover:bg-card disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-ai-section-type="button"
          >
            下一页
          </button>
        </div>
      )}

      <CreateMeetingModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleMeetingCreated}
      />
    </div>
  );
};

export default MeetingsPage;
