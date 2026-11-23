import { loadAll, type Page } from "./store.ts";
import { pageType } from "./schema.ts";
import { isEmpty } from "./verify.ts";

// How far each fundamental of the plan is. The order of the plan is the priority order.

export type PageState = "falta" | "incompleta" | "completa" | "aprobada";
export type ItemState = "pendiente" | "en_progreso" | "completo" | "aprobado";

export interface ItemProgress {
	titulo: string;
	nota?: string;
	cantidad: number;
	pages: { id: string; title: string; state: PageState; missing: string[] }[];
	state: ItemState;
}

export interface Progress {
	plan: { status: string; fase: string } | null;
	items: ItemProgress[];
	next: ItemProgress[];
	questions: { page: string; title: string; text: string }[];
}

interface PlanItem {
	titulo: string;
	paginas?: string[];
	cantidad?: number;
	nota?: string;
}

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
	const items = Array.isArray(plan?.fields.fundamentos) ? (plan.fields.fundamentos as PlanItem[]).filter((i) => i?.titulo).map((i) => itemProgress(i, byId)) : [];
	return {
		plan: plan ? { status: plan.status, fase: String(plan.fields.fase ?? "") } : null,
		items,
		next: items.filter((i) => i.state === "pendiente" || i.state === "en_progreso").slice(0, 3),
		questions: openQuestions(pages),
	};
}
