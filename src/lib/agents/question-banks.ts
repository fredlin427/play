/**
 * Asset-Type-Specific Question Banks — V2 Deepened
 *
 * Each asset type has a prioritized list of questions for multi-round Q&A.
 * V2 adds deep, domain-specific questions that go beyond basic shape/color:
 *   medical → sterilization, biocompatibility, patient contact, clinical environment
 *   robot/mechanical → joint types, tolerances, structural reinforcement, assembly
 *   jewelry → gem type, setting style, clasp/chain, metal finish
 *   furniture → load-bearing, assembly method, surface durability
 *
 * Questions serve as strong guidance for the LLM, which can customize further.
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
      questions: { zh: "精確尺寸？請輸入 長x寬x高（mm），例如 400x300x200mm", en: "Exact dimensions? Enter LxWxH in mm, e.g. 400x300x200mm" },
      options: {
        zh: ["100x100x100mm", "200x150x100mm", "300x200x150mm", "400x300x200mm", "不確定"],
        en: ["100x100x100mm", "200x150x100mm", "300x200x150mm", "400x300x200mm", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "visual.material",
      questions: { zh: "用什麼材質打印？", en: "What material to print with?" },
      options: {
        zh: [
          "PLA — 新手友善 · 剛性 · 不耐熱(60°C) · 室內用",
          "PETG — 耐用 · 微彈 · 耐熱80°C · 食品級 · 醫療可用",
          "ABS — 高強度 · 耐衝擊 · 耐熱100°C · 需通風",
          "TPU — 橡膠彈性 · 減震 · 手機殼/密封圈",
          "Resin 樹脂 — 超高精度 · 光滑表面 · 珠寶級 · 需UV固化",
          "Nylon 尼龍 — 工業級 · 耐磨 · 自潤滑 · 齒輪/軸承",
          "Wood PLA — 木質外觀 · 可打磨染色 · 裝飾用",
          "不確定，幫我推薦",
        ],
        en: [
          "PLA — Beginner-friendly · Rigid · Low heat(60°C) · Indoor use",
          "PETG — Durable · Slight flex · 80°C · Food-safe · Medical OK",
          "ABS — High strength · Impact-resistant · 100°C · Needs ventilation",
          "TPU — Rubber-flexible · Shock absorption · Cases/gaskets",
          "Resin — Ultra detail · Glass-smooth · Jewelry-grade · UV cure needed",
          "Nylon — Industrial · Wear-resistant · Self-lubricating · Gears",
          "Wood PLA — Wood look & feel · Sandable · Decorative",
          "Unsure, recommend for me",
        ],
      },
      priority: 2,
    },
    {
      field: "visual.color",
      questions: { zh: "顏色偏好？如有不同部位請分別說明", en: "Color preference? Specify per part if different." },
      options: {
        zh: ["白色", "灰色", "黑色", "藍色", "透明/半透明", "雙色搭配", "不確定"],
        en: ["White", "Grey", "Black", "Blue", "Transparent/translucent", "Two-tone combo", "Unsure"],
      },
      priority: 3,
    },
    {
      field: "structure.mainShape",
      questions: { zh: "主體是什麼形狀？描述整體輪廓", en: "What is the main shape? Describe the overall form." },
      options: {
        zh: ["矩形/方形盒", "圓柱形", "球形/圓頂", "不規則/有機形", "托盤狀 (淺)", "L形/支架形", "不確定"],
        en: ["Rectangular box", "Cylindrical", "Spherical/dome", "Irregular/Organic", "Tray (shallow)", "L-shaped/bracket", "Unsure"],
      },
      priority: 4,
    },
    {
      field: "structure.details",
      questions: { zh: "有哪些子元件/部件？請逐一列舉並描述位置", en: "What sub-components/parts? List each with its position." },
      options: {
        zh: ["抽屜/隔間", "門/面板", "把手/握柄", "輪子/腳座", "層架/托盤", "鉸鏈/滑軌", "掛鉤/支架", "無子元件"],
        en: ["Drawers/Compartments", "Doors/Panels", "Handles/Grips", "Wheels/Feet", "Shelves/Trays", "Hinges/Slides", "Hooks/Mounts", "No sub-components"],
      },
      priority: 5,
    },
    {
      field: "visual.texture",
      questions: { zh: "表面質感如何？光澤度和觸感", en: "Surface finish? Describe gloss and texture." },
      options: {
        zh: ["光滑啞光", "亮光/光澤", "磨砂/霧面", "粗糙/紋理", "拉絲金屬紋", "完全平滑", "不確定"],
        en: ["Smooth matte", "Glossy/shiny", "Frosted/satin", "Rough/textured", "Brushed metal", "Perfectly smooth", "Unsure"],
      },
      priority: 6,
    },
    {
      field: "meta.style",
      questions: { zh: "設計風格？", en: "Design style?" },
      options: {
        zh: ["極簡/實用", "醫療級外觀", "工業風", "圓潤/有機", "幾何/科技感", "古典/裝飾", "無特定風格", "不確定"],
        en: ["Minimal/Utilitarian", "Medical-grade", "Industrial", "Smooth/Organic", "Geometric/Tech", "Classic/Ornate", "No specific style", "Unsure"],
      },
      priority: 7,
    },
    {
      field: "visual.edgeTreatment",
      questions: { zh: "邊緣如何處理？", en: "Edge treatment?" },
      options: {
        zh: ["銳利直角", "輕微倒角 (1-2mm)", "大圓角 (>3mm)", "斜邊", "不確定"],
        en: ["Sharp/square", "Slightly beveled (1-2mm)", "Large rounded (>3mm)", "Chamfered", "Unsure"],
      },
      priority: 8,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // Medical — surgical tools, clinical equipment, anatomical models...
  // ═══════════════════════════════════════════════════════════════════
  medical: [
    {
      field: "dimensions.approximateSize",
      questions: { zh: "大約尺寸是多少？（醫療器械尺寸至關重要）", en: "Approximate dimensions? (Critical for medical devices)" },
      options: {
        zh: ["50x50x50mm (微型器械)", "100x50x150mm (手持)", "200x150x300mm (中型)", "400x300x600mm (大型)", "600x600x600mm+", "不確定"],
        en: ["50x50x50mm (micro)", "100x50x150mm (handheld)", "200x150x300mm (medium)", "400x300x600mm (large)", "600x600x600mm+", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "visual.material",
      questions: { zh: "需要什麼等級的材料？（醫療用途有特殊要求）", en: "What material grade is required? (Medical use has special requirements)" },
      options: {
        zh: [
          "標準 PLA/PETG — 教學模型 · 低風險 · 易打印",
          "醫療級 PETG — 生物相容 · 可消毒 · 器械外殼",
          "TPU 彈性體 — 模擬軟組織 · 彈性輔具 · 減震",
          "Nylon 尼龍 — 可高壓滅菌 · 高強度 · 手術導板",
          "透明材料 — 觀察窗/流體管道 · 需透明",
          "抗菌/抗化學 — 特殊塗層需求",
          "不確定，幫我推薦",
        ],
        en: [
          "Standard PLA/PETG — Teaching models · Low risk · Easy print",
          "Medical PETG — Biocompatible · Sterilizable · Device housing",
          "TPU Flexible — Tissue-like · Soft aids · Shock absorption",
          "Nylon — Autoclavable · High strength · Surgical guides",
          "Transparent — Observation/fluid paths · Clarity needed",
          "Antimicrobial/Chemical — Special coating required",
          "Unsure, recommend for me",
        ],
      },
      priority: 2,
    },
    {
      field: "useCase.primaryUse",
      questions: { zh: "主要臨床用途是什麼？", en: "What is the primary clinical use?" },
      options: {
        zh: ["手術導板/定位器", "教學/解剖模型", "病人特定植入物/假體", "康復輔具/矯形器", "器械整理/托盤", "牙科應用", "診斷工具", "不確定"],
        en: ["Surgical guide/positioner", "Teaching/anatomical model", "Patient-specific implant", "Rehab/orthotic device", "Instrument tray/organizer", "Dental application", "Diagnostic tool", "Unsure"],
      },
      priority: 3,
    },
    {
      field: "useCase.environment",
      questions: { zh: "使用環境？（影響材料選擇和設計）", en: "Usage environment? (Affects material choice and design)" },
      options: {
        zh: ["手術室 (無菌要求)", "診間/門診", "實驗室", "病房/床邊", "教學/辦公", "居家照護", "不確定"],
        en: ["Operating room (sterile)", "Clinic/outpatient", "Laboratory", "Ward/bedside", "Teaching/office", "Home care", "Unsure"],
      },
      priority: 4,
    },
    {
      field: "structure.details",
      questions: { zh: "有哪些子元件？請逐一說明每個部件的位置和功能", en: "What sub-components? Describe each part's position and function." },
      options: {
        zh: ["抽屜/隔間", "門/面板 (鎖定?)", "把手/握柄", "醫療級腳輪", "層架/托盤", "可調節支架", "線纜管理", "無子元件"],
        en: ["Drawers/Compartments", "Doors/Panels (locking?)", "Handles/Grips", "Medical casters", "Shelves/Trays", "Adjustable arms", "Cable management", "No sub-components"],
      },
      priority: 5,
    },
    {
      field: "visual.color",
      questions: { zh: "顏色？（醫療環境通常有標準）", en: "Color? (Medical environments often have standards)" },
      options: {
        zh: ["白色 (醫療標準)", "淺灰", "淺藍/手術藍", "不鏽鋼色", "不確定"],
        en: ["White (medical standard)", "Light grey", "Surgical blue", "Stainless steel", "Unsure"],
      },
      priority: 6,
    },
    {
      field: "visual.texture",
      questions: { zh: "表面要求？（醫療清潔需求）", en: "Surface requirements? (Medical cleaning needs)" },
      options: {
        zh: ["完全平滑無孔 (易清潔)", "抗菌塗層", "輕微紋理 (防滑)", "啞光 (減少反光)", "不確定"],
        en: ["Smooth non-porous (easy clean)", "Antimicrobial coating", "Slight texture (non-slip)", "Matte (low glare)", "Unsure"],
      },
      priority: 7,
    },
    {
      field: "structure.hasHoles",
      questions: { zh: "需要通風/排水孔嗎？", en: "Need ventilation or drainage holes?" },
      options: {
        zh: ["是 (通風用)", "是 (排水/流體)", "否", "不確定"],
        en: ["Yes (ventilation)", "Yes (drainage/fluid)", "No", "Unsure"],
      },
      priority: 8,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // Robot / Vehicle / Mechanical — hard-surface, joints, structural...
  // ═══════════════════════════════════════════════════════════════════
  robot: [
    {
      field: "structure.details",
      questions: { zh: "機械細節程度？請描述每個可見的機械特徵", en: "Level of mechanical detail? Describe each visible mechanical feature." },
      options: {
        zh: ["簡化 (概念示意)", "中等 (可見關節/面板線)", "精細 (所有螺絲/鉚釘/液壓桿)", "超精細 (內部結構可見)", "不確定"],
        en: ["Simplified (conceptual)", "Medium (joints/panel lines)", "High (screws/rivets/hydraulics)", "Ultra (internal visible)", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "visual.material",
      questions: { zh: "主要材質質感？不同部位可用不同材質", en: "Main material look? Different parts can differ." },
      options: {
        zh: ["金屬感 (鋼/鋁)", "塑膠/裝甲板", "啞光戰術", "亮光/烤漆", "雙色分色", " weathered/舊化", "不確定"],
        en: ["Metallic (steel/aluminum)", "Plastic/Armor panel", "Matte tactical", "Glossy/painted", "Two-tone", "Weathered/worn", "Unsure"],
      },
      priority: 2,
    },
    {
      field: "structure.hasMovingParts",
      questions: { zh: "有活動關節/機構嗎？什麼類型？", en: "Moving joints/mechanisms? What type?" },
      options: {
        zh: ["是 (旋轉關節)", "是 (滑動機構)", "是 (鉸鏈)", "是 (球關節)", "否 (靜態模型)", "不確定"],
        en: ["Yes (rotation joints)", "Yes (sliding)", "Yes (hinges)", "Yes (ball joints)", "No (static model)", "Unsure"],
      },
      priority: 3,
    },
    {
      field: "dimensions.approximateSize",
      questions: { zh: "模型尺寸？", en: "Model dimensions?" },
      options: {
        zh: ["50x50x50mm", "100x50x50mm", "200x150x100mm", "400x300x200mm", "不確定"],
        en: ["50x50x50mm", "100x50x50mm", "200x150x100mm", "400x300x200mm", "Unsure"],
      },
      priority: 4,
    },
    {
      field: "visual.color",
      questions: { zh: "顏色方案？", en: "Color scheme?" },
      options: {
        zh: ["單色金屬灰", "軍武綠/沙色", "黑白對比", "鮮明警示色", "不確定"],
        en: ["Monochrome metal grey", "Military green/tan", "Black & white contrast", "Bright warning colors", "Unsure"],
      },
      priority: 5,
    },
    {
      field: "composition.poseOrOrientation",
      questions: { zh: "擺放姿勢？", en: "Pose/orientation?" },
      options: {
        zh: ["中立站立", "動態動作姿勢", "展開/變形狀態", "收納/折疊狀態", "懸浮展示", "不確定"],
        en: ["Neutral standing", "Dynamic action pose", "Deployed/transformed", "Folded/stowed", "Floating display", "Unsure"],
      },
      priority: 6,
    },
    {
      field: "visual.edgeTreatment",
      questions: { zh: "邊緣風格？", en: "Edge style?" },
      options: {
        zh: ["銳利機械邊", "倒角面板邊", "圓潤裝甲", "混合 (銳利+圓潤)", "不確定"],
        en: ["Sharp mechanical", "Beveled panel edges", "Rounded armor", "Mixed (sharp+round)", "Unsure"],
      },
      priority: 7,
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
        zh: ["T-pose (標準/綁定用)", "A-pose", "動態姿勢", "坐姿", "懸浮/飛行", "不確定"],
        en: ["T-pose (standard/rigging)", "A-pose", "Action pose", "Sitting", "Floating/flying", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "meta.style",
      questions: { zh: "藝術風格？", en: "Art style?" },
      options: {
        zh: ["寫實/真人比例", "卡通/Q版 (大頭)", "日系動漫", "美系漫畫", "科幻/賽博", "低面數 (low poly)", "不確定"],
        en: ["Realistic", "Cartoon/Chibi (big head)", "Anime style", "Comic/Western", "Sci-fi/Cyber", "Low poly", "Unsure"],
      },
      priority: 2,
    },
    {
      field: "dimensions.approximateSize",
      questions: { zh: "公仔尺寸？", en: "Figurine size?" },
      options: {
        zh: ["30x20x20mm (迷你)", "50x30x30mm (扭蛋)", "100x50x50mm (標準)", "200x100x100mm (大)", "300x200x200mm (雕像)", "不確定"],
        en: ["30x20x20mm (mini)", "50x30x30mm (gacha)", "100x50x50mm (standard)", "200x100x100mm (large)", "300x200x200mm (statue)", "Unsure"],
      },
      priority: 3,
    },
    {
      field: "visual.color",
      questions: { zh: "上色方案？", en: "Color/printing scheme?" },
      options: {
        zh: ["單色灰 (後期手塗)", "多色打印", "素體白 (底漆用)", "透明樹脂", "不確定"],
        en: ["Grey primer (hand-paint later)", "Multi-color print", "White primer", "Clear resin", "Unsure"],
      },
      priority: 4,
    },
    {
      field: "visual.texture",
      questions: { zh: "表面細節要求？", en: "Surface detail requirements?" },
      options: {
        zh: ["平滑 (卡通風格)", "中等細節 (衣物褶皺)", "高細節 (皮膚紋理/鱗片)", "不確定"],
        en: ["Smooth (cartoon style)", "Medium (fabric folds)", "High (skin texture/scales)", "Unsure"],
      },
      priority: 5,
    },
    {
      field: "structure.isHollow",
      questions: { zh: "打印方式？", en: "Print method?" },
      options: {
        zh: ["實心 (小型公仔)", "中空 (省料/大型)", "分件打印 (組裝)", "不確定"],
        en: ["Solid (small figurine)", "Hollow (save material/large)", "Multi-part (assemble)", "Unsure"],
      },
      priority: 6,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // Jewelry — small, high-detail, precious metal look...
  // ═══════════════════════════════════════════════════════════════════
  jewelry: [
    {
      field: "visual.material",
      questions: { zh: "金屬類型/顏色？", en: "Metal type/color?" },
      options: {
        zh: ["銀/白金", "黃金", "玫瑰金", "鉑金", "黃銅/復古", "黑化/氧化", "雙色", "不確定"],
        en: ["Silver/White gold", "Yellow gold", "Rose gold", "Platinum", "Brass/vintage", "Blackened/oxidized", "Two-tone", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "dimensions.approximateSize",
      questions: { zh: "首飾類型和尺寸？", en: "Jewelry type and size?" },
      options: {
        zh: ["戒指 (請輸入戒圍)", "手鐲/手鏈", "項鍊墜", "耳環 (勾式/夾式)", "胸針/別針", "袖扣", "不確定"],
        en: ["Ring (specify size)", "Bracelet/Bangle", "Pendant", "Earrings (hook/clip)", "Brooch/Pin", "Cufflinks", "Unsure"],
      },
      priority: 2,
    },
    {
      field: "structure.details",
      questions: { zh: "有寶石/鑲嵌嗎？請說明寶石類型和鑲嵌方式", en: "Gemstones/settings? Specify gem type and setting style." },
      options: {
        zh: ["是 (爪鑲)", "是 (包鑲/軌道鑲)", "是 (密釘鑲)", "是 (槽鑲)", "否 (純金屬設計)", "不確定"],
        en: ["Yes (prong setting)", "Yes (bezel/channel)", "Yes (pavé)", "Yes (channel set)", "No (plain metal)", "Unsure"],
      },
      priority: 3,
    },
    {
      field: "visual.finish",
      questions: { zh: "表面處理？", en: "Surface finish?" },
      options: {
        zh: ["高拋光/鏡面", "啞光/緞面", "錘打紋理", "雕刻/鏤空", "珠邊", "不確定"],
        en: ["High polish/mirror", "Matte/satin", "Hammered texture", "Engraved/filigree", "Milgrain", "Unsure"],
      },
      priority: 4,
    },
    {
      field: "meta.style",
      questions: { zh: "設計風格？", en: "Design style?" },
      options: {
        zh: ["經典/單鑽", "復古/維多利亞", "現代/幾何", "極簡", "自然/花卉", "Art Deco", "不確定"],
        en: ["Classic/solitaire", "Vintage/Victorian", "Modern/Geometric", "Minimalist", "Nature/Floral", "Art Deco", "Unsure"],
      },
      priority: 5,
    },
    {
      field: "composition.viewAngle",
      questions: { zh: "展示角度？", en: "Display angle?" },
      options: {
        zh: ["正面 (鑲嵌面朝前)", "3/4 角度 (最佳展示)", "側面輪廓", "頂視圖", "多角度", "不確定"],
        en: ["Front (setting facing)", "3/4 angle (best display)", "Side profile", "Top view", "Multi-angle", "Unsure"],
      },
      priority: 6,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════
  // Furniture — larger, structural, aesthetic, functional...
  // ═══════════════════════════════════════════════════════════════════
  furniture: [
    {
      field: "dimensions.approximateSize",
      questions: { zh: "家具尺寸？（比例模型還是實際尺寸）", en: "Furniture dimensions? (Scale model or actual size?)" },
      options: {
        zh: ["100x100x100mm (微型)", "200x150x100mm (桌面)", "300x200x200mm (1:6)", "150x100x100mm (1:12)", "600x400x400mm (實物)", "不確定"],
        en: ["100x100x100mm (mini)", "200x150x100mm (desktop)", "300x200x200mm (1:6)", "150x100x100mm (1:12)", "600x400x400mm (actual)", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "visual.material",
      questions: { zh: "材質質感？（打印時模擬什麼材質）", en: "Material look? (What material to simulate in print)" },
      options: {
        zh: ["木紋", "金屬", "布料/軟墊", "皮革", "塑膠/亞克力", "藤編/編織", "大理石/石材", "混合材質", "不確定"],
        en: ["Wood grain", "Metal", "Fabric/Upholstered", "Leather", "Plastic/Acrylic", "Wicker/Woven", "Marble/Stone", "Mixed", "Unsure"],
      },
      priority: 2,
    },
    {
      field: "meta.style",
      questions: { zh: "設計風格？", en: "Design style?" },
      options: {
        zh: ["現代簡約", "北歐/Scandinavian", "工業風", "中世紀現代", "古典/巴洛克", "日式/禪風", "鄉村/農舍", "不確定"],
        en: ["Modern minimal", "Scandinavian", "Industrial", "Mid-century modern", "Classic/Baroque", "Japanese/Zen", "Farmhouse/Rustic", "Unsure"],
      },
      priority: 3,
    },
    {
      field: "structure.details",
      questions: { zh: "有哪些結構部件？", en: "Structural components?" },
      options: {
        zh: ["抽屜", "門/櫃門", "層板/隔板", "椅腿/桌腳", "扶手", "靠背", "軟墊/坐墊", "五金配件", "不確定"],
        en: ["Drawers", "Doors/cabinet doors", "Shelves/dividers", "Legs/feet", "Armrests", "Backrest", "Cushion/seat pad", "Hardware/fittings", "Unsure"],
      },
      priority: 4,
    },
    {
      field: "visual.texture",
      questions: { zh: "表面處理？", en: "Surface treatment?" },
      options: {
        zh: ["光滑啞光", "木紋紋理", "亮光漆面", "啞光漆面", "原始/粗糙", "做舊/復古", "不確定"],
        en: ["Smooth matte", "Wood grain texture", "Glossy lacquer", "Matte lacquer", "Raw/rough", "Distressed/vintage", "Unsure"],
      },
      priority: 5,
    },
    {
      field: "visual.color",
      questions: { zh: "顏色方案？", en: "Color scheme?" },
      options: {
        zh: ["白色", "淺木色/橡木", "深木色/胡桃", "灰色", "黑色", "彩色", "雙色", "不確定"],
        en: ["White", "Light wood/Oak", "Dark wood/Walnut", "Grey", "Black", "Colorful", "Two-tone", "Unsure"],
      },
      priority: 6,
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
        zh: ["矩形/方形", "圓柱/圓形", "球形", "有機/自由形", "多邊形", "不確定"],
        en: ["Rectangular", "Cylindrical/Round", "Spherical", "Organic/freeform", "Polygonal", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "visual.material",
      questions: { zh: "材質偏好？", en: "Material preference?" },
      options: {
        zh: ["PLA (剛性)", "PETG (耐用)", "TPU (彈性)", "透明", "金屬感", "不確定"],
        en: ["PLA (rigid)", "PETG (durable)", "TPU (flexible)", "Transparent", "Metallic look", "Unsure"],
      },
      priority: 2,
    },
    {
      field: "dimensions.approximateSize",
      questions: { zh: "大約尺寸？", en: "Approximate size?" },
      options: {
        zh: ["50x50x50mm", "200x150x100mm", "400x300x200mm", "不確定"],
        en: ["50x50x50mm", "200x150x100mm", "400x300x200mm", "Unsure"],
      },
      priority: 3,
    },
    {
      field: "visual.color",
      questions: { zh: "顏色？", en: "Color?" },
      options: {
        zh: ["白色", "灰色", "黑色", "不確定"],
        en: ["White", "Grey", "Black", "Unsure"],
      },
      priority: 4,
    },
  ],

  unknown: [
    {
      field: "meta.assetType",
      questions: { zh: "這是什麼類型的物件？", en: "What type of object is this?" },
      options: {
        zh: ["產品/工具", "醫療器械", "機械/機器人", "角色/公仔", "首飾", "家具", "車輛/載具", "抽象物件", "不確定"],
        en: ["Product/Tool", "Medical device", "Mechanical/Robot", "Character/Figurine", "Jewelry", "Furniture", "Vehicle", "Abstract", "Unsure"],
      },
      priority: 1,
    },
    {
      field: "dimensions.approximateSize",
      questions: { zh: "大約尺寸？", en: "Approximate size?" },
      options: {
        zh: ["50x50x50mm", "200x150x100mm", "400x300x200mm", "不確定"],
        en: ["50x50x50mm", "200x150x100mm", "400x300x200mm", "Unsure"],
      },
      priority: 2,
    },
  ],
};

/**
 * Map asset type string to question bank key.
 * Handles aliases and close matches.
 */
