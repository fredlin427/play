# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
ollama serve                              # Terminal 1: local LLM (qwen2.5:7b)
cd sd_service && python main.py          # Terminal 2: Z-Image-Turbo (port 8001)
npm run dev                               # Terminal 3: Next.js (port 3000)
# Mock mode (no services needed): LLM_PROVIDER=mock npm run dev
```

## Architecture

**Multi-turn Q&A → Template assembly → LLM polish → Image generation.**
1. User describes object → `extract` (LLM parses structured spec)
2. Multi-round adaptive Q&A (LLM-driven, template fallback) fills missing fields
3. Template assembles base prompt → LLM polishes to natural paragraph
4. Z-Image-Turbo generates images (1 View or 4 Views: front/back/left/right)

### Key Design Decisions

1. **No Hunyuan — Z-Image-Turbo only.** `src/lib/hunyuan/client.ts` stripped of all Hunyuan code. `textToImage()` calls local SD service directly on port 8001. No API timeout delays.

2. **LLM polish for both prompts.** `POST /api/prompt/craft` generates polished positive AND negative prompts via LLM. Negative prompt is object-specific (wrong materials, wrong colors, structural errors). Template output is kept as fallback.

3. **Multi-view generation.** `POST /api/hunyuan/text-to-image` with `multiView:true` generates 4 images: front/back/left/right orthographic views. Each view has independent prompt + negative prompt. Directional words stripped from base prompt before view suffix applied.

4. **Adaptive Q&A.** LLM decides question depth (banana ~4 questions, cabinet ~10). Hard-filter validates LLM field names against allowed list. Template fallback if LLM returns invalid. Only trusts "done" with 3+ filled fields.

5. **All input modes functional.** Text/Sketch/Image/3D File modes all feed into the extract pipeline with contextual prefixes. Start button enabled when files are present even without text.

### API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/prompt/extract` | Parse user text → DesignSpec |
| `POST /api/prompt/ask` | Multi-round Q&A with coverage tracking |
| `POST /api/prompt/craft` | Template assembly + LLM polish → positive + negative prompt |
| `POST /api/hunyuan/text-to-image` | Z-Image-Turbo T2I (single or 4-view) |
| `POST /api/hunyuan/image-to-3d` | Mock 3D (no local 3D service yet) |
| `POST /api/blender/process` | Blender subprocess (headless Python script) |
| `GET /api/blender/status/[jobId]` | Poll Blender job progress |
| `GET /api/files/[...path]` | Serve generated assets from `uploads/` |
| `POST /api/upload/image` / `model` | Reference file upload |
| `GET/POST /api/projects` | Project CRUD |

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/agents/prompt-helper.ts` | `extract()` / `ask()` / `craft()` — core Q&A + prompt logic |
| `src/lib/agents/prompt-template.ts` | Template Q&A questions, `buildSDPrompt()`, `getNextQuestion()` fallback |
| `src/lib/agents/prompts.ts` | System prompts (EXTRACT/ASK/CRAFT, zh + en) |
| `src/lib/agents/field-tiers.ts` | Field priority definitions (REQUIRED/IMPORTANT/OPTIONAL) |
| `src/lib/agents/coverage.ts` | Coverage tracking, `shouldTerminate` logic |
| `src/lib/agents/question-banks.ts` | Per-asset-type question templates |
| `src/lib/hunyuan/client.ts` | T2I client — Z-Image-Turbo only, mock fallback |
| `src/lib/hunyuan/types.ts` | Clean request/response types (no Hunyuan config) |
| `src/lib/llm.ts` | OpenAI-compatible LLM client, `extractJson()` handles thinking models |
| `src/lib/i18n.ts` | Language detection: CJK ×3 weight, 8% threshold |
| `src/app/create/page.tsx` | Main UX — multi-mode input, Q&A, spec editor, prompt display, image gen |
| `src/app/api/prompt/craft/route.ts` | Polish step: template → LLM positive + LLM negative |
| `src/app/api/hunyuan/text-to-image/route.ts` | Multi-view T2I: 4 orthographic views with per-view prompts |
| `prisma/schema.prisma` | SQLite: Project, Message, PromptVersion, GeneratedImage, GeneratedModel, BlenderJob, DesignVersion, ReferenceImage, ReferenceModel |
| `sd_service/main.py` | Z-Image-Turbo FastAPI service (CUDA, port 8001) |
| `blender_scripts/auto_process.py` | Blender headless: import → mesh repair → printability → STL |

### Models

| Model | Speed | Notes |
|-------|-------|-------|
| `qwen2.5:7b` | ~3-5s/response | Default — Q&A, extract, craft, polish |
| `qwen2.5:3b` | ~2s | Lighter fallback |
| `qwen2.5:14b` | ~30s | Better quality (needs 10GB+ VRAM) |
| Z-Image-Turbo Q6 GGUF | ~50s/image | 5.3GB model, flow-matching CFG=1.0, 8 steps |

### Language

- `detectLang()` on full conversation history. Once `zh` detected, stays `zh`.
- Every page has `<LangProvider>` with toggle button.
- All LLM prompts: separate zh/en versions. zh = 繁體中文.
- Chinese in, Chinese out. English in, English out.

### Q&A Field Validation

- Valid fields: `material, color, dimensions, shape, surface, edges, components, style, features`
- LLM returns `{ action: "ask"|"done", field, question, options }`
- Invalid field → template fallback
- "done" only trusted with 3+ filled fields

### Multi-View Generation

- 4 views: front/back/left/right orthographic
- Base prompt cleaned of directional words (`front-facing`, `centered`, `facing camera`)
- Each view: independent prompt + negative prompt
- Sequential generation (VRAM constraint)
