// The small condition/effect language shared by mechanics, structure and script.
//   condition:  afecto_grizka >= 10 and not rechazo_grizka
//   effect:     afecto_grizka += 2   |   estacion = "otono"   |   conocio_krat = true
// Variable names come from variable page ids: variable/afecto-grizka is afecto_grizka.
// Text after # is a comment.

export type ValueType = "bool" | "number" | "string";

export type Node =
	| { k: "num"; v: number }
	| { k: "str"; v: string }
	| { k: "bool"; v: boolean }
	| { k: "var"; name: string }
	| { k: "not"; e: Node }
	| { k: "neg"; e: Node }
	| { k: "bin"; op: string; l: Node; r: Node };

export interface Effect {
	target: string;
	op: "=" | "+=" | "-=";
	value: Node;
}

export interface VarInfo {
	type: ValueType;
	min?: number;
	max?: number;
	values?: string[];
}

export const varName = (pageId: string) => pageId.split("/")[1].replace(/-/g, "_");

type Token = { t: "num" | "str" | "id" | "op"; v: string };

function stripComment(src: string): string {
	let quoted = false;
	for (let i = 0; i < src.length; i++) {
		if (src[i] === '"') quoted = !quoted;
		if (src[i] === "#" && !quoted) return src.slice(0, i);
	}
	return src;
}

function tokenize(src: string): Token[] {
	const tokens: Token[] = [];
	const re = /\s*(?:(\d+(?:\.\d+)?)|"([^"]*)"|([a-z_][a-z0-9_]*)|(>=|<=|==|!=|\+=|-=|[<>=+\-*()]))/y;
	let pos = 0;
	const text = src.trimEnd();
	while (pos < text.length) {
		re.lastIndex = pos;
		const m = re.exec(text);
		if (!m) throw new Error(`no se entiende "${text.slice(pos).trim()}"`);
		pos = re.lastIndex;
		if (m[1] !== undefined) tokens.push({ t: "num", v: m[1] });
		else if (m[2] !== undefined) tokens.push({ t: "str", v: m[2] });
		else if (m[3] !== undefined) tokens.push({ t: "id", v: m[3] });
		else tokens.push({ t: "op", v: m[4] });
	}
	return tokens;
}

class Parser {
	private i = 0;
	constructor(private tokens: Token[]) {}

	private peek = () => this.tokens[this.i];
	private next = () => this.tokens[this.i++];
	private accept(v: string) {
		const tok = this.peek();
		if (tok && (tok.t === "op" || tok.t === "id") && tok.v === v) {
			this.i++;
			return true;
		}
		return false;
	}

	done() {
		if (this.peek()) throw new Error(`sobra "${this.peek().v}"`);
	}

	or(): Node {
		let l = this.and();
		while (this.accept("or")) l = { k: "bin", op: "or", l, r: this.and() };
		return l;
	}

	private and(): Node {
		let l = this.not();
		while (this.accept("and")) l = { k: "bin", op: "and", l, r: this.not() };
		return l;
	}

	private not(): Node {
		return this.accept("not") ? { k: "not", e: this.not() } : this.compare();
	}

	private compare(): Node {
		const l = this.sum();
		const tok = this.peek();
		if (tok?.t === "op" && ["==", "!=", ">=", "<=", ">", "<"].includes(tok.v)) {
			this.i++;
			return { k: "bin", op: tok.v, l, r: this.sum() };
		}
		return l;
	}

	private sum(): Node {
		let l = this.unary();
		for (let tok = this.peek(); tok?.t === "op" && ["+", "-", "*"].includes(tok.v); tok = this.peek()) {
			this.i++;
			l = { k: "bin", op: tok.v, l, r: this.unary() };
		}
		return l;
	}

	private unary(): Node {
		return this.accept("-") ? { k: "neg", e: this.unary() } : this.primary();
	}

	private primary(): Node {
		const tok = this.next();
		if (!tok) throw new Error("expresión incompleta");
		if (tok.t === "num") return { k: "num", v: Number(tok.v) };
		if (tok.t === "str") return { k: "str", v: tok.v };
		if (tok.t === "id") {
			if (tok.v === "true" || tok.v === "false") return { k: "bool", v: tok.v === "true" };
			if (["and", "or", "not"].includes(tok.v)) throw new Error(`"${tok.v}" fuera de lugar`);
			return { k: "var", name: tok.v };
		}
		if (tok.v === "(") {
			const e = this.or();
			if (!this.accept(")")) throw new Error('falta ")"');
			return e;
		}
		throw new Error(`"${tok.v}" fuera de lugar`);
	}
}

export function parseCondition(src: string): Node {
	const p = new Parser(tokenize(stripComment(src)));
	const node = p.or();
	p.done();
	return node;
}

export function parseEffect(src: string): Effect {
	const tokens = tokenize(stripComment(src));
	const [target, op] = tokens;
	if (target?.t !== "id" || op?.t !== "op" || !["=", "+=", "-="].includes(op.v))
		throw new Error('un efecto es "variable = valor", "variable += n" o "variable -= n"');
	const p = new Parser(tokens.slice(2));
	const value = p.or();
	p.done();
	return { target: target.v, op: op.v as Effect["op"], value };
}

