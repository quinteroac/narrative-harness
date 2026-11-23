import { projectProgress, type ItemProgress, type Progress } from "../wiki/progress.ts";
import { pageExists, readPage } from "../wiki/store.ts";

// Keeps the author oriented without limiting them. Before each author message the harness tells
// the agent the project's priorities, and only now and then asks it to offer a change of topic:
// after FOCUS_TURNS runs on the same page or right after a fundamental is completed, and never
// sooner than COOLDOWN_TURNS after the previous offer.
const FOCUS_TURNS = 3;
const COOLDOWN_TURNS = 5;

export const STATUS_TAG = "harness-status";
const STATUS_BLOCK = new RegExp(`<${STATUS_TAG}>[\\s\\S]*?</${STATUS_TAG}>\\s*`, "g");

export const stripStatus = (text: string) => text.replace(STATUS_BLOCK, "");

function describe(item: ItemProgress): string {
	const done = item.pages.filter((p) => p.state === "completa" || p.state === "aprobada").length;
	const gaps = item.pages
		.filter((p) => p.state === "falta" || p.state === "incompleta")
		.map((p) => (p.state === "falta" ? `${p.id} no existe` : `${p.id} sin ${p.missing.join(", ")}`));
	if (item.pages.length < item.cantidad) gaps.push(`faltan ${item.cantidad - item.pages.length} páginas por definir`);
	return `${item.titulo} — ${done}/${item.cantidad}${gaps.length ? ` (${gaps.join("; ")})` : ""}`;
}

export class Guide {
	private turn = 0;
	private lastOffer = -Infinity;
	private focus = { page: "", runs: 0 };
	private completed = "";
	private before: Progress | undefined;

	constructor(private dir: string) {}

	// The topic to offer when there is no plan yet.
	private bootstrap(): string {
		const portada = pageExists(this.dir, "portada") ? readPage(this.dir, "portada") : undefined;
		const basics = ["premisa", "genero", "tono", "pilares"].every((k) => portada?.fields[k]);
		return basics ? "proponer el plan de fundamentos (página plan)" : "completar lo básico de la portada: premisa, género, tono y pilares";
	}

	statusFor(): string {
		this.turn++;
		const progress = projectProgress(this.dir);
		this.before = progress;

		const lines: string[] = [];
		if (!progress.plan) {
			lines.push(`No fundamentals plan yet. Next priority: ${this.bootstrap()}.`);
		} else {
			lines.push(`Fundamentals plan (${progress.plan.status}), phase: ${progress.plan.fase || "?"}.`);
			lines.push(progress.next.length ? "Pending, in priority order:" : "Every fundamental is complete.");
			progress.next.forEach((item, i) => lines.push(`${i + 1}. ${describe(item)}`));
		}
		if (progress.questions.length) lines.push(`Open questions in page notes: ${progress.questions.length}.`);
		if (this.focus.runs >= 2) lines.push(`Recent focus: ${this.focus.page} for ${this.focus.runs} runs in a row.`);

		const target = progress.plan ? progress.next[0]?.titulo : this.bootstrap();
		const focusIsTarget = progress.next[0]?.pages.some((p) => p.id === this.focus.page);
		const due = this.turn - this.lastOffer >= COOLDOWN_TURNS && (this.focus.runs >= FOCUS_TURNS || this.completed);
		if (target && due && !focusIsTarget) {
			this.lastOffer = this.turn;
			const focusTitle = pageExists(this.dir, this.focus.page) ? readPage(this.dir, this.focus.page).title : this.focus.page;
			const current = this.completed ? `lo que acaba de completarse (${this.completed})` : focusTitle;
			lines.push(
				`OFFER: first answer the author fully. Then end your reply with one short line offering a choice: keep going with ${current}, or move to "${target}". Do not change topic on your own.`,
			);
			this.completed = "";
		} else {
			lines.push("Do not suggest changing topic in this reply; follow the author.");
		}
		return `<${STATUS_TAG}>\n${lines.join("\n")}\n</${STATUS_TAG}>`;
	}

	// Called after a run with the pages it wrote.
	afterRun(written: string[]) {
		const pages = written.filter((id) => id !== "plan");
		if (pages.length) {
			if (pages.includes(this.focus.page)) this.focus.runs++;
			else this.focus = { page: pages[0], runs: 1 };
		}
		const after = projectProgress(this.dir);
		const wasDone = new Set(this.before?.items.filter((i) => i.state === "completo" || i.state === "aprobado").map((i) => i.titulo));
		const newlyDone = after.items.find((i) => (i.state === "completo" || i.state === "aprobado") && !wasDone.has(i.titulo));
		if (newlyDone) this.completed = newlyDone.titulo;
	}
}
