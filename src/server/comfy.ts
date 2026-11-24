import { config } from "./config.ts";

// Renders a screen mockup with Ming-Image 0.1 Design on the author's local ComfyUI.
// The prompt is the model's Figma-style JSON (canvas_settings + layers). Returns the full
// image and a smaller preview, both PNG, read back through ComfyUI's /view endpoint.

export const MOCKUP_SIZES: Record<string, [number, number]> = {
	"16:9": [2048, 1152],
	"9:16": [1152, 2048],
	"4:3": [1792, 1344],
	"1:1": [1536, 1536],
};

const PREVIEW_WIDTH = 1024;

function graph(prompt: string, width: number, height: number, seed: number) {
	const preview = [PREVIEW_WIDTH, Math.round((PREVIEW_WIDTH * height) / width / 16) * 16];
	return {
		unet: { class_type: "UNETLoader", inputs: { unet_name: config.mockupUnet, weight_dtype: "default" } },
		attention: { class_type: "ModelAttentionBackend", inputs: { model: ["unet", 0], attention: "comfy kitchen attention" } },
		shift: { class_type: "ModelSamplingFlux", inputs: { model: ["attention", 0], max_shift: 1.15, base_shift: 0.5, width, height } },
		clip: { class_type: "CLIPLoader", inputs: { clip_name: config.mockupClip, type: "qwen_image", device: "default" } },
		text: { class_type: "CLIPTextEncode", inputs: { clip: ["clip", 0], text: prompt } },
		guider: { class_type: "BasicGuider", inputs: { model: ["shift", 0], conditioning: ["text", 0] } },
		noise: { class_type: "RandomNoise", inputs: { noise_seed: seed } },
		sampler: { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
		sigmas: { class_type: "BasicScheduler", inputs: { model: ["shift", 0], scheduler: "simple", steps: 12, denoise: 1.0 } },
		latent: { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
		sample: {
			class_type: "SamplerCustomAdvanced",
			inputs: { noise: ["noise", 0], guider: ["guider", 0], sampler: ["sampler", 0], sigmas: ["sigmas", 0], latent_image: ["latent", 0] },
		},
		vae: { class_type: "VAELoader", inputs: { vae_name: config.mockupVae } },
		decode: { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["vae", 0] } },
		full: { class_type: "SaveImage", inputs: { images: ["decode", 0], filename_prefix: "narrative-harness/mockup" } },
		small: { class_type: "ImageScale", inputs: { image: ["decode", 0], upscale_method: "lanczos", width: preview[0], height: preview[1], crop: "disabled" } },
		preview: { class_type: "SaveImage", inputs: { images: ["small", 0], filename_prefix: "narrative-harness/preview" } },
	};
}

async function comfy(path: string, init?: RequestInit): Promise<Response> {
	try {
		const res = await fetch(`${config.comfyUrl}${path}`, init);
		if (!res.ok) throw new Error(`ComfyUI respondió ${res.status}: ${(await res.text()).slice(0, 500)}`);
		return res;
	} catch (e) {
		if ((e as Error).message.startsWith("ComfyUI")) throw e;
		throw new Error(`ComfyUI no responde en ${config.comfyUrl}: ¿está en marcha?`);
	}
}

export async function renderMockup(prompt: string, size: string, seed: number): Promise<{ image: Buffer; preview: Buffer }> {
	const [width, height] = MOCKUP_SIZES[size] ?? MOCKUP_SIZES["16:9"];
	const body = JSON.stringify({ prompt: graph(prompt, width, height, seed) });
	const { prompt_id: id } = await (await comfy("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body })).json();

	const deadline = Date.now() + 15 * 60_000;
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 2000));
		const entry = (await (await comfy(`/history/${id}`)).json())[id];
		if (!entry) continue;
		if (entry.status?.status_str === "error") {
			const error = entry.status.messages?.find((m: [string, unknown]) => m[0] === "execution_error")?.[1];
			throw new Error(`ComfyUI falló: ${error?.exception_message ?? "error desconocido"}`);
		}
		const file = async (node: string) => {
			const img = entry.outputs[node].images[0];
			const query = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
			return Buffer.from(await (await comfy(`/view?${query}`)).arrayBuffer());
		};
		return { image: await file("full"), preview: await file("preview") };
	}
	throw new Error("ComfyUI tardó más de 15 minutos en generar el mockup");
}
