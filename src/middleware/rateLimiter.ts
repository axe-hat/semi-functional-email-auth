import type { RateLimiterConfig } from "../types";

/**
 * Client-side rate limiter using a sliding window approach.
 *
 * Tracks request timestamps within a configurable time window and
 * rejects requests that exceed the maximum allowed count.
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  /**
   * @param config - Configuration with maxRequests and windowMs
   */
  constructor(config: RateLimiterConfig = { maxRequests: 5, windowMs: 60000 }) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  /**
   * Check if a request is allowed under the current rate limit.
   * Automatically prunes expired timestamps from the sliding window.
   */
  canMakeRequest(): boolean {
    this.pruneExpiredTimestamps();
    return this.timestamps.length < this.maxRequests;
  }

  /**
   * Record a request. Returns true if the request was allowed,
   * false if it was rate-limited.
   */
  recordRequest(): boolean {
    if (!this.canMakeRequest()) {
      return false;
    }
    this.timestamps.push(Date.now());
    return true;
  }

  /**
   * Get the number of remaining requests allowed in the current window.
   */
  getRemainingRequests(): number {
    this.pruneExpiredTimestamps();
    return Math.max(0, this.maxRequests - this.timestamps.length);
  }

  /**
   * Get the time in milliseconds until the next request will be allowed.
   * Returns 0 if a request can be made immediately.
   */
  getRetryAfterMs(): number {
    this.pruneExpiredTimestamps();
    if (this.timestamps.length < this.maxRequests) {
      return 0;
    }
    const oldestTimestamp = this.timestamps[0];
    const retryAfter = oldestTimestamp + this.windowMs - Date.now();
    return Math.max(0, retryAfter);
  }

  /**
   * Reset the rate limiter, clearing all recorded timestamps.
   */
  reset(): void {
    this.timestamps = [];
  }

  /**
   * Remove timestamps that have fallen outside the sliding window.
   */
  private pruneExpiredTimestamps(): void {
    const cutoff = Date.now() - this.windowMs;
    this.timestamps = this.timestamps.filter((ts) => ts > cutoff);
  }
}

export default RateLimiter;
