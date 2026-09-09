import { describe, expect, it } from "vitest";
import { LOCKOUT_MS, MAX_FAILED_LOGINS, effectiveFailureCount, isLocked, lockMinutesRemaining, registerFailedAttempt } from "./lockout";

describe("Failed sign-in lockout rules", () => {
  const now = new Date("2026-09-09T10:00:00.000Z");
  const future = new Date(now.getTime() + 5 * 60 * 1000);
  const past = new Date(now.getTime() - 60 * 1000);

  it("treats a future lockedUntil as locked and an expired one as not locked", () => {
    expect(isLocked({ lockedUntil: future }, now)).toBe(true);
    expect(isLocked({ lockedUntil: past }, now)).toBe(false);
    expect(isLocked({ lockedUntil: null }, now)).toBe(false);
  });

  it("reports the remaining wait as whole minutes, never zero", () => {
    expect(lockMinutesRemaining({ lockedUntil: future }, now)).toBe(5);
    expect(lockMinutesRemaining({ lockedUntil: new Date(now.getTime() + 1000) }, now)).toBe(1);
    expect(lockMinutesRemaining({ lockedUntil: null }, now)).toBe(0);
  });

  it("clears the failure streak once the lock has expired", () => {
    // Regression: a stale counter used to survive the lock window, so the next
    // mistyped password immediately re-locked the account, forever.
    expect(effectiveFailureCount({ failedLoginCount: 7, lockedUntil: past }, now)).toBe(0);
  });

  it("keeps the streak while a lock is still in force", () => {
    expect(effectiveFailureCount({ failedLoginCount: 7, lockedUntil: future }, now)).toBe(7);
  });

  it("counts up without locking below the threshold", () => {
    const result = registerFailedAttempt({ failedLoginCount: 1, lockedUntil: null }, now);
    expect(result).toEqual({ failedLoginCount: 2, locked: false, lockedUntil: null });
  });

  it("locks exactly on the configured threshold", () => {
    const result = registerFailedAttempt({ failedLoginCount: MAX_FAILED_LOGINS - 1, lockedUntil: null }, now);
    expect(result.locked).toBe(true);
    expect(result.failedLoginCount).toBe(MAX_FAILED_LOGINS);
    expect(result.lockedUntil).toEqual(new Date(now.getTime() + LOCKOUT_MS));
  });

  it("restarts at one after an expired lock instead of re-locking instantly", () => {
    const result = registerFailedAttempt({ failedLoginCount: 9, lockedUntil: past }, now);
    expect(result).toEqual({ failedLoginCount: 1, locked: false, lockedUntil: null });
  });
});
