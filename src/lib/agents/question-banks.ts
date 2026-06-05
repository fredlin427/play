/**
 * Asset-Type-Specific Question Banks
 *
 * For each assetType, we define a prioritized list of questions
 * to ask during the multi-round Q&A phase. These serve as strong
 * guidance for the LLM, which can customize them further.
 *
 * Each question template specifies:
 * - field: dotted path into DesignSpec
 * - questions: { zh, en } question text
 * - options: { zh, en } preset clickable options (always includes "Other")
 * - priority: lower = ask earlier
 */

export interface QuestionTemplate {
  field: string;
  questions: { zh: string; en: string };
  options: { zh: string[]; en: string[] };
  priority: number;
}

export const QUESTION_BANKS: Record<string, QuestionTemplate[]> = {
  // ═══════════════════════════════════════════════════════════════════
  // Product / Prop — trays, organizers, tools, enclosures...
  // ═══════════════════════════════════════════════════════════════════
  product: [
    {
      field: "dimensions.approximateSize",
      questions: { zh: "大約尺寸是多少？", en: "What are the approximate dimensions?" },
      options: {
        zh: ["小於 100mm", "100–200mm", "200–500mm", "大於 500mm", "不確定"],
        en: ["Under 100mm", "100–200mm", "200–500mm", "Over 500mm", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "visual.material",
      questions: { zh: "希望用什麼材質打印？", en: "What material should be used for printing?" },
      options: {
        zh: ["PLA (剛性, 易打印)", "PETG (耐用, 耐熱)", "ABS (高強度)", "彈性材料 (TPU)", "樹脂 (高精度)", "不確定"],
        en: ["PLA (rigid, easy)", "PETG (durable, heat-resistant)", "ABS (strong)", "Flexible (TPU)", "Resin (high detail)", "Unsure"],
      },
      priority: 2,
    },
    {
      field: "visual.color",
      questions: { zh: "顏色偏好？", en: "Color preference?" },
      options: {
        zh: ["白色", "灰色", "黑色", "藍色", "透明", "自訂", "不確定"],
        en: ["White", "Grey", "Black", "Blue", "Transparent", "Custom", "Unsure"],
      },
      priority: 3,
    },
    {
      field: "structure.mainShape",
      questions: { zh: "主體是什麼形狀？", en: "What is the main shape?" },
      options: {
        zh: ["矩形/方形", "圓柱形", "球形", "不規則/有機形", "盒子狀", "托盤狀", "不確定"],
        en: ["Rectangular", "Cylindrical", "Spherical", "Irregular/Organic", "Box-like", "Tray-like", "Unsure"],
      },
      priority: 4,
    },
    {
      field: "structure.details",
      questions: { zh: "有哪些子元件/部件？請逐一列舉", en: "What sub-components/parts does it have? List each one." },
      options: {
        zh: ["抽屜/隔間", "門/面板", "把手/握柄", "輪子/腳座", "層架/托盤", "鉸鏈/滑軌", "無子元件", "不確定"],
        en: ["Drawers/Compartments", "Doors/Panels", "Handles/Grips", "Wheels/Feet", "Shelves/Trays", "Hinges/Slides", "No sub-components", "Unsure"],
      },
      priority: 5,
    },
    {
      field: "meta.style",
      questions: { zh: "風格偏好？", en: "Style preference?" },
      options: {
        zh: ["極簡/實用", "醫療級外觀", "工業風", "圓潤/有機", "幾何/科技感", "不確定"],
        en: ["Minimal/Utilitarian", "Medical-grade", "Industrial", "Smooth/Organic", "Geometric/Tech", "Unsure"],
      },
      priority: 6,
    },
    {
      field: "structure.hasHoles",
      questions: { zh: "需要有孔洞或通風口嗎？", en: "Does it need holes or vents?" },
      options: {
        zh: ["是 (通風用)", "是 (安裝用)", "否", "不確定"],
        en: ["Yes (ventilation)", "Yes (mounting)", "No", "Unsure"],
      },
      priority: 7,
    },
    {
      field: "structure.isHollow",
      questions: { zh: "物件是中空的還是實心的？", en: "Is the object hollow or solid?" },
      options: {
        zh: ["中空 (省料/輕量)", "實心 (強度優先)", "部分中空", "不確定"],
        en: ["Hollow (save material/weight)", "Solid (strength)", "Partially hollow", "Unsure"],
      },
      priority: 8,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // Medical — surgical tools, anatomical models, patient-specific...
  // ═══════════════════════════════════════════════════════════════════
  medical: [
    {
      field: "dimensions.approximateSize",
      questions: { zh: "大約尺寸是多少？", en: "What are the approximate dimensions?" },
      options: {
        zh: ["小於 50mm (小型器械)", "50–150mm (手持工具)", "150–300mm (中型)", "大於 300mm (大型)", "不確定"],
        en: ["Under 50mm (small instrument)", "50–150mm (handheld)", "150–300mm (medium)", "Over 300mm (large)", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "visual.material",
      questions: { zh: "需要什麼等級的材料？", en: "What material grade is required?" },
      options: {
        zh: ["標準 PLA/PETG", "醫療級 (生物相容)", "可消毒材料", "透明 (觀察用)", "彈性 (模擬組織)", "不確定"],
        en: ["Standard PLA/PETG", "Medical-grade (biocompatible)", "Sterilizable", "Transparent (observation)", "Flexible (tissue-like)", "Unsure"],
      },
      priority: 2,
    },
    {
      field: "useCase.primaryUse",
      questions: { zh: "主要臨床用途是什麼？", en: "What is the primary clinical use?" },
      options: {
        zh: ["手術導板/定位", "教學模型", "病人特定植入物", "康復輔具", "器械托盤/整理", "不確定"],
        en: ["Surgical guide", "Teaching model", "Patient-specific implant", "Rehab device", "Instrument tray", "Unsure"],
      },
      priority: 3,
    },
    {
      field: "structure.details",
      questions: { zh: "有哪些子元件？請逐一說明每個部件", en: "What sub-components does it have? Describe each part." },
      options: {
        zh: ["抽屜/隔間", "門/面板", "把手/握柄", "輪子/腳座", "層架/托盤", "支架/檯面", "無子元件", "不確定"],
        en: ["Drawers/Compartments", "Doors/Panels", "Handles/Grips", "Wheels/Feet", "Shelves/Trays", "Arms/Mounts", "No sub-components", "Unsure"],
      },
      priority: 4,
    },
    {
      field: "visual.material",
      questions: { zh: "每個部件用什麼材質？請逐一說明", en: "What material for each component? Specify per part." },
      options: {
        zh: ["不鏽鋼框架", "粉末塗層鋼", "層壓板面板", "鋁合金", "ABS 塑膠", "矽膠", "其他", "不確定"],
        en: ["Stainless steel frame", "Powder-coated steel", "Laminate panels", "Aluminum", "ABS plastic", "Silicone", "Other", "Unsure"],
      },
      priority: 5,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // Robot / Vehicle — mechanical, hard-surface, joints...
  // ═══════════════════════════════════════════════════════════════════
  robot: [
    {
      field: "structure.details",
      questions: { zh: "機械細節程度？", en: "Level of mechanical detail?" },
      options: {
        zh: ["簡化 (示意用)", "中等 (可見關節)", "精細 (所有螺絲/面板線)", "不確定"],
        en: ["Simplified (conceptual)", "Medium (visible joints)", "High (all screws/panels)", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "visual.material",
      questions: { zh: "主要材質質感？", en: "Main material look?" },
      options: {
        zh: ["金屬感", "塑膠/裝甲板", "啞光", "亮光", "雙色/分色", "不確定"],
        en: ["Metallic", "Plastic/Armor panel", "Matte", "Glossy", "Two-tone", "Unsure"],
      },
      priority: 2,
    },
    {
      field: "structure.hasMovingParts",
      questions: { zh: "有活動關節嗎？", en: "Does it have moving joints?" },
      options: {
        zh: ["是 (可動關節)", "否 (靜態模型)", "不確定"],
        en: ["Yes (articulated)", "No (static model)", "Unsure"],
      },
      priority: 3,
    },
    {
      field: "dimensions.approximateSize",
      questions: { zh: "模型尺寸？", en: "Model size?" },
      options: {
        zh: ["小於 100mm", "100–300mm", "大於 300mm", "桌面級", "不確定"],
        en: ["Under 100mm", "100–300mm", "Over 300mm", "Desktop scale", "Unsure"],
      },
      priority: 4,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // Character / Creature — organic shapes, figurines...
  // ═══════════════════════════════════════════════════════════════════
  character: [
    {
      field: "composition.poseOrOrientation",
      questions: { zh: "角色姿勢？", en: "Character pose?" },
      options: {
        zh: ["T-pose (標準)", "A-pose", "動態姿勢", "坐姿", "不確定"],
        en: ["T-pose (standard)", "A-pose", "Action pose", "Sitting", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "meta.style",
      questions: { zh: "藝術風格？", en: "Art style?" },
      options: {
        zh: ["寫實", "卡通/Q版", "動漫", "科幻", "低面數 (low poly)", "不確定"],
        en: ["Realistic", "Cartoon/Chibi", "Anime", "Sci-fi", "Low poly", "Unsure"],
      },
      priority: 2,
    },
    {
      field: "dimensions.approximateSize",
      questions: { zh: "公仔尺寸？", en: "Figurine size?" },
      options: {
        zh: ["小於 50mm (迷你)", "50–100mm (標準公仔)", "100–200mm (大公仔)", "大於 200mm", "不確定"],
        en: ["Under 50mm (mini)", "50–100mm (standard)", "100–200mm (large)", "Over 200mm", "Unsure"],
      },
      priority: 3,
    },
    {
      field: "visual.color",
      questions: { zh: "上色方案？", en: "Color scheme?" },
      options: {
        zh: ["單色 (後期上色)", "多色打印", "素體灰色", "不確定"],
        en: ["Single color (paint later)", "Multi-color print", "Primer grey", "Unsure"],
      },
      priority: 4,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // Jewelry — small, high-detail, precious materials...
  // ═══════════════════════════════════════════════════════════════════
  jewelry: [
    {
      field: "visual.material",
      questions: { zh: "金屬類型？", en: "Metal type?" },
      options: {
        zh: ["銀", "金", "玫瑰金", "鉑金", "黃銅", "不確定"],
        en: ["Silver", "Gold", "Rose gold", "Platinum", "Brass", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "dimensions.approximateSize",
      questions: { zh: "首飾尺寸？", en: "Jewelry size?" },
      options: {
        zh: ["戒指", "手鐲/手鏈", "項鍊墜", "耳環", "胸針", "不確定"],
        en: ["Ring", "Bracelet/Bangle", "Pendant", "Earrings", "Brooch", "Unsure"],
      },
      priority: 2,
    },
    {
      field: "structure.details",
      questions: { zh: "有寶石鑲嵌嗎？", en: "Any gem settings?" },
      options: {
        zh: ["是 (有寶石位)", "否 (純金屬)", "不確定"],
        en: ["Yes (stone setting)", "No (plain metal)", "Unsure"],
      },
      priority: 3,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // Furniture — larger objects, load-bearing, aesthetic...
  // ═══════════════════════════════════════════════════════════════════
  furniture: [
    {
      field: "dimensions.approximateSize",
      questions: { zh: "家具尺寸？", en: "Furniture dimensions?" },
      options: {
        zh: ["微型 (<100mm)", "桌面級 (100–300mm)", "1:6 比例", "1:12 比例", "自訂", "不確定"],
        en: ["Miniature (<100mm)", "Desktop (100–300mm)", "1:6 scale", "1:12 scale", "Custom", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "visual.material",
      questions: { zh: "材質質感？", en: "Material look?" },
      options: {
        zh: ["木紋", "金屬", "布料/軟墊", "塑膠", "混合材質", "不確定"],
        en: ["Wood grain", "Metal", "Fabric/Upholstered", "Plastic", "Mixed", "Unsure"],
      },
      priority: 2,
    },
    {
      field: "meta.style",
      questions: { zh: "設計風格？", en: "Design style?" },
      options: {
        zh: ["現代簡約", "北歐風", "工業風", "古典", "不確定"],
        en: ["Modern", "Scandinavian", "Industrial", "Classic", "Unsure"],
      },
      priority: 3,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // Abstract / unknown — catch-all fallback
  // ═══════════════════════════════════════════════════════════════════
  abstract_object: [
    {
      field: "structure.mainShape",
      questions: { zh: "基本幾何形狀？", en: "Basic geometric shape?" },
      options: {
        zh: ["矩形", "圓柱/圓形", "球形", "有機形", "多邊形", "不確定"],
        en: ["Rectangular", "Cylindrical/Round", "Spherical", "Organic", "Polygonal", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "visual.material",
      questions: { zh: "材質偏好？", en: "Material preference?" },
      options: {
        zh: ["PLA (剛性)", "PETG (耐用)", "彈性", "透明", "金屬感", "不確定"],
        en: ["PLA (rigid)", "PETG (durable)", "Flexible", "Transparent", "Metallic", "Unsure"],
      },
      priority: 2,
    },
    {
      field: "dimensions.approximateSize",
      questions: { zh: "大約尺寸？", en: "Approximate size?" },
      options: {
        zh: ["小 (<100mm)", "中 (100–300mm)", "大 (>300mm)", "不確定"],
        en: ["Small (<100mm)", "Medium (100–300mm)", "Large (>300mm)", "Unsure"],
      },
      priority: 3,
    },
    {
      field: "visual.color",
      questions: { zh: "顏色？", en: "Color?" },
      options: {
        zh: ["白色", "灰色", "黑色", "自訂", "不確定"],
        en: ["White", "Grey", "Black", "Custom", "Unsure"],
      },
      priority: 4,
    },
  ],

  unknown: [
    {
      field: "meta.assetType",
      questions: { zh: "這是什麼類型的物件？", en: "What type of object is this?" },
      options: {
        zh: ["產品/工具", "醫療器械", "機械/機器人", "角色/公仔", "首飾", "家具", "抽象物件", "不確定"],
        en: ["Product/Tool", "Medical device", "Mechanical/Robot", "Character/Figurine", "Jewelry", "Furniture", "Abstract", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "dimensions.approximateSize",
      questions: { zh: "大約尺寸？", en: "Approximate size?" },
      options: {
        zh: ["小 (<100mm)", "中 (100–300mm)", "大 (>300mm)", "不確定"],
        en: ["Small (<100mm)", "Medium (100–300mm)", "Large (>300mm)", "Unsure"],
      },
      priority: 2,
    },
  ],
};

/**
 * Look up the question bank for a given asset type.
 * Falls back to "unknown" bank if no specific bank exists.
 */
export function getQuestionBank(assetType: string): QuestionTemplate[] {
  return QUESTION_BANKS[assetType] || QUESTION_BANKS.unknown;
}
