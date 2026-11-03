// Vercel Serverless Function:大模型代理。密钥只放在服务端环境变量里,不出现在浏览器。
// 环境变量:
//   LLM_API_KEY    必填  服务商密钥(例如 DeepSeek 的 sk-...)
//   LLM_BASE_URL   选填  默认 https://api.deepseek.com/v1
//   LLM_MODEL      选填  默认 deepseek-chat(浏览器只能在白名单模型里选)
//   ACCESS_CODE    选填  设置后,前端必须带上正确的访问码才能调用(防止链接被他人刷额度)
//   RATE_PER_MIN   选填  每个 IP 每分钟最多调用次数,默认 20
const hits = new Map();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: { message: '只支持 POST' } });
  const key = process.env.LLM_API_KEY;
  if (!key) return res.status(500).json({ error: { message: '服务端还没有配置 LLM_API_KEY 环境变量' } });

  const code = process.env.ACCESS_CODE;
  if (code && req.headers['x-access-code'] !== code) return res.status(401).json({ error: { message: '访问码不对或没有填写' } });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now(), limit = +process.env.RATE_PER_MIN || 20;
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (arr.length >= limit) return res.status(429).json({ error: { message: '请求太频繁,请稍后再试' } });
  arr.push(now); hits.set(ip, arr);

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || !Array.isArray(body.messages) || !body.messages.length) return res.status(400).json({ error: { message: '请求格式不对' } });
  const total = JSON.stringify(body.messages).length;
  if (total > 20000) return res.status(413).json({ error: { message: '内容太长' } });

  const base = (process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || body.model || 'deepseek-chat';
  const temperature = Math.min(Math.max(+body.temperature || 0.7, 0), 1.5);

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 55000);
  try {
    const r = await fetch(base + '/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages: body.messages, temperature, max_tokens: 1200, stream: false })
    });
    const text = await r.text();
    res.status(r.status).setHeader('content-type', 'application/json').send(text);
  } catch (e) {
    res.status(504).json({ error: { message: e.name === 'AbortError' ? '请求超时' : '调用失败:' + (e.message || e) } });
  } finally { clearTimeout(t); }
};
