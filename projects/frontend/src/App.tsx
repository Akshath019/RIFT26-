import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Generate from './pages/Generate'
import Login from './pages/Login'
import Verify from './pages/Verify'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const stored = localStorage.getItem('genmark_user')
  if (!stored) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/generate" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/generate" element={<ProtectedRoute><Generate /></ProtectedRoute>} />
        <Route path="/verify" element={<Verify />} />
        <Route path="*" element={<Navigate to="/generate" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
