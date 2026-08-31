# AGENTS.md — 仓库守则

本文件面向在本仓库工作的 AI 编码代理(同样约束人类协作者)。开始任何修改前先通读一遍;恢复中断的会话时,视为重新进入仓库,第 1 节的自检必须重做。若本文件与代码实际情况冲突,以代码为准,并按第 3 节同步修正文档。

## 1. 进入仓库:例行自检(每次必做)

每次进入仓库、动手修改之前,先确认以下三件事:

1. **pre-commit 是否启用** —— `git config core.hooksPath` 必须输出 `githooks`;若为空,执行(推荐直接跑 `just setup`,会同时安装缺失的外部工具):

   ```bash
   git config core.hooksPath githooks
   ```

2. **pre-commit 所需依赖是否安装** —— 四个外部工具必须都在 PATH 里:

   ```bash
   command -v cargo-machete cargo-audit cargo-outdated cargo-deny
   ```

   缺哪个装哪个(建议 `--locked`):

   ```bash
   cargo install cargo-machete cargo-audit cargo-outdated cargo-deny --locked
   ```

   注意:`cargo fmt`、`cargo clippy` 由 `rust-toolchain.toml` 的 components 声明保证,rustup 会随工具链自动装好,无需手动处理。

3. **工具链** —— `rust-toolchain.toml` 声明 `channel = "stable"`,rustup 会自动解析最新 stable;不要手动写死版本号,也不要绕过该文件。

拿不准环境是否健康时,直接完整跑一次 `githooks/pre-commit` 作为冒烟测试(首次会拉取 RustSec 数据库,稍慢属正常)。

## 2. Lint 错误:放行纪律

原则:**修代码优先;放行是最后手段,且只能代码级局部放行。**

- 禁止通过改动 `Cargo.toml` 的 `[lints]`、`githooks/pre-commit` 或任何检查命令来"让错误消失"。
- 确需放行时,只允许**代码级别的局部放松**:
  - 优先用 `#[expect(clippy::lint_name)]`(该 lint 将来不再触发时会产生编译警告,避免遗留失效的 allow),其次 `#[allow(clippy::lint_name)]`;
  - 作用域最小化:单条语句或单个函数级;禁止函数组、模块级 `#![allow(...)]` 或 crate 级放松;
  - 必须在放松点附一行注释,写明原因(以及关联的 issue/链接,如有)。
- 仅有的两类合法放行情景:
  1. **迫不得已** —— 业务上必须这样写,且没有同等合理的替代方案;
  2. **上游依赖问题** —— 误报、宏/派生代码触发、依赖自身的审计噪音(例如 RustSec 对 unmaintained crate 的提示)。
- 其他审计或额外检查(machete、audit、outdated、docs-sync 以及未来新增的任何检查)与 lint **同一纪律**:能修则修;实在无法修复,才按上述方式局部放行并注明原因。任何情况下不得删除、注释掉或绕过检查本身。
- 检查链分两层:**快门**(`githooks/pre-commit`:fmt / machete / docs / clippy)在提交前运行,**重门**(`githooks/pre-push`:audit / deny / outdated / test)在推送前运行;CI 经 `just check` 执行整条链。三层都是"检查本身",同样受本条纪律约束。

## 3. 提交前:文档与代码对齐(每次 commit 必查)

- 每次 commit 前检查仓库内文档是否与实际代码一致,重点包括:
  - docs/lint-policy.md / docs/lint-policy.zh.md 的 lint 表格 ↔ `Cargo.toml` 的 `[lints]`;
  - docs/checks.md / docs/checks.zh.md 的检查链表格 ↔ 双 hook(`githooks/pre-commit` 与 `pre-push`)的实际命令;
  - README.md / README.zh.md 作为入口页:快速开始命令、文档索引链接、特性描述是否仍然属实;
  - 工具链描述 ↔ `rust-toolchain.toml`;目录结构 ↔ `docs/structure(.zh).md`;命令示例、版本号;
  - 源码 doc comment(`//!` / `///`)与实际行为。
- 文档一律双语成对(`*.md` + `*.zh.md`),必须同步修改,不允许只改一种语言。
- 修改 lint 配置或检查链时,**同一个 commit** 内必须同步更新对应 docs 页、两份 README 与本文件。
- 其中可机械化验证的部分已实现为 `githooks/check-docs`,并已接入 pre-commit 检查链;它只覆盖可 grep 的不变量(双 hook 的命令 ↔ docs/checks、lint 名 ↔ docs/lint-policy、edition、channel、just 配方、README 文档索引、CI 入口等)。**语义层面的对齐**(描述是否过时、示例能否运行、文档口吻是否一致)机器管不了,仍需代理或人工逐条确认。

## 4. 一句话总结

> 进仓库先自检环境;检查过不去就修代码,实在修不过去才局部放行、留名留因;改了代码就同步改文档,commit 之前必须确认两份 README 还说的是真话。
