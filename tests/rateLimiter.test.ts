import { RateLimiter } from "../src/utils/rateLimiter.js";

describe("RateLimiter", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00Z")));
  afterEach(() => jest.useRealTimers());

  it("allows requests up to the limit, then blocks", () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });
    expect(limiter.recordRequest()).toBe(true);
    expect(limiter.recordRequest()).toBe(true);
    expect(limiter.recordRequest()).toBe(false);
    expect(limiter.getRemainingRequests()).toBe(0);
  });

  it("reports when the next request is allowed and frees the slot after the window", () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });
    limiter.recordRequest();
    jest.advanceTimersByTime(400);
    expect(limiter.getRetryAfterMs()).toBe(600);
    jest.advanceTimersByTime(601);
    expect(limiter.canMakeRequest()).toBe(true);
    expect(limiter.getRetryAfterMs()).toBe(0);
  });

  it("uses a 5-per-minute default and can be reset", () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 5; i++) limiter.recordRequest();
    expect(limiter.canMakeRequest()).toBe(false);
    limiter.reset();
    expect(limiter.getRemainingRequests()).toBe(5);
  });
});
