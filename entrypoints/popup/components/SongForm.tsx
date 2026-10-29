import type { SongDraft } from '@/lib/types/song';
import { SwapIcon } from './Icon';

interface SongFormProps {
  draft: SongDraft;
  editing: boolean;
  canReset: boolean;
  onChange: (patch: Partial<Pick<SongDraft, 'title' | 'artist'>>) => void;
  onSwap: () => void;
  onDone: () => void;
  onReset: () => void;
}

export function SongForm({
  draft,
  editing,
  canReset,
  onChange,
  onSwap,
  onDone,
  onReset,
}: SongFormProps) {
  const hasAnyValue = draft.title.trim().length > 0 || draft.artist.trim().length > 0;

  return (
    <div className="song-form">
      <label className="field">
        <span>Song title</span>
        <input
          type="text"
          value={draft.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="e.g. Blinding Lights"
          autoComplete="off"
          spellCheck={false}
          maxLength={160}
          autoFocus={editing}
        />
      </label>

      <label className="field">
        <span>
          Artist <span className="optional">(optional)</span>
        </span>
        <input
          type="text"
          value={draft.artist}
          onChange={(event) => onChange({ artist: event.target.value })}
          placeholder="e.g. The Weeknd"
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
        />
      </label>

      <div className="form-actions">
        <button
          type="button"
          className="link-button link-button--inline"
          onClick={onSwap}
          disabled={!hasAnyValue}
          title="Swap the title and artist if detection had them the wrong way round"
        >
          <SwapIcon /> Swap title / artist
        </button>

        {editing && (
          <div className="form-actions-right">
            {canReset && (
              <button type="button" className="link-button link-button--inline" onClick={onReset}>
                Reset
              </button>
            )}
            <button type="button" className="button button--small button--secondary" onClick={onDone}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
