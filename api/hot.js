// Vercel Serverless Function:抓取公开热榜或 RSS 订阅源。
// 仅用于原型演示:正式上线应改用官方开放平台或商业舆情服务,并遵守对方的爬虫协议与服务条款。
const UA = 'Mozilla/5.0 (compatible; HotSpotStudioDemo/1.0)';

function bad(res, code, msg) { res.status(code).json({ error: msg }); }

async function get(url, ms = 7000, headers = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': UA, ...headers } });
    return r;
  } finally { clearTimeout(t); }
}

function decode(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function parseRss(xml) {
  const items = [];
  const re = /<(item|entry)[\s>]([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < 30) {
    const b = m[2];
    const title = decode((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);
    const summary = decode((b.match(/<(description|summary|content)[^>]*>([\s\S]*?)<\/\1>/) || [])[2]).slice(0, 120);
    if (title) items.push({ title, summary });
  }
  return items;
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 's-maxage=60, stale-while-revalidate=120');
  const { source, url } = req.query || {};
  try {
    if (source === 'weibo') {
      const r = await get('https://weibo.com/ajax/side/hotSearch');
      if (!r.ok) return bad(res, 502, `对方拒绝或不可用(${r.status})`);
      const j = await r.json();
      const list = (j.data && j.data.realtime) || [];
      const items = list.slice(0, 20).map(x => ({ title: x.note || x.word, tag: x.word, summary: `微博热搜,实时热度${x.num || ''}` }));
      return res.status(200).json({ items });
    }
    if (source === 'baidu') {
      const r = await get('https://top.baidu.com/api/board?platform=wise&tab=realtime');
      if (!r.ok) return bad(res, 502, `对方拒绝或不可用(${r.status})`);
      const j = await r.json();
      const list = (((j.data || {}).cards || [])[0] || {}).content || [];
      const items = list.slice(0, 20).map(x => ({ title: x.word, tag: x.word, summary: (x.desc || '').slice(0, 120) }));
      return res.status(200).json({ items });
    }
    if (url) {
      let u;
      try { u = new URL(url); } catch (e) { return bad(res, 400, '地址格式不对'); }
      if (!/^https?:$/.test(u.protocol)) return bad(res, 400, '只支持 http/https 地址');
      const host = u.hostname;
      if (process.env.ALLOW_PRIVATE_FETCH !== '1' && (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/.test(host) || host.endsWith('.internal') || host.endsWith('.local'))) return bad(res, 400, '不允许访问内网地址');
      const r = await get(u.toString());
      if (!r.ok) return bad(res, 502, `对方拒绝或不可用(${r.status})`);
      const items = parseRss(await r.text());
      if (!items.length) return bad(res, 422, '地址可访问,但不是可解析的 RSS/Atom 订阅源');
      return res.status(200).json({ items });
    }
    return bad(res, 400, '缺少参数 source 或 url');
  } catch (e) {
    return bad(res, 504, e.name === 'AbortError' ? '超时(对方 7 秒无响应)' : '抓取失败:' + (e.message || e));
  }
};
