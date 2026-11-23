export interface Project {
	id: string;
	title: string;
	created: string;
}

export interface PageSummary {
	id: string;
	type: string;
	title: string;
	status: string;
	visibility: string;
}

export interface Relation {
	type: string;
	target: string;
	note?: string;
}

export interface Page extends PageSummary {
	fields: Record<string, unknown>;
	relations: Relation[];
	notes?: string;
	questions?: { text: string; answer?: string }[];
	body: string;
}

export interface Issue {
	level: "error" | "aviso";
	page: string;
	message: string;
}

export interface PageDetail {
	page: Page;
	backlinks: { id: string; title: string; type: string }[];
	issues: Issue[];
	history: { hash: string; date: string; message: string }[];
}

export interface FieldDef {
	key: string;
	label: string;
	kind: string;
	required?: boolean;
	hint?: string;
	spoiler?: boolean;
	options?: string[];
}

export interface RegistryEntry {
	id: string;
	name: string;
	title: string;
	tipo: string;
	rango?: string;
	valores?: string[];
	inicial: unknown;
	visibilidad: string;
	revelacion?: string;
	writers: string[];
	readers: string[];
}

export interface Schema {
	pageTypes: { type: string; label: string; plural: string; singleton?: boolean; fields: FieldDef[] }[];
	relationTypes: Record<string, string>;
}

export interface ItemProgress {
	titulo: string;
	nota?: string;
	cantidad: number;
	pages: { id: string; title: string; state: "falta" | "incompleta" | "completa" | "aprobada"; missing: string[] }[];
	state: "pendiente" | "en_progreso" | "completo" | "aprobado";
}

export interface PhaseProgress {
	id: string;
	label: string;
	description: string;
	state: "hecha" | "actual" | "disponible" | "proximamente";
}

export interface Progress {
	plan: { status: string } | null;
	phase: string;
	phases: PhaseProgress[];
	nextPhase: string | null;
	ready: boolean;
	items: ItemProgress[];
	next: ItemProgress[];
	unapproved: ItemProgress[];
	questions: { page: string; title: string; text: string }[];
}

export interface ChatItem {
	role: "user" | "assistant" | "tool";
	text: string;
	name?: string;
	isError?: boolean;
}

export type ChatEvent =
	| { kind: "user"; text: string }
	| { kind: "text"; delta: string }
	| { kind: "tool_start"; id: string; name: string; args: unknown }
	| { kind: "tool_end"; id: string; name: string; isError: boolean; result: string }
	| { kind: "message_end" }
	| { kind: "settled" }
	| { kind: "pages_changed" }
	| { kind: "error"; message: string };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`/api${path}`, {
		...init,
		headers: init?.body ? { "Content-Type": "application/json" } : undefined,
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? res.statusText);
	return data as T;
}

const post = <T>(path: string, body: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body) });
const p = (project: string) => `/projects/${encodeURIComponent(project)}`;

export const api = {
	schema: () => call<Schema>("/schema"),
	projects: () => call<Project[]>("/projects"),
	createProject: (title: string) => post<Project>("/projects", { title }),
	pages: (project: string) => call<{ pages: PageSummary[]; broken: { id: string; error: string }[] }>(`${p(project)}/pages`),
	page: (project: string, id: string) => call<PageDetail>(`${p(project)}/page?id=${encodeURIComponent(id)}`),
	setStatus: (project: string, id: string, status: string) => post(`${p(project)}/status`, { id, status }),
	renamePage: (project: string, id: string, newId: string) => post<{ id: string }>(`${p(project)}/rename`, { id, newId }),
	createPage: (project: string, type: string, title: string) => post<{ id: string }>(`${p(project)}/pages`, { type, title }),
	savePage: (project: string, page: Page) => call<{ issues: Issue[] }>(`${p(project)}/page`, { method: "PUT", body: JSON.stringify(page) }),
	setPhase: (project: string, phase: string) => post(`${p(project)}/phase`, { phase }),
	progress: (project: string) => call<Progress>(`${p(project)}/progress`),
	registry: (project: string) => call<RegistryEntry[]>(`${p(project)}/registry`),
	verify: (project: string) => call<Issue[]>(`${p(project)}/verify`),
	chat: (project: string) => call<{ items: ChatItem[]; busy: boolean; model: string }>(`${p(project)}/chat`),
	send: (project: string, message: string) => post(`${p(project)}/chat`, { message }),
	abort: (project: string) => post(`${p(project)}/abort`, {}),
	events: (project: string) => new EventSource(`/api${p(project)}/events`),
};
