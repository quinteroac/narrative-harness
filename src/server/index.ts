import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ProjectAgent } from "./agent/session.ts";
import { config, ROOT } from "./config.ts";
import { commit, commitManualEdits, createProject, history, listProjects, projectDir, slugify } from "./projects.ts";
import { PAGE_TYPES, pageType, RELATION_TYPES, STATUSES, VISIBILITIES, type Status } from "./wiki/schema.ts";
import { bodyLinks, loadAll, pageExists, readPage, renamePage, writePage, type Page } from "./wiki/store.ts";
import { checkMechanics } from "./wiki/mechanics.ts";
import { projectProgress } from "./wiki/progress.ts";
import { isEmpty, verifyProject } from "./wiki/verify.ts";

const agents = new Map<string, Promise<ProjectAgent>>();

function agentFor(project: string): Promise<ProjectAgent> {
	let agent = agents.get(project);
	if (!agent) {
		agent = ProjectAgent.open(projectDir(project));
		agent.catch(() => agents.delete(project));
		agents.set(project, agent);
	}
	return agent;
}

const app = new Hono();

app.onError((err, c) => c.json({ error: err.message }, 400));

app.get("/api/status", (c) => c.json({ model: config.model }));
app.get("/api/schema", (c) => c.json({ pageTypes: PAGE_TYPES, relationTypes: RELATION_TYPES }));

app.get("/api/projects", (c) => c.json(listProjects()));
app.post("/api/projects", async (c) => {
	const { title } = await c.req.json<{ title: string }>();
	if (!title?.trim()) throw new Error("el proyecto necesita un título");
	return c.json(createProject(title.trim()));
});

app.get("/api/projects/:p/pages", (c) => {
	const { pages, broken } = loadAll(projectDir(c.req.param("p")));
	return c.json({
		pages: pages.map(({ id, type, title, status, visibility }) => ({ id, type, title, status, visibility })),
		broken,
	});
});

app.get("/api/projects/:p/page", (c) => {
	const dir = projectDir(c.req.param("p"));
	const id = c.req.query("id") ?? "";
	if (!pageExists(dir, id)) return c.json({ error: `no existe la página "${id}"` }, 404);
	const backlinks = loadAll(dir).pages
		.filter((p) => p.id !== id && (p.relations.some((r) => r.target === id) || bodyLinks(p.body).includes(id)))
		.map(({ id, title, type }) => ({ id, title, type }));
	return c.json({
		page: readPage(dir, id),
		backlinks,
		issues: verifyProject(dir).filter((i) => i.page === id),
		history: history(dir, relative(dir, join(dir, "wiki", `${id}.md`))),
	});
});

// Approving and locking belong to the author only; the agent has no tool for it.
app.post("/api/projects/:p/status", async (c) => {
	const dir = projectDir(c.req.param("p"));
	const { id, status } = await c.req.json<{ id: string; status: Status }>();
	if (!STATUSES.includes(status)) throw new Error(`estado desconocido "${status}"`);
	const page = readPage(dir, id);
	if (status === "aprobada" || status === "bloqueada") {
		const errors = verifyProject(dir).filter((i) => i.page === id && i.level === "error");
		const missing = PAGE_TYPES.find((t) => t.type === page.type)?.fields.filter((f) => f.required && isEmpty(page.fields[f.key])) ?? [];
		if (errors.length || missing.length) throw new Error(`no se puede ${status === "aprobada" ? "aprobar" : "bloquear"}: ${[...errors.map((e) => e.message), ...missing.map((f) => `falta "${f.label}"`)].join("; ")}`);
	}
	commitManualEdits(dir);
	writePage(dir, { ...page, status });
	commit(dir, `autor: ${status} ${id}`);
	return c.json({ ok: true });
});

