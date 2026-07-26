import type { Language } from './i18n';

export const VERSION = 'v0.3.0';

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
      p2: 'It is not a position invented for this page: Relai is how its author maintains a production design system — the audits, the repairs, the builds all run through it. The next section is one of those evenings.',
      p3: 'The writable part of taste becomes rules the machine keeps. The part that can\u2019t be written always waits for your yes.'
    },
    flows: {
      eyebrow: 'WAYS TO ASK',
      title: 'The canvas is an input, too.',
      items: [
        { title: 'A comment becomes a task', body: 'Leave an @-comment on the canvas. When you tell the AI to check the comments, it claims the thread, does the work, and replies on it. Asynchronous by design — it picks up when you send it looking.',
          rows: ['comment › @relai round every button corner to 8', 'manage_comments · thread claimed', 'set_properties · 12 nodes ✓', 'reply posted · thread resolved ✓'] },
        { title: 'Your selection is context', body: 'Select a layer and say “this one too.” Selection and page changes flow back as events, so you point instead of describing paths.',
          rows: ['you › (selects Card / Pricing)', 'you › same treatment as the last one', 'get_selection_context · 1 node', 'set_properties · verified ✓'] },
        { title: 'It reads the manual first', body: 'Ten workflow documents ship with the server as MCP prompts — token strategy, component conventions, audits, bulk cleanup, comment-driven work, file memory & precedents — so the AI arrives briefed. Your own skills load too, from ~/.figma-relai/skills. And the whole tool contract is a machine-readable manifest, regenerated from the running code on every build.',
          rows: ['10 skills · shipped as MCP prompts', 'npx figma-relai manifest', '→ every tool · every pitfall · never drifts'] }
      ]
    },
    law: {
      eyebrow: 'CASE LAW',
      title: 'Rule once. The file remembers.',
      body: 'Say “this deviation is intent, not drift” and it becomes a precedent — recorded inside the file, deletable any time in the panel. From then on, any edit that touches what it references gets the precedent attached to its result, from any AI client. Your judgment compounds; the agent is corrected by your own case law, in the moment.',
      rows: [
        'you › this deviation is intent — remember it',
        'record_precedent · saved to file ✓',
        '(a week later, a different client)',
        'manage_variables · update demo/corner',
        'precedents: “…is intent, not drift” — reverted'
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
        { kicker: 'pitfalls', title: 'The minefield, mapped', body: 'The Figma Plugin API is full of traps — fonts must load before text edits, instances reject new children, resizing pins auto-layout axes. Relai ships 25 pitfalls learned in production: when the AI trips one, the raw error comes back with the fix attached, and the same registry compiles into the cheat sheet the AI reads before writing any code.', artifact: '✗ cannot write to node with unloaded font\n  hint: await figma.loadFontAsync(node.fontName)\n        before editing text — new TextNodes\n        default to Inter Regular' },
        { kicker: 'verification', title: 'It checks its own work', body: 'After a write, the AI can look: screenshot the node, compare against intent, re-read the result. Verification is a first-class step in the loop, not an afterthought — the difference between “done” and “actually done”.', artifact: 'set_properties         24 nodes · 0.6s  ✓\nexport_node_as_image                    ✓\nverify_visual          → match          ✓' },
        { kicker: 'conventions', title: 'Your system comes first', body: 'Before building, the AI inventories the file — collections, tokens, components, the libraries actually in use — and the conventions you store in the file itself ride along into its context: naming rules, token routing, no-go zones. Since 0.3 the file also carries precedents — your recorded rulings, surfaced on any write that touches them. It builds from your components instead of redrawing near-copies.', artifact: '# conventions — carried by the file\n· colors route through Theme tokens, no raw hex\n· props camelCase · states hovered/pressed/…\n· never detach; reuse atoms from /components\n# memory — precedents, e.g.\n· "KARTE Badge border=1 is intent"' },
        { kicker: 'navigation', title: 'A map, not a maze', body: 'Thirty-two tools is a curated surface, not an API dump. Every result comes back structured — a summary, honest notes about what got truncated, and a recommended next step — so the model navigates instead of wandering. The full contract also exists as a machine-readable manifest, regenerated from the running code on every build — and if the chain itself misbehaves, one doctor command diagnoses it end to end.', artifact: '{ "summary": "3 pages · 45 component sets",\n  "note": "components truncated (top 40)",\n  "recommended_next": "get_node_info on\n    the set you plan to extend" }' }
      ]
    },
    notes: {
      eyebrow: 'FIELD NOTES',
      stats: [
        { n: '32', label: 'tools, one MCP server' },
        { n: '30,251', label: 'stale bindings repaired in one evening — zero visual change' },
        { n: '0', label: 'credits. Your model, your subscription, every Figma plan' },
        { n: '25', label: 'pitfalls learned in production, shipped as hints' }
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
        { q: 'What does the file remember — and can I delete it?', a: 'Since 0.3 a file can carry precedents: rulings you made, recorded only when you or the agent explicitly records one. The panel\u2019s Memory row lists every entry; delete any of them there. Nothing is recorded silently.' },
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
    nav: { changes: 'できること', start: 'はじめる', faq: 'FAQ', github: 'GitHub', install: 'プラグインを導入', home: 'Relaiホーム', menu: 'メニューを開く', close: 'メニューを閉じる' },
    hero: {
      eyebrow: 'FIGMA × MCP',
      title: 'あなたのAIを、\nキャンバスへ。',
      body: 'RelaiはClaude Code、Cursor、Codexなど、あらゆるMCPクライアントをFigmaにつなぎます。いつものモデルとの会話だけで、読み取り・編集・監査・デザインシステム構築まで。オープンソース、ローカル動作、全プラン対応。',
      install: 'プラグインを導入',
      github: 'GitHub',
      anyClient: 'すべてのMCPクライアント',
      panelCaption: 'プラグインパネル — 実行ログ、承認ゲート、スコープロック。モックではなく実際のスクリーンショットです。'
    },
    belief: {
      eyebrow: 'THE IDEA',
      p1: 'Relaiの出発点はシンプルです。AIの時代には、デザイナーの主導権はむしろ大きくなるべきだ、という立場です。判断と好みはあなたの手元に。作業は、あなたがすでに信頼しているモデルへ — あなたのルールで、あなたのシステムの上で、すべて見えるかたちで。',
      p2: 'これは、このページのために用意した主張ではありません。作者自身が、実運用中の自分のデザインシステムの面倒をRelaiで見ています — 監査も、修復も、構築も。次のセクションは、そのうちのある晩の記録です。',
      p3: '書ける好みは、機械も守る規約に。書けない部分は、いつまでもあなたの頷きを待つ。'
    },
    flows: {
      eyebrow: 'WAYS TO ASK',
      title: 'キャンバスも、入力になる。',
      items: [
        { title: 'コメントが、そのままタスクになる', body: 'キャンバスに@コメントを残しておき、AIに「コメントを見て」と言うと、スレッドを引き受けて作業し、そのスレッドに返信します。設計上、非同期です — 見に行かせたときに拾います。',
          rows: ['comment › @relaiボタンの角丸を全部8に', 'manage_comments · thread claimed', 'set_properties · 12 nodes ✓', 'reply posted · thread resolved ✓'] },
        { title: '選択が、そのまま文脈になる', body: 'レイヤーを選んで「これも同じように」。選択やページの移動はイベントとしてAI側に流れるので、パスを説明する代わりに、指させます。',
          rows: ['you › （Card / Pricingを選択）', 'you › さっきと同じように', 'get_selection_context · 1 node', 'set_properties · verified ✓'] },
        { title: '働く前に、手引きを読んでいる', body: 'トークン戦略、コンポーネント規約、監査、一括整理、コメント運用、ファイルの記憶と判例 — 10本のワークフロー文書がMCPプロンプトとしてサーバーに同梱され、AIは下調べ済みで現場に来ます。自作スキルも~/.figma-relai/skillsから読み込めます。ツール契約の全体も機械可読のmanifestとして、ビルドごとに実行コードから再生成されます。',
          rows: ['10 skills · shipped as MCP prompts', 'npx figma-relai manifest', '→ every tool · every pitfall · never drifts'] }
      ]
    },
    law: {
      eyebrow: 'CASE LAW',
      title: '一度の裁定を、\nファイルは忘れない。',
      body: '「この逸脱は意図で、ドリフトではない」と言えば、それは判例になります — ファイルの中に記録され、パネルからいつでも消せます。以後、その参照先に触れる編集には、どのAIクライアントからでも結果に判例が添付されます。あなたの判断は積み重なり、agentはあなた自身の判例法に、その場で正されます。',
      rows: [
        'you › この逸脱は意図 — 覚えておいて',
        'record_precedent · saved to file ✓',
        '（一週間後、別のクライアントで）',
        'manage_variables · update demo/corner',
        'precedents: “…is intent, not drift” — reverted'
      ]
    },
    ledger: {
      eyebrow: 'ONE SESSION',
      title: 'ある晩のセッションは、こう見える。',
      body: 'コマンドは実行と同時にパネルに並びます — 所要時間、結果、そして大きな変更の前にはデザイナーの承認ゲート。行をクリックすれば該当レイヤーへ移動。Stopを押せば、残りのバッチは取り消されます。',
      youLine1: 'このファイルの変数バインディングを全部監査して',
      youLine2: '承認 — 修復を実行して',
      gateLine: 'デザイナーが承認 · スコープ: ファイル全体',
      rows: [
        { cmd: 'audit_colors', meta: '45,509 nodes scanned · 3.9s' },
        { cmd: 'ghost census', meta: '30,251 stale references found · repair plan drafted' },
        { cmd: 'batch_execute', meta: '25,351 bindings rebound · value-identical twins only' },
        { cmd: 're-census', meta: '30,251 → 936 · zero visual change' }
      ],
      footnote: '実際のセッションからの抜粋です — 実運用中のデザインシステムファイル、2026年7月。数値には手を加えていません。'
    },
    changes: {
      eyebrow: 'WHAT IT DOES',
      title: '読む、編集する、監査する、構築する。すべて会話で。',
      items: [
        { title: 'デザインを理解する', body: '構造・色・レイアウト・トークン利用状況が一度に返ります。AIはキャンバスをスクリーンショットして、推測ではなく実際に確認できます。', ask: 'この画面、どう組み立てられてる？', result: 'get_design_context · structure · tokens · 1 screenshot' },
        { title: '一括編集', body: 'リネーム、再バインド、余白の一斉調整 — 誰も工数を見積もらない雑務が、数千ノードへの一度の会話になります。クリック作業の午後は不要です。', ask: 'アイコンを全部アイコンパック変数につなぎ直して', result: 'batch_execute · 4,306 instances · one round-trip' },
        { title: '監査', body: 'カラートークン網羅性、オートレイアウト品質、コンポーネント健全性、アクセシビリティ — ノード単位で確認し、重み付きの0〜100ヘルススコアにもまとめられます。レビューにそのまま出せる数字です。', ask: 'このページ、レビューに出せる状態？', result: 'analyze_design · token coverage 97.8% · WCAG contrast' },
        { title: 'デザインシステム', body: '変数コレクション、トークン接続、共有スタイル、正しいバリアント、チームライブラリ。AIは近い見た目を描き直すのではなく、既存コンポーネントから構築します。tokenizeは、既存の変数と見た目が一致するハードコード値を一括で接続します。', ask: 'ブランド差分のパディングトークンを開いて配線して', result: 'create_variable · aliased ×3 brand modes · scoped · bound' }
      ]
    },
    craft: {
      eyebrow: 'CRAFT',
      title: '結果の質は、地味な作り込みで決まる。',
      body: 'AIをFigmaにつなぐこと自体は簡単です。Relaiの中身の大半は、出力を「それっぽい何か」で終わらせないための、目立たない作り込みです。',
      items: [
        { kicker: 'pitfalls', title: '落とし穴には、地図がある。', body: 'Figma Plugin APIには落とし穴が多くあります — テキスト編集前のフォント読み込み、子を追加できないインスタンス、リサイズで固定されるオートレイアウト。Relaiには実際の運用で踏んだ25件の知見が同梱されていて、AIが同じ穴を踏むと、エラーに解決策を添えて返します。同じ一覧は、コードを書く前にAIが読むチートシートにもなります。', artifact: '✗ cannot write to node with unloaded font\n  hint: await figma.loadFontAsync(node.fontName)\n        before editing text — new TextNodes\n        default to Inter Regular' },
        { kicker: 'verification', title: '書いたら、見て確かめる。', body: '書き込みのあと、AIはスクリーンショットで実物を確認し、意図と見比べ、結果を読み直せます。検証は後付けではなく、作業ループの標準ステップです。「終わった」と「本当に終わった」の差は、ここで生まれます。', artifact: 'set_properties         24 nodes · 0.6s  ✓\nexport_node_as_image                    ✓\nverify_visual          → match          ✓' },
        { kicker: 'conventions', title: 'まず、あなたのシステムから。', body: '構築の前に、AIはまずファイルを調べます — コレクション、トークン、コンポーネント、実際に使われているライブラリ。ファイル自身に保存した規約（命名、トークンの通し方、触らない場所）も、そのままコンテキストに入ります。0.3からはファイルが判例——あなたの裁定の記録——も携え、参照先に触れる書き込みには判例が浮上します。似た見た目を描き直すのではなく、あなたのコンポーネントから組み立てます。', artifact: '# conventions — carried by the file\n· colors route through Theme tokens, no raw hex\n· props camelCase · states hovered/pressed/…\n· never detach; reuse atoms from /components\n# memory — precedents, e.g.\n· "KARTE Badge border=1 is intent"' },
        { kicker: 'navigation', title: '結果には、次の一手がついてくる。', body: '32個のツールは、APIをそのまま並べたものではなく、選んで設計した操作面です。結果は必ず構造化されて返ります — 要約、省略した箇所の注記、そして推奨される次の一手。だからモデルは迷いません。契約の全体は機械可読のmanifestとしてビルドごとに再生成され、接続の調子が悪いときはdoctorコマンド一発で全体を診断できます。', artifact: '{ "summary": "3 pages · 45 component sets",\n  "note": "components truncated (top 40)",\n  "recommended_next": "get_node_info on\n    the set you plan to extend" }' }
      ]
    },
    notes: {
      eyebrow: 'FIELD NOTES',
      stats: [
        { n: '32', label: 'ツール、ひとつのMCPサーバー' },
        { n: '30,251', label: 'ひと晩で修復した無効バインディング — 見た目の変化ゼロ' },
        { n: '0', label: 'クレジット。いつものモデルと契約、全Figmaプラン' },
        { n: '25', label: '実際の運用で得た知見を、ヒントとして同梱' }
      ],
      caption: '数値はすべて、実運用中のデザインシステムでの実セッションから。2026年7月。'
    },
    start: {
      eyebrow: 'GET STARTED',
      title: '3ステップ。有料プランは不要。',
      body: '必要なのはFigma Desktop、Node.js 18+、MCPクライアントだけです。',
      steps: [
        { title: 'プラグインを導入', body: 'Figma Communityから入手して実行します。自動で接続し、再起動後もルームを記憶します。' },
        { title: 'サーバーを登録', body: 'AIクライアントをRelaiに向けます。' },
        { title: '頼んでみる', body: 'ペアリングは自動です。ウィンドウ間でコピーするものはありません。' }
      ],
      community: 'Figma Communityで開く',
      cursor: 'Cursorの場合は、以下を追加：'
    },
    faq: {
      eyebrow: 'FAQ',
      title: 'よくある質問。',
      items: [
        { q: '有料のFigmaプランは必要ですか？', a: '不要です。書き込みは有料REST APIではなくFigmaプラグインを経由するため、すべてのFigmaプランで利用できます。' },
        { q: 'どのAIクライアントで動作しますか？', a: 'Claude Code、Cursor、Codexなど、あらゆるMCPクライアントで動作します。RelaiをMCPサーバーとして一度登録するだけです。' },
        { q: 'ファイルの内容はどこかに送られますか？', a: '新しい宛先はありません。リレーはローカルで動き、ファイルの内容はFigma、あなたのマシン、そして普段から信頼しているAIクライアントの間にとどまります。' },
        { q: 'ファイルは何を記憶しますか？消せますか？', a: '0.3から、ファイルは判例——あなたが下した裁定——を持てます。記録されるのは、あなたかAIが明示的に記録したときだけ。パネルのMEMORY行に全件が並び、いつでも削除できます。黙って記録されるものはありません。' },
        { q: 'ウィンドウ間で何かをコピーする必要は？', a: 'ありません。ペアリングは自動です。join_roomツールは、同時に2つのFigmaファイルでプラグインを動かすまれなケース専用です。' },
        { q: 'AIにコードを実行させないことはできますか？', a: 'はい。execute_figmaはFigma Plugin APIを直接扱うエスケープハッチで、任意コード実行であることをドキュメントにも明記しています。望まない場合は「Allow code execution」をオフにしてください。' },
        { q: 'デザインの利用状況はどう理解しますか？', a: 'get_design_systemがファイルと使用中ライブラリを棚卸しし、AIは既存のコンポーネントとトークンから構築します。' }
      ]
    },
    cta: {
      eyebrow: 'READY',
      title: 'AIをキャンバスへ。',
      body: 'プラグインを導入し、サーバーを登録して、頼んでみましょう。今お使いのFigmaプランで動きます。',
      install: 'プラグインを導入',
      star: 'GitHubでスター',
      tagline: 'あなたのAIを、キャンバスへ。'
    },
    copy: { copy: 'コピー', copied: 'コピー済み' }
  },
  zh: {
    nav: { changes: '功能', start: '开始使用', faq: '常见问题', github: 'GitHub', install: '安装插件', home: 'Relai首页', menu: '打开菜单', close: '关闭菜单' },
    hero: {
      eyebrow: 'FIGMA × MCP',
      title: '让你的AI，\n来到画布上。',
      body: 'Relai将Claude Code、Cursor、Codex —— 任意MCP客户端 —— 连接到Figma。与你熟悉的模型对话，就能读取、编辑、审计设计，直至搭建整套设计系统。开源、本地运行、支持所有Figma计划。',
      install: '安装插件',
      github: 'GitHub',
      anyClient: '任意MCP客户端',
      panelCaption: '插件面板 —— 实时活动、审批门、选区锁。真实截图，不是示意稿。'
    },
    belief: {
      eyebrow: 'THE IDEA',
      p1: 'Relai的出发点很简单：AI时代，设计师的主导权应该变大，而不是变小。判断和品味留在你手里；活交给你已经信任的模型 —— 按你的规则，在你的系统之上，每一步都看得见。',
      p2: '这份立场不是为这个页面现写的：Relai的作者自己，就在用它维护一套生产中的设计系统 —— 审计、修复、构建，都走它。下一节，就是其中一晚的记录。',
      p3: '可写的品味，写成机器也守的规矩；写不下的部分，永远等你点头。'
    },
    flows: {
      eyebrow: 'WAYS TO ASK',
      title: '画布本身，也是输入。',
      items: [
        { title: '评论直接变成任务', body: '在画布上留一条@评论；当你让AI去看评论时，它会认领线程、完成工作，并在线程里回复。这是有意为之的异步 —— 你派它去看，它才来接。',
          rows: ['comment › @relai把所有按钮圆角统一为8', 'manage_comments · thread claimed', 'set_properties · 12 nodes ✓', 'reply posted · thread resolved ✓'] },
        { title: '选区就是上下文', body: '选中图层，说一句「这个也一样」。选区和页面切换会作为事件流回AI——你指给它看，不用描述路径。',
          rows: ['you › （选中Card / Pricing）', 'you › 和刚才一样处理', 'get_selection_context · 1 node', 'set_properties · verified ✓'] },
        { title: '开工之前，先读手册', body: 'Token策略、组件规范、审计流程、批量整理、评论协作、文件记忆与判例 —— 10份工作流文档作为MCP prompts内置在服务器里，AI是备过课才进场的。你自作的skill也能从~/.figma-relai/skills装载。整套工具契约也是机器可读的manifest，每次构建都从运行代码重新生成。',
          rows: ['10 skills · shipped as MCP prompts', 'npx figma-relai manifest', '→ every tool · every pitfall · never drifts'] }
      ]
    },
    law: {
      eyebrow: 'CASE LAW',
      title: '裁决一次，文件记一辈子。',
      body: '说一句「这个偏离是意图，不是漂移」，它就成了判例——记录在文件体内，面板里随时可删。此后任何触到其引用对象的编辑，无论来自哪个AI客户端，结果里都会附上这条判例。你的判断在累积；agent在动手的瞬间，被你自己的判例法纠正。',
      rows: [
        'you › 这个偏离是意图——记住',
        'record_precedent · saved to file ✓',
        '（一周后，另一个客户端）',
        'manage_variables · update demo/corner',
        'precedents: “…is intent, not drift” — reverted'
      ]
    },
    ledger: {
      eyebrow: 'ONE SESSION',
      title: '某晚的一次会话，看起来是这样。',
      body: '每条命令在执行时同步出现在面板中 —— 耗时、结果，以及大改动前的设计师审批门。点击记录可跳转到对应图层；按下Stop，剩下的批量任务立即取消。',
      youLine1: '审计这个文件里的全部变量绑定',
      youLine2: '批准 —— 执行修复',
      gateLine: '设计师已批准 · 范围: 整个文件',
      rows: [
        { cmd: 'audit_colors', meta: '45,509 nodes scanned · 3.9s' },
        { cmd: 'ghost census', meta: '30,251 stale references found · repair plan drafted' },
        { cmd: 'batch_execute', meta: '25,351 bindings rebound · value-identical twins only' },
        { cmd: 're-census', meta: '30,251 → 936 · zero visual change' }
      ],
      footnote: '摘自真实会话 —— 一个生产环境设计系统文件，2026年7月。数字未经修饰。'
    },
    changes: {
      eyebrow: 'WHAT IT DOES',
      title: '读取、编辑、审计、构建 —— 通过对话完成。',
      items: [
        { title: '理解设计', body: '结构、颜色、布局和Token使用情况一次返回；AI还能截取画布真正查看，而不是猜测。', ask: '这个界面是怎么搭起来的？', result: 'get_design_context · structure · tokens · 1 screenshot' },
        { title: '批量编辑', body: '改名、重绑、间距清扫 —— 这些没人给排期的杂务，变成一次覆盖数千节点的对话，而不是一下午的逐个点击。', ask: '把所有图标重新绑定到图标包变量', result: 'batch_execute · 4,306 instances · one round-trip' },
        { title: '设计审计', body: '颜色Token覆盖、自动布局质量、组件健康度、无障碍性 —— 逐节点检查，也可以合成一个0–100的加权健康分，直接放进评审。', ask: '这一页能送评审了吗？', result: 'analyze_design · token coverage 97.8% · WCAG contrast' },
        { title: '设计系统', body: '变量集合、Token绑定、共享样式、正确的变体与团队库导入。AI基于你已有的组件构建，而不是重画近似副本；tokenize还能把所有与现有变量视觉一致的硬编码值一次性全部绑定。', ask: '开一个分品牌的内边距Token并接好线', result: 'create_variable · aliased ×3 brand modes · scoped · bound' }
      ]
    },
    craft: {
      eyebrow: 'CRAFT',
      title: '结果更好，是有原因的。',
      body: '把AI接到Figma上并不难。Relai的大部分工作，是那些决定输出到底是生产级、还是"看着像回事的噪音"的朴素功夫。',
      items: [
        { kicker: 'pitfalls', title: '雷区，已绘制成图。', body: 'Figma Plugin API处处是坑 —— 编辑文本前必须加载字体、实例不接受新子级、resize会锁死自动布局轴。Relai内置了25条生产环境踩出来的坑：AI一旦踩中，原始报错会连同解法一起返回；同一份清单还会编译成AI写代码前要读的速查表。', artifact: '✗ cannot write to node with unloaded font\n  hint: await figma.loadFontAsync(node.fontName)\n        before editing text —— new TextNodes\n        default to Inter Regular' },
        { kicker: 'verification', title: '自己的活，自己验。', body: '写入之后，AI能"亲眼看"：截图节点、对照意图、重读结果。验证是循环里的标配步骤，而不是事后补救 —— "做完了"和"真的做完了"的差别就在这里。', artifact: 'set_properties         24 nodes · 0.6s  ✓\nexport_node_as_image                    ✓\nverify_visual          → match          ✓' },
        { kicker: 'conventions', title: '先学你的系统。', body: '动手之前，AI会先盘点文件 —— 集合、Token、组件、实际在用的库；你存在文件里的规约（命名规则、Token路径、禁改区）也会直接进入它的上下文。从0.3起文件还携带判例——你的裁决记录，任何触到引用对象的写入都会浮出对应判例。它基于你的组件构建，而不是重画近似副本。', artifact: '# conventions —— carried by the file\n· colors route through Theme tokens, no raw hex\n· props camelCase · states hovered/pressed/…\n· never detach; reuse atoms from /components\n# memory — precedents, e.g.\n· "KARTE Badge border=1 is intent"' },
        { kicker: 'navigation', title: '给的是路标，不是迷宫。', body: '32个工具是挑过、排过的操作面，不是把API原样倒出来。每个结果都以结构化形式返回 —— 摘要、对截断之处的诚实标注，以及建议的下一步 —— 模型不再瞎逛，而是循路前进。整套契约同时以机器可读的manifest存在、随每次构建重新生成；链路出问题时，一条doctor命令即可端到端诊断。', artifact: '{ "summary": "3 pages · 45 component sets",\n  "note": "components truncated (top 40)",\n  "recommended_next": "get_node_info on\n    the set you plan to extend" }' }
      ]
    },
    notes: {
      eyebrow: 'FIELD NOTES',
      stats: [
        { n: '32', label: '个工具，一个MCP服务器' },
        { n: '30,251', label: '一晚修复的失效绑定 —— 视觉零变化' },
        { n: '0', label: '额度。你的模型、你的订阅、所有Figma计划' },
        { n: '25', label: '生产环境踩过的坑，已内置为提示' }
      ],
      caption: '数字来自生产环境设计系统的真实会话，2026年7月。'
    },
    start: {
      eyebrow: 'GET STARTED',
      title: '三步完成，不需要付费计划。',
      body: '你只需要Figma Desktop、Node.js 18+和一个MCP客户端。',
      steps: [
        { title: '安装插件', body: '从Figma Community获取并运行。它会自行连接，并在重启后记住所在房间。' },
        { title: '注册服务器', body: '将你的AI客户端指向Relai。' },
        { title: '开口提需求', body: '配对自动完成，不需要在窗口之间复制任何内容。' }
      ],
      community: '在Figma Community打开',
      cursor: '对于Cursor，将以下内容加入'
    },
    faq: {
      eyebrow: '常见问题',
      title: '常见问题，直接解答。',
      items: [
        { q: '需要付费的Figma计划吗？', a: '不需要。写入操作通过Figma插件而不是付费REST API完成，因此Relai适用于每种Figma计划。' },
        { q: '支持哪些AI客户端？', a: 'Claude Code、Cursor、Codex —— 任意MCP客户端。只需将Relai注册一次为MCP服务器。' },
        { q: '我的文件内容会流向哪里？', a: '不会有新的去向。中继在本地运行，文件内容只在Figma、你的机器和你已经信任的AI客户端之间流动。' },
        { q: '文件会记住什么？能删吗？', a: '从0.3起，文件可以携带判例——你下过的裁决，只在你或AI明确记录时才会写入。面板的MEMORY行列出全部条目，随时可删。没有任何东西会被悄悄记录。' },
        { q: '需要在窗口之间复制内容吗？', a: '不需要。配对自动完成。join_room工具只用于一种少见情况：两个Figma文件同时运行插件。' },
        { q: '可以阻止AI执行代码吗？', a: '可以。execute_figma是直接调用Figma Plugin API的应急出口 —— 文档明确说明这是任意代码执行。不希望的话，在插件中关闭「Allow code execution」即可。' },
        { q: '它如何了解我的设计？', a: 'get_design_system会盘点文件及其使用的库，让AI基于已有组件和Token构建。' }
      ]
    },
    cta: {
      eyebrow: 'READY',
      title: '把你的AI带到画布上。',
      body: '安装插件、注册服务器，然后直接开口提需求。它支持你现在使用的Figma计划。',
      install: '安装插件',
      star: '在GitHub点星',
      tagline: '让你的AI，来到画布上。'
    },
    copy: { copy: '复制', copied: '已复制' }
  }
} as const;

export function getCopy(language: Language) {
  return translations[language];
}
