# Narrative Harness

Herramienta web para diseñar juegos narrativos junto a un agente ([pi](https://github.com/earendil-works/pi)). El diseño de cada juego vive en una wiki: páginas con ficha estructurada para el agente y prosa legible para personas. El harness no desarrolla el juego; produce el diseño y el contenido para implementarlo en cualquier motor.

Estado: fases 1–4 (concepto, wiki inicial, mecánicas, UX) — pantallas con mockups generados en ComfyUI, nivel de participación del agente (guardián, colaborador, coautor), wiki con ficha y prosa, plan de fundamentos, verificador, registro de estado con lenguaje de condiciones y efectos, agente con herramientas de wiki y web con chat.

## Requisitos

- Node 22.19 o superior, git.
- Para los mockups de UX: ComfyUI con los modelos de Ming-Image 0.1 Design (opcional; sin él, todo lo demás funciona).
- Una credencial de pi para el proveedor del modelo. Por defecto `anthropic/claude-opus-5-5`: ejecuta `pi`, luego `/login` y elige Anthropic, o exporta `ANTHROPIC_API_KEY`. El harness usa las credenciales guardadas por pi (`~/.pi/agent/auth.json`).

## Uso

```bash
npm install
npm run build
npm start
```

Abre http://127.0.0.1:8810.

Configuración por variables de entorno o `config.json` en la raíz (no se versiona):

| Clave | Por defecto | |
|---|---|---|
| `HOST` | `127.0.0.1` | `0.0.0.0` lo abre a la red local, sin autenticación |
| `PORT` | `8810` | |
| `PROJECTS_DIR` | `./projects` | |
| `MODEL` | `anthropic/claude-opus-5-5` | `proveedor/modelo` como los nombra pi |
| `THINKING` | `medium` | `off`, `low`, `medium`, `high` |
| `COMFY_URL` | `http://127.0.0.1:8188` | ComfyUI local para los mockups de pantallas |
| `MOCKUP_UNET`, `MOCKUP_CLIP`, `MOCKUP_VAE` | `ming/ming_image_0.1_design_int8_convrot.safetensors`, `ming/ming_image_0.1_ling_mini_2.0_int8_convrot.safetensors`, `ming/ming_image_vae_bf16.safetensors` | Archivos de [Ming-Image 0.1 Design](https://huggingface.co/Comfy-Org/Ming-Image) en las carpetas de modelos de ComfyUI |

Desarrollo: `npm run dev:server` y `npm run dev:web` (Vite en el puerto 5173 con proxy a la API).

## Proyecto

```
projects/<proyecto>/
  project.yaml
  wiki/portada.md
  wiki/<tipo>/<nombre>.md     # ficha YAML + prosa Markdown
  media/<tipo>/<nombre>/      # mockups de la página (PNG + JSON con su prompt)
  .harness/sessions/          # conversación con el agente (no versionada)
```

Cada proyecto es un repositorio git: cada turno del agente y cada aprobación del autor es un commit.
