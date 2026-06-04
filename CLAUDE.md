# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
ollama serve                              # Terminal 1: local LLM
cd sd_service && python main.py          # Terminal 2: SD Turbo T2I (port 8001)
npm install && npx prisma generate && npx prisma db push
npm run dev                               # Terminal 3: Next.js (port 3000)
# Mock mode (no services needed): LLM_PROVIDER=mock npm run dev
```

## Architecture

**Single-turn prompt generation.** The user describes their object in detail → LLM generates a 9-section prompt package. No multi-turn Q&A — the 3B model cannot reliably maintain conversation state.

### Key Design Decisions

1. **Hardcoded 2D constraints (non-negotiable).** `src/lib/agents/prompt-helper.ts` injects prefix/suffix into every positive prompt: single object, white background, orthographic view, studio lighting, product photography, 3D-ready. These are code-enforced via post-processing — the LLM cannot override them.

2. **Single LLM call per generation.** `POST /api/prompt/craft` takes a description string, returns full 9-section markdown. User iterates by sending feedback as a new description. No conversation tracking in the LLM.

3. **Hunyuan client with fallback chain.** `src/lib/hunyuan/client.ts`: Hunyuan API → local SD Turbo (port 8001) → mock PNG/GLB. SD fallback reads images directly from shared `uploads/` directory.

4. **Backend-deployed Hunyuan.** Your backend teammate deploys the T2I and I2T3D APIs. Update `.env` with `HUNYUAN_BASE_URL` and `HUNYUAN_API_KEY`. The client handles auth, timeout, download, and caching.

### API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/prompt/craft` | Single-turn: description → 9-section prompt |
| `POST /api/hunyuan/text-to-image` | T2I proxy (Hunyuan → SD → mock) |
| `POST /api/hunyuan/image-to-3d` | I2T3D proxy (Hunyuan → mock cube) |
| `POST /api/blender/process` | Blender subprocess (headless Python script) |
| `GET /api/blender/status/[jobId]` | Poll Blender job progress |
| `GET /api/files/[...path]` | Serve generated assets from `uploads/` |
| `POST /api/upload/image` / `model` | Reference file upload |
| `GET/POST /api/projects` | Project CRUD |

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/agents/prompt-helper.ts` | `craft()` function + hardcoded prefix/suffix post-processing |
| `src/lib/agents/prompts.ts` | System prompt template with enforced 2D constraints |
| `src/lib/hunyuan/client.ts` | T2I/I2T3D API client with SD fallback + mock fallback |
| `src/lib/llm.ts` | OpenAI-compatible LLM client, `extractJson()` handles thinking models |
| `src/lib/i18n.ts` | Language detection: CJK ×3 weight, 8% threshold, full-conversation history |
| `src/lib/storage.ts` | File save/load under `uploads/` |
| `src/app/create/page.tsx` | Main UX: textarea → generate → 9-section result + iterate |
| `prisma/schema.prisma` | SQLite: Project, Message, PromptVersion, GeneratedImage, GeneratedModel, BlenderJob, DesignVersion, ReferenceImage, ReferenceModel |
| `sd_service/main.py` | SD Turbo FastAPI service (CUDA, port 8001) |
| `blender_scripts/auto_process.py` | Blender headless: import → mesh repair → printability → STL |

### Hunyuan API Contract (for backend teammate)

```
POST {baseUrl}/text-to-image
Body: { prompt, negative_prompt, width:1024, height:1024, num_images:4 }
Response: { images: [{ url, width, height }], status: "completed" }

POST {baseUrl}/image-to-3d
Body: { image_url, format: "glb" }
Response: { modelUrl, format, fileSize, status: "completed" }
```

### Models

| Model | Speed | Notes |
|-------|-------|-------|
| `qwen2.5:3b` | ~8s/craft | Default — fast, reliable |
| `qwen2.5:14b` | ~50s | Better quality (needs 10GB+ VRAM) |

### Language

- `detectLang()` on full conversation history. Once `zh` detected, stays `zh`.
- Every page has `<LangProvider>` with toggle button.
- System prompt instructs LLM to match user's language.
