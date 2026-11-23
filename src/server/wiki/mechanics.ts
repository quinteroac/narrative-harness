import { checkEffect, parseCondition, parseEffect, refs, typeOf, varName, type ValueType, type VarInfo } from "./expr.ts";
import type { Page } from "./store.ts";
import type { Issue } from "./verify.ts";

// The state registry: every variable with who writes it and who reads it, derived from the
// conditions and effects of the pages that use the shared expression language.

export interface RegistryEntry {
	id: string;
	name: string;
	title: string;
	tipo: string;
	rango?: string;
	valores?: string[];
	inicial: unknown;
	visibilidad: string;
	revelacion?: string;
	writers: string[];
	readers: string[];
}

const VALUE_TYPE: Record<string, ValueType> = { si_no: "bool", contador: "number", numero: "number", texto: "string", opcion: "string" };

function asList(value: unknown): string[] {
	return Array.isArray(value) ? value.map(String) : [];
}

function variableInfo(page: Page, issues: Issue[]): VarInfo | undefined {
	const add = (level: Issue["level"], message: string) => issues.push({ level, page: page.id, message });
	const f = page.fields;
	const type = VALUE_TYPE[String(f.tipo)];
	if (!type) return undefined;
	const info: VarInfo = { type };
	if (type === "number") {
		if (typeof f.minimo === "number") info.min = f.minimo;
		else if (f.tipo === "contador") info.min = 0;
		if (typeof f.maximo === "number") info.max = f.maximo;
		if (info.min !== undefined && info.max !== undefined && info.min > info.max) add("error", "el mínimo es mayor que el máximo");
	}
	if (f.tipo === "opcion") {
		info.values = asList(f.valores);
		if (!info.values.length) add("error", 'una variable de tipo opcion necesita "Valores posibles"');
	}

	const initial = f.inicial;
	if (initial !== undefined) {
		const ok =
			type === "bool"
				? typeof initial === "boolean"
				: type === "number"
					? typeof initial === "number"
					: typeof initial === "string" && (!info.values?.length || info.values.includes(initial));
		if (!ok) add("error", `el valor inicial ${JSON.stringify(initial)} no encaja con el tipo ${f.tipo}`);
		else if (type === "number" && ((info.min !== undefined && (initial as number) < info.min) || (info.max !== undefined && (initial as number) > info.max)))
			add("error", "el valor inicial está fuera del rango");
	}
	if (f.visibilidad_jugador === "revelada" && !f.revelacion) add("aviso", 'es "revelada" pero no dice cuándo se revela');
	return info;
}

// A trigger changes state: when a condition holds, or at a moment of the game, its effects apply.
export interface Trigger {
	cuando?: string;
	al?: string;
	entonces: string[];
	nota?: string;
}

export function checkMechanics(pages: Page[]): { issues: Issue[]; registry: RegistryEntry[] } {
	const issues: Issue[] = [];
	const variables = pages.filter((p) => p.type === "variable");
	const env = new Map<string, VarInfo>();
	for (const page of variables) {
		const info = variableInfo(page, issues);
		if (info) env.set(varName(page.id), info);
	}

	const writers = new Map<string, Set<string>>();
	const readers = new Map<string, Set<string>>();
	const mark = (map: Map<string, Set<string>>, name: string, page: string) => map.set(name, (map.get(name) ?? new Set()).add(page));

	for (const page of pages) {
		const add = (message: string) => issues.push({ level: "error", page: page.id, message });
		const condition = (line: string, where: string) => {
			try {
				const node = parseCondition(line);
				const errors: string[] = [];
				const t = typeOf(node, env, errors);
				if (t && t !== "bool") errors.push("una condición debe dar sí/no");
				errors.forEach((e) => add(`${where} "${line}": ${e}`));
				refs(node).forEach((n) => mark(readers, n, page.id));
			} catch (e) {
				add(`${where} "${line}": ${(e as Error).message}`);
			}
		};
		const effect = (line: string, where: string) => {
			try {
				const parsed = parseEffect(line);
				checkEffect(parsed, env).forEach((e) => add(`${where} "${line}": ${e}`));
				mark(writers, parsed.target, page.id);
				refs(parsed.value).forEach((n) => mark(readers, n, page.id));
			} catch (e) {
				add(`${where} "${line}": ${(e as Error).message}`);
			}
		};
		for (const line of asList(page.fields.condiciones)) condition(line, "condición");
		const triggers = Array.isArray(page.fields.disparadores) ? (page.fields.disparadores as Trigger[]) : [];
		triggers.forEach((t, i) => {
			const where = `disparador ${i + 1}`;
			if (!t?.cuando && !t?.al) add(`${where}: necesita "cuando" (condición) o "al" (momento del juego)`);
			if (t?.cuando) condition(String(t.cuando), `${where}, cuando`);
			const effects = asList(t?.entonces);
			if (!effects.length) add(`${where}: falta "entonces"`);
			effects.forEach((line) => effect(line, `${where}, entonces`));
		});
	}

	const registry = variables.map((page): RegistryEntry => {
		const name = varName(page.id);
		const f = page.fields;
		const info = env.get(name);
		const entry: RegistryEntry = {
			id: page.id,
			name,
			title: page.title,
			tipo: String(f.tipo ?? ""),
			valores: f.tipo === "opcion" ? asList(f.valores) : undefined,
			rango: info?.min !== undefined || info?.max !== undefined ? `${info.min ?? "-∞"}..${info.max ?? "∞"}` : undefined,
			inicial: f.inicial,
			visibilidad: String(f.visibilidad_jugador ?? ""),
			revelacion: f.revelacion as string | undefined,
			writers: [...(writers.get(name) ?? [])],
			readers: [...(readers.get(name) ?? [])],
		};
		if (!entry.writers.length) issues.push({ level: "aviso", page: page.id, message: "nadie la cambia: siempre vale su valor inicial" });
		if (!entry.readers.length) issues.push({ level: "aviso", page: page.id, message: "nadie la lee: no influye en nada" });
		return entry;
	});
	return { issues, registry };
}
