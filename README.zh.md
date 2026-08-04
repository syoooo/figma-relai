<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/syoooo/figma-relai/main/assets/relai-logo-cream.svg">
  <img src="https://raw.githubusercontent.com/syoooo/figma-relai/main/assets/relai-logo-ink.svg" alt="Relai" height="36">
</picture>

[English](README.md) | [日本語](README.ja.md) | 中文

[figma-relai.vercel.app](https://figma-relai.vercel.app)

**Your AI, on the canvas.** Relai把Claude Code、Cursor、Codex —— 任何MCP客户端 —— 接进Figma:对你常用的那个模型说话,就能读取、编辑、审计设计,直至搭建整套设计系统。而文件不是旁观者:它带着你的规约、你的判例、你圈出的禁区,谁打开它都原样继承;坏了规矩的编辑,在执行之前就被拒 —— 文件握着一份否决权。所以,才敢把真活交给agent。

Relai的立场很简单:AI时代,设计师的主导权应该变大,而不是变小。判断和品味留在你手里,活交给你已经信任的模型 —— 每一步都看得见。

<img src="https://raw.githubusercontent.com/syoooo/figma-relai/main/assets/plugin-ui.zh.png" alt="Relai插件:活动流、连接状态与停止按钮" width="380" />

## 一次会话长这样

> **你:**让CTA更醒目,圆角处理一下。
>
> **AI:** `set_properties · 3 nodes · 0.4s ✓` → `verify_visual · match ✓`
>
> **你:**把整个界面刷成深色模式。
>
> **AI:** `set_properties · 24 nodes · 1.2s ✓` → `analyze_design · overall → 92/100`
>
> **你:**Brand / Masters也照这样刷一遍。
>
> **File:** `✗ blocked — "Brand / Masters" is a no-go zone`

每条命令在执行时同步出现在插件里,带耗时和成败。点击记录可跳转到画布上对应的图层。改主意了就按**Stop** —— 剩下的批量任务立即取消。还有些命令根本不会执行:你圈出的禁区页,写入在碰到画布之前就被拒,原因写在回执里。

这个量级还能往上翻。作者天天用Relai维护一套生产设计系统,下面摘自其中一次会话 —— 2026年7月,数字不加修饰:

```text
audit_colors     45,509 nodes scanned · 3.9s
ghost census     30,251 stale references found
approval gate    designer approved · scope: full file
batch_execute    25,351 bindings rebound
re-census        30,251 → 936 · zero visual change
```

中间那道闸就是重点:设计师点的一次头,授权了25,351次重新绑定 —— 而整个过程里,每一道围栏都立着。

## 规矩跟着文件走

代码世界早就逃出了「速度换标准」这道题,靠的不是模型变乖,是repo会还手:lint报警、检查拦门、保护分支拒收 —— 所以开发者敢把真活交给agent,然后去干别的。Relai把这套还手装进设计文件本身。不是缰绳,是许可证。

那些本来每次都要贴进提示词的规则,现在住进Figma文件本身 —— 之后的任何会话,无论哪个MCP客户端、谁打开文件,都是备过课才开工。而真正吃劲的部分,不是模型碰巧会读的散文:法是会运行的检查。

**规约**是存在文件里的一份小CLAUDE.md:命名规则、Token路径、间距习惯。AI动手前先读它。和CLAUDE.md不同的是,它属于文件,不属于某一个人的agent配置 —— 任何客户端,配置没配置过,都原样继承。添加只要跟AI说一句(「新规约:颜色走Theme Token」);面板的RULES行列出存了什么。

**记忆**装着你的判例。拍板一次,文件记一辈子:说一句「这个留白是故意的」,判断就记进文件;之后任何碰到它指的地方的编辑,结果里都会附上你的原话:

```text
you        "this gap is on purpose — remember it"
file       record_precedent · saved ✓

(another session, a different AI, about to "fix" the gap)
file       precedent attached — "…is on purpose" · the edit backs off
```

面板的MEMORY行列出全部条目,随时可删。没有任何东西被悄悄记录。是判例集,不是文档。

**Kit。**一个设计师通常照看一个产品,名下的文件共用同一部法。把这个文件的规矩存成一个有名字的kit,其他文件就能用。Figma在分支合并时会丢掉文件携带的法;kit把它放回来 —— 点一下,或者打开那套kit的自动恢复,连点都不用。

**AI禁区**整页圈起来 —— 品牌母版、法务页、已经像素级完美的那一页。写入禁区页会在执行之前被拒,原因写在回执里;哪些页算禁区,只有你能改,模型没得商量。画布的保护分支。

**确认**统一成四档 —— OPEN · RISK · BULK · ALL。默认的RISK档只拦高危操作(删变量或样式、detach、flatten),其余照常放行。档位在面板里定,agent动不了。

法住在哪,管多远:它以插件数据的形式存在文件内部 —— 画布上不多一个图层,同事不用绕着什么走 —— 文件复制时它跟着走(分支合并会丢,kit放回来)。执法在插件里,也就是文件这一侧,而且分两档力度:禁区和Lock to selection是墙 —— 写入本身被拒;判例是你的原话,在编辑碰到它指的地方的那一瞬间到场 —— 作者现身,agent收手。凡是接进Relai的客户端都受约束,包括你从没配置过的;指向别的桥的agent不受 —— 守不到的门,谈不上把守,所以一切都留回执。

这些都不是要你咬牙做完的配置 —— 它是攒出来的。第一天,文件的法还是白纸,agent跟谁的agent都一样。一个月后,它是备过课进场的:同一句prompt,在空文件里产出所有人的平均值,在你的文件里,产出你的设计。两位老用户手里拿的,不是同一件工具。

## 开始使用

你需要[Figma Desktop](https://www.figma.com/downloads/)、[Node.js](https://nodejs.org/) 18+和一个MCP客户端。

**1. 安装插件。**从[最新release](https://github.com/syoooo/figma-relai/releases/latest)下载`relai-plugin.zip`解压,在桌面版打开**Plugins → Development → Import plugin from manifest…**,选择`manifest.json`。在你要编辑的文件里打开它,面板保持开着 —— 写入走它。它会自行连接,并在重启后记住所在房间;release里带了新插件时,重新导入新的zip即可。

**2. 注册服务器**,加进你的AI客户端:

```bash
claude mcp add Relai -- npx -y figma-relai      # Claude Code
codex mcp add Relai -- npx -y figma-relai       # Codex CLI
```

Cursor则把下面这段加进`.cursor/mcp.json`:

```json
{ "mcpServers": { "Relai": { "command": "npx", "args": ["-y", "figma-relai"] } } }
```

或者把配置交给你的agent —— 粘贴这段:

```text
帮我配置Relai:先在这个客户端注册MCP服务器(命令是`npx -y figma-relai`,
比如`claude mcp add Relai -- npx -y figma-relai`),
然后带我从 https://github.com/syoooo/figma-relai/releases/latest
导入Figma插件 —— Figma里的点击我自己来。
```

**3. 开口提需求。**配对自动完成,窗口之间没有任何要复制的。第一句可以问:「这个界面是怎么搭起来的？」

## 它擅长什么

理解设计。「这个界面是怎么搭起来的？」一次返回结构、颜色、布局和Token使用情况,AI还会截一张图,亲眼看画布 —— 是看过,不是猜的。

批量编辑。「把所有按钮文案换成英文」「这屏刷成深色模式」 —— 几十个图层一个来回搞定,不用点一下午。

审计。`analyze_design`审的是颜色Token覆盖、自动布局质量、组件健康度和无障碍性(WCAG对比度、触控目标、字号),也能合成一个加权0–100的健康分直接放进评审 —— 你说过「这里是故意的」的地方仍然豁免,不再翻案。另有三项盘点:文件准备好交给AI没有(附上最大的缺口)、这份文件惯用的圆角/间距/字号,以及幽灵普查:还有哪些引用仍指着已删的变量。

设计系统。带模式的变量集合、Token绑定、共享样式、规范的变体、团队库导入。`get_design_system`会盘点文件及其使用的库已有的家底(有令牌时,整份库目录都在内 —— 连文件从没放过的组件也算),让AI从你的组件出发构建,而不是照着画一个像的;`analyze_design`的tokens能找出与现有变量视觉一致的硬编码值,一条`tokenize`全部绑定。这些都是带前置条件检查的声明式操作:同样的请求每次行为一致,失败时告诉AI下一步该做什么(「先调set_layout_mode」),而不是甩一段堆栈。

其余的一切。`execute_figma`直接对Figma Plugin API执行JavaScript —— 与官方MCP同款的兜底思路 —— 但带着让正确写法成为最短写法的`relai.*`辅助库、一册生产环境踩出来的坑谱(踩中已知的坑,解法随原始报错一起返回),以及揪出静默错误的lint。不想让AI跑代码,就在插件里关掉「Allow code execution」。

## 主导权在你手里

插件是这份约定里设计师握着的那一半:AI每个动作都流经的实时活动流、只在agent真正配对时才亮的AI连接灯(不是服务器开着就亮),以及取消待办工作的Stop按钮。你的选区和翻页会作为事件流回AI,所以「这个也一样」不用重新解释。

**Lock to selection**把选区之外的编辑一律拒收 —— AI拿到的是明确报错,不是悄无声息地被吞掉。中继在本地运行:文件内容只在Figma、你的机器和你已经信任的AI客户端之间流动。界面支持English、日本語、中文。

真出了岔子 —— 一次刷坏了、一处「修」错了 —— 活动流帮你还原经过,Figma的版本历史负责恢复。没有魔法撤销,Relai也不假装有:`diff_nodes`的检查点告诉你到底改了什么,回去靠版本历史。而法本身错了的时候 —— 一条过时的判例,还守着你早已改主意的留白 —— 跟agent说一声照做,然后到面板的MEMORY行删掉那条。判例一下就删;法,始终归你修订。否决权,始终在你手里。

## 工作原理

```
AI (any MCP client)
  ↕ stdio
MCP server            33 tools · analysis · verification
  (embedded relay)    WebSocket room hub on 127.0.0.1:9055
  ↕ WebSocket
Figma plugin          executes Plugin API calls
```

中继内嵌在MCP服务器里,不需要额外保活一个进程。多个MCP客户端同时运行时,第一个承担中继,其余连过去;承担者退出后,幸存者接手。两侧都记得自己的房间,重启或休眠后自动重逢,全程无需复制粘贴。`join_room`工具只为一种少见情况存在:两个Figma文件同时运行插件。

上面那些回执都是真实耗时:规则检查在每次写入之前、在插件里跑,小编辑一秒内落地,45,509个节点的审计用了3.9秒。

端口由Figma的插件沙箱决定:manifest只放行`ws://localhost:9055–9057`,不改`manifest.json`就用不了别的端口。所以,界面里没有端口设置。

## 工具一览

| 分组 | 工具 |
|-------|-------|
| 上下文 | `get_document_overview` · `get_selection_context` · `get_node_details` · `search_nodes` · `get_design_tokens` · `screenshot` · `get_events` |
| 分析 | `analyze_design`(color / layout / components / accessibility / overall)· `diff_nodes`(对比,或检查点保存/对比) |
| 验证 | `verify_changes` · `validate_design_rules` · `verify_visual` |
| 读取 | `get_node_data`(summary / tree / full / css / variables) |
| 创建与编辑 | `create_node` · `set_properties` · `set_text` · `edit_structure` |
| 组件 | `manage_components` |
| 设计系统 | `get_design_system` · `manage_variables` · `manage_styles` · `import_from_library` · `manage_conventions` · `manage_rulesets` |
| 文档 | `manage_pages` · `navigate` |
| 资产 | `export_asset` · `add_image` |
| 注释 | `annotate` |
| 评论 | `manage_comments`(需要令牌,见下文) |
| 高级 | `batch_execute` · `execute_figma` · `join_room` |

每个工具都自带完整的参数说明,AI直接读得到。同一份契约也以文件形式存在:`npx figma-relai manifest`输出机器可读的JSON,覆盖每个工具的schema、插件命令和已知的坑 —— 随每次构建从运行代码生成(提交为`docs/manifest.json`),所以不会漂移;`npx figma-relai docs <tool>`渲染成人读版。包里还同捆11份skill文档,作为MCP prompts内置:Token策略、组件规约、审计工作流、QA闸门、`execute_figma`的Plugin API速查表、文件记忆与判例,以及设计系统优先构建、批量清理、评论驱动协作的操作配方。你自己写的skill也能装载:带name/description frontmatter的markdown放进`~/.figma-relai/skills/`,即注册为`user:` prompts。

## Relai与Figma官方MCP

Figma自家的AI成长得很快 —— 官方MCP服务器已能写画布,Figma Design Agent直接在编辑器里协作。两者都面向付费套餐的完整席位,用量按AI额度计费,模型由Figma指定。Relai站在这条线的另一侧,开源:你的模型、你的订阅、你的机器 —— 主导权握在设计师手里。写入走Relai的Figma插件而非付费REST API,所以任何套餐都能用,免费版也在内。有席位的话,两边可以愉快共存 —— 都开着就好。

## 可选:一个Figma令牌

有两样东西锁在Figma的REST API后面,得用个人访问令牌才开:评论,和整份库目录 —— 已经发布、但你的文件从没放过的组件。是哪个库,Relai自己会找出来,不用你贴URL。

到figma.com → Settings → Security → Personal access tokens生成(file content read scope;要用`manage_comments`就再勾上评论相关scope),交给它一次:

```bash
npx figma-relai login    # 验证、报出是哪个账号,存进 ~/.figma-relai/credentials.json(0600)
npx figma-relai logout   # 删除
```

令牌不会作为命令行参数出现 —— argv会进shell历史,也会出现在这台机器上的每一次`ps` —— 所以`login`只从隐藏输入或管道(`pbpaste | npx figma-relai login`)里取。MCP配置里的`FIGMA_TOKEN`依旧有效,而且优先,按项目覆盖仍然可行:

```json
{ "mcpServers": { "Relai": { "command": "npx", "args": ["-y", "figma-relai"],
  "env": { "FIGMA_TOKEN": "figd_..." } } } }
```

两条路径都一样:令牌只由MCP服务器进程读取,只发往`api.figma.com`,绝不经中继到达插件 —— 面板上的ACCESS TOKEN标记只说有没有,不说是什么。其余工具没有它照常工作。

有了它,「把评论里的反馈落实一下」才真正可行:读线程、做修改、回帖。它还带来一种安静的用法:在画布上留一条@评论当任务,回头让AI「去看看评论」 —— 它会认领线程、干完活、在帖子里交差。

## 疑难排查

先跑`npx figma-relai doctor` —— 一条命令查完Node、中继端口(有没有别的进程占着)、插件在不在、已存的房间,以及Figma令牌 —— 它从哪儿来、存下的那份文件权限够不够紧 —— 每一项都告诉你怎么修。

**插件显示NO SERVER。**端口9055–9057上没有MCP服务器在听,通常是AI客户端没启动或没注册Relai。面板上直接显示注册命令;插件会一直重试,服务器一出现就连上。

**RELAY亮LINK但AGENT是WAITING。**链路没问题 —— 只是这次会话里AI还没调用过Figma工具。随便问它一句文件的事。

**「多个Figma插件已连接」。**两个文件都在跑插件。告诉AI用你想控制的那个插件里显示的房间名`join_room`。

**第一次`npx`很慢。**只是首次下载包;之后启动就快了。

## 安全

中继只绑定`127.0.0.1`,除房间名(带加密随机后缀)外没有其他认证。`execute_figma`在Figma的插件沙箱里执行AI写的代码:默认开启、每次执行都在活动流里可见、设计师可关闭。脚本不是原子的 —— 失败脚本已执行的部分会保留。完整威胁模型见[SECURITY.md](SECURITY.md)。

## 参与开发

```bash
git clone https://github.com/syoooo/figma-relai.git
cd figma-relai
bun setup       # install, build, write local MCP configs
bun test
```

需要[Bun](https://bun.sh/) v1.0+(安装脚本是bash;Windows请用WSL)。插件通过**Plugins → Development → Import plugin from manifest…** → `packages/figma-plugin/manifest.json`加载。中继需要跑在另一台机器上的罕见场景,有独立版(`bun socket`)。更多见[CONTRIBUTING.md](CONTRIBUTING.md);手动QA见[docs/smoke-checklist.md](docs/smoke-checklist.md)。

项目状态:Relai每天都在一套生产设计系统上被作者亲手使用,release跟着这些真实工作走。MIT加本地优先,就是它的长寿保险 —— 不联网上报,仓库哪天安静了,一切照常运行。

## 许可证

MIT —— 见[LICENSE](LICENSE)。
