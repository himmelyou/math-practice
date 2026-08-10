/**
 * 游戏说明默认文案（学员设置菜单展示；管理页可覆盖写入 data/game-guide.json）
 * 正文为简易 Markdown：标题 / 列表 / 表格 / 粗体 / 分隔线
 */
"use strict";

const TITLE_ZH = "遊戲說明";
const TITLE_EN = "How to Play";

const BODY_ZH = `## 1. 這是什麼

這是一套口算與數感練習工具。請用**登入帳號**練習，進度、積分、排行榜和數據分析才會保存。遊客模式功能有限，重要練習請先註冊登入。

建議：**先用闖關摸清水平並打開熱圖，再每天跟著訓練推薦練**；專項與刷弱項按需進行。

---

## 2. 首頁上有什麼

| 入口 | 做什麼 |
|------|--------|
| **闖關模式** | 按 L1→L16 推進四則運算；適合快速打開熱圖、摸清水平 |
| **訓練模式** | 日常主練；系統會按你的數據推薦關卡（當日闖關 / 刷熱圖） |
| **生存挑戰** | 限時闖關，連對升級、答錯降級，追求高分與通關 |
| **小數 / 平方數 / 整除 / 拆括號 / 質數合數** 等 | 專項練習；多數從低等級逐步解鎖 |
| **錯題本** | 複習錯過的題（部分模式如整除不進錯題本） |
| **數據分析** | 看熱圖與速度對比（需登入） |
| **排行榜 / 成就牆** | 部分榜單需先通關對應模式才能查看 |

右上角 **設置**：語言、改密碼、聯繫我們、本「遊戲說明」。

---

## 3. 正確使用方式（最重要）

### 3.1 先打一局闖關，摸清水平

- 新手或很久沒練時，**先玩闖關模式**：從低關一路往上推，可以較快把四則熱圖「打開」，大致看出你目前卡在哪一級。
- 熱圖有了輪廓之後，**訓練模式的默認選關**才能更快對準你的真實水平，而不是從過低或過高的關瞎猜。
- 若闖關是因為**失誤**提前結束，不妨**再試一兩局**；多一點有效答題，定位會更準。
- 摸清位置後，再進入訓練做日常主練；不必每次都重闖一遍。

### 3.2 訓練模式：跟著推薦走

- 開局前看難度旁的**短說明**，確認題型。
- **優先用系統默認選中的等級**——這是按你近期表現算出來的下一步。
- 手動改難度可以，但會按「刷熱圖 / 自選」記錄，和「當日闖關」路徑不同。
- 目標不是一味衝最高關，而是把已開的關練到**又準又快**。

### 3.3 怎麼算「練好了」

- **準**：少錯；熱圖裡顏色會反映加權正確率。
- **快**：答對且不過分拖沓才計入速度；長時間掛機、切屏的超長耗時一般不進速度統計。
- 熱圖有足夠題量後才會穩定著色；偶爾幾題波動很正常。

### 3.4 專項模式：怎麼解鎖下一關

小數、平方數、整除、拆括號等（共用一套升降規則）：

- 在**當前最高已解鎖關**練習時：
  - **0 錯或僅 1 錯**：可解鎖下一關（結算會提示「解鎖新等級」）。
  - **2 錯及以上**：不解鎖，可再打同一關。
- 已解鎖的關可隨時重練；重練 0 錯多為「完美」，不會重複提示解鎖。
- 等級進度寫在帳號上；**解鎖本身不單獨記一局排行**。

### 3.5 放棄本局請慎重

頂欄在對局中是「放棄本局」：

- 會**丟本局積分**；部分模式（如訓練/生存/闖關）放棄後，**已答內容仍可能計入熱圖**。
- 全站共用冷靜期：第 1～4 次放棄後分別冷卻約 **10 / 20 / 40 / 80 分鐘**；**每天最多 5 次**。
- 冷靜期內按鈕可能變灰，點了會提示還需等待多久。
**能打完就盡量打完**；實在中斷再放棄。

---

## 4. 各模式怎麼玩（速查）

### 闖關模式（四則 L1–L16）

- 按關推進；每關有題量與通關要求（以局內提示為準）。
- 適合用來**快速打開四則熱圖、定位目前水平**（見 3.1）。
- **全通 L1–L16** 後，可看「闖關達人」類榜單。

### 訓練模式

- 一局通常為一關內固定題量（常見結構：主段約 20 題；錯題規則以局內為準）。
- 結算看準確率與是否升級；「通關準確率」是升級門檻，以當前版本顯示為準。
- 訓練記錄會進**四則熱圖**，是日常進步的主數據源。

### 生存挑戰

- 從較低關起步；**答對加時加分，連對升級，答錯降級**（以局內副標題為準）。
- 通關後可查看生存相關榜單。

### 小數運算

- 選關練習；解鎖規則見上文 3.4。
- 練習會進**小數熱圖**（D 檔）。

### 平方數

- 鍵盤輸入；解鎖規則見 3.4。
- 練習會進**平方數熱圖**。

### 整除

- 多為判斷題（以題面為準）。
- 約 **24 題/局**；答對 +5、答錯 −5（以局內為準）。
- **最高檔零錯通關**可競爭「整除達人」榜（比用時）。
- 整除題**默認不進錯題本**。

### 拆括號

- 選擇題；解鎖規則見 3.4。
- 當前主要用於練習與進度，**不做熱圖展示**。

### 質數 / 合數等

- 以局內說明與計分為準；部分為測試或專項入口。

### 錯題本

- 用來複盤錯過的題。
- 不是所有模式都會寫入錯題本。

### 數據分析（熱圖）

- 按分類折疊：四則、小數、平方數、整除等。
- 點某一關可看按日曲線與和全體學員的速度對比（需常模數據；沒有常模時仍可看個人格）。
- **顏色偏暖**：正確率不足或偏慢；**偏綠**：又準又快。不必追求一天刷綠，持續練即可。

### 排行榜與成就

- 總分、生存、闖關、連擊、專項達人榜等；部分榜需先通關對應模式。
- 成就牆：完成條件自動解鎖；可佩戴少量徽章（以牆內提示為準）。

---

## 5. 積分與進度

- 登入後，完成的對局會寫入帳號；**換設備登入同一帳號可繼續**。
- 不同模式計分不同（有的按題加減分，有的偏重用時與通關）。
- 放棄本局通常**不計本局得分**（或記 0），但熱圖相關模式仍可能留下答題痕跡。
- 等級與解鎖進度存在伺服器；以登入帳號為準。

---

## 6. 常見問題

**Q：為什麼一開始不直接進訓練？**  
A：先闖關能較快打開熱圖、摸清水平，訓練的默認選關才更準（見 3.1）。

**Q：為什麼系統推薦的關不是最高關？**  
A：訓練會優先補弱項或穩住當前前沿，不是永遠衝最高。

**Q：結算寫「解鎖新等級」但下拉沒變？**  
A：先退出再進該模式，或看等級下拉是否已多出一檔；仍沒有可「聯繫我們」。

**Q：熱圖是灰的？**  
A：該關有效題量還不夠，或多練幾局即可。

**Q：放棄後提示要等待？**  
A：觸發了全站放棄冷靜期，等提示時間過後再試；當天次數用盡需次日。

**Q：整除錯了為什麼錯題本沒有？**  
A：整除設計為不進錯題本；請用結算頁的本局錯題回顧（若有）。

**Q：語言怎麼切？**  
A：設置 → 語言（界面語言；題目以當前題庫為準）。

---

## 7. 練習小建議

1. 固定時段短練，比偶爾爆肝更有效。
2. 先闖關摸水平，再訓練跟推薦；專項用解鎖推進；弱項用熱圖點名補。
3. 少放棄、少掛機，速度統計才準。
4. 通關榜單前，先把對應模式認真打通一局。

有問題或建議：設置 → **聯繫我們**。
`;

