import { marked } from "marked";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, type ChatEvent, type ChatItem, type PageSummary } from "./api.ts";
import { pageHref } from "./App.tsx";

const TOOL_LABEL: Record<string, string> = {
	wiki_list: "Lista páginas",
	wiki_read: "Lee",
	wiki_search: "Busca",
	wiki_write: "Escribe",
	wiki_rename: "Renombra",
	wiki_delete: "Borra",
	generate_mockup: "Genera el mockup de",
	wiki_verify: "Verifica la wiki",
	request_approval: "Pide aprobación",
};

// Approving is the author's own action, made here with a click.
function ApprovalCard(props: { project: string; ids: string[]; pages: PageSummary[]; onChanged: () => void }) {
	const { project, ids, pages, onChanged } = props;
	const [errors, setErrors] = useState<Record<string, string>>({});
	const page = (id: string) => pages.find((p) => p.id === id);
	const settled = (id: string) => ["aprobada", "bloqueada"].includes(page(id)?.status ?? "");
	const pending = ids.filter((id) => page(id) && !settled(id));

	async function approve(list: string[]) {
		const next: Record<string, string> = {};
		for (const id of list) {
			try {
				await api.setStatus(project, id, "aprobada");
			} catch (e) {
				next[id] = (e as Error).message;
			}
		}
		setErrors(next);
		onChanged();
	}

	return (
		<div className="question approval">
			<div className="question-text">Aprobar</div>
			{ids.map((id) => (
				<div key={id} className="approval-row">
					<a href={pageHref(project, id)}>{page(id)?.title ?? id}</a>
					{settled(id) ? (
						<span className="badge aprobada">{page(id)?.status}</span>
					) : page(id) ? (
						<button onClick={() => approve([id])}>Aprobar</button>
					) : (
						<span className="muted">no existe</span>
					)}
					{errors[id] && <div className="approval-error">{errors[id]}</div>}
				</div>
			))}
			{pending.length > 1 && (
				<button className="primary" onClick={() => approve(pending)}>
					Aprobar todas ({pending.length})
				</button>
			)}
		</div>
	);
}

interface Question {
	question: string;
	options: { label: string; detail?: string }[];
	multiple?: boolean;
}

function parseQuestion(args: string): Question | undefined {
	try {
		const q = JSON.parse(args);
		return Array.isArray(q.options) ? q : undefined;
	} catch {
		return undefined;
	}
}

function QuestionCard(props: { q: Question; open: boolean; answer?: string; selected: string[]; onPick: (label: string) => void }) {
	const { q, open, answer, selected, onPick } = props;
	return (
		<div className={`question ${open ? "" : "answered"}`}>
			<div className="question-text">{q.question}</div>
			<div className="options">
				{q.options.map((o) => {
					const chosen = open ? selected.includes(o.label) : !!answer?.includes(o.label);
					return (
						<button key={o.label} className={`option ${chosen ? "chosen" : ""}`} disabled={!open} onClick={() => onPick(o.label)}>
							<span>{o.label}</span>
							{o.detail && <small>{o.detail}</small>}
						</button>
					);
				})}
			</div>
			{open && q.multiple && <div className="muted small">Puedes elegir varias.</div>}
		</div>
	);
}

function toolSummary(name: string | undefined, args: string) {
	let detail = "";
	try {
		const a = JSON.parse(args);
		detail = a.id ?? a.query ?? a.type ?? "";
	} catch {}
	return `${TOOL_LABEL[name ?? ""] ?? name} ${detail}`.trim();
}

// Whether a section is expanded, remembered per browser.
function useStoredFlag(key: string): [boolean, (v: boolean) => void] {
	const [value, setValue] = useState(() => {
		try {
			return localStorage.getItem(key) !== "0";
		} catch {
			return true;
		}
	});
	const set = (v: boolean) => {
		setValue(v);
		try {
			localStorage.setItem(key, v ? "1" : "0");
		} catch {}
	};
	return [value, set];
}

