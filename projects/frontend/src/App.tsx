/**
 * GenMark — App Entry Point
 * ==========================
 * Configures routing for the two main pages:
 *   /generate → Create & certify AI images
 *   /verify   → Public image origin verification portal
 *
 * No wallet provider needed — all blockchain interactions
 * happen through the backend (Render) service.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Generate from './pages/Generate'
import Verify from './pages/Verify'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default route: redirect to the generation page */}
        <Route path="/" element={<Navigate to="/generate" replace />} />

        {/* Generation page: mock AI platform with silent origin registration */}
        <Route path="/generate" element={<Generate />} />

        {/* Verification portal: public, no account required */}
        <Route path="/verify" element={<Verify />} />

        {/* Catch-all: redirect unknown routes to generate page */}
        <Route path="*" element={<Navigate to="/generate" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
