# 3D Print AI — Session Resume

## Quick Resume

```bash
cd C:\Users\mdssc\summerintern\mdssc-master

# Terminal 1: Ollama
ollama serve

# Terminal 2: Stable Diffusion (free T2I, port 8001)
cd sd_service && python main.py

# Terminal 3: Next.js (port 3000)
npm run dev

# Mock mode (no services needed):
LLM_PROVIDER=mock npm run dev
```

## Current State (2026-06-04 18:00)

### Architecture

```
User describes object → /api/prompt/extract (LLM extracts structured spec)
  → /api/prompt/ask (LLM asks 1-3 targeted questions with options)
  → User clicks answers → spec fills → progress advances
  → /api/prompt/craft (9-section prompt package with hardcoded 2D constraints)
  → /api/hunyuan/text-to-image (Hunyuan → SD Turbo → mock)
  → /api/hunyuan/image-to-3d (Hunyuan → mock cube)
  → /api/blender/process (Blender subprocess → mock)
  → STL download
```

### Key Design Decisions

1. **Single-turn LLM calls** — no conversation tracking in LLM. Extract/Ask/Craft are independent calls.
2. **Hardcoded 2D constraints** — positive prompt prefix/suffix injected via post-processing: "single object only, isolated on white background, orthographic view, studio lighting, product photography, 3D-ready"
3. **LLM model: qwen2.5:7b (default)** — best balance of quality and speed for RTX 4060 8GB. Also available: qwen2.5:3b (fast), qwen2.5:14b (best quality, needs SD stopped).
4. **Language**: detectLang on first user message, lock for entire session. CJK 3x weight, 8% threshold.
5. **Frontend-driven state** — spec progress, askedFields tracking, question rendering all in React state.
6. **DesignSpec v2**: meta (inputType, assetType, generationGoal, style) + subject + visual + structure + composition + dimensions + useCase
7. **9-Section Craft Output**: Object Name → Positive Prompt → Negative Prompt → Key Visual Features → Material → Geometric Structure → View → Dimensions → Generation Notes
8. **Thinking model support**: CoT/reasoning blocks from models like qwen3.5 are stripped before section parsing.

### Key Files

| File | Purpose |
|------|---------|
| `src/app/create/page.tsx` | Main UX: input → extract → Q&A → progress → craft → result |
| `src/lib/agents/prompt-helper.ts` | extract(), ask(), craft() — three LLM call functions |
| `src/lib/agents/prompts.ts` | System prompts for extract/ask/craft (craft = 50-line detailed spec) |
| `src/lib/schemas.ts` | DesignSpec v2, ExtractSpec, AskQuestion, fallbacks |
| `src/lib/hunyuan/client.ts` | T2I/I2T3D API with SD fallback + mock (port 8001) |
| `src/lib/llm.ts` | LLM client: reasoning field fix, JSON repair, extractJson, thinking-strip |
| `src/lib/i18n.ts` | Language detection + LangContext |
| `src/lib/storage.ts` | File I/O for uploads/ |
| `src/app/api/prompt/extract/route.ts` | POST: text → spec |
| `src/app/api/prompt/ask/route.ts` | POST: spec → questions |
| `src/app/api/prompt/craft/route.ts` | POST: spec (+ feedback) → 9-section prompt |
| `src/app/api/hunyuan/text-to-image/route.ts` | T2I proxy |
| `src/app/api/hunyuan/image-to-3d/route.ts` | I2T3D proxy |
| `prisma/schema.prisma` | 10 models (SQLite) |

### Three-Layer Fallback

| Layer | T2I | I2T3D | Blender |
|-------|-----|-------|---------|
| Production | Hunyuan API | Hunyuan API | Local Blender |
| Dev | SD Turbo (CUDA) | Mock cube GLB | Mock processing |
| Mock | Colored PNG | Mock cube GLB | Mock STL |

### Available Models

| Model | Size | Speed | Quality | Notes |
|-------|------|-------|---------|-------|
| qwen2.5:3b | 1.9 GB | ~2s | Poor | Only use for quick tests |
| qwen3.5:4b | 3.4 GB | — | — | Thinking model, not suitable for prompt gen |
| **qwen2.5:7b** | **4.7 GB** | **~8s** | **Good** | **Default — best balance** |
| qwen2.5:14b | 9.0 GB | ~20s | Best | Stop SD first to free VRAM |

### Environment (.env)

```bash
LLM_PROVIDER=local
LOCAL_LLM_MODEL=qwen2.5:7b                    # ← Updated from qwen2.5:3b
HUNYUAN_BASE_URL=http://localhost:8080/v1      # Update when deployed
HUNYUAN_API_KEY=your-key
SD_SERVICE_URL=http://127.0.0.1:8001
BLENDER_PATH=blender
```

### Common Tasks

```bash
npm run build          # TypeScript check + build
npx prisma generate    # After schema changes
npx prisma db push     # Sync SQLite
npm run dev            # Start dev server

# Model management
ollama list            # Check installed models
ollama pull qwen2.5:7b # Install recommended model
```

### Today's Fixes (Phase 7)

See `2026-06-04-開發日誌.md` for full details. Summary:
1. CRAFT system prompt rewritten (1 line → 50 lines with 9-section spec)
2. Regex post-processing now matches by header text, not position
3. Feedback parameter now passes through to LLM
4. Mock mode outputs proper 9-section format
5. ask() uses callLLMStructured with auto-retry
6. Extract booleans (hasHoles, isHollow, etc.) no longer hardcoded
7. styleNotes saves 2000 chars (was 200)
8. Thinking model CoT stripping support
