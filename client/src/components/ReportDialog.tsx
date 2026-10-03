import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flag, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { adminApi } from '@client/src/api';
import { useAuth } from '@client/src/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import type { ReportContentType, ReportReason } from '@shared/api.interface';

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: '垃圾信息' },
  { value: 'misinformation', label: '不实信息' },
  { value: 'harassment', label: '骚扰/辱骂' },
  { value: 'infringement', label: '侵权内容' },
  { value: 'other', label: '其他原因' },
];

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  contentType: ReportContentType;
  contentId: string;
}

const ReportDialog = ({ open, onClose, contentType, contentId }: ReportDialogProps) => {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!user) {
      onClose();
      navigate('/login');
      toast.info('请先登录后再举报');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.createReport({
        contentType,
        contentId,
        reason,
        description: description || undefined,
      });
      toast.success('举报已提交，我们会尽快处理');
      setDescription('');
      setReason('spam');
      onClose();
    } catch (err) {
      logger.error('举报失败', err);
      toast.error('举报提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-[#16181c] border border-[#2f3336] rounded-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2f3336]">
          <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-400" />
            举报内容
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              举报原因
            </label>
            <div className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    reason === r.value
                      ? 'bg-blue-500/10 border border-blue-500/30'
                      : 'bg-[#000] border border-[#2f3336] hover:border-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <span className="text-sm text-gray-100">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              补充说明（可选）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请描述具体问题..."
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 bg-black border border-[#2f3336] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
            <p className="mt-1 text-xs text-gray-500 text-right">
              {description.length}/500
            </p>
          </div>
        </div>

        <div className="flex gap-3 px-4 py-3 border-t border-[#2f3336]">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm text-gray-300 bg-[#2f3336] hover:bg-gray-700 rounded-full transition-colors"
            disabled={submitting}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-full transition-colors disabled:opacity-50"
          >
            {submitting ? '提交中...' : '提交举报'}
          </button>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ReportDialog;
