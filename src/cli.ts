#!/usr/bin/env node

import { validateConfig } from "./config.js";

const COMMANDS: Record<string, { desc: string; usage: string }> = {
  reply:   { desc: "Post a message",           usage: "slack reply <message> [--channel <name>] [--thread <ts>] [--as <agent>] [--stdin]" },
  edit:    { desc: "Edit a message",            usage: "slack edit <ts> <new_message> [--channel <name>] [--as <agent>]" },
  delete:  { desc: "Delete a message",          usage: "slack delete <ts> [--channel <name>] [--as <agent>]" },
  react:   { desc: "Add/remove a reaction",     usage: "slack react <ts> <emoji> [--channel <name>] [--remove] [--as <agent>]" },
  upload:  { desc: "Upload a file",             usage: "slack upload <filepath> [--message <text>] [--channel <name>] [--as <agent>]" },
  search:  { desc: "Search message history",    usage: "slack search <query> [--limit N] [--channel <name>]" },
  history: { desc: "Show recent messages",      usage: "slack history <channel> [--limit N] [--as <agent>]" },
  check:   { desc: "Fetch new messages",        usage: "slack check" },
};

function showHelp(): void {
  console.log("Slack CLI\n");
  console.log("Usage: slack <command> [options]\n");
  console.log("Commands:");
  const maxLen = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(maxLen + 2)}${cmd.desc}`);
  }
  console.log(`\nRun "slack <command>" with no args for detailed usage.`);
  console.log(`\nReads .env from current directory for Slack tokens and channels.`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    showHelp();
    process.exit(0);
  }

  if (!COMMANDS[command]) {
    console.error(`Unknown command: ${command}`);
    console.error(`Run "slack help" to see available commands.`);
    process.exit(1);
  }

  // Validate config before running any command
  try {
    validateConfig();
  } catch (error: any) {
    console.error(`Config error: ${error.message}`);
    console.error(`Make sure .env exists in ${process.cwd()} with SLACK_BOT_TOKEN and SLACK_CHANNELS.`);
    process.exit(1);
  }

  // Inject args back into process.argv so each command's arg parser works unchanged
  process.argv = [process.argv[0], process.argv[1], ...args];

  switch (command) {
    case "reply": {
      const { reply } = await import("./reply.js");
      await reply();
      break;
    }
    case "edit": {
      const { edit } = await import("./edit.js");
      await edit();
      break;
    }
    case "delete": {
      const { deleteMessage } = await import("./delete.js");
      await deleteMessage();
      break;
    }
    case "react": {
      const { react } = await import("./react.js");
      await react();
      break;
    }
    case "upload": {
      const { upload } = await import("./upload.js");
      await upload();
      break;
    }
    case "search": {
      const { search } = await import("./search.js");
      await search();
      break;
    }
    case "history": {
      const { history } = await import("./history.js");
      await history();
      break;
    }
    case "check": {
      const { check } = await import("./check.js");
      await check();
      break;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
