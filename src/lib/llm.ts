/**
 * LLM Integration Layer — Provider-Based Architecture
 *
 * Supports multiple LLM backends via the LLM_PROVIDER env variable:
 *   - "local"  → OpenAI-compatible local endpoint (Ollama, vLLM, LM Studio, etc.)
 *   - "mock"   → Deterministic rule-based responses (no network, no external API)
 *
 * PRIVACY: When LLM_PROVIDER=local, all data stays on the local network.
 * No user messages or patient data are sent to external APIs.
 * In production (NODE_ENV=production), raw user messages are not logged.
 *
 * The OpenAI SDK is used as the HTTP client for all remote providers
 * because all supported backends implement the /v1/chat/completions API.
 */

import OpenAI from "openai";
import type { z } from "zod";

// ── Provider Types ───────────────────────────────────────────────────

type LLMProvider = "local" | "mock";

interface LLMConfig {
  provider: LLMProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
}

// ── Config Resolution ────────────────────────────────────────────────

let _config: LLMConfig | null = null;

function getConfig(): LLMConfig {
  if (_config) return _config;

  const provider = (process.env.LLM_PROVIDER || "mock") as LLMProvider;

  _config = {
    provider,
    baseUrl: process.env.LOCAL_LLM_BASE_URL || "http://localhost:11434/v1",
    model: process.env.LOCAL_LLM_MODEL || "qwen2.5:14b",
    apiKey: process.env.LOCAL_LLM_API_KEY || "ollama",
  };

  return _config;
}

// ── Client Cache ─────────────────────────────────────────────────────

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  const config = getConfig();
  if (config.provider === "mock") return null;

  if (_client) return _client;

  _client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  console.log(`[LLM] Initialized: provider=${config.provider}, baseURL=${config.baseUrl}, model=${config.model}`);

  return _client;
}

// ── Vision Model Config ────────────────────────────────────────────────

interface VisionConfig {
  enabled: boolean;
  model: string;
}

function getVisionConfig(): VisionConfig {
  return {
    enabled: process.env.VISION_ENABLED === "true",
    model: process.env.VISION_MODEL || "qwen2.5-vl:7b",
  };
}

export function isVisionAvailable(): boolean {
  if (getConfig().provider === "mock") return false;
  return getVisionConfig().enabled;
}

// ── Public API ───────────────────────────────────────────────────────

export interface LLMResponse {
  content: string;
  model: string;
  provider: LLMProvider;
}

export function getActiveProvider(): LLMProvider {
  return getConfig().provider;
}

export function isMockMode(): boolean {
  return getConfig().provider === "mock";
}

/**
 * Main entry point: call the LLM with a system prompt and user message.
 *
 * @param systemPrompt  - Instructions for the model
 * @param userMessage   - The user's input (will NOT be logged in production)
 * @param options       - Temperature, maxTokens overrides
 * @param structured    - If true, prompts the model for JSON-only output
 */
export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  options?: { temperature?: number; maxTokens?: number; structured?: boolean }
): Promise<LLMResponse> {
  const config = getConfig();
  const client = getClient();

  // Append JSON instruction for structured requests
  const effectiveSystem = options?.structured
    ? systemPrompt + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences, no extra text."
    : systemPrompt;

  if (client) {
    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 2000,
        messages: [
          { role: "system", content: effectiveSystem },
          { role: "user", content: userMessage },
        ],
      });

      const msg = completion.choices[0]?.message;
      const content = msg?.content
        || ((msg as unknown as Record<string, unknown>)?.reasoning as string | undefined)
        || "";
      return {
        content,
        model: completion.model || config.model,
        provider: "local",
      };
    } catch (error) {
      console.error("[LLM] Local API call failed:", error);
      // Fall through to mock if local is unavailable
      if (config.provider === "local") {
        console.warn("[LLM] Local endpoint failed, falling back to mock for this call");
      }
    }
  }

  // ── Mock Mode ──────────────────────────────────────────────────────
  return mockResponse(systemPrompt, userMessage);
}

/**
 * Streaming LLM call — yields content tokens as they arrive.
 * Falls back to mock (non-streaming) if LLM is unavailable.
 */
