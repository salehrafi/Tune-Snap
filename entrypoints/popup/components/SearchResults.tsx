import type { MatchSignal, RankedVideo } from '@/lib/types/youtube';
import { signalLabel } from '@/lib/youtube/matching';
import type { SearchViewState } from '../view-types';
import { CheckIcon, ExternalIcon, MusicIcon, PlayIcon, SearchIcon } from './Icon';

/** Channel-name evidence is useful; "artist in title" is too weak to badge. */
const CHANNEL_SIGNALS: readonly MatchSignal[] = [
  'topic-channel',
  'vevo-channel',
  'artist-channel',
];

interface SearchResultsProps {
  state: SearchViewState;
  selectedVideoId: string | null;
  onChoose: (video: RankedVideo) => void;
  onOpenSearch: (query: string) => void;
  onOpenSettings: () => void;
}

export function SearchResults({
  state,
  selectedVideoId,
  onChoose,
  onOpenSearch,
  onOpenSettings,
}: SearchResultsProps) {
  if (state.status === 'idle') return null;

  if (state.status === 'searching') {
    return (
      <section className="results" aria-busy="true">
        <p className="status-line">
          <span className="spinner" aria-hidden="true" /> Searching YouTube…
        </p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="results results--error" aria-live="polite">
        <p className="results-message">{state.message}</p>
        <div className="results-error-actions">
          <button
            type="button"
            className="button button--small button--secondary"
            onClick={() => onOpenSearch(state.query)}
          >
            <SearchIcon size={13} /> Open YouTube search
          </button>
          {(state.reason === 'missing-key' || state.reason === 'invalid-key') && (
            <button type="button" className="link-button link-button--inline" onClick={onOpenSettings}>
              API key settings
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="results">
      <div className="results-head">
        <h2>YouTube results</h2>
        <button
          type="button"
          className="link-button link-button--inline"
          onClick={() => onOpenSearch(state.query)}
        >
          Open on youtube.com <ExternalIcon size={11} />
        </button>
      </div>

      <p className="results-note results-note--top">
        Only videos you play are saved with the song.
      </p>

      <ul className="result-list">
        {state.videos.map((video, index) => {
          const channelSignal = CHANNEL_SIGNALS.find((signal) =>
            video.signals.includes(signal),
          );
          const badge = channelSignal ? signalLabel(channelSignal) : null;
          const isBest = index === 0 && state.confident;
          const selected = video.videoId === selectedVideoId;

          return (
            <li key={video.videoId}>
              <button
                type="button"
                className={`result${selected ? ' result--selected' : ''}`}
                onClick={() => onChoose(video)}
                title={`Play "${video.title}" on YouTube`}
              >
                <span className="result-thumb">
                  {video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <MusicIcon size={16} />
                  )}
                </span>
                <span className="result-body">
                  <span className="result-title">{video.title}</span>
                  <span className="result-meta">
                    <span className="result-channel">{video.channelTitle || 'Unknown channel'}</span>
                    {isBest && <span className="badge badge--best">Best match</span>}
                    {badge && (
                      <span
                        className="badge"
                        title="Inferred from the channel name — not verified as official"
                      >
                        {badge}
                      </span>
                    )}
                  </span>
                </span>
                <span
                  className={`result-play${selected ? ' result-play--selected' : ''}`}
                  aria-hidden="true"
                >
                  {selected ? <CheckIcon size={14} /> : <PlayIcon size={13} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
