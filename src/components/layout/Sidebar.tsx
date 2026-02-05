import { useState } from 'react'
import { NavLink, useLocation, useSearchParams } from 'react-router'
import {
  HomeIcon,
  BanknotesIcon,
  DocumentTextIcon,
  CreditCardIcon,
  Cog6ToothIcon,
  ArrowLeftStartOnRectangleIcon,
  ChevronDownIcon,
  LinkIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { useProfile } from '@/hooks/useProfile'
import { TeamSwitcher } from '@/components/team/TeamSwitcher'

interface NavChild {
  to: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
}

interface NavItem {
  to?: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  children?: NavChild[]
}

const navItems: NavItem[] = [
  { to: '/', icon: HomeIcon, label: 'Dashboard' },
  {
    icon: BanknotesIcon,
    label: 'Money Movements',
    children: [
      { to: '/money-movements?tab=bank', icon: BanknotesIcon, label: 'Bank' },
      { to: '/money-movements?tab=cc-purchases', icon: CreditCardIcon, label: 'CC Purchases' },
      { to: '/money-movements?tab=cc-charges', icon: CreditCardIcon, label: 'CC Charges' },
      { to: '/money-movements?tab=matching', icon: LinkIcon, label: 'Matching' },
    ],
  },
  { to: '/invoices', icon: DocumentTextIcon, label: 'Invoices & Receipts' },
]

export function Sidebar() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [loggingOut, setLoggingOut] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Money Movements'])

  const displayName = profile?.full_name || user?.email || ''

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

  // Check if a child nav item is active based on path and query params
  const isChildActive = (child: NavChild) => {
    const childUrl = new URL(child.to, window.location.origin)
    const childPath = childUrl.pathname
    const childTab = childUrl.searchParams.get('tab')
    const currentTab = searchParams.get('tab') || 'bank' // Default to 'bank' if no tab param

    // Path must match
    if (location.pathname !== childPath) return false

    // If child has a tab param, it must match current tab
    if (childTab) {
      return childTab === currentTab
    }

    return true
  }

  // Check if any child of a group is active
  const isGroupChildActive = (item: NavItem) => {
    if (!item.children) return false
    return item.children.some((child) => isChildActive(child))
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

      {/* Team Switcher */}
      <div className="border-b border-text-muted/20 py-2">
        <TeamSwitcher isExpanded={isExpanded} />
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
                      isGroupChildActive(item)
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
                            to={child.to}
                            className={() =>
                              `flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                                isChildActive(child)
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
