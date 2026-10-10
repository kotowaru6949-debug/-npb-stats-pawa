# NPB セイバーメトリクス & パワプロ風査定アーカイブ

日本プロ野球記録（[2689web.com](https://2689web.com/)）の全公式戦記録を自動収集し、時代補正指標（**OPS+**, **FIP-**, **K-BB%**, **wSB**）および **パワプロ風能力値（1〜100 / G〜Sランク）** を算出して、世代横断で選手比較・可視化を楽しむWebダッシュボードです。

仲間うちへの共有（GitHub Pagesで完全無料公開）と、毎年の1コマンド自動更新に対応しています。

---

## 🌟 主な機能と特徴

1. **時代環境を公平補正するセイバー指標**
   - **打者: OPS+**（100がリーグ平均。ボールの反発係数や投高打低の時代差を完全平準化）
   - **投手: FIP-**（100がリーグ平均・数値が低いほど優秀。野手守備や運を排除した自力失点抑止力）
   - **投手: K-BB%**（三振奪取割合 - 四球割合。投手の真の支配力）
   - **走塁: wSB**（盗塁と盗塁死が得点に与えた純粋な得点貢献点数）
2. **パワプロ風能力値査定（1〜100 / G〜Sランク）**
   - **野手**: ミート、パワー、走力、守備力
   - **投手**: コントロール、球威/キレ、スタミナ
   - パワプロ準拠のカラーバッジ（S:赤, A:ピンク, B:橙, C:黄, D:白, E:水色, F:青, G:灰）
3. **インタラクティブWebダッシュボード（`site/`）**
   - 年度・リーグ・球団・ポジション・フリーワード検索
   - ワンクリックでのソート（OPS+順、FIP-順、各能力順など）
   - 散布図可視化（Chart.js）: 「OPS+ × wSB」「FIP- × K-BB%」「ミート × パワー」等
   - 選手直接比較ツール（レーダーチャートで能力比較）
   - ワンクリック CSVダウンロード（GoogleスプレッドシートやExcelに即座に取り込み可能）

---

## 📂 ディレクトリ構成

```text
npb-stats-pawa/
├── .github/workflows/
│   └── deploy.yml          # GitHub Pages 自動デプロイ
├── data/
│   ├── cache/              # HTMLキャッシュ（サーバー負荷防止）
│   └── processed/          # 算出済みデータ
│       ├── batters.json / batters.csv
│       ├── pitchers.json / pitchers.csv
│       └── leagues.json
├── scripts/
│   ├── scraper.py          # 2689web.com スクレイピング
│   ├── metrics.py          # OPS+, FIP, FIP-, K-BB%, wSB 計算
│   ├── pawa_eval.py        # パワプロ風能力査定エンジン
│   └── update.py           # 統括更新スクリプト (CLI)
└── site/                   # GitHub Pages 公開用フロントエンド
    ├── index.html          # Webダッシュボード
    ├── css/style.css       # スタイリング
    ├── js/app.js           # 検索・ソート・散布図・レーダー比較
    └── data/               # site同期用JSONデータ
```

---

## 🚀 使い方

### 1. ローカルで画面を確認する

ブラウザで `site/index.html` を直接開くか、またはローカルWebサーバーを起動して確認できます：

```bash
cd npb-stats-pawa
python -m http.server 8000 --directory site
```
ブラウザで `http://localhost:8000` を開きます。

---

### 2. 毎年のデータ更新方法（シーズン終了後）

新しい年度（例: 2025年）のデータがサイトに追加されたら、以下のコマンドを実行するだけです：

```bash
# 2025年のデータを追加・更新
python scripts/update.py --years 2020 2021 2022 2023 2024 2025

# 変更をGitHubへ反映（自動デプロイ）
git add .
git commit -m "Update stats for 2025"
git push origin main
```
※一度取得したHTMLは `data/cache/` に安全にキャッシュされるため、二度目以降は数秒〜数十秒で瞬時に再計算・更新が完了します。

---

### 3. GitHub Pages で仲間うちにWeb公開する手順

1. **GitHubで新しいリポジトリを作成**（例: `npb-stats-archive`）
2. **ローカルから Push**:
   ```bash
   cd npb-stats-pawa
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<あなたのユーザー名>/<リポジトリ名>.git
   git push -u origin main
   ```
3. **GitHub Pages を有効化**:
   - リポジトリの **Settings** $\rightarrow$ **Pages** を開く。
   - **Build and deployment** の Source で **「GitHub Actions」** を選択。
   - これだけで、`.github/workflows/deploy.yml` が自動起動し、数分後に専用URL（`https://<ユーザー名>.github.io/<リポジトリ名>/`）で世界中どこからでも仲間がアクセスできるようになります！

---

## 📊 GoogleスプレッドシートやExcelで使いたい場合

`data/processed/` に出力されている **`batters.csv`** または **`pitchers.csv`** を、GoogleドライブやExcelにドラッグ＆ドロップするだけで、全指標・パワプロ査定値入りのスプレッドシートが即座に完成します。また、Webサイト画面右上の「📥 CSVダウンロード」ボタンからも直接ダウンロード可能です。
