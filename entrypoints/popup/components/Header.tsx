import { MusicIcon, SettingsIcon } from './Icon';

export type ViewTab = 'capture' | 'wishlist';

interface HeaderProps {
  tab: ViewTab;
  wishlistCount: number;
  onTabChange: (tab: ViewTab) => void;
  onOpenSettings: () => void;
}

export function Header({ tab, wishlistCount, onTabChange, onOpenSettings }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <MusicIcon size={15} />
        </span>
        <div className="brand-text">
          <h1>Tune Snap</h1>
          <p>Instagram Reels, on YouTube</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onOpenSettings}
          aria-label="Tune Snap settings"
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </div>

      <nav className="tabs" role="tablist" aria-label="Tune Snap views">
        <button
          type="button"
          role="tab"
          id="tab-capture"
          aria-selected={tab === 'capture'}
          aria-controls="panel-capture"
          onClick={() => onTabChange('capture')}
        >
          This Reel
        </button>
        <button
          type="button"
          role="tab"
          id="tab-wishlist"
          aria-selected={tab === 'wishlist'}
          aria-controls="panel-wishlist"
          onClick={() => onTabChange('wishlist')}
        >
          Wishlist
          {wishlistCount > 0 && <span className="count">{wishlistCount}</span>}
        </button>
      </nav>
    </header>
  );
}