export function refs(node: Node, out = new Set<string>()): Set<string> {
	if (node.k === "var") out.add(node.name);
	else if (node.k === "not" || node.k === "neg") refs(node.e, out);
	else if (node.k === "bin") {
		refs(node.l, out);
		refs(node.r, out);
	}
	return out;
}

const TYPE_LABEL: Record<ValueType, string> = { bool: "sí/no", number: "número", string: "texto" };

// Infers the type of an expression and collects problems: unknown variables, type mismatches,
// option values that don't exist and thresholds a variable's range can never reach.
export function typeOf(node: Node, env: Map<string, VarInfo>, errors: string[]): ValueType | undefined {
	switch (node.k) {
		case "num":
			return "number";
		case "str":
			return "string";
		case "bool":
			return "bool";
		case "var": {
			const info = env.get(node.name);
			if (!info) errors.push(`no existe la variable "${node.name}"`);
			return info?.type;
		}
		case "not":
			expect(node.e, "bool", env, errors, '"not"');
			return "bool";
		case "neg":
			expect(node.e, "number", env, errors, '"-"');
			return "number";
		case "bin": {
			if (node.op === "and" || node.op === "or") {
				expect(node.l, "bool", env, errors, `"${node.op}"`);
				expect(node.r, "bool", env, errors, `"${node.op}"`);
				return "bool";
			}
			if (["+", "-", "*"].includes(node.op)) {
				expect(node.l, "number", env, errors, `"${node.op}"`);
				expect(node.r, "number", env, errors, `"${node.op}"`);
				return "number";
			}
			const l = typeOf(node.l, env, errors);
			const r = typeOf(node.r, env, errors);
			if (l && r && l !== r) errors.push(`compara ${TYPE_LABEL[l]} con ${TYPE_LABEL[r]}`);
			if (["<", ">", "<=", ">="].includes(node.op) && l && l !== "number") errors.push(`"${node.op}" solo compara números`);
			checkReach(node, env, errors);
			return "bool";
		}
	}
}

function expect(node: Node, type: ValueType, env: Map<string, VarInfo>, errors: string[], where: string) {
	const t = typeOf(node, env, errors);
	if (t && t !== type) errors.push(`${where} espera ${TYPE_LABEL[type]}, recibe ${TYPE_LABEL[t]}`);
}

const FLIP: Record<string, string> = { ">": "<", "<": ">", ">=": "<=", "<=": ">=", "==": "==", "!=": "!=" };

// A comparison between a variable and a literal that the variable's range or options make impossible.
function checkReach(node: Extract<Node, { k: "bin" }>, env: Map<string, VarInfo>, errors: string[]) {
	let v = node.l;
	let lit = node.r;
	let op = node.op;
	if (v.k !== "var") [v, lit, op] = [node.r, node.l, FLIP[node.op]];
	if (v.k !== "var") return;
	const info = env.get(v.name);
	if (!info) return;
	if (lit.k === "str" && info.values && !info.values.includes(lit.v))
		errors.push(`"${lit.v}" no es un valor posible de ${v.name} (${info.values.join(", ")})`);
	if (lit.k !== "num") return;
	const { min, max } = info;
	const k = lit.v;
	const never =
		(max !== undefined && ((op === ">=" && k > max) || (op === ">" && k >= max) || (op === "==" && k > max))) ||
		(min !== undefined && ((op === "<=" && k < min) || (op === "<" && k <= min) || (op === "==" && k < min)));
	if (never) errors.push(`${v.name} ${op} ${k} nunca se cumple (rango ${min ?? "-∞"}..${max ?? "∞"})`);
}

export function checkEffect(effect: Effect, env: Map<string, VarInfo>): string[] {
	const errors: string[] = [];
	const info = env.get(effect.target);
	const t = typeOf(effect.value, env, errors);
	if (!info) return [`no existe la variable "${effect.target}"`, ...errors];
	if (effect.op !== "=" && info.type !== "number") errors.push(`"${effect.op}" solo sirve para números; ${effect.target} es ${TYPE_LABEL[info.type]}`);
	if (t && effect.op !== "=" && t !== "number") errors.push(`"${effect.op}" necesita un número`);
	if (t && effect.op === "=" && t !== info.type) errors.push(`asigna ${TYPE_LABEL[t]} a ${effect.target}, que es ${TYPE_LABEL[info.type]}`);
	const v = effect.value;
	if (effect.op === "=" && v.k === "num" && ((info.min !== undefined && v.v < info.min) || (info.max !== undefined && v.v > info.max)))
		errors.push(`${v.v} está fuera del rango de ${effect.target} (${info.min ?? "-∞"}..${info.max ?? "∞"})`);
	if (effect.op === "=" && v.k === "str" && info.values && !info.values.includes(v.v))
		errors.push(`"${v.v}" no es un valor posible de ${effect.target}`);
	return errors;
}
