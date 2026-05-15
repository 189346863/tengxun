// 腾讯云 EdgeOne Pages KV-only 版 - 旭儿综合网站    KV变量名：NAV_KV    默认密码：admin123
// 说明：本文件用于 EdgeOne Pages 的 Edge Functions。只使用 KV，不依赖 Blob / COS / 数据库。
// 图片以 data URL 形式保存到 KV，单张上传限制为 700KB，以适配 Edge Functions 1MB 请求体限制。

const EDGEONE_IMAGE_MAX_BYTES = 700 * 1024;
const SESSION_TTL_SECONDS = 86400;

export async function onRequest(context) {
    const request = context.request;
    const kv = resolveEdgeOneKv(context);
    if (!kv) return textResponse('EdgeOne Pages KV namespace NAV_KV is not bound. 请在 EdgeOne Pages 项目中绑定 KV 变量名 NAV_KV。', 500);
    return handleRequest(request, kv);
}

async function handleRequest(request, kv) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/admin') return handleAdmin(request, kv);
    if (path === '/logout') return handleLogout(request, kv);
    if (path.startsWith('/post/')) return handlePost(request, kv);
    if (path === '/api/upload') return handleUpload(request, kv);
    if (path.startsWith('/api/image/')) return handleImage(request, kv);
    if (path === '/api/images' || path.startsWith('/api/images/')) return handleImagesApi(request, kv);
    if (path.startsWith('/api/')) return handleApi(request, kv);
    return handleHome(request, kv);
}

