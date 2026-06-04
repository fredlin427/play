# 醫院 3D 列印 AI 助手 — 完整項目書

> 版本：MVP v2.0 | 日期：2026-06-03 | 作者：Claude Code

---

## 目錄

1. [項目概述](#1-項目概述)
2. [技術棧](#2-技術棧)
3. [環境需求](#3-環境需求)
4. [架構總覽](#4-架構總覽)
5. [功能清單](#5-功能清單)
6. [數據庫設計](#6-數據庫設計)
7. [智能體系統](#7-智能體系統)
8. [Sketch-to-3D 工作流](#8-sketch-to-3d-工作流)
9. [優化歷程](#9-優化歷程)
10. [使用手冊](#10-使用手冊)
11. [維護手冊](#11-維護手冊)
12. [開發迭代指南](#12-開發迭代指南)
13. [Bug 預防策略](#13-bug-預防策略)
14. [優化方向](#14-優化方向)
15. [最終目標](#15-最終目標)

---

## 1. 項目概述

醫院 3D 列印 AI 助手是一個完整的 Web 應用系統，旨在幫助**不具備 CAD 技能的醫護人員**提交 3D 列印請求。

### 核心價值

- **降低門檻**：護士、醫生無需學習 CAD 即可申請 3D 列印
- **AI 引導**：逐步引導填寫需求，不需要寫技術規格
- **安全第一**：自動風險分級，高風險項目阻止自動生成
- **端到端**：從文字對話、手繪草圖到 3D 模型生成，一站式完成
- **隱私保護**：所有 AI 處理在本地完成，數據不外洩

### 當前狀態

| 模組 | 狀態 | 說明 |
|------|------|------|
| 文字對話請求 | ✅ 完成 | 7 步智能體流水線 |
| 聊天介面 | ✅ 完成 | 右側摘要面板、即時進度 |
| 工程師儀表板 | ✅ 完成 | 項目管理、狀態更新 |
| 手繪轉 3D | ✅ 完成 | tldraw 繪圖 + Python CAD |
| 3D 預覽 | ✅ 完成 | Three.js 旋轉/縮放 |
| 中英雙語 | ✅ 完成 | 自動偵測 + 手動切換 |
| 本地 LLM | ✅ 完成 | Ollama 支援 |
| 隱私保護 | ✅ 完成 | 零外部 API |

---

## 2. 技術棧

### 前端

| 技術 | 版本 | 用途 |
|------|------|------|
| Next.js | 16.2.7 | App Router 框架 |
| React | 19.2.4 | UI 框架 |
| TypeScript | 5.x | 類型安全 |
| Tailwind CSS | v4 | 樣式（CSS-based config） |
| shadcn/ui | 手寫 | UI 組件（9 個基礎組件） |
| tldraw | 5.0.1 | 2D 繪圖畫布 |
| Three.js | 0.184.0 | 3D STL 預覽 |
| Lucide React | 1.17.0 | 圖標庫 |

### 後端

| 技術 | 版本 | 用途 |
|------|------|------|
| Next.js API Routes | 16.2.7 | REST API |
| Prisma | 7.8.0 | ORM |
| SQLite | — | 數據庫（better-sqlite3 驅動） |
| OpenAI SDK | 6.41.0 | LLM HTTP 客戶端 |
| Zod | 4.4.3 | Schema 驗證 |

### Python CAD 微服務

| 技術 | 版本 | 用途 |
|------|------|------|
| FastAPI | 0.136.3 | HTTP 框架 |
| Uvicorn | 0.48.0 | ASGI 伺服器 |
| NumPy | 2.4.6 | 數值計算 |
| numpy-stl | 3.2.0 | STL 檔案生成 |

### LLM

| 模型 | 大小 | 用途 |
|------|------|------|
| qwen2.5:3b | 2GB | 日常開發（速度快） |
| qwen2.5:14b | 9GB | 生產使用（品質高） |

---

## 3. 環境需求

### 硬體

- **最低**：8GB RAM、無需 GPU（CPU 推理）
- **建議**：16GB RAM、NVIDIA GPU 4GB+ VRAM（GPU 加速）
- **存儲**：2GB（代碼 + 依賴）+ 模型空間（3B=2GB, 14B=9GB）

### 軟體

- **Node.js** ≥ 18.x
- **Python** ≥ 3.10（用於 CAD 服務）
- **Ollama**（可選，用於本地 LLM）
- **Windows / macOS / Linux**

### 環境變數（`.env`）

```bash
LLM_PROVIDER=local              # local | mock
LOCAL_LLM_BASE_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=qwen2.5:3b     # 或 qwen2.5:14b
LOCAL_LLM_API_KEY=ollama
CAD_SERVICE_URL=http://127.0.0.1:8000
```

---

## 4. 架構總覽

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Home    │  │  Chat    │  │ Dashboard│  │  Sketch   │  │
│  │  /       │  │  /chat   │  │/dashboard│  │/sketch/new│  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────┘  │
│                       │               │          │         │
│                       ▼               ▼          ▼         │
│              ┌─────────────────────────────────────────┐   │
│              │        Next.js API Routes                │   │
│              │  /api/chat  /api/projects  /api/cad     │   │
│              └─────────────────────────────────────────┘   │
│                  │          │              │               │
│         ┌────────┘          │              └──────────┐    │
│         ▼                   ▼                         ▼    │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐ │
│  │  Agent      │   │  Prisma      │   │  Python CAD     │ │
│  │  Pipeline   │   │  (SQLite)    │   │  FastAPI:8000   │ │
│  │  (10 agents)│   └──────────────┘   │  numpy-stl      │ │
│  └──────┬──────┘                      └─────────────────┘ │
│         │                                                  │
│         ▼                                                  │
│  ┌──────────────────────────────────────────────┐         │
│  │  LLM Layer (src/lib/llm.ts)                  │         │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │         │
│  │  │  Local   │  │  Mock    │  │  Zod      │   │         │
│  │  │  Ollama  │  │  Engine  │  │  Validate │   │         │
│  │  └──────────┘  └──────────┘  └──────────┘   │         │
│  └──────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 資料流

```
用戶輸入 → detectLang() → POST /api/chat
  → processMessage(state, msg, history, lang)
  → Intake → Risk → Clarification → [若缺資訊則返回]
  → DesignBrief → Material → Prompt → Ticket
  → 儲存至 SQLite → 返回 { outputs, nextStep }
  → 前端 ChatInterface → SummaryPanel 顯示結果
```

### Sketch-to-3D 資料流

```
用戶繪圖 → tldraw snapshot JSON → POST /api/projects
  → Sketch Understanding Agent → DesignState
  → CAD Template Agent → 選擇模板
  → POST /api/cad/generate → Python CAD 服務
  → numpy-stl 生成 STL → 儲存至 uploads/
  → 創建 DesignVersion → Three.js 預覽
  → 用戶請求修改 → Revision Agent
  → applyRevisions() → 重新生成 → 新版本
```

---

## 5. 功能清單

### ✅ 已實現

| 功能 | 說明 |
|------|------|
| AI 對話助手 | 7 步智能體流水線，引導非技術用戶填寫需求 |
| 風險評估 | 雙層（關鍵字 + AI），低/中/高三級 |
| 設計摘要生成 | 專業 markdown 格式 |
| 材料推薦 | 主要材料 + 備選 + 列印方法 + 後處理 |
| Text-to-3D 提示詞 | 正向 + 負向提示詞，用於 AI 3D 生成工具 |
| 內部工單 | 結構化 JSON，含優先級、審查需求 |
| 工程師儀表板 | 項目列表、統計、篩選、操作按鈕 |
| 中英雙語 | 自動偵測（8% CJK 門檻）+ 手動切換 |
| 本地 LLM | Ollama 支援，零外部 API |
| Mock 模式 | 無需 LLM 即可運行 |
| 手繪畫布 | tldraw 繪圖工具，支援形狀/文字/標註 |
| 3D 預覽 | Three.js STLLoader + OrbitControls |
| Python CAD 服務 | FastAPI + numpy-stl，3 種模板 |
| CAD 生成 API | 參數驗證（Zod）+ 高風險阻止 + 版本追蹤 |
| 修改工作流 | AI 解析修改 → 結構化變更 → 重新生成 |
| 可列印性檢查 | 壁厚、特徵尺寸、打印機體積 |
| STL 下載 | 直接下載生成的 STL 檔案 |
| 數據持久化 | SQLite + Prisma 7，完整 CRUD |

### ❌ 未實現（MVP 範圍外）

- 用戶認證 / 登入系統
- STL 檔案上傳與分析
- Email 通知
- 完整 CadQuery（目前用 numpy-stl 簡單幾何）
- STEP 檔案導出
- Docker 容器化
- CI/CD Pipeline
- 單元測試 / E2E 測試

---

## 6. 數據庫設計

### ER 圖

```
Project (1) ──────< Message (N)
Project (1) ──────< FileAttachment (N)
Project (1) ──────< DesignVersion (N)
```

### Project 表（主要欄位）

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | CUID | 主鍵 |
| title | String | 項目名稱 |
| projectType | String | 類型（container/tray/tool-holder...） |
| riskLevel | String | unassessed/low/medium/high |
| status | String | draft/collecting/analyzing/complete/needs_review |
| rawUserInput | String | 原始用戶輸入 |
| structuredRequirements | JSON String | 結構化需求 |
| designBrief | Text | 設計摘要（markdown） |
| materialRecommendation | Text | 材料推薦 |
| generatedPrompt | Text | 正向 3D 提示詞 |
| negativePrompt | Text | 負向提示詞 |
| ticket | JSON String | 工單 |
| **sketchData** | JSON String | 繪圖數據（tldraw snapshot + notes） |
| **designState** | JSON String | 設計參數（尺寸、隔層、特徵） |
| **cadTemplate** | String | CAD 模板名稱 |
| **stlFilePath** | String | STL 檔案路徑 |
| **currentVersion** | Int | 當前版本號 |

### DesignVersion 表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | CUID | 主鍵 |
| projectId | String | 外鍵 → Project |
| version | Int | 版本號（與 projectId 組成唯一鍵） |
| designState | JSON String | 該版本的設計參數 |
| stlFilePath | String | STL 檔案路徑 |
| stlFileSize | Int | 檔案大小（bytes） |
| promptUsed | String | 生成時使用的參數 |
| notes | String | 修改備註 |
| status | String | draft/generated/approved/rejected |

### Message 表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | CUID | 主鍵 |
| projectId | String | 外鍵 → Project |
| role | String | user/assistant/system |
| content | Text | 訊息內容 |
| createdAt | DateTime | 建立時間 |

---

## 7. 智能體系統

### 10 個智能體

#### 文字對話類（7 個）

| # | 智能體 | 輸入 | 輸出 | 驗證 |
|---|--------|------|------|------|
| 1 | **Intake** | 用戶文字 | 結構化需求 JSON | Zod |
| 2 | **Risk** | 需求 + 關鍵字 | 風險等級 + 原因 | Zod |
| 3 | **Clarification** | 缺失欄位 | 提問列表 / 完成標記 | Zod |
| 4 | **Design Brief** | 結構化需求 | Markdown 設計摘要 | — |
| 5 | **Material** | 需求 + 用途 | Markdown 材料推薦 | — |
| 6 | **Prompt** | 需求 + 摘要 | 正向/負向提示詞 JSON | Zod |
| 7 | **Ticket** | 全部資訊 | 工單 JSON | Zod |

#### 繪圖轉 3D 類（3 個）

| # | 智能體 | 輸入 | 輸出 | 驗證 |
|---|--------|------|------|------|
| 8 | **Sketch Understanding** | 草圖 + 文字 | DesignState JSON | Zod |
| 9 | **CAD Template** | DesignState | 模板選擇 JSON | Zod |
| 10 | **Revision** | 修改請求 + 當前狀態 | 結構化變更指令 JSON | Zod |

### JSON 驗證流程

```
LLM 回應 → extractJson() 清理 → JSON.parse → Zod safeParse
  ↓ 失敗 → 重試（repair prompt, temp=0）
  ↓ 再失敗 → Safe Fallback（硬編碼安全值）
```

### 模擬模式（Mock）

11 個 mock 函數，根據 system prompt 關鍵字匹配：
- `mockIntake` — 正則提取尺寸/材料/用途
- `mockRisk` — 關鍵字風險分類
- `mockClarification` — 智能判斷資訊完整性
- `mockDesignBrief` / `mockMaterial` / `mockPrompt` / `mockTicket`
- `mockSketchUnderstanding` / `mockCadTemplate` / `mockRevision`
- `mockGeneral` — 通用回覆

---

## 8. Sketch-to-3D 工作流

### 完整步驟

```
1. 用戶打開 /sketch/new
2. 在 tldraw 畫布上繪製頂視圖 + 側視圖
3. 填寫尺寸（可選）和文字備註
4. 點擊「儲存並繼續」
5. 系統創建 Project + 儲存 SketchData JSON
6. 跳轉至 /projects/[id]/design
7. 頁面載入設計參數（從 SketchData 提取）
8. 用戶點擊「生成 3D 模型」
9. 系統調用 /api/cad/generate → Python 服務
10. Python 生成 STL → 儲存 → 創建 DesignVersion
11. 前端顯示 Three.js 3D 預覽 + 可列印性檢查
12. 用戶輸入修改請求 → Revision Agent 解析
13. applyRevisions() 更新設計參數
14. 重新生成 → 新版本
15. 點擊下載 STL
```

### Python CAD 服務詳情

**端點：**

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/health` | 健康檢查 |
| POST | `/generate/container` | 生成容器（盒體 + 隔板） |
| POST | `/generate/tray` | 生成托盤（淺容器，無蓋） |
| POST | `/generate/tool-holder` | 生成工具架（壁掛 + 槽位） |
| GET | `/download/{filename}` | 下載 STL |

**可列印性檢查：**
- 壁厚 ≥ 1.2mm
- 特徵尺寸 ≥ 2mm
- 整體尺寸 ≤ 220×220×250mm（標準 3D 打印機）
- 大面積平面警告（可能翹曲）

---

## 9. 優化歷程

### 第一階段：基礎 MVP

- Next.js 專案初始化
- Prisma + SQLite 數據庫
- shadcn/ui 基礎組件
- 首頁、聊天頁、儀表板
- 7 步智能體流水線
- OpenAI API 整合（後改為本地 LLM）

### 第二階段：流水線強化

- **確定性流水線**：單次 API 呼叫執行到底，自動完成所有生成步驟
- **Console Log**：每個智能體步驟輸出 `[AgentPipeline] 時間戳 [名稱] 動作`
- **右側摘要面板**：即時顯示進度 + 生成輸出
- **智能 Mock**：正則解析用戶輸入提取尺寸/材質，智能判斷資訊完整性

### 第三階段：LLM 架構重構

- **Provider 架構**：支援 local / mock 雙模式
- **Zod 驗證**：8 個 Schema + fallback 工廠
- **JSON 修復**：extractJson() + 自動重試（repair prompt）
- **隱私保護**：safeLog() 在 production 模式不記錄原始訊息
- **多 API 支援**：OpenAI / DeepSeek / Ollama / vLLM 皆可

### 第四階段：中英雙語

- 完整繁中 prompt 模板（10 個 agent 各有 zh/en 版本）
- 智慧語言偵測：CJK 加權 ×3，8% 門檻
- 手動語言切換按鈕（全站）
- 香港中英夾雜優化（整段對話歷史判斷）

### 第五階段：Sketch-to-3D

- tldraw 繪圖畫布
- Three.js 3D 預覽（STLLoader + OrbitControls）
- Python CAD 微服務（FastAPI + numpy-stl）
- 3 個新智能體（Sketch Understanding / CAD Template / Revision）
- 版本管理（DesignVersion 模型）
- 可列印性檢查
- 醫療安全阻止（高風險項目禁止 CAD 生成）

---

## 10. 使用手冊

### 10.1 安裝與啟動

```bash
# 1. 克隆專案
cd hospital-3d-print-ai

# 2. 安裝 Node.js 依賴
npm install

# 3. 初始化數據庫
npx prisma generate
npx prisma db push

# 4. 安裝 Python 依賴（可選）
pip install fastapi uvicorn numpy numpy-stl

# 5. 設定環境變數
cp .env .env.local
# 編輯 .env.local，設定 LLM_PROVIDER=local 或 mock

# 6. 啟動 LLM（可選）
ollama pull qwen2.5:3b
ollama serve

# 7. 啟動 CAD 服務（可選）
cd cad_service
python main.py

# 8. 啟動 Next.js
cd ..
npm run dev
# 打開 http://localhost:3000
```

### 10.2 文字對話模式（/chat）

1. 打開首頁 → 點擊「開始新請求」
2. 選擇類別（或直接打字描述需求）
3. AI 會問你幾個問題：用途、尺寸、材質、清潔方式…
4. 回答問題，AI 逐步收集資訊
5. 資訊足夠後，自動生成：
   - 📋 設計摘要
   - 🔬 材料推薦
   - ✨ 3D 提示詞
   - 🎫 內部工單
6. 所有結果顯示在右側摘要面板

### 10.3 手繪轉 3D 模式（/sketch/new）

1. 打開首頁 → 點擊「繪圖轉 3D」
2. 在畫布上繪製頂視圖和側視圖
3. 用文字工具標註尺寸
4. 填寫類別、尺寸、備註
5. 點擊「儲存並繼續」
6. 在設計頁面點擊「生成 3D 模型」
7. 旋轉/縮放查看 3D 預覽
8. 如需修改，在修改框中輸入變更請求
9. 點擊「修改並重新生成」→ 新版本
10. 點擊「STL」下載檔案

### 10.4 工程師儀表板（/dashboard）

1. 查看所有項目的列表和統計
2. 按風險等級、狀態篩選
3. 點擊項目進入詳情頁
4. 查看完整對話歷史、設計摘要、工單
5. 操作：批准、請求更多資訊、拒絕、標記進行中、標記完成

### 10.5 語言切換

- **自動**：系統根據你的輸入自動選擇中文/英文
- **手動**：點擊頁面右上角的 `中文` / `EN` 按鈕強制切換

---

## 11. 維護手冊

### 11.1 日常檢查

```bash
# 確認 Ollama 運行
curl http://localhost:11434/api/tags

# 確認 CAD 服務運行
curl http://127.0.0.1:8000/health

# 確認 Next.js 運行
curl http://localhost:3000

# 查看數據庫
npx prisma studio   # 打開 Prisma 管理介面
```

### 11.2 數據庫維護

```bash
# 備份數據庫
cp prisma/dev.db prisma/dev.db.backup

# 重置數據庫（清除所有數據）
rm prisma/dev.db
npx prisma db push

# 遷移（如果修改了 schema）
npx prisma db push   # 開發環境
# 生產環境應使用 npx prisma migrate dev
```

### 11.3 更新模型

```bash
# 更新 Ollama 模型
ollama pull qwen2.5:14b   # 拉取最新版本
ollama pull qwen2.5:3b

# 查看已安裝模型
ollama list
```

### 11.4 常見問題排查

| 問題 | 可能原因 | 解決方案 |
|------|---------|---------|
| 頁面載入但無法發送訊息 | LLM 未啟動 | `ollama serve` |
| AI 回覆很慢 | 模型太大 | 改用 `qwen2.5:3b` |
| CAD 生成失敗 | Python 服務未啟動 | `cd cad_service && python main.py` |
| 數據庫錯誤 | Prisma 未同步 | `npx prisma db push` |
| 中文變亂碼 | 瀏覽器編碼問題 | 確認 UTF-8 |
| tldraw 畫布不顯示 | JS 未載入 | 等待幾秒，或刷新頁面 |

### 11.5 日誌位置

- **Next.js**：終端機輸出（開發模式）
- **Python CAD**：終端機輸出
- **Ollama**：`~/.ollama/logs/`
- **Prisma**：終端機輸出

---

## 12. 開發迭代指南

### 12.1 如何新增一個智能體

1. **定義 Schema**（`src/lib/schemas.ts`）：新增 Zod schema + 型別 + fallback
2. **編寫 Prompt**（`src/lib/agents/prompts.ts`）：新增 zh/en prompt + 註冊到 `PROMPTS`
3. **編寫 Mock**（`src/lib/llm.ts`）：新增 mock 函數 + 新增 `else if` 分支
4. **編寫 Agent**（`src/lib/agents/`）：匯出 agent 函數，使用 `callLLMStructured` 或 `callLLM`
5. **接入 Pipeline**（`src/lib/agents/orchestrator.ts`）：在 `processMessage` 中調用
6. **新增 DB 欄位**（`prisma/schema.prisma`）：如需要
7. **更新 ProjectState**（`src/lib/project-state.ts`）：新增介面欄位
8. **更新 API Route**（`src/app/api/chat/route.ts`）：序列化/反序列化新欄位
9. **更新 i18n**（`src/lib/i18n.ts`）：新增 UI 文字

### 12.2 如何新增一個 CAD 模板

1. `cad_service/services/cad_engine.py`：新增生成函數
2. `cad_service/routes/generate.py`：新增路由端點
3. `src/lib/agents/cad-template.ts`：更新支援列表
4. `src/app/api/cad/generate/route.ts`：更新 `getCadEndpoint()`

### 12.3 如何新增一個頁面

1. `src/app/新路徑/page.tsx`：遵循現有模式（client component + fetch + loading/error states）
2. 如需動態路由：`src/app/新路徑/[id]/page.tsx`
3. 如需重組件：`src/components/新功能/`
4. 更新 `CLAUDE.md` 和 `README.md`

### 12.4 編碼規範

- **組件**：使用 `"use client"` 標記客戶端組件
- **API Route**：`params` 必須 `await`
- **類型**：避免 `unknown`，使用具體型別或 Zod schema
- **語言**：所有 UI 文字使用 `t(en, zh)` 模式
- **載入狀態**：使用 `loading` boolean + Skeleton
- **錯誤處理**：try/catch + `setError()` + 顯示給用戶

---

## 13. Bug 預防策略

### 13.1 類型安全

- **Zod 驗證**：所有 LLM 輸出經過 schema 驗證，失敗自動 fallback
- **TypeScript strict**：`tsconfig.json` 中 `"strict": true`
- **API 輸入驗證**：使用 `z.object()` 驗證 request body

### 13.2 錯誤隔離

- **Mock 降級**：LLM 失敗 → 自動切換 mock 模式
- **Agent 隔離**：單個 agent 失敗不影響其他 agent
- **CAD 超時**：30 秒 timeout，顯示明確錯誤訊息
- **數據庫事務**：Prisma 自動處理事務

### 13.3 數據完整性

- **JSON 序列化**：複雜物件存儲前經 `JSON.stringify()`
- **唯一約束**：`DesignVersion.projectId + version` 唯一鍵
- **外鍵級聯**：`onDelete: Cascade` 確保關聯數據一致性

### 13.4 測試策略

- **編譯檢查**：每次改動後 `npm run build`（確保 0 錯誤）
- **API 測試**：用 curl 測試關鍵端點
- **Mock 模式測試**：設置 `LLM_PROVIDER=mock` 測試完整流程
- **單元測試**（待實現）：Jest + React Testing Library
- **E2E 測試**（待實現）：Playwright

### 13.5 常見 Bug 預防

| Bug 類型 | 預防措施 |
|---------|---------|
| LLM JSON 格式錯誤 | Zod 驗證 + 重試 + fallback |
| LLM 語言錯誤 | 整個 prompt 使用目標語言（非附加指令） |
| 前端狀態不同步 | API 返回時刷新整個 project |
| CAD 生成超時 | AbortSignal.timeout(30000) |
| 數據庫欄位遺失 | buildStateFromProject 顯式映射每個欄位 |
| 中文字元亂碼 | UTF-8 Content-Type header |
| Prisma 適配器錯誤 | 明確指定 adapter + 測試 |

---

## 14. 優化方向

### 短期（1-2 週）

| 項目 | 說明 | 優先級 |
|------|------|--------|
| 串流回應（Streaming） | Server-Sent Events，即時顯示每個階段輸出 | 高 |
| 單元測試 | Jest + React Testing Library，覆蓋 agent 和 API | 高 |
| 錯誤訊息中文化 | 目前部分錯誤只有英文 | 中 |
| Docker 化 | 一鍵啟動全部服務 | 中 |

### 中期（1-3 個月）

| 項目 | 說明 | 優先級 |
|------|------|--------|
| STL 檔案上傳 | 上傳現有 STL，AI 分析 printability | 高 |
| CadQuery 整合 | 從 numpy-stl 升級到完整 CSG | 高 |
| STEP 檔案導出 | 支援 STEP 格式（工程圖） | 中 |
| 用戶認證 | 簡單密碼保護或 Hospital ID 登入 | 中 |
| 多模板支援 | 支架、夾具、導管架等 10+ 模板 | 中 |
| UI 動畫優化 | 過渡動畫、載入骨架屏 | 低 |

### 長期（3-6 個月）

| 項目 | 說明 |
|------|------|
| RAG 知識庫 | 醫院內部材料庫 + 過往案例，AI 基於歷史推薦 |
| 切片整合 | 連接 CuraEngine/PrusaSlicer，預估列印時間和材料用量 |
| 多用戶協作 | 請求者 + 工程師 + 審查者角色 |
| 手機適配 | 響應式設計優化 + PWA |
| 審計日誌 | 完整操作記錄（誰在何時做了什麼） |
| CI/CD | GitHub Actions 自動測試 + 部署 |

---

## 15. 最終目標

### 短期目標（MVP v3.0）

- ✅ 文字對話請求
- ✅ 手繪轉 3D
- 🔲 STL 上傳分析
- 🔲 串流回應
- 🔲 測試覆蓋率 60%+

### 中期目標（v1.0 正式版）

- 完整的 10+ CAD 模板（覆蓋 90% 醫院常見需求）
- CadQuery 全功能整合
- 用戶認證 + 角色權限
- Docker 一鍵部署
- 性能優化（3D 預覽 < 2 秒載入）

### 長期目標（v2.0）

- 成為醫院標配的 3D 列印管理平台
- 與醫院資訊系統（HIS/PACS）整合
- ML 模型根據過往案例自動推薦設計
- 支援多院區部署
- 符合醫療器材軟體標準（IEC 62304）

---

> **文件版本**：v1.0 | **最後更新**：2026-06-03
>
> 本文件隨項目持續更新。任何重大架構變更請同步更新此文件。
