import { marked } from "marked";
import { useEffect, useRef, useState } from "react";
import { api, type ChatEvent, type ChatItem } from "./api.ts";

const TOOL_LABEL: Record<string, string> = {
	wiki_list: "Lista páginas",
	wiki_read: "Lee",
	wiki_search: "Busca",
	wiki_write: "Escribe",
	wiki_rename: "Renombra",
	wiki_verify: "Verifica la wiki",
};

function toolSummary(name: string | undefined, args: string) {
	let detail = "";
	try {
		const a = JSON.parse(args);
		detail = a.id ?? a.query ?? a.type ?? "";
	} catch {}
	return `${TOOL_LABEL[name ?? ""] ?? name} ${detail}`.trim();
}

export function Chat({ project, onPagesChanged }: { project: string; onPagesChanged: () => void }) {
	const [items, setItems] = useState<ChatItem[]>([]);
	const [busy, setBusy] = useState(false);
	const [model, setModel] = useState("");
	const [draft, setDraft] = useState("");
	const [error, setError] = useState("");
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

	async function send() {
		const text = draft.trim();
		if (!text) return;
		setDraft("");
		setError("");
		try {
			await api.send(project, text);
		} catch (e) {
			setError((e as Error).message);
		}
	}

	return (
		<section className="chat">
			<div className="chat-head">
				<span>Agente</span>
				<span className="muted">{model}</span>
			</div>
			<div className="messages">
				{items.length === 0 && <p className="muted">Cuéntale al agente la idea de tu juego.</p>}
				{items.map((m, i) =>
					m.role === "tool" ? (
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
