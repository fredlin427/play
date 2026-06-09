/**
 * Shared prompt craft utilities — used by both the streaming and
 * non-streaming craft endpoints.
 *
 * V2 — Optimized for Z-Image-Turbo (flow-matching model, CFG=1.0):
 *   • Joint positive+negative generation with chain-of-thought self-critique
 *   • Asset-type-specific few-shot examples for higher accuracy
 *   • Front-loaded key visual info (first ~150 chars) for multi-view compatibility
 *   • Post-polish quality validation with auto-retry
 *   • Natural language over tag lists — every word matters when CFG=1.0
 */
import type { DesignSpec } from "@/lib/schemas";
import { z } from "zod";

// ── Types ───────────────────────────────────────────────────────────

export interface PolishData {
  name: string;
  assetType: string;
  color: string;
  material: string;
  shape: string;
  dims: string;
  surf: string;
  edge: string;
  style: string;
  comp: string;
  viewAngle: string;
  pose: string;
  useEnv: string;
  useGoal: string;
}

/** Parsed output of the joint (positive+negative) generation. */
export const JointCraftSchema = z.object({
  positive: z.string().min(30).max(1500),
  negative: z.string().min(10).max(500),
});
export type JointCraftOutput = z.infer<typeof JointCraftSchema>;

// ── Field Extraction ────────────────────────────────────────────────

/** Extract all spec fields into a flat record for prompt templates. */
export function extractPolishData(spec: DesignSpec): PolishData {
  return {
    name: spec.subject?.name || "object",
    assetType: spec.meta?.assetType || "product",
    color: spec.visual?.color || "",
    material: spec.visual?.material || "",
    shape: spec.structure?.mainShape || "",
    dims: spec.dimensions?.approximateSize || "",
    surf: [spec.visual?.texture, spec.visual?.finish].filter(Boolean).join(" "),
    edge: spec.visual?.edgeTreatment || "",
    style: spec.meta?.style || "",
    comp: spec.structure?.details || "",
    viewAngle: spec.composition?.viewAngle || "",
    pose: spec.composition?.poseOrOrientation || "",
    useEnv: spec.useCase?.environment || "",
    useGoal: spec.meta?.generationGoal || "",
  };
}

// ── Asset-Type Few-Shot Examples ────────────────────────────────────

type AssetCategory = "furniture" | "medical" | "mechanical" | "organic";

interface FewShotExample {
  category: AssetCategory;
  /** Human-readable label for the prompt */
  label: string;
  /** A high-quality example of the desired output style */
  example: string;
}

const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    category: "furniture",
    label: "furniture / storage / containers",
    example: `"A matte white PLA medical supply cabinet, tall rectangular vertical form, five identical drawers stacked front-to-bottom with uniform 3mm gaps between each drawer front, every drawer has a centered recessed black semicircular pull handle positioned 15mm from the top edge, cabinet body has clean flat side panels with slightly beveled 1mm edges, flat top surface with no overhang, four small cylindrical black adjustable feet at bottom corners, each drawer front is a single flat panel with no seams or joints, overall proportions are exactly 400mm wide by 500mm tall by 300mm deep, symmetrical front layout with drawer pulls perfectly aligned on vertical centerline, hard-surface geometry with crisp edges, single object isolated on pure white background, studio soft lighting, product photography, 3D render quality"`,
  },
  {
    category: "medical",
    label: "medical / clinical / devices",
    example: `"A sterile white medical-grade PETG instrument tray, shallow rectangular form measuring 400mm by 300mm by 30mm, perfectly flat bottom surface for print bed adhesion, smooth non-porous matte surface on all faces, slightly raised 5mm rolled edges along all four sides for spill containment, rounded inner corners with 8mm radius for easy cleaning and sterilization, four small non-slip silicone feet pads at each bottom corner, single-piece seamless construction with no joints or seams visible, medical-grade clean aesthetic with uniform surface finish, single object isolated on pure white background, studio soft even lighting, clinical product photography, 3D render quality"`,
  },
  {
    category: "mechanical",
    label: "mechanical / robot / brackets / mounts",
    example: `"A precision black PLA mounting bracket, L-shaped angular form with two perpendicular flat arms each 60mm long, each arm has two countersunk M3 screw holes positioned 8mm from the outer edge, reinforced triangular gusset at the inner corner junction for structural rigidity, smooth flat matte surfaces on all faces, sharp chamfered 45-degree outer edges, 3mm uniform wall thickness throughout the entire part, visible grid infill pattern on the underside surface only, flat bottom surface parallel to build plate, clean industrial design with accurate mechanical proportions, single object isolated on pure white background, studio soft lighting, technical product photography, 3D render quality"`,
  },
  {
    category: "organic",
    label: "organic / props / decorative / characters",
    example: `"A smooth organic-shaped curved banana, elongated cylindrical form with gentle continuous curve tapering at both ends, bright yellow peel with subtle brown speckle texture and a small green tip at one end, a single natural ridge line running longitudinally along the outer curve, smooth matte surface with slight natural waxy sheen, realistic proportions with no sharp angles or flat faces, soft diffused studio lighting creating gentle shadow definition, single object centered and isolated on pure white background, product photography, 3D render quality"`,
  },
];

