import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

console.log('main.tsx: Starting React app');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

console.log('main.tsx: Root element found, creating root');

const root = createRoot(rootElement);

console.log('main.tsx: Rendering App component');

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

console.log('main.tsx: App rendered');

