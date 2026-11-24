import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mediaDir, pageExists, readPage, type Page } from "./store.ts";

// A mockup is generated from a page's card. Its sidecar keeps the prompt and a hash of the card
// at that moment, so the page can tell when the mockup no longer matches what the card says.

export interface MediaItem {
	file: string;
	created: string;
	size: string;
	seed: number;
	stale: boolean;
}

interface Sidecar {
	created: string;
	size: string;
	seed: number;
	card: string;
	prompt: unknown;
}

const cardHash = (page: Page) => createHash("sha1").update(JSON.stringify({ title: page.title, fields: page.fields })).digest("hex");

export function saveMockup(projectDir: string, id: string, image: Buffer, meta: { size: string; seed: number; prompt: unknown }): string {
	const dir = mediaDir(projectDir, id);
	mkdirSync(dir, { recursive: true });
	const created = new Date().toISOString();
	const file = `mockup-${created.replace(/[-:]/g, "").replace(/\..*/, "")}.png`;
	writeFileSync(join(dir, file), image);
	const sidecar: Sidecar = { created, ...meta, card: cardHash(readPage(projectDir, id)) };
	writeFileSync(join(dir, `${file}.json`), JSON.stringify(sidecar, null, 2));
	return file;
}

export function listMedia(projectDir: string, id: string): MediaItem[] {
	const dir = mediaDir(projectDir, id);
	if (!existsSync(dir) || !pageExists(projectDir, id)) return [];
	const current = cardHash(readPage(projectDir, id));
	return readdirSync(dir)
		.filter((f) => f.endsWith(".png") && existsSync(join(dir, `${f}.json`)))
		.map((file) => {
			const meta: Sidecar = JSON.parse(readFileSync(join(dir, `${file}.json`), "utf8"));
			return { file, created: meta.created, size: meta.size, seed: meta.seed, stale: meta.card !== current };
		})
		.sort((a, b) => b.created.localeCompare(a.created));
}

export function deleteMedia(projectDir: string, id: string, file: string) {
	if (!listMedia(projectDir, id).some((m) => m.file === file)) throw new Error("no existe esa imagen");
	const dir = mediaDir(projectDir, id);
	rmSync(join(dir, file));
	rmSync(join(dir, `${file}.json`));
}