/** Map assetType string to the closest few-shot example. */
function getFewShotExample(assetType: string): FewShotExample {
  const t = assetType.toLowerCase();
  if (t.includes("furniture") || t.includes("storage") || t.includes("container")) return FEW_SHOT_EXAMPLES[0];
  if (t.includes("medical") || t.includes("clinical") || t.includes("device") || t.includes("surgical")) return FEW_SHOT_EXAMPLES[1];
  if (t.includes("robot") || t.includes("mechanical") || t.includes("vehicle") || t.includes("bracket") || t.includes("mount")) return FEW_SHOT_EXAMPLES[2];
  if (t.includes("organic") || t.includes("character") || t.includes("creature") || t.includes("prop") || t.includes("jewelry") || t.includes("decorative") || t.includes("abstract")) return FEW_SHOT_EXAMPLES[3];
  // Default: furniture is the most common 3D-print category
  return FEW_SHOT_EXAMPLES[0];
}

// ── Joint Prompt (Non-Streaming) ────────────────────────────────────

/** A starred (user-saved) prompt that serves as an extra few-shot example. */
export interface StarredExample {
  id: string;
  craftedPrompt: string;
  negativePrompt: string;
}

/**
 * Build a compact prompt that generates BOTH positive and negative
 * in a single LLM call. Uses built-in few-shot examples, enhanced
 * with any user-starred prompts for the same asset type.
 *
 * @param d         - Extracted spec data
 * @param starred   - Optional user-starred prompts to use as extra examples
 */
