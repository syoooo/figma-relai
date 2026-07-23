<img src="assets/relai-logo.svg" alt="Relai" height="36" />

[English](README.md) | 日本語 | [中文](README.zh.md)

Claude Code や Cursor などの AI エージェントから Figma を直接操作できる MCP ブリッジ。**30 の統合ツール** + Plugin API エスケープハッチで、読み取り・作成・編集・品質チェックまで対応します。

<img src="assets/plugin-ui.png" alt="Plugin UI" width="380" />


```
AI (Claude Code / Cursor)
  ↕ stdio
MCP Server            … 30 ツール・分析・検証
  (内蔵リレー)         … ポート 9055 の WebSocket ルームハブ
  ↕ WebSocket
Figma Plugin          … Figma API を実行
  ↕ Plugin API
Figma                 … デザインデータの読み書き
```

リレーは **MCP サーバーに内蔵**されています——常駐させる別プロセスはありません。複数の MCP クライアント（Cursor と Claude Code の併用など）が起動した場合は、最初の 1 つがリレーをホストし、残りは自動的にそこへ接続します。

---

## できること

### 🔍 デザインの把握
「この画面の構成を教えて」——選択ノードの構造・色・レイアウト・トークン適用状況を一括で読み取り、`screenshot` で実際の見た目も確認できます。

### 🎨 品質チェック
`analyze_design` がカラートークンのカバレッジ、オートレイアウト品質、コンポーネント健全性、アクセシビリティ（コントラスト・タッチターゲット）を監査し、修正案を提示します。

### ✏️ 一括変更
「ボタンの文言を全部英語に」「ダークモード用に色を変えて」——`set_text` と `set_properties` が多数のノードへの変更を一往復で適用。プラグインにはライブの実行フィードと**停止ボタン**があります。

### 🧱 デザインシステム
変数コレクション・モード・トークンバインド・共有スタイル・チームライブラリ取り込み——`manage_variables` / `manage_styles` / `import_from_library`。

### ⚡ それ以外はすべて
`execute_figma` はプラグインサンドボックス内で Figma Plugin API の JavaScript を実行します（Figma 公式 MCP と同じアプローチ）。プラグインの「コード実行を許可」トグルでいつでも無効化できます。

---

## Relai と Figma 公式 MCP サーバー

両者は同じキャンバスに反対側からアプローチしており、組み合わせて使えます。

公式 MCP サーバーはデザインをコードに変換するために作られています。デザインコンテキスト、Code Connect 連携、スクリーンショットパイプラインは、完成したデザインを開発者のエージェントに渡す最良の方法です。Relai は逆方向——デザイナーが*デザインそのものを作り、育てる*ためのツールです：トークンアーキテクチャ、バリアントとバインディングを備えたコンポーネントライブラリ、監査、一括編集、自由な UI 制作を、好きな AI クライアント・好きなモデルで、どの Figma プランでも行えます（書き込みは Plugin API 経由のため、特定のシートタイプを必要としません）。

思想の違いは設計に表れています。繰り返しの多いデザインシステム作業に対して、Relai は毎回コードを生成するのではなく、宣言的で事前条件チェック付きのツールを優先します——同じ操作は毎回同じように実行され、失敗はスタックトレースではなく「先に set_layout_mode を呼んでください」という指示として返ります。ロングテールは `execute_figma` がカバーします（公式の `use_figma` と同じ思想です）。そして操作の主体はデザイナーなので、プラグインは実行フィード・プレゼンス表示・停止ボタンでデザイナーをループの中に置き続けます。

シートがあるチームは両方使うのがおすすめです——公式サーバーでデザインを読み出し、Relai でそもそものデザインを作る。

## クイックスタート

