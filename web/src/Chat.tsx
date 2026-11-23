import { marked } from "marked";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, type ChatEvent, type ChatItem } from "./api.ts";

const TOOL_LABEL: Record<string, string> = {
	wiki_list: "Lista páginas",
	wiki_read: "Lee",
	wiki_search: "Busca",
	wiki_write: "Escribe",
	wiki_rename: "Renombra",
	wiki_verify: "Verifica la wiki",
};

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

export function Chat({ project, onPagesChanged, top }: { project: string; onPagesChanged: () => void; top?: ReactNode }) {
	const [items, setItems] = useState<ChatItem[]>([]);
	const [busy, setBusy] = useState(false);
	const [model, setModel] = useState("");
	const [draft, setDraft] = useState("");
	const [error, setError] = useState("");
	const [picks, setPicks] = useState<Record<number, string[]>>({});
	const bottom = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setItems([]);
		setError("");
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
		<section className="chat">
			<div className="chat-head">
				<span>Agente</span>
				<span className="muted">{model}</span>
			</div>
			{top}
			<div className="messages">
				{items.length === 0 && <p className="muted">Cuéntale al agente la idea de tu juego.</p>}
				{items.map((m, i) =>
					m.role === "tool" && m.name === "ask_author" && !m.isError && parseQuestion(m.text) ? (
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
		</section>
	);
}
