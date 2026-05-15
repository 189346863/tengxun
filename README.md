腾讯云 EdgeOne Pages KV-only 部署说明
本包是“旭儿综合网站”的 腾讯云 EdgeOne Pages KV-only 专用版本。
它只使用 EdgeOne Pages KV，不依赖 Blob、COS、数据库或其他对象存储。
一、代码结构
```text
edgeone_pages_kv_only_deploy/
├── edge-functions/
│   ├── [[default]].js      # 多级路径兜底函数，处理 /admin、/api/*、/post/* 等路径
│   └── index.js            # 首页函数，处理 /
├── README_腾讯云EdgeOne_KV部署说明.md
├── README_代码结构说明.md
└── package.json
```
说明：
```text
edge-functions/[[default]].js
```
用于匹配多级动态路径，例如：
```text
/admin
/logout
/post/文章ID
/api/upload
/api/images
/api/image/图片文件名
```
同时额外放置：
```text
edge-functions/index.js
```
用于确保首页 `/` 可以正常进入同一套站点逻辑。
二、必须配置的 KV 变量名
本代码固定使用 KV 变量名：
```text
NAV_KV
```
EdgeOne Pages 项目中绑定 KV Namespace 时，变量名必须填写：
```text
NAV_KV
```
代码入口会优先从：
```js
context.env.NAV_KV
```
读取 KV；如果运行环境把绑定变量注入为全局变量，也会尝试读取：
```js
NAV_KV
```
三、部署步骤
1. 创建 EdgeOne Pages 项目
进入腾讯云 EdgeOne Pages 控制台，创建一个 Pages 项目。
2. 开通并创建 KV Namespace
在 EdgeOne Pages 控制台中进入：
```text
Storage / KV
```
创建一个 KV Namespace，例如：
```text
xuer_nav_kv
```
3. 绑定 KV 到 Pages 项目
进入项目设置中的 KV Storage 绑定页面，绑定 Namespace。
绑定变量名必须是：
```text
NAV_KV
```
Production 环境和 Preview 环境建议都绑定。
4. 上传代码
上传整个项目目录，或把本包内容放入你的 Git 仓库。
需要保留目录结构：
```text
edge-functions/
├── [[default]].js
└── index.js
```
5. 部署
在 EdgeOne Pages 控制台部署项目。
部署完成后访问：
```text
/
```
后台访问：
```text
/admin
```
四、默认后台信息
后台地址：
```text
/admin
```
默认密码：
```text
admin123
```
首次部署后请立即进入后台修改密码。
五、图片上传限制
本版本只使用 KV 保存图片，因此单张图片限制为：
```text
700 KB
```
原因：
```text
EdgeOne Edge Functions 请求体限制较小；
图片转 base64 后体积会膨胀；
700KB 更稳妥。
```
后台前端和后端都已加入 700KB 限制。
六、主要功能路径
```text
/                    首页
/admin               后台管理
/logout              退出登录
/post/{id}           文章详情页
/api/config          书签 API
/api/blog            文章 API
/api/upload          图片上传 API
/api/images          图片列表 API
/api/image/{name}    图片访问 API
/api/site-info       站点设置 API
```
七、部署后检查清单
```text
[ ] 首页可以打开
[ ] /admin 可以打开
[ ] 已使用默认密码 admin123 登录
[ ] 已修改默认密码
[ ] 可以新增书签
[ ] 可以新增文章
[ ] 可以上传小于 700KB 的图片
[ ] 可以从图库插入图片到文章正文
[ ] 删除文章时，独占图片会被清理
[ ] 共享图片被其他文章引用时会保留
```
八、常见问题
1. 页面显示 KV namespace NAV_KV is not bound
说明 KV 没有绑定成功，或者绑定变量名不是：
```text
NAV_KV
```
请检查 EdgeOne Pages 项目中的 KV 绑定配置。
2. 图片上传失败
优先检查：
```text
图片是否超过 700KB
图片格式是否为 jpeg/png/gif/webp
KV 是否已绑定到当前环境
```
3. 后台登录后刷新又退出
检查浏览器是否禁用 Cookie，或者站点是否使用 HTTPS。
4. 根路径 `/` 无法访问，但 `/admin` 可以访问
检查 EdgeOne Pages 是否正确识别：
```text
edge-functions/index.js
```
如果你的项目还存在静态 `index.html`，静态资源路由可能优先于 Edge Functions，请删除冲突的静态首页文件或调整项目结构。
5. /api 路径无法访问
检查：
```text
edge-functions/[[default]].js
```
是否被完整上传。
