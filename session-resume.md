# 3D Print AI — Session Resume

## Quick Start
```bash
# Terminal 1: Ollama (set env vars before starting)
$env:OLLAMA_KEEP_ALIVE = "-1"
$env:OLLAMA_FLASH_ATTENTION = "1"
ollama serve

# Terminal 2: SD Service (set ZIMAGE_DIR first)
$env:ZIMAGE_DIR = "C:\Users\mdssc\Downloads\Z-Image-Turbo-Windows-main\Z-Image-Turbo-Windows-main"
cd sd_service && python main.py

# Terminal 3: Next.js
npm run dev
```

## Architecture
```
User Input → extract (LLM classify 30+ keywords) → Multi-round Q&A (dynamic LLM + bank supplement)
  → craft (compact LLM, 1-3s) → Z-Image-Turbo (512px default, 8 steps)
  → Vision feedback (qwen2.5vl:7b) → Annotation modify
  → Star system (saved prompts → future few-shot)
```

## Models
| Model | Size | Purpose |
|-------|------|---------|
| qwen2.5:7b | 4.7GB | Q&A, extract, craft |
| qwen2.5vl:7b | 6.0GB | Vision: sketch analysis, annotation analysis |
| Z-Image-Turbo Q6 | 5.3GB | Image gen (512-1024px, 8-30 steps) |

## Key Design Decisions (v3)
- **Q&A: LLM-primary, bank-supplement** — bank never replaces LLM, only fills gaps
- **Craft: single-pass, no validation loop** — compact prompt, template fallback
- **assetType: 30+ keyword matching per type** — extract prompt has extensive hints
- **Material: AI-recommended at END** — never asked during Q&A
- **Star system: user saves good prompts → used as few-shot** — self-improving
- **SSE: shared via readSSEStream()** — craft & iterate use same parser
- **Ollama: keep-alive + flash attention** — model stays in VRAM, faster inference
- **SD Service: paths via env vars** — ZIMAGE_DIR or individual SD_*_PATH
- **UI: warm copper theme** (#C4823B / #FDF8F3)

## Q&A Flow
1. Extract → classify assetType (medical/robot/furniture/jewelry/character/product)
2. Each round: LLM generates 3-4 type-specific questions
3. Bank supplements only when LLM gives < 3 valid questions
4. After 6+ rounds & 8+ fields → material recommendation (scene-based)
5. Max rounds: medical 12, product 10, furniture 11

## Key Files
| File | Purpose |
|------|---------|
| `src/lib/agents/prompt-helper.ts` | extract / ask (refactored, bank supplement only) |
| `src/lib/agents/prompt-craft.ts` | buildJointPrompt (compact), few-shot, starred support |
| `src/lib/agents/prompts.ts` | extract (30+ keywords) & ask prompts (3-4 Q/round) |
| `src/lib/agents/question-banks.ts` | 8 type-specific banks, getMaxRounds |
| `src/lib/agents/coverage.ts` | Coverage tracking, shouldTerminate |
| `src/lib/llm.ts` | callLLM/callLLMStructured/callVisionLLM + LRU cache |
| `src/lib/stream-utils.ts` | Shared SSE stream parser |
| `src/lib/spec-utils.ts` | getField/setField/ALL_FIELDS/isRedundantOpt |
| `src/hooks/use-session.ts` | localStorage persistence hook |
| `src/components/shared/ErrorBoundary.tsx` | React error boundary |
| `src/app/create/page.tsx` | Main creation flow (star, annotate, upload fix) |
| `src/app/api/prompt/craft/route.ts` | Non-streaming craft (simplified) |
| `src/app/api/prompt/craft/stream/route.ts` | Streaming craft (modify mode + starred) |
| `src/app/api/prompt/recommend-material/route.ts` | Scene-based material rec + smart fallback |
| `src/app/api/prompt/analyze-sketch/route.ts` | Sketch analysis (notes priority) |
| `src/app/api/prompt/analyze-annotation/route.ts` | Annotation analysis (literal description) |
| `src/app/api/prompt/star/route.ts` | Toggle star on prompt versions |
| `src/app/api/hunyuan/text-to-image/route.ts` | T2I with detailed errors |
| `sd_service/main.py` | Z-Image-Turbo FastAPI (UTF-8, env var paths) |

## Testing
```bash
npm test          # Run all tests (vitest)
npm run test:watch  # Watch mode
```
- 4 test files, 58 tests, 100% pass
- Tests: llm, prompt-craft, question-banks, spec-utils
