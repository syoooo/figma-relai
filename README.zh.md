<img src="assets/relai-logo.svg" alt="Relai" height="36" />

[English](README.md) | [日本語](README.ja.md) | 中文

让任意 AI 智能体（Claude Code、Cursor 等）直接操作 Figma 的 MCP 桥——**30 个整合工具** + Plugin API 逃生门，覆盖设计的读取、创建、编辑与质量检查。

<img src="assets/plugin-ui.png" alt="Plugin UI" width="380" />


```
AI (Claude Code / Cursor)
  ↕ stdio
MCP Server            … 30 个工具、分析、验证
  (内嵌 relay)         … 端口 9055 的 WebSocket 房间中枢
  ↕ WebSocket
Figma Plugin          … 执行 Figma API 调用
  ↕ Plugin API
Figma                 … 读写设计数据
```

relay **内嵌在 MCP server 进程中**——没有需要常驻的独立进程。多个 MCP 客户端同时运行时（比如 Cursor 和 Claude Code 并开），第一个启动的托管 relay，其余自动连接过去。

---

## 能做什么

### 🔍 理解设计
"讲讲这个页面的结构"——AI 一次读取选中节点的结构、颜色、布局和 token 使用情况，还能用 `screenshot` 亲眼看到画布。

### 🎨 质量检查
`analyze_design` 审计颜色 token 覆盖率、auto-layout 质量、组件健康度或可访问性（对比度、触摸目标），并给出修复建议。

### ✏️ 批量编辑
"把所有按钮文案翻译成英文""改成暗色模式配色"——`set_text` 和 `set_properties` 一次往返改动大量节点，插件里有实时活动流和**停止按钮**。

### 🧱 设计系统
变量集合、模式、token 绑定、共享样式、团队库导入——`manage_variables` / `manage_styles` / `import_from_library`。

### ⚡ 其余一切
`execute_figma` 在插件沙箱内直接运行 Figma Plugin API 的 JavaScript——与 Figma 官方 MCP 相同的思路。可随时用插件的"允许代码执行"开关关闭。

---

## Relai 与 Figma 官方 MCP 服务器

两者从相反的方向接近同一块画布，可以很好地配合使用。

官方 MCP 服务器为"把设计变成代码"而生：它的设计上下文、Code Connect 集成和截图管线，是把完成稿交给开发者智能体的最佳方式。Relai 走的是另一个方向——帮设计师*制作和维护设计本身*：token 架构、带完整变体与绑定的组件库、审计、批量编辑、自由的 UI 创作，用你偏好的任何 AI 客户端与模型，在任何 Figma 方案上（写入走 Plugin API，不要求特定席位类型）。

设计哲学的差异体现在该体现的地方。对于重复性强的设计系统工作，Relai 更倾向声明式、带前置条件校验的工具，而不是每次操作都现场生成代码——同样的操作每次以同样的方式执行，失败时返回的是指引（"请先调用 set_layout_mode"）而非堆栈信息。长尾需求仍由 `execute_figma` 兜底，与官方 `use_figma` 精神一致。而且因为操作主体是设计师，插件让人始终在环：实时活动流、在场指示、停止按钮。

如果团队有席位，两个都用——官方服务器把设计读出去，Relai 把设计做出来。

## 快速开始

