import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../../assets/theme.css';
import './popup.css';

const container = document.getElementById('root');
if (!container) throw new Error('Tune Snap popup root element is missing.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

