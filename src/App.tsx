import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { AuthPage } from '@/pages/AuthPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { MoneyMovementsPage } from '@/pages/MoneyMovementsPage'
import { InvoicesPage } from '@/pages/InvoicesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AcceptInvitationPage } from '@/pages/AcceptInvitationPage'

function App() {
  return (
    <div className="min-h-screen bg-background text-text">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/signup" element={<AuthPage />} />
          <Route path="/invite/:token" element={<AcceptInvitationPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="money-movements" element={<MoneyMovementsPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              {/* Backwards compatibility redirects */}
              <Route path="bank-movements" element={<Navigate to="/money-movements?tab=bank" replace />} />
              <Route path="credit-card" element={<Navigate to="/money-movements?tab=cc-purchases" replace />} />
            </Route>
          </Route>
          {/* Catch-all route redirects to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