需要 [Node.js](https://nodejs.org/) 18+、[Figma Desktop](https://www.figma.com/downloads/)，以及一个 MCP 客户端（[Claude Code](https://claude.com/claude-code)、[Cursor](https://cursor.com/) 等）。

### 1. 安装 Figma 插件

[从 Figma Community 安装](https://www.figma.com/community/plugin/1662131506342078142)并运行。它会自动连接，并跨重启记住自己的房间。

### 2. 注册 MCP 服务器

```bash
# Claude Code
claude mcp add Relai -- npx -y figma-relai

# OpenAI Codex CLI
codex mcp add Relai -- npx -y figma-relai
```

Cursor 用户在 `.cursor/mcp.json` 中添加：

```json
{ "mcpServers": { "Relai": { "command": "npx", "args": ["-y", "figma-relai"] } } }
```

### 3. 直接对 AI 说话

就这样。MCP 服务器自行托管 relay、自动发现插件的房间并完成配对——没有需要复制的命令。`join_room` 仅用于多个 Figma 文件同时运行插件时的消歧。

## 从源码运行（贡献者）

```bash
git clone https://github.com/syoooo/figma-relai.git
cd figma-relai
bun setup
```

需要 [Bun](https://bun.sh/) v1.0+（bash 脚本，Windows 请使用 WSL）。一步完成依赖安装、全包构建、以及指向本地构建产物绝对路径的 MCP 配置写出。插件开发：**Plugins → Development → Import plugin from manifest…** → `packages/figma-plugin/manifest.json`。

---

## 30 个工具

| 分组 | 工具 |
|------|------|
| 上下文 | `get_document_overview` · `get_selection_context` · `get_node_details` · `search_nodes` · `get_design_tokens` · `screenshot` · `get_events` |
| 分析 | `analyze_design`（color / layout / components / accessibility / **overall** — 加权 0-100 健康评分）· `diff_nodes`（双节点比较或检查点保存/对比） |
| 验证 | `verify_changes` · `validate_design_rules` · `verify_visual` |
| 读取 | `get_node_data`（summary / tree / full / css / variables） |
| 创建与编辑 | `create_node` · `set_properties` · `set_text` · `edit_structure` |
| 组件 | `manage_components` |
| 设计系统 | `manage_variables` · `manage_styles` · `import_from_library` |
| 文档 | `manage_pages` · `navigate` |
| 资产 | `export_asset` · `add_image` |
| 标注 | `annotate` |
| 评论 | `manage_comments` — 列出 / 添加 / 回复 / 删除（需 `FIGMA_TOKEN`，见下） |
| 高级 | `batch_execute` · `execute_figma` · `join_room` |

每个工具都是自描述的，AI 能看到完整的参数文档。整合后的工具面把常驻上下文控制在 LLM 能可靠使用工具的范围内，插件侧执行的仍是带前置条件校验的细粒度命令。随包附带 6 份 skill 文档（token 策略、组件规约、审计工作流、`execute_figma` 用 Plugin API 速查表），以 MCP prompts 形式提供。

## 设计师体验

- **自动配对** — 插件用 `clientStorage` 记住房间；MCP 服务器也记住（`~/.figma-relai/state.json`），在重启、休眠或 relay 接管后自动重新加入。
- **在场指示** — 只有当智能体真的在房间里时，插件才显示 "AI connected ✓"，而不是仅仅 relay 连通。
- **活动流** — 每条命令的状态、耗时与错误文本；有节点目标的条目可点击定位到画布。
- **停止按钮** — 取消批量操作中排队的工作（正在执行的单条原子命令会跑完，这是 JavaScript 单线程的限制）。
- **设计师事件** — 选区/节点/页面变更通过下一次响应的 `designer_events`（或 `get_events`）送达 AI，无需轮询。
- **审计轨迹** — `get_events` 的 scope `agent` 返回本会话 AI 执行过的全部命令（含结果与耗时）；`diff_nodes` 的检查点能精确展示一个节点在编辑会话前后的变化。
- **中英日 UI** — 语言切换会被记住。

## 端口与安全

- relay 只绑定 **127.0.0.1:9055**。Figma 插件沙箱在 manifest 中只允许 `ws://localhost:9055–9057`——**其他端口不修改 `manifest.json` 就无法工作**，因此 UI 中有意不提供端口设置。
- 房间名包含加密随机后缀。威胁模型见 [SECURITY.md](SECURITY.md)。
- `execute_figma` 在插件沙箱中运行 AI 编写的代码。默认开启（活动流中可见），可用插件的"允许代码执行"开关关闭。
- 评论走 Figma REST API，需要个人访问令牌：在 figma.com → Settings → Security 生成后，在 MCP 配置中加入 `"env": { "FIGMA_TOKEN": "figd_..." }`。令牌只保存在你的配置文件里、只发往 `api.figma.com`；其余所有工具无需令牌即可使用。

## 高级用法：独立 relay

```bash
bun socket        # 单独在 9055 端口运行 relay（HOST/PORT 环境变量可覆盖）
node packages/mcp-server/dist/index.js --server=<host> --room=<room>
```

仅在 relay 需要部署到另一台机器时使用。日常场景内嵌 relay 已足够。

## 开发

```bash
bun install
bun run build     # shared → mcp-server → figma-plugin（自动注入 UI 工具列表）
bun test          # 单元测试（55 个）
```

手动 QA：[docs/smoke-checklist.md](docs/smoke-checklist.md)。日志只输出到 stderr（stdio 保留给 MCP）。

## 许可证

MIT — 见 [LICENSE](LICENSE)。欢迎贡献：[CONTRIBUTING.md](CONTRIBUTING.md)。
