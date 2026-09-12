/**
 * Deletes old Vercel deployments for this project.
 *
 * Vercel retains every deployment forever, and each one carries its own source snapshot,
 * build output and build cache -- roughly 160 MB here. Five days of iteration had put 89
 * deployments and 14.5 GB against a Hobby plan, so this trims the tail on demand.
 *
 * Dry run by default. Pass --apply to actually delete.
 *
 *   VERCEL_TOKEN=... npm run vercel:prune
 *   VERCEL_TOKEN=... npm run vercel:prune -- --apply --keep=5
 *
 * Never touched, regardless of --keep:
 *   - the deployment currently serving production
 *   - anything an alias points at (custom domains, branch URLs)
 */
import { readFileSync } from "node:fs";

const API = "https://api.vercel.com";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const keepArg = args.find((arg) => arg.startsWith("--keep="));
const keepCount = keepArg ? Number(keepArg.split("=")[1]) : 3;

const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("VERCEL_TOKEN is not set. Create one at https://vercel.com/account/tokens.");
  process.exit(1);
}
if (!Number.isInteger(keepCount) || keepCount < 1) {
  console.error(`--keep must be a positive integer, got "${keepArg}".`);
  process.exit(1);
}

/** Falls back to .vercel/project.json, which `vercel link` writes and git ignores. */
function projectRef() {
  const fromEnv = { projectId: process.env.VERCEL_PROJECT_ID, teamId: process.env.VERCEL_TEAM_ID };
  if (fromEnv.projectId) return fromEnv;
  try {
    const linked = JSON.parse(readFileSync(new URL("../.vercel/project.json", import.meta.url), "utf8"));
    return { projectId: linked.projectId, teamId: linked.orgId };
  } catch {
    console.error("Set VERCEL_PROJECT_ID (and VERCEL_TEAM_ID), or run `vercel link` first.");
    process.exit(1);
  }
}

const { projectId, teamId } = projectRef();

async function api(path, init) {
  const url = new URL(path, API);
  url.searchParams.set("projectId", projectId);
  if (teamId) url.searchParams.set("teamId", teamId);
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function allDeployments() {
  const collected = [];
  let until;
  for (;;) {
    const path = until ? `/v6/deployments?limit=100&until=${until}` : "/v6/deployments?limit=100";
    const page = await api(path);
    if (!page.deployments?.length) break;
    collected.push(...page.deployments);
    if (!page.pagination?.next) break;
    until = page.pagination.next;
  }
  return collected.sort((a, b) => b.created - a.created);
}

const [project, deployments, aliasList] = await Promise.all([
  api(`/v9/projects/${projectId}`),
  allDeployments(),
  api("/v4/aliases?limit=100")
]);

const live = project.targets?.production?.id;
const aliased = new Set((aliasList.aliases ?? []).map((alias) => alias.deploymentId));
const rollbacks = deployments
  .filter((d) => d.state === "READY" && (d.target ?? "preview") === "production")
  .slice(0, keepCount)
  .map((d) => d.uid);

const keep = new Set([live, ...aliased, ...rollbacks].filter(Boolean));
const doomed = deployments.filter((d) => !keep.has(d.uid));

const describe = (d) =>
  [
    new Date(d.created).toISOString().slice(0, 16).replace("T", " "),
    d.state.padEnd(8),
    (d.target ?? "preview").padEnd(10),
    (d.meta?.githubCommitSha ?? "").slice(0, 7)
  ].join("  ");

console.log(`Keeping ${keep.size} of ${deployments.length} deployments:`);
for (const d of deployments.filter((x) => keep.has(x.uid))) {
  const why = d.uid === live ? "live production" : aliased.has(d.uid) ? "aliased" : "rollback target";
  console.log(`  ${describe(d)}  ${why}`);
}

if (doomed.length === 0) {
  console.log("Nothing to delete.");
  process.exit(0);
}

const counts = doomed.reduce((tally, d) => {
  const key = `${d.state}/${d.target ?? "preview"}`;
  tally[key] = (tally[key] ?? 0) + 1;
  return tally;
}, {});
console.log(`\nDeleting ${doomed.length}:`);
for (const [key, count] of Object.entries(counts).sort()) {
  console.log(`  ${String(count).padStart(3)}  ${key}`);
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply to delete.");
  process.exit(0);
}

let deleted = 0;
const failures = [];
for (const d of doomed) {
  try {
    await api(`/v13/deployments/${d.uid}`, { method: "DELETE" });
    deleted += 1;
    if (deleted % 20 === 0) console.log(`  ${deleted}/${doomed.length}`);
  } catch (error) {
    failures.push(`${d.uid}: ${error instanceof Error ? error.message : String(error)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
}

console.log(`\nDeleted ${deleted} of ${doomed.length}.`);
if (failures.length) {
  console.error(`Failed ${failures.length}:`);
  for (const failure of failures.slice(0, 10)) console.error(`  ${failure}`);
  process.exitCode = 1;
}
