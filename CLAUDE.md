# CLAUDE.md

3D Print AI — user describes an idea → AI prompt crafting → 2D images (SD Turbo) → 3D model (Hunyuan) → Blender → STL.

## Commands

```bash
npm run dev          # Next.js dev server (port 3000)
npm run build        # TypeScript check + production build
npx prisma generate  # Regenerate Prisma client after schema changes
npx prisma db push   # Sync SQLite schema

# Services (run separately):
ollama serve                           # Local LLM (port 11434)
cd sd_service && python main.py        # Local SD Turbo T2I (port 8001)

# Mock mode (zero dependencies — everything works with fake data):
LLM_PROVIDER=mock npm run dev
```

## Architecture: Hunyuan Integration

The entire codebase is ready for Hunyuan. **Only update `.env`** with your deployed URLs.

### Your Hunyuan API should handle two endpoints:

**Text-to-Image** (`HUNYUAN_T2I_ENDPOINT`):
```
POST {baseUrl}/text-to-image
Body: { prompt, negative_prompt, width, height, num_images }
Response: { images: [{ url, width, height }], status: "completed" }
```

**Image-to-3D** (`HUNYUAN_I2T3D_ENDPOINT`):
```
POST {baseUrl}/image-to-3d
Body: { image_url, format: "glb"|"obj" }
Response: { modelUrl, format, fileSize, status: "completed" }
```

### Integration code locations:
- **API client:** `src/lib/hunyuan/client.ts` — `textToImage()` + `imageTo3D()`
  - Has fallback chain: Hunyuan → local SD (T2I) / mock GLB (I2T3D) → pure mock
  - To skip SD: set `SD_SERVICE_ENABLED=false` in `.env`
- **API types:** `src/lib/hunyuan/types.ts` — request/response interfaces + config
- **Proxy routes:**
  - `src/app/api/hunyuan/text-to-image/route.ts`
  - `src/app/api/hunyuan/image-to-3d/route.ts`

### I2T3D image URL format
When your endpoint receives `image_url`, it will be `http://localhost:3000/api/files/images/sd_xxx.png`. The file is also on disk at `uploads/images/sd_xxx.png`.

## Key Files

| File | What it does |
|------|-------------|
| `src/app/create/page.tsx` | Frontend-driven Q&A flow (5 question templates, clickable options) |
| `src/lib/agents/prompt-helper.ts` | `analyze()` + `craft()` — two LLM calls |
| `src/lib/agents/prompts.ts` | Bilingual system prompts |
| `src/lib/llm.ts` | LLM client: OpenAI-compatible, JSON repair, Zod validation, reasoning field fix |
| `src/lib/i18n.ts` | Language detection: CJK 3x weight, 8% threshold |
| `src/lib/hunyuan/client.ts` | Hunyuan API client + SD fallback + mock fallback |
| `src/lib/blender/client.ts` | Blender subprocess manager |
| `prisma/schema.prisma` | 10 models: Project, Message, PromptVersion, GeneratedImage, GeneratedModel, etc. |
| `blender_scripts/auto_process.py` | Blender headless: import → mesh repair → printability → STL |

## Database

SQLite via Prisma 7 with adapter (`@prisma/adapter-better-sqlite3`). Config in `prisma.config.ts`.

Key models for Hunyuan integration:
- `GeneratedImage` — 2D images from T2I (promptVersionId, imageUrl, isApproved)
- `GeneratedModel` — 3D models from I2T3D (sourceImageId, modelUrl, modelFormat)
- `BlenderJob` — processing status (sourceModelId, outputStlUrl, checks)

## Prompt Helper Flow (Frontend-Driven)

The `/create` page handles question flow with pre-defined templates. LLM only does:
1. `analyze()` — understand description, return `{understood, object, fieldsComplete: {style, material, view, dimensions, features}}`
2. `craft()` — synthesize collected answers into final prompt

This prevents LLM conversation loops. Works reliably with small local models (~3B params).

## Language

- Bilingual zh/en throughout. `detectLang()` on full conversation history.
- CJK chars weighted 3x, threshold 8%. Once zh, always zh.
- `<LangProvider>` context on every page with toggle button.

## Available Models

| Model | Speed | Use case |
|-------|-------|----------|
| `qwen2.5:3b` | ~4s/call | Fast dev |
| `qwen3.5:4b` | ~16s/call | Default (thinking) |
| `qwen2.5:14b` | ~50s/call | Production quality |
