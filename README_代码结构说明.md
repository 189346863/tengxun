# EdgeOne KV-only 版代码结构说明

## 一、入口函数

EdgeOne Pages Edge Functions 使用：

```js
export async function onRequest(context) {
  const request = context.request;
  const kv = resolveEdgeOneKv(context);
  return handleRequest(request, kv);
}
```

与 Cloudflare Worker 版本不同，Cloudflare 使用：

```js
export default {
  async fetch(request, env) {}
}
```

本包已经改成 EdgeOne Pages 的 `onRequest(context)` 形式。

## 二、KV 变量名

固定使用：

```text
NAV_KV
```

核心读取逻辑：

```js
function resolveEdgeOneKv(context) {
  if (context && context.env && context.env.NAV_KV) return context.env.NAV_KV;
  if (typeof NAV_KV !== 'undefined') return NAV_KV;
  if (typeof globalThis !== 'undefined' && globalThis.NAV_KV) return globalThis.NAV_KV;
  return null;
}
```

## 三、KV Key 命名规则

EdgeOne KV 文档对 key 有更严格的字符限制，因此本版本不再使用 Cloudflare 版中的：

```text
views:{id}
session:{token}
img:{filename}
img_meta:{filename}
```

已改为只含字母、数字、下划线的 key：

```text
views_{id}
session_{token}
image_data_{filename_token}
image_meta_{filename_token}
image_index
blog_posts
sites
admin_password
site_title
site_subtitle
site_logo
site_logo_link
header_bg
cn_link
```

## 四、图片存储方式

由于你当前只能使用 KV，本版本采用：

```text
image_data_xxx  → data:image/png;base64,...
image_meta_xxx  → 图片元数据 JSON
image_index     → 图片文件名索引数组
```

其中 `image_index` 用于图库列表，避免完全依赖 KV list 扫描。

## 五、图片外链格式

上传图片后自动生成：

```text
相对 URL
绝对 URL
Markdown
HTML
BBCode
```

后台图库中可以直接复制：

```text
URL / MD / HTML / BB
```

## 六、文章删除清理逻辑

删除文章时会清理：

```text
views_{id}
post_{id}
post_meta_{id}
comments_{id}
post_comments_{id}
likes_{id}
```

并扫描文章中的：

```text
封面图
正文图片
摘要中的图片引用
```

如果图片没有被其他文章、书签 Logo、站点 Logo、页眉背景图引用，则删除：

```text
image_data_xxx
image_meta_xxx
image_index 中的记录
```

如果图片仍被其他内容引用，则自动保留。

## 七、会话处理

EdgeOne KV-only 版没有使用 KV expirationTtl。

因此登录会话改为：

```text
session_{token} → {"createdAt": 时间戳, "expiresAt": 时间戳}
```

每次后台鉴权时会检查 `expiresAt`，过期后自动删除该 session key。

## 八、当前限制

```text
单张图片建议 ≤ 700KB
不适合大量高清图片长期存储
适合个人博客、小型导航站、轻量文章系统
```

如果后续图片数量多或体积大，建议迁移图片到 Blob、COS 或其他对象存储，KV 只保存元数据。
