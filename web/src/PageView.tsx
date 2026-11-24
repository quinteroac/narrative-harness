import { marked } from "marked";
import { useEffect, useState } from "react";
import { api, type MediaItem, type PageDetail, type PageSummary, type Schema } from "./api.ts";
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

function FieldValue({ value, project }: { value: unknown; project: string }) {
	if (Array.isArray(value) && value.some((v) => v && typeof v === "object"))
		return (
			<ol className="fundamentos">
				{value.map((item, i) => (
					<li key={i}>
						<strong>{item.titulo}</strong>
						{item.cantidad ? <span className="muted"> ×{item.cantidad}</span> : null}
						{item.paginas?.length ? (
							<span>
								{" — "}
								{item.paginas.map((id: string, n: number) => (
									<span key={id}>
										{n > 0 && ", "}
										<a href={pageHref(project, id)}>{id}</a>
									</span>
								))}
							</span>
						) : null}
						{item.nota && <div className="muted small">{item.nota}</div>}
					</li>
				))}
			</ol>
		);
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

// The newest mockup large, older ones as thumbnails; a mockup made from an older card is marked.
function Mockups({ project, page, media, onChanged }: { project: string; page: PageDetail["page"]; media: MediaItem[]; onChanged: () => void }) {
	const [selected, setSelected] = useState(0);
	useEffect(() => setSelected(0), [page.id, media.length]);
	const generate = () => api.send(project, `Genera el mockup de ${page.title} (${page.id}).`);
	if (!media.length)
		return page.type === "pantalla" ? (
			<section className="mockups empty">
				<span className="muted">Sin mockup todavía.</span> <button onClick={generate}>Generar mockup</button>
			</section>
		) : null;
	const shown = media[Math.min(selected, media.length - 1)];
	const url = (m: MediaItem) => api.mediaUrl(project, page.id, m.file);
	async function discard() {
		if (!confirm("¿Descartar este mockup? Se borra del proyecto (queda en el historial de git).")) return;
		try {
			await api.deleteMedia(project, page.id, shown.file);
			onChanged();
		} catch (e) {
			alert((e as Error).message);
		}
	}
	return (
		<section className="mockups">
			<a href={url(shown)} target="_blank" rel="noreferrer">
				<img src={url(shown)} alt={`Mockup de ${page.title}`} />
			</a>
			<div className="mockup-bar">
				<span className="muted small">
					{new Date(shown.created).toLocaleString()} · {shown.size}
					{shown.stale && <span className="badge stale" title="La ficha cambió después de generar este mockup">desactualizado</span>}
				</span>
				<span className="mockup-actions">
					<button onClick={discard}>Descartar</button>
					{page.type === "pantalla" && <button onClick={generate}>{shown.stale ? "Regenerar" : "Generar otro"}</button>}
				</span>
			</div>
			{media.length > 1 && (
				<div className="mockup-thumbs">
					{media.map((m, i) => (
						<button key={m.file} className={i === selected ? "selected" : ""} onClick={() => setSelected(i)} title={new Date(m.created).toLocaleString()}>
							<img src={url(m)} alt="" loading="lazy" />
						</button>
					))}
				</div>
			)}
		</section>
	);
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

	const { page, backlinks, issues, history, media } = detail;
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

	const questions = page.questions ?? [];
	const open = questions.filter((q) => !q.answer);
	const resolved = questions.filter((q) => q.answer);

	async function rename() {
		const [type, slug] = page.id.split("/");
		const next = prompt(`Nuevo id (${type}/…). Se actualizan todos los enlaces.`, slug);
		if (!next?.trim() || next.trim() === slug) return;
		try {
			const { id } = await api.renamePage(project, page.id, `${type}/${next.trim()}`);
			onChanged();
			location.hash = pageHref(project, id);
		} catch (e) {
			setError((e as Error).message);
		}
	}

	async function remove() {
		if (!confirm(`¿Borrar "${page.title}"? Queda en el historial del proyecto.`)) return;
		try {
			await api.deletePage(project, page.id);
			onChanged();
			location.hash = `#/${project}`;
		} catch (e) {
			setError((e as Error).message);
		}
	}

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
					{page.id !== "portada" && <button onClick={rename}>Renombrar</button>}
					{page.status !== "aprobada" && page.status !== "bloqueada" && <button onClick={() => setStatus("aprobada")}>Aprobar</button>}
					{page.status !== "bloqueada" ? (
						<button onClick={() => setStatus("bloqueada")}>Bloquear</button>
					) : (
						<button onClick={() => setStatus("aprobada")}>Desbloquear</button>
					)}
					{page.status !== "borrador" && <button onClick={() => setStatus("borrador")}>Volver a borrador</button>}
					{page.id.includes("/") && <button onClick={remove}>Borrar</button>}
				</span>
			</div>
			<h1>{page.title}</h1>
			<p className="page-id muted">{page.id}</p>

			{issues.length > 0 && (
				<ul className="issues">
					{issues.map((i, n) => (
						<li key={n} className={i.level}>
							{i.message}
						</li>
					))}
				</ul>
			)}

			<Mockups project={project} page={page} media={media} onChanged={onChanged} />

			<div className="page-columns">
				<div className="page-col">
					<table className="card">
						<tbody>
							{def?.fields.map((f) => (
								<tr key={f.key} className={page.fields[f.key] === undefined ? "unset" : ""}>
									<th title={f.hint}>
										{f.label}
										{f.required && <span className="req">*</span>}
										{f.spoiler && <span className="spoiler-tag" title="Revela la historia aunque la página sea pública">spoiler</span>}
									</th>
									<td>
										{page.fields[f.key] === undefined ? (
											"—"
										) : f.kind === "triggers" && Array.isArray(page.fields[f.key]) ? (
											<ul className="exprs triggers">
												{(page.fields[f.key] as { cuando?: string; al?: string; entonces?: string[]; nota?: string }[]).map((t, n) => (
													<li key={n}>
														{t.cuando && (
															<div>
																<span className="muted">cuando</span> <code>{t.cuando}</code>
															</div>
														)}
														{t.al && (
															<div>
																<span className="muted">al</span> {t.al}
															</div>
														)}
														<div>
															<span className="muted">entonces</span> <code>{(t.entonces ?? []).join("; ")}</code>
														</div>
														{t.nota && <div className="muted small">{t.nota}</div>}
													</li>
												))}
											</ul>
										) : f.kind === "conditions" && Array.isArray(page.fields[f.key]) ? (
											<ul className="exprs">
												{(page.fields[f.key] as string[]).map((e, n) => (
													<li key={n}>
														<code>{e}</code>
													</li>
												))}
											</ul>
										) : (
											<FieldValue value={page.fields[f.key]} project={project} />
										)}
									</td>
								</tr>
							))}
							{extraKeys.map((k) => (
								<tr key={k} className="extra">
									<th>{k}</th>
									<td>
										<FieldValue value={page.fields[k]} project={project} />
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
				</div>
				<div className="page-col">
					{page.body && <section className="prose" dangerouslySetInnerHTML={{ __html: renderProse(page.body, project, pages) }} />}

					{open.length > 0 && (
						<section className="page-questions">
							<h2>Preguntas abiertas</h2>
							<ul>
								{open.map((q) => (
									<li key={q.text}>
										{q.text}{" "}
										<button className="link" onClick={() => api.send(project, `Resolvamos esta pregunta de ${page.title}: ${q.text}`)}>
											hablarlo
										</button>
									</li>
								))}
							</ul>
						</section>
					)}

					{page.notes && (
						<aside className="notes">
							<h2>Notas del autor</h2>
							<p>{page.notes}</p>
						</aside>
					)}
				</div>
			</div>

			{resolved.length > 0 && (
				<details className="history">
					<summary>Preguntas resueltas ({resolved.length})</summary>
					<ul>
						{resolved.map((q) => (
							<li key={q.text}>
								{q.text} → {q.answer}
							</li>
						))}
					</ul>
				</details>
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
