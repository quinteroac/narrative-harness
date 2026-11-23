// Page types of the wiki. Each type has a structured card ("ficha") and free prose.
// Fields are kept loose on purpose: required fields only produce warnings while a page is a draft.

export type FieldKind = "text" | "number" | "list" | "boolean";

export interface FieldDef {
	key: string;
	label: string;
	kind: FieldKind;
	required?: boolean;
	hint?: string;
}

export interface PageTypeDef {
	type: string;
	label: string;
	plural: string;
	fields: FieldDef[];
	singleton?: boolean;
}

export const STATUSES = ["borrador", "aprobada", "bloqueada", "desactualizada"] as const;
export type Status = (typeof STATUSES)[number];

export const VISIBILITIES = ["interna", "spoiler", "publica"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const PAGE_TYPES: PageTypeDef[] = [
	{
		type: "portada",
		label: "Portada",
		plural: "Portada",
		singleton: true,
		fields: [
			{ key: "premisa", label: "Premisa", kind: "text", required: true },
			{ key: "genero", label: "Género", kind: "text", required: true },
			{ key: "tono", label: "Tono", kind: "text", required: true },
			{ key: "pilares", label: "Pilares de juego", kind: "list", required: true, hint: "Qué hace el jugador, qué lo motiva, qué lo hace distinto" },
			{ key: "publico", label: "Público objetivo", kind: "text" },
			{ key: "referentes", label: "Referentes", kind: "list" },
			{ key: "diferenciacion", label: "Diferenciación", kind: "text" },
			{ key: "plataformas", label: "Plataformas", kind: "list" },
			{ key: "distribucion", label: "Modelo de distribución", kind: "text", hint: "Completo, episódico, demo..." },
			{ key: "clasificacion", label: "Clasificación", kind: "text" },
			{ key: "avisos_contenido", label: "Categorías de contenido", kind: "list", hint: "Base para las opciones de contenido del jugador" },
			{ key: "duracion_objetivo", label: "Duración objetivo", kind: "text" },
			{ key: "rutas", label: "Rutas previstas", kind: "text" },
			{ key: "estilo_visual", label: "Estilo visual", kind: "text" },
			{ key: "idioma", label: "Idioma del juego", kind: "text" },
		],
	},
	{
		type: "personaje",
		label: "Personaje",
		plural: "Personajes",
		fields: [
			{ key: "nombre_completo", label: "Nombre completo", kind: "text" },
			{ key: "edad", label: "Edad", kind: "number", required: true },
			{ key: "rol", label: "Rol en la historia", kind: "text", required: true },
			{ key: "personalidad", label: "Personalidad", kind: "text", required: true },
			{ key: "voz", label: "Forma de hablar", kind: "text" },
			{ key: "aspecto", label: "Aspecto", kind: "text", required: true },
			{ key: "vestuario", label: "Vestuario", kind: "list" },
			{ key: "arco", label: "Arco", kind: "text" },
			{ key: "secretos", label: "Secretos", kind: "text" },
		],
	},
	{
		type: "lugar",
		label: "Lugar",
		plural: "Lugares",
		fields: [
			{ key: "descripcion", label: "Descripción", kind: "text", required: true },
			{ key: "ambiente", label: "Ambiente", kind: "text" },
			{ key: "variantes", label: "Variantes", kind: "list", hint: "Hora, clima, estado" },
		],
	},
	{
		type: "suceso",
		label: "Suceso",
		plural: "Sucesos",
		fields: [
			{ key: "descripcion", label: "Descripción", kind: "text", required: true },
			{ key: "cuando", label: "Cuándo", kind: "text", hint: "Momento en la línea de tiempo interna" },
			{ key: "en_pantalla", label: "Se muestra en el juego", kind: "boolean" },
		],
	},
	{
		type: "objeto",
		label: "Objeto",
		plural: "Objetos",
		fields: [{ key: "descripcion", label: "Descripción", kind: "text", required: true }],
	},
	{
		type: "grupo",
		label: "Grupo",
		plural: "Grupos",
		fields: [{ key: "descripcion", label: "Descripción", kind: "text", required: true }],
	},
	{
		type: "concepto",
		label: "Concepto del mundo",
		plural: "Conceptos del mundo",
		fields: [{ key: "descripcion", label: "Descripción", kind: "text", required: true }],
	},
];

export const RELATION_TYPES: Record<string, string> = {
	relacionado_con: "relacionado con",
	familia_de: "familia de",
	pareja_de: "pareja de",
	amigo_de: "amigo de",
	rival_de: "rival de",
	trabaja_con: "trabaja con",
	miembro_de: "miembro de",
	pertenece_a: "pertenece a",
	vive_en: "vive en",
	ocurre_en: "ocurre en",
	participa_en: "participa en",
	causa: "causa",
	revela: "revela",
	requiere: "requiere",
	contradice: "contradice",
};

export const pageType = (type: string) => PAGE_TYPES.find((t) => t.type === type);
