
export const VERSION = 'v0.7.7';

export const translations = {
  en: {
    nav: { changes: 'What it does', start: 'Get started', faq: 'FAQ', github: 'GitHub', install: 'Install plugin', home: 'Relai home', menu: 'Open menu', close: 'Close menu' },
    hero: {
      eyebrow: 'FIGMA × ANY AGENT',
      title: 'Everyone gave agents the pen.\nRelai gave the file a veto.',
      body: 'Relai connects Claude Code, Cursor, Codex — any MCP client — to Figma. The file carries your conventions, your rulings, your fences; every client that opens it inherits them. Which is why you can finally let the agents run.',
      mono: 'open source · local · node-level read/write/delete',
      install: 'Install the plugin',
      github: 'GitHub',
      anyClient: 'any MCP client'
    },
    belief: {
      eyebrow: 'THE ARGUMENT',
      p1: 'Every design team is being offered the same trade right now: take the agents’ speed and watch the system rot one plausible edit at a time — or guard the system by hand and watch everyone else ship. The tools all promise speed. None of them make it safe to accept.',
      p2: 'Code already escaped this, and not by making models careful. The repo pushes back — lint that flags, checks that gate, protected branches that refuse — so a developer can hand an agent real work and go do something else. That is what an artifact that defends itself buys: not safety for its own sake. Delegation you can live with.',
      p3: 'Relai builds that pushback into the design file itself. Not a leash — a license: let any agent run at full speed, because the file holds your line.',
      p4: 'The writable part of taste becomes rules the machine keeps. The part that can’t be written always waits for your yes.'
    },
    flows: {
      eyebrow: 'SCENES',
      title: 'What asking looks like.',
      items: [
        { title: 'Some pages just say no', tag: 'CHAT · NO-GO', body: 'Fence a page off in the panel — brand masters, legal, the one that is already pixel-perfect. Any write into it is rejected before it touches the canvas, and the receipt says exactly why. Set by you; not negotiable by the model.',
          rows: ['you › tidy every frame name in the file', 'edit_structure · rename · sweeping…', 'file › ✗ blocked — “Brand / Masters” is a no-go zone', 'other pages · proceed ✓'] },
        { title: 'Leave comments, come back to receipts', tag: 'COMMENTS · CANVAS', body: 'Pin @-comments as you review — on the canvas, where the problem is. Later, one sentence sends the agent through the queue: each thread claimed, fixed, replied on, resolved. Asynchronous by design.',
          rows: ['comment › @relai these three — swap to Button/Primary', 'comment › @relai this gap should be space/300', '(later)', 'you › work through the comments', 'manage_comments · 2 threads claimed', 'set_properties · fixed · replied ✓ resolved ✓'] },
        { title: 'A review that ends in a verdict', tag: 'CHAT · QA GATE', body: '“Can this page go out?” runs the QA gate: rules, contrast, component health — and the spots you already called intentional stay waived. It ends with a verdict.',
          rows: ['you › can this page go to review?', 'qa-gate · skill loaded · full page', 'file › 1 flag waived — you ruled it intent', 'verdict: pass — two nits attached ✓'] },
        { title: 'Your selection is context', tag: 'SELECTION · CANVAS', body: 'Select a layer and say “this one too.” It sees what you selected — you point instead of describing paths.',
          rows: ['you › (selects Card / Pricing)', 'you › same treatment as the last one', 'get_selection_context · 1 node', 'set_properties · verified ✓'] }
      ]
    },
    grow: {
      eyebrow: 'THE LONG GAME',
      title: 'A fresh file knows nothing.\nYours won’t stay fresh.',
      p1: 'Every ruling you record is capital. On day one the file is blank law, and the agent behaves like anyone’s agent. A month in, it arrives already briefed. The same prompt that produces the average of everyone’s design in an empty file produces yours in yours.',
      p2: 'That loop is the actual product: judgment that accumulates instead of evaporating when the session ends. Two long-time users are not holding the same tool. They are holding two different instruments.'
    },
    law: {
      eyebrow: 'CASE LAW',
      title: 'Rule once.\nThe file remembers.',
      body: 'A ruling you make once is recorded in the file as a precedent, deletable any time in the panel. From then on, any edit that touches what it references gets the precedent attached, from any AI client. And none of it is prose the model might happen to read — the law runs as checks: fenced pages reject writes before they execute, edits come back verified. The agent is corrected by your own case law, in the moment.',
      list: [
        { label: 'RULES', text: 'Conventions you write — naming, token routing, structure. Read before any work, so your library gets used, not near-copied.' },
        { label: 'MEMORY', text: 'Precedents you rule — attached to any edit that touches what they reference. Case law, not documentation.' },
        { label: 'NO-GO', text: 'Pages you fence off — writes rejected before they run, with the reason on the receipt. Protected branches, for the canvas.' }
      ],
      inherit: 'All three travel with the file — any MCP client, anyone who opens it, inherits them. Save them as a kit, and every file on your machine can use the same law.',
      contract: {
        agentTag: 'THE AGENT · CHAT',
        fileTag: 'THE FILE · CARRIES',
        rows: ['you › swap these three to Button/Primary', 'set_properties · 3 nodes · 0.6s ✓', 'precedent attached — Badge border=1', 'verify_visual · match ✓'],
        file: [
          { b: 'Conventions.', t: 'Colors route through Theme tokens; never detach.' },
          { b: 'Precedent 14.', t: '“This deviation is intent, not drift.”' },
          { b: 'No-go.', t: 'Brand / Masters — writes refused.' }
        ],
        cite: 'carried by the file · inherited by any client',
        cap: '割印 — half on the agent, half on the file. Whole only when they align.'
      },
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
        { title: 'Understand a design', line: 'Structure, tokens, layout — and a screenshot, so it looks instead of guessing.', ask: 'How is this screen put together?', result: 'get_node_details · structure · tokens · 1 screenshot' },
        { title: 'Bulk edits', line: 'Renames, rebinds, spacing sweeps — thousands of layers, one conversation.', ask: 'Rebind every icon to the icon-pack variable', result: 'batch_execute · 4,306 instances · one round-trip' },
        { title: 'Audits', line: 'Layer-by-layer checks, or one weighted 0–100 score — plus agent-readiness, and a ghost census: references still pointing at deleted variables.', ask: 'Is this page ready for review?', result: 'analyze_design · token coverage 97.8% · WCAG contrast' },
        { title: 'Design systems', line: 'Variables, styles, variants, library imports — built from your components, not near-copies.', ask: 'Open a brand-specific padding token and wire it up', result: 'create_variable · aliased ×3 brand modes · scoped · bound' }
      ]
    },
    craft: {
      eyebrow: 'CRAFT',
      title: 'Why the results come out better.',
      body: 'Connecting an AI to Figma is the easy part. Most of Relai is the unglamorous work that decides whether the output is production-grade or plausible-looking noise — and one hundred and ninety-one tests written to break it gate every release that touches logic.',
      items: [
        { kicker: 'pitfalls', tag: 'RAW ERROR + HINT', title:'The minefield, mapped', body: 'The Plugin API is full of traps. Relai ships 57 of them, learned in production — trip one, and the raw error comes back with the fix attached; the same registry becomes the cheat sheet the AI reads before writing code.', artifact: '✗ cannot write to node with unloaded font\n  hint: await figma.loadFontAsync(node.fontName)\n        before editing text — new TextNodes\n        default to Inter Regular' },
        { kicker: 'verification', tag: 'RECEIPT', title:'It checks its own work', body: 'After a write, the AI looks: screenshot, compare against intent, re-read the result. The difference between “done” and “actually done”.', rows: ['set_properties · 24 nodes · 0.6s ✓', 'export_asset · 1 png ✓', 'verify_visual · match ✓'] },
        { kicker: 'conventions', tag: 'CARRIED BY THE FILE', title:'Your system comes first', body: 'Before building, the AI inventories the file — and the rules you store in the file itself ride into its context: naming, token routing, no-go zones, your precedents. It builds from your components, not near-copies.', artifact: '# conventions — carried by the file\n· colors route through Theme tokens, no raw hex\n· props camelCase · states hovered/pressed/…\n· never detach; reuse atoms from /components\n# memory — precedents, e.g.\n· "Badge border=1 is intent"' },
        { kicker: 'navigation', tag: 'TOOL RESULT', title:'A map, not a maze', body: 'Thirty-three tools, each answering with a summary, honest notes on what got truncated, and a recommended next step. The AI arrives briefed, too — eleven skills as MCP prompts, your own from `~/.figma-relai/skills`, the whole contract as a `manifest` regenerated from running code, and one `doctor` command that diagnoses the chain end to end.', artifact: '{\n  "summary": "3 pages · 45 component sets",\n  "note": "components truncated (top 40)",\n  "recommended_next": "get_node_details\n    on the set you plan to extend"\n}' }
      ]
    },
    outlook: {
      eyebrow: 'NOW & NEXT',
      title: 'Where this stands, and where it goes.',
      p1: 'All of it ships today — and the agent asks at the level you set: four stops on the dial, OPEN to ALL, with receipts for everything.',
      p2: 'What comes next follows the same line: a ruling you find yourself repeating should be easy to promote — with your consent — into a rule the file checks for you. Someday, craft packs worth sharing between teams, with provenance. Not on the roadmap: generation races, and anything that acts without leaving a trace.',
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
        { q: 'Where does this run — and where do my file contents go?', a: 'Everything runs on your machine: the relay is local, and file contents move only between Figma, your machine, and the AI client you already trust. The plugin does need to stay open — writes go through it, and that is exactly what keeps everything inside your own seat. Pairing is automatic; there is nothing to copy between windows. Treat Relai as a supervised instrument, not a headless API.' },
        { q: 'Can’t I just write my conventions in a markdown file for my agent?', a: 'You can, and it helps — until it doesn’t. A markdown file is advice: it lives with one person’s agent setup, costs context on every request, and a model under pressure will quietly pick one reading of a conflicting rule and move on. Relai’s law is mechanism, and it lives in the file: fenced pages reject writes before they execute, rulings attach at the exact moment an edit touches what they reference, and every client that opens the file inherits all of it — including the ones you never set up.' },
        { q: 'Who does the law actually bind — and whose is it on a shared file?', a: 'Enforcement lives in the plugin, on the file’s side of the wire: any client that connects through Relai is bound, including ones you never configured. An agent pointed at some other bridge is not — the law cannot guard a door it does not hold, which is why everything leaves receipts. And a file carries one law, in the open: the panel lists every rule, precedent, and fence, deletable in one click, in front of everyone. Formal roles come later, if the loop earns them.' },
        { q: 'What does the file remember — and can I delete it?', a: 'Since 0.3 a file can carry precedents: rulings you made, recorded only when you or the agent explicitly records one. The panel’s Memory row lists every entry; delete any of them there. Nothing is recorded silently. Save the whole law as a kit and it lives on your machine, nowhere else — a kit travels as a single markdown file, one export and one import.' },
        { q: 'Can I fence off pages the AI must never touch?', a: 'Yes — AI no-go zones, per page, in the panel. Writes into a guarded page are rejected before they run, with a clear error. And the confirmation dial has four stops — OPEN · RISK · BULK · ALL: at RISK (the default), only the dangerous operations ask — deleting variables or styles, detach, flatten — and everything else keeps moving. Dial to OPEN when you’d rather not be asked at all.' },
        { q: 'Can I stop the AI from running code?', a: 'Yes. `execute_figma` runs JavaScript against the Figma Plugin API as an escape hatch — it is arbitrary code execution, and the docs say so plainly. If you would rather the AI never ran code, turn it off with the plugin’s “Allow code execution” toggle.' },
        { q: 'How does it know what my design uses — and do I need a token?', a: '`get_design_system` inventories the file and the libraries it uses, so the AI builds from your existing components and tokens instead of redrawing near-copies. A Figma token is optional and unlocks two things: comments, and the library’s whole catalog — including components your file has never placed. `npx figma-relai login` verifies it and stores it at 0600 on your machine; only the server process reads it, and it never crosses the relay to the plugin — the panel says a token is there, never what it is. Everything else works without one.' }
      ]
    },
    cta: {
      title: 'Give the file a veto.',
      body: 'Install the plugin, register the server, and ask for something small. The receipts will tell you the rest.',
      install: 'Install the plugin',
      star: 'Star on GitHub',
      philosophy: 'Philosophy',
      tagline: 'The veto stays yours.'
    },
    philosophy: {
      label: 'PHILOSOPHY',
      title: 'The thinking behind Relai',
      back: 'Relai',
      updated: 'August 2026',
      sections: [
        { h: 'What moved, and what stayed', ps: [
          'The migration happened. AI reached the place where work ships — the codebase — and builders of every title followed it there, designers included. The terminal joined design’s toolchain; screens became cheap to produce and quick to replace. The honest reading, we think, is not that design left the file. It is that the file’s identity changed: less and less a picture of the software, more and more the system beneath it — the tokens, the components, the decisions already made — read now by every agent in every tool, and wrecked at machine speed when nothing guards it.',
          'Relai starts there. It does not argue anyone back onto the canvas. It connects the agent you already work in to the file that still holds the system — because that is where the decisions live, and the decisions are the part worth guarding.'
        ] },
        { h: 'Who holds the pen', ps: [
          'A tool this capable forces the question of charge. Our answer is a position: the AI era should put designers more in charge, not less. Taste and judgment stay with the person; the labor moves to the model. Never the reverse — a model with taste-by-default, and a person reduced to approving its output.',
          'In practice that means the model you already chose, under rules you wrote, with every step visible. Nothing about the arrangement is exotic; it is how you would brief a careful collaborator.'
        ] },
        { h: 'Files that carry law', ps: [
          'The part of taste that can be written down — name things this way, route color through these tokens, never detach — becomes rules the machine keeps. Relai stores them in the file itself, so they travel with the work: any client, anyone who opens the file, inherits them.',
          'The part that emerges case by case becomes precedent. Say “this deviation is intent, not drift” once, and the ruling is recorded; the next edit that touches the same ground gets your past judgment attached. A ruling you repeat is ready to become a rule, and a rule the file carries can be checked for you, automatically — each promotion waiting for your consent. We think of it as case law for a design file: judgment that accumulates instead of evaporating when the session ends.',
          'Written law alone is weak. A model under pressure will silently pick one reading of a conflicting rule and move on; a convention nobody enforces is a suggestion. So the law compiles into checks that run: a write into a fenced page is rejected before it executes, rules are validated against the actual file, edits come back verified. The prose is for you; the enforcement is for the machine.'
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
} as const;

export function getCopy() {
  return translations.en;
}
