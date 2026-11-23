import { marked } from "marked";
import { useEffect, useState } from "react";
import { api, type PageDetail, type PageSummary, type Schema } from "./api.ts";
import { pageHref } from "./App.tsx";
import { PageEditor } from "./PageEditor.tsx";

const VISIBILITY_LABEL: Record<string, string> = { interna: "Interna", spoiler: "Con spoilers", publica: "Pública" };

function escapeHtml(s: string) {
	return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// [[id]] and [[id|label]] become wiki links; links to missing pages are marked.
function renderProse(body: string, project: string, pages: PageSummary[]) {
	const withLinks = body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, id: string, label?: string) => {
		const target = pages.find((p) => p.id === id.trim());
		const text = escapeHtml(label ?? target?.title ?? id);
		return target ? `<a class="wikilink" href="${pageHref(project, target.id)}">${text}</a>` : `<span class="wikilink broken" title="No existe">${text}</span>`;
	});
	return marked.parse(withLinks, { async: false });
}

function FieldValue({ value }: { value: unknown }) {
	if (Array.isArray(value))
		return (
			<ul>
				{value.map((v, i) => (
					<li key={i}>{String(v)}</li>
				))}
			</ul>
		);
	if (typeof value === "boolean") return <>{value ? "Sí" : "No"}</>;
	if (value && typeof value === "object") return <code>{JSON.stringify(value)}</code>;
	return <>{String(value)}</>;
}

export function PageView(props: {
	project: string;
	pageId: string;
	schema?: Schema;
	pages: PageSummary[];
	revision: number;
	onChanged: () => void;
	editing: boolean;
	setEditing: (editing: boolean) => void;
}) {
	const { project, pageId, schema, pages, revision, onChanged, editing, setEditing } = props;
	const [detail, setDetail] = useState<PageDetail>();
	const [error, setError] = useState("");

	useEffect(() => {
		setError("");
		api.page(project, pageId).then(setDetail).catch((e) => {
			setDetail(undefined);
			setError(e.message);
		});
	}, [project, pageId, revision]);

	if (error) return <p className="muted">{error}</p>;
	if (!detail) return null;

	const { page, backlinks, issues, history } = detail;
	if (editing)
		return (
			<PageEditor
				key={page.id}
				project={project}
				page={page}
				schema={schema}
				pages={pages}
				onDone={(saved) => {
					setEditing(false);
					if (saved) onChanged();
				}}
			/>
		);
	const def = schema?.pageTypes.find((t) => t.type === page.type);
	const extraKeys = Object.keys(page.fields).filter((k) => !def?.fields.some((f) => f.key === k));
	const title = (id: string) => pages.find((p) => p.id === id)?.title ?? id;

	async function setStatus(status: string) {
		try {
			await api.setStatus(project, page.id, status);
			onChanged();
		} catch (e) {
			setError((e as Error).message);
		}
	}

	return (
		<article className="page">
			<div className="page-meta">
				<span className="type">{def?.label ?? page.type}</span>
				<span className={`badge ${page.status}`}>{page.status}</span>
				<span className="badge">{VISIBILITY_LABEL[page.visibility] ?? page.visibility}</span>
				<span className="actions">
					<button onClick={() => setEditing(true)}>Editar</button>
					{page.status !== "aprobada" && page.status !== "bloqueada" && <button onClick={() => setStatus("aprobada")}>Aprobar</button>}
					{page.status !== "bloqueada" ? (
						<button onClick={() => setStatus("bloqueada")}>Bloquear</button>
					) : (
						<button onClick={() => setStatus("aprobada")}>Desbloquear</button>
					)}
					{page.status !== "borrador" && <button onClick={() => setStatus("borrador")}>Volver a borrador</button>}
				</span>
			</div>
			<h1>{page.title}</h1>

			{issues.length > 0 && (
				<ul className="issues">
					{issues.map((i, n) => (
						<li key={n} className={i.level}>
							{i.message}
						</li>
					))}
				</ul>
			)}

			<table className="card">
				<tbody>
					{def?.fields.map((f) => (
						<tr key={f.key} className={page.fields[f.key] === undefined ? "unset" : ""}>
							<th title={f.hint}>
								{f.label}
								{f.required && <span className="req">*</span>}
							</th>
							<td>{page.fields[f.key] === undefined ? "—" : <FieldValue value={page.fields[f.key]} />}</td>
						</tr>
					))}
					{extraKeys.map((k) => (
						<tr key={k} className="extra">
							<th>{k}</th>
							<td>
								<FieldValue value={page.fields[k]} />
							</td>
						</tr>
					))}
				</tbody>
			</table>

			{page.relations.length > 0 && (
				<section>
					<h2>Relaciones</h2>
					<ul className="relations">
						{page.relations.map((r, i) => (
							<li key={i}>
								<span className="rel">{schema?.relationTypes[r.type] ?? r.type}</span>{" "}
								<a href={pageHref(project, r.target)}>{title(r.target)}</a>
								{r.note && <span className="muted"> — {r.note}</span>}
							</li>
						))}
					</ul>
				</section>
			)}

			{page.body && <section className="prose" dangerouslySetInnerHTML={{ __html: renderProse(page.body, project, pages) }} />}

			{page.notes && (
				<aside className="notes">
					<h2>Notas del autor</h2>
					<p>{page.notes}</p>
				</aside>
			)}

			{backlinks.length > 0 && (
				<section>
					<h2>Enlazada desde</h2>
					<ul className="relations">
						{backlinks.map((b) => (
							<li key={b.id}>
								<a href={pageHref(project, b.id)}>{b.title}</a>
							</li>
						))}
					</ul>
				</section>
			)}

			<details className="history">
				<summary>Historial ({history.length})</summary>
				<ul>
					{history.map((h) => (
						<li key={h.hash}>
							<time>{new Date(h.date).toLocaleString()}</time> {h.message}
						</li>
					))}
				</ul>
			</details>
		</article>
	);
}
