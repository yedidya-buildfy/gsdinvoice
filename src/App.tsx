import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { BankMovementsPage } from '@/pages/BankMovementsPage'
import { InvoicesPage } from '@/pages/InvoicesPage'
import { CreditCardPage } from '@/pages/CreditCardPage'
import { SettingsPage } from '@/pages/SettingsPage'

function App() {
  return (
    <div className="min-h-screen bg-background text-text">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="bank-movements" element={<BankMovementsPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="credit-card" element={<CreditCardPage />} />
              <Route path="settings" element={<SettingsPage />} />
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
