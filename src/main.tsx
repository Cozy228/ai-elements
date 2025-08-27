import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ChatBotDemo from './chatbot.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatBotDemo />
  </StrictMode>,
)
