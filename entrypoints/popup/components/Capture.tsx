import type { SongDraft } from '@/lib/types/song';
import type { RankedVideo } from '@/lib/types/youtube';
import type { ReelDetectionState } from '../hooks/useReelDetection';
import type { ApiKeyStatus, SearchViewState } from '../view-types';
import { platformNoun } from '../format';
import { CheckIcon, ExternalIcon, PlayIcon, PlusIcon, RefreshIcon } from './Icon';
import { SearchResults } from './SearchResults';
import { SongForm } from './SongForm';

interface CaptureProps {
  detection: ReelDetectionState;
  draft: SongDraft;
  editing: boolean;
  search: SearchViewState;
  selectedVideo: RankedVideo | null;
  apiKey: ApiKeyStatus;
  searching: boolean;
  saving: boolean;
  onEditStart: () => void;
  onEditDone: () => void;
  onReset: () => void;
  onChange: (patch: Partial<Pick<SongDraft, 'title' | 'artist'>>) => void;
  onSwap: () => void;
  onPlayNow: () => void;
  onAdd: () => void;
  onChooseVideo: (video: RankedVideo) => void;
  onOpenUrl: (url: string) => void;
  onOpenSearch: (query: string) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
}

function EmptyDetect({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-detect">
      <p className="empty-title">{title}</p>
      <p className="muted">{body}</p>
    </div>
  );
}

