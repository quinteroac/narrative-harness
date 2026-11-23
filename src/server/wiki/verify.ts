import { listPageFiles, loadAll, bodyLinks, ID_PATTERN, type Page } from "./store.ts";
import { pageType, RELATION_TYPES, STATUSES, VISIBILITIES } from "./schema.ts";

export interface Issue {
	level: "error" | "aviso";
	page: string;
	message: string;
}

export function isEmpty(value: unknown): boolean {
	return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function checkPage(page: Page, file: string, ids: Set<string>, issues: Issue[]) {
	const add = (level: Issue["level"], message: string) => issues.push({ level, page: file, message });

	if (page.id !== file) add("error", `el id "${page.id}" no coincide con el archivo "${file}"`);
	if (!ID_PATTERN.test(file)) add("error", `id inválido: usa "tipo/nombre-en-minusculas"`);
	if (!page.title) add("error", "falta el título");
	if (!STATUSES.includes(page.status)) add("error", `estado desconocido "${page.status}"`);
	if (!VISIBILITIES.includes(page.visibility)) add("error", `visibilidad desconocida "${page.visibility}"`);

	const def = pageType(page.type);
	if (!def) {
		add("error", `tipo de página desconocido "${page.type}"`);
		return;
	}
	if (page.id !== "portada" && !page.id.startsWith(`${page.type}/`)) add("error", `el id debe empezar por "${page.type}/"`);

	const settled = page.status === "aprobada" || page.status === "bloqueada";
	for (const field of def.fields) {
		const value = page.fields[field.key];
		if (isEmpty(value)) {
			if (field.required) add(settled ? "error" : "aviso", `falta el campo "${field.label}"`);
			continue;
		}
		if (field.kind === "number" && typeof value !== "number") add("error", `"${field.label}" debe ser un número`);
		if (field.kind === "list" && !Array.isArray(value)) add("error", `"${field.label}" debe ser una lista`);
		if (field.kind === "boolean" && typeof value !== "boolean") add("error", `"${field.label}" debe ser sí/no`);
	}
	for (const key of Object.keys(page.fields)) {
		if (!def.fields.some((f) => f.key === key)) add("aviso", `campo no definido para ${def.label}: "${key}"`);
	}

	for (const rel of page.relations) {
		if (!RELATION_TYPES[rel.type]) add("aviso", `tipo de relación no catalogado "${rel.type}"`);
		if (!ids.has(rel.target)) add("error", `relación hacia una página que no existe: "${rel.target}"`);
	}
	for (const link of bodyLinks(page.body)) {
		if (!ids.has(link)) add("aviso", `enlace roto en el texto: [[${link}]]`);
	}
}

export function verifyProject(projectDir: string): Issue[] {
	const { pages, broken } = loadAll(projectDir);
	const files = listPageFiles(projectDir).map((f) => f.id);
	const ids = new Set(files);
	const issues: Issue[] = broken.map((b) => ({ level: "error" as const, page: b.id, message: `no se puede leer: ${b.error}` }));
	const parsed = files.filter((f) => !broken.some((b) => b.id === f));
	pages.forEach((page, i) => checkPage(page, parsed[i], ids, issues));
	if (!ids.has("portada")) issues.push({ level: "error", page: "portada", message: "el proyecto no tiene portada" });
	return issues;
}
