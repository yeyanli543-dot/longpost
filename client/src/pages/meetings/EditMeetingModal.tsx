import CreateMeetingModal from './CreateMeetingModal';
import type { MeetingDetail } from '@shared/api.interface';

interface EditMeetingModalProps {
  open: boolean;
  onClose: () => void;
  meeting: MeetingDetail;
  onUpdated: () => void;
}

const EditMeetingModal = ({
  open,
  onClose,
  meeting,
  onUpdated,
}: EditMeetingModalProps) => {
  const startDate = new Date(meeting.startTime);
  const y = startDate.getFullYear();
  const m = (startDate.getMonth() + 1).toString().padStart(2, '0');
  const d = startDate.getDate().toString().padStart(2, '0');
  const h = startDate.getHours().toString().padStart(2, '0');
  const min = startDate.getMinutes().toString().padStart(2, '0');

  return (
    <CreateMeetingModal
      open={open}
      onClose={onClose}
      onCreated={onUpdated}
      mode="edit"
      meetingId={meeting.id}
      initialData={{
        title: meeting.title,
        description: meeting.description ?? '',
        startTime: `${y}-${m}-${d}T${h}:${min}`,
        durationMinutes: meeting.durationMinutes,
        isPublic: meeting.isPublic,
        participantIds: meeting.participants.map((p) => p.userId),
      }}
    />
  );
};

export default EditMeetingModal;
