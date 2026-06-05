# 3D Print AI — Session Resume

## Quick Resume

```bash
cd C:\Users\mdssc\summerintern\mdssc-master

# Terminal 1: Ollama (qwen2.5:7b)
ollama serve

# Terminal 2: Z-Image-Turbo (port 8001)
cd sd_service && python main.py

# Terminal 3: Next.js (port 3000)
npm run dev

# Mock mode (no services needed):
LLM_PROVIDER=mock npm run dev
```

## Current State (2026-06-05)

### Architecture

```
User input (text/sketch/image/model) → /api/prompt/extract (LLM → DesignSpec)
  → /api/prompt/ask (LLM-driven adaptive Q&A, single question per round)
  → Template assembles base prompt → LLM polish (positive + negative)
  → /api/hunyuan/text-to-image (Z-Image-Turbo only, no Hunyuan)
    → 1 View or 4 Views (front/back/left/right orthographic)
  → /api/hunyuan/image-to-3d (mock cube)
  → /api/blender/process (mock)
  → STL download
```

### Key Design Decisions

1. **Z-Image-Turbo only** — all Hunyuan API code removed. `textToImage()` → local SD directly. No timeout delays.
2. **Multi-view generation** — `multiView:true` generates 4 images (front/back/left/right). Each view has independent prompt + negative. Directional words stripped from base prompt before view suffix applied.
3. **LLM polish for BOTH prompts** — positive AND negative prompts get LLM polish. Negative is object-specific (wrong materials, colors, structural errors).
4. **Template + LLM hybrid Q&A** — LLM decides question → hard-filter validates field name → template fallback if invalid. Only trusts "done" with 3+ filled fields.
5. **All 4 input modes functional** — Sketch exports dataUrl, Image/Model uploads feed context into extract pipeline. Start button works with files only.
6. **Language**: 繁體中文 for zh, English for en. All system prompts separated.
7. **DesignSpec v2**: meta + subject + visual + structure + composition + dimensions + useCase

### Key Files

| File | Purpose |
|------|---------|
| `src/app/create/page.tsx` | Main UX: 4 input modes → Q&A → spec editor → prompt display → image gen |
| `src/lib/agents/prompt-helper.ts` | `extract()` / `ask()` / `craft()` — three core functions |
| `src/lib/agents/prompt-template.ts` | Template Q&A, `buildSDPrompt()`, `getNextQuestion()` fallback |
| `src/lib/agents/prompts.ts` | System prompts: EXTRACT/ASK/CRAFT (zh + en, 繁體中文) |
| `src/lib/agents/field-tiers.ts` | Field priorities: REQUIRED/IMPORTANT/OPTIONAL, termination thresholds |
| `src/lib/agents/coverage.ts` | Coverage tracking, `shouldTerminate` |
| `src/lib/agents/question-banks.ts` | Per-asset-type question templates |
| `src/lib/hunyuan/client.ts` | Z-Image-Turbo T2I client (no Hunyuan), mock fallback |
| `src/lib/hunyuan/types.ts` | Clean request/response types |
| `src/lib/llm.ts` | LLM client: OpenAI-compatible, `extractJson()`, thinking-strip |
| `src/lib/i18n.ts` | Language detection + LangContext |
| `src/lib/storage.ts` | File I/O for uploads/ |
| `src/app/api/prompt/extract/route.ts` | POST: text → DesignSpec |
| `src/app/api/prompt/ask/route.ts` | POST: spec + context → next question |
| `src/app/api/prompt/craft/route.ts` | POST: spec → LLM polish positive + negative |
| `src/app/api/hunyuan/text-to-image/route.ts` | T2I: single or 4-view orthographic |
| `src/app/api/hunyuan/image-to-3d/route.ts` | I2T3D: mock cube |
| `prisma/schema.prisma` | SQLite: 10 models |
| `sd_service/main.py` | Z-Image-Turbo FastAPI (CUDA, port 8001) |
| `.claude/skills/end-of-day.md` | End-of-day routine |

### Available Models

| Model | Size | Speed | Notes |
|-------|------|-------|-------|
| **qwen2.5:7b** | 4.7 GB | ~3-5s | **Default** — Q&A, extract, craft, polish |
| qwen2.5:3b | 1.9 GB | ~2s | Light fallback |
| qwen2.5:14b | 9.0 GB | ~30s | Best quality (stop SD first) |
| Z-Image-Turbo Q6 GGUF | 5.3 GB | ~50s/img | Flow-matching CFG=1.0, 8 steps |

### Q&A Field Validation

- Valid fields: `material, color, dimensions, shape, surface, edges, components, style, features`
- LLM must return valid field name → hard-filter rejects invalid → template fallback
- "done" only trusted with 3+ filled fields

### Environment (.env)

```bash
LLM_PROVIDER=local
LOCAL_LLM_MODEL=qwen2.5:7b
SD_SERVICE_URL=http://127.0.0.1:8001
SD_SERVICE_ENABLED=true
BLENDER_PATH=blender
```
