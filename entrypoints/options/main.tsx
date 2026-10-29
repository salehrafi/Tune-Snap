import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Options } from './Options';
import '../../assets/theme.css';
import './options.css';

const container = document.getElementById('root');
if (!container) throw new Error('Tune Snap options root element is missing.');

createRoot(container).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);

