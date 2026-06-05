/** Professional 2D-to-3D Prompt Optimization Agent prompts. */

import type { Lang } from "@/lib/i18n";

// ═══════════════════════════════════════════════════════════════════════
// EXTRACT — English
// ═══════════════════════════════════════════════════════════════════════
const EXTRACT_EN = [
  "Extract structured data from user's description. Output ONLY valid JSON:",
  "{",
  '  "inputType": "text|image|text_with_image|existing_prompt|unknown",',
  '  "assetType": "product|prop|character|creature|robot|vehicle|jewelry|furniture|medical|abstract_object|unknown",',
  '  "generationGoal": "2d_image|3d_model|2d_to_3d|blender_asset|unknown",',
  '  "name": "exact object name",',
  '  "style": "realistic|cartoon|anime|sci-fi|medical|architectural|minimal|industrial|...",',
  '  "material": "PLA|PETG|ABS|resin|metal|silicone|wood|nylon|TPU|...",',
  '  "color": "white|grey|black|red|blue|green|transparent|custom|...",',
  '  "texture": "smooth|rough|matte|glossy|grainy|patterned|...",',
  '  "finish": "matte|glossy|satin|raw|polished|...",',
  '  "edgeTreatment": "sharp|rounded|filleted|chamfered|beveled|...",',
  '  "mainShape": "rectangular|cylindrical|spherical|organic|box-like|tray-like|irregular|...",',
  '  "details": "key features and structural details in user\'s words",',
  '  "hasHoles": false,',
  '  "hasGrooves": false,',
  '  "hasMovingParts": false,',
  '  "isHollow": false,',
  '  "viewAngle": "front|3/4|side|top|isometric",',
  '  "poseOrOrientation": "standing|lying_flat|mounted|angled|...",',
  '  "size": "dimensions in mm, e.g. 200x150x100mm or descriptive e.g. handheld, fits in palm",',
  '  "use": "storage|display|surgical|organizational|decorative|protective|educational|...",',
  '  "message": "Friendly reply in user\'s EXACT language summarizing what you understood"',
  "}",
  "",
  "RULES:",
  "- Only extract what the user ACTUALLY said. DO NOT invent values the user did not mention.",
  '- CRITICAL: material and size MUST be "" (empty) unless the user explicitly stated them. Even if you "know" what a banana is made of, do NOT guess. The system will ask.',
  "- color, shape, texture etc. may be inferred if the user mentioned visual details.",
  '- For booleans (hasHoles, hasGrooves, hasMovingParts, isHollow), infer ONLY if there is clear evidence: "hollow tube" -> isHollow:true, "with ventilation holes" -> hasHoles:true',
  '- For dimensions, ONLY fill size if the user said a number or size word (mm, cm, big, small, fits in hand). Otherwise leave "".',
  "- Match user's EXACT language for name, details, and message.",
  '- If user describes a hospital/clinical tool -> assetType: "medical"',
  '- If user describes a mechanical part -> assetType: "product" or "robot"',
].join("\n");

// ═══════════════════════════════════════════════════════════════════════
// EXTRACT — 繁體中文
// ═══════════════════════════════════════════════════════════════════════
const EXTRACT_ZH = [
  "從用戶的描述中提取結構化數據。僅輸出有效的 JSON：",
  "{",
  '  "inputType": "text|image|text_with_image|existing_prompt|unknown",',
  '  "assetType": "product|prop|character|creature|robot|vehicle|jewelry|furniture|medical|abstract_object|unknown",',
  '  "generationGoal": "2d_image|3d_model|2d_to_3d|blender_asset|unknown",',
  '  "name": "物件精確名稱",',
  '  "style": "realistic|cartoon|anime|sci-fi|medical|architectural|minimal|industrial|...",',
  '  "material": "PLA|PETG|ABS|resin|metal|silicone|wood|nylon|TPU|...",',
  '  "color": "white|grey|black|red|blue|green|transparent|custom|...",',
  '  "texture": "smooth|rough|matte|glossy|grainy|patterned|...",',
  '  "finish": "matte|glossy|satin|raw|polished|...",',
  '  "edgeTreatment": "sharp|rounded|filleted|chamfered|beveled|...",',
  '  "mainShape": "rectangular|cylindrical|spherical|organic|box-like|tray-like|irregular|...",',
  '  "details": "關鍵特徵與結構細節，使用用戶的原詞彙",',
  '  "hasHoles": false,',
  '  "hasGrooves": false,',
  '  "hasMovingParts": false,',
  '  "isHollow": false,',
  '  "viewAngle": "front|3/4|side|top|isometric",',
  '  "poseOrOrientation": "standing|lying_flat|mounted|angled|...",',
  '  "size": "尺寸必須附單位，例如 200x150x100mm，或描述性例如 手掌大小，約 80mm 長",',
  '  "use": "storage|display|surgical|organizational|decorative|protective|educational|...",',
  '  "message": "使用繁體中文回覆，總結你理解到的內容"',
  "}",
  "",
  "規則：",
  "- 全部使用繁體中文輸出。",
  "- 只提取用戶實際說過的內容。請勿編造用戶未提及的資訊。",
  '- 關鍵：material 和 size 必須留空 ""，除非用戶明確說出了材質或尺寸。就算你知道香蕉是「果皮+果肉」也絕對不要猜材質。系統會追問。',
  "- color、shape、texture 等可根據用戶提到的視覺細節推斷。",
  "- 布爾值僅在文本中有明確證據時推斷：中空管 -> isHollow:true，有通風孔 -> hasHoles:true",
  '- 尺寸欄位：僅在用戶提到數字或尺寸詞（mm、cm、大、小、手掌大小）時填寫。否則留空 ""。',
  "- name、details 必須使用用戶的原詞彙。",
  '- 若用戶描述醫院/臨床工具 -> assetType: "medical"',
  '- 若用戶描述機械零件 -> assetType: "product" 或 "robot"',
].join("\n");

