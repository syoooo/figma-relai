import type { Language } from './i18n';

export const VERSION = 'v0.2.7';

export const translations = {
  en: {
    nav: { changes: 'What it does', start: 'Get started', faq: 'FAQ', github: 'GitHub', install: 'Install plugin', home: 'Relai home', menu: 'Open menu', close: 'Close menu' },
    hero: {
      eyebrow: 'FIGMA × MCP',
      title: 'Your AI, on the canvas.',
      body: 'Relai connects Claude Code, Cursor, Codex — any MCP client — to Figma. Read, edit, audit, and build design systems by talking to the model you already use. Open source, local, every Figma plan.',
      install: 'Install the plugin',
      github: 'GitHub',
      anyClient: 'any MCP client',
      panelCaption: 'The plugin panel — live activity, approval gate, scope lock. Real screenshot, not a mockup.'
    },
    belief: {
      eyebrow: 'THE IDEA',
      p1: 'Relai is built on a simple position: the AI era should put designers more in charge, not less. Taste and judgment stay with you; the labor moves to a model you already trust — under your rules, on your system, with every step visible.',
      p2: 'It is not a position invented for this page: Relai is how its author maintains a production design system — the audits, the repairs, the builds all run through it. The next section is one of those evenings.'
    },
    flows: {
      eyebrow: 'WAYS TO ASK',
      title: 'The canvas is an input, too.',
      items: [
        { title: 'A comment becomes a task', body: 'Leave an @-comment on the canvas. When you tell the AI to check the comments, it claims the thread, does the work, and replies on it. Asynchronous by design — it picks up when you send it looking.',
          rows: ['comment › @relai round every button corner to 8', 'manage_comments · thread claimed', 'set_properties · 12 nodes ✓', 'reply posted · thread resolved ✓'] },
        { title: 'Your selection is context', body: 'Select a layer and say “this one too.” Selection and page changes flow back as events, so you point instead of describing paths.',
          rows: ['you › (selects Card / Pricing)', 'you › same treatment as the last one', 'get_selection_context · 1 node', 'set_properties · verified ✓'] },
        { title: 'It reads the manual first', body: 'Nine workflow documents ship with the server as MCP prompts — token strategy, component conventions, audits, bulk cleanup, comment-driven work — so the AI arrives briefed. And the whole tool contract is a machine-readable manifest, regenerated from the running code on every build.',
          rows: ['9 skills · shipped as MCP prompts', 'npx figma-relai manifest', '→ every tool · every pitfall · never drifts'] }
      ]
    },
    ledger: {
      eyebrow: 'ONE SESSION',
      title: 'This is what an evening looks like.',
      body: 'Every command lands in the panel as it runs — timing, result, and a designer-side approval gate before anything big. Click an entry to jump to that layer. Press Stop and the rest of the batch is cancelled.',
      youLine1: 'audit every variable binding in this file',
      youLine2: 'approved — run the repair',
      gateLine: 'designer approved · scope: full file',
      rows: [
        { cmd: 'audit_colors', meta: '45,509 nodes scanned · 3.9s' },
        { cmd: 'ghost census', meta: '30,251 stale references found · repair plan drafted' },
        { cmd: 'batch_execute', meta: '25,351 bindings rebound · value-identical twins only' },
        { cmd: 're-census', meta: '30,251 → 936 · zero visual change' }
      ],
      footnote: 'Excerpt from a real session — a production design system file, July 2026. Numbers unedited.'
    },
    changes: {
      eyebrow: 'WHAT IT DOES',
      title: 'Read, edit, audit, and build — by talking.',
      items: [
        { title: 'Understand a design', body: 'Structure, colors, layout, and token usage come back in one pass — and the AI can screenshot the canvas to actually look, not guess.', ask: 'How is this screen put together?', result: 'get_design_context · structure · tokens · 1 screenshot' },
        { title: 'Bulk edits', body: 'The janitorial work nobody budgets time for — renames, rebinds, spacing sweeps — becomes one conversation across thousands of nodes, instead of an afternoon of clicking.', ask: 'Rebind every icon to the icon-pack variable', result: 'batch_execute · 4,306 instances · one round-trip' },
        { title: 'Audits', body: 'Color-token coverage, auto-layout quality, component health, accessibility — checked node by node, or rolled into one weighted 0–100 health score you can put in a review.', ask: 'Is this page ready for review?', result: 'analyze_design · token coverage 97.8% · WCAG contrast' },
        { title: 'Design systems', body: 'Variable collections, token binding, shared styles, proper variants, team-library imports. The AI builds from your components instead of redrawing near-copies — and tokenize binds every hardcoded value that visually matches an existing variable, in one call.', ask: 'Open a brand-specific padding token and wire it up', result: 'create_variable · aliased ×3 brand modes · scoped · bound' }
      ]
    },
    craft: {
      eyebrow: 'CRAFT',
      title: 'Why the results come out better.',
      body: 'Connecting an AI to Figma is the easy part. Most of Relai is the unglamorous work that decides whether the output is production-grade or plausible-looking noise.',
      items: [
        { kicker: 'pitfalls', title: 'The minefield, mapped', body: 'The Figma Plugin API is full of traps — fonts must load before text edits, instances reject new children, resizing pins auto-layout axes. Relai ships 24 pitfalls learned in production: when the AI trips one, the raw error comes back with the fix attached, and the same registry compiles into the cheat sheet the AI reads before writing any code.', artifact: '✗ cannot write to node with unloaded font\n  hint: await figma.loadFontAsync(node.fontName)\n        before editing text — new TextNodes\n        default to Inter Regular' },
        { kicker: 'verification', title: 'It checks its own work', body: 'After a write, the AI can look: screenshot the node, compare against intent, re-read the result. Verification is a first-class step in the loop, not an afterthought — the difference between “done” and “actually done”.', artifact: 'set_properties         24 nodes · 0.6s  ✓\nexport_node_as_image                    ✓\nverify_visual          → match          ✓' },
        { kicker: 'conventions', title: 'Your system comes first', body: 'Before building, the AI inventories the file — collections, tokens, components, the libraries actually in use — and the conventions you store in the file itself ride along into its context: naming rules, token routing, no-go zones. It builds from your components instead of redrawing near-copies.', artifact: '# conventions — carried by the file\n· colors route through Theme tokens, no raw hex\n· props camelCase · states hovered/pressed/…\n· never detach; reuse atoms from /components' },
        { kicker: 'navigation', title: 'A map, not a maze', body: 'Thirty-two tools is a curated surface, not an API dump. Every result comes back structured — a summary, honest notes about what got truncated, and a recommended next step — so the model navigates instead of wandering. The full contract also exists as a machine-readable manifest, regenerated from the running code on every build — and if the chain itself misbehaves, one doctor command diagnoses it end to end.', artifact: '{ "summary": "3 pages · 45 component sets",\n  "note": "components truncated (top 40)",\n  "recommended_next": "get_node_info on\n    the set you plan to extend" }' }
      ]
    },
    notes: {
      eyebrow: 'FIELD NOTES',
      stats: [
        { n: '32', label: 'tools, one MCP server' },
        { n: '30,251', label: 'stale bindings repaired in one evening — zero visual change' },
        { n: '0', label: 'credits. Your model, your subscription, every Figma plan' },
        { n: '24', label: 'pitfalls learned in production, shipped as hints' }
      ],
      caption: 'Numbers from real sessions on a production design system, July 2026.'
    },
    start: {
      eyebrow: 'GET STARTED',
      title: 'Three steps. No paid plan required.',
      body: 'You need Figma Desktop, Node.js 18+, and an MCP client.',
      steps: [
        { title: 'Install the plugin', body: 'Get it from Figma Community and run it. It connects on its own and remembers its room across restarts.' },
        { title: 'Register the server', body: 'Point your AI client at Relai.' },
        { title: 'Ask for something', body: 'Pairing is automatic — there is nothing to copy between windows.' }
      ],
      community: 'Open in Figma Community',
      cursor: 'For Cursor, add this to'
    },
    faq: {
      eyebrow: 'FAQ',
      title: 'Questions, answered.',
      items: [
        { q: 'Do I need a paid Figma plan?', a: 'No. Writes go through a Figma plugin rather than the paid REST API, so Relai works on every Figma plan.' },
        { q: 'Which AI clients does it work with?', a: 'Claude Code, Cursor, Codex — any MCP client. You register Relai once as an MCP server and talk to the model you already use.' },
        { q: 'Where do my file contents go?', a: 'Nowhere new. The relay runs on your machine; file contents move only between Figma, your machine, and the AI client you already trust.' },
        { q: 'Is there anything to copy between windows?', a: 'No. Pairing is automatic. The join_room tool exists for one rare case only: two Figma files running the plugin at the same time.' },
        { q: 'Can I stop the AI from running code?', a: 'Yes. execute_figma runs JavaScript against the Figma Plugin API as an escape hatch — it is arbitrary code execution, and the docs say so plainly. If you would rather the AI never ran code, turn it off with the plugin’s “Allow code execution” toggle.' },
        { q: 'How does it know what my design uses?', a: 'get_design_system inventories the file and the libraries it uses, so the AI builds from your existing components and tokens instead of redrawing near-copies.' }
      ]
    },
    cta: {
      eyebrow: 'READY',
      title: 'Bring your AI onto the canvas.',
      body: 'Install the plugin, register the server, and ask for something. It works on the Figma plan you already have.',
      install: 'Install the plugin',
      star: 'Star on GitHub',
      tagline: 'Your AI, on the canvas.'
    },
    copy: { copy: 'Copy', copied: 'Copied' }
  },
  ja: {
    nav: { changes: 'できること', start: 'はじめる', faq: 'FAQ', github: 'GitHub', install: 'プラグインを導入', home: 'Relai ホーム', menu: 'メニューを開く', close: 'メニューを閉じる' },
    hero: {
      eyebrow: 'FIGMA × MCP',
      title: 'あなたの AI を、\nキャンバスへ。',
      body: 'Relai は Claude Code、Cursor、Codex など、あらゆる MCP クライアントを Figma につなぎます。いつものモデルとの会話だけで、読み取り・編集・監査・デザインシステム構築まで。オープンソース、ローカル動作、全プラン対応。',
      install: 'プラグインを導入',
      github: 'GitHub',
      anyClient: 'すべての MCP クライアント',
      panelCaption: 'プラグインパネル — 実行ログ、承認ゲート、スコープロック。モックではなく実際のスクリーンショットです。'
    },
    belief: {
      eyebrow: 'THE IDEA',
      p1: 'Relai の出発点はシンプルです。AI の時代には、デザイナーの主導権はむしろ大きくなるべきだ、という立場です。判断と好みはあなたの手元に。作業は、あなたがすでに信頼しているモデルへ — あなたのルールで、あなたのシステムの上で、すべて見えるかたちで。',
      p2: 'これは、このページのために用意した主張ではありません。作者自身が、実運用中の自分のデザインシステムの面倒を Relai で見ています — 監査も、修復も、構築も。次のセクションは、そのうちのある晩の記録です。'
    },
    flows: {
      eyebrow: 'WAYS TO ASK',
      title: 'キャンバスも、入力になる。',
      items: [
        { title: 'コメントが、そのままタスクになる', body: 'キャンバスに @ コメントを残しておき、AI に「コメントを見て」と言うと、スレッドを引き受けて作業し、そのスレッドに返信します。設計上、非同期です — 見に行かせたときに拾います。',
          rows: ['comment › @relai ボタンの角丸を全部 8 に', 'manage_comments · thread claimed', 'set_properties · 12 nodes ✓', 'reply posted · thread resolved ✓'] },
        { title: '選択が、そのまま文脈になる', body: 'レイヤーを選んで「これも同じように」。選択やページの移動はイベントとして AI 側に流れるので、パスを説明する代わりに、指させます。',
          rows: ['you › （Card / Pricing を選択）', 'you › さっきと同じように', 'get_selection_context · 1 node', 'set_properties · verified ✓'] },
        { title: '働く前に、手引きを読んでいる', body: 'トークン戦略、コンポーネント規約、監査、一括整理、コメント運用 — 9 本のワークフロー文書が MCP プロンプトとしてサーバーに同梱され、AI は下調べ済みで現場に来ます。ツール契約の全体も機械可読の manifest として、ビルドごとに実行コードから再生成されます。',
          rows: ['9 skills · shipped as MCP prompts', 'npx figma-relai manifest', '→ every tool · every pitfall · never drifts'] }
      ]
    },
    ledger: {
      eyebrow: 'ONE SESSION',
      title: 'ある晩のセッションは、こう見える。',
      body: 'コマンドは実行と同時にパネルに並びます — 所要時間、結果、そして大きな変更の前にはデザイナーの承認ゲート。行をクリックすれば該当レイヤーへ移動。Stop を押せば、残りのバッチは取り消されます。',
      youLine1: 'このファイルの変数バインディングを全部監査して',
      youLine2: '承認 — 修復を実行して',
      gateLine: 'デザイナーが承認 · スコープ: ファイル全体',
      rows: [
        { cmd: 'audit_colors', meta: '45,509 nodes scanned · 3.9s' },
        { cmd: 'ghost census', meta: '30,251 stale references found · repair plan drafted' },
        { cmd: 'batch_execute', meta: '25,351 bindings rebound · value-identical twins only' },
        { cmd: 're-census', meta: '30,251 → 936 · zero visual change' }
      ],
      footnote: '実際のセッションからの抜粋です — 実運用中のデザインシステムファイル、2026 年 7 月。数値には手を加えていません。'
    },
    changes: {
      eyebrow: 'WHAT IT DOES',
      title: '読む、編集する、監査する、構築する。すべて会話で。',
      items: [
        { title: 'デザインを理解する', body: '構造・色・レイアウト・トークン利用状況が一度に返ります。AI はキャンバスをスクリーンショットして、推測ではなく実際に確認できます。', ask: 'この画面、どう組み立てられてる？', result: 'get_design_context · structure · tokens · 1 screenshot' },
        { title: '一括編集', body: 'リネーム、再バインド、余白の一斉調整 — 誰も工数を見積もらない雑務が、数千ノードへの一度の会話になります。クリック作業の午後は不要です。', ask: 'アイコンを全部アイコンパック変数につなぎ直して', result: 'batch_execute · 4,306 instances · one round-trip' },
        { title: '監査', body: 'カラートークン網羅性、オートレイアウト品質、コンポーネント健全性、アクセシビリティ — ノード単位で確認し、重み付きの 0〜100 ヘルススコアにもまとめられます。レビューにそのまま出せる数字です。', ask: 'このページ、レビューに出せる状態？', result: 'analyze_design · token coverage 97.8% · WCAG contrast' },
        { title: 'デザインシステム', body: '変数コレクション、トークン接続、共有スタイル、正しいバリアント、チームライブラリ。AI は近い見た目を描き直すのではなく、既存コンポーネントから構築します。tokenize は、既存の変数と見た目が一致するハードコード値を一括で接続します。', ask: 'ブランド差分のパディングトークンを開いて配線して', result: 'create_variable · aliased ×3 brand modes · scoped · bound' }
      ]
    },
    craft: {
      eyebrow: 'CRAFT',
      title: '結果の質は、地味な作り込みで決まる。',
      body: 'AI を Figma につなぐこと自体は簡単です。Relai の中身の大半は、出力を「それっぽい何か」で終わらせないための、目立たない作り込みです。',
      items: [
        { kicker: 'pitfalls', title: '落とし穴には、地図がある。', body: 'Figma Plugin API には落とし穴が多くあります — テキスト編集前のフォント読み込み、子を追加できないインスタンス、リサイズで固定されるオートレイアウト。Relai には実際の運用で踏んだ 24 件の知見が同梱されていて、AI が同じ穴を踏むと、エラーに解決策を添えて返します。同じ一覧は、コードを書く前に AI が読むチートシートにもなります。', artifact: '✗ cannot write to node with unloaded font\n  hint: await figma.loadFontAsync(node.fontName)\n        before editing text — new TextNodes\n        default to Inter Regular' },
        { kicker: 'verification', title: '書いたら、見て確かめる。', body: '書き込みのあと、AI はスクリーンショットで実物を確認し、意図と見比べ、結果を読み直せます。検証は後付けではなく、作業ループの標準ステップです。「終わった」と「本当に終わった」の差は、ここで生まれます。', artifact: 'set_properties         24 nodes · 0.6s  ✓\nexport_node_as_image                    ✓\nverify_visual          → match          ✓' },
        { kicker: 'conventions', title: 'まず、あなたのシステムから。', body: '構築の前に、AI はまずファイルを調べます — コレクション、トークン、コンポーネント、実際に使われているライブラリ。ファイル自身に保存した規約（命名、トークンの通し方、触らない場所）も、そのままコンテキストに入ります。似た見た目を描き直すのではなく、あなたのコンポーネントから組み立てます。', artifact: '# conventions — carried by the file\n· colors route through Theme tokens, no raw hex\n· props camelCase · states hovered/pressed/…\n· never detach; reuse atoms from /components' },
        { kicker: 'navigation', title: '結果には、次の一手がついてくる。', body: '32 個のツールは、API をそのまま並べたものではなく、選んで設計した操作面です。結果は必ず構造化されて返ります — 要約、省略した箇所の注記、そして推奨される次の一手。だからモデルは迷いません。契約の全体は機械可読の manifest としてビルドごとに再生成され、接続の調子が悪いときは doctor コマンド一発で全体を診断できます。', artifact: '{ "summary": "3 pages · 45 component sets",\n  "note": "components truncated (top 40)",\n  "recommended_next": "get_node_info on\n    the set you plan to extend" }' }
      ]
    },
    notes: {
      eyebrow: 'FIELD NOTES',
      stats: [
        { n: '32', label: 'ツール、ひとつの MCP サーバー' },
        { n: '30,251', label: 'ひと晩で修復した無効バインディング — 見た目の変化ゼロ' },
        { n: '0', label: 'クレジット。いつものモデルと契約、全 Figma プラン' },
        { n: '24', label: '実際の運用で得た知見を、ヒントとして同梱' }
      ],
      caption: '数値はすべて、実運用中のデザインシステムでの実セッションから。2026 年 7 月。'
    },
    start: {
      eyebrow: 'GET STARTED',
      title: '3 ステップ。有料プランは不要。',
      body: '必要なのは Figma Desktop、Node.js 18+、MCP クライアントだけです。',
      steps: [
        { title: 'プラグインを導入', body: 'Figma Community から入手して実行します。自動で接続し、再起動後もルームを記憶します。' },
        { title: 'サーバーを登録', body: 'AI クライアントを Relai に向けます。' },
        { title: '頼んでみる', body: 'ペアリングは自動です。ウィンドウ間でコピーするものはありません。' }
      ],
      community: 'Figma Community で開く',
      cursor: 'Cursor の場合は、以下を追加：'
    },
    faq: {
      eyebrow: 'FAQ',
      title: 'よくある質問。',
      items: [
        { q: '有料の Figma プランは必要ですか？', a: '不要です。書き込みは有料 REST API ではなく Figma プラグインを経由するため、すべての Figma プランで利用できます。' },
        { q: 'どの AI クライアントで動作しますか？', a: 'Claude Code、Cursor、Codex など、あらゆる MCP クライアントで動作します。Relai を MCP サーバーとして一度登録するだけです。' },
        { q: 'ファイルの内容はどこかに送られますか？', a: '新しい宛先はありません。リレーはローカルで動き、ファイルの内容は Figma、あなたのマシン、そして普段から信頼している AI クライアントの間にとどまります。' },
        { q: 'ウィンドウ間で何かをコピーする必要は？', a: 'ありません。ペアリングは自動です。join_room ツールは、同時に 2 つの Figma ファイルでプラグインを動かすまれなケース専用です。' },
        { q: 'AI にコードを実行させないことはできますか？', a: 'はい。execute_figma は Figma Plugin API を直接扱うエスケープハッチで、任意コード実行であることをドキュメントにも明記しています。望まない場合は「Allow code execution」をオフにしてください。' },
        { q: 'デザインの利用状況はどう理解しますか？', a: 'get_design_system がファイルと使用中ライブラリを棚卸しし、AI は既存のコンポーネントとトークンから構築します。' }
      ]
    },
    cta: {
      eyebrow: 'READY',
      title: 'AI をキャンバスへ。',
      body: 'プラグインを導入し、サーバーを登録して、頼んでみましょう。今お使いの Figma プランで動きます。',
      install: 'プラグインを導入',
      star: 'GitHub でスター',
      tagline: 'あなたの AI を、キャンバスへ。'
    },
    copy: { copy: 'コピー', copied: 'コピー済み' }
  },
  zh: {
    nav: { changes: '功能', start: '开始使用', faq: '常见问题', github: 'GitHub', install: '安装插件', home: 'Relai 首页', menu: '打开菜单', close: '关闭菜单' },
    hero: {
      eyebrow: 'FIGMA × MCP',
      title: '让你的 AI，\n来到画布上。',
      body: 'Relai 将 Claude Code、Cursor、Codex —— 任意 MCP 客户端 —— 连接到 Figma。与你熟悉的模型对话，即可阅读、编辑、审计并构建设计系统。开源、本地运行、支持所有 Figma 计划。',
      install: '安装插件',
      github: 'GitHub',
      anyClient: '任意 MCP 客户端',
      panelCaption: '插件面板 —— 实时活动、审批门、选区锁。真实截图，不是示意稿。'
    },
    belief: {
      eyebrow: 'THE IDEA',
      p1: 'Relai 的出发点很简单：AI 时代，设计师的主导权应该变大，而不是变小。判断和品味留在你手里；活交给你已经信任的模型 —— 按你的规则，在你的系统之上，每一步都看得见。',
      p2: '这份立场不是为这个页面现写的：Relai 的作者自己，就在用它维护一套生产中的设计系统 —— 审计、修复、构建，都走它。下一节，就是其中一晚的记录。'
    },
    flows: {
      eyebrow: 'WAYS TO ASK',
      title: '画布本身，也是输入。',
      items: [
        { title: '评论直接变成任务', body: '在画布上留一条 @ 评论；当你让 AI 去看评论时，它会认领线程、完成工作、并在线程里回复。这是有意为之的异步 —— 你派它去看，它才来接。',
          rows: ['comment › @relai 把所有按钮圆角统一为 8', 'manage_comments · thread claimed', 'set_properties · 12 nodes ✓', 'reply posted · thread resolved ✓'] },
        { title: '选区就是上下文', body: '选中图层，说一句「这个也一样」。选区和页面切换会作为事件流回 AI，你用手指，不用描述路径。',
          rows: ['you › （选中 Card / Pricing）', 'you › 和刚才一样处理', 'get_selection_context · 1 node', 'set_properties · verified ✓'] },
        { title: '开工之前，先读手册', body: 'Token 策略、组件规范、审计流程、批量整理、评论协作 —— 9 份工作流文档以 MCP prompts 形式随服务器发货，AI 是备过课才进场的。整套工具契约也是机器可读的 manifest，每次构建都从运行代码重新生成。',
          rows: ['9 skills · shipped as MCP prompts', 'npx figma-relai manifest', '→ every tool · every pitfall · never drifts'] }
      ]
    },
    ledger: {
      eyebrow: 'ONE SESSION',
      title: '某晚的一次会话，看起来是这样。',
      body: '每条命令在执行时同步出现在面板中 —— 耗时、结果，以及大改动前的设计师审批门。点击记录可跳转到对应图层；按下 Stop，剩余批处理立即取消。',
      youLine1: '审计这个文件里的全部变量绑定',
      youLine2: '批准 —— 执行修复',
      gateLine: '设计师已批准 · 范围: 整个文件',
      rows: [
        { cmd: 'audit_colors', meta: '45,509 nodes scanned · 3.9s' },
        { cmd: 'ghost census', meta: '30,251 stale references found · repair plan drafted' },
        { cmd: 'batch_execute', meta: '25,351 bindings rebound · value-identical twins only' },
        { cmd: 're-census', meta: '30,251 → 936 · zero visual change' }
      ],
      footnote: '摘自真实会话 —— 一个生产环境设计系统文件，2026 年 7 月。数字未经修饰。'
    },
    changes: {
      eyebrow: 'WHAT IT DOES',
      title: '阅读、编辑、审计、构建 —— 通过对话完成。',
      items: [
        { title: '理解设计', body: '结构、颜色、布局和 Token 使用情况一次返回；AI 还能截取画布真正查看，而不是猜测。', ask: '这个界面是怎么搭起来的？', result: 'get_design_context · structure · tokens · 1 screenshot' },
        { title: '批量编辑', body: '改名、重绑、间距清扫 —— 这些没人给排期的杂务，变成一次对话、覆盖数千节点，而不是一下午的逐个点击。', ask: '把所有图标重新绑定到图标包变量', result: 'batch_execute · 4,306 instances · one round-trip' },
        { title: '设计审计', body: '颜色 Token 覆盖、自动布局质量、组件健康度、无障碍性 —— 逐节点检查，也可以合成一个 0–100 的加权健康分，直接放进评审。', ask: '这一页能送评审了吗？', result: 'analyze_design · token coverage 97.8% · WCAG contrast' },
        { title: '设计系统', body: '变量集合、Token 绑定、共享样式、正确的变体与团队库导入。AI 基于你已有的组件构建，而不是重画近似副本；tokenize 还能把所有与现有变量视觉一致的硬编码值一次性全部绑定。', ask: '开一个品牌差分的内边距 Token 并接好线', result: 'create_variable · aliased ×3 brand modes · scoped · bound' }
      ]
    },
    craft: {
      eyebrow: 'CRAFT',
      title: '结果更好，是有原因的。',
      body: '把 AI 接到 Figma 上并不难。Relai 的大部分工作，是那些决定输出到底是生产级、还是"看着像回事的噪音"的朴素功夫。',
      items: [
        { kicker: 'pitfalls', title: '雷区，已绘制成图。', body: 'Figma Plugin API 处处是坑 — 编辑文本前必须加载字体、实例不接受新子级、resize 会锁死自动布局轴。Relai 内置了 24 条生产环境踩出来的坑：AI 一旦踩中，原始报错会连同解法一起返回；同一份台账还会编译成 AI 写代码前要读的速查表。', artifact: '✗ cannot write to node with unloaded font\n  hint: await figma.loadFontAsync(node.fontName)\n        before editing text — new TextNodes\n        default to Inter Regular' },
        { kicker: 'verification', title: '自己的活，自己验。', body: '写入之后，AI 能"亲眼看"：截图节点、对照意图、重读结果。验证是循环里的一等公民，而不是事后补救 — "做完了"和"真的做完了"的差别就在这里。', artifact: 'set_properties         24 nodes · 0.6s  ✓\nexport_node_as_image                    ✓\nverify_visual          → match          ✓' },
        { kicker: 'conventions', title: '先学你的系统。', body: '动手之前，AI 会先盘点文件 — 集合、Token、组件、实际在用的库；你存在文件里的规约（命名规则、Token 路径、禁改区）也会直接进入它的上下文。它基于你的组件构建，而不是重画近似副本。', artifact: '# conventions — carried by the file\n· colors route through Theme tokens, no raw hex\n· props camelCase · states hovered/pressed/…\n· never detach; reuse atoms from /components' },
        { kicker: 'navigation', title: '给的是路标，不是迷宫。', body: '32 个工具是精心策展的操作面，不是 API 的倾倒。每个结果都以结构化形式返回 — 摘要、对截断之处的诚实标注，以及建议的下一步 — 模型不再瞎逛，而是循路前进。整套契约同时以机器可读的 manifest 存在、随每次构建重新生成；链路出问题时，一条 doctor 命令即可端到端诊断。', artifact: '{ "summary": "3 pages · 45 component sets",\n  "note": "components truncated (top 40)",\n  "recommended_next": "get_node_info on\n    the set you plan to extend" }' }
      ]
    },
    notes: {
      eyebrow: 'FIELD NOTES',
      stats: [
        { n: '32', label: '个工具，一个 MCP 服务器' },
        { n: '30,251', label: '一晚修复的失效绑定 —— 视觉零变化' },
        { n: '0', label: '额度。你的模型、你的订阅、所有 Figma 计划' },
        { n: '24', label: '生产环境踩过的坑，已内置为提示' }
      ],
      caption: '数字来自生产环境设计系统的真实会话，2026 年 7 月。'
    },
    start: {
      eyebrow: 'GET STARTED',
      title: '三步完成，不需要付费计划。',
      body: '你只需要 Figma Desktop、Node.js 18+ 和一个 MCP 客户端。',
      steps: [
        { title: '安装插件', body: '从 Figma Community 获取并运行。它会自行连接，并在重启后记住所在房间。' },
        { title: '注册服务器', body: '将你的 AI 客户端指向 Relai。' },
        { title: '提出请求', body: '配对自动完成，不需要在窗口之间复制任何内容。' }
      ],
      community: '在 Figma Community 打开',
      cursor: '对于 Cursor，将以下内容加入'
    },
    faq: {
      eyebrow: '常见问题',
      title: '常见问题，直接解答。',
      items: [
        { q: '需要付费的 Figma 计划吗？', a: '不需要。写入操作通过 Figma 插件而不是付费 REST API 完成，因此 Relai 适用于每种 Figma 计划。' },
        { q: '支持哪些 AI 客户端？', a: 'Claude Code、Cursor、Codex —— 任意 MCP 客户端。只需将 Relai 注册一次为 MCP 服务器。' },
        { q: '我的文件内容会流向哪里？', a: '不会多出任何新去处。中继在本地运行，文件内容只在 Figma、你的机器和你已经信任的 AI 客户端之间流动。' },
        { q: '需要在窗口之间复制内容吗？', a: '不需要。配对自动完成。join_room 工具只用于一种少见情况：两个 Figma 文件同时运行插件。' },
        { q: '可以阻止 AI 执行代码吗？', a: '可以。execute_figma 是直接调用 Figma Plugin API 的应急出口 —— 文档明确说明这是任意代码执行。不希望的话，在插件中关闭「Allow code execution」即可。' },
        { q: '它如何了解我的设计？', a: 'get_design_system 会盘点文件及其使用的库，让 AI 基于已有组件和 Token 构建。' }
      ]
    },
    cta: {
      eyebrow: 'READY',
      title: '把你的 AI 带到画布上。',
      body: '安装插件、注册服务器，然后直接提出请求。它支持你现在使用的 Figma 计划。',
      install: '安装插件',
      star: '在 GitHub 点星',
      tagline: '让你的 AI，来到画布上。'
    },
    copy: { copy: '复制', copied: '已复制' }
  }
} as const;

export function getCopy(language: Language) {
  return translations[language];
}
