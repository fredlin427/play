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

## Current State (2026-06-05 EOD)

### Architecture

```
User input (text/sketch/image/model) → /api/prompt/extract (LLM → DesignSpec)
  → /api/prompt/ask (LLM-driven adaptive Q&A, rich prompts from prompts.ts)
  → Template assembles base → LLM polish (positive + negative, object-specific)
  → /api/prompt/craft/stream (SSE streaming, token-by-token, saves to DB)
  → /api/hunyuan/text-to-image (Z-Image-Turbo, 1 View or 4 Views)
    → 4 Views: short polished base (~120 chars) + natural view language + strong negatives
  → localStorage auto-save (refresh-safe)
  → /api/hunyuan/image-to-3d (mock cube)
```

### Key Design Decisions

1. **Z-Image-Turbo only** — all Hunyuan code removed. `textToImage()` → local SD directly.
2. **Streaming craft** — SSE endpoint, prompt appears token-by-token in frontend.
3. **QA persistence** — localStorage auto-save/restore. Refresh-safe.
4. **SD async subprocess** — `asyncio.create_subprocess_exec()` with timeout-safe kill.
5. **Multi-view**: Short base (~120 chars of LLM polish) + natural view language + per-view negatives with "multiple objects, two, duplicate, clone".
6. **UI**: Warm amber/rose gradient palette, backdrop blur, rounded-2xl, animated transitions.
7. **Field keys unified**: `edge` (not `edges`), `details` (not `features`).
8. **All dead code removed**: `craft()` function, CRAFT prompts, Hunyuan fallback chain.
9. **Mock mode fixed**: `mockAsk`, `mockCraftPositive`, `mockCraftNegative` dispatchers.

### Key Files

| File | Purpose |
|------|---------|
| `src/app/create/page.tsx` | Main UX — warm UI, streaming craft, 4 input modes, Q&A, localStorage |
| `src/lib/agents/prompt-helper.ts` | `extract()` / `ask()` — uses `getPrompt("ask", lang)` from prompts.ts |
| `src/lib/agents/prompt-template.ts` | Template Q&A, `buildSDPrompt()`, field mapping |
| `src/lib/agents/prompts.ts` | EXTRACT + ASK prompts (zh/en), CRAFT removed (dead code) |
| `src/lib/agents/coverage.ts` | Coverage tracking, `shouldTerminate` |
| `src/lib/agents/field-tiers.ts` | Field priorities + termination thresholds |
| `src/lib/hunyuan/client.ts` | Z-Image-Turbo T2I client (cleaned, no Hunyuan) |
| `src/lib/llm.ts` | LLM client + `callLLMStream()` async generator + mock dispatchers |
| `src/app/api/prompt/craft/route.ts` | Non-streaming craft (used by feedback/iterate) |
| `src/app/api/prompt/craft/stream/route.ts` | Streaming craft — SSE + DB save |
| `src/app/api/hunyuan/text-to-image/route.ts` | Multi-view: short base + natural view language |
| `sd_service/main.py` | Z-Image-Turbo FastAPI — async subprocess |
| `.claude/skills/end-of-day.md` | End-of-day routine |

### Environment (.env)

```bash
LLM_PROVIDER=local
LOCAL_LLM_MODEL=qwen2.5:7b
SD_SERVICE_URL=http://127.0.0.1:8001
SD_SERVICE_ENABLED=true
BLENDER_PATH=blender
```

### Models

| Model | Size | Speed | Notes |
|-------|------|-------|-------|
| **qwen2.5:7b** | 4.7 GB | ~3-5s | Default — Q&A, extract, craft, polish |
| Z-Image-Turbo Q6 GGUF | 5.3 GB | ~50s/img | Flow-matching CFG=1.0, 8 steps |
