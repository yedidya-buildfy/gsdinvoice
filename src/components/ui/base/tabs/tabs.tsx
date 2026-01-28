import type { Key, ReactNode } from 'react'
import {
  Tabs as AriaTabs,
  TabList as AriaTabList,
  Tab as AriaTab,
  TabPanel as AriaTabPanel,
  type TabsProps as AriaTabsProps,
  type TabListProps as AriaTabListProps,
  type TabProps as AriaTabProps,
  type TabPanelProps as AriaTabPanelProps,
} from 'react-aria-components'
import { cx } from '@/utils/cx'

interface TabItem {
  id: string
  label: string
  badge?: number
}

interface TabsProps extends Omit<AriaTabsProps, 'children'> {
  children: ReactNode
}

function Tabs({ className, ...props }: TabsProps) {
  return (
    <AriaTabs
      keyboardActivation="automatic"
      className={cx('flex flex-col', className)}
      {...props}
    />
  )
}

interface TabListProps<T extends TabItem> extends Omit<AriaTabListProps<T>, 'children'> {
  type?: 'underline' | 'pills'
  items: T[]
  children: (item: T) => ReactNode
}

function TabList<T extends TabItem>({ type = 'underline', items, children, className, ...props }: TabListProps<T>) {
  return (
    <AriaTabList
      items={items}
      className={cx(
        'flex justify-center',
        type === 'underline' && 'border-b border-text-muted/20 gap-0',
        type === 'pills' && 'gap-1 bg-background/50 p-1 rounded-lg',
        className
      )}
      {...props}
    >
      {children}
    </AriaTabList>
  )
}

interface TabItemProps extends AriaTabProps {
  label?: string
  badge?: number
  type?: 'underline' | 'pills'
}

function TabItem({ id, label, badge, type = 'underline', className, ...props }: TabItemProps) {
  return (
    <AriaTab
      id={id}
      className={({ isSelected, isFocusVisible }) =>
        cx(
          'cursor-pointer outline-none transition-colors text-sm font-medium',
          type === 'underline' && [
            'px-4 py-3 -mb-px border-b-2',
            isSelected
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text hover:border-text-muted/50',
          ],
          type === 'pills' && [
            'px-3 py-1.5 rounded-md',
            isSelected
              ? 'bg-primary text-white'
              : 'text-text-muted hover:text-text hover:bg-background',
          ],
          isFocusVisible && 'ring-2 ring-primary ring-offset-2 ring-offset-surface',
          className
        )
      }
      {...props}
    >
      <span className="flex items-center gap-2">
        {label}
        {badge !== undefined && badge > 0 && (
          <span className={cx(
            'inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-medium rounded-full',
            'bg-primary/20 text-primary'
          )}>
            {badge}
          </span>
        )}
      </span>
    </AriaTab>
  )
}

interface TabPanelProps extends AriaTabPanelProps {
  children: ReactNode
}

function TabPanel({ className, ...props }: TabPanelProps) {
  return (
    <AriaTabPanel
      className={cx('outline-none pt-6', className)}
      {...props}
    />
  )
}

// Compound component pattern
const TabsCompound = Object.assign(Tabs, {
  List: TabList,
  Item: TabItem,
  Panel: TabPanel,
})

export { TabsCompound as Tabs, type TabItem }
