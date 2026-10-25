import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Self-hosted so the app looks identical offline / in Docker, with no
// third-party font request at runtime. See styles/theme.css for the rationale.
// Mono is latin-only (GB-facing tool, numerals and 24h clock times); the sans
// variable font ships one file per unicode subset, so non-latin ones are never
// actually fetched.
import '@fontsource-variable/ibm-plex-sans/wght.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