export async function* callLLMStream(
  systemPrompt: string,
  userMessage: string,
  options?: { temperature?: number; maxTokens?: number }
): AsyncGenerator<string, void, undefined> {
  const config = getConfig();
  const client = getClient();

  if (client) {
    try {
      const stream = await client.chat.completions.create({
        model: config.model,
        temperature: options?.temperature ?? 0.5,
        max_tokens: options?.maxTokens ?? 500,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
      return;
    } catch (error) {
      console.error("[LLM] Streaming failed:", error);
    }
  }

  // Fallback: mock response as a single chunk
  const mock = mockResponse(systemPrompt, userMessage);
  yield mock.content;
}

/**
 * Vision LLM call — sends an image along with a text prompt.
 * Uses OpenAI-compatible vision format (works with Ollama vision models
 * like qwen2.5-vl, llava, etc.).
 *
 * Returns null if vision is not available or the call fails.
 */
export async function callVisionLLM(
  imageBase64: string,
  imageMimeType: string,
  prompt: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<LLMResponse | null> {
  const vConfig = getVisionConfig();
  if (!vConfig.enabled) {
    console.warn("[LLM Vision] Vision not enabled (VISION_ENABLED=false)");
    return null;
  }

  const client = getClient();
  if (!client) {
    console.warn("[LLM Vision] No LLM client available");
    return null;
  }

  try {
    const completion = await client.chat.completions.create({
      model: vConfig.model,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 500,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${imageMimeType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
    });

    const msg = completion.choices[0]?.message;
    const content = msg?.content || "";
    return {
      content,
      model: completion.model || vConfig.model,
      provider: "local",
    };
  } catch (error) {
    console.error("[LLM Vision] Vision call failed:", String(error).slice(0, 200));
    return null;
  }
}

// ── Privacy-Aware Logging ────────────────────────────────────────────

/**
 * Log a user-facing message safely.
 * In production, replaces the full message with a length-only indicator.
 * Never logs content that might contain patient identifiers.
 */
export function safeLog(label: string, message: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    console.log(`[LLM] ${label}: [${message.length} chars]`);
  } else {
    // In dev, show truncated version — still avoids full PHI exposure in logs
    const preview = message.length > 100 ? message.slice(0, 100) + "..." : message;
    console.log(`[LLM] ${label}: ${preview}`);
  }
}

// ── JSON Parsing with Repair ─────────────────────────────────────────

/**
 * Extract JSON from an LLM response string.
 * Handles thinking models (qwen3.5) that wrap JSON in reasoning text.
 *
 * Strategy: find all { } blocks, try parsing each, return the last valid one.
 * This handles cases where the model outputs "Thinking... {json} ...more thinking..."
 */
export function extractJson(raw: string): string {
  const text = raw.trim();

  // Remove markdown code fences first
  let cleaned = text;
  if (cleaned.includes("```")) {
    cleaned = cleaned.replace(/```(?:json)?\s*\n?/gi, "").replace(/```/g, "");
  }

  // Find ALL potential JSON object blocks
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === "{" && (i === 0 || cleaned[i - 1] !== "\\")) {
      if (depth === 0) start = i;
      depth++;
    } else if (cleaned[i] === "}" && (i === 0 || cleaned[i - 1] !== "\\")) {
      depth--;
      if (depth === 0 && start >= 0) {
        blocks.push(cleaned.slice(start, i + 1));
        start = -1;
      }
    }
  }

  // Try each block from LAST to FIRST (last block is usually the actual JSON)
  for (let i = blocks.length - 1; i >= 0; i--) {
    let candidate = blocks[i];
    // Repair common issues
    candidate = candidate
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[''']/g, "'")
      .replace(/[""]/g, '"')
      .replace(/\n/g, " ")
      .replace(/\t/g, " ");

    try {
      JSON.parse(candidate);
      return candidate; // Valid JSON found
    } catch {
      // Try next block
    }
  }

  // Fallback: return the full text (will fail in caller's JSON.parse, triggering retry/fallback)
  return cleaned;
}

/**
 * Parse and validate an LLM JSON response against a Zod schema.
 *
 * Strategy:
 *   1. Extract JSON from raw text
 *   2. Parse with JSON.parse
 *   3. Validate with Zod schema
 *   4. If any step fails, return the provided fallback
 *
 * @param raw       - Raw LLM response text
 * @param schema    - Zod schema to validate against
 * @param fallback  - Safe fallback value if parsing fails
 * @param agentName - For logging purposes
 */
export function parseAndValidate<T>(
  raw: string,
  schema: z.ZodType<T>,
  fallback: T,
  agentName: string
): { data: T; parseError: boolean } {
  const json = extractJson(raw);

  try {
    const parsed = JSON.parse(json);
    const result = schema.safeParse(parsed);

    if (result.success) {
      console.log(`[LLM] ${agentName}: JSON valid ✓`);
      return { data: result.data, parseError: false };
    }

    console.warn(`[LLM] ${agentName}: Zod validation failed`, result.error.flatten());
    return { data: fallback, parseError: true };
  } catch (err) {
    console.warn(`[LLM] ${agentName}: JSON.parse failed`, String(err));
    return { data: fallback, parseError: true };
  }
}

/**
 * Call LLM with Zod validation and automatic retry on parse failure.
 *
 * Flow:
 *   1. Call LLM for structured JSON output
 *   2. Parse + validate with Zod
 *   3. If parse fails, retry ONCE with a repair prompt
 *   4. If retry also fails, return the safe fallback
 */
export async function callLLMStructured<T>(
  systemPrompt: string,
  userMessage: string,
  schema: z.ZodType<T>,
  fallback: T,
  agentName: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ data: T; content: string; model: string; provider: LLMProvider }> {
  // ── First attempt ──────────────────────────────────────────────────
  const response1 = await callLLM(systemPrompt, userMessage, {
    ...options,
    structured: true,
    temperature: options?.temperature ?? 0.1, // Low temp for structured output (respect caller override)
  });

  const result1 = parseAndValidate(response1.content, schema, fallback, agentName);

  if (!result1.parseError) {
    return {
      data: result1.data,
      content: response1.content,
      model: response1.model,
      provider: response1.provider,
    };
  }

  // ── Retry with repair prompt ───────────────────────────────────────
  console.warn(`[LLM] ${agentName}: First attempt failed JSON parse. Retrying with repair prompt...`);

  const repairMessage = `Your previous response was not valid JSON. Please fix it.

Previous response:
${response1.content.slice(0, 500)}

Return ONLY valid JSON that matches this structure. No markdown, no extra text.

Original request:
${userMessage.slice(0, 300)}`;

  const response2 = await callLLM(systemPrompt, repairMessage, {
    ...options,
    structured: true,
    temperature: 0.0,
  });

  const result2 = parseAndValidate(response2.content, schema, fallback, agentName);

  if (!result2.parseError) {
    console.log(`[LLM] ${agentName}: Repair retry succeeded ✓`);
    return {
      data: result2.data,
      content: response2.content,
      model: response2.model,
      provider: response2.provider,
    };
  }

  // ── Both attempts failed → safe fallback ───────────────────────────
  console.error(`[LLM] ${agentName}: Both attempts failed. Using safe fallback.`);
  return {
    data: fallback,
    content: JSON.stringify(fallback),
    model: "fallback",
    provider: getConfig().provider,
  };
}

// ══════════════════════════════════════════════════════════════════════
// MOCK RESPONSE ENGINE
// ══════════════════════════════════════════════════════════════════════

/**
 * Deterministic mock responses. No external API calls.
 * All data stays in-process. No network activity.
 */
function mockResponse(systemPrompt: string, userMessage: string): LLMResponse {
  const promptLower = systemPrompt.toLowerCase();

  let content: string;

  if (promptLower.includes("extract structured")) {
    content = mockIntake(userMessage);
  } else if (promptLower.includes("design consultant") || promptLower.includes("設計顧問")) {
    content = mockAsk(userMessage);
  } else if (promptLower.includes("self-critique") || (promptLower.includes("flow-matching") && promptLower.includes("valid json"))) {
    // Joint craft: chain-of-thought → JSON {positive, negative}
    content = mockJointCraft(userMessage);
  } else if (promptLower.includes("image-generation prompt engineer") || promptLower.includes("generate concise negative")) {
    content = mockCraftNegative(userMessage);
  } else if (promptLower.includes("product-design copywriter") || promptLower.includes("product design copywriter") || (promptLower.includes("flow-matching") && promptLower.includes("output only the description"))) {
    // Streaming positive: Z-Image-Turbo flow-matching polish
    content = mockCraftPositive(userMessage);
  } else if (promptLower.includes("prompt engineer") || promptLower.includes("9-section prompt")) {
    content = mockPrompt(userMessage);
  } else {
    content = mockGeneral(userMessage);
  }

  return { content, model: "mock-mode", provider: "mock" };
}

// ── Mock: Intake ─────────────────────────────────────────────────────

function mockIntake(input: string): string {
  const lower = input.toLowerCase();

  let dimensions = "";
  const dimMatch = input.match(/(\d+)\s*(?:mm|cm|inch)?\s*[x×]\s*(\d+)\s*(?:mm|cm|inch)?\s*(?:[x×]\s*(\d+)\s*(?:mm|cm|inch)?)?/i);
  if (dimMatch) {
    const unit = lower.includes("cm") ? "cm" : "mm";
    dimensions = dimMatch[3]
      ? `${dimMatch[1]}${unit} × ${dimMatch[2]}${unit} × ${dimMatch[3]}${unit}`
      : `${dimMatch[1]}${unit} × ${dimMatch[2]}${unit}`;
  }

  let productType = "custom container";
  if (lower.includes("holder") || lower.includes("rack") || lower.includes("mount")) productType = "tool holder";
  else if (lower.includes("surgical") || lower.includes("implant") || lower.includes("guide")) productType = "surgical guide";
  else if (lower.includes("model") || lower.includes("anatomical")) productType = "anatomical model";
  else if (lower.includes("tray") || lower.includes("organizer")) productType = "organizer tray";

  let intendedUse = "organizing supplies";
  if (lower.includes("surgery") || lower.includes("surgical")) intendedUse = "surgical procedure support";
  else if (lower.includes("patient")) intendedUse = "clinical use";
  else if (lower.includes("storage") || lower.includes("organize")) intendedUse = "storage and organization";
  else if (lower.includes("office") || lower.includes("desk")) intendedUse = "office organization";

  let numberOfItems = "";
  const countMatch = input.match(/(\d+)\s*(?:pairs|items|pieces|tools|scissors|instruments)/i);
  if (countMatch) numberOfItems = `${countMatch[1]} items`;

  let materialRequirements = "";
  if (lower.includes("plastic")) materialRequirements = "plastic";
  else if (lower.includes("resin")) materialRequirements = "resin";
  else if (lower.includes("metal")) materialRequirements = "metal-like";

  let cleaningRequirement = "";
  if (lower.includes("wipe")) cleaningRequirement = "wipeable";
  else if (lower.includes("autoclave") || lower.includes("sterilize")) cleaningRequirement = "autoclave sterilization";
  else if (lower.includes("wash")) cleaningRequirement = "washable";

  const patientContact = lower.includes("patient") && !lower.includes("no patient") ? "yes" : "no";
  const clinicalUse = lower.includes("clinical") || lower.includes("surgery") ? "yes" : "no";

  let deadline = "";
  const weekMatch = input.match(/(\d+)\s*(?:week|wk)/i);
  if (weekMatch) deadline = `${weekMatch[1]} weeks`;
  const dayMatch = input.match(/(\d+)\s*(?:day)/i);
  if (dayMatch) deadline = `${dayMatch[1]} days`;

  // Confidence
  let filled = 0;
  if (dimensions) filled++;
  if (materialRequirements) filled++;
  if (cleaningRequirement) filled++;
  if (deadline) filled++;
  if (numberOfItems) filled++;
  const confidence = Math.min(0.9, 0.3 + filled * 0.12);

  // Missing
  const missingInformation: string[] = [];
  if (!dimensions) missingInformation.push("requiredDimensions");
  if (!materialRequirements) missingInformation.push("materialNeeds");
  if (!cleaningRequirement) missingInformation.push("cleaningRequirement");
  if (!numberOfItems) missingInformation.push("numberOfItems");
  if (!deadline) missingInformation.push("deadline");

  return JSON.stringify({
    projectType: productType, intendedUse,
    productDescription: `${productType} for ${intendedUse}`,
    requiredDimensions: dimensions || null,
    numberOfItems: numberOfItems || null,
    materialNeeds: materialRequirements || null,
    strengthRequirement: "medium",
    flexibilityRequirement: "low",
    heatResistanceRequirement: "up to 60°C",
    cleaningRequirement: cleaningRequirement || null,
    sterilisationRequirement: lower.includes("autoclave") ? "autoclave" : lower.includes("steril") ? "chemical" : null,
    patientContact, clinicalUse,
    deadline: deadline || null,
    uploadedFilesMentioned: [],
    missingInformation,
    confidence,
  });
}

// ── Mock: Risk ───────────────────────────────────────────────────────

function mockRisk(input: string): string {
  const lower = input.toLowerCase();
  const isHigh = lower.includes("surgical guide") || lower.includes("cutting guide") || lower.includes("drilling guide") || lower.includes("implant") || lower.includes("operating room") || lower.includes("long-term") || lower.includes("treatment decision") || lower.includes("load-bearing");
  const isMed = lower.includes("patient contact") || lower.includes("clinical") || lower.includes("sterilization") || lower.includes("anatomical model") || lower.includes("skin contact") || lower.includes("medical imaging");
  if (isHigh) {
    return JSON.stringify({ riskLevel: "high", reason: "Involves surgical equipment, implants, or operating room use.", requiresHumanReview: true, requiresClinicianApproval: true, allowedAutomation: "none" });
  }
  if (isMed) {
    return JSON.stringify({ riskLevel: "medium", reason: "Patient contact or clinical use indicated.", requiresHumanReview: true, requiresClinicianApproval: true, allowedAutomation: "partial" });
  }
  return JSON.stringify({ riskLevel: "low", reason: "No medical risk indicators detected.", requiresHumanReview: false, requiresClinicianApproval: false, allowedAutomation: "full" });
}

// ── Mock: Clarification ──────────────────────────────────────────────

function mockClarification(input: string): string {
  const lower = input.toLowerCase();
  const hasDim = lower.includes("mm") || lower.includes("cm") || /\d+\s*x\s*\d+/.test(lower);
  const hasMat = /plastic|resin|pla|petg|abs|nylon/i.test(lower);
  const hasClean = /wipe|wash|clean|autoclave|steril/i.test(lower);
  const hasPatient = /patient|clinical|surgery/i.test(lower);

  let answered = 0;
  if (hasDim) answered++;
  if (hasMat) answered++;
  if (hasClean) answered++;
  if (hasPatient) answered++;

  if (answered >= 3 || lower.length > 300) {
    return "I have enough information to proceed.";
  }

  const lines: string[] = [];
  if (!hasDim) lines.push("1. What are the approximate dimensions? (length × width × height in mm)");
  if (!hasMat) lines.push("2. Any preference for material type? (e.g., rigid plastic, flexible, heat-resistant)");
  if (!hasClean) lines.push("3. How will this item be cleaned? (wipe only, washable, autoclave sterilisation)");
  if (!hasPatient) lines.push("4. Will this item contact patients or be used in a clinical procedure?");
  if (lines.length < 2) lines.push("5. When do you need this by?");

  return lines.join("\n");
}

// ── Mock: Design Brief ───────────────────────────────────────────────

function mockDesignBrief(_input: string): string {
  return `## 3D Printing Design Brief

### Project Title
Custom Medical Supply Organizer

### Summary
A custom container for organizing medical supplies. Durable, easy-clean, efficient space use.

### Requirements
- Rounded corners for safety
- Smooth, wipeable surfaces
- Moderate strength, low flexibility
- No patient contact

### Constraints
- Standard FDM print volume
- Weight under 500g
- Alcohol-resistant surface

### Notes
Low-risk organizational tool. Standard review applies.`;
}

// ── Mock: Material ───────────────────────────────────────────────────

function mockMaterial(_input: string): string {
  return `## Material Recommendation

### Primary: PLA+
- Excellent for organizational tools
- Good strength-to-weight
- Easy to print, low warping
- Low cost

### Alternatives
- **PETG** — Better heat resistance
- **ABS** — Higher strength, needs enclosure

### Method: FDM
- Layer: 0.2mm | Infill: 20-25% | Walls: 1.2mm (3 perimeters)

### Post-Processing
- Light sanding, optional clear coat`;
}

// ── Mock: Prompt ─────────────────────────────────────────────────────

function mockPrompt(_input: string): string {
  return [
    "## 1. Object Name & Summary",
    "Medical supply organizer — a compartmentalized container for organizing clinical supplies with easy-clean surfaces.",
    "",
    "## 2. Positive Prompt",
    "single object only, isolated on white background, centered composition, front or 3/4 view, full object in frame, clean silhouette, studio soft lighting, product photography, technical render, clear edges and materials, image-to-3D ready, medical supply organizer with compartments, rounded corners, smooth wipeable surfaces, stackable design, flat base, PLA material, matte finish",
    "",
    "## 3. Negative Prompt",
    "text, watermark, logo, multiple objects, complex background, blur, distortion, extreme perspective, cropped, occlusion, harsh shadows, artistic lighting, sharp edges, thin walls below 1.2mm, overhangs greater than 45 degrees, small features under 2mm, text embossing, complex mechanical parts, hinges, moving parts, porous surfaces, rough textures, unsupported bridges",
    "",
    "## 4. Key Visual Features",
    "- Multiple compartments of varying sizes",
    "- Rounded corners (radius 3mm) for safety",
    "- Ergonomic finger grips on each compartment",
    "- Label holder slots on compartment fronts",
    "- Clean, professional medical aesthetic",
    "",
    "## 5. Material & Surface Properties",
    "- Material: PLA (primary) or PETG (alternative)",
    "- Finish: Matte, smooth, wipeable",
    "- Edge treatment: Filleted internal corners, rounded external edges",
    "- Color: Light grey or white (medical standard)",
    "",
    "## 6. Geometric Structure",
    "- Main shape: Rectangular prism with divided interior",
    "- Compartment dividers: Fixed, draft-angled",
    "- Flat base for print bed adhesion",
    "- Minimum wall thickness: 1.2mm",
    "- No moving parts, no hinges",
    "",
    "## 7. View & Composition",
    "- Recommended view: 3/4 front view for best compartment visibility",
    "- Centered, full object in frame with margin",
    "- Orthographic or slight perspective",
    "",
    "## 8. Scale & Dimensions",
    "- Approximate size: 200mm x 150mm x 100mm (desktop-sized)",
    "- Fits standard FDM print volume",
    "- Weight target: under 500g",
    "",
    "## 9. Generation Notes",
    "- Print with flat base directly on build plate",
    "- Use 20-25% infill for strength-to-weight balance",
    "- Consider brim for large flat surfaces",
    "- Sand post-print for smooth finish",
    "- Recommended: 4 image variations for best I2T3D results"
  ].join("\n");
}

// ── Mock: Ticket ─────────────────────────────────────────────────────

function mockTicket(_input: string): string {
  const id = "3DP-" + Date.now().toString(36).toUpperCase();
  return `## Job Ticket: ${id}

### Request Summary
Custom medical supply organizer for storage area.

### User Goal
Organize 6-8 medical supply items in a clinical storage area.

### Project Type
Custom Container

### Risk Level
Low — No patient contact, office use only.

### Human Review Required
No

### Required Dimensions
200mm × 150mm × 100mm

### Functional Requirements
- 6-8 compartments of varying sizes
- Rounded corners for safety
- Stackable design
- Easy to clean surface

### Material Recommendation
PLA+ (primary) or PETG (alternative), FDM printing

### Suggested Printing Method
FDM, 0.2mm layer height, 20-25% infill, 1.2mm wall thickness

### Missing Information
- Exact compartment sizes
- Color preference

### Next Action
Review design brief and confirm dimensions before printing.

### Engineer Notes
[To be filled by engineer]`;
}

// ── Mock: Ask (Q&A question generation) ──────────────────────────────

function mockAsk(input: string): string {
  // Return a valid question JSON that matches the expected schema
  const fields = ["material", "color", "dimensions", "shape", "surface", "edge", "components", "style", "details"];
  const field = fields[Math.floor(input.length % fields.length)];
  const questions: Record<string, { q: string; opts: string[] }> = {
    material: { q: "What material will this be made of?", opts: ["PLA", "PETG", "ABS", "Resin", "Metal", "Wood", "Other"] },
    color: { q: "What color should it be?", opts: ["White", "Grey", "Black", "Blue", "Silver", "Custom", "Other"] },
    dimensions: { q: "What are the approximate dimensions?", opts: ["<100mm", "100-300mm", "300-600mm", ">600mm", "Other"] },
    shape: { q: "What is the overall shape?", opts: ["Rectangular box", "Cylindrical", "Irregular/organic", "Flat/tray", "Other"] },
    surface: { q: "What surface finish?", opts: ["Smooth matte", "Glossy", "Rough/textured", "Brushed metal", "Other"] },
    edge: { q: "How should edges be treated?", opts: ["Sharp/square", "Slightly rounded", "Beveled/chamfered", "Other"] },
    components: { q: "What visible components does it have?", opts: ["No special components", "Drawers", "Handles", "Feet/legs", "Other"] },
    style: { q: "What design style?", opts: ["Modern minimalist", "Industrial", "Medical-grade", "Scandinavian", "Other"] },
    details: { q: "Any additional visual details?", opts: ["None", "Other"] },
  };
  const q = questions[field];
  return JSON.stringify({ action: "ask", field, question: q.q, options: q.opts, message: "Choose an option or type your own:" });
}

// ── Mock: Craft Positive ────────────────────────────────────────────

function mockCraftPositive(input: string): string {
  const nameMatch = input.match(/- Object:\s*(.+)/);
  const name = nameMatch?.[1] || "object";
  const colorMatch = input.match(/- Color:\s*(.+)/);
  const color = colorMatch?.[1] || "white";
  const matMatch = input.match(/- Material:\s*(.+)/);
  const material = matMatch?.[1] || "plastic";
  return `A sleek ${color} ${material} ${name}, clean geometric form with smooth surfaces, centered composition, product photography style, studio lighting, precise proportions, isolated on plain background, 3D-ready render quality`;
}

// ── Mock: Joint Craft (positive + negative in one JSON) ────────────

function mockJointCraft(input: string): string {
  const nameMatch = input.match(/- Object:\s*(.+)/);
  const name = nameMatch?.[1] || "object";
  const colorMatch = input.match(/- Color:\s*(.+)/);
  const color = colorMatch?.[1] || "white";
  const matMatch = input.match(/- Material:\s*(.+)/);
  const material = matMatch?.[1] || "plastic";
  const shapeMatch = input.match(/- Overall shape:\s*(.+)/);
  const shape = shapeMatch?.[1] || "";
  const compMatch = input.match(/- Component details:\s*(.+)/);
  const comp = compMatch?.[1] || "";

  const positive = `A sleek ${color} ${material} ${name}${shape ? `, ${shape} shape` : ""}, clean geometric form with smooth surfaces, single object centered on pure white background, studio soft lighting, precise proportions, accurate details${comp ? `, ${comp}` : ""}, product photography style, 3D-ready render quality`;

  const negative = `text, watermark, logo, multiple objects, two, duplicate, clone, background clutter, blur, distortion, harsh shadows, bad lighting, wrong material, wrong color, deformed geometry, missing parts, extra parts, wrong proportions`;

  return JSON.stringify({ positive, negative });
}

// ── Mock: Craft Negative ────────────────────────────────────────────

function mockCraftNegative(_input: string): string {
  return "text, watermark, logo, multiple objects, background clutter, blur, distortion, harsh shadows, wrong material, wrong color, deformed geometry, missing parts";
}

// ── Mock: General ────────────────────────────────────────────────────

function mockGeneral(_input: string): string {
  return "I'm here to help you describe what you need for your 3D printing request. Could you tell me more about what you'd like to create and how it will be used in the hospital?";
}

// ── Mock: Sketch Understanding ──────────────────────────────────────

function mockSketchUnderstanding(input: string): string {
  const lower = input.toLowerCase();
  let projectType = "container";
  let w: number | null = null, d: number | null = null, h: number | null = null;
  let comp: number | null = null;

  if (lower.includes("tray")) { projectType = "tray"; if (!h) h = 30; }
  else if (lower.includes("tool holder") || lower.includes("holder") || lower.includes("mount")) {
    projectType = "tool-holder"; if (!w) w = 200; if (!d) d = 60; if (!h) h = 150;
  }
  else if (lower.includes("bracket")) { projectType = "bracket"; }

  const dimMatch = input.match(/(\d+)\s*[x×]\s*(\d+)\s*(?:[x×]\s*(\d+))?/i);
  if (dimMatch) {
    w = parseInt(dimMatch[1]) || null;
    d = parseInt(dimMatch[2]) || null;
    if (dimMatch[3]) h = parseInt(dimMatch[3]) || null;
  }
  const compMatch = input.match(/(\d+)\s*(?:compartment|slot|section|隔層|格)/i);
  if (compMatch) comp = parseInt(compMatch[1]);

  const hasPatient = lower.includes("patient") && !lower.includes("no patient");
  const hasClinical = lower.includes("clinical") || lower.includes("surgery") || lower.includes("surgical");
  const isHighRisk = lower.includes("implant") || lower.includes("surgical guide") || lower.includes("drilling guide") || lower.includes("cutting guide");
  const riskLevel = isHighRisk ? "high" : (hasPatient || hasClinical ? "medium" : "low");

  return JSON.stringify({
    projectType,
    confidence: dimMatch ? 0.6 : 0.3,
    units: "mm",
    overallDimensions: { length: d, width: w, height: h },
    features: {
      openTop: !lower.includes("lid") && !lower.includes("cover"),
      lid: lower.includes("lid") || lower.includes("cover"),
      compartments: comp,
      dividerType: comp && comp > 1 ? "fixed" : null,
      roundedCorners: !lower.includes("sharp"),
      cornerRadius: lower.includes("sharp") ? 0 : 3.0,
      wallThickness: 2.0,
      baseThickness: 2.0,
      holes: lower.includes("hole") ? [{ location: "side", diameter: 5, purpose: "ventilation" }] : [],
      handles: lower.includes("handle") ? [{ location: "front", type: "grip" }] : [],
      labelArea: lower.includes("label"),
    },
    functionalRequirements: {
      easyToClean: lower.includes("wipe") || lower.includes("clean"),
      strength: "medium",
      flexibility: "rigid",
      heatResistance: lower.includes("heat") || lower.includes("autoclave") ? "up to 120°C" : "up to 60°C",
      sterilisation: lower.includes("autoclave") ? "autoclave" : lower.includes("steril") ? "chemical" : "none",
      patientContact: hasPatient,
      clinicalUse: hasClinical,
    },
    missingInformation: !dimMatch ? ["dimensions"] : [],
    clarificationQuestions: !dimMatch ? ["What are the approximate dimensions in mm?"] : [],
    riskLevel,
    humanReviewRequired: riskLevel !== "low",
    canGenerateCAD: riskLevel === "low" && !!dimMatch,
    recommendedCADTemplate: projectType,
  });
}

// ── Mock: CAD Template ─────────────────────────────────────────────

function mockCadTemplate(input: string): string {
  const lower = input.toLowerCase();
  let tmpl = "container";
  if (lower.includes("tray")) tmpl = "tray";
  else if (lower.includes("tool holder") || lower.includes("holder") || lower.includes("mount")) tmpl = "tool-holder";
  return JSON.stringify({ template: tmpl, reason: `Matched by keyword: ${tmpl}`, supported: true, fallbackNote: "" });
}

// ── Mock: Revision ─────────────────────────────────────────────────

function mockRevision(_input: string): string {
  return JSON.stringify({
    changes: [{ action: "set_dimensions", target: "height", value: 70, reason: "User requested taller container" }],
    summary: "Increased height from 60mm to 70mm.",
    needsClarification: false,
    clarificationQuestion: "",
  });
}
