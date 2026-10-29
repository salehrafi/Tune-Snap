import { useMemo, useState } from 'react';
import type { WishlistItem } from '@/lib/types/wishlist';
import { filterWishlist } from '@/lib/wishlist-filter';
import { formatSavedAt } from '@/lib/utils/time';
import { platformName } from '../format';
import type { WishlistStatus } from '../hooks/useWishlist';
import { ExternalIcon, MusicIcon, PlayIcon, SearchIcon, TrashIcon } from './Icon';

interface WishlistViewProps {
  items: WishlistItem[];
  status: WishlistStatus;
  error: string | null;
  onPlay: (item: WishlistItem) => void;
  onRemove: (id: string) => void;
  onOpenUrl: (url: string) => void;
  onRetry: () => void;
}

export function WishlistView({
  items,
  status,
  error,
  onPlay,
  onRemove,
  onOpenUrl,
  onRetry,
}: WishlistViewProps) {
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => filterWishlist(items, filter), [items, filter]);

  if (status === 'loading') {
    return (
      <p className="status-line">
        <span className="spinner" aria-hidden="true" /> Loading wishlist…
      </p>
    );
  }

  if (status === 'error') {
    return (
      <div className="empty-state">
        <p className="empty-title">Couldn’t load your wishlist</p>
        <p className="muted">{error ?? 'Storage is unavailable right now.'}</p>
        <button type="button" className="button button--small button--secondary" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon" aria-hidden="true">
          <MusicIcon size={24} />
        </span>
        <p className="empty-title">No saved songs yet</p>
        <p className="muted">
          Play a song from a Reel, then choose “Add to wishlist”. Saved songs stay in this browser.
        </p>
      </div>
    );
  }

  return (
    <div className="wishlist-view">
      <div className="filter">
        <SearchIcon />
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter saved songs"
          aria-label="Filter saved songs"
          autoComplete="off"
          spellCheck={false}
        />
        {filter.trim().length > 0 && (
          <span className="filter-count">
            {visible.length}/{items.length}
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="empty-note">No saved songs match “{filter.trim()}”.</p>
      ) : (
        <ul className="wishlist">
          {visible.map((item) => {
            const reelUrl = item.reelUrl;
            return (
              <li key={item.id} className="wish-item">
                <div className="wish-info">
                  <p className="wish-title">{item.title}</p>
                  <p className="wish-meta">
                    {item.artist ?? 'Unknown artist'} · {platformName(item.source)} ·{' '}
                    {formatSavedAt(item.createdAt)}
                  </p>
                  <p className="wish-video">
                    {item.video ? (
                      <>
                        <span className="tag tag--success">YouTube</span>
                        <span className="wish-channel">
                          {item.video.channelTitle || 'Match saved'}
                        </span>
                      </>
                    ) : (
                      <span className="muted">No YouTube match saved</span>
                    )}
                    {reelUrl && (
                      <button
                        type="button"
                        className="link-button link-button--inline wish-reel"
                        onClick={() => onOpenUrl(reelUrl)}
                      >
                        Reel <ExternalIcon size={10} />
                      </button>
                    )}
                  </p>
                </div>

                <div className="wish-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onPlay(item)}
                    title={item.video ? 'Play on YouTube' : 'Find on YouTube'}
                    aria-label={`${item.video ? 'Play' : 'Find'} ${item.title} on YouTube`}
                  >
                    {item.video ? <PlayIcon size={13} /> : <SearchIcon size={14} />}
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--danger"
                    onClick={() => onRemove(item.id)}
                    title="Remove from wishlist"
                    aria-label={`Remove ${item.title} from wishlist`}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="results-note">
        Saved only in this browser. Play opens YouTube in a new tab.
      </p>
    </div>
  );
}