export function buildJointPrompt(d: PolishData, starred?: StarredExample[]): string {
  const fewShot = getFewShotExample(d.assetType);

  // Build starred examples section if any
  let starredSection = "";
  if (starred && starred.length > 0) {
    const examples = starred.slice(0, 3).map((s, i) =>
      `Starred Example ${i + 1}:\n"${s.craftedPrompt}"`
    ).join("\n\n");
    starredSection = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR PREVIOUS BEST PROMPTS (${starred.length} saved):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
These are prompts you previously starred as high quality. Match their style, precision, and level of detail.

${examples}
`;
  }

  return `You write prompts for a 3D-print reference image generator.
Style is ALWAYS: single object, white background, product photography, clean edges.

DATA:
- Object: ${d.name}
${d.color ? `- Color: ${d.color}` : ""}
${d.material ? `- Material: ${d.material}` : ""}
${d.shape ? `- Shape: ${d.shape}` : ""}
${d.dims ? `- Size: ${d.dims}` : ""}
${d.surf ? `- Surface: ${d.surf}` : ""}
${d.edge ? `- Edge: ${d.edge}` : ""}
${d.style ? `- Style: ${d.style}` : ""}
${d.comp ? `- Components: ${d.comp}` : ""}
${d.viewAngle ? `- View: ${d.viewAngle}` : ""}
${d.pose ? `- Pose: ${d.pose}` : ""}
${d.useEnv ? `- Environment: ${d.useEnv}` : ""}

REFERENCE (${fewShot.label}):
${fewShot.example}
${starredSection}
TASK:
1. Write ONE flowing English sentence (~150-200 words) describing this object for a 3D-print reference image generator.
   - FIRST 20 WORDS must contain: color, material, object name, and overall shape — these are weighted highest by the model
   - Describe WHERE each part is with exact spatial language: "at the top front face", "centered on the left side panel", "along the bottom edge"
   - Use specific measurements from the data (e.g. "400mm wide by 300mm tall")
   - Describe surface finish precisely: "smooth matte", "fine ribbed texture", "glossy polished"
   - Use hard-surface geometry language: "crisp edges", "clean bevels", "sharp corners", "flat faces"
   - Natural flowing language — never use "various", "multiple", "some", "several"
   - End with: "single object isolated on pure white background, studio soft even lighting, product photography, 3D render quality"

2. Generate a NEGATIVE prompt that prevents bad generations of THIS object.
   - ALWAYS start with: text, watermark, logo, multiple objects, two objects, duplicate, clone, background clutter, blur, distortion, depth of field, harsh shadows, bad lighting, dark, underexposed, overexposed, low quality, jpeg artifacts, rendering error, floating, crooked, tilted
   - Add 10-15 object-specific negatives:
     * Wrong materials that would ruin this specific object
     * Wrong colors that would clash (deny opposite colors)
     * Wrong geometry (deny: deformed, warped, melted, squashed, stretched, asymmetrical)
     * Missing or extra parts (deny: missing [key component], extra [component], wrong number of [parts])
     * Wrong surface (deny the opposite of each surface quality in the spec)
   - Comma-separated, under 400 chars

Output ONLY valid JSON: {"positive": "...", "negative": "..."}`;
}

// ── Streaming-Compatible Prompts ────────────────────────────────────

/**
 * Build the positive polish prompt for STREAMING mode.
 * Includes a few-shot example matched to the asset type.
 */
export function buildPositivePrompt(d: PolishData, starred?: StarredExample[]): string {
  const fewShot = getFewShotExample(d.assetType);

  return `You are generating prompts for Z-Image-Turbo, a flow-matching image model (CFG=1.0).
Natural flowing language works MUCH better than comma-separated tag lists.
The positive prompt is the ONLY control signal — every word matters.

Rewrite this structured product data into ONE flowing visual-description paragraph.

DATA:
- Object: ${d.name}
${d.color ? `- Color: ${d.color}` : ""}
${d.material ? `- Material: ${d.material}` : ""}
${d.shape ? `- Overall shape: ${d.shape}` : ""}
${d.dims ? `- Size: ${d.dims}` : ""}
${d.surf ? `- Surface: ${d.surf}` : ""}
${d.edge ? `- Edge treatment: ${d.edge}` : ""}
${d.style ? `- Design style: ${d.style}` : ""}
${d.comp ? `- Component details: ${d.comp}` : ""}

REFERENCE EXAMPLE (${fewShot.label} — study the style and spatial precision):
${fewShot.example}
${starred && starred.length > 0 ? `
YOUR PREVIOUS BEST PROMPTS (${starred.length} saved):
${starred.slice(0, 3).map((s, i) => `"${s.craftedPrompt}"`).join("\n")}
` : ""}
Rules:
- ONE flowing sentence-chain connected by commas — NOT bullet points
- Describe exactly WHERE each feature is (spatial positioning: "at the top", "on the front face")
- Describe each visible component with its own material, color, and shape
- Write in natural English with visual adjectives — be specific, never vague
- Put the most visually important info early for emphasis
- Keep it under 250 words
- Output ONLY the description text, nothing else`;
}

/**
 * Build the negative prompt for STREAMING mode.
 * Takes the FINAL positive text so the negative can target its specific weaknesses.
 */
export function buildNegativePrompt(d: PolishData, positiveText: string): string {
  // Truncate positive for context (first 300 chars is enough for the LLM to understand)
  const positiveExcerpt = positiveText.length > 300
    ? positiveText.slice(0, 300) + "..."
    : positiveText;

  return `You are an image-generation prompt engineer for Z-Image-Turbo (flow-matching, CFG=1.0).

Generate a negative prompt (things to AVOID) that specifically targets what could go wrong
with THIS exact positive prompt:

POSITIVE PROMPT:
"${positiveExcerpt}"

Object data for additional context:
- Name: ${d.name}
${d.color ? `- Color: ${d.color}` : ""}
${d.material ? `- Material: ${d.material}` : ""}
${d.shape ? `- Shape: ${d.shape}` : ""}
${d.surf ? `- Surface: ${d.surf}` : ""}
${d.edge ? `- Edge treatment: ${d.edge}` : ""}
${d.style ? `- Design style: ${d.style}` : ""}
${d.viewAngle ? `- Expected view: ${d.viewAngle}` : ""}
${d.pose ? `- Pose/orientation: ${d.pose}` : ""}
${d.useEnv ? `- Environment: ${d.useEnv}` : ""}
${d.comp ? `- Components: ${d.comp}` : ""}

Base negatives (MUST include these): text, watermark, logo, multiple objects, two, duplicate, clone, background clutter, blur, distortion, harsh shadows, bad lighting

Now add 8-15 object-specific negatives. Think adversarially about THIS positive prompt:
- What materials would look WRONG for this object?
- What colors would clash?
- What shapes/geometry errors could happen?
- What structural errors (missing components, wrong proportions)?
- What surface contradictions?
- What view angle errors?

Good examples:
- White cabinet → "dark colors, neon colors, metal handles, glass panels, transparent, glossy reflection, uneven gaps, misaligned drawers, missing drawer, extra drawer"
- Smooth plastic → "rough texture, wood grain, metallic reflection, glossy highlights, sharp corners, irregular edges, warped surface"
- Metal object → "plastic texture, wood, rust, tarnish, scratches, bent, deformed, rounded edges"

Rules:
- Comma-separated English
- Start with the base negatives
- Add 8-15 targeted negatives for THIS specific object
- Under 350 characters total
- Output ONLY the negative prompt text, nothing else`;
}

/**
 * Build a MODIFICATION prompt — the LLM edits the existing prompt based
 * on user feedback, preserving all elements that aren't explicitly changed.
 * Used by the iterate/feedback flow instead of regenerating from scratch.
 */
export function buildModifyPrompt(existingPrompt: string, feedback: string): string {
  return `You are editing an existing image-generation prompt based on user feedback.

EXISTING PROMPT (preserve all of this):
"${existingPrompt}"

USER FEEDBACK:
"${feedback}"

Your job: modify the existing prompt to incorporate the user's feedback.
CRITICAL: PRESERVE EVERYTHING that the user didn't ask to change.
- If they say "make it taller" → keep the color, material, shape, components exactly as-is, just adjust the dimensions
- If they say "add a handle" → add a handle description but keep everything else unchanged
- If they say "change to red" → change the color but keep all other details

Rules:
- Start from the existing prompt, not from scratch
- Only change what the feedback asks to change
- Keep the same flowing paragraph style
- Keep all spatial positioning, component descriptions, material, color, shape, surface details
- Output ONLY the modified prompt, nothing else`;
}

// ── Post-Polish Quality Validation ──────────────────────────────────

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResult {
  passed: boolean;
  score: number; // 0.0–1.0
  issues: ValidationIssue[];
}

/** Banned vague words that indicate insufficient detail. */
const VAGUE_WORDS = /\b(various|multiple|some|several|a few|many|different kinds|etc\.?|and so on)\b/i;

/** Minimum spatial indicator words that should appear in a good prompt. */
const SPATIAL_INDICATORS = /\b(top|bottom|front|back|left|right|side|edge|corner|center|above|below|near|behind|surface|face|panel|end)\b/i;

/**
 * Validate a polished positive prompt for completeness and quality.
 * Returns a score and list of issues. Used to decide whether to accept
 * or re-generate the prompt.
 */
export function validatePolish(
  prompt: string,
  d: PolishData,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const promptLower = prompt.toLowerCase();

  // 1. Length check
  if (prompt.length < 50) {
    issues.push({ severity: "error", message: "Prompt too short (< 50 chars) — likely incomplete" });
  } else if (prompt.length > 1500) {
    issues.push({ severity: "warning", message: "Prompt too long (> 1500 chars) — may lose model focus" });
  }

  // 2. Vague words check
  if (VAGUE_WORDS.test(prompt)) {
    const matches = prompt.match(VAGUE_WORDS) || [];
    issues.push({ severity: "error", message: `Vague words found: ${matches.join(", ")} — be specific` });
  }

  // 3. Spatial indicators check
  if (!SPATIAL_INDICATORS.test(prompt)) {
    issues.push({ severity: "warning", message: "No spatial indicators (top/bottom/front/side/edge/corner) — add position descriptions" });
  }

  // 4. Key spec fields present in prompt
  const fieldChecks: { label: string; value: string }[] = [
    { label: "material", value: d.material },
    { label: "color", value: d.color },
    { label: "shape", value: d.shape },
  ];
  for (const fc of fieldChecks) {
    if (fc.value && fc.value.length > 1) {
      // Check if at least one significant word from the field appears in the prompt
      const words = fc.value.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const found = words.some(w => promptLower.includes(w));
      if (!found && words.length > 0) {
        issues.push({ severity: "warning", message: `${fc.label} "${fc.value}" not clearly mentioned in prompt` });
      }
    }
  }

  // 5. Component details check
  if (d.comp && d.comp.length > 3) {
    const compWords = d.comp.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const found = compWords.some(w => promptLower.includes(w));
    if (!found && compWords.length > 0) {
      issues.push({ severity: "warning", message: `Component detail "${d.comp}" not clearly described` });
    }
  }

  // 6. Leading garbage check (LLM sometimes outputs conversational text before the prompt)
  const leadingGarbage = /^(sure|here|okay|let me|i will|below is|the following)/i;
  if (leadingGarbage.test(prompt.trim())) {
    issues.push({ severity: "error", message: "Leading conversational text — should start directly with the description" });
  }

  // 7. Bullet point or numbered list check
  if (/^[-•*\d)][\s]/.test(prompt.trim()) || /\n[-•*\d)]/.test(prompt)) {
    issues.push({ severity: "error", message: "Bullet points or numbered list — should be a flowing paragraph" });
  }

  // Compute score
  const errors = issues.filter(i => i.severity === "error").length;
  const warnings = issues.filter(i => i.severity === "warning").length;
  const score = Math.max(0, 1.0 - errors * 0.25 - warnings * 0.1);
  const passed = errors === 0;

  return { passed, score, issues };
}

/**
 * Build a repair prompt when validation fails. Tells the LLM what went wrong
 * and asks for a corrected version.
 */
export function buildRepairPrompt(
  d: PolishData,
  previousPrompt: string,
  issues: ValidationIssue[],
): string {
  const issueList = issues.map(i => `- [${i.severity}] ${i.message}`).join("\n");

  return `Your previous prompt had quality issues. Fix them and output ONLY the corrected prompt.

PREVIOUS PROMPT:
${previousPrompt}

ISSUES TO FIX:
${issueList}

OBJECT DATA (as a reminder):
- Object: ${d.name}
${d.color ? `- Color: ${d.color}` : ""}
${d.material ? `- Material: ${d.material}` : ""}
${d.shape ? `- Shape: ${d.shape}` : ""}
${d.dims ? `- Size: ${d.dims}` : ""}
${d.surf ? `- Surface: ${d.surf}` : ""}
${d.edge ? `- Edge: ${d.edge}` : ""}
${d.style ? `- Style: ${d.style}` : ""}
${d.comp ? `- Components: ${d.comp}` : ""}

RULES:
- ONE flowing sentence-chain — no bullet points
- Include spatial positioning (where each feature is)
- No vague words (various, multiple, some, several)
- Front-load key visual info (color + material + name) in first ~150 chars
- Output ONLY the corrected prompt, nothing else`;
}

// ── Cleaning ────────────────────────────────────────────────────────

/**
 * Lightly clean LLM output — only strip instruction-like prefixes.
 * Does NOT strip "single object" / "white background" — Z-Image benefits
 * from these tokens when generating single-product images.
 */
export function cleanPositive(text: string): string {
  return text
    .replace(/^positive prompt:?\s*/i, "")
    .replace(/^description:?\s*/i, "")
    .replace(/^(here is|here's)\s+(the|a)\s+(description|prompt)[:;,-]?\s*/i, "")
    .replace(/^(sure|okay|let me|i will|below is|the following)[^,]*[,:]?\s*/i, "")
    .trim();
}

// ── Vision Feedback Helpers ────────────────────────────────────────

/**
 * Apply vision feedback improvements to a positive prompt.
 * Pure string transformation — safe to import in client components.
 * Used by the frontend to merge AI-suggested fixes into the prompt.
 */
export function applyPromptImprovements(
  prompt: string,
  improvements: string[],
): string {
  if (improvements.length === 0) return prompt;

  const additions = improvements.filter(i =>
    i.toLowerCase().includes("add") ||
    i.toLowerCase().includes("include") ||
    i.toLowerCase().includes("specify")
  );

  let modified = prompt;
  for (const add of additions) {
    const clean = add
      .replace(/^add\s+/i, "")
      .replace(/^include\s+/i, "")
      .replace(/^(to|in)\s+(the\s+)?(positive\s+)?prompt,?\s*/i, "")
      .replace(/[""]/g, "")
      .trim();
    if (clean && !modified.includes(clean)) {
      modified = modified.replace(/\.$/, "") + ", " + clean;
    }
  }

  return modified;
}
