import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import PrototypeApp from './PrototypeApp.jsx'

// Memory City Phase 0 prototype — a standalone entry (prototype.html) that never
// touches App.jsx or the backend. `npm run build:prototype` builds only this.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrototypeApp />
  </StrictMode>,
)
