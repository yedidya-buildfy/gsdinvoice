/**
 * Batch processing utilities for handling large arrays
 * Useful for avoiding URL length limits in Supabase queries
 */

/**
 * Process items in sequential batches
 * @param items - Array of items to process
 * @param batchSize - Number of items per batch
 * @param processor - Async function to process each batch
 * @returns Combined results from all batches
 */
export async function processBatchesSequentially<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = []

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await processor(batch)
    results.push(...batchResults)
  }

  return results
}

/**
 * Process items in parallel batches with concurrency limit
 * @param items - Array of items to process
 * @param batchSize - Number of items per batch
 * @param processor - Async function to process each batch
 * @param concurrency - Maximum number of batches to process in parallel (default: 3)
 * @returns Combined results from all batches
 */
export async function processBatchesParallel<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>,
  concurrency: number = 3
): Promise<R[]> {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize))
  }

  const results: R[] = []
  for (let i = 0; i < batches.length; i += concurrency) {
    const concurrentBatches = batches.slice(i, i + concurrency)
    const batchResults = await Promise.all(concurrentBatches.map(processor))
    results.push(...batchResults.flat())
  }

  return results
}

/**
 * Split array into chunks
 * @param items - Array to split
 * @param chunkSize - Size of each chunk
 * @returns Array of chunks
 */
export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}
