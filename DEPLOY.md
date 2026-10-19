# 部署到 GitHub + Vercel，并让搜索引擎收录

这份清单按顺序做一遍，站点就能被 Google / Bing / 百度用关键词搜到。技术侧的 SEO 文件（`index.html`、`robots.txt`、`sitemap.xml`、`og-image.png`、JSON-LD）已经写好，剩下的是仓库元数据、部署配置和主动提交收录。

当前假定的站点地址是 `https://devcppweb.vercel.app/`。换成自定义域名后跑一次：

```sh
node scripts/set-site-url.mjs https://your-domain.com
```

它会同时改掉 `index.html`、`robots.txt`、`sitemap.xml`、`llms.txt` 里的地址。

---

## 1. 推到 GitHub

```sh
git init
git add .
git commit -m "Dev-C++ Web 5.11"
gh repo create DevCppWeb --public --source=. --remote=origin --push
```

推送前确认 101 MiB 的编译器工具链没有进仓库（`.gitignore` 已排除）：

```sh
git ls-files public/compiler | wc -l   # 应为 0
```

仓库建好后，在 **Settings** 里补齐四项，这决定了 GitHub 站内搜索能不能找到你：

| 位置 | 填什么 |
| --- | --- |
| Description | `Dev-C++ 5.11 网页版：浏览器里的 C++ IDE 与在线编译器（Clang/WebAssembly）` |
| Website | `https://devcppweb.vercel.app/` |
| Topics | `dev-cpp` `cpp` `ide` `online-compiler` `webassembly` `wasm` `clang` `react` `vite` `browser-ide` `code-editor` |
| Social preview | 上传 `public/og-image.png` |

GitHub 仓库页本身也会被 Google 索引，但不要把仓库页当主站——真正的入口是 Vercel 域名。

---

## 2. 部署到 Vercel

