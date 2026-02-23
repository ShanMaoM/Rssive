import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { MainShell } from './MainShell'
import { isDesktopGatewayRuntime } from '../shared/services/runtimeGateway'

export function App() {
  const prefersHashRouting = typeof window !== 'undefined'
    && (window.location.protocol === 'file:' || isDesktopGatewayRuntime())
  const Router = prefersHashRouting ? HashRouter : BrowserRouter

  return (
    <Router>
      <Routes>
        <Route path="/*" element={<MainShell />} />
      </Routes>
    </Router>
  )
}