const PARTICIPATION_LEVELS = [
	{ id: "guardian", label: "Guardián", detail: "Solo cuida el proceso y la coherencia; no aporta contenido" },
	{ id: "colaborador", label: "Colaborador", detail: "Propone cuando se lo pides o cuando algo bloquea" },
	{ id: "coautor", label: "Coautor", detail: "Propone alternativas y desarrolla ideas" },
];

export function Chat(props: { project: string; pages: PageSummary[]; onPagesChanged: () => void; top?: ReactNode }) {
	const { project, pages, onPagesChanged, top } = props;
	const [items, setItems] = useState<ChatItem[]>([]);
	const [busy, setBusy] = useState(false);
	const [model, setModel] = useState("");
	const [level, setLevel] = useState("");
	const [draft, setDraft] = useState("");
	const [error, setError] = useState("");
	const [picks, setPicks] = useState<Record<number, string[]>>({});
	const [planOpen, setPlanOpen] = useStoredFlag("plan-open");
	const [chatOpen, setChatOpen] = useStoredFlag("chat-open");
	const bottom = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setItems([]);
		setError("");
		api.participation(project).then((r) => setLevel(r.level));
		api.chat(project)
			.then((r) => {
				setItems(r.items);
				setBusy(r.busy);
				setModel(r.model);
			})
			.catch((e) => setError(e.message));

		const source = api.events(project);
		let streaming = false;
		source.onmessage = (msg) => {
			const e = JSON.parse(msg.data) as ChatEvent;
			if (e.kind === "user") {
				setItems((xs) => [...xs, { role: "user", text: e.text }]);
				setBusy(true);
			} else if (e.kind === "text") {
				setItems((xs) => {
					const last = xs[xs.length - 1];
					if (streaming && last?.role === "assistant") return [...xs.slice(0, -1), { ...last, text: last.text + e.delta }];
					streaming = true;
					return [...xs, { role: "assistant", text: e.delta }];
				});
			} else if (e.kind === "message_end") {
				streaming = false;
			} else if (e.kind === "tool_start") {
				streaming = false;
				setItems((xs) => [...xs, { role: "tool", name: e.name, text: JSON.stringify(e.args ?? {}) }]);
			} else if (e.kind === "tool_end" && e.isError) {
				setItems((xs) => [...xs, { role: "tool", name: e.name, text: e.result, isError: true }]);
			} else if (e.kind === "pages_changed") {
				onPagesChanged();
			} else if (e.kind === "settled") {
				streaming = false;
				setBusy(false);
				onPagesChanged();
			} else if (e.kind === "error") {
				setError(e.message);
			}
		};
		return () => source.close();
	}, [project, onPagesChanged]);

	useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [items]);

	async function sendText(text: string) {
		setError("");
		setPicks({});
		try {
			await api.send(project, text);
		} catch (e) {
			setError((e as Error).message);
		}
	}

	function send() {
		const text = draft.trim();
		if (!text) return;
		setDraft("");
		sendText(text);
	}

	// Questions asked since the author's last message are still open.
	const lastUser = items.map((m) => m.role).lastIndexOf("user");
	const open = items.flatMap((m, i) => (i > lastUser && m.role === "tool" && m.name === "ask_author" && parseQuestion(m.text) ? [i] : []));
	const answerAfter = (i: number) => items.slice(i + 1).find((m) => m.role === "user")?.text;

	// A single one-choice question answers on click; otherwise choices are collected and sent together.
	function pick(i: number, label: string) {
		const q = parseQuestion(items[i].text)!;
		if (open.length === 1 && !q.multiple) return sendText(label);
		setPicks((p) => {
			const current = p[i] ?? [];
			const next = q.multiple ? (current.includes(label) ? current.filter((l) => l !== label) : [...current, label]) : [label];
			return { ...p, [i]: next };
		});
	}

	function sendPicks() {
		const answered = open.filter((i) => picks[i]?.length);
		const text = answered.map((i) => (open.length === 1 ? picks[i].join(", ") : `${parseQuestion(items[i].text)!.question} → ${picks[i].join(", ")}`)).join("\n");
		if (text) sendText(text);
	}

	return (
		<section className={`chat ${chatOpen ? "" : "chat-collapsed"}`}>
			<div className={`pane plan-pane ${planOpen ? "open" : ""}`}>
				<button className="pane-head" onClick={() => setPlanOpen(!planOpen)} aria-expanded={planOpen}>
					<span className="chevron">{planOpen ? "▾" : "▸"}</span>
					<span>Siguiente paso</span>
				</button>
				{planOpen && <div className="pane-body">{top}</div>}
			</div>
			<div className="chat-head">
				<button className="pane-head" onClick={() => setChatOpen(!chatOpen)} aria-expanded={chatOpen}>
					<span className="chevron">{chatOpen ? "▾" : "▸"}</span>
					<span>Agente</span>
					<span className="muted model">{model}</span>
				</button>
				<select
					className="participation"
					value={level}
					title={PARTICIPATION_LEVELS.find((l) => l.id === level)?.detail}
					onChange={(e) => api.setParticipation(project, e.target.value).then((r) => setLevel(r.level), (err) => setError(err.message))}
				>
					{PARTICIPATION_LEVELS.map((l) => (
						<option key={l.id} value={l.id} title={l.detail}>
							{l.label}
						</option>
					))}
				</select>
			</div>
			{chatOpen && (
				<>
					<div className="messages">
						{items.length === 0 && (
							<div className="onboarding muted">
								<p>Cuéntale al agente la idea de tu juego.</p>
								<p>
									El diseño avanza por <strong>fases</strong> (arriba, en "Siguiente paso"): concepto, wiki, mecánicas… Cada fase tiene sus
									fundamentales; cuando los apruebas, el harness te propone pasar a la siguiente. Puedes explorar libremente: el agente solo
									te sugiere de vez en cuando volver a lo prioritario.
								</p>
							</div>
						)}
						{items.map((m, i) =>
							m.role === "tool" && m.name === "request_approval" && !m.isError && Array.isArray(JSON.parse(m.text).ids) ? (
						<ApprovalCard key={i} project={project} ids={JSON.parse(m.text).ids} pages={pages} onChanged={onPagesChanged} />
					) : m.role === "tool" && m.name === "ask_author" && !m.isError && parseQuestion(m.text) ? (
								<QuestionCard
									key={i}
									q={parseQuestion(m.text)!}
									open={open.includes(i)}
									answer={answerAfter(i)}
									selected={picks[i] ?? []}
									onPick={(label) => pick(i, label)}
								/>
							) : m.role === "tool" ? (
								<div key={i} className={`tool ${m.isError ? "error" : ""}`} title={m.text}>
									{m.isError ? `Error en ${TOOL_LABEL[m.name ?? ""] ?? m.name}: ${m.text}` : toolSummary(m.name, m.text)}
								</div>
							) : m.role === "user" ? (
								<div key={i} className="msg user">
									{m.text}
								</div>
							) : (
								<div
									key={i}
									className={`msg assistant ${m.isError ? "error" : ""}`}
									dangerouslySetInnerHTML={{ __html: marked.parse(m.text, { async: false }) }}
								/>
							),
						)}
						{Object.values(picks).some((p) => p.length) && (
							<button className="primary send-picks" onClick={sendPicks}>
								Enviar respuestas
							</button>
						)}
						{busy && <div className="working">El agente está trabajando…</div>}
						{error && <div className="banner error">{error}</div>}
						<div ref={bottom} />
					</div>
					<div className="composer">
						<textarea
							value={draft}
							placeholder={busy ? "Se enviará cuando el agente termine" : "Escribe al agente (Enter envía, Shift+Enter salto de línea)"}
							onChange={(e) => setDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									send();
								}
							}}
						/>
						<div className="composer-actions">
							{busy && <button onClick={() => api.abort(project)}>Detener</button>}
							<button className="primary" onClick={send} disabled={!draft.trim()}>
								Enviar
							</button>
						</div>
					</div>
				</>
			)}
		</section>
	);
}
