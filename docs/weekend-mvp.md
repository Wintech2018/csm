# CSM 周末 MVP 规格

版本 1 · 2026-11-20 · 目标：2026-11-21 至 11-22 两天内完成并静态部署上线。

## 1. 这个 MVP 要回答什么

给一张 draw.io 架构图，能否自动得到一个**贴近原图、可追溯、把不确定和未使用内容标出来**的系统模型，并让用户在此基础上确认、拒绝、改名？

一句话旅程：打开网页 → 上传 `.drawio` 文件（或点「加载示例」）→ 看到重新渲染的嵌套架构图和三类标记 → 点任一元素看到它来自原图哪个图元 → 确认、拒绝、改名 → 刷新页面后一切还在，可导出、导入项目文件。

所有处理都在浏览器里完成，文件不离开用户电脑。页面上要写明这一点。

## 2. 范围

| 主题 | 本次做 | 不做 |
| --- | --- | --- |
| 输入 | 单个 `.drawio` / `.xml` 文件，含压缩和未压缩两种格式；多页时可选页，默认第一页 | 图片、PDF、`.drawio.svg/.png`、文字文档、多个文件 |
| 模型 | System、Containment、Relationship（端点只到 System） | Port、E2 端点、Realization、Delegation |
| 判断 | 纯规则，不调用 AI | LLM |
| 视图 | 只读画布；「原图布局」和「自动布局（ELK）」两种模式可切换；可拖动节点（只改视图） | 在图上新增、换父系统、改接连线，L0–L2 折叠 |
| 修改 | 侧边面板：确认、拒绝、改名、全部确认、关闭某个问题标记 | 合并重复项、撤销重做、在图上直接编辑 |
| 状态 | candidate、accepted、rejected | 其他状态维度 |
| 历史 | 追加式编辑日志，面板里按顺序列出 | Change-set 事务、Revision、并发控制 |
| 存储 | localStorage 自动保存；导出、导入 `.csm.json` | 后端、数据库、多项目管理 |
| 部署 | Vite 构建，GitHub Pages 静态部署 | 后端、认证、租户 |

## 3. 技术栈

- Vite + React + TypeScript（strict）
- `@xyflow/react`（React Flow v12）渲染画布
- `elkjs` 自动布局
- `pako` 解压压缩格式的 draw.io
- XML 解析用浏览器自带的 `DOMParser`；测试用 Vitest 的 `jsdom` 环境
- 测试：Vitest
- 不引入状态管理库，`useReducer` 足够

## 4. 代码结构

```
src/
  model/
    types.ts         模型类型
    edits.ts         applyEdit：唯一的修改入口，纯函数
    persist.ts       localStorage 与 .csm.json 导入导出
  import/
    drawio/
      decode.ts      读文件 → mxGraphModel（处理压缩）
      cells.ts       mxCell → 规范化 RawCell（标签清洗、绝对坐标）
    rules.ts         关键词表、别名表、Kind 判定
    map.ts           RawCell[] → Model（含 issues、unused）
  view/
    project.ts       Model → React Flow nodes/edges（原图布局）
    elk.ts           Model → ELK 图 → 布局结果
  ui/                React 组件
  strings.ts         所有界面文字（中文），集中放置
fixtures/gateway.drawio      测试输入（同时复制到 public/examples/）
tests/                       Vitest 测试
```

依赖方向：`ui → view → model`，`ui → import → model`。`model/` 和 `import/` 不得 import React。

## 5. 模型

```ts
type Status = 'candidate' | 'accepted' | 'rejected';
type Kind = 'communication' | 'power' | 'unknown';

interface SourceRef {
  cellId: string;      // draw.io 图元 id
  page: string;        // 页名
  rule: string;        // 产生该元素的规则，如 'shape→system'、'container→containment'、'geometry→containment'
  rawLabel: string;    // 清洗前的原始 value
}

interface System { id: string; name: string; status: Status; source: SourceRef; }
interface Containment { id: string; parentId: string; childId: string; status: Status; source: SourceRef; }
interface Relationship {
  id: string; sourceId: string; targetId: string;  // System id，保留原图方向
  kind: Kind; label: string; status: Status; source: SourceRef;
}

type IssueType = 'possible-duplicate' | 'unknown-kind' | 'ambiguous-placement';
interface Issue { id: string; type: IssueType; targets: string[]; note: string; dismissed: boolean; }

interface UnusedCell { cellId: string; label: string; reason: string; }

interface Model {
  schemaVersion: 1;
  source: { fileName: string; pageName: string; xml: string };  // 保留原文，导出后仍可追溯
  systems: System[]; containments: Containment[]; relationships: Relationship[];
  issues: Issue[]; unused: UnusedCell[];
  log: EditLogEntry[];
}
```

