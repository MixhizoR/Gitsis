import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// URL'de ?reset varsa eski oturumu temizle ve yönlendir
if (new URLSearchParams(window.location.search).has('reset')) {
  localStorage.clear()
  window.history.replaceState({}, '', window.location.pathname)
}

import { AppProvider } from './context/AppContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ProjectProvider } from './context/ProjectContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <ProjectProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </ProjectProvider>
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>,
)
