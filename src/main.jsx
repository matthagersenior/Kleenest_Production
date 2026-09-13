import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './runtime/App.jsx';
import { registerServiceWorker } from './runtime/registerServiceWorker.js';
import './styles.css';

registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/Kleenest_Production">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