const ASSET_TYPE_ALIASES: Record<string, string> = {
  product: "product",
  prop: "product",
  tool: "product",
  container: "product",
  organizer: "product",
  medical: "medical",
  clinical: "medical",
  device: "medical",
  surgical: "medical",
  dental: "medical",
  robot: "robot",
  mechanical: "robot",
  vehicle: "robot",
  drone: "robot",
  character: "character",
  creature: "character",
  figurine: "character",
  mini: "character",
  jewelry: "jewelry",
  jewellery: "jewelry",
  gem: "jewelry",
  ring: "jewelry",
  furniture: "furniture",
  cabinet: "furniture",
  shelf: "furniture",
  chair: "furniture",
  table: "furniture",
  abstract_object: "abstract_object",
  abstract: "abstract_object",
  sculpture: "abstract_object",
  unknown: "unknown",
};

/**
 * Look up the question bank for a given asset type.
 * Uses alias mapping, falls back to "unknown".
 */
export function getQuestionBank(assetType: string): QuestionTemplate[] {
  const key = ASSET_TYPE_ALIASES[assetType.toLowerCase()] || ASSET_TYPE_ALIASES.unknown;
  return QUESTION_BANKS[key] || QUESTION_BANKS.unknown;
}

/**
 * Get the recommended max Q&A rounds for an asset type.
 * Complex types (medical, robot, furniture) need more rounds.
 */
export function getMaxRounds(assetType: string): number {
  const key = ASSET_TYPE_ALIASES[assetType.toLowerCase()] || "unknown";
  switch (key) {
    case "medical":
      return 12; // Deep clinical: sterilization, patient contact, environment, cleaning, biocompatibility, dimensions, color, components, surface, edge, style
    case "robot":
      return 11; // Mechanical: joints, load, precision, assembly, moving parts, dimensions, material look, color, surface, edge, style
    case "furniture":
      return 11; // Structural: load-bearing, durability, assembly, dimensions, color, surface, components, edge, style, use
    case "jewelry":
      return 10; // Fine detail: metal type, gem, setting, finish, size, style, clasp, color, surface
    case "product":
      return 10; // Functional needs, load, heat, water, food, flexibility, dimensions, shape, color, components
    case "character":
      return 9;  // Pose, proportion, style, color, surface detail, size, base, expression
    default:
      return 8;
  }
}
