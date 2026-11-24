import { useEffect, useState } from "react";
import { api, type RegistryEntry } from "./api.ts";
import { pageHref } from "./App.tsx";

const VISIBILITY_LABEL: Record<string, string> = { visible: "visible", insinuada: "insinuada", oculta: "oculta", revelada: "revelada" };

function PageLinks({ project, ids, none = "nadie" }: { project: string; ids: string[]; none?: string }) {
	if (!ids.length) return <span className="muted">{none}</span>;
	return (
		<>
			{ids.map((id, i) => (
				<span key={id}>
					{i > 0 && ", "}
					<a href={pageHref(project, id)}>{id.split("/")[1]}</a>
				</span>
			))}
		</>
	);
}

export function RegistryView({ project, revision }: { project: string; revision: number }) {
	const [entries, setEntries] = useState<RegistryEntry[]>();

	useEffect(() => {
		api.registry(project).then(setEntries);
	}, [project, revision]);

	if (!entries) return null;

	return (
		<article className="page registry">
			<h1>Registro de estado</h1>
			<p className="muted">
				Todas las variables del juego. Quién las cambia y quién las lee sale de las condiciones y efectos escritos en las páginas; dónde se ven, de las pantallas.
			</p>
			{entries.length === 0 ? (
				<p className="muted">Aún no hay variables.</p>
			) : (
				<div className="table-scroll">
					<table className="card">
						<thead>
							<tr>
								<th>Variable</th>
								<th>Tipo</th>
								<th>Rango / valores</th>
								<th>Inicial</th>
								<th>Jugador</th>
								<th>La cambian</th>
								<th>La leen</th>
								<th>Se ve en</th>
							</tr>
						</thead>
						<tbody>
							{entries.map((e) => (
								<tr key={e.id}>
									<td>
										<a href={pageHref(project, e.id)}>{e.title}</a>
										<div>
											<code>{e.name}</code>
										</div>
									</td>
									<td>{e.tipo}</td>
									<td>{e.valores?.join(", ") ?? e.rango ?? "—"}</td>
									<td>
										<code>{JSON.stringify(e.inicial)}</code>
									</td>
									<td title={e.revelacion}>{VISIBILITY_LABEL[e.visibilidad] ?? e.visibilidad}</td>
									<td>
										<PageLinks project={project} ids={e.writers} />
									</td>
									<td>
										<PageLinks project={project} ids={e.readers} />
									</td>
									<td>
										<PageLinks project={project} ids={e.screens} none="ninguna pantalla" />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</article>
	);
}
