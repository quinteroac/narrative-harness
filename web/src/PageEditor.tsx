import { useState } from "react";
import { api, type FieldDef, type Page, type PageSummary, type Relation, type Schema } from "./api.ts";

// Field values are edited as text and converted back to the card's types on save.
function toText(field: FieldDef, value: unknown): string {
	if (value === undefined || value === null) return "";
	if (field.kind === "list" && Array.isArray(value)) return value.join("\n");
	if (field.kind === "boolean") return value ? "si" : "no";
	return String(value);
}

function fromText(field: FieldDef, text: string): unknown {
	const t = text.trim();
	if (!t) return undefined;
	if (field.kind === "list") return t.split("\n").map((s) => s.trim()).filter(Boolean);
	if (field.kind === "boolean") return t === "si";
	if (field.kind === "number") return Number.isNaN(Number(t)) ? t : Number(t);
	return t;
}

export function PageEditor(props: {
	project: string;
	page: Page;
	schema?: Schema;
	pages: PageSummary[];
	onDone: (saved: boolean) => void;
}) {
	const { project, page, schema, pages, onDone } = props;
	const def = schema?.pageTypes.find((t) => t.type === page.type);
	const [title, setTitle] = useState(page.title);
	const [visibility, setVisibility] = useState(page.visibility);
	const [values, setValues] = useState(() => Object.fromEntries((def?.fields ?? []).map((f) => [f.key, toText(f, page.fields[f.key])])));
	const [relations, setRelations] = useState<Relation[]>(page.relations);
	const [body, setBody] = useState(page.body);
	const [notes, setNotes] = useState(page.notes ?? "");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

	const setRelation = (i: number, patch: Partial<Relation>) => setRelations((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));

	async function save() {
		// Fields not in the schema are kept as they were.
		const fields: Record<string, unknown> = Object.fromEntries(Object.entries(page.fields).filter(([k]) => !def?.fields.some((f) => f.key === k)));
		for (const f of def?.fields ?? []) {
			const v = fromText(f, values[f.key] ?? "");
			if (v !== undefined) fields[f.key] = v;
		}
		setSaving(true);
		try {
			await api.savePage(project, { ...page, title, visibility, fields, relations, body, notes });
			onDone(true);
		} catch (e) {
			setError((e as Error).message);
			setSaving(false);
		}
	}

	return (
		<article className="page editor">
			<div className="page-meta">
				<span className="type">Editando {def?.label ?? page.type}</span>
				<span className="actions">
					<button onClick={() => onDone(false)}>Cancelar</button>
					<button className="primary" onClick={save} disabled={saving}>
						Guardar
					</button>
				</span>
			</div>
			{error && <div className="banner error">{error}</div>}

			<label className="field">
				<span>Título</span>
				<input value={title} onChange={(e) => setTitle(e.target.value)} />
			</label>
			<label className="field">
				<span>Visibilidad</span>
				<select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
					<option value="interna">Interna</option>
					<option value="spoiler">Con spoilers</option>
					<option value="publica">Pública</option>
				</select>
			</label>

			<h2>Ficha</h2>
			{def?.fields.map((f) => (
				<label key={f.key} className="field">
					<span>
						{f.label}
						{f.required && <span className="req">*</span>}
						{f.kind === "list" && <small className="muted"> (uno por línea)</small>}
					</span>
					{f.kind === "boolean" ? (
						<select value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
							<option value="">—</option>
							<option value="si">Sí</option>
							<option value="no">No</option>
						</select>
					) : f.kind === "number" ? (
						<input type="number" value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
					) : (
						<textarea
							rows={f.kind === "list" ? 3 : 2}
							placeholder={f.hint}
							value={values[f.key]}
							onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
						/>
					)}
				</label>
			))}

			<h2>Relaciones</h2>
			{relations.map((r, i) => (
				<div key={i} className="relation-row">
					<select value={r.type} onChange={(e) => setRelation(i, { type: e.target.value })}>
						<option value="">Tipo…</option>
						{Object.entries(schema?.relationTypes ?? {}).map(([k, label]) => (
							<option key={k} value={k}>
								{label}
							</option>
						))}
						{r.type && !schema?.relationTypes[r.type] && <option value={r.type}>{r.type}</option>}
					</select>
					<select value={r.target} onChange={(e) => setRelation(i, { target: e.target.value })}>
						<option value="">Página…</option>
						{pages
							.filter((p) => p.id !== page.id)
							.map((p) => (
								<option key={p.id} value={p.id}>
									{p.title}
								</option>
							))}
					</select>
					<input placeholder="Nota (opcional)" value={r.note ?? ""} onChange={(e) => setRelation(i, { note: e.target.value || undefined })} />
					<button onClick={() => setRelations((rs) => rs.filter((_, n) => n !== i))} title="Quitar">
						×
					</button>
				</div>
			))}
			<button onClick={() => setRelations((rs) => [...rs, { type: "", target: "" }])}>Añadir relación</button>

			<h2>Texto</h2>
			<p className="muted small">Markdown. Enlaza páginas con [[id]] o [[id|texto]].</p>
			<textarea className="prose-input" value={body} onChange={(e) => setBody(e.target.value)} />

			<h2>Notas del autor</h2>
			<textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
		</article>
	);
}
