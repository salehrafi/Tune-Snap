import type { NoticeMessage } from '../view-types';

export function Notice({ notice }: { notice: NoticeMessage }) {
  return (
    <div className={`notice notice--${notice.kind}`} role="status" aria-live="polite">
      {notice.text}
    </div>
  );
}
