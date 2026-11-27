# 週日 VR 原型製作規則

給每週日自動排程用。目標：每款都要能在 Meta Quest 2 瀏覽器裡「進入 VR」、用手把玩到結局，同時在電腦、平板、手機的瀏覽器上也能玩。

## 檔案與共用底座

- 每款一個資料夾：`<英文短名>/index.html`，單一檔案。
- 從 `vr-test/index.html` 複製當起點。檔案裡 `VR-KIT:START` 到 `VR-KIT:END` 之間不要手改，寫完執行：
  `node tools/inline-kit.mjs <資料夾>/index.html`
- three.js 用 `loadThree()` 載入：先讀本 repo 的 `lib/three/`（版本 0.170.0），讀不到才用 jsdelivr、unpkg。不要另外引用別的外部套件或模型檔。
- 底座 `lib/vr-kit.js` 提供：`createVR`、`panel`（3D 文字面板）、`button`、`interact`（可選物件）、`say`（對話框）、`hotspot`（傳送點）、`onUpdate`。需要底座沒有的功能，寫在遊戲自己的程式裡，不要改 `lib/vr-kit.js`（會影響所有舊遊戲）。

## 一定要遵守

- 所有文字、按鈕都用 `panel`／`button`／`say` 畫在 3D 裡。VR 裡看不到 HTML，不要用 HTML 對話框或 alert。
- 移動只用 `hotspot` 傳送點，加上搖桿 30 度轉向（底座已做）。不做平滑移動、不讓鏡頭自己動、不做高處墜落、快速旋轉、強烈閃光。
- 開場時，至少一個可互動物件要在玩家正前方視野內（手機直式畫面也要看得到）。
- 物件與文字放在離玩家 1～4 公尺、高度 0.8～2 公尺（坐著也搆得到）。重要文字字級 34 以上。
- 效能（Quest 2 要維持 72 fps）：網格總數 150 個以內、不開陰影、不用後製特效、材質用 MeshStandardMaterial 或 MeshBasicMaterial、重複物件盡量共用幾何與材質。
- 不要對可互動物件自己改 `scale`（底座用 scale 做滑過與點擊回饋），要動畫就改位置、旋轉或顏色。
- 一輪 10 分鐘內可玩完，有明確目標與至少一個結局。
- 署名「本遊戲由Peiching開發，角色與情境均為虛構」放在場景裡（3D 面板），不放「莒光資優班」。
- 不放真實人名、學生資料；不使用受版權保護的角色。

## 測試掛鉤（自動測試靠這個走完全程）

```js
window.__GAME = {
  get ended() { ... },          // 是否已到結局
  nextTarget() { ... },         // 下一步「應該選哪個物件」的名稱（interact 時給的 name）；結局後回傳 null
};
```

`nextTarget()` 要回傳一條真正能玩到結局的路線，包含對話框按鈕（名稱是 `dlg:按鈕文字`）和傳送點（`hotspot` 的 name）。

## 自動檢查

```
node tools/vr-check.mjs <資料夾>
```

會用電腦、平板、手機三種畫面各跑一次（真的點擊、拖曳轉頭），再用 Meta 官方 IWER 模擬器模擬 Quest 2：按「進入 VR」、用模擬右手把射線加板機照 `nextTarget()` 點到結局、試搖桿轉向。`"ok": true` 才能上傳。截圖存在 `tools/_shot_*.png`（不進 git）。
