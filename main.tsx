
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App' // ここに /src/ が入っていたら消して './App' にする
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
