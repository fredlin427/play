/**
 * 3D Printing Material Guide — beginner-friendly material information.
 * Shown during Q&A to help users understand their material choices.
 */

export interface MaterialInfo {
  name: string;
  label: { zh: string; en: string };
  strength: 1 | 2 | 3 | 4 | 5;      // 1=very low, 5=very high
  flexibility: 1 | 2 | 3 | 4 | 5;
  heatResistance: 1 | 2 | 3 | 4 | 5; // °C scale: 1=<60, 2=60-80, 3=80-100, 4=100-120, 5=>120
  printDifficulty: 1 | 2 | 3 | 4 | 5; // 1=beginner, 5=expert
  safety: "food-safe" | "low-odor" | "ventilation" | "toxic-resin" | "abrasive";
  surface: "matte" | "glossy" | "satin" | "rough" | "smooth";
  bestFor: { zh: string; en: string };
  avoid: { zh: string; en: string };
}

export const MATERIAL_GUIDE: MaterialInfo[] = [
  {
    name: "PLA",
    label: { zh: "PLA 聚乳酸", en: "PLA (Polylactic Acid)" },
    strength: 3, flexibility: 1, heatResistance: 1, printDifficulty: 1,
    safety: "low-odor", surface: "matte",
    bestFor: {
      zh: "新手入門、展示模型、收納盒、桌面裝飾、不需受力的物件。最易打印，幾乎零失敗。",
      en: "Beginners, display models, organizers, desk decor, non-load-bearing parts. Easiest to print, near-zero failures.",
    },
    avoid: {
      zh: "高溫環境（>60°C 會軟化）、戶外曝曬、受力結構件、需頻繁彎折的零件。",
      en: "Hot environments (>60°C softens), outdoor sun, load-bearing, parts that need repeated flexing.",
    },
  },
  {
    name: "PETG",
    label: { zh: "PETG 聚酯", en: "PETG (Polyester)" },
    strength: 4, flexibility: 2, heatResistance: 2, printDifficulty: 2,
    safety: "food-safe", surface: "glossy",
    bestFor: {
      zh: "醫療器械外殼、食物容器、需耐熱耐水的功能性零件。層間附著力強，比 PLA 耐用。",
      en: "Medical device housings, food containers, functional parts needing water/heat resistance. Strong layer adhesion, more durable than PLA.",
    },
    avoid: {
      zh: "需極高精度（會拉絲）、透明件（略帶霧面）、需支撐的複雜結構（支撐難拆）。",
      en: "Ultra-high detail (strings), crystal-clear transparency (slightly hazy), complex supports (hard to remove).",
    },
  },
  {
    name: "ABS",
    label: { zh: "ABS 工程塑料", en: "ABS (Engineering Plastic)" },
    strength: 5, flexibility: 2, heatResistance: 3, printDifficulty: 4,
    safety: "ventilation", surface: "satin",
    bestFor: {
      zh: "高強度機械零件、需耐衝擊的外殼、汽車零件、需耐 100°C 以上的物件。",
      en: "High-strength mechanical parts, impact-resistant housings, automotive parts, objects needing >100°C resistance.",
    },
    avoid: {
      zh: "密閉空間打印（有異味需通風）、新手（易翹曲需熱床+封箱）、食品接觸。",
      en: "Unventilated spaces (fumes), beginners (warps easily, needs enclosure+heated bed), food contact.",
    },
  },
  {
    name: "TPU",
    label: { zh: "TPU 彈性體", en: "TPU (Flexible)" },
    strength: 2, flexibility: 5, heatResistance: 2, printDifficulty: 3,
    safety: "low-odor", surface: "rough",
    bestFor: {
      zh: "手機殼、減震墊、密封圈、軟性醫療輔具、可彎折的穿戴裝置。像橡膠一樣有彈性。",
      en: "Phone cases, shock absorbers, gaskets, soft medical aids, bendable wearables. Rubber-like flexibility.",
    },
    avoid: {
      zh: "需高剛性的結構件、高速打印（需慢速）、細長/薄壁件（太軟會塌）。",
      en: "Rigid structural parts, fast printing (needs slow speed), thin/tall parts (too floppy).",
    },
  },
  {
    name: "Resin",
    label: { zh: "光固化樹脂", en: "UV Resin (SLA/DLP)" },
    strength: 2, flexibility: 1, heatResistance: 2, printDifficulty: 3,
    safety: "toxic-resin", surface: "smooth",
    bestFor: {
      zh: "珠寶首飾原型、微縮模型、牙科模型、極高細節的小物件。表面如玻璃般光滑。",
      en: "Jewelry prototypes, miniatures, dental models, ultra-high-detail small objects. Glass-smooth surface.",
    },
    avoid: {
      zh: "大型物件（打印機小）、受力件（脆）、新手（需清洗+UV固化+通風，液態樹脂有毒）。",
      en: "Large objects (small build volume), load-bearing (brittle), beginners (needs washing+UV curing+ventilation, liquid resin is toxic).",
    },
  },
  {
    name: "Nylon",
    label: { zh: "尼龍 PA", en: "Nylon (Polyamide)" },
    strength: 5, flexibility: 3, heatResistance: 4, printDifficulty: 4,
    safety: "low-odor", surface: "rough",
    bestFor: {
      zh: "齒輪、軸承、卡扣、高強度功能件。極耐磨，自潤滑特性，工業級強度。",
      en: "Gears, bearings, snap-fits, high-strength functional parts. Extremely wear-resistant, self-lubricating, industrial-grade.",
    },
    avoid: {
      zh: "新手（需高溫噴頭+乾燥箱，吸濕性強）、潮濕環境（會變軟）、精細外觀件。",
      en: "Beginners (needs high-temp nozzle+dry box, very hygroscopic), humid environments (softens), cosmetic parts.",
    },
  },
  {
    name: "Wood PLA",
    label: { zh: "木質 PLA", en: "Wood-filled PLA" },
    strength: 2, flexibility: 1, heatResistance: 1, printDifficulty: 2,
    safety: "low-odor", surface: "rough",
    bestFor: {
      zh: "裝飾品、家具模型、藝術品。有木頭外觀和氣味，可打磨染色像真木頭。",
      en: "Decorative items, furniture models, art pieces. Looks and smells like wood, can be sanded and stained like real wood.",
    },
    avoid: {
      zh: "受力結構（比普通 PLA 更弱）、高溫、需光滑表面（有木質紋理）。會磨損噴嘴。",
      en: "Structural parts (weaker than regular PLA), heat, smooth surfaces (has wood texture). Wears down nozzles.",
    },
  },
  {
    name: "Metal PLA",
    label: { zh: "金屬質感 PLA", en: "Metal-filled PLA" },
    strength: 2, flexibility: 1, heatResistance: 1, printDifficulty: 2,
    safety: "abrasive", surface: "rough",
    bestFor: {
      zh: "展示品、道具、珠寶原型。有金屬質感和重量，可拋光到接近真金屬光澤。",
      en: "Display pieces, props, jewelry prototypes. Metallic look and weight, can be polished to near-real metal shine.",
    },
    avoid: {
      zh: "受力件（比普通 PLA 脆）、食品接觸（含金屬粉末）。會嚴重磨損噴嘴（需硬化鋼噴嘴）。",
      en: "Load-bearing (more brittle than regular PLA), food contact (contains metal powder). Severely wears brass nozzles (needs hardened steel).",
    },
  },
];

