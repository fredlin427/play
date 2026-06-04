/**
 * Lightweight i18n — Chinese / English bilingual support.
 *
 * Language detection is designed for bilingual contexts (e.g., Hong Kong)
 * where users naturally mix Chinese and English in the same sentence.
 *
 * Strategy:
 * - Analyze the ENTIRE conversation history, not just the latest message.
 * - Count "content-bearing" characters only (CJK vs Latin letters).
 * - CJK characters are weighted 3× vs Latin letters.
 *   → Even heavily code-switched HK text stays zh.
 * - Once a project is Chinese, it stays Chinese.
 * - Only pure-English conversations get English.
 */

export type Lang = "zh" | "en";

// ── Character classification ───────────────────────────────────────

function isCJK(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x3000 && code <= 0x303f) || // CJK Punctuation
    (code >= 0xff00 && code <= 0xffef)    // Fullwidth forms
  );
}

function isLatinLetter(code: number): boolean {
  return (
    (code >= 0x0041 && code <= 0x005a) || // A-Z
    (code >= 0x0061 && code <= 0x007a)    // a-z
  );
}

// ── Language detection ──────────────────────────────────────────────

/**
 * Detect language from one or more messages.
 *
 * How it works:
 *   1. Join all messages into one corpus.
 *   2. Count CJK characters (×3 weight) vs Latin letters (×1 weight).
 *   3. If weighted CJK ≥ weighted Latin → zh (even if there are more Latin chars).
 *   4. This means "我想print一個tray" → zh because CJK signal is strong.
 *   5. Only pure English ("I need a tray") → en.
 *
 * CJK_WEIGHT = 3 means: a single Chinese character counts as much as 3 English letters.
 * This reflects the fact that one Chinese character carries more semantic weight.
 */
const CJK_WEIGHT = 3;

export function detectLang(messages: string | string[]): Lang {
  // Accept single string or array of messages
  const texts = Array.isArray(messages) ? messages : [messages];
  const corpus = texts.filter(Boolean).join(" ");

  if (corpus.length === 0) return "en";

  let cjkScore = 0;
  let latinScore = 0;

  for (const ch of corpus) {
    const code = ch.charCodeAt(0);
    if (isCJK(code)) {
      cjkScore += CJK_WEIGHT;
    } else if (isLatinLetter(code)) {
      latinScore += 1;
    }
    // Numbers, spaces, punctuation, symbols — ignored
  }

  const total = cjkScore + latinScore;

  // No content-bearing characters at all → default en
  if (total === 0) return "en";

  // If ANY CJK present, it's likely a Chinese speaker
  // Very low threshold: just 2 Chinese characters in a conversation is enough
  // This handles HK code-switching and cases like:
  //   "I need help with: Product Design Support" + "你好"
  //   → 2 CJK chars × 3 = 6, ~30 Latin = 30, ratio = 16.7% → zh ✓
  const cjkRatio = cjkScore / total;

  if (process.env.NODE_ENV !== "production") {
    console.log(`[i18n] detectLang: cjk=${cjkScore}/${CJK_WEIGHT}=${cjkScore / CJK_WEIGHT}chars, latin=${latinScore}chars, ratio=${cjkRatio.toFixed(2)} → ${cjkRatio >= 0.08 ? "zh" : "en"}`);
  }

  // 8% threshold: ANY Chinese characters in the conversation = Chinese
  return cjkRatio >= 0.08 ? "zh" : "en";
}

/**
 * Get language preference for an existing project.
 * Once a project has Chinese messages, it stays Chinese.
 * This prevents flipping when the user types a short English reply like "ok".
 */
export function getProjectLang(
  existingMessages: string[],
  persistedLang?: string | null
): Lang {
  // If project has a stored preference, use it
  if (persistedLang === "zh" || persistedLang === "en") {
    return persistedLang;
  }

  // Otherwise detect from all existing messages
  if (existingMessages.length === 0) return "en";
  return detectLang(existingMessages);
}

// ══════════════════════════════════════════════════════════════════════
// UI Dictionary
// ══════════════════════════════════════════════════════════════════════

