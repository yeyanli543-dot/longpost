import { ShieldCheck } from 'lucide-react';

interface AdminBadgeProps {
  size?: 'sm' | 'md';
}

const AdminBadge = ({ size = 'sm' }: AdminBadgeProps) => {
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 ${padding} rounded-full bg-blue-500/20 text-blue-400 font-semibold ${textSize} flex-shrink-0`}
      title="管理员"
    >
      <ShieldCheck className={iconSize} />
      <span>管理员</span>
    </span>
  );
};

export default AdminBadge;
