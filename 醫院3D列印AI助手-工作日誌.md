---
tags: [project, 3d-printing, ai, hospital]
date: 2026-06-03
---

# 醫院 3D 列印 AI 助手 — 項目工作日誌

## 項目概述

為醫院 3D 列印部門建立了一個 MVP Web 應用，幫助不具備 CAD 技能的醫護人員提交 3D 列印請求。AI 助手逐步引導使用者填寫需求，自動生成設計摘要、材料推薦、3D 提示詞和工單。

## 技術棧

- **框架**：Next.js 16 (App Router) + TypeScript
- **樣式**：Tailwind CSS v4 + 自訂醫療主題（白底、淺藍色點綴）
- **UI 組件**：基於 shadcn/ui 模式手寫 9 個基礎組件
- **資料庫**：SQLite + Prisma 7 ORM（3 個模型：Project, Message, FileAttachment）
- **AI**：OpenAI SDK → DeepSeek API，支援 Mock 模式自動切換

## 核心功能

### 四個頁面
- `/` 首頁：標題、說明、開始按鈕、7 個類別卡片
- `/chat` 聊天頁：AI 對話介面 + 右側即時摘要面板
- `/dashboard` 儀表板：項目列表、統計、篩選器
- `/dashboard/[id]` 詳情頁：完整資訊 + 對話歷史 + 操作按鈕

### 七大智能體流水線
`Intake → Risk → Clarification → Design Brief → Material → Prompt → Ticket`

| 智能體 | 職責 |
|--------|------|
| Intake | 從使用者描述中提取結構化需求 |
| Risk | 分類風險為低/中/高 |
| Clarification | 每次最多問 3-5 個缺失資訊問題 |
| Design Brief | 建立專業設計摘要 |
| Material | 推薦材料與列印方法 |
| Prompt | 生成 Text-to-3D 正向/負向提示詞 |
| Ticket | 生成內部工單 |

### 醫療安全規則
- 高風險（手術導板、植入物、鑽孔導板）→ 強制人工審查，不生成製造指令
- 中風險（病患接觸、臨床使用）→ 建議審查
- 低風險（收納工具、辦公用品）→ 標準流程
- 系統絕不聲稱設計具有臨床安全性

## 第二階段改進（本次完成）

1. **流水線一次性執行到底** — 單次 API 呼叫自動走完整個流程，不需多次往返
2. **Console Log 調試** — 每個智能體步驟輸出 `[AgentPipeline] 時間戳 [名稱] 動作 + 數據`
3. **右側摘要面板** — 即時顯示流水線進度 + 四個生成輸出（設計摘要、材料推薦、3D 提示詞、工單）
4. **智能 Mock 模式** — 正則解析用戶輸入提取尺寸/材質，智能判斷資訊完整性
5. **多 API 支援** — 同時支援 OpenAI / DeepSeek / 任何相容服務，透過環境變數切換

## 檔案規模

- 源碼檔案：34 個（TypeScript/TSX/CSS）
- 組件：19 個（9 個基礎 UI + 10 個功能組件）
- API 路由：5 個
- 程式碼總行數：約 2800 行

## 測試結果

- ✅ `npm run build` 編譯通過，零錯誤
- ✅ Mock 模式完整可用（無 API Key）
- ✅ DeepSeek API 接入成功，完整流水線跑通
- ✅ 高/低風險兩種路徑均測試通過
