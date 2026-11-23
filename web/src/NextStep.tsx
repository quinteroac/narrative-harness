import { useEffect, useState } from "react";
import { api, type ItemProgress, type PhaseProgress, type Progress } from "./api.ts";
import { pageHref } from "./App.tsx";

const STATE_LABEL: Record<ItemProgress["state"], string> = {
	pendiente: "pendiente",
	en_progreso: "en progreso",
	completo: "por aprobar",
	aprobado: "aprobado",
};

const doneCount = (item: ItemProgress) => item.pages.filter((p) => p.state === "completa" || p.state === "aprobada").length;

function PhaseBar({ phases, onPick }: { phases: PhaseProgress[]; onPick: (p: PhaseProgress) => void }) {
	return (
		<ol className="phase-bar">
			{phases.map((p) => (
				<li key={p.id}>
					<button className={`phase ${p.state}`} disabled={p.state === "actual" || p.state === "proximamente"} title={`${p.description}${p.state === "proximamente" ? " (próximamente)" : ""}`} onClick={() => onPick(p)}>
						{p.state === "hecha" && "✓ "}
						{p.label}
					</button>
				</li>
			))}
		</ol>
	);
}

export function NextStep({ project, revision, onChanged }: { project: string; revision: number; onChanged: () => void }) {
	const [progress, setProgress] = useState<Progress>();
	const [error, setError] = useState("");

	useEffect(() => {
		api.progress(project).then(setProgress);
	}, [project, revision]);

	if (!progress) return null;

	const work = (message: string) => api.send(project, message);
	const current = progress.phases.find((p) => p.state === "actual");
	const next = progress.phases.find((p) => p.id === progress.nextPhase);

	// Changing phase is never blocked; leaving an unfinished phase only asks for confirmation.
	async function goTo(target: PhaseProgress) {
		const forward = progress!.phases.indexOf(target) > progress!.phases.findIndex((p) => p.state === "actual");
		const pending = progress!.items.filter((i) => i.state !== "aprobado").length;
		if (forward && pending && !confirm(`Quedan ${pending} fundamentales de ${current?.label} sin aprobar. ¿Pasar igualmente a ${target.label}?`)) return;
		if (!forward && !confirm(`¿Volver a la fase ${target.label}?`)) return;
		try {
			await api.setPhase(project, target.id);
			onChanged();
			work(forward ? `Pasamos a la fase ${target.label}. Propón sus fundamentales.` : `Volvemos a la fase ${target.label}.`);
		} catch (e) {
			setError((e as Error).message);
		}
	}

	async function approveAll() {
		const ids = progress!.unapproved.flatMap((i) => i.pages.filter((p) => p.state === "completa").map((p) => p.id));
		const failed: string[] = [];
		for (const id of ids) {
			try {
				await api.setStatus(project, id, "aprobada");
			} catch (e) {
				failed.push(`${id}: ${(e as Error).message}`);
			}
		}
		setError(failed.join("\n"));
		onChanged();
	}

	const total = progress.items.length;
	const approved = progress.items.filter((i) => i.state === "aprobado").length;
	const complete = approved + progress.unapproved.length;
	const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;

	return (
		<div className="next-step">
			<PhaseBar phases={progress.phases} onPick={goTo} />
			{current && <p className="muted small phase-description">{current.description}</p>}
			<div className="progress" title={`${complete} completos, ${approved} aprobados de ${total}`}>
				<div className="complete" style={{ width: pct(complete) }} />
				<div className="approved" style={{ width: pct(approved) }} />
			</div>
			<p className="muted small">
				{complete}/{total} completos · {approved}/{total} aprobados
				{progress.plan && (
					<>
						{progress.plan.status === "borrador" && " · plan sin aprobar"} · <a href={pageHref(project, "plan")}>ver plan</a>
					</>
				)}
			</p>
			{error && <div className="banner error small">{error}</div>}

			{progress.ready && next && (
				<div className="phase-ready">
					<span>Fase lista.</span>
					<button className="primary" onClick={() => goTo(next)}>
						Pasar a {next.label}
					</button>
				</div>
			)}
			{progress.ready && !next && <p className="small">Fase lista. Las siguientes fases llegarán en próximas versiones del harness.</p>}
			{!progress.next.length && !progress.ready && progress.unapproved.length > 0 && (
				<div className="phase-ready">
					<span>Todo completo; falta tu aprobación.</span>
					<button className="primary" onClick={approveAll}>
						Aprobar ({progress.unapproved.length})
					</button>
				</div>
			)}
			{!progress.items.length && (
				<div className="phase-ready">
					<span>Esta fase aún no tiene fundamentales.</span>
					<button onClick={() => work(`Propón los fundamentales de la fase ${current?.label}.`)}>Pedirlos al agente</button>
				</div>
			)}

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
								<a href={pageHref(project, q.page)}>{q.title}</a>: {q.text}{" "}
								<button className="link" onClick={() => work(`Resolvamos esta pregunta de ${q.title}: ${q.text}`)}>
									hablarlo
								</button>
							</li>
						))}
					</ul>
				</details>
			)}
		</div>
	);
}
