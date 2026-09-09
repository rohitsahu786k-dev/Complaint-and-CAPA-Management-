/**
 * Pure decision helpers for the failed sign-in lockout.
 *
 * These are kept free of Mongo so the rules stay unit-testable: the original
 * implementation lived inline in `authenticate` and shipped two defects that no
 * test could catch — a lockout hidden behind the generic "invalid credentials"
 * message, and a failure counter that was never cleared once the lock expired
 * (so the next mistyped password re-locked the account forever).
 */

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export type LockoutState = {
  failedLoginCount?: number | null;
  lockedUntil?: Date | null;
};

/** True only while a lock is still in force. */
export function isLocked(state: LockoutState, now: Date = new Date()): boolean {
  return Boolean(state.lockedUntil && state.lockedUntil > now);
}

/** Whole minutes the caller must still wait; always at least 1 so we never say "0 minutes". */
export function lockMinutesRemaining(state: LockoutState, now: Date = new Date()): number {
  if (!state.lockedUntil) return 0;
  return Math.max(1, Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 60000));
}

/**
 * The failure streak that a new attempt builds on. An expired lock means the
 * previous streak has been served, so it must not carry over.
 */
export function effectiveFailureCount(state: LockoutState, now: Date = new Date()): number {
  if (isLocked(state, now)) return state.failedLoginCount || 0;
  if (state.lockedUntil) return 0;
  return state.failedLoginCount || 0;
}

/** Applies one failed attempt and reports the resulting counter and lock. */
export function registerFailedAttempt(
  state: LockoutState,
  now: Date = new Date()
): { failedLoginCount: number; locked: boolean; lockedUntil: Date | null } {
  const failedLoginCount = effectiveFailureCount(state, now) + 1;
  const locked = failedLoginCount >= MAX_FAILED_LOGINS;
  return {
    failedLoginCount,
    locked,
    lockedUntil: locked ? new Date(now.getTime() + LOCKOUT_MS) : null
  };
}
