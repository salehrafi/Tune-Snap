import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { createSessionArea, localArea } from '@/lib/storage/browserArea';
import { resolveApiKey } from '@/lib/storage/settings';
import type { SongDraft } from '@/lib/types/song';
import type { NewWishlistItem, WishlistItem } from '@/lib/types/wishlist';
import { watchUrl, youtubeSearchUrl, type RankedVideo, type SavedVideo } from '@/lib/types/youtube';
import { errorMessage } from '@/lib/utils/errors';
import { buildSearchQuery } from '@/lib/youtube/matching';
import { searchForSong } from '@/lib/youtube/service';
import { Capture } from './components/Capture';
import { Header, type ViewTab } from './components/Header';
import { Notice } from './components/Notice';
import { WishlistView } from './components/WishlistView';
import { applyEdit, blankDraft, draftFromDetection } from './draft';
import { useReelDetection } from './hooks/useReelDetection';
import { useWishlist } from './hooks/useWishlist';
import type { ApiKeyStatus, NoticeMessage, SearchViewState } from './view-types';

const sessionCache = createSessionArea();

function toSavedVideo(video: RankedVideo): SavedVideo {
  return {
    videoId: video.videoId,
    title: video.title,
    channelTitle: video.channelTitle,
    thumbnailUrl: video.thumbnailUrl,
  };
}

