// 文件系统服务 — USER.md / MEMORY.md / SKILL 文件读写

const fs = require('fs')
const path = require('path')
const os = require('os')
const { getMimoDataDir } = require('./database.cjs')

function getSkillsDir() {
  return path.join(getMimoDataDir(), 'skills')
}

function readMemory(type) {
  const filename = type === 'user' ? 'USER.md' : 'MEMORY.md'
  const filepath = path.join(getMimoDataDir(), filename)
  try {
    return fs.readFileSync(filepath, 'utf-8')
  } catch {
    return null
  }
}

function writeMemory(type, content) {
  const dir = getMimoDataDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const filename = type === 'user' ? 'USER.md' : 'MEMORY.md'
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8')
}

function readSkills() {
  const skillsDir = getSkillsDir()
  if (!fs.existsSync(skillsDir)) return []
  const skills = []
  try {
    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
    for (const dir of dirs) {
      const skillFile = path.join(skillsDir, dir.name, 'SKILL.md')
      if (fs.existsSync(skillFile)) {
        const content = fs.readFileSync(skillFile, 'utf-8')
        // 解析 YAML frontmatter
        const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
        let name = dir.name
        let description = ''
        let triggers = []
        if (match) {
          const frontmatter = match[1]
          const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
          const descMatch = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m)
          const triggerMatch = frontmatter.match(/^triggers:\s*\n((?:\s+- .+\n?)+)/m)
          if (nameMatch) name = nameMatch[1].trim()
          if (descMatch) description = descMatch[1].trim()
          if (triggerMatch) {
            triggers = triggerMatch[1].split('\n')
              .map(l => l.replace(/^\s*-\s*/, '').trim())
              .filter(Boolean)
          }
        }
        skills.push({ name, description, triggers, content })
      }
    }
  } catch {}
  return skills
}

function readSkill(name) {
  const skillFile = path.join(getSkillsDir(), name, 'SKILL.md')
  try {
    return fs.readFileSync(skillFile, 'utf-8')
  } catch {
    return null
  }
}

function writeSkill(name, content) {
  const skillDir = path.join(getSkillsDir(), name)
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true })
  }
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8')
}

function deleteSkill(name) {
  const skillDir = path.join(getSkillsDir(), name)
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true })
  }
}

// 首次启动时创建默认文件
function bootstrapDefaultFiles() {
  const dir = getMimoDataDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // 创建默认 MiMo 工作流技能
  const skillDir = path.join(dir, 'skills', 'mimo-workflow')
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true })
    const skillContent = `---
name: MiMo Workflow
description: "三段式固定工作流：前置检查 + 结构化规划 + 5W1H 知识分层。零例外。"
triggers:
  - plan
  - analyze
  - execute
  - workflow
---

# MiMo 工作流程规则

适用于**所有任务，零例外**。

## 1. 前置检查管线

输出计划前，按顺序完成：

1. 获取当前真实时间
2. 运行 Q1→Q2→Q3 判断
3. 检查环境
4. 若 Q1 判定需联网，计划中包含搜索步骤
5. 输出结构化计划

### Q1→Q2→Q3：联网判断

**Q1: 这个信息会随时间变化吗？**
是 = 必须联网搜索（价格、天气、版本号……）
否 = 进入 Q2

**Q2: 这是主观分析或创作类任务吗？**
是 = 从训练数据直接回答
否 = 进入 Q3

**Q3: 100% 确信训练数据准确且不过时吗？**
100% 确信 = 直接回答
有一丝不确定 = 必须联网

## 2. 强制计划流程

执行任何任务前，先输出结构化计划：

1. **目标** — 最终结果 + 成功标准
2. **需要的信息** — 必要资源、账号、文件、限制
3. **执行步骤** — 按顺序，标注依赖
4. **可能用到的工具** — 每个工具的作用
5. **需确认的问题** — 安装、改配置、删文件、付费 API 须单列

等待用户明确确认后，才执行第一条工具调用。禁止自行裁量。

## 3. 知识分层（5W1H）

| 层级 | 文件 | 内容 | 5W1H |
|------|------|------|------|
| 用户画像 | USER.md | 身份、偏好 | Who |
| 记忆 | MEMORY.md | 环境、约束 | What/Where |
| 技能 | SKILL.md | 流程、规则 | When/Why/How |
`
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent, 'utf-8')
  }

  // 创建模板 USER.md
  const userFile = path.join(dir, 'USER.md')
  if (!fs.existsSync(userFile)) {
    const cpu = os.cpus()[0]?.model || 'unknown'
    fs.writeFileSync(userFile, `# 用户画像

用户使用中文交流。时区：CST / UTC+8。所有输出使用中文。
工具偏好：本地免费工具优先，避免付费在线 API。
工作风格：不确定时先查证不瞎猜；给明确推荐而非罗列。

## 强制规则
- **先计划后执行**：任何操作前必须输出结构化计划并等待确认
- **零自行裁量**：安装包、改配置、删文件、付费操作必须征得同意
- **联网判断**：不确定的信息必须联网搜索，不凭训练数据猜测

设备：${os.type()} ${os.release()}，${cpu}，${os.arch()}。
`, 'utf-8')
  }

  // 创建模板 MEMORY.md
  const memoryFile = path.join(dir, 'MEMORY.md')
  if (!fs.existsSync(memoryFile)) {
    const nodeVer = process.version
    fs.writeFileSync(memoryFile, `# 项目记忆

## 环境
- OS: ${os.type()} ${os.release()} ${os.arch()}
- Node: ${nodeVer}

## 强制工作流（零例外）

以下规则适用于**所有任务，不得跳过**。

### 1. 前置检查管线

执行任何任务前，必须按顺序完成：

1. 获取当前真实时间
2. 运行 Q1→Q2→Q3 联网判断
3. 检查运行环境（OS / Node / 依赖）
4. 若 Q1 判定需联网，计划中必须包含搜索步骤
5. 输出结构化计划，等待用户确认后执行

#### Q1→Q2→Q3：联网判断

| 问题 | 判断 |
|------|------|
| **Q1: 信息会随时间变化吗？** | 是 → 必须联网搜索（价格、版本、天气、API 文档等） |
| **Q2: 是主观分析或创作类任务吗？** | 是 → 从训练数据直接回答 |
| **Q3: 100% 确信训练数据准确且不过时吗？** | 确信 → 直接回答；有一丝不确定 → 必须联网 |

### 2. 强制计划流程

任何代码/文件操作前，先输出：

1. **目标** — 最终结果 + 成功标准
2. **需要的信息** — 资源、文件、账号、限制
3. **执行步骤** — 编号、标注依赖关系
4. **可能用到的工具/命令** — 每个的作用
5. **需确认的问题** — 安装包、改配置、删文件、付费 API 须单列

等待用户明确确认后执行。禁止自行裁量。

### 3. 知识分层（5W1H）

| 层级 | 文件 | 内容 | 维度 |
|------|------|------|------|
| 用户画像 | USER.md | 身份、偏好、风格 | Who |
| 项目记忆 | MEMORY.md | 环境、约束、规则 | What/Where |
| 技能规则 | SKILL.md | 流程、判断逻辑 | When/Why/How |

每次对话开始前读取这三层，结束时有新发现要更新。

## 关键事实
-

## 约束
- 所有输出使用中文
- 不确定时先查证，不编造
- 改配置/删文件/付费操作必须先确认
- 优先本地免费方案
`, 'utf-8')
  }
}

module.exports = { readMemory, writeMemory, readSkills, readSkill, writeSkill, deleteSkill, bootstrapDefaultFiles }
