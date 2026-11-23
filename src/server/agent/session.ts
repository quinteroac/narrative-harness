import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
	createAgentSession,
	createExtensionRuntime,
	ModelRuntime,
	SessionManager,
	SettingsManager,
	type AgentSession,
	type AgentSessionEvent,
	type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { config } from "../config.ts";
import { commit, commitManualEdits } from "../projects.ts";
import { systemPrompt } from "./prompt.ts";
import { wikiTools } from "./tools.ts";

// What the web client receives over SSE.
export type ChatEvent =
	| { kind: "user"; text: string }
	| { kind: "text"; delta: string }
	| { kind: "tool_start"; id: string; name: string; args: unknown }
	| { kind: "tool_end"; id: string; name: string; isError: boolean; result: string }
	| { kind: "message_end" }
	| { kind: "settled" }
	| { kind: "pages_changed" }
	| { kind: "error"; message: string };

export interface ChatItem {
	role: "user" | "assistant" | "tool";
	text: string;
	name?: string;
	isError?: boolean;
}

let modelRuntime: ModelRuntime | undefined;

// The harness owns the whole prompt: no pi extensions, skills or context files are loaded.
function resourceLoader(prompt: string): ResourceLoader {
	return {
		getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => prompt,
		getSystemPromptSource: () => undefined,
		getAppendSystemPrompt: () => [],
		getAppendSystemPromptSources: () => [],
		extendResources: () => {},
		reload: async () => {},
	};
}

const textOf = (content: unknown): string =>
	typeof content === "string"
		? content
		: Array.isArray(content)
			? content.filter((c) => c.type === "text").map((c) => c.text).join("")
			: "";

export class ProjectAgent {
	private listeners = new Set<(e: ChatEvent) => void>();
	busy = false;

	private constructor(
		readonly dir: string,
		private session: AgentSession,
		private changed: Set<string>,
	) {
		session.subscribe((e) => this.onEvent(e));
	}

	static async open(dir: string, title: string): Promise<ProjectAgent> {
		modelRuntime ??= await ModelRuntime.create();
		const [provider, ...rest] = config.model.split("/");
		const model = modelRuntime.getModel(provider, rest.join("/"));
		if (!model) throw new Error(`pi no conoce el modelo "${config.model}"`);

		const sessionDir = join(dir, ".harness", "sessions");
		mkdirSync(sessionDir, { recursive: true });
		const changed = new Set<string>();
		const tools = wikiTools(dir, changed);
		const { session } = await createAgentSession({
			cwd: dir,
			model,
			thinkingLevel: config.thinking,
			modelRuntime,
			resourceLoader: resourceLoader(systemPrompt(title)),
			settingsManager: SettingsManager.inMemory({ enableInstallTelemetry: false, retry: { enabled: true, maxRetries: 2 } }),
			sessionManager: SessionManager.continueRecent(dir, sessionDir),
			tools: tools.map((t) => t.name),
			customTools: tools,
		});
		return new ProjectAgent(dir, session, changed);
	}

	get modelName(): string {
		return this.session.model ? `${this.session.model.provider}/${this.session.model.id}` : config.model;
	}

	subscribe(listener: (e: ChatEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private emit(e: ChatEvent) {
		for (const l of this.listeners) l(e);
	}

	private onEvent(e: AgentSessionEvent) {
		if (e.type === "message_update" && e.assistantMessageEvent.type === "text_delta") {
			this.emit({ kind: "text", delta: e.assistantMessageEvent.delta });
		} else if (e.type === "message_end" && e.message.role === "assistant") {
			this.emit({ kind: "message_end" });
		} else if (e.type === "tool_execution_start") {
			this.emit({ kind: "tool_start", id: e.toolCallId, name: e.toolName, args: e.args });
		} else if (e.type === "tool_execution_end") {
			this.emit({ kind: "tool_end", id: e.toolCallId, name: e.toolName, isError: e.isError, result: textOf(e.result?.content) });
			if (e.toolName === "wiki_write" && !e.isError) this.emit({ kind: "pages_changed" });
		} else if (e.type === "agent_settled") {
			this.finishRun();
		}
	}

	private finishRun() {
		if (this.changed.size) {
			const ids = [...this.changed];
			this.changed.clear();
			const summary = ids.length > 4 ? `${ids.slice(0, 4).join(", ")} y ${ids.length - 4} más` : ids.join(", ");
			commit(this.dir, `agente: ${summary}`);
		}
		this.busy = false;
		this.emit({ kind: "settled" });
	}

	async send(message: string) {
		if (this.busy) {
			await this.session.followUp(message);
			this.emit({ kind: "user", text: message });
			return;
		}
		this.busy = true;
		commitManualEdits(this.dir);
		this.emit({ kind: "user", text: message });
		try {
			await this.session.prompt(message);
		} catch (err) {
			this.emit({ kind: "error", message: (err as Error).message });
			this.finishRun();
		}
	}

	async abort() {
		await this.session.abort();
	}

	history(): ChatItem[] {
		const items: ChatItem[] = [];
		for (const m of this.session.messages as any[]) {
			if (m.role === "user") items.push({ role: "user", text: textOf(m.content) });
			else if (m.role === "assistant") {
				for (const part of m.content) {
					if (part.type === "text" && part.text.trim()) items.push({ role: "assistant", text: part.text });
					if (part.type === "toolCall") items.push({ role: "tool", name: part.name, text: JSON.stringify(part.arguments ?? {}) });
				}
				if (m.errorMessage) items.push({ role: "assistant", text: `Error: ${m.errorMessage}`, isError: true });
			} else if (m.role === "toolResult" && m.isError) {
				items.push({ role: "tool", name: m.toolName, text: textOf(m.content), isError: true });
			}
		}
		return items;
	}

	dispose() {
		this.session.dispose();
	}
}
