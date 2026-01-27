import { BrowserRouter, Routes, Route } from 'react-router'
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
            <Route path="/" element={<DashboardPage />} />
            {/* Future protected routes go here */}
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