export function Capture({
  detection,
  draft,
  editing,
  search,
  selectedVideo,
  apiKey,
  searching,
  saving,
  onEditStart,
  onEditDone,
  onReset,
  onChange,
  onSwap,
  onPlayNow,
  onAdd,
  onChooseVideo,
  onOpenUrl,
  onOpenSearch,
  onOpenSettings,
  onRefresh,
}: CaptureProps) {
  if (detection.status === 'unsupported') {
    return (
      <div className="capture">
        <section className="card song-card" aria-label="Instagram Reels only">
          <EmptyDetect
            title="This extension works only on Instagram Reels."
            body="Open an Instagram Reel and click Tune Snap to detect its music."
          />
        </section>
      </div>
    );
  }

  if (
    detection.status === 'not-reel' ||
    (detection.status === 'ready' && !detection.detection.isReel)
  ) {
    return (
      <div className="capture">
        <section className="card song-card" aria-label="Open an Instagram Reel">
          <EmptyDetect
            title="Open an Instagram Reel to detect its music."
            body="This page isn’t a Reel. Open an Instagram Reel and click Tune Snap again."
          />
        </section>
      </div>
    );
  }

  const hasTitle = draft.title.trim().length > 0;
  const detecting = detection.status === 'loading';
  const track = detection.status === 'ready' ? detection.detection.track : null;
  const detectionReason = detection.status === 'ready' ? detection.detection.reason : null;
  const diagnostics = detection.status === 'ready' ? detection.detection.diagnostics : undefined;
  const showForm = editing || (!track && !detecting);
  const reelUrl = draft.reelUrl;

  return (
    <div className="capture">
      <section className="card song-card" aria-label="Song from this Reel">
        <div className="card-top">
          <span className="source">
            <span className={`source-dot source-dot--${draft.source}`} aria-hidden="true" />
            {platformNoun(draft.source)}
            {draft.origin === 'detected' && (
              <span
                className="tag tag--accent"
                title={
                  track
                    ? `Read automatically${track.evidence ? ` from ${track.evidence}` : ''}${
                        diagnostics
                          ? ` · score ${diagnostics.score.toFixed(2)} · ${diagnostics.clusters} independent signal${
                              diagnostics.clusters === 1 ? '' : 's'
                            }`
                          : ''
                      }`
                    : 'Read automatically from the page'
                }
              >
                Detected
              </span>
            )}
            {draft.origin === 'edited' && <span className="tag">Edited by you</span>}
            {draft.origin === 'manual' && hasTitle && <span className="tag">Entered by you</span>}
          </span>
          <div className="card-tools">
            {reelUrl && (
              <button
                type="button"
                className="link-button link-button--inline"
                onClick={() => onOpenUrl(reelUrl)}
              >
                Open Reel <ExternalIcon size={10} />
              </button>
            )}
            <button
              type="button"
              className="icon-button icon-button--small"
              onClick={onRefresh}
              aria-label="Re-read this page"
              title="Re-read this page"
            >
              <RefreshIcon />
            </button>
          </div>
        </div>

        {detection.status === 'loading' && (
          <p className="status-line">
            <span className="spinner" aria-hidden="true" /> Reading this Reel…
          </p>
        )}

        {detection.status === 'unavailable' && (
          <EmptyDetect
            title="Reload the Reel once"
            body="This tab was open before Tune Snap could read it. Reload the tab and reopen Tune Snap, or enter the song below."
          />
        )}

        {detection.status === 'error' && (
          <EmptyDetect title="Couldn’t read this page" body={detection.message} />
        )}

        {detection.status === 'ready' && !track && (
          <EmptyDetect
            title={
              detectionReason === 'original-audio'
                ? 'This Reel uses original audio'
                : detectionReason === 'ambiguous'
                  ? 'Couldn’t confirm the music'
                  : 'Music not detected on this Reel'
            }
            body={
              detectionReason === 'original-audio'
                ? 'There is no licensed track to look up. If you know the song, add it below.'
                : detectionReason === 'ambiguous'
                  ? 'Tune Snap found conflicting music labels for this Reel. Press refresh, or enter the song below.'
                  : 'The music label may be hidden, still loading, or formatted differently. Enter the song below.'
            }
          />
        )}

        {track && !editing && (
          <div className="song">
            <h2 className="song-title">{track.title}</h2>
            <p className={`song-artist${track.artist ? '' : ' muted'}`}>
              {track.artist ?? 'Artist not shown'}
            </p>
            <div className="song-meta">
              <button type="button" className="link-button link-button--inline" onClick={onEditStart}>
                Edit title or artist
              </button>
            </div>
            {draft.confidence !== 'high' && (
              <p className="hint">
                Detected from the page — double-check the spelling if the search looks off.
              </p>
            )}
          </div>
        )}

        {showForm && (
          <SongForm
            draft={draft}
            editing={editing}
            canReset={Boolean(track)}
            onChange={onChange}
            onSwap={onSwap}
            onDone={onEditDone}
            onReset={onReset}
          />
        )}

        <div className="actions">
          <button
            type="button"
            className="button button--primary"
            onClick={onPlayNow}
            disabled={detecting || !hasTitle || searching || apiKey.loading}
            title={
              detecting
                ? 'Reading this Reel…'
                : !hasTitle
                  ? 'Enter a song title first'
                  : apiKey.loading
                    ? 'Reading YouTube configuration…'
                    : undefined
            }
          >
            {searching ? (
              <>
                <span className="spinner" aria-hidden="true" /> Searching…
              </>
            ) : (
              <>
                <PlayIcon /> {apiKey.key ? 'Play on YouTube' : 'Find on YouTube'}
              </>
            )}
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={onAdd}
            disabled={detecting || !hasTitle || saving}
            title={
              detecting
                ? 'Reading this Reel…'
                : hasTitle
                  ? undefined
                  : 'Enter a song title first'
            }
          >
            {saving ? (
              <>
                <span className="spinner" aria-hidden="true" /> Saving…
              </>
            ) : (
              <>
                <PlusIcon /> Add to wishlist
              </>
            )}
          </button>
        </div>

        {selectedVideo && (
          <div className="selected-video">
            <span className="selected-check" aria-hidden="true">
              <CheckIcon size={11} />
            </span>
            <span className="selected-label">YouTube</span>
            <span className="selected-title" title={selectedVideo.title}>
              {selectedVideo.title}
            </span>
          </div>
        )}

        {!apiKey.loading && !apiKey.key && (
          <p className="footer-hint">
            No API key yet — Play opens YouTube search.{' '}
            <button type="button" className="link-button link-button--inline" onClick={onOpenSettings}>
              Add a key
            </button>
          </p>
        )}

        {!apiKey.loading && apiKey.source === 'build' && (
          <p className="footer-hint">Using the API key baked into this build.</p>
        )}
      </section>

      <SearchResults
        state={search}
        selectedVideoId={selectedVideo?.videoId ?? null}
        onChoose={onChooseVideo}
        onOpenSearch={onOpenSearch}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}

