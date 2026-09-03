# Lint 策略

> [English](lint-policy.md) | 简体中文

声明在 `src-tauri/Cargo.toml` 的 `[lints]` 表中:

| Lint                       | 级别  | 说明                                     |
| -------------------------- | ----- | ---------------------------------------- |
| `unsafe_code`              | allow | tauri 插件与 Win32/WinRT 互操作需要      |
| `missing_docs`             | allow | 桌面应用 crate,而非库                    |
| clippy `all`               | deny  |                                          |
| clippy `pedantic`          | deny  | 严格变体,有意选它而非 warn 基线          |
| clippy `nursery`           | warn  | 被 hook 的 `-D warnings` 升级为错误      |
| `needless_pass_by_value`   | allow | tauri command 签名按设计按值收 handle    |
| `cast_possible_truncation` | allow | 窗口几何与 WinRT 绑定依赖明确语义的 cast |
| `cast_possible_wrap`       | allow | 同上                                     |
| `cast_precision_loss`      | allow | 同上                                     |
| `cast_sign_loss`           | allow | 同上                                     |
| `too_many_lines`           | allow | 本地化托盘标签表刻意展开                 |
| `match_same_arms`          | allow | 本地化表与其回退行为不合并更可读         |
| `dbg_macro`                | deny  |                                          |
| `todo`                     | deny  |                                          |
| `unimplemented`            | deny  |                                          |
| `print_stdout`             | deny  | 日志走 `tauri-plugin-log`                |

pre-commit hook 额外传 `-D warnings`,上表所有 warning 级(包括 `nursery`)
在提交时都是硬错误。

## JS/TS 侧

- **eslint** —— flat config(js recommended + typescript-eslint + svelte
  recommended),以 `--max-warnings=0` 运行:零警告是硬门槛。
- **svelte-check** —— `--fail-on-warnings`:任何新 warning 都会让检查失败。
- **prettier** —— `printWidth: 120`、`singleQuote: true`、`tabWidth: 4`、
  `trailingComma: "es5"`,`*.svelte` 走 `prettier-plugin-svelte`;markdown、
  yaml、json 同样在检查范围内。

## 放行规则

**先修代码;放行是最后手段,且只允许代码级。**

- 永远不要靠改 `[lints]`、hook 或 CI 让错误"消失"。
- Rust:用 `#[expect(clippy::lint_name)]`(优先——lint 失效后会产生编译警告,
  防止过期放行)或 `#[allow(clippy::lint_name)]`,作用域限定单条语句或单个
  函数,并带一行原因注释。禁止模块级 `#![allow(...)]` 或 crate 级放宽。
- JS/TS:用小作用域的 `// eslint-disable-next-line <rule>`(或 svelte 编译器
  要求的 `<!-- svelte-ignore code -->`,ignore code 必须独占注释)并附原因;
  禁止整文件 disable。
- 只有两种正当场景:(1) 确实无法回避;(2) 上游问题(宏、生成代码、依赖自身的
  audit 噪音)。

其余所有检查门(machete、audit、deny、outdated、docs-sync 及以后新增的任何门)
适用同一纪律。完整规则见 [AGENTS.md](../AGENTS.md)。