必要なもの：[Node.js](https://nodejs.org/) 18 以上、[Figma Desktop](https://www.figma.com/downloads/)、MCP クライアント（[Claude Code](https://claude.com/claude-code)、[Cursor](https://cursor.com/) など）。

### 1. Figma プラグインをインストール

[Figma Community からインストール](https://www.figma.com/community/plugin/1613474334525847301)して実行するだけ。自動的に接続し、ルームは再起動をまたいで記憶されます。

### 2. MCP サーバーを登録

```bash
# Claude Code
claude mcp add Relai -- npx -y figma-relai

# OpenAI Codex CLI
codex mcp add Relai -- npx -y figma-relai
```

Cursor の場合は `.cursor/mcp.json` に：

```json
{ "mcpServers": { "Relai": { "command": "npx", "args": ["-y", "figma-relai"] } } }
```

### 3. AI に話しかける

以上です。MCP サーバーがリレーを自らホストし、プラグインのルームを自動発見してペアリングします——コピーするコマンドはありません。`join_room` は複数の Figma ファイルで同時にプラグインが動いている場合の消歧用にのみ存在します。

## ソースから（コントリビューター向け）

```bash
git clone https://github.com/syoooo/figma-relai.git
cd figma-relai
bun setup
```

[Bun](https://bun.sh/) v1.0 以上が必要です（bash スクリプトのため Windows では WSL を使用）。依存関係のインストール、全パッケージのビルド、ローカルビルドへの絶対パスを指定した MCP 設定の書き出しをまとめて行います。プラグイン開発は **Plugins → Development → Import plugin from manifest…** → `packages/figma-plugin/manifest.json`。

---

## 30 のツール

| グループ | ツール |
|---------|--------|
| コンテキスト | `get_document_overview` · `get_selection_context` · `get_node_details` · `search_nodes` · `get_design_tokens` · `screenshot` · `get_events` |
| 分析 | `analyze_design`（color / layout / components / accessibility / **overall** — 重み付き 0-100 健全性スコア）· `diff_nodes`（2 ノード比較またはチェックポイント保存/比較） |
| 検証 | `verify_changes` · `validate_design_rules` · `verify_visual` |
| 読み取り | `get_node_data`（summary / tree / full / css / variables） |
| 作成・編集 | `create_node` · `set_properties` · `set_text` · `edit_structure` |
| コンポーネント | `manage_components` |
| デザインシステム | `manage_variables` · `manage_styles` · `import_from_library` |
| ドキュメント | `manage_pages` · `navigate` |
| アセット | `export_asset` · `add_image` |
| アノテーション | `annotate` |
| コメント | `manage_comments` — 一覧 / 追加 / 返信 / 削除（`FIGMA_TOKEN` が必要、下記参照） |
| 高度な操作 | `batch_execute` · `execute_figma` · `join_room` |

各ツールは自己記述的で、AI にはパラメータの完全なドキュメントが見えます。統合されたツール面は常時ロードされるコンテキストを小さく保ち（LLM がツールを確実に使い分けられる範囲内）、プラグイン側では事前条件チェック付きの粒度コマンドが実行されます。6 つのスキルドキュメント（トークン戦略・コンポーネント規約・監査ワークフロー・`execute_figma` 用 Plugin API チートシート）が MCP prompts として同梱されます。

## デザイナー体験

- **自動ペアリング** — プラグインはルームを記憶（`clientStorage`）。MCP サーバー側も記憶（`~/.figma-relai/state.json`）し、再起動・スリープ・リレー引き継ぎ後も自動で再参加します。
- **プレゼンス表示** — リレー接続だけでなく、エージェントが実際にルームにいるときに「AI 接続済み ✓」を表示。
- **実行フィード** — 全コマンドをステータス・所要時間・エラー付きで表示。ノード対象の項目はクリックでキャンバス上にフォーカス。
- **停止ボタン** — バッチ処理の残り作業をキャンセル（実行中の単一コマンドは完了まで走ります。JavaScript のシングルスレッド制約です）。
- **デザイナーイベント** — 選択・ノード・ページの変更が次のレスポンスの `designer_events`（または `get_events`）で AI に届くため、ポーリング不要。
- **監査トレイル** — `get_events` の scope `agent` はこのセッションで AI が実行した全コマンド（結果・所要時間つき）を返し、`diff_nodes` のチェックポイントは編集セッションをまたいだノードの変更点を正確に示します。
- **英語 / 日本語 / 中文 UI** — 切り替えは保存されます。

## ポートとセキュリティ

- リレーは **127.0.0.1:9055** のみにバインドします。Figma のプラグインサンドボックスは manifest で `ws://localhost:9055–9057` のみ許可しており、**それ以外のポートは manifest を編集しない限り動作しません**。そのため UI にポート設定は意図的にありません。
- ルーム名には暗号学的乱数のサフィックスが付きます。脅威モデルは [SECURITY.md](SECURITY.md) を参照してください。
- `execute_figma` は AI が書いたコードをプラグインサンドボックスで実行します。デフォルトで有効（実行フィードに表示）、プラグインの「コード実行を許可」トグルで無効化できます。
- コメントは Figma の REST API を使うため個人アクセストークンが必要です。figma.com → Settings → Security で生成し、MCP 設定に `"env": { "FIGMA_TOKEN": "figd_..." }` を追加してください。トークンは設定ファイル内に留まり `api.figma.com` にのみ送信されます。他のツールはトークンなしで動作します。

## 高度な使い方：スタンドアロンリレー

```bash
bun socket        # リレー単体をポート 9055 で起動（HOST/PORT 環境変数で変更可）
node packages/mcp-server/dist/index.js --server=<host> --room=<room>
```

リレーを別マシンに置く場合のみ必要です。通常は内蔵リレーで十分です。

## 開発

```bash
bun install
bun run build     # shared → mcp-server → figma-plugin（UI のツール一覧を自動注入）
bun test          # ユニットテスト（55）
```

手動 QA: [docs/smoke-checklist.md](docs/smoke-checklist.md)。ログは stderr のみに出力されます（stdio は MCP 用）。

## ライセンス

MIT — [LICENSE](LICENSE) を参照。コントリビューションは [CONTRIBUTING.md](CONTRIBUTING.md) へ。
