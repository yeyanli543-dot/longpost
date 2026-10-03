import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { useAuth } from '@client/src/hooks/useAuth';
import { followsApi } from '@client/src/api';
import type { FollowUserResponse } from '@shared/api.interface';

interface FollowButtonProps {
  userId: string;
  isFollowing?: boolean;
  onToggle?: (following: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
}

const FollowButton = ({
  userId,
  isFollowing = false,
  onToggle,
  size = 'md',
}: FollowButtonProps) => {
  const { user } = useAuth();

  const [localFollowing, setLocalFollowing] = useState(isFollowing);
  const [loading, setLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [bounceKey, setBounceKey] = useState(0);
  const prevFollowingRef = useRef(isFollowing);

  // Trigger bounce animation when follow state changes
  useEffect(() => {
    if (prevFollowingRef.current !== localFollowing) {
      setBounceKey((k) => k + 1);
    }
    prevFollowingRef.current = localFollowing;
  }, [localFollowing]);

  const handleClick = useCallback(async () => {
    if (!user) {
      toast.info('请先登录后再关注用户');
      return;
    }
    if (loading) return;

    const prevFollowing = localFollowing;

    // Optimistic update
    setLocalFollowing(!prevFollowing);
    setLoading(true);

    try {
      const result: FollowUserResponse = await followsApi.toggleFollow(userId);
      setLocalFollowing(result.following);
      onToggle?.(result.following);
    } catch (err) {
      logger.error('关注操作失败', err);
      // Rollback
      setLocalFollowing(prevFollowing);
      toast.error('操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [user, loading, localFollowing, userId, onToggle]);

  const sizeClasses =
    size === 'sm'
      ? 'px-4 py-1 text-sm font-bold'
      : size === 'lg'
        ? 'px-6 py-2.5 text-base font-bold'
        : 'px-5 py-2 text-sm font-bold';

  const getButtonText = (): string => {
    if (localFollowing) {
      return isHovered ? '取消关注' : '已关注';
    }
    return '关注';
  };

  const getButtonClasses = (): string => {
    const base = `rounded-full transition-all duration-200 ease-out active:scale-95 ${sizeClasses}`;

    if (localFollowing) {
      if (isHovered) {
        return `${base} bg-red-600 hover:bg-red-700 text-white border border-red-600`;
      }
      return `${base} bg-gray-700 text-white border border-gray-600`;
    }

    return `${base} bg-blue-500 hover:bg-blue-600 text-white border border-blue-500 hover:scale-[1.02]`;
  };

  return (
    <motion.button
      key={bounceKey}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={loading}
      className={getButtonClasses()}
      data-ai-section-type="button"
      style={{ minWidth: localFollowing && isHovered ? '88px' : undefined }}
      animate={{
        scale: bounceKey > 0 ? [1, 1.1, 0.95, 1.05, 1] : 1,
        opacity: loading ? 0.7 : 1,
      }}
      transition={{
        scale: { duration: 0.4, ease: 'easeOut' },
        opacity: { duration: 0.2 },
      }}
    >
      <span
        className="inline-block transition-all duration-200 ease-out"
        key={`${localFollowing}-${isHovered}`}
        style={{
          opacity: 1,
          animation: 'fade-slide-in 200ms ease-out',
        }}
      >
        {getButtonText()}
      </span>
    </motion.button>
  );
};

// Inline fade-slide keyframe
const _fbtnStyleId = 'follow-btn-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(_fbtnStyleId)) {
  const s = document.createElement('style');
  s.id = _fbtnStyleId;
  s.textContent = `
    @keyframes fade-slide-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(s);
}

export default FollowButton;
