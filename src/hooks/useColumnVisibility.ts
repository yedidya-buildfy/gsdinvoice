import { useSettingsStore } from '@/stores/settingsStore'
import type { ColumnVisibilityState } from '@/types/columnVisibility'

type TableName = keyof ColumnVisibilityState

export function useColumnVisibility<T extends TableName>(table: T) {
  const visibility = useSettingsStore((state) => state.columnVisibility[table])
  const setColumnVisibility = useSettingsStore((state) => state.setColumnVisibility)
  const resetColumnVisibility = useSettingsStore((state) => state.resetColumnVisibility)

  type ColKey = keyof ColumnVisibilityState[T]

  const isVisible = (col: ColKey): boolean => {
    return visibility[col] !== false
  }

  const toggle = (col: ColKey) => {
    setColumnVisibility(table, col as string, !isVisible(col))
  }

  const reset = () => {
    resetColumnVisibility(table)
  }

  return { visibility, isVisible, toggle, reset }
}
