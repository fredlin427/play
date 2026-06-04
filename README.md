# 3D Print AI — From Idea to STL

AI-powered workflow: user describes an idea → AI crafts a text-to-image prompt → generates 2D images (local SD Turbo) → converts to 3D model (Hunyuan API) → Blender post-processing → downloadable STL.

## Quick Start

```bash
# Terminal 1: Ollama (local LLM for prompt crafting)
ollama serve

# Terminal 2: Stable Diffusion (free local text-to-image)
cd sd_service && python main.py          # → http://127.0.0.1:8001

# Terminal 3: Next.js
npm install && npx prisma generate && npx prisma db push
npm run dev                               # → http://localhost:3000
```

Open `http://localhost:3000/create` to start.

## Architecture

```
User describes what they want
  ↓
┌──────────────────────────────────────────────────┐
│ /create page                                     │
│                                                  │
│ Frontend-driven question flow (pre-defined       │
│ templates with clickable options in zh/en).      │
│ LLM only does 2 simple calls: analyze + craft.   │
│                                                  │
│ POST /api/prompt/analyze  →  LLM analyzes user   │
│   description, returns understood +              │
│   fieldsComplete map {style, material, view,     │
│   dimensions, features}                          │
│                                                  │
│ POST /api/prompt/craft    →  LLM synthesizes     │
│   collected answers into final prompt            │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│ POST /api/hunyuan/text-to-image                  │
│                                                  │
│ 1. Try Hunyuan API (backend teammate's deploy)   │
│ 2. Fallback: local SD Turbo (127.0.0.1:8001)    │
│ 3. Fallback: mock PNG (always works)             │
│                                                  │
│ → Saves 4 images to uploads/images/              │
└──────────────┬───────────────────────────────────┘
               │ User reviews & approves one image
               ▼
┌──────────────────────────────────────────────────┐
│ POST /api/hunyuan/image-to-3d                    │
│                                                  │
│ 1. Try Hunyuan API                               │
│ 2. Fallback: mock cube GLB                       │
│                                                  │
│ → Saves model to uploads/models/                 │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│ POST /api/blender/process                        │
│                                                  │
│ 1. Try local Blender (subprocess)                │
│ 2. Fallback: mock processing (always works)      │
│                                                  │
│ GET /api/blender/status/[jobId]  → poll progress │
│                                                  │
│ → Saves STL to uploads/stl/                      │
│ → DesignVersion created in DB                    │
└──────────────────────────────────────────────────┘
```

## Environment Variables (`.env`)

```bash
# ── LLM (Ollama local) ──
LLM_PROVIDER=local                    # "local" or "mock"
LOCAL_LLM_BASE_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=qwen3.5:4b           # Also: qwen2.5:3b (faster), qwen2.5:14b (best)
LOCAL_LLM_API_KEY=ollama

# ── Hunyuan API (YOUR DEPLOYMENT — update these) ──
HUNYUAN_BASE_URL=http://localhost:8080/v1
HUNYUAN_API_KEY=your-hunyuan-api-key
HUNYUAN_T2I_ENDPOINT=/text-to-image
HUNYUAN_I2T3D_ENDPOINT=/image-to-3d
HUNYUAN_TIMEOUT_MS=120000

# ── Local SD (free fallback when Hunyuan unavailable) ──
SD_SERVICE_URL=http://127.0.0.1:8001
SD_SERVICE_ENABLED=true

# ── Blender ──
BLENDER_PATH=blender
BLENDER_TIMEOUT_MS=300000
```

## ⭐ Hunyuan API — Integration Points

**The code is ready. Just deploy your API and update `.env`.**

### Your T2I endpoint should accept:

```http
POST /text-to-image
Authorization: Bearer <key>
Content-Type: application/json

{
  "prompt": "A 3-section adjustable phone stand, minimal style...",
  "negative_prompt": "blurry, dark, shadows...",
  "width": 1024,
  "height": 1024,
  "num_images": 4
}
```

Expected response:
```json
{
  "images": [
    { "url": "https://...", "width": 1024, "height": 1024 }
  ],
  "status": "completed"
}
```

### Your I2T3D endpoint should accept:

```http
POST /image-to-3d
Authorization: Bearer <key>
Content-Type: application/json

{
  "image_url": "http://localhost:3000/api/files/images/sd_xxx.png",
  "format": "glb"
}
```

Expected response:
```json
{
  "modelUrl": "https://...",
  "format": "glb",
  "fileSize": 2048000,
  "status": "completed"
}
```

**Integration code:** `src/lib/hunyuan/client.ts` — handles auth, timeout, download, caching, and hunyuan→SD→mock fallback chain.

**To skip SD fallback:** set `SD_SERVICE_ENABLED=false` in `.env`.

## Project Structure