1. [vercel.com/new](https://vercel.com/new) → 导入 `DevCppWeb` 仓库。
2. Framework 会自动识别为 Vite；`vercel.json` 已固定 `npm ci`、`npm run build`、输出 `dist`。
3. Node 版本选 20 或 22。
4. **必须先看下面两条，否则部署会失败或功能不可用。**

### 2.1 COOP/COEP 响应头（功能前提）

控制台的同步键盘输入依赖 `SharedArrayBuffer`，页面必须是 cross-origin isolated。`vercel.json` 已经为所有路由加上：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

部署后验证：

```sh
curl -sI https://devcppweb.vercel.app/ | grep -i cross-origin
```

两条都在才算成功。没有的话浏览器控制台会提示 `crossOriginIsolated === false`。

### 2.2 部署体积（Hobby 的关键限制）

`dist/` 约 110 MB，其中编译器工具链约 101 MB（`llvm.core.wasm` 单个 72 MB）。Vercel Hobby 的静态文件上传上限是 **100 MB**，直接部署大概率被拒。

推荐做法是把工具链放到 CDN，部署体积降到约 7 MB。在 Vercel 项目的 **Settings → Environment Variables** 添加（Production、Preview 都勾上）：

```text
VITE_COMPILER_BASE=https://cdn.jsdelivr.net/npm/@yowasp/clang@22.0.0-git20542-10/gen/
```

然后 Redeploy。构建时 `scripts/copy-compiler.mjs` 会跳过复制，运行时会从 jsDelivr 加载 `bundle.js` 和 wasm；jsDelivr 返回 `access-control-allow-origin: *` 和 `cross-origin-resource-policy: cross-origin`，能通过 COEP 检查。

注意：URL 里的版本号必须和 `package.json` 里 `@yowasp/clang` 的版本一致，升级依赖时一起改。不想依赖 jsDelivr 的话，可以把 `public/compiler/` 上传到 Vercel Blob、Cloudflare R2 或自己的对象存储，把同一个变量指向那个目录，或者升级到 Pro（1 GB 上限）。

### 2.3 域名

`*.vercel.app` 可以正常收录，但权重低、国内访问不稳。有域名就绑定自定义域名，收录速度和排名都会更好；在 Vercel 里加域名后按提示配置 DNS 即可。换完域名记得跑 `node scripts/set-site-url.mjs`。

### 2.4 第三方脚本

`Cross-Origin-Embedder-Policy: require-corp` 会拦截没有 CORP/CORS 头的第三方资源，Google Analytics、外部字体、外链图片都会被挡。Vercel Analytics 是同源 `/_vercel/insights/script.js`，可以用；其它统计建议先不加。

---

## 3. 让搜索引擎收录

搜索引擎的流程是：`robots.txt` 允许抓取 → 发现页面（链接或 sitemap）→ 渲染并建立索引 → 按关键词排序。前两步已经由代码解决，剩下是主动提交。

### 3.1 已经做好的部分

- `<title>`、`description`、`keywords`、`canonical`
- Open Graph / Twitter Card，分享时有图有标题
- JSON-LD `SoftwareApplication` 结构化数据（免费、版本 5.11、功能列表）
- `robots.txt`、`sitemap.xml`
- `<noscript>` 和视觉隐藏的 `h1/h2` 说明文本——这个应用是纯 JS 渲染，没有这段文本，Google 只能看到一个空桌面
- `llms.txt`，方便 ChatGPT、Perplexity 这类 AI 搜索读取

### 3.2 Google Search Console

1. 打开 <https://search.google.com/search-console>，添加资源。
2. `vercel.app` 属于公共后缀，**不能用“网域”资源**，选 **“网址前缀”** 并填 `https://devcppweb.vercel.app/`。
3. 验证方式选 HTML 标记：把给出的 `<meta name="google-site-verification" ...>` 粘到 `index.html` 的 `<head>` 里，推送后回控制台点验证；或者把验证文件放进 `public/`。
4. 左侧 **Sitemaps** 提交 `sitemap.xml`。
5. **网址检查** 输入首页 → **请求编入索引**。首次收录通常 1～7 天。
6. 之后看 **页面（Pages）** 是否显示“已编入索引”。

有自定义域名并托管在 Vercel DNS 时，改用“网域”资源 + DNS TXT 验证更省事。

### 3.3 Bing Webmaster Tools

<https://www.bing.com/webmasters> → 从 Google Search Console 一键导入，再提交一次 sitemap。Bing 的索引同时供给 Copilot / ChatGPT 搜索，别跳过。

### 3.4 百度搜索资源平台

中文关键词主要靠百度：<https://ziyuan.baidu.com/> → 添加站点 → 验证（HTML 标记或文件，和 Google 一样）→ 提交 sitemap。

百度对 JS 渲染的支持较差，所以 `index.html` 里那段静态说明文本很重要，不要删。Vercel 在境外，百度抓取可能偏慢，属于正常现象。

### 3.5 IndexNow（Bing / Yandex 快速收录）

```sh
KEY=$(openssl rand -hex 16)
echo "$KEY" > "public/$KEY.txt"
git add "public/$KEY.txt" && git commit -m "chore: indexnow key" && git push
```

部署完成后提交一次：

```sh
curl "https://api.indexnow.org/indexnow?url=https://devcppweb.vercel.app/&key=$KEY"
```

### 3.6 外链和曝光

收录之后排名靠外链和点击。把站点发到：V2EX、掘金、知乎相关问题、Reddit `r/cpp`、Hacker News（Show HN）、Product Hunt。GitHub README 顶部的在线地址也算一条稳定外链。

---

## 4. 关键词怎么选

| 关键词 | 搜索意图 | 放在哪 |
| --- | --- | --- |
| Dev-C++ 网页版 / Dev-C++ Web | 找这个具体项目 | title、h1、仓库描述 |
| 在线 C++ 编译器 / 在线编译 C++ | 想立刻编译代码 | description、正文 |
| 浏览器 C++ IDE / C++ 在线运行 | 同上，偏工具 | description、功能列表 |
| WebAssembly C++ 编译器 / Clang wasm | 技术长尾 | 正文、README |
| Dev-C++ 下载 | 想装 Windows 软件 | **不要抢**，意图不匹配，跳出率高 |

原则：每个词都能在页面里自然读到，不要堆砌。现在 `index.html` 的 title/description/h1 已经覆盖了前三行。

---

## 5. 验证

```sh
# 首页、robots、sitemap 都能访问
curl -sI https://devcppweb.vercel.app/
curl -s https://devcppweb.vercel.app/robots.txt
curl -s https://devcppweb.vercel.app/sitemap.xml

# 结构化数据
open "https://search.google.com/test/rich-results?url=https://devcppweb.vercel.app/"

# 收录情况（部署后 3～7 天再看）
# Google: site:devcppweb.vercel.app
# Bing:   site:devcppweb.vercel.app
```

性能看 PageSpeed Insights。首次加载 100 MB 是工具链在后台预热，不影响首屏文字出现的 LCP，但会拉长可交互时间；CDN + `Cache-Control` 已经配好，第二次访问会快很多。

---

## 6. 常见坑

- **只改 GitHub 不会让 Vercel 站点有排名。** 两个是不同 URL，要分别提交。
- **不要删掉 `index.html` 里的隐藏说明文本。** 页面是纯 JS 应用，删了之后 Google 渲染出来只有窗口和菜单文字。
- **`robots.txt` 不要 Disallow `/assets/`。** 拦截 JS/CSS 会让 Google 无法渲染页面；只拦 `/compiler/` 是对的。
- **COEP 和第三方资源冲突。** 加统计、字体、图片前先确认对方有 CORP/CORS。
- **`vercel.app` 不能做 Google“网域”资源。** 用网址前缀 + HTML 标记验证。
- **公开部署前确认字体授权。** `public/fonts/consolas/` 里的 Consolas 属于微软系统字体，标准授权不包含网页自托管或再分发，README 里已注明；公开上线需要取得适用于该网站的 Webfont 授权。
- **Vercel Hobby 仅限非商业用途。** 个人作品集/开源项目没问题。
- **仓库里同时有 `package-lock.json` 和 `pnpm-lock.yaml`。** `vercel.json` 已经固定用 `npm ci`；如果确定不用 pnpm，可以删掉 `pnpm-lock.yaml` 避免歧义。

---

## 7. 改域名后的操作

```sh
node scripts/set-site-url.mjs https://your-domain.com
git add -A && git commit -m "chore: update site URL" && git push
```

再去 GitHub 仓库的 Website 改成新地址，并在 Search Console / Bing / 百度里添加新资源、提交新 sitemap。旧地址保留 301 重定向（Vercel 项目里把旧域名指向新域名即可）。

分享图左下角印着域名，换完域名后重新生成一次：

```sh
npm run og-image   # 默认读取刚更新的域名
# 或显式指定
SITE_URL=your-domain.com npm run og-image   # 输出 public/og-image.png (1200x630)
```
