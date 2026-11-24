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
	// Local ComfyUI that renders screen mockups with Ming-Image 0.1 Design.
	comfyUrl: get("COMFY_URL", "http://127.0.0.1:8188"),
	mockupUnet: get("MOCKUP_UNET", "ming/ming_image_0.1_design_int8_convrot.safetensors"),
	mockupClip: get("MOCKUP_CLIP", "ming/ming_image_0.1_ling_mini_2.0_int8_convrot.safetensors"),
	mockupVae: get("MOCKUP_VAE", "ming/ming_image_vae_bf16.safetensors"),
};
