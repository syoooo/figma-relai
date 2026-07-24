<img src="assets/relai-logo.svg" alt="Relai" height="36" />

[English](README.md) | 日本語 | [中文](README.zh.md)

**Your AI, on the canvas.** Relai は Claude Code・Cursor・Codex など任意の MCP クライアントを Figma につなぎ、普段使っているモデルに話しかけるだけでデザインの読み取り・編集・監査・デザインシステム構築ができるようにします。書き込みは Figma プラグイン経由なので、有料 REST API に依存せず、どの Figma プランでも動きます。

<img src="assets/plugin-ui.png" alt="Relai プラグイン:実行フィード、接続ステータス、停止ボタン" width="380" />

## セッションはこんな感じ

> **あなた:** CTA を目立たせて、角を丸くして。
>
> **AI:** `set_properties · 3 nodes · 0.4s ✓` → `verify_visual · match ✓`
>
> **あなた:** 画面全体をダークモードにして。
>
> **AI:** `set_properties · 24 nodes · 1.2s ✓` → `analyze_design · overall → 92/100`

実行中のコマンドはすべて、タイミングと成否つきでプラグインに表示されます。項目をクリックすればキャンバス上のそのレイヤーへジャンプ。気が変わったら**停止**ボタンで残りのバッチをキャンセルできます。

## はじめる

