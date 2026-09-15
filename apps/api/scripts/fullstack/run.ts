// Usage: bun run scripts/fullstack/run.ts <preset>
// Presets: laravel-postgres, nextjs-postgres, wordpress-mysql, node-postgres (see presets.ts)
import { runPreset } from "./engine";
import { presets } from "./presets";

const name = process.argv[2];
const preset = name && presets[name];
if (!preset) {
  console.error(`Usage: bun run scripts/fullstack/run.ts <preset>\nAvailable presets: ${Object.keys(presets).join(", ")}`);
  process.exit(1);
}

await runPreset(preset);
