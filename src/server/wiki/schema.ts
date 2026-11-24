// Page types of the wiki. Each type has a structured card ("ficha") and free prose.
// Fields are kept loose on purpose: required fields only produce warnings while a page is a draft.

// "fundamentos" is the plan's list of items: { titulo, paginas, cantidad?, nota? }.
// "choice" takes one of `options`. "conditions" is a list of expressions (see expr.ts); "triggers" a list
// of { cuando?, al?, entonces: [effects], nota? } (see mechanics.ts).
// "value" is a literal of any type: true, false, a number or text.
export type FieldKind = "text" | "number" | "list" | "boolean" | "fundamentos" | "choice" | "conditions" | "triggers" | "value";

export interface FieldDef {
	key: string;
	label: string;
	kind: FieldKind;
	required?: boolean;
	hint?: string;
	// Reveals story: treated as a spoiler even when the page is public.
	spoiler?: boolean;
	options?: string[];
}

export interface PageTypeDef {
	type: string;
	label: string;
	plural: string;
	fields: FieldDef[];
	singleton?: boolean;
	// The phase whose work this type of page is, unless the plan lists the page under another one.
	phase?: string;
}

export const STATUSES = ["borrador", "aprobada", "bloqueada", "desactualizada"] as const;
export type Status = (typeof STATUSES)[number];

