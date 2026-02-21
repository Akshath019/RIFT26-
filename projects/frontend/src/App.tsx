import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Generate from './pages/Generate'
import Login from './pages/Login'
import Morph from './pages/Morph'
import Verify from './pages/Verify'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/generate" replace />} />
        <Route path="/login" element={<Login />} />
        {/* F4: No ProtectedRoute — auth gate is inline on each page */}
        <Route path="/generate" element={<Generate />} />
        <Route path="/morph" element={<Morph />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="*" element={<Navigate to="/generate" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
