<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/syoooo/figma-relai/main/assets/relai-logo-cream.svg">
  <img src="https://raw.githubusercontent.com/syoooo/figma-relai/main/assets/relai-logo-ink.svg" alt="Relai" height="36">
</picture>

[English](README.md) | 日本語 | [中文](README.zh.md)

[figma-relai.vercel.app](https://figma-relai.vercel.app)

**Your AI, on the canvas.** RelaiはClaude Code・Cursor・Codexなど、どのMCPクライアントもFigmaにつなぎます。いつものモデルとの会話で、読み取り、一括編集、チェック、デザインシステム構築まで。そしてファイルは、ただ編集される側ではありません。規約も、判例も、触らせない場所も、ファイル自身が持っています。開いたクライアントは、そのすべてを引き継ぎます。規約を破る編集は、実行の手前で断られます。ファイルに、拒否権を。だから、AIに本物の仕事を任せきれます。

Relaiの立場はシンプルです。AIの時代、デザイナーの主導権はむしろ大きくなるべきです。判断と好みは手元に。作業は、すでに信頼しているモデルへ。すべての手順が見えるかたちで。

<img src="https://raw.githubusercontent.com/syoooo/figma-relai/main/assets/plugin-ui.ja.png" alt="Relaiプラグイン:実行フィード、接続ステータス、停止ボタン" width="380" />

## セッションはこう進む

> **あなた:** CTAを目立たせて、角も丸めて。
>
> **AI:** `set_properties · 3 nodes · 0.4s ✓` → `verify_visual · match ✓`
>
> **あなた:** この画面全体をダークモードにして。
>
> **AI:** `set_properties · 24 nodes · 1.2s ✓` → `analyze_design · overall → 92/100`
>
> **あなた:** Brand / Mastersにも同じことを。
>
> **ファイル:** `✗ blocked — "Brand / Masters" is a no-go zone`

コマンドは実行と同時にプラグインに並びます。所要時間と、成功か失敗か。行をクリックすれば該当レイヤーへ移動。気が変わったら**Stop**を押せば、残りのバッチは取り消されます。そして、そもそも実行されないコマンドもあります。囲っておいたページへの書き込みは、キャンバスに触れる前に断られ、理由が記録に残ります。

桁が増えても、同じ調子で動きます。Relaiは、現役で運用されているデザインシステムの保守で、毎日動いている道具です。以下は、そのセッションのひとつからの抜粋です。2026年7月。数字に手は入れていません。

```text
audit_colors     45,509 nodes scanned · 3.9s
ghost census     30,251 stale references found
approval gate    designer approved · scope: full file
batch_execute    25,351 bindings rebound
re-census        30,251 → 936 · zero visual change
```

肝心なのは、真ん中のapproval gateです。デザイナーの承認はひとつ。それが、25,351件の再バインドを通しました。その間、立入禁止はひとつも破られていません。

## 決めごとは、ファイルの中に

スピードか、仕組みか。コードの世界は、その二択を先に抜けました。モデルが慎重になったからではありません。リポジトリが押し返すからです。Lintが指摘し、チェックが門を守り、保護ブランチが拒む。だから開発者は、AIに本物の仕事を渡して、席を立てます。Relaiは、その押し返しをデザインファイルに組み込みます。手綱ではなく、許可証。

本来なら毎回プロンプトに貼るようなルールを、Figmaファイル自身が持ちます。だから次のセッションは、どのMCPクライアントで誰が開いても、下調べ済みの状態から始まります。しかも、要になる部分は、モデルが読んでくれるかもしれない文章ではありません。決めごとは、チェックとして走ります。

**規約**は、ファイルに保存された小さなCLAUDE.mdです。命名、トークンの通し方、余白の癖。AIは作業の前にこれを読みます。ただしCLAUDE.mdと違って、規約は誰かのAI環境ではなく、ファイルのものです。設定していないクライアントも含めて、開けば引き継がれます。増やすときは、AIに言うだけです(「規約を追加。色はThemeトークンを通す」)。何が保存されているかは、パネルのRULES行に出ます。

**メモリー**は判例を持ちます。「ここの余白はわざと」と決めれば、その判断はファイルに記録されます。以後、参照先に触れる編集では、その一言が結果に添えられます。一度決めれば、ファイルは忘れない。

```text
you        "this gap is on purpose — remember it"
file       record_precedent · saved ✓

(another session, a different AI, about to "fix" the gap)
file       precedent attached — "…is on purpose" · the edit backs off
```

パネルのMEMORY行に全件が並び、いつでも削除できます。黙って残るものはありません。文書ではなく、判例集です。

**キット。**ひとりのデザイナーはたいてい、ひとつのプロダクトを見ていて、そのファイルはどれも同じ決めごとで動きます。名前を付けてキットにしておけば、他のファイルでも同じ規約が使えます。Figmaはブランチのマージで、ファイルが持つ決めごとを落とします。キットがそれを戻します。ワンクリックで。自動復元をオンにしておけば、そのクリックもなしで。

**立入禁止(NO-GO)**は、ページ単位で囲います。ブランドのマスター、法務、もう仕上がっているあのページ。囲ったページへの書き込みは実行の手前で拒否され、理由が記録に残ります。囲いを編集できるのはデザイナーだけです。キャンバスの保護ブランチです。

**確認**は4段階の設定です(OPEN · RISK · BULK · ALL)。既定のRISKでは、破壊的操作(変数/スタイルの削除・detach・flatten)だけが確認を求め、それ以外は止まりません。パネルから決めるもの。AIには動かせません。

決めごとの置き場所と、届く範囲。実体はファイルの中のプラグインデータです。キャンバスにレイヤーが増えることはなく、ファイルを複製しても消えません。ブランチのマージでは落ちます。そこはキットが戻します。執行はプラグインの側、つまりファイルの側にあります。強さはふたつ。立入禁止とLock to selectionは壁で、書き込みそのものが拒否されます。判例は、参照先に触れた瞬間に、残した一言が届く仕組みです。書いた本人が現れるから、AIは引き下がります。Relaiにつないだクライアントは、手元で設定していないものも含めて、どれであっても縛られます。別の経路に向けたAIは縛れません。見張っていない扉は、守れないからです。だからこそ、すべてに記録が残ります。

これは、こつこつ済ませる設定作業ではありません。積み重なっていくものです。初日のファイルは決めごとが白紙で、AIは誰のAIとも同じように動きます。ひと月後には、規約と判例を読み込み、囲いの前で止まるようになります。同じプロンプトでも、空のファイルは皆の平均を出し、育てたファイルは、あなたのデザインを出します。長く使ったふたりが手にしているのは、同じ道具ではありません。ふたつの、違う楽器です。

## はじめる

必要なのは[Figma Desktop](https://www.figma.com/downloads/)、[Node.js](https://nodejs.org/) 18+、MCPクライアントです。

**1. プラグインを導入する。** [最新リリース](https://github.com/syoooo/figma-relai/releases/latest)から`relai-plugin.zip`をダウンロードして展開し、デスクトップアプリの**Plugins → Development → Import plugin from manifest…**で`manifest.json`を選びます。編集したいファイルでプラグインを開き、パネルは開いたままにしてください。書き込みはそこを通ります。自動で接続し、再起動後もルームを覚えています。リリースにプラグインの更新が入っていたら、新しいzipを読み込み直してください。

**2. サーバーを登録する。** AIクライアントに次を追加します。

```bash
claude mcp add Relai -- npx -y figma-relai      # Claude Code
codex mcp add Relai -- npx -y figma-relai       # Codex CLI
```

Cursorの場合は、`.cursor/mcp.json`に以下を追加します。

```json
{ "mcpServers": { "Relai": { "command": "npx", "args": ["-y", "figma-relai"] } } }
```

あるいは、設定ごとAIに任せることもできます。次を貼り付けてください。

```text
Relaiをセットアップして。このクライアントにMCPサーバーを登録し
(コマンドは `npx -y figma-relai`、例: `claude mcp add Relai -- npx -y figma-relai`)、
そのあと https://github.com/syoooo/figma-relai/releases/latest からの
Figmaプラグインの導入手順を案内して。Figma側の操作はこちらでやります。
```

**3. 頼んでみる。** ペアリングは自動です。ウィンドウ間でコピーするものはありません。まずは「この画面、どう組み立てられてる？」と聞いてみてください。

## 得意なこと

デザインを理解する。「この画面、どう組み立てられてる？」で構造・色・レイアウト・トークンの利用状況が一度に返ります。AIはスクリーンショットでキャンバスを実際に確認できるので、推測で答えません。

一括編集。「ボタンのラベルを全部英語に」「この画面をダークモードに」が、何十レイヤーでも一往復で終わります。午後がまるごと潰れるクリック作業は、もう要りません。

チェック。`analyze_design`はカラートークンの網羅性、オートレイアウトの品質、コンポーネントの健全性、アクセシビリティ(WCAGコントラスト、タッチターゲット、文字サイズ)を確認します。重み付きの0〜100点にまとめて、そのままレビューに出すこともできます。「これは意図どおり」と決めた箇所は免除のまま、蒸し返されません。さらに、AIに任せる準備がどこまで整っているかの採点(足りない箇所つき)、このファイルでよく使われる角丸・余白・文字サイズの傾向の集計、消した変数を今も指す参照の数え上げまで。

デザインシステム。モード付きの変数コレクション、トークンの割り当て、共有スタイル、正しいバリアント、チームライブラリの導入。`get_design_system`がファイルと使用中ライブラリの持ち物を棚卸しします。Figmaのトークンがあれば、ファイルにまだ置かれていないものも含めて、ライブラリの全カタログまで。だからAIは、似た見た目を描き直すのではなく、手元のコンポーネントから組み立てます。`analyze_design`のtokensは、既存の変数と見た目が一致するハードコード値を見つけ、`tokenize`一発で全部つなぎます。これらは事前条件チェック付きの宣言的な操作です。同じ依頼はいつも同じ挙動になり、失敗したときはスタックトレースではなく、「先にset_layout_modeを呼ぶ」といった次の一手が返ります。

それ以外の全部。`execute_figma`はFigma Plugin APIを直接扱うJavaScriptを実行します。公式MCPと同じ発想の最後の手段ですが、正しい書き方が最短の書き方になる`relai.*`ヘルパー、実際の運用で踏んだ落とし穴の一覧(既知のエラーには解決策が添えられて返ります)、静かな間違いを拾うLintが付きます。AIにコードを実行させたくなければ、プラグインの「Allow code execution」をオフに。

## 主導権はあなたに

プラグインはデザイナー側の受け持ちです。AIのすべての動作が流れる実行フィード、本当にペアリングしているときだけ点くAI接続インジケーター(サーバーが起動しているだけでは点きません)、保留中の作業を取り消すStopボタン。選択やページ移動はイベントとしてAIに流れるので、「これも同じように」が説明なしで通じます。

**Lock to selection**は、選択範囲の外への編集を拒否します。AIには明確なエラーが返り、黙って通ることはありません。リレーはローカルで動き、ファイルの内容はFigma・手元のマシン・すでに信頼しているAIクライアントの間だけを移動します。UIはEnglish・日本語・中文に対応。

それでも何かが壊れたとき。やりすぎた一括変更、間違った「修正」。何が起きたかは実行フィードで追えます。戻るのは、Figmaのバージョン履歴からです。魔法のundoはありませんし、あるふりもしません。`diff_nodes`のチェックポイントが、何がどう変わったかを突き止めます。決めごとの側が間違っていたときは、AIに「かまわず進めて」と言ってから、パネルのMEMORY行でその判例を消してください。判例の削除はワンクリック。決めごとを直す権利は、いつでも手元にあります。

## 仕組み

```
AI (any MCP client)
  ↕ stdio
MCP server            33 tools · analysis · verification
  (embedded relay)    WebSocket room hub on 127.0.0.1:9055
  ↕ WebSocket
Figma plugin          executes Plugin API calls
```

リレーはMCPサーバーに埋め込まれているので、別プロセスを立てておく必要はありません。複数のMCPクライアントが同時に動くときは、最初のひとつがリレーを担い、他はそこへ接続します。担い手が終了したら、残ったひとつが引き継ぎます。両側ともルームを覚えていて、再起動やスリープの後も自ら再会します。`join_room`ツールの出番はひとつだけ。ふたつのFigmaファイルが同時にプラグインを動かしているときです。

上の記録にある所要時間は、実測です。決めごとのチェックは書き込みのたびにプラグイン内で走り、小さな編集は1秒未満で返ります。45,509ノードのチェックで3.9秒です。

ポートはFigmaのプラグインサンドボックスが決めています。manifestが許可するのは`ws://localhost:9055–9057`で、それ以外のポートは`manifest.json`を書き換えない限り使えません。UIにポート設定がないのはそのためです。

## ツール一覧

| グループ | ツール |
|-------|-------|
| コンテキスト | `get_document_overview` · `get_selection_context` · `get_node_details` · `search_nodes` · `get_design_tokens` · `screenshot` · `get_events` |
| 分析 | `analyze_design`(color / layout / components / accessibility / overall)· `diff_nodes`(比較、またはチェックポイント保存/比較) |
| 検証 | `verify_changes` · `validate_design_rules` · `verify_visual` |
| 読み取り | `get_node_data`(summary / tree / full / css / variables) |
| 作成・編集 | `create_node` · `set_properties` · `set_text` · `edit_structure` |
| コンポーネント | `manage_components` |
| デザインシステム | `get_design_system` · `manage_variables` · `manage_styles` · `import_from_library` · `manage_conventions` · `manage_rulesets` |
| ドキュメント | `manage_pages` · `navigate` |
| アセット | `export_asset` · `add_image` |
| 注釈 | `annotate` |
| コメント | `manage_comments`(トークンが必要。下記参照) |
| 上級 | `batch_execute` · `execute_figma` · `join_room` |

各ツールは自己記述式で、AIには完全なパラメータドキュメントが見えます。同じ仕様はファイルとしても存在します。`npx figma-relai manifest`は、全ツールのスキーマ・プラグインコマンド・既知の落とし穴を機械可読JSONで出力します。ビルドごとに実行コードから生成されるので(`docs/manifest.json`としてコミット済み)、ドリフトしません。`npx figma-relai docs <tool>`は人間向けに整形します。あわせて11本のスキル文書がMCPプロンプトとして同梱されます。トークン戦略、コンポーネント規約、チェックのワークフロー、QAゲート、`execute_figma`用Plugin APIチートシート、ファイルのメモリーと判例、そしてデザインシステムファースト構築・一括整理・コメント駆動コラボのレシピ。自作スキルも読み込めます。name/descriptionのフロントマター付きmarkdownを`~/.figma-relai/skills/`に置けば、`user:`プロンプトとして登録されます。

## Relaiと公式のFigma MCP

Figma自身のAIは急速に育っています。公式MCPサーバーはキャンバスへの書き込みに対応し、Figma Design Agentはエディタの中で協働します。どちらもフルシートの有料プラン向けで、利用はAIクレジットで数えられ、モデルはFigmaが選びます。Relaiは、その線の反対側に立つオープンソースです。いつものモデル、いつもの契約、手元のマシン。そしてコントロールはデザイナーの手に。書き込みは有料REST APIではなくRelaiのFigmaプラグインを通るので、無料を含むすべてのプランで動きます。シートがあるなら、両方を走らせて併用できます。

## オプション:Figmaのトークン

FigmaのREST APIの向こう側にあって、パーソナルアクセストークンを必要とするものがふたつあります。コメントと、ライブラリの完全なコンポーネントカタログです。後者は、そのファイルにまだ一度も置かれていない、公開済みのコンポーネントまで含みます。どのライブラリかはRelaiが自ら突き止めるので、URLを貼る必要はありません。

figma.com → Settings → Security → Personal access tokensで発行し(file content readスコープ。`manage_comments`を使うならコメントのスコープも)、一度だけ渡します。

```bash
npx figma-relai login    # 検証し、どのアカウントかを返し、~/.figma-relai/credentials.json(0600)に保存します
npx figma-relai logout   # 削除します
```

トークンをコマンド引数で渡すことはありません。argvはシェル履歴にも、マシン上のあらゆる`ps`にも残るからです。`login`は伏せた入力か、パイプ(`pbpaste | npx figma-relai login`)から受け取ります。MCP設定の`FIGMA_TOKEN`も従来どおり有効で、そちらが優先されます。プロジェクトごとの上書きはこの経路で可能です。

```json
{ "mcpServers": { "Relai": { "command": "npx", "args": ["-y", "figma-relai"],
  "env": { "FIGMA_TOKEN": "figd_..." } } } }
```

どちらの経路でも、トークンを読むのはMCPサーバープロセスだけで、送信先は`api.figma.com`だけです。リレーを渡ってプラグインに届くことはありません。パネルのACCESS TOKEN行が示すのは、トークンがあるという事実だけ。値は示しません。他のツールはトークンなしで全部動きます。

トークンがあると、「コメントのフィードバックを反映して」が実際に動きます。スレッドを読み、編集し、返信する。静かな進め方も選べます。キャンバスに@コメントをタスクとして残しておき、あとでAIに「コメントを見て」と言うだけ。スレッドを引き受けて、作業して、そこに報告します。

## トラブルシューティング

まず`npx figma-relai doctor`を。Node、リレーポート(別のプロセスが塞いでいないかどうかも)、プラグインの導入状況、保存済みルーム、そしてFigmaのトークン(どこから来たものか、保存ファイルの権限は十分に絞られているか)をコマンドひとつで点検し、それぞれに直し方を添えます。

**プラグインがNO SERVERと表示する。**ポート9055–9057で待つMCPサーバーがありません。AIクライアントが起動していないか、Relaiが登録されていないのがほとんどです。パネルに登録コマンドがそのまま表示されます。プラグインは接続を試し続け、サーバーが現れた瞬間につながります。

**RELAYはLINKなのにAGENTがWAITING。**接続は正常です。このセッションでAIがまだFigmaツールを呼んでいないだけ。ファイルについて何か聞いてみてください。

**「複数のFigmaプラグインが接続しています」。**ふたつのファイルがプラグインを動かしています。操作したい方のプラグインに表示されているルーム名で`join_room`するようAIに伝えてください。

**初回の`npx`が遅い。**パッケージを一度ダウンロードしているだけです。次回からは速くなります。

## セキュリティ

リレーは`127.0.0.1`にのみバインドし、認証はルーム名だけです(暗号学的にランダムなサフィックス付き)。`execute_figma`はAIの書いたコードをFigmaのプラグインサンドボックス内で実行します。既定でオン、実行はすべてフィードに見え、デザイナーはオフにできます。スクリプトはアトミックではありません。失敗したスクリプトでも、途中までの変更は残ります。脅威モデルの全体は[SECURITY.md](SECURITY.md)を。

## コントリビューター向け

```bash
git clone https://github.com/syoooo/figma-relai.git
cd figma-relai
bun setup       # install, build, write local MCP configs
bun test
```

[Bun](https://bun.sh/) v1.0+ が必要です(セットアップスクリプトはbash。WindowsはWSLで)。プラグインは**Plugins → Development → Import plugin from manifest…** → `packages/figma-plugin/manifest.json`で読み込みます。リレーを別マシンで動かす珍しいケースのために、スタンドアロン版(`bun socket`)もあります。詳しくは[CONTRIBUTING.md](CONTRIBUTING.md)、手動QAは[docs/smoke-checklist.md](docs/smoke-checklist.md)を。

プロジェクトの現状。Relaiは、現役のデザインシステムを保守する実仕事の中で育っています。リリースは、その仕事に沿って出ます。長く使えることの担保は、MITとローカルファーストです。どこにも通信せず、リポジトリが静かになっても、手元のRelaiは止まりません。

## ライセンス

MIT。[LICENSE](LICENSE)を参照。
