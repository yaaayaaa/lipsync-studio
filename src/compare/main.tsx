import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../ui/app.css'
import './compare.css'
import { ComparePage } from './ComparePage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ComparePage />
  </StrictMode>,
)