**ID 规则**：导入时由图元 id 派生，`sys:<cellId>`、`rel:<cellId>`、`cont:<childCellId>`、`iss:<n>`（按确定顺序编号）。这样同一文件导入两次结果完全相同。ID 不从名称计算，改名不改 ID。

视图布局（节点位置、当前布局模式）单独存放，不属于 Model。拖动节点只改视图布局。

## 6. 导入规则

### 6.1 读取

1. 根元素可能是 `<mxfile>` 或直接是 `<mxGraphModel>`。
2. `<diagram>` 下有 `<mxGraphModel>` 子元素就直接用；否则它的文本是压缩内容：base64 解码 → `pako.inflateRaw` → `decodeURIComponent` → 再解析 XML。
3. 多页时列出页名供选择，默认第一页。

### 6.2 规范化图元

- `id="0"` 的图元和 `parent="0"` 的图元是根和图层，不是内容，不计入任何清单。
- 标签清洗：`value` 可能是 HTML。把 `<br>`、`</div>`、`</p>` 换成换行，去掉其他标签，解码实体（含 `&nbsp;`），每行去首尾空白，去掉空行。`name` = 各行用空格连接；`firstLine` = 第一行。
- 绝对坐标：沿 `parent` 链把所有**顶点**祖先的 `x/y` 累加；图层偏移为 0。连线的 `mxGeometry` 不参与。
- `style` 含 `group` 的图元是透明分组：不是 System，也不进未使用清单；它的子图元的结构父亲视为分组自己的父亲。
- 结构父亲：沿 `parent` 向上，跳过透明分组，第一个**被判定为 System** 的顶点；遇到图层则为「无结构父亲」。

### 6.3 顶点 → System 或未使用

按顺序判断，命中即停：

| 条件 | 结果 | reason |
| --- | --- | --- |
| `style` 含 `edgeLabel`，或 `parent` 是一条连线 | 并入所属连线的标签，不单独计 | — |
| `style` 以 `text` 开头或含 `;text;` | 未使用 | 纯文本 |
| `name` 为空 | 未使用 | 无文字 |
| `firstLine` 匹配装饰关键词（不分大小写）：`legend`、`图例`、`title`、`标题`、`note`、`注释`、`备注` | 未使用 | 装饰（关键词） |
| `style` 含 `image` | 未使用 | 图片 |
| 其他 | System（candidate） | — |

### 6.4 层次

1. 有结构父亲：建 Containment，rule = `container→containment`。
2. 无结构父亲时按几何判断（只在 System 之间比较）：
   - 有别的 System 完全包住它：取面积最小的那个作父亲，rule = `geometry→containment`。
   - 否则，若它与某个**面积更大**的 System 部分重叠（相交面积 > 0 且互不包含）：不建 Containment，加一个 `ambiguous-placement` 问题。
   - 否则：顶层系统，不建 Containment。

### 6.5 连线 → Relationship 或未使用

- 连线的 `source`、`target` 都存在，且都指向 System：建 Relationship。如果端点指向被判为未使用的图元，或指向透明分组，按缺端处理。
- 缺任一端：未使用，reason = `只连了一端` 或 `端点不是系统`。
- 标签 = 连线自身 `value` 清洗后的文字，加上所有子 `edgeLabel` 的文字，用空格连接。
- Kind（标签转小写后匹配，先匹配 power）：
  - power：`vdd`、`vcc`、`vbat`、`vin`、`vout`、`vsys`、`power`、`pwr`、`供电`、`电源`，或正则 `\b\d+(\.\d+)?v\d*\b`（如 `3v3`、`5v`、`1.8v`）
  - communication：`spi`、`i2c`、`uart`、`sdio`、`usb`、`can`、`ethernet`、`eth`、`pcie`、`mipi`、`gpio`、`i2s`、`jtag`、`swd`、`mqtt`、`uplink`、`bluetooth`、`ble`、`data`、`数据`、`通信`
  - 都不匹配（含空标签）：unknown，并加一个 `unknown-kind` 问题
- 关键词表放在 `rules.ts`，按词边界匹配，避免 `can` 命中 `scanner` 这类误判。

### 6.6 可能重复

