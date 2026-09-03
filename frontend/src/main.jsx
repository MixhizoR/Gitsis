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
// Offline fontlar (harici Google Fonts baglantisi kaldirildi)
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
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
