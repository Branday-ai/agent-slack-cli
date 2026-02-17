// Team member Slack user IDs — messages from these users are always shown in full.
// Everyone else (CI bots, webhooks, system alerts) gets condensed to counts.
//
// Configure via env vars:
//   SLACK_TEAM_IDS=patrick:U0AFEP22HV2,kaysar:U0AFSMYSYC8,sam:U0AES1Q2NR1
//   SLACK_AGENT_IDS=emily:U0AF8Q4EHFX

function parseIdMap(envVar: string | undefined): Record<string, string> | null {
  if (!envVar) return null;
  const map: Record<string, string> = {};
  for (const pair of envVar.split(',')) {
    const [name, id] = pair.split(':');
    if (name && id) map[name.trim()] = id.trim();
  }
  return Object.keys(map).length > 0 ? map : null;
}

// --- Team members ---
const envTeamIds = parseIdMap(process.env.SLACK_TEAM_IDS);
const envAgentIds = parseIdMap(process.env.SLACK_AGENT_IDS);

// Build team member set from env (no hardcoded defaults — configure per project)
const teamIds = envTeamIds
  ? [...Object.values(envTeamIds), ...(envAgentIds ? Object.values(envAgentIds) : [])]
  : [];

if (teamIds.length === 0 && process.argv[2] === "check") {
  console.warn("Warning: SLACK_TEAM_IDS not set. All messages will show as automated.");
}

export const TEAM_MEMBER_USER_IDS = new Set(teamIds);

// Agent IDs from env (empty if not configured)
export const AGENT_IDS: Record<string, string> = envAgentIds ?? {};
