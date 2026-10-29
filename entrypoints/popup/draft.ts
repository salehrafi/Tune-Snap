import type { SongDraft } from '@/lib/types/song';
import type { ReelDetectionState } from './hooks/useReelDetection';

export function blankDraft(
  source: SongDraft['source'] = 'manual',
  reelUrl: string | null = null,
): SongDraft {
  return {
    title: '',
    artist: '',
    source,
    reelUrl,
    origin: 'manual',
    confidence: null,
  };
}

/**
 * Seed the editable draft from the detection result. Detected values are
 * tagged `detected`; empty drafts for manual entry stay `manual`.
 */
export function draftFromDetection(state: ReelDetectionState): SongDraft {
  if (state.status === 'ready') {
    const { detection } = state;
    if (detection.track) {
      return {
        title: detection.track.title,
        artist: detection.track.artist ?? '',
        source: detection.platform ?? 'manual',
        reelUrl: detection.reelUrl,
        origin: 'detected',
        confidence: detection.track.confidence,
      };
    }
    return blankDraft(detection.platform ?? 'manual', detection.reelUrl);
  }

  if (state.status === 'unavailable') {
    return blankDraft(state.platform, state.reelUrl);
  }

  return blankDraft();
}

/** Apply a user edit, marking detected metadata as edited. */
export function applyEdit(
  draft: SongDraft,
  patch: Partial<Pick<SongDraft, 'title' | 'artist'>>,
): SongDraft {
  return {
    ...draft,
    ...patch,
    origin: draft.origin === 'detected' ? 'edited' : draft.origin,
  };
}
