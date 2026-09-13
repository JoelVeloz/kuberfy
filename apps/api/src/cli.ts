// Must load before anything else: @better-auth/passkey pulls in @simplewebauthn/server, which uses tsyringe's
// decorators — those throw "requires a reflect polyfill" at runtime unless this runs first. Only surfaces in the
// compiled binary (bun build --compile), not `bun run`/`bun test`, since dev mode's module order happens to load it in time.
import "reflect-metadata";

// Single compiled entrypoint dispatching to server/migrate/create-user/set-password — see private/IMAGE_OPTIMIZATION.md.
// Each subcommand used to be its own `bun build --compile` binary, tripling the embedded Bun runtime in the image.
const [command, ...rest] = Bun.argv.slice(2);
process.argv = [process.argv[0]!, process.argv[1]!, ...rest];

switch (command) {
  case "server": {
    const port = Number(process.env.PORT) || 3000;
    const { default: server } = await import("./index");
    const instance = Bun.serve({
      ...server,
      port,
    });
    console.log(`➜ Kuberfy control plane listening on http://${instance.hostname || "0.0.0.0"}:${instance.port}`);
    break;
  }
  case "migrate":
    await import("./db/migrate");
    break;
  case "create-user":
    await import("../scripts/create-user");
    break;
  case "set-password":
    await import("../scripts/set-password");
    break;
  case "update":
    await import("../scripts/update");
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined: {
    console.log(`
Kuberfy CLI

Usage:
  kuberfy <command> [options]

Commands:
  server        Start the API server
  update        Update Kuberfy to the latest version
  create-user   Create a new user account
  set-password  Reset user password
  migrate       Run database migrations
`);
    break;
  }
  default:
    console.error(`Unknown command: ${command}`);
    console.error("Usage: kuberfy [server|migrate|create-user|set-password|update] [args...]");
    process.exit(1);
}
