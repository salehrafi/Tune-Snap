import type { ApiKeySource } from '@/lib/storage/settings';
import type { RankedVideo, SearchFailureReason } from '@/lib/types/youtube';

export type SearchViewState =
  | { status: 'idle' }
  | { status: 'searching' }
  | {
      status: 'results';
      query: string;
      videos: RankedVideo[];
      confident: boolean;
      fromCache: boolean;
    }
  | {
      status: 'error';
      query: string;
      reason: SearchFailureReason;
      message: string;
    };

export interface NoticeMessage {
  kind: 'success' | 'error' | 'info';
  text: string;
}

export interface ApiKeyStatus {
  loading: boolean;
  key: string | null;
  source: ApiKeySource;
}