app.post("/api/projects/:p/pages", async (c) => {
	const dir = projectDir(c.req.param("p"));
	const { type, title } = await c.req.json<{ type: string; title: string }>();
	const def = pageType(type);
	if (!def || def.singleton) throw new Error(`no se pueden crear páginas de tipo "${type}"`);
	if (!title?.trim()) throw new Error("la página necesita un título");
	const base = `${type}/${slugify(title)}`;
	let id = base;
	for (let n = 2; pageExists(dir, id); n++) id = `${base}-${n}`;
	commitManualEdits(dir);
	writePage(dir, { id, type, title: title.trim(), status: "borrador", visibility: "interna", fields: {}, relations: [], body: "" });
	commit(dir, `autor: crea ${id}`);
	return c.json({ id });
});

app.post("/api/projects/:p/rename", async (c) => {
	const dir = projectDir(c.req.param("p"));
	const { id, newId } = await c.req.json<{ id: string; newId: string }>();
	commitManualEdits(dir);
	renamePage(dir, id, newId);
	commit(dir, `autor: renombra ${id} → ${newId}`);
	return c.json({ id: newId });
});

// Author edits keep the page status: an approved page the author changes stays approved.
app.put("/api/projects/:p/page", async (c) => {
	const dir = projectDir(c.req.param("p"));
	const edited = await c.req.json<Page>();
	const existing = readPage(dir, edited.id);
	if (!edited.title?.trim()) throw new Error("la página necesita un título");
	if (!VISIBILITIES.includes(edited.visibility)) throw new Error(`visibilidad desconocida "${edited.visibility}"`);
	commitManualEdits(dir);
	writePage(dir, {
		id: existing.id,
		type: existing.type,
		title: edited.title.trim(),
		status: existing.status,
		visibility: edited.visibility,
		fields: edited.fields ?? {},
		relations: (edited.relations ?? []).filter((r) => r.type && r.target),
		notes: edited.notes?.trim() || undefined,
		questions: edited.questions?.filter((q) => q.text?.trim()),
		body: edited.body ?? "",
	});
	commit(dir, `autor: edita ${existing.id}`);
	return c.json({ issues: verifyProject(dir).filter((i) => i.page === existing.id) });
});

app.get("/api/projects/:p/progress", (c) => c.json(projectProgress(projectDir(c.req.param("p")))));

app.get("/api/projects/:p/registry", (c) => c.json(checkMechanics(loadAll(projectDir(c.req.param("p"))).pages).registry));

app.get("/api/projects/:p/verify", (c) => c.json(verifyProject(projectDir(c.req.param("p")))));

app.get("/api/projects/:p/chat", async (c) => {
	const agent = await agentFor(c.req.param("p"));
	return c.json({ items: agent.history(), busy: agent.busy, model: agent.modelName });
});

app.post("/api/projects/:p/chat", async (c) => {
	const { message } = await c.req.json<{ message: string }>();
	if (!message?.trim()) throw new Error("mensaje vacío");
	const agent = await agentFor(c.req.param("p"));
	void agent.send(message.trim());
	return c.json({ ok: true }, 202);
});

app.post("/api/projects/:p/abort", async (c) => {
	await (await agentFor(c.req.param("p"))).abort();
	return c.json({ ok: true });
});

app.get("/api/projects/:p/events", async (c) => {
	const agent = await agentFor(c.req.param("p"));
	return streamSSE(c, async (stream) => {
		const unsubscribe = agent.subscribe((e) => void stream.writeSSE({ data: JSON.stringify(e) }));
		stream.onAbort(unsubscribe);
		while (!stream.aborted) {
			await stream.writeSSE({ event: "ping", data: "" });
			await stream.sleep(25_000);
		}
		unsubscribe();
	});
});

const dist = join(ROOT, "dist");
if (existsSync(dist)) {
	app.use("/*", serveStatic({ root: relative(process.cwd(), dist) }));
	app.get("*", (c) => c.html(readFileSync(join(dist, "index.html"), "utf8")));
}

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, () => {
	console.log(`Narrative Harness en http://${config.host}:${config.port} (modelo ${config.model})`);
	if (config.host === "0.0.0.0") console.log("Aviso: accesible desde la red local, sin autenticación.");
});