// ==================== 首页 ====================
async function handleHome(request, kv) {
    const url = new URL(request.url);
    const currentTab = url.searchParams.get('tab') || 'blog';
    const searchQuery = url.searchParams.get('q') || '';
    const currentTag = url.searchParams.get('tag') || '';
    const currentCat = url.searchParams.get('c') || '';
    
    let sites = [], posts = [];
    try {
        const sitesData = await kv.get('sites');
        if (sitesData) sites = JSON.parse(sitesData);
        const postsData = await kv.get('blog_posts');
        if (postsData) posts = JSON.parse(postsData);
    } catch(e) { }

    sites.sort((a, b) => (a.sort_order || 9999) - (b.sort_order || 9999));

    const viewsMap = new Map();
    for (const post of posts) {
        const views = await kv.get(viewKey(post.id));
        if (views) viewsMap.set(post.id, parseInt(views));
    }
    
    const catMap = new Map();
    sites.forEach(s => {
        const cat = s.catelog || '未分类';
        catMap.set(cat, (catMap.get(cat) || 0) + 1);
    });
    const categories = Array.from(catMap.keys()).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const filteredSites = currentCat ? sites.filter(s => (s.catelog || '未分类') === currentCat) : sites;
    
    const catNavHtml = categories.map(cat => {
        const activeClass = currentCat === cat ? 'background:#667eea;color:white;font-weight:600' : '';
        return `<a href="/?tab=bookmark&c=${encodeURIComponent(cat)}" style="display:block;padding:12px 12px;margin:4px 0;border-radius:8px;text-decoration:none;color:#4a5568;${activeClass}">📁 ${escapeHtml(cat)} <span style="float:right;color:#a0aec0;font-size:12px">${catMap.get(cat)}</span></a>`;
    }).join('');
    
    const cardsHtml = filteredSites.map(s => {
        const name = escapeHtml(s.name || '未命名');
        const urlClean = s.url && s.url.startsWith('http') ? s.url : 'https://' + (s.url || '');
        const logoClean = s.logo || '';
        const desc = escapeHtml(s.desc || '暂无描述');
        const cat = escapeHtml(s.catelog || '未分类');
        const initial = (s.name && s.name[0]) || '站';
        return `<div class="site-card"><a href="${escapeHtml(urlClean)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;display:block"><div style="display:flex;align-items:center;margin-bottom:12px">${logoClean ? `<img src="${escapeHtml(logoClean)}" style="width:44px;height:44px;border-radius:10px;object-fit:cover;margin-right:14px">` : `<div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:18px;margin-right:14px">${escapeHtml(initial)}</div>`}<div style="flex:1"><h3 style="font-size:16px;font-weight:600;color:#2d3748;margin-bottom:4px">${name}</h3><span style="font-size:11px;color:#a0aec0;background:#f7fafc;padding:2px 8px;border-radius:12px">${cat}</span></div></div><p style="font-size:13px;color:#718096;margin-bottom:12px;line-height:1.4">${desc}</p><div style="display:flex;justify-content:space-between"><span style="font-size:11px;color:#a0aec0">${urlClean.replace(/^https?:\/\//, '').substring(0,30)}</span><button class="copy-btn" data-url="${escapeHtml(urlClean)}" style="background:#edf2f7;border:none;padding:5px 14px;border-radius:20px;font-size:11px;cursor:pointer">复制</button></div></a></div>`;
    }).join('');
    
    let blogPosts = posts.filter(p => p.status === 'published');
    if (searchQuery) {
        blogPosts = blogPosts.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()) || (p.content && p.content.toLowerCase().includes(searchQuery.toLowerCase())));
    }
    if (currentTag) {
        blogPosts = blogPosts.filter(p => p.tags && p.tags.includes(currentTag));
    }
    blogPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const tagMap = new Map();
    posts.forEach(post => {
        if (post.tags && post.status === 'published') {
            post.tags.forEach(tag => tagMap.set(tag, (tagMap.get(tag) || 0) + 1));
        }
    });
    const tagCloudHtml = Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([tag, count]) => {
        const size = Math.min(24, 12 + count * 2);
        return `<a href="/?tab=blog&tag=${encodeURIComponent(tag)}" style="display:inline-block;margin:4px;padding:4px 12px;background:#f0f0f0;border-radius:20px;text-decoration:none;color:#667eea;font-size:${size}px">#${escapeHtml(tag)} (${count})</a>`;
    }).join('');
    
    const recentPosts = blogPosts.slice(0, 10);
    const blogListHtml = recentPosts.map(post => {
        const views = viewsMap.get(post.id) || 0;
        const excerptText = (post.excerpt || (post.content || '')).replace(/<[^>]*>/g, '').substring(0, 100);
        const coverImgHtml = (post.coverImage && post.coverImage.trim() !== '') 
            ? `<img src="${escapeHtml(post.coverImage)}" style="width:100px;height:80px;object-fit:cover;border-radius:8px" onerror="this.style.display='none'">` 
            : '';
        return `<div class="blog-card" onclick="location.href='/post/${post.id}'"><div style="display:flex;justify-content:space-between;gap:16px"><div style="flex:1"><h3 style="font-size:18px;margin-bottom:8px;color:#2d3748">${escapeHtml(post.title)}</h3><div style="display:flex;gap:16px;margin:8px 0;font-size:12px;color:#a0aec0"><span>📅 ${new Date(post.createdAt).toLocaleDateString()}</span><span>🏷️ ${escapeHtml(post.category || '未分类')}</span><span>👁️ ${views}阅读</span>${post.tags && post.tags.length ? `<span>${post.tags.map(t => '#' + escapeHtml(t)).join(' ')}</span>` : ''}</div><p style="color:#718096;line-height:1.5">${escapeHtml(excerptText)}...</p></div>${coverImgHtml}</div></div>`;
    }).join('');
    
    const hotPosts = [...posts.filter(p => p.status === 'published')].sort((a, b) => (viewsMap.get(b.id) || 0) - (viewsMap.get(a.id) || 0)).slice(0, 5);
    const hotPostsHtml = hotPosts.map(p => `<a href="/post/${p.id}" style="display:block;padding:10px 12px;margin:4px 0;border-radius:8px;text-decoration:none;color:#4a5568;font-size:13px;background:#f8fafc">🔥 ${escapeHtml(p.title.length > 20 ? p.title.substring(0,20)+'...' : p.title)} <span style="float:right;color:#a0aec0">${viewsMap.get(p.id) || 0}阅</span></a>`).join('');
    
    const siteTitle = await kv.get('site_title') || '旭儿导航';
    const siteSubtitle = await kv.get('site_subtitle') || '精选网站 · 优质博客';
    const logo = await kv.get('site_logo') || '';
    const logoLink = await kv.get('site_logo_link') || '';
    const headerBg = await kv.get('header_bg') || '';
    const cnLink = await kv.get('cn_link') || '';
    
    let logoHtml = '';
    if (logo) {
        if (logoLink) {
            logoHtml = `<a href="${escapeHtml(logoLink)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(logo)}" style="max-width:200px;max-height:240px"></a>`;
        } else {
            logoHtml = `<img src="${escapeHtml(logo)}" style="max-width:200px;max-height:240px">`;
        }
    } else {
        logoHtml = `<div style="font-size:28px;font-weight:bold;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${escapeHtml(siteTitle)}</div>`;
    }
    
    const titleText = currentTab === 'blog' ? (searchQuery ? `搜索: ${escapeHtml(searchQuery)}` : '博客文章') : (currentCat ? `${escapeHtml(currentCat)} · ${filteredSites.length}个网站` : `全部收藏 · ${sites.length}个网站`);
    
    return new Response(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes"><title>${escapeHtml(siteTitle)} · ${currentTab === 'blog' ? '博客' : '书签'}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f7fafc}.sidebar{position:fixed;left:0;top:0;width:280px;height:100vh;background:#fff;box-shadow:2px 0 12px rgba(0,0,0,.05);overflow-y:auto;z-index:100;transition:transform .3s ease-in-out}.sidebar-header{padding:20px;text-align:center;border-bottom:1px solid #e2e8f0}.sidebar-nav{padding:20px}.main{margin-left:280px;min-height:100vh}.header{position:relative;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:50px 40px;text-align:left;overflow:hidden}.header-bg-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}.header-content{position:relative;z-index:2}.header h1{font-size:42px;margin-bottom:12px;display:inline-block;margin-right:20px}.cn-btn{display:inline-block;background:rgba(255,255,255,.2);color:#fff;padding:8px 20px;border-radius:30px;text-decoration:none;font-size:16px;vertical-align:middle}.cn-btn:hover{background:rgba(255,255,255,.3)}.content{max-width:1300px;margin:0 auto;padding:35px 30px}.content-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:25px;flex-wrap:wrap;gap:12px}.content-header h2{font-size:22px;color:#2d3748}.tab-buttons{display:flex;gap:10px}.tab-btn{padding:8px 20px;border:none;border-radius:30px;cursor:pointer;font-size:14px;transition:all .2s;-webkit-tap-highlight-color:transparent}.tab-btn.active{background:#667eea;color:#fff}.tab-btn:not(.active){background:#e2e8f0}.sites-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(360px,100%),1fr));gap:24px}.site-card,.blog-card{background:#fff;border-radius:12px;padding:16px;margin-bottom:20px;cursor:pointer;transition:transform .2s,box-shadow .2s}.site-card:hover,.blog-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.1)}.search-box{margin-bottom:20px}.search-box input{width:100%;padding:12px 16px;border:1px solid #ddd;border-radius:30px;font-size:16px}.tag-cloud{margin-bottom:20px;padding:15px;background:#f8fafc;border-radius:12px}.mobile-toggle{display:none;position:fixed;top:15px;left:15px;z-index:101;background:#667eea;color:#fff;border:none;width:44px;height:44px;border-radius:12px;cursor:pointer;font-size:20px;box-shadow:0 2px 8px rgba(0,0,0,.15);-webkit-tap-highlight-color:transparent}.dark-mode-toggle{position:fixed;bottom:20px;right:20px;background:#667eea;color:#fff;border:none;width:50px;height:50px;border-radius:50%;cursor:pointer;z-index:1000;font-size:20px;box-shadow:0 2px 10px rgba(0,0,0,.2);-webkit-tap-highlight-color:transparent}.go-top{position:fixed;bottom:20px;left:20px;background:#667eea;color:#fff;border:none;width:50px;height:50px;border-radius:50%;cursor:pointer;z-index:1000;display:none;font-size:20px;box-shadow:0 2px 10px rgba(0,0,0,.2);-webkit-tap-highlight-color:transparent}body.dark{background:#1a1a2e}body.dark .sidebar{background:#16213e;color:#eee}body.dark .site-card,body.dark .blog-card{background:#16213e;color:#eee}body.dark .content-header h2{color:#eee}body.dark .tag-cloud{background:#0f3460}@media (max-width:768px){body{overflow-x:hidden}.sidebar{transform:translateX(-100%);width:min(84vw,280px)}.sidebar.open{transform:translateX(0)}.main{margin-left:0}.mobile-toggle{display:flex;align-items:center;justify-content:center}.header{padding:72px 20px 30px}.header h1{font-size:28px;display:block;margin-right:0}.cn-btn{font-size:12px;padding:4px 12px;margin-top:8px}.content{padding:20px 16px;width:100%}.content-header{align-items:flex-start}.content-header h2{font-size:18px}.tab-buttons{width:100%;display:grid;grid-template-columns:1fr 1fr}.tab-btn{padding:9px 14px;font-size:13px}.sites-grid{grid-template-columns:1fr;gap:16px}.site-card,.blog-card{padding:14px;margin-bottom:16px;overflow:hidden}.blog-card>div{flex-direction:column!important}.blog-card img{width:100%!important;height:auto!important;max-height:220px;margin-top:12px}.blog-card h3{font-size:16px}.tag-cloud{overflow-x:auto}.dark-mode-toggle,.go-top{width:44px;height:44px;font-size:18px;bottom:15px}.dark-mode-toggle{right:15px}.go-top{left:15px}}@media (max-width:480px){.sidebar-nav{padding:14px}.header h1{font-size:24px}.content{padding:16px 12px}.site-card,.blog-card{border-radius:10px}.site-card h3{font-size:15px}.site-card p,.blog-card p{font-size:13px}.search-box input{font-size:15px}}@media (hover:none) and (pointer:coarse){.tab-btn,.copy-btn,.site-card,.blog-card,.dark-mode-toggle,.go-top,.mobile-toggle{cursor:default;-webkit-tap-highlight-color:rgba(102,126,234,0.2)}.copy-btn{padding:8px 16px;min-width:60px}}</style></head>
<body><button class="mobile-toggle" id="mobileToggle">☰</button><div class="sidebar" id="sidebar"><div class="sidebar-header">${logoHtml}</div><div class="sidebar-nav"><a href="/?tab=blog" style="display:block;padding:12px;background:#e2e8f0;border-radius:8px;text-align:center;margin-bottom:15px;text-decoration:none;color:#667eea;font-weight:600">📝 博客列表</a><div style="font-weight:600;margin:15px 0 10px">📁 书签分类</div>${catNavHtml || '<div>暂无分类</div>'}<div style="font-weight:600;margin:20px 0 10px">🔥 热门文章</div>${hotPostsHtml || '<div>暂无</div>'}<div style="margin-top:20px;padding-top:15px;border-top:1px solid #e2e8f0"><a href="/admin" style="display:block;padding:12px;background:#edf2f7;border-radius:8px;text-align:center;text-decoration:none">⚙️ 后台管理</a></div></div></div><div class="main"><div class="header">${headerBg ? `<img class="header-bg-img" src="${escapeHtml(headerBg)}">` : ''}<div class="header-content"><h1>${escapeHtml(siteTitle)}</h1>${cnLink ? `<a href="${escapeHtml(cnLink)}" class="cn-btn" target="_blank" rel="noopener noreferrer">🇨🇳 国内线路</a>` : ''}<p>${escapeHtml(siteSubtitle)}</p><div>📅 ${new Date().toLocaleDateString('zh-CN')}</div></div></div><div class="content"><div class="content-header"><h2>${titleText}</h2><div class="tab-buttons"><button class="tab-btn ${currentTab === 'blog' ? 'active' : ''}" data-tab="blog">📝 博客</button><button class="tab-btn ${currentTab === 'bookmark' ? 'active' : ''}" data-tab="bookmark">🔖 书签</button></div></div><div id="blog-view" style="display:${currentTab === 'blog' ? 'block' : 'none'}"><div class="search-box"><form id="searchForm" onsubmit="event.preventDefault();let u=new URL(location.href);u.searchParams.set('q',this.q.value);location.href=u"><input type="text" name="q" placeholder="🔍 搜索文章..." value="${escapeHtml(searchQuery)}"></form></div>${tagCloudHtml ? `<div class="tag-cloud"><strong>🏷️ 热门标签：</strong> ${tagCloudHtml}</div>` : ''}${blogListHtml || '<div style="text-align:center;padding:60px">暂无文章</div>'}</div><div id="bookmark-view" style="display:${currentTab === 'bookmark' ? 'block' : 'none'}"><div class="sites-grid">${cardsHtml || '<div style="text-align:center;padding:60px">暂无书签</div>'}</div></div></div></div><button class="dark-mode-toggle" id="darkModeToggle">🌙</button><button class="go-top" id="goTop">↑</button><script>document.getElementById('mobileToggle').onclick=()=>{document.getElementById('sidebar').classList.toggle('open');};document.querySelectorAll('.copy-btn').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();navigator.clipboard.writeText(btn.dataset.url);btn.textContent='✓';setTimeout(()=>btn.textContent='复制',1000)});document.querySelectorAll('.tab-btn').forEach(btn=>btn.onclick=()=>{let u=new URL(location.href);u.searchParams.set('tab',btn.dataset.tab);u.searchParams.delete('c');u.searchParams.delete('q');u.searchParams.delete('tag');location.href=u});const darkToggle=document.getElementById('darkModeToggle');if(localStorage.getItem('darkMode')==='true')document.body.classList.add('dark');darkToggle.onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem('darkMode',document.body.classList.contains('dark'));darkToggle.textContent=document.body.classList.contains('dark')?'☀️':'🌙'};const goTop=document.getElementById('goTop');window.onscroll=()=>goTop.style.display=window.scrollY>300?'block':'none';goTop.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});document.getElementById('sidebar').addEventListener('click',(e)=>{if(window.innerWidth<=768&&e.target.closest('a')){document.getElementById('sidebar').classList.remove('open');}});</script></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ==================== 文章详情页 ====================
async function handlePost(request, kv) {
    const url = new URL(request.url);
    const id = parseInt(url.pathname.split('/')[2]);
    if (isNaN(id)) return new Response('文章不存在', { status: 404 });
    let posts = [];
    try { const data = await kv.get('blog_posts'); if (data) posts = JSON.parse(data); } catch(e) { }
    const post = posts.find(p => p.id === id);
    if (!post || post.status !== 'published') return new Response('文章不存在', { status: 404 });
    let views = 0;
    try {
        const v = await kv.get(viewKey(id));
        if (v) views = parseInt(v);
        views++;
        await kv.put(viewKey(id), views.toString());
    } catch(e) { }
    
    let safeContent = sanitizeHtml(post.content || '');
    safeContent = safeContent.replace(/<img\b/gi, '<img style="max-width:100%;height:auto;display:block;margin:20px auto;border-radius:8px"');
    
    return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(post.title)} - 旭儿导航</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f7fa;padding:20px}.container{max-width:900px;margin:0 auto}.article{background:#fff;border-radius:20px;padding:40px}h1{font-size:28px;margin-bottom:16px}.meta{color:#888;font-size:14px;margin-bottom:30px;padding-bottom:16px;border-bottom:1px solid #eee}.tags{margin-top:8px}.tag{display:inline-block;background:#e2e8f0;padding:4px 12px;border-radius:20px;font-size:12px;margin-right:8px}.content{line-height:1.8;font-size:16px}.content p{margin-bottom:16px}.content h1,.content h2,.content h3,.content h4{margin:24px 0 12px;color:#1e293b}.content blockquote{border-left:4px solid #667eea;margin:16px 0;padding:8px 16px;background:#f8fafc;color:#475569}.content pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:10px;overflow:auto;margin:16px 0}.content code{background:#f1f5f9;padding:2px 6px;border-radius:6px}.content pre code{background:transparent;padding:0}.content img{max-width:100%;height:auto;display:block;margin:20px auto;border-radius:8px}.back-btn{display:inline-block;margin-top:30px;background:#667eea;color:#fff;padding:10px 24px;border-radius:30px;text-decoration:none}@media (max-width:768px){body{padding:12px}.container{width:100%}.article{padding:20px;border-radius:14px}h1{font-size:22px;line-height:1.35}.meta{font-size:12px;line-height:1.7}.content{font-size:15px}.content img{margin:16px auto}.content pre{font-size:13px;padding:12px}.back-btn{width:100%;text-align:center}}@media (max-width:480px){body{padding:8px}.article{padding:16px;border-radius:12px}.content{font-size:14px}.tag{margin-bottom:6px}}</style></head><body><div class="container"><div class="article"><h1>${escapeHtml(post.title)}</h1><div class="meta">${post.category ? `分类：${escapeHtml(post.category)} · ` : ''}发布时间：${new Date(post.createdAt).toLocaleDateString()} · 阅读：${views}次${post.tags && post.tags.length ? `<div class="tags">${post.tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}</div><div class="content">${safeContent}</div><a href="/" class="back-btn">← 返回首页</a></div></div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ==================== 后台管理 ====================
async function handleAdmin(request, kv) {
    const isLoggedIn = await isAdmin(request, kv);
    
    if (request.method === 'POST') {
        const form = await request.formData();
        const password = form.get('password');
        const adminPass = await kv.get('admin_password') || 'admin123';
        if (password === adminPass) {
            const token = createSessionToken();
            await kv.put(sessionKey(token), createSessionValue());
            return new Response(null, { status: 302, headers: { 'Location': '/admin', 'Set-Cookie': buildAdminCookie(token) } });
        }
        return new Response('密码错误，<a href="/admin">返回</a>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    
    if (!isLoggedIn) {
        return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>管理员登录</title><style>body{font-family:system-ui;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px}.box{background:#fff;padding:40px;border-radius:24px;width:100%;max-width:340px;text-align:center;box-shadow:0 20px 35px -8px rgba(0,0,0,0.2)}.box h2{color:#1a202c;margin-bottom:24px}.input-group{margin-bottom:16px;text-align:left}.input-group label{display:block;margin-bottom:6px;color:#4a5568;font-size:14px;font-weight:500}.box input{width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:12px;font-size:16px;transition:all .2s}.box input:focus{outline:none;border-color:#667eea;box-shadow:0 0 0 3px rgba(102,126,234,0.1)}.box button{width:100%;padding:12px;background:#667eea;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;margin-top:8px}.box button:hover{background:#5a67d8}</style></head><body><div class="box"><h2>✨ 管理员登录</h2><form method="post"><div class="input-group"><label>密码</label><input type="password" name="password" placeholder="请输入密码" required></div><button type="submit">登录后台</button></form></div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    
    let sites = [], posts = [];
    try {
        const sitesData = await kv.get('sites');
        if (sitesData) sites = JSON.parse(sitesData);
        const postsData = await kv.get('blog_posts');
        if (postsData) posts = JSON.parse(postsData);
    } catch(e) { }
    
    sites.sort((a, b) => (a.sort_order || 9999) - (b.sort_order || 9999));
    posts.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.id - a.id;
    });
    
    const siteTitle = await kv.get('site_title') || '';
    const siteSubtitle = await kv.get('site_subtitle') || '';
    const siteLogo = await kv.get('site_logo') || '';
    const siteLogoLink = await kv.get('site_logo_link') || '';
    const headerBg = await kv.get('header_bg') || '';
    const cnLink = await kv.get('cn_link') || '';
    
    return new Response(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes"><title>管理后台 · 旭儿导航</title>
<link href="https://cdn.staticfile.org/quill/1.3.6/quill.snow.css" rel="stylesheet">
<script src="https://cdn.staticfile.org/quill/1.3.6/quill.js"></script>
<style>
:root {
    --primary: #667eea;
    --primary-dark: #5a67d8;
    --success: #38a169;
    --danger: #e53e3e;
    --warning: #ed8936;
    --gray-50: #f8fafc;
    --gray-100: #f1f5f9;
    --gray-200: #e2e8f0;
    --gray-300: #cbd5e1;
    --gray-600: #475569;
    --gray-800: #1e293b;
    --shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.05);
    --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);
    --radius-lg: 16px;
    --radius-md: 12px;
    --radius-sm: 8px;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;padding:20px}
.container{max-width:1400px;margin:0 auto}
.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:16px 24px;border-radius:var(--radius-lg);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:24px;box-shadow:var(--shadow-md)}
.header h1{font-size:20px;font-weight:600;display:flex;align-items:center;gap:8px}
.header h1:before{content:"⚡"}
.card{background:white;border-radius:var(--radius-lg);padding:24px;margin-bottom:24px;box-shadow:var(--shadow-sm);border:1px solid var(--gray-200)}
.card:hover{box-shadow:var(--shadow-md)}
.card-title{font-size:18px;font-weight:600;color:var(--gray-800);padding-bottom:16px;margin-bottom:20px;border-bottom:2px solid var(--gray-100);display:flex;align-items:center;gap:8px}
.form-group{margin-bottom:16px}
.form-group label{display:block;margin-bottom:6px;font-weight:500;color:var(--gray-600);font-size:13px}
.form-group input,.form-group textarea,.form-group select{width:100%;padding:10px 14px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:14px;transition:all .2s;background:white}
.form-group input:focus,.form-group textarea:focus,.form-group select:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(102,126,234,0.1)}
.form-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:16px}
.form-row input{width:100%;padding:10px 14px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:14px}
.form-row input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(102,126,234,0.1)}
.btn{padding:8px 16px;border-radius:var(--radius-sm);font-weight:500;font-size:13px;border:none;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:6px}
.btn:active{transform:scale(0.97)}
.btn-primary{background:var(--primary);color:white}
.btn-primary:hover{background:var(--primary-dark)}
.btn-success{background:var(--success);color:white}
.btn-success:hover{background:#2f855a}
.btn-danger{background:var(--danger);color:white}
.btn-danger:hover{background:#c53030}
.btn-warning{background:var(--warning);color:white}
.btn-warning:hover{background:#dd6b20}
.btn-secondary{background:var(--gray-200);color:var(--gray-600)}
.btn-secondary:hover{background:var(--gray-300)}
.btn-sm{padding:6px 12px;font-size:12px}
.table-wrapper{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:var(--radius-md);border:1px solid var(--gray-200)}
table{width:100%;min-width:720px;border-collapse:collapse;font-size:14px}
th,td{padding:12px 16px;text-align:left;border-bottom:1px solid var(--gray-200)}
th{background:var(--gray-50);font-weight:600;color:var(--gray-600)}
tr:last-child td{border-bottom:none}
.actions{display:flex;gap:8px;flex-wrap:wrap}
.badge{padding:4px 10px;border-radius:20px;font-size:12px;font-weight:500}
.badge-published{background:#d4edda;color:#155724}
.badge-draft{background:#fff3cd;color:#856404}
.badge-pin{background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px;font-size:11px;margin-left:8px}
.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;justify-content:center;align-items:center;padding:20px}
.modal-content{background:white;border-radius:var(--radius-lg);padding:24px;width:100%;max-width:760px;max-height:90vh;overflow-y:auto}.post-modal-content{max-width:980px}.editor-actions{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}.editor-help{margin-top:8px;color:#718096;font-size:12px;line-height:1.5}.editor-count{float:right;color:#94a3b8;font-weight:400}.ql-toolbar.ql-snow{border-top-left-radius:var(--radius-sm);border-top-right-radius:var(--radius-sm);border-color:var(--gray-200)}.ql-container.ql-snow{border-bottom-left-radius:var(--radius-sm);border-bottom-right-radius:var(--radius-sm);border-color:var(--gray-200)}
.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid var(--gray-100)}
.modal-header h3{font-size:20px;font-weight:600;color:var(--gray-800)}
.close-modal{font-size:28px;cursor:pointer;color:var(--gray-600);transition:color .2s}
.close-modal:hover{color:var(--danger)}
.ql-editor{min-height:420px;font-size:16px;line-height:1.8}.ql-editor img{max-width:100%;height:auto}
.image-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;margin-top:16px}
.image-card{position:relative;border:1px solid var(--gray-200);border-radius:var(--radius-sm);padding:8px;text-align:center;background:var(--gray-50)}
.image-card img{width:100%;height:90px;object-fit:cover;border-radius:6px;cursor:pointer}.image-card .img-name{font-size:10px;color:#64748b;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.image-card .img-ref{font-size:10px;color:#94a3b8;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.image-card .img-delete{position:absolute;top:-8px;right:-8px;background:var(--danger);color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px}
.img-link-row{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin-top:8px}.img-link-btn{border:none;background:#e2e8f0;color:#475569;border-radius:6px;padding:4px 2px;font-size:10px;cursor:pointer}.img-link-btn:hover{background:#cbd5e1}.img-link-btn.primary{background:var(--primary);color:white}
.settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media (max-width:1024px){.container{max-width:100%}.post-modal-content{max-width:96vw}.settings-grid{grid-template-columns:1fr 1fr}.image-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}}@media (max-width:768px){body{padding:10px}.header{padding:12px 16px;align-items:flex-start}.header h1{font-size:16px}.header>div{width:100%;justify-content:flex-start;flex-wrap:wrap}.card{padding:16px;border-radius:14px}.card-title{font-size:16px}.form-row{grid-template-columns:1fr;gap:12px}.settings-grid{grid-template-columns:1fr;gap:16px}.table-wrapper{margin-left:-4px;margin-right:-4px}.post-modal-content{max-width:100%}.modal{align-items:flex-start;padding:8px}.modal-content{padding:16px;border-radius:14px;max-height:calc(100dvh - 16px)}.modal-header{position:sticky;top:-16px;z-index:3;background:white;margin:-16px -16px 16px;padding:12px 16px;border-top-left-radius:14px;border-top-right-radius:14px}.editor-actions .btn{flex:1;justify-content:center;min-width:130px}.ql-toolbar.ql-snow{overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch}.ql-editor{min-height:45vh;font-size:15px}.image-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}.image-card img{height:96px}.img-link-row{grid-template-columns:repeat(2,1fr)}th,td{padding:10px 12px;font-size:13px}.btn-sm{padding:7px 10px;font-size:12px}}@media (max-width:480px){body{padding:8px}.header{flex-direction:column;align-items:stretch;border-radius:14px}.header>div{display:grid!important;grid-template-columns:1fr 1fr;gap:8px}.header>div a{grid-column:1 / -1;text-align:center}.btn{justify-content:center}.card{padding:14px}.modal{padding:0}.modal-content{max-height:100dvh;border-radius:0}.post-modal-content{height:100dvh}.modal-header{top:-16px;border-radius:0}.ql-editor{min-height:calc(100dvh - 410px);font-size:14px}.editor-help{font-size:11px}.image-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.image-card{padding:6px}.image-card img{height:82px}.img-link-btn{font-size:10px;padding:5px 2px}.settings-grid input,.form-group input,.form-group textarea,.form-group select{font-size:16px}.actions .btn{flex:1}.table-wrapper:before{content:'可左右滑动表格';display:block;padding:8px 10px;color:#94a3b8;font-size:12px;background:var(--gray-50);border-bottom:1px solid var(--gray-200)}}
</style></head>
<body><div class="container">
<div class="header"><h1>旭儿导航 · 管理后台</h1><div style="display:flex;gap:10px"><button id="changePwdBtn" class="btn btn-warning btn-sm">🔑 修改密码</button><button id="manageImagesBtn" class="btn btn-primary btn-sm">🖼️ 图片管理</button><a href="/logout" style="background:rgba(255,255,255,0.2);color:white;padding:6px 14px;border-radius:8px;text-decoration:none;font-size:13px">退出</a></div></div>

<!-- 1. 文章管理（表单在上，列表在下） -->
<div class="card"><div class="card-title"><span>📝</span> 文章管理</div>
<div style="margin-bottom:20px"><button id="newPostBtn" class="btn btn-success">✏️ 写新文章</button></div>
<div class="table-wrapper"><table><thead><tr><th>ID</th><th>标题</th><th>分类</th><th>状态</th><th>日期</th><th>操作</th></tr></thead><tbody id="postsList"></tbody></table></div>
</div>

<!-- 2. 书签管理（表单在上，列表在下） -->
<div class="card"><div class="card-title"><span>🔖</span> 书签管理</div>
<div class="form-row">
    <input type="text" id="siteName" placeholder="网站名称">
    <input type="url" id="siteUrl" placeholder="网址">
    <input type="text" id="siteCat" placeholder="分类">
    <input type="number" id="siteSort" placeholder="排序" value="9999">
</div>
<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
    <input type="url" id="siteLogo" placeholder="Logo URL" style="flex:1;padding:10px 14px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:14px">
    <button id="selectSiteLogoBtn" class="btn btn-secondary btn-sm">🖼️ 从图库选择</button>
</div>
<textarea id="siteDesc" rows="2" placeholder="描述" style="width:100%;margin-bottom:16px;padding:10px 14px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:14px;font-family:inherit"></textarea>
<button id="addSiteBtn" class="btn btn-primary">➕ 添加书签</button>
<div class="table-wrapper" style="margin-top:20px"><table><thead><tr><th>ID</th><th>名称</th><th>网址</th><th>分类</th><th>排序</th><th>操作</th></tr></thead><tbody id="sitesList"></tbody></table></div>
</div>

<!-- 3. 站点设置（放在最底部） -->
<div class="card"><div class="card-title"><span>⚙️</span> 站点设置</div>
<div class="settings-grid">
    <div><label style="font-size:13px;font-weight:500;color:var(--gray-600);margin-bottom:4px;display:block">站点标题</label><input type="text" id="siteTitle" value="${escapeHtml(siteTitle)}" style="width:100%;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;font-size:14px"></div>
    <div><label style="font-size:13px;font-weight:500;color:var(--gray-600);margin-bottom:4px;display:block">站点副标题</label><input type="text" id="siteSubtitle" value="${escapeHtml(siteSubtitle)}" style="width:100%;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;font-size:14px"></div>
    <div><label style="font-size:13px;font-weight:500;color:var(--gray-600);margin-bottom:4px;display:block">Logo URL</label><input type="url" id="logoUrl" value="${escapeHtml(siteLogo)}" style="width:100%;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:6px;font-size:14px"><button id="selectLogoBtn" class="btn btn-secondary btn-sm" style="width:100%">从图库选择</button></div>
    <div><label style="font-size:13px;font-weight:500;color:var(--gray-600);margin-bottom:4px;display:block">Logo 跳转链接</label><input type="url" id="logoLink" value="${escapeHtml(siteLogoLink)}" style="width:100%;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;font-size:14px"></div>
    <div><label style="font-size:13px;font-weight:500;color:var(--gray-600);margin-bottom:4px;display:block">页眉背景图</label><input type="url" id="headerBgUrl" value="${escapeHtml(headerBg)}" style="width:100%;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:6px;font-size:14px"><button id="selectHeaderBgBtn" class="btn btn-secondary btn-sm" style="width:100%">从图库选择</button></div>
    <div><label style="font-size:13px;font-weight:500;color:var(--gray-600);margin-bottom:4px;display:block">国内线路链接</label><input type="url" id="cnLink" value="${escapeHtml(cnLink)}" style="width:100%;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;font-size:14px"></div>
</div>
<div style="margin-top:20px"><button id="saveSettingsBtn" class="btn btn-primary">💾 保存设置</button><span id="settingsStatus" style="margin-left:16px;font-size:13px;color:var(--success)"></span></div>
</div></div>

<!-- 文章编辑模态框 -->
<div id="postModal" class="modal"><div class="modal-content post-modal-content"><div class="modal-header"><h3 id="modalTitle">写新文章</h3><span class="close-modal close-post-modal">&times;</span></div><input type="hidden" id="postId"><div class="form-group"><label>标题 <span id="postWordCount" class="editor-count">0 字</span></label><input type="text" id="postTitle" placeholder="文章标题"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px"><div><label>分类</label><input type="text" id="postCategory" placeholder="分类"></div><div><label>状态</label><select id="postStatus"><option value="published">发布</option><option value="draft">草稿</option></select></div></div><div class="form-group"><label>封面图（首页列表显示）</label><input type="url" id="postCoverImage" style="margin-bottom:8px;padding:10px 14px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:14px;width:100%"><button id="selectCoverFromImagesBtn" class="btn btn-secondary btn-sm" style="width:100%">🖼️ 从图库选择封面</button></div><div class="form-group"><label>摘要</label><textarea id="postExcerpt" rows="2" placeholder="简短摘要；留空时系统会自动截取正文前150字"></textarea></div><div class="form-group"><label>内容</label><div class="editor-actions"><button type="button" id="insertUploadedImageBtn" class="btn btn-secondary btn-sm">🖼️ 插入已上传图片</button><button type="button" id="insertImageUrlBtn" class="btn btn-secondary btn-sm">🔗 插入图片 URL</button></div><div id="quill-editor"></div><textarea id="postContent" style="display:none"></textarea><div class="editor-help">工具栏已支持标题、引用、代码块、颜色、对齐、缩进、列表、链接和图片。点击工具栏图片按钮或“插入已上传图片”可以把图库图片插入正文。</div></div><div class="form-group"><label>标签</label><input type="text" id="postTags" placeholder="技术,生活；多个标签用英文逗号分隔"></div><div class="form-group"><label><input type="checkbox" id="postPinned"> 📌 置顶文章</label></div><div style="display:flex;justify-content:flex-end;gap:12px;margin-top:20px;flex-wrap:wrap"><button id="previewPostBtn" class="btn btn-secondary">预览</button><button id="cancelPostBtn" class="btn btn-secondary">取消</button><button id="savePostBtn" class="btn btn-success">发布</button></div></div></div>

<!-- 修改密码模态框 -->
<div id="changePwdModal" class="modal"><div class="modal-content" style="max-width:400px"><div class="modal-header"><h3>🔑 修改密码</h3><span class="close-modal close-pwd-modal">&times;</span></div><div class="form-group"><label>原密码</label><input type="password" id="oldPassword"></div><div class="form-group"><label>新密码</label><input type="password" id="newPassword"></div><div class="form-group"><label>确认新密码</label><input type="password" id="confirmPassword"></div><div style="display:flex;justify-content:flex-end;gap:12px"><button id="cancelPwdBtn" class="btn btn-secondary">取消</button><button id="confirmPwdBtn" class="btn btn-primary">确认修改</button></div></div></div>

<!-- 图片管理模态框 -->
<div id="imagesModal" class="modal"><div class="modal-content" style="max-width:820px"><div class="modal-header"><h3 id="imagesModalTitle">🖼️ 图片管理</h3><span class="close-modal close-images-modal">&times;</span></div><div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap"><button id="uploadNewImageBtn" class="btn btn-success" style="flex:1;min-width:180px">📤 上传新图片（≤700KB）</button><button id="refreshImagesBtn" class="btn btn-secondary" style="min-width:120px">刷新图库</button></div><div id="imageListContainer" class="image-grid"><div style="text-align:center;padding:40px;color:#999">加载中...</div></div><div id="imagePickerHint" style="margin-top:12px;text-align:center;color:#718096;font-size:12px">点击图片选择；EdgeOne KV-only 版建议单图≤700KB；每张图自动生成 URL、Markdown、HTML、BBCode 外链；仍被引用的图片不会被误删</div></div></div>

<input type="file" id="imageUploadInput" accept="image/*" style="display:none">

<script>
let allPosts = ${safeJson(posts)};
let allSites = ${safeJson(sites)};
let quill = null;
let currentSelectTarget = null;
let currentImageMode = 'manage';
let editPostId = null;
let editSiteId = null;

function escape(str){if(str===undefined||str===null)return '';return String(str).replace(/[&<>"']/g,function(m){if(m==='&')return'&amp;';if(m==='<')return'&lt;';if(m==='>')return'&gt;';if(m==='"')return'&quot;';return'&#39;';});}
function textOfHtml(html){let div=document.createElement('div');div.innerHTML=html||'';return (div.textContent||div.innerText||'').replace(/\s+/g,' ').trim();}
function updateWordCount(){let el=document.getElementById('postWordCount');if(!el)return;let text=quill?quill.getText().trim():textOfHtml(document.getElementById('postContent').value);el.innerText=text.length+' 字';}
function initQuill(){
    if(quill)return;
    let toolbarOptions=[
        [{header:[1,2,3,4,false]}],
        ['bold','italic','underline','strike'],
        ['blockquote','code-block'],
        [{list:'ordered'},{list:'bullet'}],
        [{script:'sub'},{script:'super'}],
        [{indent:'-1'},{indent:'+1'}],
        [{color:[]},{background:[]}],
        [{align:[]}],
        ['link','image'],
        ['clean']
    ];
    quill=new Quill('#quill-editor',{theme:'snow',placeholder:'写下你的文章内容...',modules:{toolbar:{container:toolbarOptions,handlers:{image:function(){openImagesModal('__editor__');}}}}});
    quill.on('text-change',()=>{document.getElementById('postContent').value=quill.root.innerHTML;updateWordCount();});
    updateWordCount();
}
function renderPosts(){let sorted=[...allPosts];sorted.sort((a,b)=>{if(a.pinned&&!b.pinned)return-1;if(!a.pinned&&b.pinned)return 1;return b.id-a.id;});let html='';for(let p of sorted){html+='<tr><td>'+p.id+'</td><td><strong>'+escape(p.title)+'</strong>'+(p.pinned?'<span class="badge-pin">置顶</span>':'')+'</td><td>'+escape(p.category||'未分类')+'</td><td><span class="badge '+(p.status==='published'?'badge-published':'badge-draft')+'">'+(p.status==='published'?'已发布':'草稿')+'</span></td><td>'+new Date(p.createdAt).toLocaleDateString()+'</td><td class="actions"><button class="btn btn-warning btn-sm" onclick="editPost('+p.id+')">编辑</button><button class="btn btn-danger btn-sm" onclick="deletePost('+p.id+')">删除</button></td></tr>';}document.getElementById('postsList').innerHTML=html;}
function renderSites(){let html='';for(let s of allSites){html+='<tr><td>'+s.id+'</td><td><strong>'+escape(s.name)+'</strong></td><td><a href="'+escape(s.url)+'" target="_blank" rel="noopener noreferrer" style="color:#667eea">'+escape(s.url).substring(0,40)+'</a></td><td>'+escape(s.catelog)+'</td><td>'+(s.sort_order||9999)+'</td><td class="actions"><button class="btn btn-warning btn-sm" onclick="editSite('+s.id+')">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteSite('+s.id+')">删除</button></td></tr>';}document.getElementById('sitesList').innerHTML=html;}
function editPost(id){let p=allPosts.find(p=>p.id==id);if(p){editPostId=id;initQuill();document.getElementById('postId').value=p.id;document.getElementById('postTitle').value=p.title;document.getElementById('postCategory').value=p.category||'';document.getElementById('postCoverImage').value=p.coverImage||'';document.getElementById('postExcerpt').value=p.excerpt||'';document.getElementById('postStatus').value=p.status||'published';document.getElementById('postTags').value=(p.tags||[]).join(',');document.getElementById('postPinned').checked=p.pinned||false;quill.root.innerHTML=p.content||'';document.getElementById('postContent').value=quill.root.innerHTML;document.getElementById('modalTitle').innerText='编辑文章';document.getElementById('savePostBtn').innerText='更新';updateWordCount();document.getElementById('postModal').style.display='flex';}}
function editSite(id){let s=allSites.find(s=>s.id==id);if(s){editSiteId=id;document.getElementById('siteName').value=s.name;document.getElementById('siteUrl').value=s.url;document.getElementById('siteCat').value=s.catelog;document.getElementById('siteSort').value=s.sort_order||9999;document.getElementById('siteLogo').value=s.logo||'';document.getElementById('siteDesc').value=s.desc||'';document.getElementById('addSiteBtn').innerHTML='✏️ 更新书签';}}
function clearSiteForm(){editSiteId=null;document.getElementById('siteName').value='';document.getElementById('siteUrl').value='';document.getElementById('siteCat').value='';document.getElementById('siteSort').value='9999';document.getElementById('siteLogo').value='';document.getElementById('siteDesc').value='';document.getElementById('addSiteBtn').innerHTML='➕ 添加书签';}
function closePostModal(){document.getElementById('postModal').style.display='none';editPostId=null;document.getElementById('savePostBtn').innerText='发布';document.getElementById('modalTitle').innerText='写新文章';}
function closeImagesModal(){document.getElementById('imagesModal').style.display='none';currentSelectTarget=null;currentImageMode='manage';}
function insertImageIntoEditor(url){if(!url)return;initQuill();let range=quill.getSelection(true);if(!range)range={index:quill.getLength(),length:0};quill.insertEmbed(range.index,'image',url,'user');quill.insertText(range.index+1,String.fromCharCode(10),'user');quill.setSelection(range.index+2,0,'user');document.getElementById('postContent').value=quill.root.innerHTML;updateWordCount();}
async function savePost(){if(quill)document.getElementById('postContent').value=quill.root.innerHTML;let data={title:document.getElementById('postTitle').value.trim(),category:document.getElementById('postCategory').value.trim(),coverImage:document.getElementById('postCoverImage').value.trim(),excerpt:document.getElementById('postExcerpt').value.trim(),content:document.getElementById('postContent').value,status:document.getElementById('postStatus').value,tags:document.getElementById('postTags').value.split(',').map(t=>t.trim()).filter(t=>t),pinned:document.getElementById('postPinned').checked};if(!data.title||!textOfHtml(data.content)){alert('请填写标题和内容');return;}let url=editPostId?'/api/blog/'+editPostId:'/api/blog';let method=editPostId?'PUT':'POST';let r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});let d=await r.json().catch(()=>({}));if(d.code===200||d.code===201){alert(editPostId?'更新成功':'发布成功');closePostModal();location.reload();}else alert(d.message||'操作失败');}
function previewPost(){if(quill)document.getElementById('postContent').value=quill.root.innerHTML;let title=document.getElementById('postTitle').value.trim()||'文章预览';let content=document.getElementById('postContent').value||'<p>暂无内容</p>';let w=window.open('','_blank');if(!w){alert('浏览器拦截了预览窗口');return;}w.document.open();w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+escape(title)+'</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f5f7fa;padding:24px}.article{max-width:900px;margin:0 auto;background:#fff;border-radius:20px;padding:40px}.content{line-height:1.8;font-size:16px}.content img{max-width:100%;height:auto;display:block;margin:20px auto;border-radius:8px}.content blockquote{border-left:4px solid #667eea;margin:16px 0;padding:8px 16px;background:#f8fafc;color:#475569}.content pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:10px;overflow:auto}@media (max-width:768px){body{padding:12px}.article{padding:20px;border-radius:14px}.content{font-size:15px}}@media (max-width:480px){body{padding:8px}.article{padding:16px;border-radius:12px}.content{font-size:14px}}</style></head><body><div class="article"><h1>'+escape(title)+'</h1><div class="content">'+content+'</div></div></body></html>');w.document.close();}
async function deletePost(id){if(!confirm('确定删除？系统会同时清理文章浏览量等关联 KV；正文/封面图片如果没有被其它内容引用才会删除。'))return;let r=await fetch('/api/blog/'+id,{method:'DELETE'});let d=await r.json().catch(()=>({}));if(r.ok&&d.code===200){let c=d.cleanup||{};let msg='删除成功';if(c.deletedImages&&c.deletedImages.length)msg+=String.fromCharCode(10)+'已删除未被引用图片：'+c.deletedImages.length+' 张';if(c.preservedImages&&c.preservedImages.length)msg+=String.fromCharCode(10)+'已保留仍被引用图片：'+c.preservedImages.length+' 张';alert(msg);location.reload();}else alert(d.message||'删除失败');}
async function addOrUpdateSite(){let name=document.getElementById('siteName').value.trim();let url=document.getElementById('siteUrl').value.trim();let catelog=document.getElementById('siteCat').value.trim();let logo=document.getElementById('siteLogo').value.trim();let desc=document.getElementById('siteDesc').value.trim();let sort_order=parseInt(document.getElementById('siteSort').value)||9999;if(!name||!url||!catelog){alert('请填写完整');return;}if(editSiteId){let r=await fetch('/api/config/'+editSiteId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,url,catelog,logo,desc,sort_order})});if(r.ok){alert('更新成功');location.reload();}else alert('更新失败');}else{let r=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,url,catelog,logo,desc,sort_order})});if(r.ok)location.reload();else alert('添加失败');}}
async function deleteSite(id){if(!confirm('确定删除？'))return;let r=await fetch('/api/config/'+id,{method:'DELETE'});if(r.ok){alert('删除成功');location.reload();}else alert('删除失败');}
async function saveSettings(){let data={title:document.getElementById('siteTitle').value,subtitle:document.getElementById('siteSubtitle').value,logo:document.getElementById('logoUrl').value,logoLink:document.getElementById('logoLink').value,headerBg:document.getElementById('headerBgUrl').value,cnLink:document.getElementById('cnLink').value};let r=await fetch('/api/site-info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(r.ok){document.getElementById('settingsStatus').innerText='保存成功';setTimeout(()=>document.getElementById('settingsStatus').innerText='',2000);}else alert('保存失败');}
async function changePassword(){let oldPwd=document.getElementById('oldPassword').value;let newPwd=document.getElementById('newPassword').value;let confirmPwd=document.getElementById('confirmPassword').value;if(newPwd!==confirmPwd){alert('密码不一致');return;}if(newPwd.length<4){alert('密码至少4位');return;}let r=await fetch('/api/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({old_password:oldPwd,new_password:newPwd})});let d=await r.json();if(d.code===200){alert('修改成功，请重新登录');window.location.href='/logout';}else alert(d.message);}
function selectImageUrl(url){if(currentImageMode==='editor'){insertImageIntoEditor(url);closeImagesModal();alert('已插入正文');return;}if(currentImageMode==='input'&&currentSelectTarget){document.getElementById(currentSelectTarget).value=url;closeImagesModal();alert('已选择');return;}copyText(url,'已复制 URL');}
function imgLink(img,type){let links=img.links||{};if(type==='absolute')return links.absolute||img.absoluteUrl||img.url;if(type==='markdown')return links.markdown||('![]('+(links.absolute||img.url)+')');if(type==='html')return links.html||('<img src="'+(links.absolute||img.url)+'" alt="">');if(type==='bbcode')return links.bbcode||('[img]'+(links.absolute||img.url)+'[/img]');return img.url;}
async function loadImages(){let box=document.getElementById('imageListContainer');box.innerHTML='<div style="text-align:center;padding:40px;color:#999">加载中...</div>';let r=await fetch('/api/images');let d=await r.json().catch(()=>({}));if(d.code===200&&d.images){let html='';for(let img of d.images){let refs=Array.isArray(img.references)?img.references:[];let refText=refs.length?('被引用 '+refs.length+' 处'):'未引用';html+='<div class="image-card"><img src="'+escape(img.url)+'" data-url="'+escape(img.url)+'" alt=""><div class="img-delete" data-key="'+escape(img.key)+'">✕</div><div class="img-name" title="'+escape(img.name||img.key)+'">'+escape(img.name||img.key)+'</div><div class="img-ref" title="'+escape(refs.join('；'))+'">'+escape(refText)+'</div><div class="img-link-row"><button class="img-link-btn primary" data-copy="'+escape(imgLink(img,'absolute'))+'">URL</button><button class="img-link-btn" data-copy="'+escape(imgLink(img,'markdown'))+'">MD</button><button class="img-link-btn" data-copy="'+escape(imgLink(img,'html'))+'">HTML</button><button class="img-link-btn" data-copy="'+escape(imgLink(img,'bbcode'))+'">BB</button></div></div>';}box.innerHTML=html||'<div style="text-align:center;padding:40px">暂无图片</div>';document.querySelectorAll('.image-card img').forEach(img=>{img.onclick=()=>selectImageUrl(img.dataset.url);});document.querySelectorAll('.img-link-btn').forEach(btn=>{btn.onclick=(e)=>{e.stopPropagation();copyText(btn.dataset.copy,'已复制');};});document.querySelectorAll('.img-delete').forEach(btn=>{btn.onclick=(e)=>{e.stopPropagation();deleteImage(btn.dataset.key,btn);};});}else{box.innerHTML='<div style="text-align:center;padding:40px">加载失败</div>';}}
async function copyText(text,msg){await navigator.clipboard.writeText(text||'');alert(msg||'已复制');}
async function copyImageUrl(url){await copyText(url,'已复制 URL');}
async function deleteImage(key,btnEl){if(!confirm('确定删除？如果图片仍被文章、书签或站点设置引用，系统会自动保留。'))return;let r=await fetch('/api/images/'+encodeURIComponent(key),{method:'DELETE'});let d=await r.json().catch(()=>({}));if(r.ok&&d.code===200){btnEl.closest('.image-card').remove();alert('删除成功');}else alert(d.message||'删除失败');}
async function uploadNewImage(){let input=document.getElementById('imageUploadInput');input.onchange=async(e)=>{let file=e.target.files[0];if(!file)return;if(file.size>700*1024){alert('EdgeOne KV-only 版单张图片不能超过700KB，请先压缩后再上传。');input.value='';return;}let fd=new FormData();fd.append('image',file);let r=await fetch('/api/upload',{method:'POST',body:fd});let d=await r.json().catch(()=>({}));if(d.code===200&&d.url){if(currentImageMode==='editor'){insertImageIntoEditor(d.url);closeImagesModal();alert('上传成功，已插入正文');}else if(currentImageMode==='input'&&currentSelectTarget){document.getElementById(currentSelectTarget).value=d.url;closeImagesModal();alert('上传成功，已填入');}else{alert('上传成功，已生成 URL / Markdown / HTML / BBCode 外链，可在图库中复制。');loadImages();}}else alert(d.message||'上传失败');input.value='';};input.click();}
function openImagesModal(targetId){currentSelectTarget=targetId||null;currentImageMode=targetId==='__editor__'?'editor':(targetId?'input':'manage');let title=document.getElementById('imagesModalTitle');let hint=document.getElementById('imagePickerHint');if(currentImageMode==='editor'){title.innerText='🖼️ 插入正文图片';hint.innerText='点击图片即可插入到当前光标位置；也可以先上传新图片，上传后会自动插入正文。下方按钮可复制 URL / Markdown / HTML / BBCode。';}else if(currentImageMode==='input'){title.innerText='🖼️ 选择图片';hint.innerText='点击图片会填入当前 URL 输入框；也可复制 URL / Markdown / HTML / BBCode 外链。';}else{title.innerText='🖼️ 图片管理';hint.innerText='EdgeOne KV-only 版建议单图≤700KB；每张图自动生成 URL、Markdown、HTML、BBCode 外链；仍被文章、书签或站点设置引用的图片不会被误删。';}document.getElementById('imagesModal').style.display='flex';loadImages();}
document.getElementById('newPostBtn').onclick=()=>{editPostId=null;clearSiteForm();initQuill();document.getElementById('postId').value='';document.getElementById('postTitle').value='';document.getElementById('postCategory').value='';document.getElementById('postCoverImage').value='';document.getElementById('postExcerpt').value='';document.getElementById('postStatus').value='published';document.getElementById('postTags').value='';document.getElementById('postPinned').checked=false;quill.root.innerHTML='';document.getElementById('postContent').value='';document.getElementById('modalTitle').innerText='写新文章';document.getElementById('savePostBtn').innerText='发布';updateWordCount();document.getElementById('postModal').style.display='flex';};
document.getElementById('cancelPostBtn').onclick=closePostModal;
document.querySelector('.close-post-modal').onclick=closePostModal;
document.getElementById('savePostBtn').onclick=savePost;
document.getElementById('previewPostBtn').onclick=previewPost;
document.getElementById('insertUploadedImageBtn').onclick=()=>{initQuill();openImagesModal('__editor__');};
document.getElementById('insertImageUrlBtn').onclick=()=>{let url=prompt('请输入图片 URL');if(url&&url.trim())insertImageIntoEditor(url.trim());};
document.getElementById('saveSettingsBtn').onclick=saveSettings;
document.getElementById('selectLogoBtn').onclick=()=>openImagesModal('logoUrl');
document.getElementById('selectHeaderBgBtn').onclick=()=>openImagesModal('headerBgUrl');
document.getElementById('selectCoverFromImagesBtn').onclick=()=>openImagesModal('postCoverImage');
document.getElementById('selectSiteLogoBtn').onclick=()=>openImagesModal('siteLogo');
document.getElementById('addSiteBtn').onclick=addOrUpdateSite;
document.getElementById('changePwdBtn').onclick=()=>document.getElementById('changePwdModal').style.display='flex';
document.querySelector('.close-pwd-modal').onclick=()=>document.getElementById('changePwdModal').style.display='none';
document.getElementById('cancelPwdBtn').onclick=()=>document.getElementById('changePwdModal').style.display='none';
document.getElementById('confirmPwdBtn').onclick=changePassword;
document.getElementById('manageImagesBtn').onclick=()=>openImagesModal(null);
document.querySelector('.close-images-modal').onclick=closeImagesModal;
document.getElementById('uploadNewImageBtn').onclick=uploadNewImage;
document.getElementById('refreshImagesBtn').onclick=loadImages;
window.onclick=(e)=>{if(e.target.classList.contains('modal')){document.getElementById('postModal').style.display='none';document.getElementById('changePwdModal').style.display='none';closeImagesModal();}};
renderPosts();renderSites();
</script></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ==================== API ====================
async function handleApi(request, kv) {
    const url = new URL(request.url);
    const path = url.pathname;
    const admin = await isAdmin(request, kv);
    const publicRead = request.method === 'GET' && (path === '/api/config' || path === '/api/blog' || path === '/api/site-info');

    if (!publicRead && !admin) {
        return jsonResponse({ code: 401, message: '未登录' }, 401);
    }
    
    if (request.method === 'GET' && path === '/api/config') {
        let sites = [];
        try { const data = await kv.get('sites'); if (data) sites = JSON.parse(data); } catch(e) { }
        sites.sort((a, b) => (a.sort_order || 9999) - (b.sort_order || 9999));
        return new Response(JSON.stringify({ code: 200, data: sites }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method === 'POST' && path === '/api/config') {
        const body = await request.json();
        let sites = [];
        try { const data = await kv.get('sites'); if (data) sites = JSON.parse(data); } catch(e) { }
        const newId = sites.length ? Math.max(...sites.map(s => s.id)) + 1 : 1;
        sites.push({ id: newId, name: body.name, url: body.url, catelog: body.catelog, logo: body.logo || '', desc: body.desc || '', sort_order: body.sort_order || 9999 });
        sites.sort((a, b) => (a.sort_order || 9999) - (b.sort_order || 9999));
        await kv.put('sites', JSON.stringify(sites));
        return new Response(JSON.stringify({ code: 201 }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method === 'PUT' && path.startsWith('/api/config/')) {
        const id = parseInt(path.split('/')[3]);
        const body = await request.json();
        let sites = [];
        try { const data = await kv.get('sites'); if (data) sites = JSON.parse(data); } catch(e) { }
        const idx = sites.findIndex(s => s.id === id);
        if (idx !== -1) {
            sites[idx] = { ...sites[idx], name: body.name, url: body.url, catelog: body.catelog, logo: body.logo || '', desc: body.desc || '', sort_order: body.sort_order || 9999 };
            sites.sort((a, b) => (a.sort_order || 9999) - (b.sort_order || 9999));
            await kv.put('sites', JSON.stringify(sites));
        }
        return new Response(JSON.stringify({ code: 200 }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method === 'DELETE' && path.startsWith('/api/config/')) {
        const id = parseInt(path.split('/')[3]);
        let sites = [];
        try { const data = await kv.get('sites'); if (data) sites = JSON.parse(data); } catch(e) { }
        const deletedSite = sites.find(s => s.id === id);
        const remainingSites = sites.filter(s => s.id !== id);
        if (deletedSite) await cleanupDetachedImages(kv, extractImageKeysFromSite(deletedSite), { sites: remainingSites });
        await kv.put('sites', JSON.stringify(remainingSites));
        return jsonResponse({ code: 200 });
    }
    if (request.method === 'GET' && path === '/api/blog') {
        let posts = [];
        try { const data = await kv.get('blog_posts'); if (data) posts = JSON.parse(data); } catch(e) { }
        if (!admin) posts = posts.filter(p => p.status === 'published');
        posts.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return b.id - a.id;
        });
        return new Response(JSON.stringify({ code: 200, data: posts }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method === 'POST' && path === '/api/blog') {
        const body = await request.json();
        let posts = [];
        try { const data = await kv.get('blog_posts'); if (data) posts = JSON.parse(data); } catch(e) { }
        const baseSlug = (body.title || 'post').replace(/[^\w\u4e00-\u9fa5]+/g, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'post';
        let slug = baseSlug;
        let suffix = 1;
        let maxIter = 100;
        while (posts.some(p => p.slug === slug) && maxIter-- > 0) { slug = baseSlug + '-' + (suffix++); }
        const plainContent = (body.content || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const excerpt = (body.excerpt && body.excerpt.trim()) ? body.excerpt.trim() : plainContent.substring(0, 150);
        const newPost = { 
            id: Date.now(), slug: slug, title: body.title || '无标题', content: body.content || '',
            category: body.category || '未分类', coverImage: body.coverImage || '', excerpt: excerpt,
            status: body.status || 'published', tags: Array.isArray(body.tags) ? body.tags : [],
            pinned: body.pinned === true || body.pinned === 'true',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        posts.push(newPost);
        await kv.put('blog_posts', JSON.stringify(posts));
        return new Response(JSON.stringify({ code: 201 }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method === 'PUT' && path.startsWith('/api/blog/')) {
        const id = parseInt(path.split('/')[3]);
        const body = await request.json();
        let posts = [];
        try { const data = await kv.get('blog_posts'); if (data) posts = JSON.parse(data); } catch(e) { }
        const idx = posts.findIndex(p => p.id === id);
        if (idx !== -1) {
            posts[idx] = { ...posts[idx], ...body, updatedAt: new Date().toISOString() };
            await kv.put('blog_posts', JSON.stringify(posts));
        }
        return new Response(JSON.stringify({ code: 200 }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method === 'DELETE' && path.startsWith('/api/blog/')) {
        const id = parseInt(path.split('/')[3]);
        if (!Number.isFinite(id)) return jsonResponse({ code: 400, message: '文章 ID 非法' }, 400);
        let posts = [];
        try { const data = await kv.get('blog_posts'); if (data) posts = JSON.parse(data); } catch(e) { }
        const deletedPost = posts.find(p => p.id === id);
        if (!deletedPost) return jsonResponse({ code: 404, message: '文章不存在' }, 404);
        const remainingPosts = posts.filter(p => p.id !== id);
        const cleanup = await cleanupDeletedPostData(kv, deletedPost, remainingPosts);
        await kv.put('blog_posts', JSON.stringify(remainingPosts));
        return jsonResponse({ code: 200, message: '删除成功', cleanup });
    }
    if (request.method === 'GET' && path === '/api/site-info') {
        const title = await kv.get('site_title') || '';
        const subtitle = await kv.get('site_subtitle') || '';
        const logo = await kv.get('site_logo') || '';
        const logoLink = await kv.get('site_logo_link') || '';
        const headerBg = await kv.get('header_bg') || '';
        const cnLink = await kv.get('cn_link') || '';
        return new Response(JSON.stringify({ title, subtitle, logo, logoLink, headerBg, cnLink }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method === 'POST' && path === '/api/site-info') {
        const body = await request.json();
        if (body.title !== undefined) await kv.put('site_title', body.title);
        if (body.subtitle !== undefined) await kv.put('site_subtitle', body.subtitle);
        if (body.logo !== undefined) await kv.put('site_logo', body.logo);
        if (body.logoLink !== undefined) await kv.put('site_logo_link', body.logoLink);
        if (body.headerBg !== undefined) await kv.put('header_bg', body.headerBg);
        if (body.cnLink !== undefined) await kv.put('cn_link', body.cnLink);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method === 'POST' && path === '/api/change-password') {
        const body = await request.json();
        const adminPass = await kv.get('admin_password') || 'admin123';
        if (body.old_password !== adminPass) {
            return new Response(JSON.stringify({ code: 401, message: '原密码错误' }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (body.new_password.length < 4) {
            return new Response(JSON.stringify({ code: 400, message: '新密码长度至少4位' }), { headers: { 'Content-Type': 'application/json' } });
        }
        await kv.put('admin_password', body.new_password);
        return new Response(JSON.stringify({ code: 200, message: '修改成功' }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ code: 404 }), { status: 404 });
}

// ==================== 上传 ====================
async function handleUpload(request, kv) {
    if (!(await isAdmin(request, kv))) return jsonResponse({ code: 401, message: '未登录' }, 401);
    if (request.method !== 'POST') return new Response(JSON.stringify({ code: 405 }), { status: 405 });
    
    try {
        const formData = await request.formData();
        const file = formData.get('image');
        if (!file || !file.size) {
            return new Response(JSON.stringify({ code: 400, message: '请选择图片文件' }), { headers: { 'Content-Type': 'application/json' } });
        }
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            return new Response(JSON.stringify({ code: 400, message: '不支持的图片格式' }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (file.size > EDGEONE_IMAGE_MAX_BYTES) {
            return jsonResponse({ code: 400, message: 'EdgeOne KV-only 版单张图片不能超过700KB。请先压缩图片后再上传。' }, 400);
        }
        const bytes = await file.arrayBuffer();
        const uint8 = new Uint8Array(bytes);
        let binary = '';
        const chunkSize = 64000;
        for (let i = 0; i < uint8.length; i += chunkSize) {
            const chunk = uint8.subarray(i, i + chunkSize);
            const chunkStr = Array.from(chunk, byte => String.fromCharCode(byte)).join('');
            binary += chunkStr;
        }
        const base64 = btoa(binary);
        const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
        const ext = extMap[file.type] || 'jpg';
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const filename = `${timestamp}_${random}.${ext}`;
        const links = buildImageLinks(request, filename, file.name || filename);
        await kv.put(imageDataKey(filename), `data:${file.type};base64,${base64}`);
        await kv.put(imageMetaKey(filename), JSON.stringify({
            key: filename,
            originalName: file.name || filename,
            type: file.type,
            size: file.size,
            createdAt: new Date().toISOString(),
            storage: 'edgeone-kv-only'
        }));
        await addImageToIndex(kv, filename);
        return jsonResponse({ code: 200, url: links.relative, absoluteUrl: links.absolute, links });
    } catch(e) {
        return new Response(JSON.stringify({ code: 500, message: '上传失败: ' + e.message }), { headers: { 'Content-Type': 'application/json' } });
    }
}

async function handleImage(request, kv) {
    const url = new URL(request.url);
    const filename = url.pathname.split('/').pop();
    if (!filename) return new Response('Not found', { status: 404 });
    const data = await kv.get(imageDataKey(filename));
    if (!data) return new Response('Not found', { status: 404 });
    const match = data.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return new Response('Invalid image data', { status: 500 });
    return new Response(Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)), {
        headers: { 'Content-Type': match[1], 'Cache-Control': 'public, max-age=86400' }
    });
}

async function handleImagesApi(request, kv) {
    if (!(await isAdmin(request, kv))) return jsonResponse({ code: 401, message: '未登录' }, 401);
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/api/images') {
        try {
            const images = [];
            const filenames = await listAllImageFilenames(kv);
            const referenceIndex = await buildImageReferenceIndex(kv);
            for (const filename of filenames) {
                if (!isSafeImageKey(filename)) continue;
                const meta = await getImageMeta(kv, filename);
                const links = buildImageLinks(request, filename, meta.originalName || filename);
                images.push({
                    key: filename,
                    url: links.relative,
                    absoluteUrl: links.absolute,
                    name: meta.originalName || filename,
                    type: meta.type || '',
                    size: meta.size || 0,
                    createdAt: meta.createdAt || '',
                    links,
                    references: referenceIndex.get(filename) || []
                });
                if (images.length >= 1000) break;
            }
            images.sort((a, b) => (b.createdAt || b.key).localeCompare(a.createdAt || a.key));
            return jsonResponse({ code: 200, images: images.slice(0, 100) });
        } catch (e) {
            return jsonResponse({ code: 500, message: e.message }, 500);
        }
    }

    if (request.method === 'DELETE' && path.startsWith('/api/images/')) {
        const key = decodeURIComponent(path.split('/')[3] || '');
        if (!isSafeImageKey(key)) return jsonResponse({ code: 400, message: '图片标识非法' }, 400);
        try {
            const references = await findImageReferences(kv, key);
            if (references.length) {
                return jsonResponse({ code: 409, message: `图片仍被引用，已自动保留：${references.slice(0, 5).join('；')}${references.length > 5 ? '等' : ''}`, references }, 409);
            }
            await deleteImageKv(kv, key);
            return jsonResponse({ code: 200, message: '删除成功' });
        } catch (e) {
            return jsonResponse({ code: 500, message: e.message }, 500);
        }
    }
    return jsonResponse({ code: 404 }, 404);
}


async function cleanupDeletedPostData(kv, deletedPost, remainingPosts) {
    const id = deletedPost.id;
    const candidateImages = extractImageKeysFromPost(deletedPost);
    const deletedDataKeys = [];
    const possiblePostKeys = relatedPostKeys(id);
    for (const key of possiblePostKeys) {
        try {
            await kv.delete(key);
            deletedDataKeys.push(key);
        } catch (e) {
            console.error('Failed to delete related key:', key, e);
        }
    }
    const imageCleanup = await cleanupDetachedImages(kv, candidateImages, { posts: remainingPosts });
    return { deletedDataKeys, ...imageCleanup };
}

async function cleanupDetachedImages(kv, candidateImages, overrides = {}) {
    const deletedImages = [];
    const preservedImages = [];
    const unique = [...new Set([...candidateImages].filter(isSafeImageKey))];
    for (const key of unique) {
        const references = await findImageReferences(kv, key, overrides);
        if (references.length) {
            preservedImages.push({ key, references });
        } else {
            await deleteImageKv(kv, key);
            deletedImages.push(key);
        }
    }
    return { deletedImages, preservedImages };
}

async function deleteImageKv(kv, key) {
    await kv.delete(imageDataKey(key));
    await kv.delete(imageMetaKey(key));
    await removeImageFromIndex(kv, key);
}

async function getImageMeta(kv, key) {
    try {
        const meta = await kv.get(imageMetaKey(key));
        return meta ? JSON.parse(meta) : {};
    } catch (e) {
        return {};
    }
}

function buildImageLinks(request, filename, alt = '') {
    const origin = new URL(request.url).origin;
    const encoded = encodeURIComponent(filename);
    const relative = `/api/image/${encoded}`;
    const absolute = `${origin}${relative}`;
    const safeAlt = String(alt || filename).replace(/[<>"']/g, '').trim() || filename;
    return {
        relative,
        absolute,
        markdown: `![${safeAlt}](${absolute})`,
        html: `<img src="${absolute}" alt="${escapeHtml(safeAlt)}">`,
        bbcode: `[img]${absolute}[/img]`
    };
}

async function buildImageReferenceIndex(kv) {
    const index = new Map();
    const add = (key, label) => {
        if (!isSafeImageKey(key)) return;
        if (!index.has(key)) index.set(key, []);
        const arr = index.get(key);
        if (!arr.includes(label)) arr.push(label);
    };
    const posts = await getPosts(kv);
    for (const post of posts) {
        for (const key of extractImageKeysFromPost(post)) add(key, `文章：${post.title || post.id}`);
    }
    const sites = await getSites(kv);
    for (const site of sites) {
        for (const key of extractImageKeysFromSite(site)) add(key, `书签：${site.name || site.id}`);
    }
    const settings = await getSiteImageSettings(kv);
    for (const item of settings) add(item.key, item.label);
    return index;
}

async function findImageReferences(kv, key, overrides = {}) {
    const references = [];
    const add = label => { if (label && !references.includes(label)) references.push(label); };
    const posts = overrides.posts || await getPosts(kv);
    for (const post of posts) {
        if (extractImageKeysFromPost(post).has(key)) add(`文章：${post.title || post.id}`);
    }
    const sites = overrides.sites || await getSites(kv);
    for (const site of sites) {
        if (extractImageKeysFromSite(site).has(key)) add(`书签：${site.name || site.id}`);
    }
    const settings = await getSiteImageSettings(kv);
    for (const item of settings) {
        if (item.key === key) add(item.label);
    }
    return references;
}

async function getPosts(kv) {
    try {
        const data = await kv.get('blog_posts');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

async function getSites(kv) {
    try {
        const data = await kv.get('sites');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

async function getSiteImageSettings(kv) {
    const pairs = [
        ['site_logo', '站点 Logo'],
        ['header_bg', '页眉背景图']
    ];
    const result = [];
    for (const [kvKey, label] of pairs) {
        const value = await kv.get(kvKey);
        for (const key of extractImageKeysFromText(value || '')) result.push({ key, label });
    }
    return result;
}

function extractImageKeysFromPost(post) {
    const keys = new Set();
    for (const value of [post.coverImage, post.content, post.excerpt]) {
        for (const key of extractImageKeysFromText(value || '')) keys.add(key);
    }
    return keys;
}

function extractImageKeysFromSite(site) {
    return extractImageKeysFromText(site && site.logo ? site.logo : '');
}

function extractImageKeysFromText(text) {
    const keys = new Set();
    const str = String(text || '');
    const regex = /\/api\/image\/([^\s"'<>\)]+)/g;
    let match;
    while ((match = regex.exec(str)) !== null) {
        try {
            const key = decodeURIComponent(match[1]).split(/[?#]/)[0];
            if (isSafeImageKey(key)) keys.add(key);
        } catch (e) { }
    }
    return keys;
}


function resolveEdgeOneKv(context) {
    if (context && context.env && context.env.NAV_KV) return context.env.NAV_KV;
    if (typeof NAV_KV !== 'undefined') return NAV_KV;
    if (typeof globalThis !== 'undefined' && globalThis.NAV_KV) return globalThis.NAV_KV;
    return null;
}

function safeKeyPart(value, fallback = 'x') {
    const cleaned = String(value === undefined || value === null ? '' : value)
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 180);
    return cleaned || fallback;
}

function viewKey(id) {
    return `views_${safeKeyPart(id, '0')}`;
}

function relatedPostKeys(id) {
    const suffix = safeKeyPart(id, '0');
    return [
        `views_${suffix}`,
        `post_${suffix}`,
        `post_meta_${suffix}`,
        `comments_${suffix}`,
        `post_comments_${suffix}`,
        `likes_${suffix}`
    ];
}

function createSessionToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function createSessionValue() {
    return JSON.stringify({ createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 });
}

function sessionKey(token) {
    return `session_${safeKeyPart(token, 'invalid')}`;
}

async function isValidSessionToken(kv, token) {
    if (!/^[0-9a-fA-F]{48}$/.test(token)) return false;
    const raw = await kv.get(sessionKey(token));
    if (!raw) return false;
    try {
        const session = JSON.parse(raw);
        if (session.expiresAt && Date.now() > Number(session.expiresAt)) {
            await kv.delete(sessionKey(token));
            return false;
        }
    } catch (e) {
        await kv.delete(sessionKey(token));
        return false;
    }
    return true;
}

function imageToken(filename) {
    return safeKeyPart(filename, 'image');
}

function imageDataKey(filename) {
    return `image_data_${imageToken(filename)}`;
}

function imageMetaKey(filename) {
    return `image_meta_${imageToken(filename)}`;
}

async function getImageIndex(kv) {
    try {
        const raw = await kv.get('image_index');
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter(isSafeImageKey) : [];
    } catch (e) {
        return [];
    }
}

async function saveImageIndex(kv, list) {
    const clean = [...new Set((list || []).filter(isSafeImageKey))].slice(0, 1000);
    await kv.put('image_index', JSON.stringify(clean));
}

async function addImageToIndex(kv, filename) {
    if (!isSafeImageKey(filename)) return;
    const list = await getImageIndex(kv);
    if (!list.includes(filename)) {
        list.unshift(filename);
        await saveImageIndex(kv, list);
    }
}

async function removeImageFromIndex(kv, filename) {
    const list = await getImageIndex(kv);
    const next = list.filter(item => item !== filename);
    if (next.length !== list.length) await saveImageIndex(kv, next);
}

async function listAllImageFilenames(kv) {
    const found = new Set(await getImageIndex(kv));

    // 兼容没有 image_index 的旧数据：尝试从 image_meta_ 前缀回扫。
    if (typeof kv.list === 'function') {
        try {
            let cursor = undefined;
            let complete = false;
            while (!complete && found.size < 1000) {
                const result = await kv.list({ prefix: 'image_meta_', cursor, limit: 256 });
                for (const item of result.keys || []) {
                    const rawKey = item.key || item.name || '';
                    if (!rawKey) continue;
                    const metaRaw = await kv.get(rawKey);
                    if (!metaRaw) continue;
                    try {
                        const meta = JSON.parse(metaRaw);
                        if (meta && isSafeImageKey(meta.key)) found.add(meta.key);
                    } catch (e) { }
                }
                cursor = result.cursor;
                complete = result.complete === true || result.list_complete === true || !cursor;
            }
        } catch (e) { }
    }

    return [...found];
}

async function handleLogout(request, kv) {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/admin_token=([^;]+)/);
    if (match) await kv.delete(sessionKey(decodeURIComponent(match[1])));
    return new Response(null, { status: 302, headers: { 'Location': '/', 'Set-Cookie': clearAdminCookie() } });
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function textResponse(text, status = 200) {
    return new Response(text, {
        status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}

async function isAdmin(request, kv) {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
    if (!match) return false;
    const token = decodeURIComponent(match[1]);
    if (!/^[0-9a-fA-F]{48}$/.test(token)) return false;
    return await isValidSessionToken(kv, token);
}

function buildAdminCookie(token) {
    return `admin_token=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
}

function clearAdminCookie() {
    return 'admin_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

function safeJson(data) {
    return JSON.stringify(data)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function sanitizeHtml(html) {
    return String(html || '')
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
}

function isSafeImageKey(key) {
    return /^[0-9]{8,}_[a-z0-9]{4,12}\.(jpe?g|png|gif|webp)$/i.test(key);
}

function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/[&<>"']/g, m => {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        return '&#39;';
    });
}
