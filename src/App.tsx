import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { DashboardPage } from '@/pages/DashboardPage'

function App() {
  return (
    <div className="min-h-screen bg-background text-text">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route index element={<DashboardPage />} />
            <Route path="/" element={<DashboardPage />} />
            {/* Future protected routes go here */}
          </Route>
          {/* Catch-all route redirects to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
