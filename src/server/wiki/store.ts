import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parse, stringify } from "yaml";
import type { Status, Visibility } from "./schema.ts";

export interface Relation {
	type: string;
	target: string;
	note?: string;
}

// An open question has no answer yet.
export interface Question {
	text: string;
	answer?: string;
}

export interface Page {
	id: string;
	type: string;
	title: string;
	status: Status;
	visibility: Visibility;
	fields: Record<string, unknown>;
	relations: Relation[];
	notes?: string;
	questions?: Question[];
	body: string;
}

// A singleton page ("portada", "plan") or "<type>/<slug>"
export const ID_PATTERN = /^(portada|plan|[a-z]+\/[a-z0-9]+(?:-[a-z0-9]+)*)$/;

export const typeOfId = (id: string) => (id.includes("/") ? id.split("/")[0] : id);
export const LINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

const wikiDir = (projectDir: string) => join(projectDir, "wiki");
const pagePath = (projectDir: string, id: string) => join(wikiDir(projectDir), `${id}.md`);

export function serializePage(page: Page): string {
	const { body, ...card } = page;
	if (!card.notes) delete card.notes;
	if (!card.questions?.length) delete card.questions;
	return `---\n${stringify(card).trimEnd()}\n---\n\n${body.trim()}\n`;
}

export function parsePage(text: string): Page {
	const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) throw new Error("falta el encabezado YAML entre líneas ---");
	const card = parse(match[1]) ?? {};
	return {
		id: card.id,
		type: card.type,
		title: card.title,
		status: card.status ?? "borrador",
		visibility: card.visibility ?? "interna",
		fields: card.fields ?? {},
		relations: card.relations ?? [],
		notes: card.notes,
		questions: card.questions,
		body: match[2].trim(),
	};
}

export function pageExists(projectDir: string, id: string): boolean {
	return existsSync(pagePath(projectDir, id));
}

export function readPage(projectDir: string, id: string): Page {
	return parsePage(readFileSync(pagePath(projectDir, id), "utf8"));
}

export function writePage(projectDir: string, page: Page): void {
	const path = pagePath(projectDir, page.id);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(`${path}.tmp`, serializePage(page));
	renameSync(`${path}.tmp`, path);
}

export function listPageFiles(projectDir: string): { id: string; file: string }[] {
	const root = wikiDir(projectDir);
	if (!existsSync(root)) return [];
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".md"))
		.map((e) => {
			const file = join(e.parentPath, e.name);
			return { id: relative(root, file).slice(0, -3), file };
		})
		.sort((a, b) => a.id.localeCompare(b.id));
}

// Pages that fail to parse are returned as errors so the verifier can report them.
export function loadAll(projectDir: string): { pages: Page[]; broken: { id: string; error: string }[] } {
	const pages: Page[] = [];
	const broken: { id: string; error: string }[] = [];
	for (const { id, file } of listPageFiles(projectDir)) {
		try {
			pages.push(parsePage(readFileSync(file, "utf8")));
		} catch (e) {
			broken.push({ id, error: (e as Error).message });
		}
	}
	return { pages, broken };
}

// Changes a page id and points every relation and [[link]] to the new id.
// Returns the ids of the other pages that were updated.
export function renamePage(projectDir: string, oldId: string, newId: string): string[] {
	if (!oldId.includes("/")) throw new Error(`"${oldId}" no se puede renombrar`);
	if (!ID_PATTERN.test(newId)) throw new Error(`id inválido "${newId}": usa tipo/nombre-en-minusculas`);
	if (newId.split("/")[0] !== oldId.split("/")[0]) throw new Error("renombrar no cambia el tipo de la página");
	if (pageExists(projectDir, newId)) throw new Error(`ya existe la página "${newId}"`);

	const page = readPage(projectDir, oldId);
	writePage(projectDir, { ...page, id: newId });
	rmSync(pagePath(projectDir, oldId));

	const touched: string[] = [];
	for (const other of loadAll(projectDir).pages) {
		if (other.id === newId) continue;
		const relations = other.relations.map((r) => (r.target === oldId ? { ...r, target: newId } : r));
		const body = other.body.replace(LINK_PATTERN, (m, id: string, label?: string) =>
			id.trim() === oldId ? `[[${newId}${label ? `|${label}` : ""}]]` : m,
		);
		if (body !== other.body || relations.some((r, i) => r !== other.relations[i])) {
			writePage(projectDir, { ...other, relations, body });
			touched.push(other.id);
		}
	}
	return touched;
}

export function deletePage(projectDir: string, id: string): void {
	if (!id.includes("/")) throw new Error(`"${id}" no se puede borrar`);
	rmSync(pagePath(projectDir, id));
}

export function bodyLinks(body: string): string[] {
	return [...body.matchAll(LINK_PATTERN)].map((m) => m[1].trim());
}