```
├── sd_service/                     # Local SD Turbo (FastAPI, port 8001)
│   ├── main.py
│   └── requirements.txt
│
├── blender_scripts/
│   └── auto_process.py             # Import → mesh repair → printability → STL
│
├── src/
│   ├── app/
│   │   ├── page.tsx                # Home (generic)
│   │   ├── create/page.tsx         # ⭐ Design consultation (frontend Q&A flow)
│   │   ├── dashboard/page.tsx      # Project dashboard
│   │   ├── projects/[id]/page.tsx  # Workflow: images→3D→Blender→STL
│   │   └── api/
│   │       ├── prompt/
│   │       │   ├── analyze/route.ts # ⭐ Analyze user description (LLM)
│   │       │   └── craft/route.ts   # ⭐ Craft final prompt (LLM)
│   │       ├── hunyuan/
│   │       │   ├── text-to-image/route.ts  # ⭐ Your T2I proxy
│   │       │   └── image-to-3d/route.ts   # ⭐ Your I2T3D proxy
│   │       ├── upload/image/route.ts       # Reference image upload
│   │       ├── upload/model/route.ts       # Reference 3D file upload
│   │       ├── blender/process/route.ts    # Blender subprocess
│   │       ├── blender/status/[jobId]/route.ts
│   │       ├── files/[...path]/route.ts    # Serve generated assets
│   │       └── projects/                   # CRUD
│   │
│   ├── lib/
│   │   ├── hunyuan/client.ts       # ⭐ Hunyuan API client + SD + mock fallback
│   │   ├── hunyuan/types.ts        # API types + config
│   │   ├── blender/client.ts       # Blender subprocess manager
│   │   ├── blender/types.ts        # Blender types
│   │   ├── agents/prompt-helper.ts # ⭐ analyze() + craft()
│   │   ├── agents/prompts.ts       # Bilingual system prompts
│   │   ├── schemas.ts              # Zod schemas + fallbacks
│   │   ├── project-state.ts        # TypeScript interfaces
│   │   ├── llm.ts                  # LLM client (OpenAI-compatible + JSON repair)
│   │   ├── i18n.ts                 # Language detection (CJK 3x weight, 8% threshold)
│   │   ├── lang-context.tsx        # React context for zh/en toggle
│   │   ├── storage.ts              # File I/O utilities
│   │   └── prisma.ts               # Prisma singleton
│   │
│   └── components/
│       ├── create/
│       │   ├── SketchPad.tsx        # HTML5 Canvas drawing board
│       │   ├── ReferenceImageUploader.tsx
│       │   └── ReferenceModelUploader.tsx
│       ├── project/
│       │   ├── ImageGallery.tsx     # Image grid + approve/reject
│       │   └── BlenderStatusCard.tsx # Progress + printability checks
│       └── shared/
│           └── ThreeViewer.tsx      # GLB/OBJ/STL viewer (Three.js)
│
├── uploads/                        # Generated files (gitignored)
│   ├── images/    thumbnails/    models/    stl/
│
├── prisma/schema.prisma            # SQLite: 10 models
├── .env
└── package.json                    # Next.js 16
```

## Database

SQLite via Prisma 7. Models: Project, Message, PromptVersion, ReferenceImage, ReferenceModel, GeneratedImage, GeneratedModel, BlenderJob, DesignVersion, FileAttachment.

```bash
npx prisma generate    # After schema changes
npx prisma db push     # Sync schema to dev.db
```

## How the Prompt Helper Works

The `/create` page uses a **frontend-driven** design to prevent LLM loops:

1. User describes idea → `POST /api/prompt/analyze`
2. LLM returns `{understood, object, fieldsComplete: {style, material, view, dimensions, features}}`
3. Frontend has 5 pre-defined question templates with clickable options (zh/en)
4. Frontend asks unanswered questions one at a time
5. User clicks options or types custom answers
6. After all 5 fields complete → "Craft My Prompt" button
7. `POST /api/prompt/craft` → personalized prompt
8. User can iterate by typing feedback → re-craft

The LLM only does simple analysis + crafting. The frontend handles conversation flow. This works reliably with small local models.

## Bilingual (zh/en)

- `detectLang()`: CJK weighted 3x, threshold 8%. Once zh, always zh.
- Every page has `<LangProvider>` + `useLang()` toggle
- All question templates are bilingual
- System prompts switch language automatically

## Available LLM Models

| Model | Speed | Quality | VRAM |
|-------|-------|---------|------|
| `qwen2.5:3b` | ~4s/call | Good | 1.9GB |
| `qwen3.5:4b` | ~16s/call | Better (thinking) | 3.4GB |
| `qwen2.5:14b` | ~50s/call | Best | 9GB |

Current default: `qwen3.5:4b` (balanced). Change in `.env` → `LOCAL_LLM_MODEL`.

## Testing

```bash
# Mock mode (zero dependencies)
LLM_PROVIDER=mock npm run dev

# With Ollama (prompt helper)
LLM_PROVIDER=local npm run dev    # Ollama must be running

# SD Turbo
cd sd_service && python main.py
curl http://127.0.0.1:8001/health   # → {"cuda":true}

# Full stack with Hunyuan
# Update HUNYUAN_BASE_URL + HUNYUAN_API_KEY in .env
```
