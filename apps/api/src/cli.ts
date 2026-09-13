// Single compiled entrypoint dispatching to server/migrate/create-user/set-password — see IMAGE_OPTIMIZATION.md.
// Each subcommand used to be its own `bun build --compile` binary, tripling the embedded Bun runtime in the image.
const [command, ...rest] = Bun.argv.slice(2);
process.argv = [process.argv[0]!, process.argv[1]!, ...rest];

switch (command) {
  case "server":
  case undefined: {
    const { default: server } = await import("./index");
    Bun.serve(server);
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
  default:
    console.error(`Unknown command: ${command}`);
    console.error("Usage: kuberfy [server|migrate|create-user|set-password|update] [args...]");
    process.exit(1);
}
