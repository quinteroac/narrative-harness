import { useEffect, useState } from "react";
import { api, type ItemProgress, type Progress } from "./api.ts";
import { pageHref } from "./App.tsx";

const STATE_LABEL: Record<ItemProgress["state"], string> = {
	pendiente: "pendiente",
	en_progreso: "en progreso",
	completo: "completo",
	aprobado: "aprobado",
};

const doneCount = (item: ItemProgress) => item.pages.filter((p) => p.state === "completa" || p.state === "aprobada").length;

export function NextStep({ project, revision }: { project: string; revision: number }) {
	const [progress, setProgress] = useState<Progress>();

	useEffect(() => {
		api.progress(project).then(setProgress);
	}, [project, revision]);

	if (!progress) return null;

	const work = (message: string) => api.send(project, message);

	if (!progress.plan) {
		return (
			<section className="next-step">
				<h3>Siguiente paso</h3>
				<p className="muted small">Aún no hay plan de fundamentos.</p>
				<button onClick={() => work("Propón el plan de fundamentos del proyecto.")}>Pedir el plan al agente</button>
			</section>
		);
	}

	const total = progress.items.length;
	const complete = progress.items.filter((i) => i.state === "completo" || i.state === "aprobado").length;

	return (
		<section className="next-step">
			<h3>
				Siguiente paso <a href={pageHref(project, "plan")}>ver plan</a>
			</h3>
			<div className="progress" title={`${complete} de ${total} fundamentos completos`}>
				<div style={{ width: `${total ? (complete / total) * 100 : 0}%` }} />
			</div>
			<p className="muted small">
				{complete}/{total} fundamentos{progress.plan.fase && ` · ${progress.plan.fase}`}
				{progress.plan.status === "borrador" && " · plan sin aprobar"}
			</p>
			{progress.next.map((item) => (
				<div key={item.titulo} className="next-item">
					<div>
						<strong>{item.titulo}</strong>{" "}
						<span className="muted">
							{doneCount(item)}/{item.cantidad} · {STATE_LABEL[item.state]}
						</span>
					</div>
					<button onClick={() => work(`Trabajemos en "${item.titulo}".`)}>Trabajar en esto</button>
				</div>
			))}
			{progress.questions.length > 0 && (
				<details className="questions">
					<summary>Preguntas abiertas ({progress.questions.length})</summary>
					<ul>
						{progress.questions.map((q, i) => (
							<li key={i}>
								<a href={pageHref(project, q.page)}>{q.title}</a>: {q.text}
							</li>
						))}
					</ul>
				</details>
			)}
		</section>
	);
}