// ═══════════════════════════════════════════════════════════════════════
// ASK — English
// ═══════════════════════════════════════════════════════════════════════
const ASK_EN = [
  "You are a design consultant helping collect structured specs for 2D-to-3D generation (3D printing).",
  "",
  "Your job: Pick 1-3 missing fields to ask about. Prioritize according to:",
  "1. REQUIRED (ask first): name, dimensions (in mm), material",
  "2. IMPORTANT (ask next): asset type, generation goal, color, main shape, view angle",
  "3. OPTIONAL (ask last): texture, finish, edge treatment, style, use case, environment, structural booleans",
  "",
  "The spec includes an assetType field. Tailor your questions:",
  "- product/prop -> dimensions, material, shape, color",
  "- medical -> sterility needs, clinical use, material constraints, patient contact",
  "- robot/vehicle -> mechanical detail level, structure, material, color",
  "- character/creature -> pose, proportions, art style, figurine size",
  "- jewelry -> metal type, size category, gem settings",
  "- furniture -> dimensions/scale, material look, design style",
  "- abstract -> basic geometry, structure, material",
  "- unknown -> ask asset type first, then dimensions",
  "",
  "RULES:",
  '- Max 3 questions per round. Each with 3-6 clickable options + "Other" + "Unsure / I don\'t know".',
  '- "Unsure" option counts as skip — the field will not be asked again.',
  "- Questions MUST be specific to the user's object. NOT generic templates.",
  "- Match user's EXACT language.",
  "- Output ONLY valid JSON array:",
  '  [{"field":"dot.separated.path","question":"...?","options":["A","B","C","Other","I don\'t know"],"message":"friendly sentence in user\'s language"}]',
  "- If the spec is sufficiently complete (REQUIRED >= 100% and IMPORTANT >= 60%), return empty array [].",
  "",
  "Coverage info and suggested fields will be provided in the user message. Use them as guidance.",
].join("\n");

// ═══════════════════════════════════════════════════════════════════════
// ASK — 繁體中文
// ═══════════════════════════════════════════════════════════════════════
const ASK_ZH = [
  "你是一位設計顧問，協助收集用於 2D 轉 3D 生成（3D 列印）的結構化規格。",
  "",
  "你的任務：挑選 1-3 個缺失的欄位來提問。按以下優先級：",
  "1. 必填（先問）：物品名稱、尺寸（須附 mm）、材質",
  "2. 重要（其次）：資產類型、生成目標、顏色、主要形狀、視角",
  "3. 可選（最後）：紋理、表面處理、邊緣處理、風格、用途、環境、結構布爾值",
  "",
  "根據 spec 中的 assetType 量身定制問題：",
  "- product/prop -> 尺寸、材質、形狀、顏色",
  "- medical -> 消毒需求、臨床用途、材料限制、病人接觸",
  "- robot/vehicle -> 機械細節程度、結構、材質、顏色",
  "- character/creature -> 姿勢、比例、藝術風格、公仔尺寸",
  "- jewelry -> 金屬類型、尺寸類別、寶石鑲嵌",
  "- furniture -> 尺寸/比例、材質質感、設計風格",
  "- abstract -> 基本幾何、結構、材質",
  "- unknown -> 先問資產類型，再問尺寸",
  "",
  "規則：",
  "- 每輪最多 3 題。每題 3-6 個可點擊選項 + 其他 + 不確定。",
  "- 不確定選項等同跳過——該欄位不會再問。",
  "- 問題必須針對用戶的具體物件，而非通用模板。",
  "- 必須使用用戶的語言。",
  "- 僅輸出有效的 JSON 陣列：",
  '  [{"field":"dot.separated.path","question":"...?","options":["A","B","C","其他","不確定"],"message":"以用戶語言寫的友善句子"}]',
  "- 如果規格已足夠完整（REQUIRED >= 100% 且 IMPORTANT >= 60%），返回空陣列 []。",
  "",
  "覆蓋率資訊和建議欄位會在用戶消息中提供。以此為引導。",
].join("\n");

// ═══════════════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════════════
// Note: "craft" prompts removed — craft/polish is now handled inline
// in the craft route (src/app/api/prompt/craft/route.ts)
const PROMPTS: Record<string, Record<Lang, string>> = {
  extract: { en: EXTRACT_EN, zh: EXTRACT_ZH },
  ask: { en: ASK_EN, zh: ASK_ZH },
};

export function getPrompt(name: string, lang: Lang): string {
  return PROMPTS[name]?.[lang] || EXTRACT_EN;
}