const BODY_EN = `## 1. What this is

A mental-math practice app. **Sign in** so progress, scores, rankings, and stats are saved. Guest mode is limited—register for real practice.

Tip: **start with Level clear to open the heatmap and find your level**, then follow daily Training picks; use specialty modes and weak-spot drills as needed.

---

## 2. Home shortcuts

| Entry | Purpose |
|------|--------|
| **Level clear** | Progress through arithmetic L1–L16; good for opening the heatmap fast |
| **Training** | Daily main practice; system picks the next level |
| **Survival** | Timed runs; streak up / miss down |
| **Decimals / squares / divisibility / brackets / primes** | Specialty modes; unlock levels step by step |
| **Wrong book** | Review misses (some modes, e.g. divisibility, are excluded) |
| **Stats** | Heatmaps and speed vs cohort (signed-in) |
| **Rankings / achievements** | Some boards unlock after clearing a mode |

**Settings** (top right): language, password, contact us, and this guide.

---

## 3. How to practice well

### 3.1 Play Level clear first to find your level

- If you are new or returning after a long break, **play Level clear first**: pushing upward from low levels quickly “opens” the arithmetic heatmap and shows roughly where you are.
- Once the heatmap has a shape, **Training’s default pick** can aim closer to your real level instead of guessing too low or too high.
- If a Level-clear run ends early from a **slip**, try **one or two more runs**—a bit more data makes placement more accurate.
- After you know where you stand, use Training for daily practice; you do not need to re-clear every time.

### 3.2 Training: follow the pick

- Read the short level blurb before you start.
- Prefer the **default selected level**—it is your next step from recent data.
- You may change the level, but that counts as heatmap / self-pick, not the daily path.
- Aim for **accurate and fast** on opened levels, not only the highest number.

### 3.3 What “good” means

- **Accuracy** and **speed** (correct answers; very long idle times are ignored for speed).
- Heatmap colors stabilize after enough attempts.

### 3.4 Specialty unlocks

Decimals, perfect squares, divisibility, expand brackets, etc.:

- On your **frontier level**: **0 or 1 wrong** unlocks the next level; **2+ wrongs** does not.
- Replay already unlocked levels anytime; a clean replay is usually “Perfect”, not another unlock notice.

### 3.5 Abandon carefully

- Abandoning **drops this run’s score**; some modes still feed answered items into the heatmap.
- Shared cooldown: after the 1st–4th abandon, wait about **10 / 20 / 40 / 80 minutes**; **max 5 abandons per day**.
- Finish the run when you can.

---

## 4. Modes (quick)

- **Level clear**: clear L1–L16; also a fast way to open the arithmetic heatmap and place yourself (see §3.1). Related leaderboards after a full clear.
- **Training**: feeds the **arithmetic heatmap**; follow the default pick day to day.
- **Survival**: time/score; clear to open survival boards.
- **Decimals / squares / divisibility**: unlocks per §3.4; heatmaps where noted. Divisibility ~24 Q/run, ±5 scoring; L5 zero-wrong clears compete on the master board; **not** in the wrong book.
- **Expand brackets**: unlocks per §3.4; **no heatmap** for now.
- **Stats**: tap a cell for daily curves and cohort speed when available.

---

## 5. Score & progress

- Progress is on your account (works across devices when signed in).
- Abandoned runs usually score 0 for the run but may still leave heatmap traces.

---

## 6. FAQ

**Why not jump straight into Training?** Level clear opens the heatmap and places you faster so Training’s pick is more accurate (see §3.1).

**Why isn’t the recommended level the highest?** Weak spots and frontier stability come first.

**Unlock text but no new option?** Leave and re-enter the mode; then Contact us if needed.

**Gray heatmap?** Not enough attempts yet.

**Abandon wait?** Daily cooldown / limit.

**Language?** Settings → language.

---

## 7. Tips

1. Short daily sessions beat rare marathons.
2. Level-clear to place yourself, then follow Training picks; use specialty unlocks; fix weak cells on the heatmap.
3. Avoid abandon and idle for cleaner speed stats.
4. Clear a mode before chasing its leaderboard.

Questions: Settings → **Contact us**.
`;

function defaultGameGuide() {
  return {
    updatedAt: 0,
    titleByLang: {
      zhHant: TITLE_ZH,
      en: TITLE_EN,
    },
    bodyByLang: {
      zhHant: BODY_ZH,
      en: BODY_EN,
    },
  };
}

module.exports = {
  defaultGameGuide,
};
