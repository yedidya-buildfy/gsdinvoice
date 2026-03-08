import { useState } from 'react'
import { NavLink } from 'react-router'
import {
  HomeIcon,
  BanknotesIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  ArrowLeftStartOnRectangleIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { useProfile } from '@/hooks/useProfile'
import { TeamSwitcher } from '@/components/team/TeamSwitcher'
import { useUnreviewedEmailReceiptCount } from '@/hooks/useEmailConnections'

interface NavItem {
  to: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
}

const navItems: NavItem[] = [
  { to: '/', icon: HomeIcon, label: 'Dashboard' },
  { to: '/money-movements', icon: BanknotesIcon, label: 'Money Movements' },
  { to: '/invoices', icon: DocumentTextIcon, label: 'Invoices & Receipts' },
]

export function Sidebar() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const [loggingOut, setLoggingOut] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const { data: unreviewedCount } = useUnreviewedEmailReceiptCount()
  const displayName = profile?.full_name || user?.email || ''

  const handleSignOut = async () => {
    setLoggingOut(true)
    await signOut()
    // Navigation happens automatically via AuthContext state change
  }

  const isExpanded = isHovered

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-text-muted/20 bg-surface transition-all duration-300 ${
        isExpanded ? 'w-64' : 'w-16'
      }`}
    >
      {/* Header */}
      <div className="flex h-16 items-center border-b border-text-muted/20 px-4 gap-3">
        <img src="/logo120.png" alt="VATManager" className="h-8 w-8 shrink-0" />
        {isExpanded && (
          <span className="text-lg font-semibold text-text">VAT<span className="text-primary">Manager</span></span>
        )}
      </div>

      {/* Team Switcher */}
      <div className="border-b border-text-muted/20 py-2">
        <TeamSwitcher isExpanded={isExpanded} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                title={!isExpanded ? item.label : undefined}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-background hover:text-text'
                  } ${!isExpanded ? 'justify-center' : ''}`
                }
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {isExpanded && (
                  <>
                    <span className="truncate">{item.label}</span>
                    {item.label === 'Invoices & Receipts' && unreviewedCount != null && unreviewedCount > 0 && (
                      <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full bg-primary text-white min-w-[20px] text-center">
                        {unreviewedCount > 99 ? '99+' : unreviewedCount}
                      </span>
                    )}
                  </>
                )}
                {!isExpanded && item.label === 'Invoices & Receipts' && unreviewedCount != null && unreviewedCount > 0 && (
                  <span className="absolute -top-1 -end-1 w-4 h-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center">
                    {unreviewedCount > 9 ? '9+' : unreviewedCount}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* User section */}
      <div className="border-t border-text-muted/20 p-2">
        {/* Settings link */}
        <NavLink
          to="/settings"
          title={!isExpanded ? 'Settings' : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:bg-background hover:text-text'
            } ${!isExpanded ? 'justify-center' : ''}`
          }
        >
          <Cog6ToothIcon className="h-5 w-5 shrink-0" />
          {isExpanded && <span className="truncate">Settings</span>}
        </NavLink>

        {/* User profile */}
        <div className={`flex items-center gap-3 px-3 py-2 mb-1 ${!isExpanded ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <UserIcon className="w-4 h-4 text-text-muted" />
            )}
          </div>
          {isExpanded && displayName && (
            <p className="text-text-muted text-sm truncate" title={displayName}>
              {displayName}
            </p>
          )}
        </div>
        <button
          onClick={handleSignOut}
          disabled={loggingOut}
          title={!isExpanded ? 'Sign out' : undefined}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50 ${
            !isExpanded ? 'justify-center' : ''
          }`}
        >
          <ArrowLeftStartOnRectangleIcon className="h-5 w-5 shrink-0" />
          {isExpanded && (
            <span className="truncate">{loggingOut ? 'Signing out...' : 'Sign out'}</span>
          )}
        </button>
      </div>
    </aside>
  )
}
