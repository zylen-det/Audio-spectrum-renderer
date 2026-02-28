import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Router } from './Router'

const root = document.getElementById('root')!
createRoot(root).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>,
)
