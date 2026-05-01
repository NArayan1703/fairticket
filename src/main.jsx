import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './polyfills.js';
import './styles.css';

const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('Failed to find the root element');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
