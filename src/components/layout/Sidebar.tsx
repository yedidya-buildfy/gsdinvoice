import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import {
  HomeIcon,
  BanknotesIcon,
  DocumentTextIcon,
  CreditCardIcon,
  Cog6ToothIcon,
  ArrowLeftStartOnRectangleIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'

interface NavItem {
  to?: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  children?: NavItem[]
}

const navItems: NavItem[] = [
  { to: '/', icon: HomeIcon, label: 'Dashboard' },
  {
    icon: BanknotesIcon,
    label: 'Bank Movements',
    children: [
      { to: '/bank-movements', icon: BanknotesIcon, label: 'Transactions' },
      { to: '/credit-card', icon: CreditCardIcon, label: 'Credit Card' },
    ],
  },
  { to: '/invoices', icon: DocumentTextIcon, label: 'Invoices & Receipts' },
  { to: '/settings', icon: Cog6ToothIcon, label: 'Settings' },
]

export function Sidebar() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [loggingOut, setLoggingOut] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Bank Movements'])

  const handleSignOut = async () => {
    setLoggingOut(true)
    await signOut()
    // Navigation happens automatically via AuthContext state change
  }

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  const isChildActive = (item: NavItem) => {
    if (!item.children) return false
    return item.children.some((child) => child.to === location.pathname)
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
      <div className="flex h-16 items-center border-b border-text-muted/20 px-4">
        {isExpanded && (
          <span className="text-lg font-semibold text-text">VAT Manager</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to || item.label}>
              {item.children ? (
                <>
                  <button
                    onClick={() => toggleGroup(item.label)}
                    title={!isExpanded ? item.label : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                      isChildActive(item)
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-muted hover:bg-background hover:text-text'
                    } ${!isExpanded ? 'justify-center' : ''}`}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {isExpanded && (
                      <>
                        <span className="flex-1 truncate text-left">{item.label}</span>
                        <ChevronDownIcon
                          className={`h-4 w-4 shrink-0 transition-transform ${
                            expandedGroups.includes(item.label) ? 'rotate-180' : ''
                          }`}
                        />
                      </>
                    )}
                  </button>
                  {isExpanded && expandedGroups.includes(item.label) && (
                    <ul className="mt-1 space-y-1 pl-4">
                      {item.children.map((child) => (
                        <li key={child.to}>
                          <NavLink
                            to={child.to!}
                            className={({ isActive }) =>
                              `flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                                isActive
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-text-muted hover:bg-background hover:text-text'
                              }`
                            }
                          >
                            <child.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{child.label}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <NavLink
                  to={item.to!}
                  end={item.to === '/'}
                  title={!isExpanded ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-muted hover:bg-background hover:text-text'
                    } ${!isExpanded ? 'justify-center' : ''}`
                  }
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {isExpanded && (
                    <span className="truncate">{item.label}</span>
                  )}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* User section */}
      <div className="border-t border-text-muted/20 p-2">
        {isExpanded && user?.email && (
          <div className="px-3 py-2 mb-1">
            <p className="text-text-muted text-sm truncate" title={user.email}>
              {user.email}
            </p>
          </div>
        )}
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
