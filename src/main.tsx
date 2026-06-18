import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import 'xterm/css/xterm.css'

// 隐藏启动加载指示器
const loadingEl = document.getElementById('mimo-loading')
if (loadingEl) loadingEl.style.display = 'none'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