export const VISIBILITIES = ["interna", "spoiler", "publica"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

// The design phases in order. Phases not built yet are shown so the author sees the whole road.
export interface PhaseDef {
	id: string;
	label: string;
	description: string;
	built: boolean;
}

export const PHASES: PhaseDef[] = [
	{ id: "concepto", label: "Concepto", built: true, description: "Premisa, género, tono, pilares de juego y visión de producto: la portada." },
	{ id: "wiki", label: "Wiki inicial", built: true, description: "Personajes, lugares, sucesos, grupos y conceptos del mundo, con sus relaciones." },
	{ id: "mecanicas", label: "Mecánicas", built: true, description: "Los sistemas del juego: decisiones, variables, qué se mide y qué se desbloquea." },
	{ id: "ux", label: "UX", built: true, description: "Pantallas, funciones estándar, introducción a las mecánicas, accesibilidad." },
	{ id: "estructura", label: "Estructura", built: false, description: "Rutas, decisiones, finales, arcos y curva emocional." },
	{ id: "escaleta", label: "Escaleta", built: false, description: "Cada segmento convertido en escenas, y la lista de assets." },
	{ id: "guion", label: "Guion", built: false, description: "Diálogo, narración y puesta en escena de cada escena." },
	{ id: "visual", label: "Diseño visual", built: false, description: "El canon visual: hojas de personaje, lugares, guía de estilo y UI." },
	{ id: "produccion", label: "Producción", built: false, description: "Sprites, fondos, CGs y UI finales." },
	{ id: "audio", label: "Audio", built: false, description: "Música, efectos, ambientes y voces." },
	{ id: "entrega", label: "Entrega", built: false, description: "El paquete para implementar el juego en cualquier motor." },
];

export const phase = (id: string) => PHASES.find((p) => p.id === id);

export const MECHANIC_FAMILIES = [
	"decisiones",
	"relaciones",
	"atributos",
	"tiempo",
	"exploracion",
	"recursos",
	"investigacion",
	"actividades",
	"personalizacion",
	"meta",
	"propia",
];

// si_no is a boolean; contador and numero are numbers; texto and opcion are strings.
export const VARIABLE_TYPES = ["si_no", "contador", "numero", "texto", "opcion"];
export const PLAYER_VISIBILITY = ["visible", "insinuada", "oculta", "revelada"];

export const PAGE_TYPES: PageTypeDef[] = [
	{
		type: "portada",
		phase: "concepto",
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
		type: "plan",
		label: "Plan de fundamentos",
		plural: "Plan",
		singleton: true,
		fields: [
			{ key: "fase", label: "Fase", kind: "choice", required: true, options: PHASES.filter((p) => p.built).map((p) => p.id) },
			{
				key: "fundamentos",
				label: "Fundamentos",
				kind: "fundamentos",
				required: true,
				hint: "Lo imprescindible de este juego en cada fase, en orden de prioridad",
			},
		],
	},
	{
		type: "personaje",
		phase: "wiki",
		label: "Personaje",
		plural: "Personajes",
		fields: [
			{ key: "nombre_completo", label: "Nombre completo", kind: "text" },
			{ key: "edad", label: "Edad", kind: "text", required: true, hint: "Años, o una descripción si no aplica: sin edad, milenaria..." },
			{ key: "edad_aparente", label: "Edad aparente", kind: "number", hint: "Años que aparenta; todo personaje en contenido sexual aparenta y es adulto" },
			{ key: "rol", label: "Rol en la historia", kind: "text", required: true },
			{ key: "personalidad", label: "Personalidad", kind: "text", required: true },
			{ key: "voz", label: "Forma de hablar", kind: "text" },
			{ key: "aspecto", label: "Aspecto", kind: "text", required: true },
			{ key: "vestuario", label: "Vestuario", kind: "list" },
			{ key: "arco", label: "Arco", kind: "text", spoiler: true },
			{ key: "secretos", label: "Secretos", kind: "text", spoiler: true },
		],
	},
	{
		type: "mecanica",
		phase: "mecanicas",
		label: "Mecánica",
		plural: "Mecánicas",
		fields: [
			{ key: "proposito", label: "Propósito", kind: "text", required: true, hint: "Qué experiencia busca" },
			{ key: "pilar", label: "Pilar al que sirve", kind: "text", required: true },
			{ key: "familia", label: "Familia", kind: "choice", required: true, options: MECHANIC_FAMILIES },
			{ key: "acciones", label: "Acciones del jugador", kind: "list" },
			{ key: "reglas", label: "Reglas", kind: "text", required: true },
			{ key: "condiciones", label: "Condiciones", kind: "conditions", hint: "Lo que abre o cierra contenido sin cambiar el estado. Una por línea: nivel_rutas >= 2 # Zib disponible" },
			{ key: "disparadores", label: "Disparadores", kind: "triggers", hint: "Cuándo cambia el estado: cuando una condición se cumple, o al ocurrir algo, entonces efectos" },
			{ key: "retroalimentacion", label: "Retroalimentación", kind: "text", hint: "Cómo se entera el jugador" },
			{ key: "enganches", label: "Enganches narrativos", kind: "text", hint: "Dónde se conecta con la estructura y el guion" },
			{ key: "necesidades", label: "Necesidades", kind: "list", hint: "Pantallas para UX y assets para producción" },
			{ key: "parametros", label: "Parámetros de equilibrio", kind: "list" },
			{ key: "casos_limite", label: "Casos límite", kind: "text" },
			{ key: "ejemplo", label: "Ejemplo", kind: "text", hint: "Un recorrido concreto" },
		],
	},
	{
		type: "ux",
		phase: "ux",
		label: "Especificación UX",
		plural: "UX",
		singleton: true,
		fields: [
			{ key: "plataformas", label: "Plataformas", kind: "text", required: true, hint: "PC, móvil, consola... y su orientación" },
			{ key: "controles", label: "Controles", kind: "list", hint: "Ratón, táctil, teclado, mando" },
			{ key: "funciones_estandar", label: "Funciones estándar", kind: "list", required: true, hint: "Guardar/cargar, auto, saltar, historial, galería... y cómo se accede a cada una" },
			{ key: "opciones_contenido", label: "Opciones de contenido", kind: "list", required: true, hint: "Lo que el jugador puede ocultar o suavizar, y la alternativa que ve" },
			{ key: "introduccion_mecanicas", label: "Introducción de las mecánicas", kind: "list", hint: "Cuándo y cómo aprende el jugador cada mecánica" },
			{ key: "accesibilidad", label: "Accesibilidad", kind: "list", required: true, hint: "Tamaño de texto, contraste, velocidad, subtítulos, daltonismo..." },
			{ key: "localizacion", label: "Localización", kind: "text", hint: "Idiomas y qué textos van en imágenes" },
			{ key: "estilo_mockups", label: "Estilo de los mockups", kind: "text", hint: "Paleta, materiales, tipografía y tono visual de la interfaz" },
		],
	},
	{
		type: "pantalla",
		phase: "ux",
		label: "Pantalla",
		plural: "Pantallas",
		fields: [
			{ key: "proposito", label: "Propósito", kind: "text", required: true },
			{ key: "acceso", label: "Cómo se llega", kind: "list", required: true, hint: "Desde qué pantallas o momentos" },
			{ key: "muestra", label: "Variables que muestra", kind: "list", hint: "nombre # cómo se muestra, p. ej. afecto_* # medidor por candidato" },
			{ key: "acciones", label: "Acciones", kind: "list", required: true },
			{ key: "estados", label: "Estados", kind: "list", hint: "Primera vez, vacío, bloqueado, error..." },
			{ key: "boceto", label: "Boceto", kind: "text", required: true, hint: "Qué hay en cada zona de la pantalla, con los textos exactos" },
			{ key: "variantes", label: "Variantes por plataforma", kind: "text" },
			{ key: "accesibilidad", label: "Accesibilidad", kind: "list" },
		],
	},
	{
		type: "variable",
		phase: "mecanicas",
		label: "Variable",
		plural: "Variables",
		fields: [
			{ key: "descripcion", label: "Descripción", kind: "text", required: true },
			{ key: "tipo", label: "Tipo", kind: "choice", required: true, options: VARIABLE_TYPES },
			{ key: "valores", label: "Valores posibles", kind: "list", hint: "Solo para tipo opcion" },
			{ key: "minimo", label: "Mínimo", kind: "number", hint: "los efectos nunca la bajan de aquí" },
			{ key: "maximo", label: "Máximo", kind: "number", hint: "los efectos nunca la suben de aquí" },
			{ key: "inicial", label: "Valor inicial", kind: "value", required: true, hint: "true/false, un número o un texto" },
			{ key: "visibilidad_jugador", label: "Para el jugador", kind: "choice", required: true, options: PLAYER_VISIBILITY },
			{ key: "revelacion", label: "Cuándo se revela", kind: "text", hint: "Solo si es revelada" },
		],
	},
	{
		type: "lugar",
		phase: "wiki",
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
		phase: "wiki",
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
		phase: "wiki",
		label: "Objeto",
		plural: "Objetos",
		fields: [{ key: "descripcion", label: "Descripción", kind: "text", required: true }],
	},
	{
		type: "grupo",
		phase: "wiki",
		label: "Grupo",
		plural: "Grupos",
		fields: [{ key: "descripcion", label: "Descripción", kind: "text", required: true }],
	},
	{
		type: "concepto",
		phase: "wiki",
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
