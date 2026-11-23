import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { config } from "./config.ts";
import { pageExists, readPage, writePage } from "./wiki/store.ts";

export interface ProjectInfo {
	id: string;
	title: string;
	created: string;
}

export function projectDir(id: string): string {
	if (!/^[a-z0-9-]+$/.test(id)) throw new Error("id de proyecto inválido");
	const dir = join(config.projectsDir, id);
	if (!existsSync(join(dir, "project.yaml"))) throw new Error(`no existe el proyecto "${id}"`);
	return dir;
}

export function listProjects(): ProjectInfo[] {
	if (!existsSync(config.projectsDir)) return [];
	return readdirSync(config.projectsDir, { withFileTypes: true })
		.filter((e) => e.isDirectory() && existsSync(join(config.projectsDir, e.name, "project.yaml")))
		.map((e) => {
			const dir = join(config.projectsDir, e.name);
			const { created } = parse(readFileSync(join(dir, "project.yaml"), "utf8"));
			// The project is named by its portada, so renaming the game renames the project.
			const title = pageExists(dir, "portada") ? readPage(dir, "portada").title : e.name;
			return { id: e.name, title, created };
		})
		.sort((a, b) => b.created.localeCompare(a.created));
}

export function slugify(title: string): string {
	return (
		title
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "proyecto"
	);
}

export function createProject(title: string): ProjectInfo {
	const base = slugify(title);
	let id = base;
	for (let n = 2; existsSync(join(config.projectsDir, id)); n++) id = `${base}-${n}`;
	const dir = join(config.projectsDir, id);
	mkdirSync(join(dir, ".harness"), { recursive: true });

	const created = new Date().toISOString();
	writeFileSync(join(dir, "project.yaml"), stringify({ created }));
	writeFileSync(join(dir, ".gitignore"), ".harness/sessions/\n");
	writePage(dir, { id: "portada", type: "portada", title, status: "borrador", visibility: "publica", fields: {}, relations: [], body: "" });

	execFileSync("git", ["init", "-q"], { cwd: dir });
	commit(dir, "autor: crea el proyecto");
	return { id, title, created };
}

// Every change to a project is a commit, so nothing is ever lost.
export function commit(dir: string, message: string): boolean {
	execFileSync("git", ["add", "-A"], { cwd: dir });
	const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: dir, encoding: "utf8" }).trim();
	if (!staged) return false;
	execFileSync("git", ["commit", "-q", "-m", message], { cwd: dir });
	return true;
}

// Files edited outside the harness (an editor, Obsidian) are recorded as the author's
// before anything else commits, so they are not mixed into an agent or approval commit.
export function commitManualEdits(dir: string): void {
	commit(dir, "autor: ediciones manuales");
}

export function history(dir: string, path?: string): { hash: string; date: string; message: string }[] {
	const args = ["log", "--format=%h%x1f%aI%x1f%s", "-n", "50"];
	if (path) args.push("--", path);
	const out = execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
	return out ? out.split("\n").map((l) => {
		const [hash, date, message] = l.split("\x1f");
		return { hash, date, message };
	}) : [];
}
