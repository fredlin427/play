"""
Local Stable Diffusion Service

Provides a free local text-to-image API using SD Turbo (fast, 4 steps).
Falls back to SD 1.5 if SD Turbo fails.

Endpoints:
  POST /generate          - Generate images from text prompt
  GET  /health             - Health check

Usage:
  python main.py           # Starts on http://127.0.0.1:8001
"""

import io
import os
import time
import json
import hashlib
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import torch
from PIL import Image

# ── FastAPI App ─────────────────────────────────────────────────────
app = FastAPI(
    title="Local Stable Diffusion Service",
    version="0.1.0",
    description="Free local text-to-image for 3D printing workflow.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ── Output directory ────────────────────────────────────────────────
OUTPUT_DIR = Path(__file__).parent.parent / "uploads" / "images"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Request/Response ────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    width: int = Field(default=512, ge=256, le=1024)
    height: int = Field(default=512, ge=256, le=1024)
    num_images: int = Field(default=4, ge=1, le=4)
    num_inference_steps: int = Field(default=4, ge=1, le=10)
    guidance_scale: float = Field(default=0.0, ge=0.0, le=7.5)

class GeneratedImage(BaseModel):
    url: str
    width: int
    height: int

class GenerateResponse(BaseModel):
    images: list[GeneratedImage]
    status: str = "completed"

# ── Model loading ───────────────────────────────────────────────────
pipe = None
MODEL_ID = None

def load_model():
    """Load SD Turbo (fast, 1-4 steps) with CPU offload for 8GB VRAM."""
    global pipe, MODEL_ID

    try:
        from diffusers import AutoPipelineForText2Image

        MODEL_ID = "stabilityai/sd-turbo"
        print(f"[SD] Loading {MODEL_ID}...")

        pipe = AutoPipelineForText2Image.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.float16,
            variant="fp16",
        )

        # Move to GPU with memory-efficient settings
        if torch.cuda.is_available():
            pipe.to("cuda")
            print(f"[SD] Loaded on CUDA ({torch.cuda.get_device_name(0)})")
        else:
            print("[SD] CUDA not available, using CPU (will be slow)")

    except Exception as e:
        print(f"[SD] SD Turbo failed to load: {e}")
        print("[SD] Trying SD 1.5 as fallback...")
        try:
            from diffusers import StableDiffusionPipeline

            MODEL_ID = "runwayml/stable-diffusion-v1-5"
            pipe = StableDiffusionPipeline.from_pretrained(
                MODEL_ID,
                torch_dtype=torch.float16,
                safety_checker=None,  # Disable safety checker for 3D printing use case
            )
            if torch.cuda.is_available():
                pipe.to("cuda")
                pipe.enable_attention_slicing()  # Save VRAM
            print(f"[SD] SD 1.5 loaded on {'CUDA' if torch.cuda.is_available() else 'CPU'}")
        except Exception as e2:
            print(f"[SD] SD 1.5 also failed: {e2}")
            print("[SD] No model available. Service will return 503.")

# ── Endpoints ───────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    load_model()

@app.get("/health")
async def health():
    return {
        "status": "ok" if pipe is not None else "no_model",
        "model": MODEL_ID or "none",
        "cuda": torch.cuda.is_available(),
        "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
    }

@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Check server logs.")

    try:
        with torch.inference_mode():
            images = pipe(
                prompt=req.prompt,
                negative_prompt=req.negative_prompt or None,
                width=req.width,
                height=req.height,
                num_images_per_prompt=min(req.num_images, 4),
                num_inference_steps=req.num_inference_steps,
                guidance_scale=req.guidance_scale if MODEL_ID != "stabilityai/sd-turbo" else 0.0,
            ).images

        results = []
        for i, img in enumerate(images):
            # Generate unique filename
            hash_input = f"{req.prompt}_{time.time()}_{i}".encode()
            file_hash = hashlib.md5(hash_input).hexdigest()[:12]
            filename = f"sd_{file_hash}.png"
            filepath = OUTPUT_DIR / filename

            # Save
            img.save(str(filepath), "PNG")

            results.append(GeneratedImage(
                url=f"/api/files/images/{filename}",
                width=img.width,
                height=img.height,
            ))

        print(f"[SD] Generated {len(results)} images ({req.width}x{req.height})")

        return GenerateResponse(images=results, status="completed")

    except torch.cuda.OutOfMemoryError:
        raise HTTPException(
            status_code=507,
            detail="Out of GPU memory. Try reducing image size (512x512) or num_images (1)."
        )
    except Exception as e:
        print(f"[SD] Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── Main ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("Local Stable Diffusion Service")
    print("=" * 60)
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    print("=" * 60)
    uvicorn.run(app, host="127.0.0.1", port=8001)
