import type { Language } from './i18n';

export const VERSION = 'v0.6.5';

export const translations = {
  en: {
    nav: { changes: 'What it does', start: 'Get started', faq: 'FAQ', github: 'GitHub', install: 'Install plugin', home: 'Relai home', menu: 'Open menu', close: 'Close menu' },
    hero: {
      eyebrow: 'FIGMA × MCP',
      title: 'Your AI, on the canvas.',
      body: 'Relai connects Claude Code, Cursor, Codex — any MCP client — to Figma. Read, edit, audit, and build design systems by talking to the model you already use — and the file keeps your rules and rulings as you go.',
      install: 'Install the plugin',
      github: 'GitHub',
      anyClient: 'any MCP client'
    },
    belief: {
      eyebrow: 'THE IDEA',
      p1: 'AI reached developers where the real work lives — in the codebase. Designers mostly got it beside the canvas: chat windows, sandboxes, one-shot generators whose output nobody maintains. Relai is built on a simple position: the AI era should put designers more in charge, not less — taste and judgment stay with you; the labor moves to a model you already trust, inside the real file.',
      p2: 'Screens are getting cheap to produce and quick to replace. What lasts is the system underneath: the tokens, the conventions, the decisions you have already made. Relai treats that as the real work — your standards written into the file itself, readable by humans and machines alike; your rulings recorded, so the next session starts where your judgment left off instead of from zero.',
      p4: 'The writable part of taste becomes rules the machine keeps. The part that can’t be written always waits for your yes.'
    },
    flows: {
      eyebrow: 'SCENES',
      title: 'What asking looks like.',
      items: [
        { title: 'Leave comments, come back to receipts', tag: 'COMMENTS · CANVAS', body: 'Pin @-comments as you review — on the canvas, where the problem is. Later, one sentence sends the agent through the queue: each thread claimed, fixed, replied on, resolved. Asynchronous by design.',
          rows: ['comment › @relai these three — swap to Button/Primary', 'comment › @relai this gap should be space/300', '(later)', 'you › work through the comments', 'manage_comments · 2 threads claimed', 'set_properties · fixed · replied ✓ resolved ✓'] },
        { title: 'Your selection is context', tag: 'SELECTION · CANVAS', body: 'Select a layer and say “this one too.” It sees what you selected — you point instead of describing paths.',
          rows: ['you › (selects Card / Pricing)', 'you › same treatment as the last one', 'get_selection_context · 1 node', 'set_properties · verified ✓'] },
        { title: 'A review that ends in a verdict', tag: 'CHAT · QA GATE', body: '“Can this page go out?” runs the QA gate: rules, contrast, component health — and the spots you already called intentional stay waived. It ends with a verdict.',
          rows: ['you › can this page go to review?', 'qa-gate · skill loaded · full page', 'file › 1 flag waived — you ruled it intent', 'verdict: pass — two nits attached ✓'] },
        { title: 'Some pages just say no', tag: 'CHAT · NO-GO', body: 'Fence a page off in the panel — brand masters, legal, the one that is already pixel-perfect. Any write into it is rejected before it touches the canvas, and the receipt says exactly why. Set by you; not negotiable by the model.',
          rows: ['you › tidy every frame name in the file', 'edit_structure · rename · sweeping…', 'file › ✗ blocked — “Brand / Masters” is a no-go zone', 'other pages · proceed ✓'] }
      ]
    },
    law: {
      eyebrow: 'CASE LAW',
      title: 'Rule once. The file remembers.',
      body: 'Say “this deviation is intent, not drift” and it becomes a precedent — recorded inside the file, deletable any time in the panel. From then on, any edit that touches what it references gets the precedent attached to its result, from any AI client. Your judgment compounds; the agent is corrected by your own case law, in the moment.',
      list: [
        { label: 'RULES', text: 'Conventions you write — naming, token routing, structure. Read before any work.' },
        { label: 'MEMORY', text: 'Precedents you rule — attached to any edit that touches what they reference.' },
        { label: 'NO-GO', text: 'Pages you fence off — writes rejected before they run, with the reason on the receipt.' }
      ],
      inherit: 'All three travel with the file — any MCP client, anyone who opens it, inherits them. Save them as a kit, and every file on your machine can use the same law.',
      loop: {
        center: 'ONE RULING',
        s1: 'YOU SAY IT', t1: '“this gap is on purpose”',
        s2: 'THE FILE KEEPS IT', t2: 'record_precedent',
        s3: 'ANOTHER AI COMES TO “FIX” IT', t3: 'knowing nothing',
        s4: 'YOUR WORDS CALL A HALT', t4: 'and it backs off'
      }
    },
    changes: {
      eyebrow: 'WHAT IT DOES',
      title: 'Read, edit, audit, and build — by talking.',
      items: [
        { title: 'Understand a design', line: 'Structure, tokens, layout — and a screenshot, so it looks instead of guessing.', ask: 'How is this screen put together?', result: 'get_design_context · structure · tokens · 1 screenshot' },
        { title: 'Bulk edits', line: 'Renames, rebinds, spacing sweeps — thousands of layers, one conversation.', ask: 'Rebind every icon to the icon-pack variable', result: 'batch_execute · 4,306 instances · one round-trip' },
        { title: 'Audits', line: 'Layer-by-layer checks, or one weighted 0–100 score — plus agent-readiness and a ghost census.', ask: 'Is this page ready for review?', result: 'analyze_design · token coverage 97.8% · WCAG contrast' },
        { title: 'Design systems', line: 'Variables, styles, variants, library imports — built from your components, not near-copies.', ask: 'Open a brand-specific padding token and wire it up', result: 'create_variable · aliased ×3 brand modes · scoped · bound' }
      ]
    },
    craft: {
      eyebrow: 'CRAFT',
      title: 'Why the results come out better.',
      body: 'Connecting an AI to Figma is the easy part. Most of Relai is the unglamorous work that decides whether the output is production-grade or plausible-looking noise — and one hundred and eleven tests written to break it gate every release that touches logic.',
      items: [
        { kicker: 'pitfalls', tag: 'RAW ERROR + HINT', title:'The minefield, mapped', body: 'The Plugin API is full of traps. Relai ships 54 of them, learned in production — trip one, and the raw error comes back with the fix attached; the same registry becomes the cheat sheet the AI reads before writing code.', artifact: '✗ cannot write to node with unloaded font\n  hint: await figma.loadFontAsync(node.fontName)\n        before editing text — new TextNodes\n        default to Inter Regular' },
        { kicker: 'verification', tag: 'RECEIPT', title:'It checks its own work', body: 'After a write, the AI looks: screenshot, compare against intent, re-read the result. The difference between “done” and “actually done”.', rows: ['set_properties · 24 nodes · 0.6s ✓', 'export_asset · 1 png ✓', 'verify_visual · match ✓'] },
        { kicker: 'conventions', tag: 'CARRIED BY THE FILE', title:'Your system comes first', body: 'Before building, the AI inventories the file — and the rules you store in the file itself ride into its context: naming, token routing, no-go zones, your precedents. It builds from your components, not near-copies.', artifact: '# conventions — carried by the file\n· colors route through Theme tokens, no raw hex\n· props camelCase · states hovered/pressed/…\n· never detach; reuse atoms from /components\n# memory — precedents, e.g.\n· "KARTE Badge border=1 is intent"' },
        { kicker: 'navigation', tag: 'TOOL RESULT', title:'A map, not a maze', body: 'Thirty-three tools, each answering with a summary, honest notes on what got truncated, and a recommended next step. The AI arrives briefed, too — eleven skills as MCP prompts, your own from `~/.figma-relai/skills`, the whole contract as a `manifest` regenerated from running code, and one `doctor` command that diagnoses the chain end to end.', artifact: '{\n  "summary": "3 pages · 45 component sets",\n  "note": "components truncated (top 40)",\n  "recommended_next": "get_node_details\n    on the set you plan to extend"\n}' }
      ]
    },
    outlook: {
      eyebrow: 'NOW & NEXT',
      title: 'Where this stands, and where it goes.',
      p1: 'Today, Relai is two things. A way for the AI you already use to read, edit, audit, and build inside the real file. And a set of laws the file itself carries: conventions you write, precedents you rule, pages you fence off. An agent reads them before working, asks at the level you set — four stops, OPEN to ALL — and leaves receipts for everything.',
      p2: 'What comes next follows a single line: more of your judgment should outlive the session it happened in. A ruling you find yourself repeating should be easy to promote — with your consent — into a rule the file keeps and checks for you. Someday, craft packs worth sharing between teams, with provenance. Not on the roadmap: generation races, and anything that acts without leaving a trace.',
      p3: 'None of this is a promise with a date. It is a direction, checked against real work.',
      philo: 'The longer version of this thinking, written down'
    },
    start: {
      eyebrow: 'GET STARTED',
      title: 'Three steps.',
      body: 'You need Figma Desktop, Node.js 18+, and an MCP client.',
      steps: [
        { title: 'Install the plugin', body: 'Download the zip from the latest release, unzip it, then Plugins → Development → Import plugin from manifest in the desktop app. It connects on its own and remembers its room across restarts.' },
        { title: 'Register the server', body: 'Point your AI client at Relai.' },
        { title: 'Ask for something', body: 'Pairing is automatic — there is nothing to copy between windows.' }
      ],
      download: 'Download the plugin',
      cursor: 'For Cursor, add this to'
    },
    faq: {
      eyebrow: 'FAQ',
      title: 'Questions, answered.',
      items: [
        { q: 'Where do my file contents go?', a: 'Nowhere new. The relay runs on your machine; file contents move only between Figma, your machine, and the AI client you already trust.' },
        { q: 'What does the file remember — and can I delete it?', a: 'Since 0.3 a file can carry precedents: rulings you made, recorded only when you or the agent explicitly records one. The panel’s Memory row lists every entry; delete any of them there. Nothing is recorded silently.' },
        { q: 'Where do kits live?', a: 'On your machine, nowhere else. A kit is a named copy of a file’s rules, stored locally by the plugin — no server, no sync. Moving machines is one export and one import: a kit travels as a single markdown file.' },
        { q: 'Can I fence off pages the AI must never touch?', a: 'Yes — AI no-go zones, per page, in the panel. Writes into a guarded page are rejected before they run, with a clear error. And the confirmation dial has four stops — OPEN · RISK · BULK · ALL: at RISK (the default), only the dangerous operations ask — deleting variables or styles, detach, flatten — and everything else keeps moving. Dial to OPEN when you’d rather not be asked at all.' },
        { q: 'Is there anything to copy between windows?', a: 'No. Pairing is automatic. The `join_room` tool exists for one rare case only: two Figma files running the plugin at the same time.' },
        { q: 'Can I stop the AI from running code?', a: 'Yes. `execute_figma` runs JavaScript against the Figma Plugin API as an escape hatch — it is arbitrary code execution, and the docs say so plainly. If you would rather the AI never ran code, turn it off with the plugin’s “Allow code execution” toggle.' },
        { q: 'How does it know what my design uses?', a: '`get_design_system` inventories the file and the libraries it uses, so the AI builds from your existing components and tokens instead of redrawing near-copies. With a token it reads the library’s whole catalog — including the component your file has never placed, which is how a stretched near-copy ends up living next to the real one.' },
        { q: 'Do I need a Figma token?', a: 'For two things only: comments, and that full library catalog. `npx figma-relai login` verifies it and stores it on your machine at 0600; the server process alone reads it, and it never crosses the relay to the plugin — the panel says a token is there, never what it is. Everything else works without one.' }
      ]
    },
    cta: {
      title: 'Bring your AI onto the canvas.',
      body: 'Install the plugin, register the server, and ask for something small. The receipts will tell you the rest.',
      install: 'Install the plugin',
      star: 'Star on GitHub',
      philosophy: 'Philosophy',
      tagline: 'Your AI, on the canvas.'
    },
    philosophy: {
      label: 'PHILOSOPHY',
      title: 'The thinking behind Relai',
      back: 'Relai',
      updated: 'July 2026',
      sections: [
        { h: 'Where AI met each craft', ps: [
          'AI reached developers where the real work lives. It reads the codebase, edits the codebase, is corrected in the codebase; nothing has to be exported for the model to help. Designers mostly got something else: chat windows beside the work, sandboxes that render a facsimile of it, generators that produce a screen nobody will maintain. The output looks like design, but it does not live where design lives.',
          'Relai starts from closing that gap. The agent works inside the production file — your components, your tokens, your pages — because that is where the real decisions already are.'
        ] },
        { h: 'Who holds the pen', ps: [
          'A tool this capable forces the question of charge. Our answer is a position: the AI era should put designers more in charge, not less. Taste and judgment stay with the person; the labor moves to the model. Never the reverse — a model with taste-by-default, and a person reduced to approving its output.',
          'In practice that means the model you already chose, under rules you wrote, with every step visible. Nothing about the arrangement is exotic; it is how you would brief a careful collaborator.'
        ] },
        { h: 'Files that carry law', ps: [
          'The part of taste that can be written down — name things this way, route color through these tokens, never detach — becomes rules the machine keeps. Relai stores them in the file itself, so they travel with the work: any client, anyone who opens the file, inherits them.',
          'The part that emerges case by case becomes precedent. Say “this deviation is intent, not drift” once, and the ruling is recorded; the next edit that touches the same ground gets your past judgment attached. A ruling you repeat is ready to become a rule, and a rule the file carries can be checked for you, automatically — each promotion waiting for your consent. We think of it as case law for a design file: judgment that accumulates instead of evaporating when the session ends.'
        ] },
        { h: 'Two rules we hold ourselves to', ps: [
          'Deliver in-band. Guidance that lives in a document nobody opens might as well not exist. The agent should meet your standards inside the work, at the moment of writing — not in a manual beside it. Everything Relai knows — pitfalls, conventions, precedents — arrives in the tool results themselves.',
          'The duty to watch should fall; the right to inspect must not. Trust is not built by making you stare at a progress bar. It is built by leaving receipts — what ran, what changed, what was refused and why — so that checking is always possible, and eventually, mostly unnecessary.'
        ] },
        { h: 'A tool you grow', ps: [
          'Relai is built to be cultivated, not consumed. A fresh file knows nothing; a file you have worked in for a while carries your conventions, your precedents, your fences. Two long-time users hold two different instruments. The product is the loop, and the loop needs you in it — the part that can’t be written always waits for your yes.',
          'The product itself is made the same way: against one production design system, decision by decision, numbers unedited. A specimen, not a study.'
        ] },
        { h: 'What we will not build', ps: [
          'No generation races: the floor of “make me a screen” is crowded and falling, and the ceiling — audits, migrations, governance, the surgical work on files that must not break — is where a careful agent earns its keep. No actions without receipts. And no sharing of your voice: what makes your work yours is not a feature to aggregate.'
        ] }
      ],
      colophon: 'Written the way the product is built — against one production file, session after session.'
    },
    copy: { copy: 'Copy', copied: 'Copied' }
  },
  ja: {
    nav: { changes: 'できること', start: 'はじめる', faq: 'FAQ', github: 'GitHub', install: 'プラグインを導入', home: 'Relaiホーム', menu: 'メニューを開く', close: 'メニューを閉じる' },
    hero: {
      eyebrow: 'FIGMA × MCP',
      title: 'あなたのAIを、\nキャンバスへ。',
      body: 'RelaiはClaude Code、Cursor、Codexなど、あらゆるMCPクライアントをFigmaにつなぎます。いつものモデルとの会話で、読み取り・編集・チェックからデザインシステム構築まで。ファイルは、あなたの決めごとを覚えていきます。',
      install: 'プラグインを導入',
      github: 'GitHub',
      anyClient: 'すべてのMCPクライアント'
    },
    belief: {
      eyebrow: 'THE IDEA',
      p1: 'AIは、開発者のところへは、本当の仕事場であるコードベースの中にやってきました。デザイナーに届いたものの多くは、キャンバスの外にあります。チャット窓、サンドボックス、生成したきり誰も面倒を見ない一回きりの画面。Relaiの立場はシンプルです。AIの時代、デザイナーの主導権はむしろ大きくなるべきです。判断と好みは手元に。作業は、すでに信頼しているモデルへ。本物のファイルの中で。',
      p2: '画面はどんどん安く作れて、どんどん早く入れ替わっていきます。残るのは、その下の体系です。トークン、規約、これまでに下してきた決定。Relaiはそこを本業として扱います。基準はファイル自身に書き込まれ、人にも機械にも読めます。決めたことは記録され、次のセッションはゼロからではなく、判断が止まったところから始まります。',
      p4: '書ける好みは、機械も守る規約に。書けない部分は、あなたがうなずくまで待つ。'
    },
    flows: {
      eyebrow: 'SCENES',
      title: '頼むと、こうなる。',
      items: [
        { title: 'コメントを残して、あとで受け取る', tag: 'COMMENTS · CANVAS', body: 'レビューしながら@コメントをピンで残す。キャンバスの上、問題のある場所に。あとで一言頼めば、スレッドを順に引き受けて、直して、返信して、解決済みに。設計上、非同期です。',
          rows: ['comment › @relaiこの3つはButton/Primaryに差し替え', 'comment › @relaiこの間隔はspace/300のはず', '（あとで）', 'you › コメントを処理して', 'manage_comments · 2 threads claimed', 'set_properties · fixed · replied ✓ resolved ✓'] },
        { title: '選択が、そのまま文脈になる', tag: 'SELECTION · CANVAS', body: 'レイヤーを選んで「これも同じように」。選択は向こうにも見えているので、パスを説明する代わりに、指させば済みます。',
          rows: ['you › （Card / Pricingを選択）', 'you › さっきと同じように', 'get_selection_context · 1 node', 'set_properties · verified ✓'] },
        { title: '判定で終わるレビュー', tag: 'CHAT · QA GATE', body: '「このページ、出せる？」でQAゲートが走ります。規約、コントラスト、コンポーネントの健全性。「これは意図どおり」と決めた箇所は免除のまま、蒸し返されません。最後に、判定が付きます。',
          rows: ['you › このページ、レビューに出せる？', 'qa-gate · skill loaded · full page', 'file › 1 flag waived — you ruled it intent', 'verdict: pass — two nits attached ✓'] },
        { title: '触らせないページは、断る', tag: 'CHAT · NO-GO', body: 'パネルでページを囲っておきます。ブランドのマスター、法務、もうピクセル単位で完成しているあのページ。そこへの書き込みは実行の手前で拒否され、理由まで記録に残ります。決めるのはあなた。モデルに交渉の余地はありません。',
          rows: ['you › ファイル中のフレーム名を全部整えて', 'edit_structure · rename · sweeping…', 'file › ✗ blocked — “Brand / Masters” is a no-go zone', 'other pages · proceed ✓'] }
      ]
    },
    law: {
      eyebrow: 'CASE LAW',
      title: '一度決めれば、\nファイルは忘れない。',
      body: '「このズレは意図で、ドリフトではない」と言えば、それは判例になります。ファイルの中に記録され、パネルからいつでも消せます。以後、その参照先に触れる編集には、どのAIクライアントからでも結果に判例が添付されます。判断は積み重なり、AIはあなた自身の判例法に、その場で正されます。',
      list: [
        { label: 'RULES', text: '書いておく規約。命名、トークンの通し方、構造。作業の前に読まれます。' },
        { label: 'MEMORY', text: '下した判例。参照先に触れる編集に、その場で添付されます。' },
        { label: 'NO-GO', text: '囲っておくページ。書き込みは実行の手前で拒否され、理由は記録に残ります。' }
      ],
      inherit: '三つとも、ファイルが持ち歩きます。どのMCPクライアントで誰が開いても、そのまま継承。名前を付けてキットにしておけば、他のファイルでも同じ規約が使えます。',
      loop: {
        center: 'ひとつの判断',
        s1: 'まず、言う', t1: '「ここの余白はわざと」',
        s2: 'ファイルが覚える', t2: 'record_precedent',
        s3: '別のAIが直しに来る', t3: '何も知らずに',
        s4: 'その一言が\n待ったをかける', t4: 'そして、引き下がる'
      }
    },
    changes: {
      eyebrow: 'WHAT IT DOES',
      title: '読む、編集する、チェックする、構築する。すべて会話で。',
      items: [
        { title: 'デザインを理解する', line: '構造、トークン、レイアウトをスクリーンショット付きで。推測ではなく、確認。', ask: 'この画面、どう組み立てられてる？', result: 'get_design_context · structure · tokens · 1 screenshot' },
        { title: '一括編集', line: 'リネーム、再バインド、余白の一斉調整。数千レイヤーを、一度の会話で。', ask: 'アイコンを全部アイコンパック変数につなぎ直して', result: 'batch_execute · 4,306 instances · one round-trip' },
        { title: 'チェック', line: 'レイヤー単位の確認も、重み付きの0〜100点も。任せる準備の採点や、消した変数を今も指す参照の数え上げまで。', ask: 'このページ、レビューに出せる状態？', result: 'analyze_design · token coverage 97.8% · WCAG contrast' },
        { title: 'デザインシステム', line: '変数、スタイル、バリアント、ライブラリ導入。描き直しではなく、手元のコンポーネントから。', ask: 'ブランド差分のパディングトークンを開いて配線して', result: 'create_variable · aliased ×3 brand modes · scoped · bound' }
      ]
    },
    craft: {
      eyebrow: 'CRAFT',
      title: '結果の質は、地味な作り込みで決まる。',
      body: 'AIをFigmaにつなぐこと自体は簡単です。Relaiの中身の大半は、出力を「それっぽい何か」で終わらせないための、目立たない作り込みです。ロジックに触れるリリースは、111項目の意地悪な検査が門番をしています。',
      items: [
        { kicker: 'pitfalls', tag: 'RAW ERROR + HINT', title:'落とし穴には、地図がある。', body: 'Plugin APIは落とし穴だらけです。Relaiには実際の運用で踏んだ54件が同梱されています。踏めば、生のエラーに解決策が添えられて返ってきます。同じ一覧は、AIがコードを書く前に読むチートシートにもなります。', artifact: '✗ cannot write to node with unloaded font\n  hint: await figma.loadFontAsync(node.fontName)\n        before editing text — new TextNodes\n        default to Inter Regular' },
        { kicker: 'verification', tag: 'RECEIPT', title:'書いたら、見て確かめる。', body: '書き込んだら、見て確かめます。スクリーンショット、意図との見比べ、結果の読み直し。「終わった」と「本当に終わった」の差は、ここで生まれます。', rows: ['set_properties · 24 nodes · 0.6s ✓', 'export_asset · 1 png ✓', 'verify_visual · match ✓'] },
        { kicker: 'conventions', tag: 'CARRIED BY THE FILE', title:'まず、手元のシステムから。', body: '構築の前に、AIはまずファイルを調べます。ファイル自身に保存されたルールも、そのままコンテキストに入ります。命名、トークンの通し方、立入禁止、下した判例。似た見た目の描き直しではなく、手元のコンポーネントから組み立てます。', artifact: '# conventions — carried by the file\n· colors route through Theme tokens, no raw hex\n· props camelCase · states hovered/pressed/…\n· never detach; reuse atoms from /components\n# memory — precedents, e.g.\n· "KARTE Badge border=1 is intent"' },
        { kicker: 'navigation', tag: 'TOOL RESULT', title:'結果には、次の一手がついてくる。', body: '33個のツールは、どれも要約・省略箇所の正直な注記・推奨される次の一手を添えて答えます。しかもAIは、下調べ済みで現場に来ます。11本のスキルがMCPプロンプトとして同梱され、自作スキルは`~/.figma-relai/skills`から読み込まれ、契約の全体は実行コードから再生成される`manifest`になっています。調子が悪ければ、`doctor`一発で診断です。', artifact: '{\n  "summary": "3 pages · 45 component sets",\n  "note": "components truncated (top 40)",\n  "recommended_next": "get_node_details\n    on the set you plan to extend"\n}' }
      ]
    },
    outlook: {
      eyebrow: 'NOW & NEXT',
      title: 'いまの姿と、この先。',
      p1: 'いまのRelaiは、読む・編集する・チェックする・構築するための道具ひとそろいと、ファイルが持ち歩く決めごとです。中身は、書いておく規約、下した判例、立ち入らせないページ。AIは働く前にそれを読み、決めたレベルで確認を取り（4段階から選ぶだけ）、すべてに記録を残します。',
      p2: 'この先は一本の線に沿って進みます。判断が、その場かぎりで消えないこと。繰り返している判断は、ひと声かければ、ファイルが守り、確かめてくれる規約に昇格できること。いつか、チーム間で共有できる、出どころ付きのレシピ集も。ロードマップに載せないもの。生成の速さ比べと、痕跡を残さず動くすべて。',
      p3: '日付つきの約束ではありません。実際の仕事で確かめながら進む、方向です。',
      philo: 'この考えの長い版も、書きました'
    },
    start: {
      eyebrow: 'GET STARTED',
      title: '3ステップ',
      body: '必要なのはFigma Desktop、Node.js 18+、MCPクライアントだけです。',
      steps: [
        { title: 'プラグインを導入', body: '最新リリースからzipをダウンロードして展開し、デスクトップアプリのPlugins → Development → Import plugin from manifestで読み込みます。自動で接続し、再起動後もルームを記憶します。' },
        { title: 'サーバーを登録', body: 'AIクライアントをRelaiに向けます。' },
        { title: '頼んでみる', body: 'ペアリングは自動です。ウィンドウ間でコピーするものはありません。' }
      ],
      download: 'プラグインをダウンロード',
      cursor: 'Cursorの場合は、以下を追加：'
    },
    faq: {
      eyebrow: 'FAQ',
      title: 'よくある質問',
      items: [
        { q: 'ファイルの内容はどこかに送られますか？', a: '新しい宛先はありません。リレーはローカルで動き、ファイルの内容はFigma、手元のマシン、そして普段から信頼しているAIクライアントの間にとどまります。' },
        { q: 'ファイルは何を記憶しますか？消せますか？', a: '0.3から、ファイルは判例（下した判断の記録）を持てます。記録されるのは、デザイナーかAIがはっきりと記録したときだけ。パネルのMEMORY行に全件が並び、いつでも削除できます。黙って記録されるものはありません。' },
        { q: 'キットはどこに保存されますか？', a: 'あなたのマシンの中だけです。キットはファイルの規約に名前を付けた複製で、プラグインがローカルに保存します。サーバーも同期もありません。マシンの引っ越しは書き出しと読み込みが一回ずつ。キットは一枚のMarkdownとして持ち運べます。' },
        { q: 'AIに触らせたくないページを守れますか？', a: 'はい。パネルでページ単位の立入禁止（NO-GO）を設定でき、対象ページへの書き込みは実行の手前で明確なエラーとして拒否されます。確認は4段階のダイヤル（OPEN · RISK · BULK · ALL）に統合されています。既定のRISKでは、破壊的操作（変数/スタイル削除・detach・flatten）だけが確認を求め、それ以外は止まりません。確認なしで進めたいときはOPENへ。' },
        { q: 'ウィンドウ間で何かをコピーする必要は？', a: 'ありません。ペアリングは自動です。`join_room`ツールは、同時に2つのFigmaファイルでプラグインを動かすまれなケース専用です。' },
        { q: 'AIにコードを実行させないことはできますか？', a: 'はい。`execute_figma`はFigma Plugin APIを直接扱う最後の手段で、任意コード実行であることをドキュメントにも明記しています。望まない場合は「Allow code execution」をオフにしてください。' },
        { q: 'デザインの利用状況はどう理解しますか？', a: '`get_design_system`がファイルと使用中ライブラリを棚卸しし、AIは既存のコンポーネントとトークンから構築します。トークンを渡せば、そのファイルがまだ一度も置いていないコンポーネントまで、ライブラリのカタログ全体が見えます。本物が公開済みなのに、引き伸ばした似せ物が隣で生き続けるのは、たいていこの差です。' },
        { q: 'Figmaのトークンは必要ですか？', a: '必要なのは2つだけです。コメントと、いま挙げたライブラリの全カタログ。`npx figma-relai login`が有効性を確かめ、あなたのマシンに0600で保存します。読むのはサーバープロセスだけで、リレーを渡ってプラグインに届くことはありません。パネルが示すのは、トークンがあるという事実だけです。ほかの機能は、トークンなしで動きます。' }
      ]
    },
    cta: {
      title: 'AIをキャンバスへ。',
      body: 'プラグインを導入し、サーバーを登録して、まずは小さなことを頼んでみてください。残りは、記録が教えてくれます。',
      install: 'プラグインを導入',
      star: 'GitHubでスター',
      philosophy: '哲学',
      tagline: 'あなたのAIを、キャンバスへ。'
    },
    philosophy: {
      label: 'PHILOSOPHY',
      title: 'Relaiの考えていること',
      back: 'Relai',
      updated: '2026年7月',
      sections: [
        { h: 'AIは、それぞれの職能とどこで出会ったか', ps: [
          'AIは開発者のもとへ、本当の仕事場の中にやってきました。コードベースを読み、コードベースを編集し、コードベースの中で正されます。モデルの手を借りるために、何かを外へ持ち出す必要はありません。デザイナーに届いたものの多くは違いました。仕事の横に開くチャット窓、それらしい複製を描くサンドボックス、誰も保守しない画面を出力する生成ツール。見た目はデザインでも、デザインが生きている場所には住んでいません。',
          'Relaiはこの距離を詰めるところから始まります。AIは実際のファイルの中で働きます。自分のコンポーネント、自分のトークン、自分のページ。本当の決定は、すでにそこにあるからです。'
        ] },
        { h: 'ペンは誰が持つか', ps: [
          'これだけ有能な道具は、主導権の問いを避けて通れません。私たちの答えは、単純な立場です。AIの時代、デザイナーの主導権はむしろ大きくなるべきです。判断と好みは人に残り、作業がモデルへ移ります。その逆にはしません。デフォルトの好みを持つモデルと、出力を承認するだけの人。そういう形には、決して。',
          '実際にはこういうことです。すでに選んだモデルが、自分で書いたルールのもとで、すべての手順を見えるかたちで動きます。特別な話ではありません。丁寧な協力者に仕事を頼むときの、当たり前の段取りです。'
        ] },
        { h: 'ファイルが決めごとを携える', ps: [
          '書き下せる好み。命名はこう、色はこのトークンを通す、detachはしない。そういう部分は、機械も守る規約になります。Relaiはそれをファイル自身に保存します。だから規約は仕事と一緒に旅をします。どのクライアントでも、ファイルを開いた誰にでも、そのまま継承されます。',
          '一件ずつしか現れない部分は、判例になります。「このズレは意図で、ドリフトではない」と一度言えば、その判断は記録され、同じ場所に触れる次の編集には、過去の判断が添付されます。繰り返される判断は、規約へ昇格させてかまいません。ファイルが持ち歩く規約は、代わりに自動で確かめてくれます。昇格のたびに、同意を待って。私たちはこれを、デザインファイルの判例法だと考えています。セッションが終わっても蒸発しない、積み重なる判断です。'
        ] },
        { h: '自分たちに課している二つのルール', ps: [
          'その場で届けること。誰も開かない文書の中の指針は、無いのと同じです。AIがその基準に出会うのは、仕事のただ中、書き込むその瞬間であるべきで、傍らのマニュアルの中ではありません。落とし穴も、規約も、判例も。Relaiの知っていることは、ツールの結果そのものに乗って届きます。',
          '見張る義務は減っていくべきで、調べる権利は減ってはなりません。信頼は、進捗バーを見つめさせることでは育ちません。記録を残すことで育ちます。何が走り、何が変わり、何が拒まれ、なぜか。確認はいつでも可能で、やがて、ほとんど不要になります。'
        ] },
        { h: '育てる道具', ps: [
          'Relaiは消費するものではなく、育てるものとして作られています。新しいファイルは、何も知りません。しばらく付き合ったファイルは、自分の規約と判例と囲いを身につけています。長く使った二人のユーザーは、二つの違う楽器を手にしているはずです。製品の正体はこのループで、ループには、あなたが必要です。書き下せない部分は、あなたがうなずくまで待つ。',
          '製品自体も、同じやり方で作られています。実際に運用しているデザインシステムを相手に、決定をひとつずつ、数字は加工しないまま。標本であって、統計ではありません。'
        ] },
        { h: '作らないもの', ps: [
          '生成の速さ比べはしません。「画面を作って」の床は、混み合いながら下がっていきます。天井にあるのは、総チェック、移行、ガバナンス、壊してはならないファイルへの外科的な仕事。そこが、慎重なAIの居場所です。記録を残さない動作は作りません。そして、声は共有しません。その仕事をその人のものにしている部分は、集計してよい機能ではありません。'
        ] }
      ],
      colophon: '製品と同じ作り方で書きました。ひとつの現役のファイルを相手に、セッションを重ねて。'
    },
    copy: { copy: 'Copy', copied: 'Copied' }
  },
  zh: {
    nav: { changes: '功能', start: '开始使用', faq: '常见问题', github: 'GitHub', install: '安装插件', home: 'Relai首页', menu: '打开菜单', close: '关闭菜单' },
    hero: {
      eyebrow: 'FIGMA × MCP',
      title: '让你的AI，\n来到画布上。',
      body: 'Relai把Claude Code、Cursor、Codex —— 任意MCP客户端 —— 接进Figma。用你熟悉的模型对话,读取、编辑、审计,直到搭建整套设计系统 —— 而文件会一路记下你的规矩、你拍过的板。',
      install: '安装插件',
      github: 'GitHub',
      anyClient: '任意MCP客户端'
    },
    belief: {
      eyebrow: 'THE IDEA',
      p1: 'AI进入了开发者真正干活的地方 —— 代码库;设计师拿到的,多半在画布之外:聊天窗、沙盒、生成完就没人维护的一次性稿。Relai的立场很简单:AI时代,设计师的主导权应该变大,而不是变小 —— 品味和判断留在你手里,劳动交给你本就信任的模型,在真实文件里进行。',
      p2: '界面越来越容易产出、也越来越短命;留下来的是底下那套系统:Token、规约、你已经做过的取舍。Relai把这当成正经工作 —— 你的标准写进文件本身,人和机器都能读;拍过的板都有记录,下一次会话从你的判断停下的地方继续,而不是从零开始。',
      p4: '可写的品味，写成机器也守的规矩；写不下的部分，永远等你点头。'
    },
    flows: {
      eyebrow: 'SCENES',
      title: '开口之后,会发生什么。',
      items: [
        { title: '留下评论,回来收回执', tag: 'COMMENTS · CANVAS', body: '审阅时随手钉@评论 —— 就在画布上,问题在哪就留在哪。之后一句话,让agent把队列过一遍:逐帖认领、修好、回帖、标记解决。异步,本来就是它的工作方式。',
          rows: ['comment › @relai这三个换成Button/Primary', 'comment › @relai这里的间距应该是space/300', '（之后）', 'you › 把评论都处理掉', 'manage_comments · 2 threads claimed', 'set_properties · fixed · replied ✓ resolved ✓'] },
        { title: '选区就是上下文', tag: 'SELECTION · CANVAS', body: '选中图层,说一句「这个也一样」。它看得见你选中了什么 —— 你指给它看,不用描述路径。',
          rows: ['you › （选中Card / Pricing）', 'you › 和刚才一样处理', 'get_selection_context · 1 node', 'set_properties · verified ✓'] },
        { title: '一场有判决的评审', tag: 'CHAT · QA GATE', body: '「这页能出了吗?」跑一遍QA闸门:规约、对比度、组件健康 —— 你说过「这里是故意的」的地方仍然豁免,不再翻案。收尾是一个判决。',
          rows: ['you › 这一页能送评审了吗?', 'qa-gate · skill loaded · full page', 'file › 1 flag waived — you ruled it intent', 'verdict: pass — two nits attached ✓'] },
        { title: '有的页面,就是碰不得', tag: 'CHAT · NO-GO', body: '在面板里把页面圈起来 —— 品牌母版、法务页、已经像素级完美的那一页。写入在碰到画布之前就被拒,回执写明原因。你设的规矩,模型没得商量。',
          rows: ['you › 把整个文件的frame名理一遍', 'edit_structure · rename · sweeping…', 'file › ✗ blocked — “Brand / Masters” is a no-go zone', 'other pages · proceed ✓'] }
      ]
    },
    law: {
      eyebrow: 'CASE LAW',
      title: '拍板一次，文件记一辈子。',
      body: '说一句「这个偏离是有意的，不是走样」，它就成了判例——记进文件本身，面板里随时可删。此后任何碰到它指的地方的编辑，无论来自哪个AI客户端，结果里都会附上这条判例。你的判断在累积；agent在动手的瞬间，被你自己的判例法纠正。',
      list: [
        { label: 'RULES', text: '你写下的规约 —— 命名、Token路径、结构。开工前先读。' },
        { label: 'MEMORY', text: '你定下的判例 —— 任何碰到它指的地方的编辑,结果里当场附上。' },
        { label: 'NO-GO', text: '你圈出的禁区页 —— 写入在碰到画布之前就被拒,原因写在回执里。' }
      ],
      inherit: '三样都由文件自己携带 —— 谁用哪个MCP客户端打开,都原样继承。存成kit,别的文件也用同一套规矩。',
      loop: {
        center: '一次拍板',
        s1: '你说一句', t1: '「这个留白是故意的」',
        s2: '文件记住', t2: 'record_precedent',
        s3: '另一个AI来“修”它', t3: '它什么都不知道',
        s4: '你那句话叫停了它', t4: '它退了回去'
      }
    },
    changes: {
      eyebrow: 'WHAT IT DOES',
      title: '读取、编辑、审计、构建 —— 通过对话完成。',
      items: [
        { title: '理解设计', line: '结构、Token、布局 —— 附截图,是看过,不是猜的。', ask: '这个界面是怎么搭起来的？', result: 'get_design_context · structure · tokens · 1 screenshot' },
        { title: '批量编辑', line: '改名、重绑、间距清扫 —— 数千个图层,一次对话。', ask: '把所有图标重新绑定到图标包变量', result: 'batch_execute · 4,306 instances · one round-trip' },
        { title: '设计审计', line: '逐层检查,或一个加权0–100分 —— 再算一算:文件准备好交给AI没有,哪些引用还指着已删的变量。', ask: '这一页能送评审了吗？', result: 'analyze_design · token coverage 97.8% · WCAG contrast' },
        { title: '设计系统', line: '变量、样式、变体、库导入 —— 从你的组件出发,不是照着画一个像的。', ask: '开一个分品牌的内边距Token并接好线', result: 'create_variable · aliased ×3 brand modes · scoped · bound' }
      ]
    },
    craft: {
      eyebrow: 'CRAFT',
      title: '结果更好，是有原因的。',
      body: '把AI接到Figma上并不难。Relai的大部分工作，是那些决定输出到底是生产级、还是"看着像回事的噪音"的朴素功夫 —— 111道故意找茬的检查,守在每次触及逻辑的发布之前。',
      items: [
        { kicker: 'pitfalls', tag: 'RAW ERROR + HINT', title:'雷区，已绘制成图。', body: 'Plugin API处处是坑。Relai内置了54条生产环境踩出来的 —— 一旦踩中,原始报错连同解法一起返回;同一份清单,就是AI写代码前要读的速查表。', artifact: '✗ cannot write to node with unloaded font\n  hint: await figma.loadFontAsync(node.fontName)\n        before editing text —— new TextNodes\n        default to Inter Regular' },
        { kicker: 'verification', tag: 'RECEIPT', title:'自己的活，自己验。', body: '写完就看:截图、对照意图、重读结果。"做完了"和"真的做完了"的差别,就在这里。', rows: ['set_properties · 24 nodes · 0.6s ✓', 'export_asset · 1 png ✓', 'verify_visual · match ✓'] },
        { kicker: 'conventions', tag: 'CARRIED BY THE FILE', title:'先学你的系统。', body: '动手之前,AI先盘点文件 —— 你存在文件里的规矩直接进入它的上下文:命名、Token路径、禁区、你的判例。它从你的组件出发构建,而不是照着画一个像的。', artifact: '# conventions —— carried by the file\n· colors route through Theme tokens, no raw hex\n· props camelCase · states hovered/pressed/…\n· never detach; reuse atoms from /components\n# memory — precedents, e.g.\n· "KARTE Badge border=1 is intent"' },
        { kicker: 'navigation', tag: 'TOOL RESULT', title:'给的是路标，不是迷宫。', body: '33个工具,每个都带着摘要、对截断之处的诚实标注、建议的下一步来回答。而且AI是备过课进场的 —— 11份skill作为MCP prompts内置,你自己写的从`~/.figma-relai/skills`装载,整套契约是随构建从运行代码重新生成的`manifest`;不对劲时,一条`doctor`命令端到端诊断。', artifact: '{\n  "summary": "3 pages · 45 component sets",\n  "note": "components truncated (top 40)",\n  "recommended_next": "get_node_details\n    on the set you plan to extend"\n}' }
      ]
    },
    outlook: {
      eyebrow: 'NOW & NEXT',
      title: '现在的样子，和接下来的路。',
      p1: '今天的Relai，是两样东西。一个入口：让你已经在用的AI，进到真实文件里读取、编辑、审计、构建。一套规矩：文件自己带着走的——你写下的规约、你定下的判例、你圈出的禁区。agent开工前先读它们，按你定的档位来问（四档，从OPEN到ALL），做过的每件事都留痕。',
      p2: '接下来沿一条线走：你的判断不该随会话消散。你发现自己一再重复的决定，应该点一下头，就能升格成文件替你守着、替你检查的规约。或许有一天，还有值得在团队之间共享的、带出处的手艺包。不在路线图上的：生成速度的竞赛，和一切不留痕迹的动作。',
      p3: '这些都不是带日期的承诺，是一个方向——在真实的工作里边验证边走。',
      philo: '想法的完整版,也写下来了'
    },
    start: {
      eyebrow: 'GET STARTED',
      title: '三步完成。',
      body: '你只需要Figma Desktop、Node.js 18+和一个MCP客户端。',
      steps: [
        { title: '安装插件', body: '从最新release下载zip解压，在桌面版通过Plugins → Development → Import plugin from manifest导入。它会自行连接，并在重启后记住所在房间。' },
        { title: '注册服务器', body: '将你的AI客户端指向Relai。' },
        { title: '开口提需求', body: '配对自动完成，不需要在窗口之间复制任何内容。' }
      ],
      download: '下载插件',
      cursor: '对于Cursor，将以下内容加入'
    },
    faq: {
      eyebrow: '常见问题',
      title: '常见问题，直接解答。',
      items: [
        { q: '我的文件内容会流向哪里？', a: '不会有新的去向。中继在本地运行，文件内容只在Figma、你的机器和你已经信任的AI客户端之间流动。' },
        { q: '文件会记住什么？能删吗？', a: '从0.3起，文件可以携带判例——你下过的判断，只在你或AI明确记录时才会写入。面板的MEMORY行列出全部条目，随时可删。没有任何东西会被悄悄记录。' },
        { q: 'kit存在哪里？', a: '只在你自己的机器上。kit是文件规矩的一份有名字的副本，由插件存在本地——没有服务器，没有同步。换机器就是导出、导入各一次：kit随身就是一份Markdown文件。' },
        { q: '能划出AI不准碰的页面吗？', a: '能——面板里按页设置「AI禁区」，写入禁区页会在碰到画布之前被明确拒绝。确认被统一成四档刻度盘（OPEN · RISK · BULK · ALL）：默认的RISK档只拦高危操作（删变量/样式、detach、flatten），其余照常放行；不想被问的时候，拨到OPEN。' },
        { q: '需要在窗口之间复制内容吗？', a: '不需要。配对自动完成。`join_room`工具只用于一种少见情况：两个Figma文件同时运行插件。' },
        { q: '可以阻止AI执行代码吗？', a: '可以。`execute_figma`是直接调用Figma Plugin API的应急出口 —— 文档明确说明这是任意代码执行。不希望的话，在插件中关闭「Allow code execution」即可。' },
        { q: '它如何了解我的设计？', a: '`get_design_system`会盘点文件及其使用的库，让AI基于已有组件和Token构建。有令牌时，看到的是整份库目录——包括你的文件从没放过的那些组件。真件早已发布，旁边却活着一个拉伸出来的仿件，差别通常就在这里。' },
        { q: '需要Figma令牌吗？', a: '只有两件事需要：评论，和上面说的完整库目录。`npx figma-relai login`先验证，再以0600存在你自己的机器上；只有服务器进程读它，绝不经中继到达插件——面板只说有没有，不说是什么。其余功能没有它照常工作。' }
      ]
    },
    cta: {
      title: '把你的AI带到画布上。',
      body: '安装插件、注册服务器,先让它做一件小事。剩下的,回执会告诉你。',
      install: '安装插件',
      star: '在GitHub点星',
      philosophy: '哲学',
      tagline: '让你的AI，来到画布上。'
    },
    philosophy: {
      label: 'PHILOSOPHY',
      title: 'Relai在想什么',
      back: 'Relai',
      updated: '2026年7月',
      sections: [
        { h: 'AI与两种手艺,在哪里相遇', ps: [
          'AI来到开发者身边时,是进到了真正干活的地方。它读代码库、改代码库、在代码库里被纠正 —— 不需要把任何东西搬出去,模型就能帮上忙。设计师拿到的多半是别的东西:工作旁边的聊天窗、画出一个复制品的沙盒、产出没人维护的界面的生成器。看起来像设计,却不住在设计生活的地方。',
          'Relai从缩短这段距离开始。agent在生产文件里干活 —— 你的组件、你的Token、你的页面 —— 因为真正的决定,本来就在那里。'
        ] },
        { h: '笔在谁手里', ps: [
          '能力到了这个程度的工具,绕不开主导权的问题。我们的回答是一个立场:AI时代,设计师的主导权应该变大,而不是变小。判断和品味留在人手里,劳动移交给模型。绝不倒过来 —— 一个自带默认品味的模型,配一个只负责点头的人。',
          '落到实处就是:你本就选定的模型,在你写下的规则之下,每一步都看得见地工作。这没什么玄的,就是你给一位靠谱协作者交代工作的样子。'
        ] },
        { h: '规矩跟着文件走', ps: [
          '品味里写得下来的部分 —— 命名这样起、颜色走这些Token、永不detach —— 变成机器也守的规约。Relai把它存进文件本身,让规矩跟着作品走:任何客户端、任何打开文件的人,原样继承。',
          '只能一案一案浮现的部分,变成判例。说一句「这个偏离是有意的,不是走样」,这个判断就被记录;下一次碰到同一处的编辑,会带着你过去的判断。一再重复的判断,就该升格成规约;文件携带的规约,可以替你自动检查 —— 每一次升格,都等你点头。我们把它当作设计文件的判例法:判断在累积,而不是随会话结束蒸发。'
        ] },
        { h: '我们给自己立的两条规矩', ps: [
          '在现场交付。躺在没人打开的文档里的指引,等于不存在;agent应该在工作现场、落笔的那一刻遇到你的标准,而不是在旁边的手册里。Relai知道的一切 —— 坑、规约、判例 —— 都随工具结果本身送达。',
          '看的义务应该递减,查的权利不能递减。信任不是靠盯进度条盯出来的,是靠留回执留出来的 —— 跑了什么、改了什么、拒了什么、为什么 —— 让核查永远可行,并且终于,大体不再必要。'
        ] },
        { h: '一件养出来的工具', ps: [
          'Relai是拿来养的,不是拿来消费的。新文件什么都不知道;用了一阵子的文件,携带着你的规约、你的判例、你的围栏。两位用了很久的用户,手里是两件不同的乐器。产品的本体是这个循环,而循环里需要你 —— 写不下的部分,永远等你点头。',
          '产品自己也是这么做出来的:对着一套生产中的设计系统,一个决定一个决定地做,数字不加修饰。样本,不是统计。'
        ] },
        { h: '不做的东西', ps: [
          '不打生成速度的仗:「给我出个界面」的地板越来越挤、越来越低;天花板 —— 审计、迁移、治理、对不容损坏的文件动的外科手术 —— 才是一个谨慎agent的立身之处。不做不留回执的动作。也不共享你的声音:让你的作品成为你的作品的那部分,不是可以拿去聚合的功能。'
        ] }
      ],
      colophon: '用和产品一样的做法写成 —— 对着一个生产文件,一场接一场。'
    },
    copy: { copy: 'Copy', copied: 'Copied' }
  }
} as const;

export function getCopy(language: Language) {
  return translations[language];
}
