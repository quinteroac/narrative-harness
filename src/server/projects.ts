import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { config } from "./config.ts";
import { writePage } from "./wiki/store.ts";

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
		.map((e) => ({ id: e.name, ...parse(readFileSync(join(config.projectsDir, e.name, "project.yaml"), "utf8")) }))
		.sort((a, b) => b.created.localeCompare(a.created));
}

function slugify(title: string): string {
	return (
		title
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
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

	const info = { title, created: new Date().toISOString() };
	writeFileSync(join(dir, "project.yaml"), stringify(info));
	writeFileSync(join(dir, ".gitignore"), ".harness/sessions/\n");
	writePage(dir, { id: "portada", type: "portada", title, status: "borrador", visibility: "publica", fields: {}, relations: [], body: "" });

	execFileSync("git", ["init", "-q"], { cwd: dir });
	commit(dir, "autor: crea el proyecto");
	return { id, ...info };
}

// Every change to a project is a commit, so nothing is ever lost.
export function commit(dir: string, message: string): boolean {
	execFileSync("git", ["add", "-A"], { cwd: dir });
	const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: dir, encoding: "utf8" }).trim();
	if (!staged) return false;
	execFileSync("git", ["commit", "-q", "-m", message], { cwd: dir });
	return true;
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
