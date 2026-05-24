/**
 * Convert an agent persona name (e.g. "Uxje", "Star Walker") into the
 * canonical subdomain label.
 *
 * Rules:
 *  - lowercase
 *  - whitespace collapsed to a single hyphen
 *  - any character outside [a-z0-9-] dropped
 *  - leading/trailing hyphens trimmed
 *
 * Returns null when the result is empty or too long for a DNS label (>63 chars).
 *
 * The output is what we store in `agent_routes.agent_name` and what the
 * Dispatch Worker looks up against the Host header.
 */
export function normaliseAgentName(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const normalised = raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (normalised.length === 0 || normalised.length > 63) return null;
  return normalised;
}
