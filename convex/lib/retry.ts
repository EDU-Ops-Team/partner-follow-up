import { MAX_RETRIES, RETRY_BASE_DELAY_MS } from "./constants";
import { logger } from "./logger";

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  context?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = MAX_RETRIES,
    baseDelay = RETRY_BASE_DELAY_MS,
    maxDelay = 30000,
    context = "operation",
  } = options;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxRetries) break;
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      logger.warn(`${context}: attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
        error: lastError.message, attempt: attempt + 1, maxRetries,
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  logger.error(`${context}: all ${maxRetries + 1} attempts failed`, { error: lastError?.message });
  throw lastError;
}
