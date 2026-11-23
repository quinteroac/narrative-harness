import { loadAll, pageExists, readPage, writePage, type Page } from "./store.ts";
import { pageType, phase, PHASES } from "./schema.ts";
import { isEmpty } from "./verify.ts";

// How far the project is: the current phase and each of its fundamentals, in priority order.
// A phase is ready to leave when all its fundamentals are approved; leaving is never blocked.

export type PageState = "falta" | "incompleta" | "completa" | "aprobada";
export type ItemState = "pendiente" | "en_progreso" | "completo" | "aprobado";

export interface ItemProgress {
	titulo: string;
	nota?: string;
	cantidad: number;
	pages: { id: string; title: string; state: PageState; missing: string[] }[];
	state: ItemState;
}

export interface PhaseProgress {
	id: string;
	label: string;
	description: string;
	state: "hecha" | "actual" | "disponible" | "proximamente";
}

export interface Progress {
	plan: { status: string } | null;
	phase: string;
	phases: PhaseProgress[];
	nextPhase: string | null;
	ready: boolean;
	items: ItemProgress[];
	next: ItemProgress[];
	unapproved: ItemProgress[];
	questions: { page: string; title: string; text: string }[];
}

interface PlanItem {
	titulo: string;
	paginas?: string[];
	cantidad?: number;
	nota?: string;
	fase?: string;
}

// The concept phase needs no plan: its fundamental is the portada.
const CONCEPT_ITEM: PlanItem = { titulo: "Portada: premisa, género, tono y pilares", paginas: ["portada"] };

function pageState(page: Page | undefined): { state: PageState; missing: string[] } {
	if (!page) return { state: "falta", missing: [] };
	const missing = (pageType(page.type)?.fields ?? []).filter((f) => f.required && isEmpty(page.fields[f.key])).map((f) => f.label);
	if (missing.length) return { state: "incompleta", missing };
	return { state: page.status === "aprobada" || page.status === "bloqueada" ? "aprobada" : "completa", missing };
}

function itemProgress(item: PlanItem, byId: Map<string, Page>): ItemProgress {
	const ids = item.paginas ?? [];
	const pages = ids.map((id) => ({ id, title: byId.get(id)?.title ?? id, ...pageState(byId.get(id)) }));
	const cantidad = Math.max(item.cantidad ?? 0, ids.length, 1);
	const existing = pages.filter((p) => p.state !== "falta");
	const done = pages.filter((p) => p.state === "completa" || p.state === "aprobada");
	let state: ItemState = "pendiente";
	if (done.length >= cantidad) state = done.every((p) => p.state === "aprobada") ? "aprobado" : "completo";
	else if (existing.length) state = "en_progreso";
	return { titulo: item.titulo, nota: item.nota, cantidad, pages, state };
}

function openQuestions(pages: Page[]) {
	return pages.flatMap((p) => (p.questions ?? []).filter((q) => !q.answer).map((q) => ({ page: p.id, title: p.title, text: q.text })));
}

export function projectProgress(projectDir: string): Progress {
	const { pages } = loadAll(projectDir);
	const byId = new Map(pages.map((p) => [p.id, p]));
	const plan = byId.get("plan");
	const current = plan ? String(plan.fields.fase ?? "concepto") : "concepto";
	const planned = Array.isArray(plan?.fields.fundamentos) ? (plan.fields.fundamentos as PlanItem[]).filter((i) => i?.titulo && (i.fase ?? current) === current) : [];
	const items = (planned.length || current !== "concepto" ? planned : [CONCEPT_ITEM]).map((i) => itemProgress(i, byId));

	const index = PHASES.findIndex((p) => p.id === current);
	const phases = PHASES.map((p, i): PhaseProgress => ({
		id: p.id,
		label: p.label,
		description: p.description,
		state: i < index ? "hecha" : i === index ? "actual" : p.built ? "disponible" : "proximamente",
	}));
	return {
		plan: plan ? { status: plan.status } : null,
		phase: current,
		phases,
		nextPhase: PHASES.slice(index + 1).find((p) => p.built)?.id ?? null,
		ready: items.length > 0 && items.every((i) => i.state === "aprobado"),
		items,
		next: items.filter((i) => i.state === "pendiente" || i.state === "en_progreso").slice(0, 3),
		unapproved: items.filter((i) => i.state === "completo"),
		questions: openQuestions(pages),
	};
}

// Moving to another phase keeps every fundamental, tagging the old ones with the phase they belong to.
export function changePhase(projectDir: string, next: string): void {
	if (!phase(next)?.built) throw new Error(`la fase "${next}" no existe todavía en el harness`);
	const plan = pageExists(projectDir, "plan") ? readPage(projectDir, "plan") : undefined;
	const current = String(plan?.fields.fase ?? "concepto");
	const items = Array.isArray(plan?.fields.fundamentos) ? (plan.fields.fundamentos as PlanItem[]).map((i) => ({ ...i, fase: i.fase ?? current })) : [];
	writePage(projectDir, {
		id: "plan",
		type: "plan",
		title: plan?.title ?? "Plan de fundamentos",
		status: "borrador",
		visibility: plan?.visibility ?? "interna",
		fields: { ...plan?.fields, fase: next, fundamentos: items },
		relations: plan?.relations ?? [],
		notes: plan?.notes,
		questions: plan?.questions,
		body: plan?.body ?? "",
	});
}
