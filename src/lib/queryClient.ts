import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds - data considered fresh
      gcTime: 5 * 60 * 1000, // 5 minutes - garbage collection time
      retry: 1, // Retry failed requests once
      refetchOnWindowFocus: false, // Don't refetch on window focus
    },
    mutations: {
      retry: 0, // Don't retry failed mutations
    },
  },
})
