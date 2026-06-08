/**
 * Self-Improving Question Memory
 *
 * Stores past Q&A questions and their effectiveness, then uses them
 * as few-shot examples in future sessions. Learns which questions
 * work best for each asset type.
 *
 * Stored as JSON in data/question-memory.json (git-ignored).
 */
import fs from "fs";
import path from "path";

// ── Types ───────────────────────────────────────────────────────────

export interface QuestionMemoryEntry {
  assetType: string;
  objectName: string;
  field: string;
  question: string;
  options: string[];
  /** User picked an option (not "Unsure") */
  wasAnswered: boolean;
  /** User typed custom text (not a preset option) */
  wasCustomAnswer: boolean;
  timestamp: number;
}

// ── Storage ─────────────────────────────────────────────────────────

const MEMORY_FILE = path.join(process.cwd(), "data", "question-memory.json");
const MAX_ENTRIES = 200;

function readMemory(): QuestionMemoryEntry[] {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch { /* file missing or corrupt — start fresh */ }
  return [];
}

function writeMemory(entries: QuestionMemoryEntry[]): void {
  try {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Keep only the most recent entries
    const trimmed = entries.slice(-MAX_ENTRIES);
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(trimmed, null, 2), "utf-8");
  } catch (e) {
    console.warn("[QMemory] Failed to write:", String(e).slice(0, 80));
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Record a question that was asked and answered during Q&A.
 * Called after the user answers (not on skip).
 */
export function recordQuestion(entry: Omit<QuestionMemoryEntry, "timestamp">): void {
  const entries = readMemory();
  entries.push({ ...entry, timestamp: Date.now() });
  writeMemory(entries);
}

/**
 * Record multiple questions at once (end of Q&A session).
 */
export function recordQuestions(entries: Omit<QuestionMemoryEntry, "timestamp">[]): void {
  if (entries.length === 0) return;
  const all = readMemory();
  for (const e of entries) {
    all.push({ ...e, timestamp: Date.now() });
  }
  writeMemory(all);
}

/**
 * Get top-N best questions for a given asset type.
 * "Best" = was answered (not skipped) and recent.
 */
export function getBestQuestions(assetType: string, limit = 5): QuestionMemoryEntry[] {
  const entries = readMemory();
  const matching = entries
    .filter(e => e.assetType === assetType || e.assetType === "product")
    .filter(e => e.wasAnswered)
    .sort((a, b) => b.timestamp - a.timestamp);

  // Deduplicate by question text
  const seen = new Set<string>();
  const unique: QuestionMemoryEntry[] = [];
  for (const e of matching) {
    const key = e.question.slice(0, 60);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(e);
      if (unique.length >= limit) break;
    }
  }
  return unique;
}

/**
 * Format top questions as few-shot examples for the LLM prompt.
 */
export function getMemoryExamples(assetType: string, lang: "zh" | "en", limit = 3): string {
  const best = getBestQuestions(assetType, limit);
  if (best.length === 0) return "";

  return best.map((e, i) =>
    `Example ${i + 1}: For a "${e.objectName}" (${e.assetType}), a good question was: "${e.question}" with options [${e.options.slice(0, 4).join(", ")}]`
  ).join("\n");
}

/**
 * Get memory stats for debugging.
 */
export function getMemoryStats(): { total: number; byType: Record<string, number> } {
  const entries = readMemory();
  const byType: Record<string, number> = {};
  for (const e of entries) {
    byType[e.assetType] = (byType[e.assetType] || 0) + 1;
  }
  return { total: entries.length, byType };
}