export function App() {
  const { state: detection, refresh } = useReelDetection();
  const wishlist = useWishlist();

  const [tab, setTab] = useState<ViewTab>('capture');
  const [draft, setDraft] = useState<SongDraft>(() => blankDraft());
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState<SearchViewState>({ status: 'idle' });
  const [selectedVideo, setSelectedVideo] = useState<RankedVideo | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [apiKey, setApiKey] = useState<ApiKeyStatus>({
    loading: true,
    key: null,
    source: null,
  });
  const [saving, setSaving] = useState(false);

  const searchRequestRef = useRef(0);
  const searchingRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    setDraft(draftFromDetection(detection));
    setEditing(false);
    setSelectedVideo(null);
    setSearch({ status: 'idle' });
    searchRequestRef.current += 1;
    searchingRef.current = false;
  }, [detection]);

  useEffect(() => {
    let cancelled = false;
    resolveApiKey(localArea)
      .then((resolved) => {
        if (!cancelled) {
          setApiKey({ loading: false, key: resolved.key, source: resolved.source });
        }
      })
      .catch(() => {
        if (!cancelled) setApiKey({ loading: false, key: null, source: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(
      () => setNotice(null),
      notice.kind === 'error' ? 6000 : 4200,
    );
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const openUrl = useCallback(async (url: string) => {
    try {
      await browser.tabs.create({ url });
    } catch (cause) {
      setNotice({ kind: 'error', text: `Could not open the link: ${errorMessage(cause)}` });
    }
  }, []);

  const resetSearch = useCallback(() => {
    searchRequestRef.current += 1;
    searchingRef.current = false;
    setSearch({ status: 'idle' });
    setSelectedVideo(null);
  }, []);

  const playVideo = useCallback(
    async (video: RankedVideo) => {
      setSelectedVideo(video);
      await openUrl(watchUrl(video.videoId));
    },
    [openUrl],
  );

  const handleChange = (patch: Partial<Pick<SongDraft, 'title' | 'artist'>>) => {
    setDraft((previous) => applyEdit(previous, patch));
    resetSearch();
  };

  const handleSwap = () => {
    setDraft((previous) => applyEdit(previous, { title: previous.artist, artist: previous.title }));
    resetSearch();
  };

  const handleReset = () => {
    setDraft(draftFromDetection(detection));
    setEditing(false);
    resetSearch();
  };

  const handlePlayNow = async () => {
    const title = draft.title.trim();
    if (!title) {
      setEditing(true);
      setNotice({ kind: 'error', text: 'Add a song title first.' });
      return;
    }

    if (selectedVideo) {
      await openUrl(watchUrl(selectedVideo.videoId));
      return;
    }

    if (searchingRef.current) return;

    if (search.status === 'results') {
      const best = search.videos[0];
      if (search.confident && best) {
        await playVideo(best);
      } else {
        setNotice({ kind: 'info', text: 'Choose the right video from the results below.' });
      }
      return;
    }

    const artist = draft.artist.trim() || null;
    const query = buildSearchQuery({ title, artist });

    if (!apiKey.key) {
      await openUrl(youtubeSearchUrl(query));
      setNotice({
        kind: 'info',
        text: 'No API key set — opened YouTube search. Add a key in Settings to see results here.',
      });
      return;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    searchingRef.current = true;
    setSearch({ status: 'searching' });

    try {
      const result = await searchForSong({ title, artist }, { apiKey: apiKey.key, cache: sessionCache });
      if (searchRequestRef.current !== requestId) return;

      if (!result.ok) {
        setSearch({
          status: 'error',
          query: result.query,
          reason: result.reason,
          message: result.message,
        });
        return;
      }

      setSearch({
        status: 'results',
        query: result.query,
        videos: result.videos,
        confident: result.confident,
        fromCache: result.fromCache,
      });

      const best = result.videos[0];
      if (result.confident && best) {
        await playVideo(best);
      } else {
        setNotice({
          kind: 'info',
          text: 'Pick the closest match — nothing is saved until you add it to the wishlist.',
        });
      }
    } catch (cause) {
      if (searchRequestRef.current === requestId) {
        setSearch({
          status: 'error',
          query,
          reason: 'network',
          message: errorMessage(cause, 'YouTube search failed.'),
        });
      }
    } finally {
      if (searchRequestRef.current === requestId) searchingRef.current = false;
    }
  };

  const handleAdd = async () => {
    const title = draft.title.trim();
    if (!title) {
      setEditing(true);
      setNotice({ kind: 'error', text: 'Add a song title first.' });
      return;
    }
    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    try {
      const input: NewWishlistItem = {
        title,
        artist: draft.artist.trim() || null,
        source: draft.source,
        reelUrl: draft.reelUrl,
        metadataOrigin: draft.origin,
        video: selectedVideo ? toSavedVideo(selectedVideo) : null,
      };
      const result = await wishlist.add(input);
      if (result.status === 'added') {
        setNotice({ kind: 'success', text: 'Saved to wishlist.' });
      } else {
        setNotice({
          kind: 'info',
          text: result.attachedVideo
            ? 'Already saved — added the YouTube match.'
            : 'This song is already in your wishlist.',
        });
      }
    } catch (cause) {
      setNotice({ kind: 'error', text: `Couldn’t save: ${errorMessage(cause)}` });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await wishlist.remove(id);
      setNotice({ kind: 'success', text: 'Removed from wishlist.' });
    } catch (cause) {
      setNotice({ kind: 'error', text: `Couldn’t remove: ${errorMessage(cause)}` });
    }
  };

  const handleWishlistPlay = async (item: WishlistItem) => {
    const query = buildSearchQuery({ title: item.title, artist: item.artist });
    const url = item.video ? watchUrl(item.video.videoId) : youtubeSearchUrl(query);
    await openUrl(url);
  };

  const openSettings = async () => {
    try {
      await browser.runtime.openOptionsPage();
    } catch (cause) {
      setNotice({ kind: 'error', text: errorMessage(cause, 'Could not open settings.') });
    }
  };

  const capture = (
    <Capture
      detection={detection}
      draft={draft}
      editing={editing}
      search={search}
      selectedVideo={selectedVideo}
      apiKey={apiKey}
      searching={search.status === 'searching'}
      saving={saving}
      onEditStart={() => setEditing(true)}
      onEditDone={() => setEditing(false)}
      onReset={handleReset}
      onChange={handleChange}
      onSwap={handleSwap}
      onPlayNow={() => void handlePlayNow()}
      onAdd={() => void handleAdd()}
      onChooseVideo={(video) => void playVideo(video)}
      onOpenUrl={(url) => void openUrl(url)}
      onOpenSearch={(query) => void openUrl(youtubeSearchUrl(query))}
      onOpenSettings={() => void openSettings()}
      onRefresh={() => void refresh()}
    />
  );

  return (
    <div className="app">
      <Header
        tab={tab}
        wishlistCount={wishlist.items.length}
        onTabChange={setTab}
        onOpenSettings={() => void openSettings()}
      />

      {notice && <Notice notice={notice} />}

      <main className="content">
        <div
          role="tabpanel"
          id="panel-capture"
          aria-labelledby="tab-capture"
          hidden={tab !== 'capture'}
        >
          {capture}
        </div>
        <div
          role="tabpanel"
          id="panel-wishlist"
          aria-labelledby="tab-wishlist"
          hidden={tab !== 'wishlist'}
        >
          <WishlistView
            items={wishlist.items}
            status={wishlist.status}
            error={wishlist.error}
            onPlay={(item) => void handleWishlistPlay(item)}
            onRemove={(id) => void handleRemove(id)}
            onOpenUrl={(url) => void openUrl(url)}
            onRetry={() => void wishlist.reload()}
          />
        </div>
      </main>
    </div>
  );
}
