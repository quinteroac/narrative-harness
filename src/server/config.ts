import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// config.json (optional, not committed) overrides defaults; env overrides both.
const file = join(ROOT, "config.json");
const fromFile: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
const get = (key: string, fallback: string) => process.env[key] ?? fromFile[key] ?? fallback;

export const config = {
	host: get("HOST", "127.0.0.1"),
	port: Number(get("PORT", "8810")),
	projectsDir: resolve(get("PROJECTS_DIR", join(ROOT, "projects"))),
	// "provider/model" as pi names them, e.g. anthropic/claude-opus-5-5 or openrouter/<id>
	model: get("MODEL", "anthropic/claude-opus-5-5"),
	thinking: get("THINKING", "medium") as "off" | "low" | "medium" | "high",
};
