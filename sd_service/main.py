"""
Z-Image-Turbo Local Image Generation Service

Wraps sd-cli.exe (GGUF-based Z-Image-Turbo) as an HTTP API.

Endpoints:
  POST /generate          - Generate images from text prompt
  GET  /health            - Health check
"""

import os
import time
import asyncio
import hashlib
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Paths ──────────────────────────────────────────────────────────────
ZIMAGE_DIR = Path(os.environ.get(
    "ZIMAGE_DIR",
    r"C:\Users\mdssc\Downloads\Z-Image-Turbo-Windows-main\Z-Image-Turbo-Windows-main",
))

SD_CLI = str(ZIMAGE_DIR / "sd_bin" / "sd-cli.exe")
MODEL_PATH = str(ZIMAGE_DIR / "models" / "zimage" / "z_image_turbo_Q6_K.gguf")
VAE_PATH = str(ZIMAGE_DIR / "models" / "vae" / "ae.safetensors")
LLM_PATH = str(ZIMAGE_DIR / "models" / "llm" / "Qwen3-4B-Instruct-2507-Q4_K_M.gguf")
LORA_DIR = str(ZIMAGE_DIR / "models" / "loras")

OUTPUT_DIR = Path(__file__).parent.parent / "uploads" / "images"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── FastAPI ────────────────────────────────────────────────────────────
app = FastAPI(title="Z-Image-Turbo Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    width: int = Field(default=512, ge=256, le=1024)
    height: int = Field(default=512, ge=256, le=1024)
    num_images: int = Field(default=1, ge=1, le=4)
    num_inference_steps: int = Field(default=8, ge=4, le=30)
    guidance_scale: float = Field(default=1.0, ge=0.0, le=5.0)

class GeneratedImage(BaseModel):
    url: str
    width: int
    height: int

class GenerateResponse(BaseModel):
    images: list[GeneratedImage]
    status: str = "completed"

@app.get("/health")
async def health():
    cli_ok = os.path.isfile(SD_CLI)
    model_ok = os.path.isfile(MODEL_PATH)
    return {
        "status": "ok" if (cli_ok and model_ok) else "missing_files",
        "model": "Z-Image-Turbo Q6 GGUF",
        "cuda": True,
        "device": "NVIDIA GeForce RTX 4060 Laptop GPU",
    }

@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    for label, path in [("CLI", SD_CLI), ("Model", MODEL_PATH), ("VAE", VAE_PATH), ("LLM", LLM_PATH)]:
        if not os.path.isfile(path):
            raise HTTPException(status_code=503, detail=f"{label} not found: {path}")

    results = []
    try:
        for i in range(req.num_images):
            filename = f"zimage_{hashlib.md5(f'{req.prompt}_{time.time()}_{i}'.encode()).hexdigest()[:12]}.png"
            out_path = str(OUTPUT_DIR / filename)
            seed = int(time.time() * 1000 + i * 7777) % (2**31)

            cmd = [
                SD_CLI,
                "--diffusion-model", MODEL_PATH, "--vae", VAE_PATH, "--llm", LLM_PATH,
                "--lora-model-dir", LORA_DIR,
                "-p", req.prompt,
                "-n", req.negative_prompt or "",
                "--cfg-scale", str(req.guidance_scale),
                "--steps", str(req.num_inference_steps),
                "-H", str(req.height), "-W", str(req.width),
                "-s", str(seed), "--rng", "cuda",
                "-o", out_path, "-v",
            ]

            print(f"[ZImage] {req.width}x{req.height} steps={req.num_inference_steps} cfg={req.guidance_scale} seed={seed}")
            print(f"[ZImage] Prompt: {req.prompt[:120]}...")

            t0 = time.perf_counter()
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
            except asyncio.TimeoutError:
                proc.kill()
                try:
                    await asyncio.wait_for(proc.wait(), timeout=10)
                except asyncio.TimeoutError:
                    pass  # Process already dead or stuck — continue
                raise HTTPException(status_code=504, detail="Timeout (5 min)")
            elapsed = time.perf_counter() - t0
            returncode = proc.returncode
            print(f"[ZImage] Done in {elapsed:.1f}s (exit {returncode})")

            if returncode is None:
                raise HTTPException(status_code=500, detail="Process did not exit")
            if returncode != 0:
                err_text = stderr.decode() if stderr else "Unknown error"
                raise HTTPException(status_code=500, detail=f"CLI failed: {err_text[-300:]}")

            if not os.path.isfile(out_path):
                raise HTTPException(status_code=500, detail=f"No output: {out_path}")

            results.append(GeneratedImage(url=f"/api/files/images/{filename}", width=req.width, height=req.height))

        print(f"[ZImage] Generated {len(results)} images")
        return GenerateResponse(images=results, status="completed")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("Z-Image-Turbo Service (GGUF Q6)")
    print(f"CLI:  {'OK' if os.path.isfile(SD_CLI) else 'MISSING'}")
    print(f"Model: {'OK' if os.path.isfile(MODEL_PATH) else 'MISSING'} ({os.path.getsize(MODEL_PATH)/1e9:.1f}GB)" if os.path.isfile(MODEL_PATH) else "Model: MISSING")
    print("=" * 50)
    uvicorn.run(app, host="127.0.0.1", port=8001)
