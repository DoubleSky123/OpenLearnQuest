import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { EmotionProvider } from './contexts/EmotionContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <EmotionProvider>
        <App />
      </EmotionProvider>
    </AuthProvider>
  </StrictMode>,
)
