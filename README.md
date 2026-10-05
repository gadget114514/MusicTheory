# Theory Desk

[![Deploy to GitHub Pages](https://github.com/gadget114514/MusicTheory/actions/workflows/pages.yml/badge.svg)](https://github.com/gadget114514/MusicTheory/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> 🎹 **Live Demo (GitHub Pages): https://gadget114514.github.io/MusicTheory/**

音楽理論・演奏・録音・自動再生を 1 画面で扱う机上。

Electron デスクトップアプリと、GitHub Pages に載せる静的 Web 版のどちらでも動きます。
Renderer 側は同一のコードで、ファイルの読み書きと MIDI 権限だけ差し替えています。

## 設計書の位置づけ

| 文書 | 版 | 反映先 |
|---|---|---|
| `doc/TheoryDesk-design-v0.1.docx` | 基本設計 | プロセス分割、データモデル、責務境界、thal 実装順 |
| `doc/TheoryDesk-screen-v0.2.docx` | 画面構成 | 1 画面レイアウト、コードレール、鍵盤、手引き欄、色 |
| `doc/TheoryDesk-events-v0.3.docx` | 出来事レイヤ | ScoreEvent、旗的表现、転調の見つけ方 |

## 動かす

```bash
npm install

npm run dev        # Electron (開発)
npm run dev:web    # ブラウザ (開発)

npm run build      # Electron 用の成果物 out/
npm run preview    # ビルド済み Electron を起動
npm run build:web  # 静的サイト dist-web/ (Pages 用)

npm run typecheck  # 型検査
```

`npm run build:web` の出力 (`dist-web/`) はそのまま GitHub Pages に載せられます。

### GitHub Pages

🌐 公開 URL: **https://gadget114514.github.io/MusicTheory/**

`.github/workflows/pages.yml` が `main` への push で `dist-web/` を公開します。
Electron の実行ファイルは Pages 側で不要なので `ELECTRON_SKIP_BINARY_DOWNLOAD=1` を指定しています。

ローカルで Pages の挙動を確認する場合:

```bash
npm run build:web
npx http-server dist-web -p 4173 -a 127.0.0.1 -c-1
```

## 画面

v0.2 の約束どおり、チュートリアルは別ページにしていません。

```
+----------------------------------------------------------+
| 再生 一時停止 BPM キー ループ ...              [MIDIを開く] |  48px 固定
+----------------+-----------------------------------------+
| 手引き          |  上半分: コード進行レール (主)            |
| Step 2 / 8     |  C   Am   F   G   <- 再生ヘッドが移動      |
| 次は Am を弾く  |  コード (従): 音符の拍位置               |
| [聞く][弾く]    |                                         |
+----------------+-----------------------------------------+
| 下半分: ピアノ鍵盤 (常時。幅いっぱい)                     |
| 鳴っている=琥珀  期待する=青緑  外した=赤                |
+----------------------------------------------------------+
```

色は v0.2 2 章の約束を固定しています。チュートリアル用と再生用の別体系は持っていません。

## 実装の基準

- 理論は tonal のみ。アプリ_dates 詞は持たない。
- 発音は Tone.js。Renderer で鳴らし、Main は鳴らさない。
- 時間の正は拍。BPM を変えてもイベントを書き換えない。
- `Chord.detect` が複数候補を返すのは仕様なので、候補を隠さない。順位だけアプリが決める。
- 出来事はコードでもノートでもない第三のデータ。作者旗 (実線) と推定旗 (点線) を区別する。

### 入れていないもの

- 音声ファイル (mp3/wav) からのコード推定。v1 の完了条件外。
- 五線レンダラ。上半分には従表示の枠だけ 있는。
- 配布用のパッケージング。`electron-builder` は未設定。

## ディレクトリ

```
electron/
  main.ts              ウィンドウ、dialog、プロジェクトの read/write、最近使ったファイル
  preload.ts           contextBridge。薄い API だけ
  projectIO.ts         userData 以下の recent.json
src/
  model/types.ts       ScoreDocument / NoteEvent / ChordEvent / ScoreEvent / Step
  theory/index.ts      tonal のラッパ。順位と一致判定だけを持つ
  engine/
    transport.ts       Tone.Transport の薄いラッパ。拍が唯一の時刻
    audio.ts           シンセとメトロノーム
    player.ts          NoteEvent -> Tone.Part。sample/user/import で別 Part
    input.ts           画面 / PC キーボード / Web MIDI -> NoteOn/Off
    recorder.ts        NoteOn/Off の差分を拍へ量子化
  analysis/
    chords.ts          MIDI を窓切りして Chord.detect
    events.ts          v0.3 の旗。転調・借用・終止
  tutorial/
    runner.ts          シナリオランナー。介入は 3 つだけ
    lessons/*.json     内蔵レッスン
  samples/*.json       内蔵サンプル (自作 ScoreDocument)
  store/score.ts       Zustand。playhead は入れない
  ui/                  TopBar / GuideRail / ChordRail / StaffView / Keyboard
  platform/            Electron bridge と Web fallback
```

## 動作確認メモ

実装中に tonal 6 の実際の返り値で仕様を確認した箇所があります。コードを直すときに
壊しやすいので残しておきます。

- `Chord.get(x).name` は `"C major seventh"` のような長い英語名。識別子には使わない。
  比較は自前の `chordKey()` (root + quality) で行う。
- `Chord.get(x).bass` は根音位置だと空文字。空は「転回ではない」を意味する。
- `Pcset.chroma()` は**文字列**で返る。配列ではない。
- `Key.majorKey().chords` は 7th (Cmaj7...)、三和音は `.triads`。
- `Key.get()` は tonal 6 に無い。表記 (`"C major"`, `"Am"`) の解釈は自前。
- `Key.minorKey(x).natural.chords` で自然マイナーの 7th が取れる。
- `Key.majorKeyChords(tonic)` の `roles` から二次ドミナント (V/...) を引ける。

転調の自動推定は既定で無効です (v0.3 6 章「検出は最後」にそのまま合わせています)。
1 小節窓ではハ長調の I と F major の V を区別できないため、誤検出を出さない側に倒し、
合わなかった手は作者旗で上書きする運用を前提にしています。作者旗は MIDI 読み込み →
コードレール → 旗クリック → 作者旗化の順で作れます。

## 既知の制限

- 解析は最もノートが多いトラックを正とします。メロディが和音に紛れている場合は
  「最高音を外す」オプションに依存し、完璧ではありません。
- 量子化は off / 1/8 / 1/16 の 3 段階。凝った UI は無い (v0.1 設計 3 章の方針)。
- Web MIDI は HTTPS が必要なため、`file://` で開いた Electron ではなく
  開発サーバー経由か Pages 上でPermissions 可以获得。