# 服务器网页桌面版

本部署把 Chromium、Xvfb、Fluxbox、x11vnc、noVNC 和 Muse 引擎装进一个容器。
在 Edge 打开网页桌面，即可操作**服务器上的 Chromium**完成 Muse 登录。
现有 Magpie、模型 ID 和多账号调度保持不变；本容器不是另一个 Magpie。

## 启动

服务器需要 Docker Engine 与 Docker Compose。初始化脚本需要 Node 20+；也可用一次性 Node 容器执行。

若使用交付的源码 ZIP，先解压并进入项目目录，直接从 `node deploy/desktop/init.mjs` 开始。
以下 `git clone` 只适用于本 fork 已经合并 0.6.0 版本的情况；尚未推送时不要重新下载旧版本覆盖修改版。

```sh
git clone https://github.com/K-zhaochao/magpie-muse-web.git
cd magpie-muse-web
node deploy/desktop/init.mjs
docker compose --env-file deploy/desktop/.env -f deploy/desktop/compose.yaml up -d --build
docker compose -f deploy/desktop/compose.yaml ps
```

没有 Node 时，用下面的命令代替初始化步骤：

```sh
docker run --rm -v "$PWD:/repo" -w /repo node:22-bookworm-slim node deploy/desktop/init.mjs
```

`deploy/desktop/.env` 会生成桌面密码 `DESKTOP_PASSWORD` 和引擎密钥 `MUSE_WEB_ENGINE_KEY`；重复初始化保留已有文件。
只在服务器私下查看和填写这些值，不提交 Git，也不要贴进日志。

默认监听服务器 `127.0.0.1:6080`。在 Xshell 添加本地转发：本地 `6080` → 目标 `127.0.0.1:6080`，仅接受本地连接。
然后 Edge 打开 `http://127.0.0.1:6080/`，用户名 `muse`、密码为 `.env` 的 `DESKTOP_PASSWORD`。
初始空桌面正常：必须从 Magpie 发起登录，Chromium 窗口才会出现。

## 连接现有 Magpie

在 **Magpie 进程的环境变量**设置外部引擎地址与密钥，而不是只给桌面容器设置：

| Magpie 的运行方式 | `MUSE_WEB_ENGINE` |
|---|---|
| 同一宿主机直接运行 | `http://127.0.0.1:6080` |
| Docker，同一网络 | `http://muse-desktop:8080` |
| 不同服务器 | 桌面引擎的独立 HTTPS 域名 |

`MUSE_WEB_ENGINE_KEY` 必须与桌面 `.env` 里的值一致。保存环境配置后重建或重启 Magpie。
Docker 中还要将现有 Magpie 服务加入外部网络 `muse-desktop-network`。合并示例：

```yaml
# magpie 应改成现有 Compose 的服务名；保留原来的网络、端口和数据卷。
services:
  magpie:
    environment:
      MUSE_WEB_ENGINE: http://muse-desktop:8080
      MUSE_WEB_ENGINE_KEY: ${MUSE_WEB_ENGINE_KEY:?请在现有 Magpie 的私有环境配置中设置引擎密钥}
    networks:
      - muse-desktop
networks:
  muse-desktop:
    external: true
    name: muse-desktop-network
```

在 1Panel 的对应操作为：加入该网络、添加上述环境变量、重新创建现有 Magpie 容器。
**容器内的 `127.0.0.1` 指向容器自己，不是另一容器或宿主机。**

## 用网页桌面登录

在 Magpie 插件页移除原上游插件，安装 `github:K-zhaochao/magpie-muse-web`。
同一 `muse-web` provider 只保留一份插件。

1. Magpie → 供应商 → Muse Web → muse.ai（浏览器登录）。
2. 打开返回的登录状态页，点击 **打开远程登录桌面**；首次访问输入独立的桌面用户名和密码。
3. 在桌面里的 Chromium 完成 Muse 登录。账号密码和验证码仍直接在 Muse 页面输入。
4. 等待窗口关闭及插件的短消息验证，Magpie 显示账号成功后再开始对话。