/** Material categories for quick filtering when asking */
export const MATERIAL_CATEGORIES = {
  beginner: ["PLA", "PETG"],
  functional: ["PETG", "ABS", "Nylon", "TPU"],
  cosmetic: ["Resin", "Wood PLA", "Metal PLA"],
  medical: ["PETG", "TPU", "Nylon"], // biocompatible / sterilizable
  outdoor: ["ASA", "PETG", "ABS"],
};

/** Get material info by name (fuzzy match) */
export function getMaterialInfo(name: string): MaterialInfo | undefined {
  const lower = name.toLowerCase();
  return MATERIAL_GUIDE.find(m =>
    m.name.toLowerCase() === lower ||
    m.name.toLowerCase().includes(lower) ||
    lower.includes(m.name.toLowerCase())
  );
}

/** Format material properties as a compact bar-chart string */
export function formatMaterialBars(m: MaterialInfo): string {
  const bar = (v: number) => "█".repeat(v) + "░".repeat(5 - v);
  return [
    `Strength:      ${bar(m.strength)}`,
    `Flexibility:   ${bar(m.flexibility)}`,
    `Heat Resist:   ${bar(m.heatResistance)}`,
    `Easy to Print: ${bar(6 - m.printDifficulty)}`,
  ].join("\n");
}
