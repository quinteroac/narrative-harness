import { listPageFiles, loadAll, bodyLinks, ID_PATTERN, typeOfId, type Page } from "./store.ts";
import { checkMechanics } from "./mechanics.ts";
import { pageType, phase, RELATION_TYPES, STATUSES, VISIBILITIES } from "./schema.ts";

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
	if (typeOfId(page.id) !== page.type) add("error", def.singleton ? `el id debe ser "${page.type}"` : `el id debe empezar por "${page.type}/"`);

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
		if (field.kind === "choice" && !field.options?.includes(String(value))) add("error", `"${field.label}" debe ser uno de: ${field.options?.join(", ")}`);
		if (field.kind === "conditions" && (!Array.isArray(value) || value.some((v) => typeof v !== "string")))
			add("error", `"${field.label}" debe ser una lista de expresiones, una por línea`);
		if (field.kind === "triggers" && !Array.isArray(value)) add("error", `"${field.label}" debe ser una lista de { cuando, al, entonces }`);
		if (field.kind === "fundamentos") {
			if (!Array.isArray(value)) add("error", `"${field.label}" debe ser una lista`);
			else
				value.forEach((item, i) => {
					if (!item || typeof item.titulo !== "string") add("error", `fundamento ${i + 1}: falta "titulo"`);
					if (item?.paginas !== undefined && (!Array.isArray(item.paginas) || item.paginas.some((p: unknown) => typeof p !== "string" || !ID_PATTERN.test(p))))
						add("error", `fundamento ${i + 1}: "paginas" debe ser una lista de ids`);
					if (item?.cantidad !== undefined && typeof item.cantidad !== "number") add("error", `fundamento ${i + 1}: "cantidad" debe ser un número`);
					if (item?.fase !== undefined && !phase(String(item.fase))) add("error", `fundamento ${i + 1}: fase desconocida "${item.fase}"`);
				});
		}
	}
	for (const key of Object.keys(page.fields)) {
		if (!def.fields.some((f) => f.key === key)) add("aviso", `campo no definido para ${def.label}: "${key}"`);
	}

	if (page.questions !== undefined && (!Array.isArray(page.questions) || page.questions.some((q) => !q || typeof q.text !== "string")))
		add("error", `"questions" debe ser una lista de { text, answer }`);

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
	issues.push(...checkMechanics(pages).issues);
	if (!ids.has("portada")) issues.push({ level: "error", page: "portada", message: "el proyecto no tiene portada" });
	return issues;
}