保留原来的 15 分钟登录超时与登录验证。账号/Cookie 存在 Docker 命名卷，重启保留。
不要把生产登录改成 `MUSE_WEB_LOGIN_HEADLESS=1`，那样没有可操作的窗口。

## 使用 HTTPS 域名

在 1Panel 为桌面引擎设置**独立子域名**，反代到 `http://127.0.0.1:6080`，启用 HTTPS 与 WebSocket，关闭缓冲。
配置片段见 `reverse-proxy.conf.example`。修改 `.env`：

```dotenv
MUSE_WEB_PUBLIC_URL=https://你的桌面引擎域名
MUSE_WEB_DESKTOP_URL=https://你的桌面引擎域名/desktop/vnc.html?autoconnect=1&resize=scale&path=desktop/websockify
```

```sh
docker compose --env-file deploy/desktop/.env -f deploy/desktop/compose.yaml up -d
```

这两个 URL 是**用户浏览器可访问的地址**；`MUSE_WEB_ENGINE` 是**Magpie 后端可访问的地址**，两者可以不同。
本部署按独立域名根目录配置；子路径代理需额外重写。桌面 HTTP 与 WebSocket 均有密码认证，内部 VNC/CDP 不对外发布。
不要用引擎的 `/v1` 覆盖现有 Magpie 网关 `/v1`，它们是不同的接口与密钥。

## 接入 AstrBot

Muse 登录成功后，在 Magpie 创建专供 AstrBot 的**网关密钥**，确认网关模型列表出现 Muse 模型。

| 设置 | 填写 |
|---|---|
| 类型 | OpenAI Compatible |
| Base URL | 现有 Magpie 网关 HTTPS 地址，以 `/v1` 结尾 |
| API Key | Magpie 网关密钥，不是引擎密钥/桌面密码 |
| 模型 | `muse-web/muse-spark`，以网关 `/v1/models` 的实际结果为准 |

链路：QQ ↔ NapCat ↔ AstrBot → Magpie 网关 → Muse 桌面引擎 → Muse。

## 排错、更新与回滚

```sh
docker compose -f deploy/desktop/compose.yaml logs --tail 100 muse-desktop
curl -fsS http://127.0.0.1:6080/v1/health
```

- 桌面 401：填写 `.env` 的桌面密码，不是引擎密钥。
- `/v1/login` 401：确认 Magpie 与引擎使用相同的引擎密钥。
- 有桌面没浏览器：先从 Magpie 发起登录，单独打开桌面不发起登录。
- 浏览器打开后登录失败：查看 Muse 页面和 `engine.log` 的实际会话/测试错误；桌面不会替代账号验证。
- 没图像或 WS 断连：确认反代覆盖 `/desktop/`，并支持 WebSocket 升级和长连接。
- 修改 `.env` 后运行 `up -d` 重新创建，单纯 `restart` 不更新环境变量。

更新代码后运行 `up -d --build`。停止新增服务但保留账号卷：

```sh
docker compose -f deploy/desktop/compose.yaml down
```

移除 Magpie 新增的两个 `MUSE_WEB_ENGINE*` 环境变量并换回原插件，就恢复本机引擎模式。
不要运行 `down -v`，除非明确要删除账号卷。

## 测试

```sh
node --test contract.test.mjs 'test/*.test.mjs'
docker build -f deploy/desktop/Dockerfile -t muse-desktop:test .
docker run --rm --entrypoint node -v "$PWD:/tests:ro" -w /tests muse-desktop:test --test contract.test.mjs 'test/*.test.mjs'
```

CI 还测试桌面 HTTP/WS 认证、VNC RFB 握手、公开登录 URL、**有界面 Chromium 登录**、会话保存与 Chat Completions。
测试使用本机仿 Muse 页面，不接触真实账号；真实 Muse 登录仍需部署后验证。
