import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles.css'
import { initTheme } from './lib/theme'
import App from './App'
import { Analytics } from '@vercel/analytics/react'

// Initialize theme before render to prevent flash
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)