必要なもの:[Figma Desktop](https://www.figma.com/downloads/)、[Node.js](https://nodejs.org/) 18+、MCP クライアント。

**1. プラグインをインストール。** [Figma Community](https://www.figma.com/community/plugin/1662131506342078142) から入手して実行します。自動で接続し、ルームは再起動をまたいで記憶されます。

**2. サーバーを AI クライアントに登録:**

```bash
claude mcp add Relai -- npx -y figma-relai      # Claude Code
codex mcp add Relai -- npx -y figma-relai       # Codex CLI
```

Cursor の場合は `.cursor/mcp.json` に:

```json
{ "mcpServers": { "Relai": { "command": "npx", "args": ["-y", "figma-relai"] } } }
```

**3. 何か頼んでみる。** ペアリングは自動です。ウィンドウ間でコピーするものは何もありません。`join_room` ツールが必要になるのは、複数の Figma ファイルで同時にプラグインが動いているという稀なケースだけです。

## 得意なこと

デザインの把握。「この画面はどう組まれてる?」で構造・色・レイアウト・トークンの適用状況が一度に得られ、AI は推測ではなくスクリーンショットで実際のキャンバスを確認できます。

一括編集。「ボタンの文言を全部英語に」「ダークモード用に配色を変えて」が、クリック作業の午後まるごとではなく、数十ノードへの一往復になります。

監査。`analyze_design` がカラートークンのカバレッジ、オートレイアウト品質、コンポーネント健全性、アクセシビリティ(WCAG コントラスト、タッチターゲット、文字サイズ)をチェック。4 つまとめて重み付き 0–100 のヘルススコアとして出せるので、レビューにそのまま貼れます。

デザインシステム。モード付き変数コレクション、トークンバインド、共有スタイル、バリアントを備えたコンポーネント、チームライブラリ取り込み。これらは事前条件チェック付きの宣言的操作として実行されるため、同じ依頼はいつも同じように動き、失敗時はスタックトレースではなく「先に set_layout_mode を呼んで」と次の一手が返ります。

それ以外のすべて。`execute_figma` は Figma Plugin API の JavaScript を直接実行します(Figma 公式 MCP と同じエスケープハッチ方式)。正しい書き方が最短の書き方になる `relai.*` ヘルパー群、既知のエラーに付くヒント、静かな間違いを検出するリントつき。AI にコードを実行させたくなければ、プラグインの「コード実行を許可」トグルでいつでも無効化できます。

## 主導権はデザイナーに

プラグインはデザイナー側の窓口です。AI の全行動を映すライブ実行フィード、サーバーが動いているだけでなくエージェントが本当にペアリングされたことを示す「AI 接続済み」インジケーター、待機中の作業を取り消す停止ボタン。あなたが行った選択やページの変更はイベントとして AI に流れるので、「今度はこっちに同じことして」が説明し直しなしで通じます。UI は English・日本語・中文に対応。

## 仕組み

```
AI (任意の MCP クライアント)
  ↕ stdio
MCP サーバー           30 ツール · 分析 · 検証
  (内蔵リレー)         127.0.0.1:9055 の WebSocket ルームハブ
  ↕ WebSocket
Figma プラグイン       Plugin API を実行
```

リレーは MCP サーバーの中に住んでいるので、常駐させる別プロセスはありません。複数の MCP クライアントが同時に動く場合は最初の 1 つがリレーをホストし、残りはそこへ接続。ホストが終了すれば生存者が引き継ぎます。両端ともルームを記憶し、再起動やスリープ後も自動で再参加します。コピー&ペーストはどこにもありません。

ポートは Figma のプラグインサンドボックスで固定されています。manifest は `ws://localhost:9055–9057` のみを許可しており、それ以外のポートは `manifest.json` を編集しない限り動きません。UI にポート設定がないのはそのためです。

## ツール一覧

| グループ | ツール |
|---------|--------|
| コンテキスト | `get_document_overview` · `get_selection_context` · `get_node_details` · `search_nodes` · `get_design_tokens` · `screenshot` · `get_events` |
| 分析 | `analyze_design`(color / layout / components / accessibility / overall)· `diff_nodes`(比較、またはチェックポイント保存/比較) |
| 検証 | `verify_changes` · `validate_design_rules` · `verify_visual` |
| 読み取り | `get_node_data`(summary / tree / full / css / variables) |
| 作成・編集 | `create_node` · `set_properties` · `set_text` · `edit_structure` |
| コンポーネント | `manage_components` |
| デザインシステム | `manage_variables` · `manage_styles` · `import_from_library` |
| ドキュメント | `manage_pages` · `navigate` |
| アセット | `export_asset` · `add_image` |
| アノテーション | `annotate` |
| コメント | `manage_comments`(トークンが必要 — 下記参照) |
| 高度な操作 | `batch_execute` · `execute_figma` · `join_room` |

各ツールは自己記述的で、AI にはパラメータの完全なドキュメントが見えます。トークン戦略、コンポーネント規約、監査ワークフロー、`execute_figma` 用 Plugin API チートシートの 6 つのスキルドキュメントが MCP prompts として同梱されます。

## Relai と Figma 公式 MCP

Figma 公式 MCP サーバーは完成したデザインをコードに変換するために作られており、そのデザインコンテキストと Code Connect 連携はその受け渡しに最適な道具です。Relai は逆方向 — デザイナーがデザインそのものを作り育てるための道具で、任意のクライアント・モデル・プランで動きます。シートがあるチームは、両方使うのがおすすめです。

## オプション:コメント

コメントは Figma の REST API の向こう側にあり、個人アクセストークンが必要です。figma.com → Settings → Security で生成し(コメントのスコープを有効に)、MCP 設定に追加してください:

```json
{ "mcpServers": { "Relai": { "command": "npx", "args": ["-y", "figma-relai"],
  "env": { "FIGMA_TOKEN": "figd_..." } } } }
```

トークンは設定ファイルの中に留まり、`api.figma.com` にのみ送信されます。他のツールはトークンなしで動きます。トークンがあれば「コメントのフィードバックを反映して」が現実になります:スレッドを読み、編集し、返信するところまで。

## トラブルシューティング

**プラグインに NO SERVER と出る。** ポート 9055–9057 で MCP サーバーが待ち受けていません。AI クライアントが起動していないか、Relai が未登録です。パネルに登録コマンドがそのまま表示されます。プラグインはダイヤルを続け、サーバーが現れた瞬間につながります。

**RELAY は LINK なのに AGENT が WAITING のまま。** 配管は正常です — このセッションで AI がまだ Figma ツールを呼んでいないだけ。ファイルについて何か聞いてみてください。

**「Multiple Figma plugins are connected」。** 複数のファイルでプラグインが動いています。操作したいプラグインに表示されているルーム名で `join_room` するよう AI に伝えてください。

**初回の `npx` が遅い。** パッケージを一度ダウンロードしているだけです。次回からは速くなります。

## セキュリティ

リレーは `127.0.0.1` のみにバインドし、認証はルーム名(暗号学的乱数サフィックス付き)だけです。`execute_figma` は AI の書いたコードを Figma のプラグインサンドボックス内で実行します。デフォルトで有効、全実行が実行フィードに表示され、デザイナーはいつでも無効化できます。スクリプトはアトミックではなく、失敗したスクリプトの途中までの変更は残ります。脅威モデルの全文:[SECURITY.md](SECURITY.md)。

## コントリビューター向け

```bash
git clone https://github.com/syoooo/figma-relai.git
cd figma-relai
bun setup       # インストール + ビルド + ローカルビルド用 MCP 設定の書き出し
bun test
```

[Bun](https://bun.sh/) v1.0+ が必要です(セットアップスクリプトは bash。Windows は WSL で)。プラグインは **Plugins → Development → Import plugin from manifest…** → `packages/figma-plugin/manifest.json` で読み込みます。リレーを別マシンで動かす特殊なケースのためにスタンドアロン版(`bun socket`)もあります。詳細は [CONTRIBUTING.md](CONTRIBUTING.md)、手動 QA は [docs/smoke-checklist.md](docs/smoke-checklist.md)。

## ライセンス

MIT — [LICENSE](LICENSE) を参照。
