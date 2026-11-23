import { projectProgress, type ItemProgress, type Progress } from "../wiki/progress.ts";
import { phase } from "../wiki/schema.ts";
import { pageExists, readPage } from "../wiki/store.ts";
import { participation, type Participation } from "../projects.ts";

const PARTICIPATION_RULES: Record<Participation, string> = {
	guardian:
		"guardian. The author writes the game; you contribute no content. Put what the author says into the wiki faithfully (card, prose, links, variables, rules in the formal language), keep the plan and phases, verify, and point out contradictions, gaps and broken rules. " +
		"Do not invent names, traits, events, places, mechanics or values, and offer no alternatives. A gap becomes an open question in the page's questions list, without suggested answers. In chat, ask only what blocks the next fundamental, as an open question; use ask_author only for yes/no or to choose among options the author gave. Saying which fundamentals a phase needs is process, so you still do that.",
	colaborador:
		"colaborador. Turn what the author decides into the wiki and keep the process and coherence. Propose only when the author asks or when a gap blocks progress, and then one proposal at a time. Don't fill in details on your own: leave them as open questions on the page.",
	coautor:
		"coautor. Propose concrete content, and when a choice really shapes the game give two or three alternatives with their trade-offs. Ask before inventing large things; small supporting details are fine, marked in the page notes as your proposals.",
};

// Keeps the author oriented without limiting them. Before each author message the harness tells
// the agent the project's phase and priorities, and only now and then asks it to offer a change of
// topic: after FOCUS_TURNS runs on the same page, right after a fundamental is completed, or once
// when the phase becomes ready to leave; never sooner than COOLDOWN_TURNS after the previous offer.
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
	private readyOffered = "";
	private before: Progress | undefined;

	constructor(private dir: string) {}

	statusFor(): string {
		this.turn++;
		const progress = projectProgress(this.dir);
		this.before = progress;

		const lines: string[] = [`Participation: ${PARTICIPATION_RULES[participation(this.dir)]}`];
		const label = (id: string | null) => (id ? (phase(id)?.label ?? id) : "");
		lines.push(`Phase: ${label(progress.phase)} (${progress.phase}).${progress.plan ? ` Plan status: ${progress.plan.status}.` : " No plan page yet."}`);
		if (progress.next.length) {
			lines.push("Pending fundamentals of this phase, in priority order:");
			progress.next.forEach((item, i) => lines.push(`${i + 1}. ${describe(item)}`));
		} else if (progress.unapproved.length) {
			lines.push(`Every fundamental of this phase is complete; waiting for the author's approval of: ${progress.unapproved.flatMap((i) => i.pages.map((p) => p.id)).join(", ")}.`);
		} else if (progress.ready) {
			lines.push(`This phase is ready: every fundamental is approved.${progress.nextPhase ? ` Next phase: ${label(progress.nextPhase)} (${progress.nextPhase}).` : ""}`);
		} else if (progress.phase !== "concepto") {
			lines.push("This phase has no fundamentals yet: propose them and write them in the plan with this phase.");
		}
		const here = progress.questions.filter((q) => q.current).length;
		if (progress.questions.length) lines.push(`Open questions: ${here} in this phase, ${progress.questions.length - here} on pages of other phases.`);
		if (this.focus.runs >= 2) lines.push(`Recent focus: ${this.focus.page} for ${this.focus.runs} runs in a row.`);

		// What to offer: the top pending fundamental, then approving the finished ones, then the next phase.
		let target = progress.next[0]?.titulo;
		let how = "ask_author";
		if (!target && progress.unapproved.length) {
			target = "aprobar los fundamentales de esta fase";
			how = "request_approval with the pages waiting for approval";
		} else if (!target && progress.ready && progress.nextPhase) {
			target = `pasar a la fase ${label(progress.nextPhase)}`;
		}
		const phaseReady = progress.ready && !!progress.nextPhase && this.readyOffered !== progress.phase;
		const focusIsTarget = progress.next[0]?.pages.some((p) => p.id === this.focus.page);
		const due = this.turn - this.lastOffer >= COOLDOWN_TURNS && (this.focus.runs >= FOCUS_TURNS || this.completed || phaseReady);
		if (target && due && !focusIsTarget) {
			this.lastOffer = this.turn;
			if (phaseReady) this.readyOffered = progress.phase;
			const focusTitle = pageExists(this.dir, this.focus.page) ? readPage(this.dir, this.focus.page).title : this.focus.page;
			const current = this.completed ? `lo que acaba de completarse (${this.completed})` : focusTitle || "lo que está haciendo";
			lines.push(
				`OFFER: first answer the author fully. Then, as the last thing in your reply, offer a choice with ${how}: keep going with ${current}, or "${target}". Do not change topic or phase on your own.`,
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
