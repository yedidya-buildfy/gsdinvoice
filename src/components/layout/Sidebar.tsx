import { NavLink } from 'react-router'
import {
  HomeIcon,
  BanknotesIcon,
  DocumentTextIcon,
  CreditCardIcon,
  Cog6ToothIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { useUIStore } from '@/stores/uiStore'

interface NavItem {
  to: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
}

const navItems: NavItem[] = [
  { to: '/', icon: HomeIcon, label: 'Dashboard' },
  { to: '/bank-movements', icon: BanknotesIcon, label: 'Bank Movements' },
  { to: '/invoices', icon: DocumentTextIcon, label: 'Invoices & Receipts' },
  { to: '/credit-card', icon: CreditCardIcon, label: 'Credit Card' },
  { to: '/settings', icon: Cog6ToothIcon, label: 'Settings' },
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  return (
    <aside
      className={`fixed inset-y-0 start-0 z-40 flex flex-col border-e border-text-muted/20 bg-surface transition-all duration-300 ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-text-muted/20 px-4">
        {!sidebarCollapsed && (
          <span className="text-lg font-semibold text-text">VAT Manager</span>
        )}
        <button
          onClick={toggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-background hover:text-text"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <ChevronLeftIcon className="h-5 w-5" />
          ) : (
            <ChevronRightIcon className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                title={sidebarCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-background hover:text-text'
                  } ${sidebarCollapsed ? 'justify-center' : ''}`
                }
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!sidebarCollapsed && (
                  <span className="truncate">{item.label}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
