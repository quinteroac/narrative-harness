import { useCallback, useEffect, useState } from "react";
import { api, type PageSummary, type Project, type Schema } from "./api.ts";
import { Chat } from "./Chat.tsx";
import { PageView } from "./PageView.tsx";
import { VerifyView } from "./VerifyView.tsx";

// Routes: #/<project>, #/<project>/p/<page id>, #/<project>/verificar
function parseHash() {
	const [project = "", view = "", ...rest] = decodeURIComponent(location.hash.slice(2)).split("/");
	return { project, view, pageId: rest.join("/") };
}

export const pageHref = (project: string, id: string) => `#/${project}/p/${id}`;

const STATUS_LABEL: Record<string, string> = { borrador: "borrador", aprobada: "aprobada", bloqueada: "bloqueada", desactualizada: "desactualizada" };

export function App() {
	const [route, setRoute] = useState(parseHash);
	const [projects, setProjects] = useState<Project[]>([]);
	const [schema, setSchema] = useState<Schema>();
	const [pages, setPages] = useState<PageSummary[]>([]);
	const [revision, setRevision] = useState(0);
	const [mobileTab, setMobileTab] = useState<"wiki" | "chat">("chat");
	const [error, setError] = useState("");

	useEffect(() => {
		const onHash = () => setRoute(parseHash());
		window.addEventListener("hashchange", onHash);
		api.schema().then(setSchema);
		api.projects().then(setProjects);
		return () => window.removeEventListener("hashchange", onHash);
	}, []);

	const project = route.project;
	const refresh = useCallback(() => setRevision((r) => r + 1), []);

	useEffect(() => {
		if (!project) return;
		api.pages(project).then((r) => setPages(r.pages)).catch((e) => setError(e.message));
	}, [project, revision]);

	async function newProject() {
		const title = prompt("Título provisional del proyecto");
		if (!title?.trim()) return;
		try {
			const created = await api.createProject(title);
			setProjects(await api.projects());
			location.hash = `#/${created.id}`;
		} catch (e) {
			setError((e as Error).message);
		}
	}

	const current = projects.find((p) => p.id === project);

	return (
		<div className="app">
			<header className="topbar">
				<strong>Narrative Harness</strong>
				<select value={project} onChange={(e) => (location.hash = e.target.value ? `#/${e.target.value}` : "#/")}>
					<option value="">Elige un proyecto…</option>
					{projects.map((p) => (
						<option key={p.id} value={p.id}>
							{p.title}
						</option>
					))}
				</select>
				<button onClick={newProject}>Nuevo proyecto</button>
				{project && (
					<nav className="mobile-tabs">
						<button className={mobileTab === "wiki" ? "active" : ""} onClick={() => setMobileTab("wiki")}>
							Wiki
						</button>
						<button className={mobileTab === "chat" ? "active" : ""} onClick={() => setMobileTab("chat")}>
							Chat
						</button>
					</nav>
				)}
			</header>
			{error && (
				<div className="banner error" onClick={() => setError("")}>
					{error}
				</div>
			)}
			{!current ? (
				<main className="empty">
					<p>Crea un proyecto o elige uno para empezar.</p>
				</main>
			) : (
				<div className={`workspace show-${mobileTab}`}>
					<aside className="sidebar">
						<a className={`side-link ${route.view === "verificar" ? "active" : ""}`} href={`#/${project}/verificar`}>
							Verificador
						</a>
						{schema?.pageTypes.map((t) => {
							const ofType = pages.filter((p) => p.type === t.type);
							if (!ofType.length) return null;
							return (
								<section key={t.type}>
									<h3>{t.plural}</h3>
									{ofType.map((p) => (
										<a
											key={p.id}
											className={`side-link ${route.pageId === p.id ? "active" : ""}`}
											href={pageHref(project, p.id)}
											onClick={() => setMobileTab("wiki")}
										>
											<span className={`dot ${p.status}`} title={STATUS_LABEL[p.status]} />
											{p.title}
										</a>
									))}
								</section>
							);
						})}
					</aside>
					<main className="content">
						{route.view === "verificar" ? (
							<VerifyView project={project} revision={revision} />
						) : (
							<PageView
								project={project}
								pageId={route.pageId || "portada"}
								schema={schema}
								pages={pages}
								revision={revision}
								onChanged={refresh}
							/>
						)}
					</main>
					<Chat project={project} onPagesChanged={refresh} />
				</div>
			)}
		</div>
	);
}