const dict: Record<string, Record<Lang, string>> = {
  // Home
  "home.title": { zh: "醫院 3D 列印", en: "Hospital 3D Printing" },
  "home.subtitle": { zh: "AI 助手", en: "AI Assistant" },
  "home.description": {
    zh: "為您的科室申請客製化 3D 列印物品 — 無需 CAD 技能。AI 助手逐步引導您，從想法到專業設計方案。",
    en: "Request custom 3D printed items for your department — no CAD skills needed. Our AI assistant guides you step by step, from idea to professional design brief.",
  },
  "home.start": { zh: "開始新請求", en: "Start New Request" },
  "home.dashboard": { zh: "工程師儀表板", en: "Engineer Dashboard" },

  // Categories
  "cat.custom-container": { zh: "客製容器", en: "Custom Container" },
  "cat.custom-container.desc": { zh: "醫療用品收納盒、托盤、整理器", en: "Boxes, trays, organizers for medical supplies" },
  "cat.tool-holder": { zh: "工具支架", en: "Tool Holder" },
  "cat.tool-holder.desc": { zh: "醫療工具的掛架、支架、固定座", en: "Racks, mounts, brackets for medical tools" },
  "cat.product-design": { zh: "產品設計支援", en: "Product Design Support" },
  "cat.product-design.desc": { zh: "協助設計新的醫療產品原型", en: "Help designing a new medical product" },
  "cat.stl-check": { zh: "STL 檔案檢查", en: "Existing STL Check" },
  "cat.stl-check.desc": { zh: "檢查 STL 檔案是否適合列印", en: "Review an STL file for printability" },
  "cat.material-suggestion": { zh: "材料建議", en: "Material Suggestion" },
  "cat.material-suggestion.desc": { zh: "根據您的需求推薦合適的材料", en: "Get material recommendations for your use case" },
  "cat.prompt-helper": { zh: "提示詞助手", en: "Prompt Helper" },
  "cat.prompt-helper.desc": { zh: "協助撰寫 Text-to-3D 提示詞", en: "Get help writing a text-to-3D prompt" },
  "cat.not-sure": { zh: "不確定", en: "Not Sure" },
  "cat.not-sure.desc": { zh: "告訴我們您的需求，我們來想辦法", en: "Tell us what you need help with" },

  // Chat
  "chat.title": { zh: "新的 3D 列印請求", en: "New 3D Print Request" },
  "chat.placeholder": {
    zh: "描述您的需求…（例如：「我需要一個放 8 把手術剪刀的容器，約 200mm 寬」）",
    en: "Describe what you need... (e.g., 'I need a container to hold 8 surgical scissors, about 200mm wide')",
  },
  "chat.placeholder.complete": {
    zh: "您的請求已完成！您可以繼續提問…",
    en: "Your request is complete! You can ask follow-up questions...",
  },
  "chat.empty": {
    zh: "在下方描述您的需求。AI 助手會逐步引導您。",
    en: "Describe what you need in the chat below. The AI assistant will guide you step by step.",
  },
  "chat.enterHint": { zh: "Enter 發送，Shift+Enter 換行", en: "Press Enter to send, Shift+Enter for new line" },
  "chat.assessing": { zh: "評估中…", en: "Assessing..." },
  "chat.collecting": { zh: "收集資訊中", en: "Collecting Info" },
  "chat.analyzing": { zh: "分析中", en: "Analyzing" },
  "chat.complete": { zh: "已完成", en: "Complete" },
  "chat.needsReview": { zh: "需審查", en: "Needs Review" },
  "chat.draft": { zh: "草稿", en: "Draft" },
  "chat.viewDetails": { zh: "查看完整詳情 →", en: "View Full Details →" },
  "chat.summary": { zh: "請求摘要", en: "Request Summary" },
  "chat.processing": { zh: "處理中…", en: "Processing..." },

  // Pipeline steps
  "pipeline.analyzing": { zh: "正在分析您的需求…", en: "Analyzing your request..." },
  "pipeline.risk": { zh: "正在評估風險等級…", en: "Assessing risk level..." },
  "pipeline.clarification": { zh: "檢查是否需要更多資訊…", en: "Checking if more info is needed..." },
  "pipeline.design_brief": { zh: "正在撰寫設計摘要…", en: "Writing design brief..." },
  "pipeline.material": { zh: "正在推薦材料…", en: "Recommending materials..." },
  "pipeline.prompt": { zh: "正在生成 3D 提示詞…", en: "Creating text-to-3D prompt..." },
  "pipeline.ticket": { zh: "正在建立工單…", en: "Generating job ticket..." },

  // Risk
  "risk.unassessed": { zh: "未評估", en: "Unassessed" },
  "risk.low": { zh: "低風險", en: "Low Risk" },
  "risk.medium": { zh: "中風險", en: "Medium Risk" },
  "risk.high": { zh: "⚠ 高風險", en: "⚠ High Risk" },

  // Dashboard
  "dash.title": { zh: "工程師儀表板", en: "Engineer Dashboard" },
  "dash.total": { zh: "全部項目", en: "Total Projects" },
  "dash.highRisk": { zh: "高風險", en: "High Risk" },
  "dash.pending": { zh: "待處理", en: "Pending" },
  "dash.completed": { zh: "已完成", en: "Completed" },
  "dash.search": { zh: "搜尋項目…", en: "Search projects..." },
  "dash.allRisk": { zh: "所有風險等級", en: "All Risk Levels" },
  "dash.allStatus": { zh: "所有狀態", en: "All Statuses" },
  "dash.noProjects": { zh: "沒有找到項目", en: "No projects found" },
  "dash.newRequest": { zh: "新請求", en: "New Request" },

  // Summary panel
  "summary.pipeline": { zh: "智能體流程", en: "Agent Pipeline" },
  "summary.intake": { zh: "需求提取", en: "Intake" },
  "summary.risk": { zh: "風險評估", en: "Risk Assessment" },
  "summary.clarification": { zh: "資訊確認", en: "Clarification" },
  "summary.designBrief": { zh: "設計摘要", en: "Design Brief" },
  "summary.material": { zh: "材料推薦", en: "Material Rec" },
  "summary.prompt": { zh: "3D 提示詞", en: "3D Prompt" },
  "summary.ticket": { zh: "工單", en: "Job Ticket" },
  "summary.ready": { zh: "已生成", en: "Ready" },
  "summary.positive": { zh: "正向提示詞", en: "Positive Prompt" },
  "summary.negative": { zh: "負向提示詞", en: "Negative Prompt" },
  "summary.waiting": {
    zh: "您的請求摘要會在這裡即時顯示。",
    en: "Your request summary will appear here as the AI processes your information.",
  },

  // Footer
  "footer.disclaimer": {
    zh: "本系統不提供臨床決策。所有設計在使用於病患照護前必須經由合格人員審查。",
    en: "This system does not provide clinical decisions. All designs must be reviewed by qualified staff before use in patient care.",
  },
};

/**
 * Get a translated string. Falls back to `en` if key or language missing.
 */
export function t(key: string, lang: Lang): string {
  const entry = dict[key];
  if (!entry) return key;
  return entry[lang] || entry["en"] || key;
}

/**
 * Full dictionary for bulk export if needed.
 */
export function getDictionary(lang: Lang): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(dict)) {
    result[key] = t(key, lang);
  }
  return result;
}
