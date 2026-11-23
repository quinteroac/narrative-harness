import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PageSummary, type Project, type Schema } from "./api.ts";
import { Chat } from "./Chat.tsx";
import { NextStep } from "./NextStep.tsx";
import { PageView } from "./PageView.tsx";
import { RegistryView } from "./RegistryView.tsx";
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
	const [editing, setEditing] = useState(false);
	const editAfterNavigation = useRef("");

	useEffect(() => {
		const onHash = () => {
			const next = parseHash();
			setRoute(next);
			setEditing(editAfterNavigation.current === next.pageId);
			editAfterNavigation.current = "";
		};
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
		api.projects().then(setProjects);
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

	async function newPage() {
		const types = schema?.pageTypes.filter((t) => !t.singleton) ?? [];
		const choice = prompt(`Tipo de página:\n${types.map((t, i) => `${i + 1}. ${t.label}`).join("\n")}`, "1");
		const type = types[Number(choice) - 1];
		if (!type) return;
		const title = prompt(`Título del ${type.label.toLowerCase()}`);
		if (!title?.trim()) return;
		try {
			const { id } = await api.createPage(project, type.type, title);
			refresh();
			editAfterNavigation.current = id;
			location.hash = pageHref(project, id);
			setMobileTab("wiki");
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
						<a className={`side-link ${route.view === "estado" ? "active" : ""}`} href={`#/${project}/estado`}>
							Registro de estado
						</a>
						<button className="side-button" onClick={newPage}>
							+ Nueva página
						</button>
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
						) : route.view === "estado" ? (
							<RegistryView project={project} revision={revision} />
						) : (
							<PageView
								project={project}
								pageId={route.pageId || "portada"}
								schema={schema}
								pages={pages}
								revision={revision}
								onChanged={refresh}
								editing={editing}
								setEditing={setEditing}
							/>
						)}
					</main>
					<Chat
						project={project}
						pages={pages}
						onPagesChanged={refresh}
						top={<NextStep project={project} revision={revision} />}
					/>
				</div>
			)}
		</div>
	);
}
