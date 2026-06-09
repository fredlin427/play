# Dockerfile for SD Service (Z-Image-Turbo)
# Depends on sd-cli.exe being available on the host (mounted via volume).
# For a fully self-contained image, copy sd-cli and models into the image instead.

FROM python:3.12-slim

WORKDIR /app

# Install Python deps
RUN pip install --no-cache-dir fastapi uvicorn

# Copy service code
COPY main.py .

EXPOSE 8001
CMD ["python", "main.py"]
