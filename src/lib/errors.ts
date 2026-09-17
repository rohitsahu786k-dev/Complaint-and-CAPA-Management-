import { ApiError, type ApiIssue } from "@/lib/api";
import { humaniseKey } from "@/lib/format";

/** How many field issues a toast lists before it stops and counts the rest. */
const MAX_LISTED_ISSUES = 4;

function formatIssue(issue: ApiIssue) {
  // "body" is what the server names an issue that belongs to no single field.
  const field = issue.field && issue.field !== "body" ? `${humaniseKey(issue.field)}: ` : "";
  return `${field}${issue.message}`;
}

/**
 * Turns any thrown value into the two lines a toast shows.
 *
 * The server answers a rejected request with both a headline and the exact fields that
 * blocked it, but every screen used to read only the headline - so a failed save showed
 * "Validation failed" and nothing else, leaving no way to tell which field was wrong.
 */
export function describeError(error: unknown, fallback: string): { title: string; description?: string } {
  if (error instanceof ApiError) {
    const title = error.message || fallback;
    if (error.issues.length === 0) return { title };
    const listed = error.issues.slice(0, MAX_LISTED_ISSUES).map(formatIssue);
    const remaining = error.issues.length - listed.length;
    return { title, description: remaining > 0 ? `${listed.join(" · ")} · +${remaining} more` : listed.join(" · ") };
  }
  if (error instanceof Error) return { title: error.message || fallback };
  return { title: fallback };
}

/** The same detail, flattened into the single line an inline error message shows. */
export function errorText(error: unknown, fallback: string): string {
  const detail = describeError(error, fallback);
  return detail.description ? `${detail.title}: ${detail.description}` : detail.title;
}
