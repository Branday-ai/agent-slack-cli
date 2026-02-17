# agent-slack-cli

Slack CLI for AI agent projects. Post messages, check for new messages, search history, upload files, and react — all from the command line.

Built for agents that use Bash tools (Claude Code, Cursor, etc.) instead of MCP.

## Install

```
pnpm add github:xtresse/agent-slack-cli tsx
```

The `slack` command is available in your project after install.

## Setup

Create a `.env` in your project root:

```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNELS=general:C0123456789,alerts:C9876543210
SLACK_DEFAULT_CHANNEL=general
```

## Commands

```
slack check                                          # Fetch new messages
slack reply "Hello" [--channel general] [--as alice]  # Post message
slack reply "In thread" --thread 1234.5678           # Reply in thread
slack edit <ts> "Updated text" [--channel general]   # Edit message
slack delete <ts> [--channel general]                # Delete message
slack react <ts> thumbsup [--channel general]        # Add reaction
slack react <ts> thumbsup --remove                   # Remove reaction
slack upload ./file.pdf [--message "Here"] [--channel general]  # Upload file
slack search "keyword" [--limit 10] [--channel general]         # Search
slack history [--limit 20] [--channel general]                  # Recent messages
```

## Multi-Agent Mode

Give each agent its own Slack bot token:

```
SLACK_BOT_TOKEN_ALICE=xoxb-...
SLACK_BOT_TOKEN_BOB=xoxb-...
```

Then use `--as` to post as a specific agent:

```
slack reply "Hello from Alice" --as alice
```

## Team Filtering

The `check` command separates team messages from automated/bot messages. Configure team members:

```
SLACK_TEAM_IDS=alice:U001,bob:U002,charlie:U003
SLACK_AGENT_IDS=mybot:U004
```

## All Env Vars

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | Yes | Default bot token |
| `SLACK_CHANNELS` | Yes | Channel map: `name:ID,name:ID` |
| `SLACK_DEFAULT_CHANNEL` | No | Default channel name |
| `SLACK_BOT_TOKEN_*` | No | Per-agent tokens (e.g. `SLACK_BOT_TOKEN_ALICE`) |
| `SLACK_TEAM_IDS` | No | Team members: `name:ID,name:ID` |
| `SLACK_AGENT_IDS` | No | Agent bot users: `name:ID` |
| `SLACK_SELF_BOT_NAME` | No | Filter own bot messages from `check` |
| `SLACK_STATE_DIR` | No | Where state files go (default: `./memory`) |
| `SLACK_DOWNLOAD_DIR` | No | Where downloaded files go (default: `./slack`) |
| `SLACK_CHANNEL_ID` | No | Legacy single-channel fallback |