- **系统**：对每个 System 计算归一化名：转小写 → 去掉通用词 `module`、`unit`、`chip`、`ic`、`block`、`模块`、`单元` → 去掉非字母数字字符 → 查别名表映射到标准名。归一化名相同的两个 System 加一个 `possible-duplicate` 问题。
- 别名表（`rules.ts`，可扩充）：`wifi ← wlan, wi-fi, 80211`；`lte ← 4g, cellular, cat1, catm`；`mcu ← microcontroller, 主控`；`pmic ← powermanagementic`；`ble ← bluetooth`。
- **连线**：同一无序端点对之间有两条以上 Relationship，加一个 `possible-duplicate` 问题，targets 为这些连线。
- 不自动合并。

## 7. 视图

- **原图布局**（默认）：节点位置和大小直接取原图几何。React Flow 子节点用 `parentId`，位置 = 子节点绝对坐标 − 父节点绝对坐标。节点数组里父节点必须排在子节点前面。几何包含得来的父子关系（如 Battery）同样换算。
- **自动布局**：ELK，`elk.algorithm: layered`、`elk.hierarchyHandling: INCLUDE_CHILDREN`、`elk.direction: RIGHT`；容器 `elk.padding` 顶部留 40 给标题；叶子节点固定 180×50。每条边放在两端点最近公共祖先节点的 `edges` 里。ELK 输出的子节点坐标本身就相对父节点，可直接用。
- 外观：
  - candidate 虚线边框，accepted 实线边框，rejected 不显示
  - power 连线虚线，communication 实线，unknown 灰色
  - 问题徽标：可能重复「≈」、Kind 不明「?」、归属不明「!」，颜色区分；点击徽标在面板里定位到该问题
  - 连线显示标签
- 归属不明和顶层系统都画在最外层，不放进任何容器。
- 布局时间预算：ELK 卡住超过 2 小时就先只交付原图布局，把 ELK 记成后续任务。

## 8. 界面

左侧画布，右侧面板，四个标签：

1. **详情**：选中元素的名称（可改名）、状态、类型、Kind、来源（cellId、页名、规则、原始标签），确认、拒绝按钮。
2. **问题**：按类型分组列出 issues，每项可点击定位、可「关闭」（dismissed=true）。顶部显示三类计数。
3. **未使用**：列出 unused 的 cellId、文字、原因。
4. **历史**：编辑日志，按顺序。

顶部栏：上传文件、加载示例、选页（多页时）、布局模式切换、全部确认、导出、导入、清空。页面底部固定一句：「文件只在本机浏览器中处理，不会上传。」

## 9. 修改

`applyEdit(model, edit): { ok: true; model: Model } | { ok: false; reason: string }`，纯函数，不修改入参。成功时向 `log` 追加 `{ seq, at, edit, summary }`。UI 只能通过它修改 Model。

| edit | 效果 | 校验 |
| --- | --- | --- |
| `confirm { id }` | System / Relationship / Containment 置为 accepted；确认一个 System 不连带确认别的 | 目标存在且不是 rejected |
| `reject { id }` | 置为 rejected；拒绝 System 时连带拒绝其子树、相关 Containment 和所有挂在这些系统上的 Relationship，summary 里写明连带数量 | 目标存在 |
| `rename { id, name }` | 改 System 名，ID 不变；改名后重新计算可能重复问题 | name 去空白后非空 |
| `confirmAll {}` | 所有 candidate 置为 accepted | — |
| `dismissIssue { id }` | 问题标为 dismissed | 问题存在 |

UI 在拒绝有子系统的 System 前弹确认框，显示连带数量。

## 10. 存储

- 每次成功修改后写 localStorage（键 `csm:project`），视图布局另存一个键。
- 导出 `.csm.json` = `{ model, viewLayout }`；导入时校验 `schemaVersion`，不符则报错且不覆盖当前项目。
- 打开页面时若 localStorage 有项目就直接恢复。

## 11. 测试输入

`fixtures/gateway.drawio` 已写好，复制一份到 `public/examples/gateway.drawio` 供「加载示例」使用。图里的内容和期望结果如下。

**期望的 System（15 个）**

| 系统 | 父系统 | 来源规则 |
| --- | --- | --- |
| Gateway | 无（顶层） | — |
| Acquisition、Processing、Connectivity、Power Management | Gateway | container |
| Sensor IF、ADC | Acquisition | container |
| Main MCU | Processing | container |
| Wi-Fi、WLAN Module、LTE | Connectivity | container |
| PMIC | Power Management | container |
| Battery | Power Management | geometry（结构上挂在图层，画在容器内） |
| External Network | 无（顶层） | — |
| Debug Connector | 无，带归属不明问题 | — |

