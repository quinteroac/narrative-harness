import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ID_PATTERN, loadAll, pageExists, readPage, renamePage, serializePage, typeOfId, writePage, bodyLinks, type Page } from "../wiki/store.ts";
import { pageType, PAGE_TYPES } from "../wiki/schema.ts";
import { verifyProject } from "../wiki/verify.ts";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

// `changed` collects the pages written during a run, for the commit message.
export function wikiTools(projectDir: string, changed: Set<string>): ToolDefinition[] {
	const list = defineTool({
		name: "wiki_list",
		label: "Listar páginas",
		description: "List wiki pages (id, title, status). Optionally filter by page type.",
		parameters: Type.Object({ type: Type.Optional(Type.String({ description: "Page type, e.g. personaje" })) }),
		async execute(_id, { type }) {
			const { pages, broken } = loadAll(projectDir);
			const rows = pages.filter((p) => !type || p.type === type).map((p) => `${p.id} — ${p.title} [${p.status}]`);
			const bad = broken.map((b) => `${b.id} — ILEGIBLE: ${b.error}`);
			return text([...rows, ...bad].join("\n") || "(sin páginas)");
		},
	});

	const read = defineTool({
		name: "wiki_read",
		label: "Leer página",
		description: "Read one wiki page in full (YAML card + prose), plus the pages that link to it.",
		parameters: Type.Object({ id: Type.String() }),
		async execute(_id, { id }) {
			if (!pageExists(projectDir, id)) throw new Error(`no existe la página "${id}"`);
			const backlinks = loadAll(projectDir).pages
				.filter((p) => p.id !== id && (p.relations.some((r) => r.target === id) || bodyLinks(p.body).includes(id)))
				.map((p) => p.id);
			const page = serializePage(readPage(projectDir, id));
			return text(`${page}\nEnlazada desde: ${backlinks.join(", ") || "(nadie)"}`);
		},
	});

	const search = defineTool({
		name: "wiki_search",
		label: "Buscar en la wiki",
		description: "Case-insensitive text search across titles, card fields and prose.",
		parameters: Type.Object({ query: Type.String() }),
		async execute(_id, { query }) {
			const q = query.toLowerCase();
			const hits = loadAll(projectDir).pages.flatMap((p) => {
				const haystack = `${p.title}\n${JSON.stringify(p.fields)}\n${p.body}`;
				const at = haystack.toLowerCase().indexOf(q);
				return at < 0 ? [] : [`${p.id}: …${haystack.slice(Math.max(0, at - 60), at + 80).replace(/\n/g, " ")}…`];
			});
			return text(hits.join("\n") || "(sin resultados)");
		},
	});

	const write = defineTool({
		name: "wiki_write",
		label: "Escribir página",
		description:
			"Create or update a wiki page. The page type comes from the id prefix (personaje/ana-robles), or the id is a single page: portada, plan. " +
			"On update, `fields` are merged key by key (a null value removes the key); `relations`, `body` and `notes` replace the old value when given. " +
			"Any page you write becomes a draft (borrador); locked pages (bloqueada) cannot be written.",
		parameters: Type.Object({
			id: Type.String({ description: "portada, plan, or <type>/<slug> with lowercase ascii and dashes" }),
			title: Type.Optional(Type.String()),
			fields: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
			relations: Type.Optional(Type.Array(Type.Object({ type: Type.String(), target: Type.String(), note: Type.Optional(Type.String()) }))),
			body: Type.Optional(Type.String({ description: "Markdown prose. Link pages with [[id]] or [[id|label]]." })),
			notes: Type.Optional(Type.String({ description: "Author notes: intentions, doubts, proposals. Never shown to readers." })),
			questions: Type.Optional(
				Type.Array(Type.Object({ text: Type.String(), answer: Type.Optional(Type.String()) }), {
					description: "Open questions about this page for the author; set answer when one is resolved. Replaces the list.",
				}),
			),
			visibility: Type.Optional(Type.Union([Type.Literal("interna"), Type.Literal("spoiler"), Type.Literal("publica")])),
		}),
		async execute(_id, args) {
			if (!ID_PATTERN.test(args.id)) throw new Error(`id inválido "${args.id}": usa portada, plan o tipo/nombre-en-minusculas`);
			const type = typeOfId(args.id);
			const def = pageType(type);
			if (!def || !!def.singleton === args.id.includes("/"))
				throw new Error(`tipo desconocido "${type}". Tipos: ${PAGE_TYPES.filter((t) => !t.singleton).map((t) => t.type).join(", ")}; páginas únicas: portada, plan`);

			const existing = pageExists(projectDir, args.id) ? readPage(projectDir, args.id) : undefined;
			if (existing?.status === "bloqueada") throw new Error(`"${args.id}" está bloqueada por el autor; pídele que la desbloquee`);
			if (!existing && !args.title) throw new Error("una página nueva necesita título");

			const fields = { ...existing?.fields };
			for (const [k, v] of Object.entries(args.fields ?? {})) {
				if (v === null) delete fields[k];
				else fields[k] = v;
			}
			const page: Page = {
				id: args.id,
				type,
				title: args.title ?? existing!.title,
				status: "borrador",
				visibility: args.visibility ?? existing?.visibility ?? "interna",
				fields,
				relations: args.relations ?? existing?.relations ?? [],
				notes: args.notes ?? existing?.notes,
				questions: args.questions ?? existing?.questions,
				body: args.body ?? existing?.body ?? "",
			};
			writePage(projectDir, page);
			changed.add(args.id);

			const issues = verifyProject(projectDir).filter((i) => i.page === args.id);
			const reopened = existing?.status === "aprobada" ? " Estaba aprobada: vuelve a borrador hasta que el autor la apruebe." : "";
			const report = issues.length ? `\nVerificador:\n${issues.map((i) => `- [${i.level}] ${i.message}`).join("\n")}` : "";
			return text(`${existing ? "Actualizada" : "Creada"} ${args.id}.${reopened}${report}`);
		},
	});

	const rename = defineTool({
		name: "wiki_rename",
		label: "Renombrar página",
		description: "Change a page id (for example after its title changed) and update every relation and [[link]] that points to it. The type prefix stays the same.",
		parameters: Type.Object({ id: Type.String(), new_id: Type.String() }),
		async execute(_id, { id, new_id }) {
			if (!pageExists(projectDir, id)) throw new Error(`no existe la página "${id}"`);
			if (readPage(projectDir, id).status === "bloqueada") throw new Error(`"${id}" está bloqueada por el autor`);
			const touched = renamePage(projectDir, id, new_id);
			changed.add(new_id);
			touched.forEach((t) => changed.add(t));
			return text(`Renombrada ${id} → ${new_id}. Enlaces actualizados en: ${touched.join(", ") || "(ninguna)"}`);
		},
	});

	const verify = defineTool({
		name: "wiki_verify",
		label: "Verificar wiki",
		description: "Run the verifier over the whole wiki: invalid cards, missing required fields, broken links and relations.",
		parameters: Type.Object({}),
		async execute() {
			const issues = verifyProject(projectDir);
			return text(issues.map((i) => `[${i.level}] ${i.page}: ${i.message}`).join("\n") || "Sin problemas.");
		},
	});

	// The web shows the question as clickable options; the author's choice arrives as their next message.
	const ask = defineTool({
		name: "ask_author",
		label: "Preguntar al autor",
		description:
			"Ask the author a question with clickable options. Use it whenever you offer a choice or need a decision, instead of listing options in prose. " +
			"One question per call; you may call it several times in one reply. After asking, end your reply and wait: the answer arrives as the author's next message. The author can always answer in their own words instead.",
		parameters: Type.Object({
			question: Type.String(),
			options: Type.Array(
				Type.Object({
					label: Type.String({ description: "Short answer the author can click, written as their reply" }),
					detail: Type.Optional(Type.String({ description: "One line on what this option implies" })),
				}),
				{ minItems: 2, maxItems: 6 },
			),
			multiple: Type.Optional(Type.Boolean({ description: "True when several options can be chosen together" })),
		}),
		async execute() {
			return text("Pregunta mostrada al autor. Termina tu respuesta y espera su elección.");
		},
	});

	// The web shows approve buttons; approving stays the author's click.
	const approval = defineTool({
		name: "request_approval",
		label: "Pedir aprobación",
		description:
			"Show the author approve buttons for pages that are ready, for example when they say they approve something in chat. You cannot approve pages yourself.",
		parameters: Type.Object({ ids: Type.Array(Type.String(), { minItems: 1 }) }),
		async execute(_id, { ids }) {
			const missing = ids.filter((id) => !pageExists(projectDir, id));
			if (missing.length) throw new Error(`no existen: ${missing.join(", ")}`);
			return text("Botones de aprobación mostrados al autor.");
		},
	});

	return [list, read, search, write, rename, verify, ask, approval] as ToolDefinition[];
}
