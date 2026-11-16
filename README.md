# CUGACM OJ 前端仓库 (`cugacm-ui`)

中国地质大学（武汉）ACM-ICPC 协会 OJ（<https://cugacm.com>）的前端覆盖层：模板、文案、静态资源与本地开发环境。

---

<a id="toc"></a>

## 目录

- [一、快速开始](#s1)
- [二、目录结构](#s2)
- [三、前端改动](#s3)
- [四、提交与审 PR](#s4)
- [五、自研插件](#s5)
- [六、切分支](#s6)
- [七、排障](#s7)

---

<a id="s1"></a>

## 一、快速开始

```bash
git clone https://github.com/N0Ne-Zer0/cugacm-ui.git
cd cugacm-ui
git checkout -b feat/你的改动名

cd local-dev
docker compose up -d --build      # 首次约 3~5 分钟
```

- 访问 <http://localhost:8888>
- 就绪标志：日志出现 `Server listening at: 0.0.0.0:8888` 与 `Template init: .../ui-custom`
- 环境要求：任意支持 Docker Compose v2 的 Docker；内存 ≥ 2 GB、磁盘 ≥ 3 GB、`8888` 空闲；无需本机装 Node.js / MongoDB

### 演示账号（密码均为 `123456`）

| 账号 | 权限 |
|---|---|
| `admin` | 超级管理员 |
| `student` | 普通用户（验证普通视角） |
| `alice` / `bob` / `charlie` / `david` / `eve` | 普通用户，带不同 RP 与头衔 |

首次启动自动写入：站点名、Logo、域头像、首页布局，以及 15 题 / 3 比赛 / 3 作业 / 2 训练 / 4 讨论 / 5 博客 / 48 条评测记录。

### 常用命令（在 `local-dev/` 下）

```bash
docker compose up -d              # 启动
docker compose stop               # 停止（保留数据）
docker compose down               # 移除容器（保留数据）
docker compose restart hydro      # 重启 Hydro
docker compose ps                 # 容器状态
docker compose logs --tail=50 hydro
docker compose logs -f hydro
docker compose up -d --force-recreate hydro   # 切分支/改挂载后用，必须带 --force-recreate
docker compose up -d --build                  # 仅改 local-dev/dockerfile 时需要
docker compose down -v && docker compose up -d # 清库重灌演示数据
```

---

<a id="s2"></a>

## 二、目录结构

```text
cugacm-ui/
├── templates/           # Nunjucks 模板（改版主战场）
│   ├── *.html
│   ├── layout/          # 页面骨架
│   ├── partials/        # 公共片段、homepage/*
│   └── components/      # 服务端小组件
├── locales/             # 文案覆盖（可只写要改的键）
├── public/              # 静态资源（logo、favicon、custom.css）
├── local-dev/           # 本地环境（export-ignore，不上线）
│   ├── dockerfile / docker-compose.yml / config.json
│   ├── gen-addons.js    # 启动时按 addons/ 生成 addon.json
│   ├── seed-local.js    # 首次初始化演示数据
│   ├── entrypoint.sh
│   └── addons/          # 自研插件：blog-square / user-title / contest-cancel-attend
├── index.js             # ⚠️ 插件占位入口，禁止修改
└── package.json         # ⚠️ 插件元信息，禁止修改
```

| 内容 | 放哪 | 上线方式 |
|---|---|---|
| 页面外观（HTML/文案/样式） | `templates/`、`locales/`、`public/` | 合入 `main` 后随发布上线 |
| 插件逻辑与兜底模板 | `local-dev/addons/<插件>/` | 维护者审核后单独部署 |

同一页面两处都有模板时，`templates/` 优先（`ui-custom` 在插件清单最后）。

**允许改**：`templates/`、`locales/`、`public/`、文档。
**禁止改**：`index.js`、`package.json`。

---

<a id="s3"></a>

## 三、前端改动

### 页面 → 文件

| 位置 | 文件 |
|---|---|
| 首页 | `templates/main.html`、`partials/homepage/*` |
| 导航 / 页脚 | `partials/nav.html`、`partials/footer.html` |
| `<head>`、引入 CSS | `layout/html5.html` |
| 题库 / 题目 / 提交 | `problem_main.html`、`problem_detail.html`、`problem_submit.html` |
| 比赛 / 榜单 | `contest_main.html`、`contest_detail.html`、`contest_scoreboard.html` |
| 评测记录 | `record_main.html`、`record_detail.html` |
| 讨论 / 博客 | `discussion_*.html`、`blog_*.html` |
| 登录 / 注册 / 用户主页 | `user_login.html`、`user_register.html`、`user_detail.html` |
| 只对某域生效 | `<模板名>.<域名ID>.<扩展名>`，如 `main.A001.html` |

### 生效方式

| 改动 | 生效 |
|---|---|
| `templates/`、`locales/` | 刷新浏览器 |
| `public/` 已有文件 | `Ctrl + F5` 强刷 |
| `public/` 新增或删除文件 | `docker compose restart hydro` |

### `?v=` 缓存号

生产对 `public/` 有 1 天强缓存。**改了被引用的图标或 CSS 内容**时，把 `layout/html5.html` 里对应链接的 `?v=YYYYMMDD` 改成新日期（同一天多次改动可写 `?v=20261116-2`）；只改 `.html` 不用动。

当前：`custom.css?v=20261116-5`，图标 `?v=20261114`。

### 确认无 404

`F12` → Network → 勾选 Disable cache → 刷新，确认静态资源全为 `200`、Console 无红色报错。

常见原因：新增 `public/` 文件后没重启容器；路径大小写不符（Linux 严格区分，访问路径不带 `public/`）。

### 注意事项

1. 保留 Nunjucks 的 `{{ }}`、`{% %}` 逻辑与闭合。
2. 自定义样式写 `public/custom.css`，在 `layout/html5.html` 引入。
3. 不要动 `theme/*.styl`、`components/*.tsx`（需前端构建）。
4. 不要放与官方同名的 `public/app-*.js`。
5. `public/nav_logo_dark.png`、`public/stamp.png` 文件名被后台设置引用，替换时不要改名。

---

<a id="s4"></a>

## 四、提交与审 PR

```bash
cd ..                      # 回到仓库根目录
git status && git diff --stat
git add templates/ locales/ public/ README.md
git commit -m "feat: 说明"
git push -u origin feat/你的改动名
```

GitHub 上 **Compare & pull request → Create pull request**。合并后最多 2 分钟预览站生效。

清理：

```bash
git checkout main && git pull && git branch -d feat/你的改动名
```

提交前自检：未改 `index.js`/`package.json`；无 404；手机视图（F12）正常。

### 管理员审 PR

1. `Files changed` 检查：无 `index.js`/`package.json`、无可疑 `<script>`/外链、Nunjucks 标签完整。
2. 大改动拉到本地验收：
   ```bash
   git fetch -f origin pull/<PR编号>/head:review-pr
   git checkout review-pr
   ```
3. 合并：协作者的 PR 点 **Approve → Merge**；自己提的 PR 因不能自审，点 **Merge pull request ▼ → Bypass requirements**。
4. 预览站验收通过后，由维护者发布到生产。

---

<a id="s5"></a>

## 五、自研插件

官方插件用 `hydrooj install`；自研插件放目录即可，清单由 `local-dev/gen-addons.js` 启动时自动生成。

### 结构

```text
local-dev/addons/<插件名>/
├── package.json     # name / version / main / license
├── index.js         # module.exports = { name, apply(ctx) {} }
└── templates/       # 可选，兜底模板
```

现有实现：`blog-square`（路由 + 首页模块）、`user-title`（路由 + 管理页）、`contest-cancel-attend`（POST 路由）。

### 约束

1. 目录名、`package.json#name`、`module.exports.name` 一致，小写连字符。
2. 禁止 `child_process`、`eval`、越界读写磁盘、未说明的外连、陌生第三方 npm 包。
3. 优先 `ctx.Route` / `ctx.injectUI` / `ctx.i18n.load` / `UserModel` / `DocumentModel`；尽量不改核心 Handler 原型。
4. 中文文案用 `ctx.i18n.load('zh', {...})`。
5. 写库需可关闭、可重复执行。

### 本地接入

1. 插件放 `local-dev/addons/<插件名>/`。
2. ```bash
   cd local-dev
   docker compose up -d --force-recreate hydro
   docker compose logs --tail=30 hydro | grep -i "apply plugin"
   ```
   看到 `apply plugin /opt/local-addons/<插件名>/index.js` 即加载成功。

无需改 `addon.json`。清单顺序固定：官方基础 → 本地插件（按名排序）→ `ui-custom` → 官方 install 的插件。

### 上线

插件**不随页面外观一起上线**：合入 `main` 只会同步模板、文案和静态资源；插件要维护者审核后单独部署。

对提交者的两条要求：

1. 新增插件时把目录完整提交（`package.json` / `index.js` / `templates/`），在 PR 里说明它的用途和需要部署到哪个环境。
2. 模板引用了插件路由时，在 PR 描述里写明「需先部署插件，再发布模板」，否则按钮会 404。

服务器上的安装、注册、回滚属于运维范畴，由维护者按运维手册执行，不由本仓库承担。

---

<a id="s6"></a>

## 六、切分支

| 层 | 内容 | 随分支变化 |
|---|---|---|
| 镜像 | Hydro + 官方依赖 | ❌ 不用 `--build` |
| 挂载 | 模板、`local-dev/addons/`、`config.json`、`seed-local.js` | ✅ |
| MongoDB 卷 | 演示数据与设置 | ❌ |

```bash
git switch <分支>
cd local-dev
docker compose up -d --force-recreate hydro
```

`--force-recreate` 不能省（否则可能沿用旧挂载）。三点保证切换不坏：

1. 插件清单启动时按目录生成，分支没有插件就不注册；
2. 镜像不含仓库内容，不残留旧分支配置；
3. `templates/main.html` 对缺失的首页板块静默跳过。

数据库不随分支变。要干净环境：`docker compose down -v && docker compose up -d`；只换栏目则改后台 `hydrooj.homepage`。

---

<a id="s7"></a>

## 七、排障

| 现象 | 处理 |
|---|---|
| `open //./pipe/dockerDesktopLinuxEngine` | Docker Desktop 没启动 |
| 构建报 `failed to resolve source metadata ... dial tcp :443` | Docker Hub 网络问题：Settings → Resources → Proxies 填代理，或 Settings → Docker Engine 加 `"registry-mirrors": ["https://docker.m.daocloud.io","https://dockerproxy.com"]` |
| 首次构建 npm 慢 | 取消 `local-dev/dockerfile` 第 10～12 行 `npmmirror` 注释 |
| 端口 8888 被占用 | 改 `docker-compose.yml` 的 `"8888:8888"`，访问新端口 |
| 页面 500 | `docker compose logs --tail=50 hydro` 看 Nunjucks 报错行号 |
| 新插件不生效 | `docker compose up -d --force-recreate hydro` |
| 切分支后页面不对 | 同上，必须 `--force-recreate` |

本地与线上的差异：无 `hydrojudge`、`hydroac-client`、`edu-mail`、`cf-turnstile`、`problem-content-sync`，所以本地提交永远是 `WAITING`；数据库只有演示数据。
