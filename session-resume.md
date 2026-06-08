# 3D Print AI — Session Resume

## Quick Resume
```bash
ollama serve                                    # Terminal 1
cd sd_service && python main.py                 # Terminal 2 (Z-Image-Turbo, port 8001)
npm run dev                                     # Terminal 3 (Next.js, port 3000)
```

## Architecture
```
User Input → extract (LLM parse) → Multi-round Q&A (bank + AI material rec)
  → craft (streaming LLM polish) → Z-Image-Turbo (1024px, config steps)
  → Vision feedback (llava:7b, auto-resize) → Annotation modify
```

## Key Design Decisions
- **Material AI-recommended at END** — never in Q&A (removed from VALID_FIELDS)
- **Question bank REPLACES LLM** when filledCount >= 3
- **Craft iterate/annotation uses MODIFY mode** — preserves original elements
- **Z-Image-Turbo uses Qwen3-4B (512 tokens)** — no front-load restriction
- **Images resized with sharp** before vision (512px JPEG)
- **One-at-a-time generation** for real progress + abort button
- **UI: warm copper theme** (#C4823B / #FDF8F3)
- **UI chrome uses toggleLang**, conversation uses cl

## Q&A Settings
- VALID_FIELDS: color, dimensions, shape, surface, edge, components, style, details, use, view, environment
- Material EXCLUDED — AI recommended at end
- Bank trigger: filledCount >= 3
- Hard minimum: 6 questions
- All dimensions: axbxc format

## Key Files
| File | Purpose |
|------|---------|
| `src/lib/agents/prompt-helper.ts` | extract / ask / fieldMentioned |
| `src/lib/agents/prompt-craft.ts` | buildModifyPrompt / validatePolish |
| `src/lib/agents/question-banks.ts` | 8 asset-type banks (axbxc dims) |
| `src/lib/agents/vision-feedback.ts` | analyzeGeneratedImage (sharp resize) |
| `src/lib/llm.ts` | callLLM / callLLMStream / callVisionLLM |
| `src/app/create/page.tsx` | Main creation flow |
| `src/app/dashboard/page.tsx` | Projects list (batch select/delete) |
| `src/app/projects/[id]/page.tsx` | Image gallery + download |
| `src/app/api/prompt/craft/stream/route.ts` | Streaming craft (modify mode) |
| `src/app/api/prompt/recommend-material/route.ts` | Material recommendation (no PLA bias) |

## Models
| Model | Purpose |
|-------|---------|
| qwen2.5:7b | Q&A, extract, craft |
| Z-Image-Turbo Q6 | Image gen (1024px, 8-30 steps) |
| llava:7b | Vision analysis |
