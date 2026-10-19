# Dev-C++ Web 5.11

**在线试用：** <https://devcppweb.vercel.app/>

使用 Vite、React 和 CodeMirror 重建 Dev-C++ 5.11 的 Windows 风格桌面界面，把 C++ 的编辑、编译和运行搬进浏览器。语言、窗体布局、图标、配色、模板和帮助内容来自用户提供的 `SOURCE 5.11`。

部署到 Vercel、配置 COOP/COEP、提交搜索引擎收录的步骤见 [`DEPLOY.md`](DEPLOY.md)。

```sh
npm install
npm run dev
```

打开终端显示的本地地址。首次启动会显示语言、编辑器字体、配色和图标主题向导。新建源文件后按 **F11** 保存、编译并运行，程序的控制台在网页桌面内单独开窗，支持键盘输入。

```sh
npm run build
npm run preview
```

构建产物为 `dist/`。`npm install` 和 `npm run build` 都会把 `@yowasp/clang` 的编译器资源复制到 `public/compiler/`。浏览器首次加载编译器需要下载约 100 MiB 的工具链资源。

如果要把工具链放到 CDN（静态托管的部署体积限制通常低于 100 MiB），构建时设置环境变量即可，`public/compiler/` 会被跳过：

```sh
VITE_COMPILER_BASE=https://cdn.jsdelivr.net/npm/@yowasp/clang@22.0.0-git20542-10/gen/ npm run build
```

版本号必须与 `package.json` 中的 `@yowasp/clang` 一致。

工具链在桌面启动后立即后台预热：使用本地工具链时各 WebAssembly 模块并行加载，使用 CDN 时按上游 `bundle.js` 的顺序加载。编译 Worker 会复用项目输入，并缓存输入内容和参数一致的成功结果（当前页面内，最多 32 MiB / 64 条）；修改源码、头文件、库文件或参数会改变缓存键。项目目标文件按 Clang 实际生成的头文件依赖增量编译；“重新构建”会跳过结果缓存，“清理”同时清除缓存。虚拟文件系统使用目录索引，收集编译输入时无需逐目录扫描全部文件。

编辑器已内置 Consolas 的常规、粗体、斜体和粗斜体，启动时预加载，本机无需安装；Cascadia Mono 作为后备字体。已有的用户字体选择会保留。字体设置只列出可用字体；“导入字体…”可加载自己的 TTF/OTF 文件，刷新后继续可用。

Consolas 的文件来源与版权说明见 `public/fonts/consolas/`。微软系统字体的标准授权不包括网页自托管或再分发；公开部署须取得适用于该网站的 Webfont 授权，第三方镜像的下载链接不等于授权。说明：https://learn.microsoft.com/en-us/typography/fonts/font-faq 。Cascadia Mono 的开放字体许可见 `public/fonts/cascadia-mono/OFL.txt`。

本地开发和预览服务器会发送 COOP/COEP 响应头。静态部署需要 HTTPS；自托管服务器可以发送以下响应头，也可以使用项目附带的 Service Worker 建立隔离环境。隔离环境用于控制台的同步键盘输入。

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

主要模块：

- `src/os/`：窗口、任务栏、文件对话框和 IndexedDB 虚拟文件系统。
- `src/ide/`：编辑、项目管理、搜索替换、补全、选项设置、代码生成、TODO、打印和导出。
- `src/compiler/`：在 Worker 内使用 Clang/LLD 编译为 WebAssembly，并将诊断关联到编辑器。
- `src/console/`、`runtime/`：交互控制台及常用 conio/Win32 控制台兼容函数。
- `src/generated/`：从原版源码转换的界面资源。重新转换使用 `python3 scripts/convert_source.py "/path/to/SOURCE 5.11"`。
- `public/formatter/`：AStyle WebAssembly 资源，来源见 `vendor/wastyle/`。

文件保存在当前浏览器、当前站点的 IndexedDB 中，不是宿主机上的 Windows 路径。文件对话框顶部的“查看”菜单支持从电脑导入文件或整个文件夹、下载选中文件，也可以拖入文件；运行程序对工作目录中文件的修改会写回虚拟文件系统。

保存到虚拟“桌面”的文件会立即显示在桌面上；双击源文件或项目可在 Dev-C++ 中打开，双击本项目编译的程序可运行。桌面的“文档”图标可以打开默认保存目录。右键桌面空白处选择“新建 → 文件夹”，输入名称后按 Enter 确认；双击文件夹可浏览内容，并继续新建子文件夹。选中文件或文件夹后右键选择“删除”，或按 Delete（Mac 上按 ⌘⌫），确认后永久删除；文件夹连同其中的内容一起删除。没有回收站，删除后无法恢复。桌面、文档和 Dev-C++ 安装目录及其上级目录不能删除。文件和文件夹在刷新页面后保留。

当前版本仍不能保证与原版全部功能一模一样。编译器实际是 Clang/WebAssembly，日志沿用 Dev-C++ 的 MinGW 风格；输出文件虽显示 `.exe`，内容是 WebAssembly，不能作为 Windows 原生程序运行。GDB 断点和单步调试、gprof、原生 GUI/DLL、Windows 资源编译、任意外部 Windows 程序和自定义 Makefile 构建尚未接入原生执行环境。相关界面和项目元数据不代表这些原生能力已经可用。

本轮仅执行生产构建；按用户要求，没有运行单元测试、集成测试、端到端测试或浏览器自动验收。

原版资源的许可见 `LICENSE`，第三方运行时的来源与许可见 `vendor/`。
