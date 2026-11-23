import { useEffect, useState } from "react";
import { api, type Issue } from "./api.ts";
import { pageHref } from "./App.tsx";

export function VerifyView({ project, revision }: { project: string; revision: number }) {
	const [issues, setIssues] = useState<Issue[]>();

	useEffect(() => {
		api.verify(project).then(setIssues);
	}, [project, revision]);

	if (!issues) return null;
	const errors = issues.filter((i) => i.level === "error").length;

	return (
		<article className="page">
			<h1>Verificador</h1>
			<p className="muted">
				{issues.length === 0 ? "Sin problemas." : `${errors} errores, ${issues.length - errors} avisos.`}
			</p>
			<ul className="issues">
				{issues.map((i, n) => (
					<li key={n} className={i.level}>
						<a href={pageHref(project, i.page)}>{i.page}</a>: {i.message}
					</li>
				))}
			</ul>
		</article>
	);
}
