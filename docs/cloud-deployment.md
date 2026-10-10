# 云端配置与部署

两台电脑使用同一个网址、同一个账号，共享待办、习惯、收支、自习记录和字典配置。番茄钟在各个浏览器独立运行，同一浏览器的多个标签页共享计时；完成记录上传云端。亮暗外观及天气偏好仍留在当前浏览器。

开发阶段从全新云端数据开始，无需保存或导入旧数据。首次登录会初始化预设分类和科目，业务记录为空；两台电脑登录同一账号后即可开始使用。

## 1. 配置 Supabase

创建一个专用于工作台的空项目。数据库建在该项目中，无需额外编写常驻服务器。

安装 [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)，登录并应用仓库中的迁移：

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

也可在新项目的 SQL Editor 中完整运行 `supabase/migrations/202610100001_workbench.sql`，两种方式选一种。迁移建立六类业务表、版本表、权限、事务 RPC、计时提交凭证和 Realtime 发布配置。不要只创建数据表而漏掉函数或权限。

在托管项目的 Authentication 配置中关闭 **Allow new users to sign up** 和匿名登录。在 Users 中通过管理员入口创建自己的邮箱密码账号，并确认邮箱。项目的 Site URL 填上线后的网址。忘记密码时由管理员重置；界面不提供注册或邮件找回。`supabase/config.toml` 的认证配置只用于本地开发，数据库迁移不会替你更改托管项目的认证设置。[认证配置参考](https://supabase.com/docs/guides/local-development/cli/config)

复制 `.env.example` 为 `.env.local`，填入项目连接信息：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

publishable key（或旧版 anon key）是浏览器可以使用的公开密钥；数据权限由登录令牌、数据库 RLS 和 RPC 验证。数据库密码、secret key、service_role key 都不能填入前端变量或提交 Git。[官方 React 接入说明](https://supabase.com/docs/guides/auth/quickstarts/react)

两个变量都没有配置时使用本机开发模式；只配置一个时显示配置错误。配置后运行 `npm run dev`，应出现登录页面。本机开发数据不会自动上传到云端。

## 2. 部署 Cloudflare Pages

在 Workers & Pages 中选择“创建应用 → Pages → 导入现有 Git 仓库”，连接代码仓库，填写：

| 项目       | 值                                                   |
| ---------- | ---------------------------------------------------- |
| 根目录     | 留空，使用仓库根目录（`package.json` 所在目录）      |
| 构建命令   | `npm run build:cloud`                                |
| 输出目录   | `dist`                                               |
| Node 版本  | `NODE_VERSION=24`                                    |
| 客户端配置 | `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` |

在生产环境配置两个客户端变量；如果使用预览部署，也为预览环境配置。环境变量在构建时写入前端，修改后需要重新部署。云端构建会拒绝缺少配置或误用管理密钥。Hash 路由不需要服务端路径回退。[Cloudflare React 部署参考](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)

如果出现 `Failed: root directory not found`，检查是否误将 `dist` 填进“根目录”。`dist` 是构建后生成的输出目录，根目录应指向源码中的 `package.json`。如果界面要求填写“部署命令”，并默认显示 `npx wrangler deploy`，则当前进入的是 Workers 构建流程；按本指南使用 Pages 时应返回创建应用并选择 Pages。[目录配置说明](https://developers.cloudflare.com/pages/configuration/build-configuration/)、[Workers 构建说明](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

两台电脑打开部署后的同一个 HTTPS 网址，登录同一账号即可共享数据，无需导入旧 JSON。

## 同步、断网与恢复

- 保存以数据库成功回应为准。另一台通过版本通知重新获取一致快照；恢复网络、重新激活页面时补查，每 30 秒也会补查一次。
- 同时修改时，旧版本保存会被拒绝；列表更新，表单输入保留，检查后再次保存。首版采用账号整体版本号，不自动合并并发修改。
- 离线或同步失败时业务只读，不能开始新阶段。已经运行的计时继续；到期后将完成记录与阶段切换一起写入本机，联网后自动补交，保留原截止日期。
- 服务端以账号、计时重置标记和 `sessionId` 保存提交凭证，重复请求不重复记时；已删除的完成记录也不会因网络重试被重新创建。
- 点击“重试同步”可立即补查。若保存回应丢失，先确认最新列表再重试；断网不会把未确认的普通业务修改放入上传队列。
- 退出只结束当前浏览器的登录，清空当前展示并关闭订阅；账号缓存与计时仍按账号、项目隔离留在本机，重新登录可恢复。共享电脑使用后可清理浏览器数据；清理前先导出备份并确认待提交计时数量为零。
- 导出的业务备份不包含计时和待提交队列。缓存损坏时可在设置导出原始缓存；重新拉取云端之前会保留损坏的原始文本用于恢复。不要把原始缓存文件当作普通业务备份直接导入。
- 之后需要备份或恢复时，使用设置中的 JSON 导入导出。导入会**替换该账号云端全部业务与字典数据，并重置所有设备的计时和待提交完成记录**；替换前建议导出当前云端备份。

## 测试

```sh
npm run check
npm run test:e2e
```

日常检查包括云端仓储模拟测试及使用真实 PostgreSQL 引擎 PGlite 执行迁移的测试，覆盖权限、约束、事务回滚、版本冲突和幂等完成。PGlite 测试中的 `auth.uid()` 是受控测试实现，不代替 Supabase 登录与 Realtime 测试。单元测试隔离真实项目配置；`test:e2e` 自动构建本机测试模式，已有备份测试不会写入你配置的云端项目。

真实 Supabase 集成需要本地 Docker 和 Supabase CLI：

```sh
supabase start
npm run configure:cloud-test
npm run build:cloud-test
npx playwright install chromium
npm run test:cloud
supabase stop
```

`configure:cloud-test` 仅从本地 Supabase 生成被 Git 忽略的 `.env.cloud-test.local`，不打印凭据。测试专用管理密钥仅在 Node 测试进程创建和清理随机测试账号，不会被 Vite 打包到前端。集成测试覆盖真实认证、RLS、并发 RPC、Realtime、两个独立浏览器、独立计时、离线补交及导入重置。GitHub Actions 有独立任务自动启动本地 Supabase 运行这些测试。浏览器测试结束后执行 `npm run build`，恢复常用环境的生产构建。

上线验收用两台电脑各自的实际网络：登录同一账号，在一台增改删除记录，另一台无需刷新应更新；分别启动番茄钟，确认彼此独立且完成记录能够同步。关闭网络验证只读与补交，再确认备份往返及另一个账号的数据隔离。
