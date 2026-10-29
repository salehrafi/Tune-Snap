import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { localArea } from '@/lib/storage/browserArea';
import {
  loadSettings,
  resolveApiKey,
  saveApiKey,
  type ApiKeySource,
} from '@/lib/storage/settings';
import { errorMessage } from '@/lib/utils/errors';
import { MusicIcon } from '../popup/components/Icon';

interface Feedback {
  kind: 'success' | 'error';
  text: string;
}

export function Options() {
  const [loaded, setLoaded] = useState(false);
  const [key, setKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [source, setSource] = useState<ApiKeySource>(null);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const version = browser.runtime.getManifest().version;

  async function refresh(): Promise<void> {
    const [settings, resolved] = await Promise.all([
      loadSettings(localArea),
      resolveApiKey(localArea),
    ]);
    setKey(settings.youtubeApiKey ?? '');
    setSavedKey(settings.youtubeApiKey ?? '');
    setSource(resolved.source);
    setLoaded(true);
  }

  useEffect(() => {
    refresh().catch((error: unknown) => {
      setFeedback({ kind: 'error', text: errorMessage(error, 'Could not read settings.') });
      setLoaded(true);
    });
  }, []);

  async function save(next: string | null): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await saveApiKey(localArea, next);
      await refresh();
      setFeedback({
        kind: 'success',
        text: next ? 'API key saved.' : 'Saved key cleared.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: `Couldn’t save the key: ${errorMessage(error)}`,
      });
    } finally {
      setBusy(false);
    }
  }

  const dirty = key.trim() !== savedKey.trim();

  return (
    <main className="page">
      <header className="page-header">
        <span className="brand-mark" aria-hidden="true">
          <MusicIcon size={16} />
        </span>
        <div>
          <h1>Tune Snap settings</h1>
          <p>Reel music, on YouTube</p>
        </div>
      </header>

      <section className="card" aria-labelledby="youtube-heading">
        <h2 id="youtube-heading">YouTube search</h2>
        <p className="status">
          {!loaded && 'Reading settings…'}
          {loaded && source === 'user' && 'Using the API key saved in this browser.'}
          {loaded &&
            source === 'build' &&
            'Using the API key baked into this build. Saving a key here overrides it.'}
          {loaded &&
            source === null &&
            'No key configured. YouTube search will open youtube.com instead of showing results here.'}
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(key.trim() || null);
          }}
        >
          <label className="field" htmlFor="api-key">
            <span>YouTube Data API v3 key</span>
            <div className="key-row">
              <input
                id="api-key"
                type={reveal ? 'text' : 'password'}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder={
                  source === 'build' ? 'Using build-time key — paste to override' : 'AIza…'
                }
                autoComplete="off"
                spellCheck={false}
                disabled={!loaded}
              />
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setReveal((value) => !value)}
                aria-pressed={reveal}
              >
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <div className="form-row">
            <button
              type="submit"
              className="button button--primary"
              disabled={!loaded || busy || !dirty}
            >
              {busy ? 'Saving…' : 'Save key'}
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={!loaded || busy || (savedKey.length === 0 && key.length === 0)}
              onClick={() => {
                setKey('');
                void save(null);
              }}
            >
              Clear saved key
            </button>
          </div>
        </form>

        {feedback && (
          <p className={`feedback feedback--${feedback.kind}`} role="status" aria-live="polite">
            {feedback.text}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="setup-heading">
        <h2 id="setup-heading">Get your own key</h2>
        <ol className="steps">
          <li>
            Open the{' '}
            <a
              href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
              target="_blank"
              rel="noreferrer noopener"
            >
              YouTube Data API v3
            </a>{' '}
            page in Google Cloud and enable the API for a project.
          </li>
          <li>
            Open{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer noopener"
            >
              Credentials
            </a>{' '}
            and create an API key.
          </li>
          <li>
            Restrict the key to <strong>YouTube Data API v3</strong> only. Application
            restrictions can stay “None”, because extensions do not have a stable HTTP referrer.
          </li>
        </ol>

        <div className="callout">
          <strong>A key in an extension is not secret.</strong> Anyone who can inspect this
          extension can read a key saved here or compiled into a build. Never reuse a key that has
          billing enabled on other APIs, and restrict it to YouTube Data API v3.
        </div>

        <p className="fine-print">
          Each search costs 100 quota units. Google’s default free quota is 10,000 units per day,
          which is about 100 searches.
        </p>
      </section>

      <section className="card" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">Data & privacy</h2>
        <ul className="bullets">
          <li>Your wishlist is stored locally in this browser.</li>
          <li>
            When you search, only the song title and artist are sent to the YouTube Data API.
          </li>
          <li>Reel URLs, page content and browsing history are never sent to any server.</li>
          <li>There is no account, analytics, cloud sync or audio recording.</li>
        </ul>
      </section>

      <footer className="page-footer">Tune Snap v{version} · Manifest V3</footer>
    </main>
  );
}