共 12 条 Containment。

**期望的 Relationship（6 条）**

| 图元 | 端点 | 标签 | Kind |
| --- | --- | --- | --- |
| e1 | ADC – Main MCU | SPI | communication |
| e2 | Main MCU – Wi-Fi | SDIO | communication |
| e3 | Main MCU – Wi-Fi | （空） | unknown |
| e4 | PMIC → Wi-Fi | VDD 3V3（来自子 edgeLabel） | power |
| e5 | PMIC → LTE | VBAT | power |
| e6 | Connectivity – External Network | Uplink | communication |

**期望的问题（4 个）**：`possible-duplicate` {Wi-Fi, WLAN Module}；`possible-duplicate` {e2, e3}；`unknown-kind` {e3}；`ambiguous-placement` {Debug Connector}。

**期望的未使用（3 个）**：`title`（纯文本）、`legend`（装饰（关键词））、`e7`（只连了一端）。`e4-label` 并入 e4，不在未使用清单里。

## 12. 验收

自动化测试（Vitest），全部基于 fixture：

| 编号 | 通过条件 |
| --- | --- |
| A1 | System、Containment、Relationship 与第 11 节的表完全一致（按名称和端点名比较） |
| A2 | 每个模型元素的 `source.cellId` 都存在于原文件 |
| A3 | 问题和未使用清单与第 11 节完全一致 |
| T1 | 覆盖检查：除根和图层外，每个图元要么生成了模型元素，要么并入了连线标签，要么在未使用清单里；三者互斥 |
| U1 | 同一文件导入两次，两个 Model 深度相等（忽略 log 时间戳） |
| U2 | 改名后 ID 不变；归一化名不再相同时，对应的可能重复问题消失 |
| M1 | 拒绝 Connectivity：Connectivity、Wi-Fi、WLAN Module、LTE 及挂在它们上的 e2–e6 都变为 rejected，log 只多一条 |
| M2 | 非法修改（空名称、不存在的 id）返回 `ok: false`，Model 不变 |
| M3 | 每次成功修改 log 恰好多一条，seq 递增 |
| C1 | 导出再导入，Model 与视图布局深度相等 |
| D1 | 压缩格式：用 `pako.deflateRaw` 把 fixture 压缩成第二种格式，导入结果与未压缩版相等 |

手工检查（上线前逐条过）：

- [ ] 线上地址可打开，「加载示例」得到上面的模型，三类徽标都能看到
- [ ] 点任一节点或连线，详情里能看到 cellId 和原始标签
- [ ] 两种布局模式都能显示嵌套和跨容器连线，无节点重叠
- [ ] 确认、拒绝、改名后画布立即更新；刷新页面后保留
- [ ] 拖动节点后刷新，位置保留，log 没有新增
- [ ] 用一张自己的真实 draw.io 图导入：不崩溃；认不出的内容出现在未使用清单里，而不是报错

## 13. 部署

- `vite.config.ts` 设 `base: './'`，适配 GitHub Pages 的子路径。
- `.github/workflows/deploy.yml`：push 到 `main` 时运行 `npm ci && npm test && npm run build`，用 `actions/upload-pages-artifact` 和 `actions/deploy-pages` 发布 `dist/`。
- 仓库 Settings → Pages → Source 选 GitHub Actions。免费账户的私有仓库不能用 Pages；如需私有，改用 Cloudflare Pages 或 Netlify，构建命令相同。
- **第一步就把空壳部署上线**，部署问题在周六上午解决，不留到最后。

## 14. 建议顺序

| 时段 | 内容 | 完成标志 |
| --- | --- | --- |
| 周六上午 | 脚手架、部署流水线、空页面上线；decode + cells + map，A1–A3、T1、U1、D1 通过 | 线上地址可打开；`npm test` 绿 |
| 周六下午 | 原图布局渲染、徽标、选中与详情面板 | 示例图在线上正确显示 |
| 周日上午 | applyEdit 与 M1–M3、U2；问题、未使用、历史面板；localStorage 与导入导出（C1） | 修改后刷新不丢 |
| 周日下午 | ELK 自动布局；用真实图试；修 bug；手工检查清单 | 清单全部勾上 |

时间不够时按这个顺序砍：ELK 自动布局 → 多页选择 → 历史面板。导入规则、来源追溯、三类标记、保存不能砍，它们就是这个 MVP 要验证的东西。
