# CLAUDE.md

3D Print AI — From Idea to STL. Describe your idea → AI collects structured specs → crafts 9-section prompt → SD Turbo generates 2D images → Hunyuan image-to-3D → Blender → STL.

## Quick Start

```bash
# Terminal 1: Ollama (local LLM)
ollama serve

# Terminal 2: Stable Diffusion (free T2I, port 8001)
cd sd_service && pip install -r requirements.txt && python main.py

# Terminal 3: Next.js
npm install && npx prisma generate && npx prisma db push
npm run dev  # → http://localhost:3000
```

## Architecture

### Structured Spec Collection (DesignSpec JSON)

The system systematically collects 16 fields into a structured `DesignSpec` before crafting:

```typescript
DesignSpec {
  object:     { name, type, description }
  visual:     { style, material, color, texture, finish, edgeTreatment }
  composition: { viewAngle, background, lighting, renderStyle }
  features:   { keyFeatures, hasHoles, hasGrooves, hasMovingParts, isHollow }
  dimensions: { approximateSize }
  useCase:    { primaryUse, environment }
}
```

LLM progressively fills this JSON through Q&A. Craft only triggers when all critical fields are filled.

### API Flow
```
POST /api/prompt/analyze  → LLM fills spec → returns {spec, nextQuestions, readyToCraft}
POST /api/prompt/craft    → LLM generates 9-section prompt package from full spec
POST /api/hunyuan/text-to-image  → Hunyuan → SD Turbo fallback → mock fallback
POST /api/hunyuan/image-to-3d    → Hunyuan → mock fallback
POST /api/blender/process        → Blender subprocess → mock fallback
```

### Key Files
| File | Purpose |
|------|---------|
| `src/app/create/page.tsx` | Main UX: chat + dynamic Q&A + progress bar + 9-section result |
| `src/lib/agents/prompts.ts` | System prompts (analyze + craft) |
| `src/lib/agents/prompt-helper.ts` | `analyze()` fills DesignSpec; `craft()` generates 9-section output |
| `src/lib/schemas.ts` | DesignSpec Zod schema + EMPTY_SPEC + fallbacks |
| `src/lib/hunyuan/client.ts` | Hunyuan API + SD + mock fallback chain |
| `src/lib/llm.ts` | LLM client: OpenAI-compatible, JSON repair, reasoning field fix |
| `src/lib/i18n.ts` | Language: CJK 3x weight, 8% threshold, full-conversation detection |

## Hunyuan API (backend teammate's deployment)

Update `.env`:
```bash
HUNYUAN_BASE_URL=<deployed URL>
HUNYUAN_API_KEY=<key>
```

Endpoints expected:
- `POST {baseUrl}/text-to-image` — `{prompt, negative_prompt, width, height, num_images}` → `{images:[{url,width,height}], status:"completed"}`
- `POST {baseUrl}/image-to-3d` — `{image_url, format:"glb"}` → `{modelUrl, format, fileSize, status:"completed"}`

## Models
| Model | Speed | Use |
|-------|-------|-----|
| `qwen2.5:3b` | ~2s | Default — fast, reliable JSON |
| `qwen2.5:14b` | ~15s | Better quality |

## Language
- CJK detection on full conversation history
- Once Chinese detected, all responses in Chinese
- `<LangProvider>` on every page
