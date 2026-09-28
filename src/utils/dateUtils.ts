/**
 * Date Utilities — Relative time formatting ("2 hours ago", "Yesterday").
 */

/**
 * Format a date as a relative time string.
 */
export function relativeTime(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'Just now';
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }
  if (diffDay === 1) {
    return 'Yesterday';
  }
  if (diffDay < 7) {
    return `${diffDay}d ago`;
  }
  if (diffDay < 30) {
    const weeks = Math.floor(diffDay / 7);
    return `${weeks}w ago`;
  }

  return then.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: then.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Get a date bucket label for timeline grouping.
 */
export function getTimeBucket(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - (todayStart.getDay() * 86400000));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  if (then >= todayStart) {
    return 'Today';
  }
  if (then >= yesterdayStart) {
    return 'Yesterday';
  }
  if (then >= weekStart) {
    return 'This Week';
  }
  if (then >= monthStart) {
    return 'This Month';
  }

  return then.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Generate a timestamp-based filename for quick capture notes.
 * Format: YYYY-MM-DD-N (e.g., "2026-09-28-1")
 */
export function generateTimestampName(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toTimeString().slice(0, 5).replace(':', ''); // HHMM
  return `${dateStr}-${timeStr}`;
}

/**
 * Format a date for display in frontmatter.
 */
export function toISOString(date?: Date): string {
  return (date || new Date()).toISOString();
}
