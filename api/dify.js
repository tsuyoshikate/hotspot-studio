// Vercel Serverless Function:调用 Dify 工作流(blocking 模式)。密钥只放在服务端环境变量里。
// 环境变量:
//   DIFY_API_KEY   必填  Dify 应用「访问 API」里创建的密钥(app- 开头)
//   DIFY_BASE_URL  选填  默认 https://api.dify.ai/v1(自建或其他区域时改)
//   ACCESS_CODE    选填  设置后,前端必须带正确的访问码(防止链接被他人刷额度)
//   RATE_PER_MIN   选填  每个 IP 每分钟最多运行次数,默认 5(一次会跑完整条工作流,很贵)
// GET  → 只检查服务端有没有配好密钥,不会运行工作流
// POST → body: { inputs: { 变量名: 值, ... } },返回 { status, outputs, error, tokens, runId, elapsed }
const hits = new Map();

module.exports = async (req, res) => {
  const code = process.env.ACCESS_CODE;
  if (code && req.headers['x-access-code'] !== code) return res.status(401).json({ error: { message: '访问码不对或没有填写' } });
  const key = process.env.DIFY_API_KEY;
  const base = (process.env.DIFY_BASE_URL || 'https://api.dify.ai/v1').replace(/\/$/, '');

  if (req.method === 'GET') return res.status(200).json({ ok: true, hasKey: !!key, base, needsCode: !!code });
  if (req.method !== 'POST') return res.status(405).json({ error: { message: '只支持 GET 和 POST' } });
  if (!key) return res.status(500).json({ error: { message: '服务端还没有配置 DIFY_API_KEY 环境变量' } });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now(), limit = +process.env.RATE_PER_MIN || 5;
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (arr.length >= limit) return res.status(429).json({ error: { message: '运行太频繁,请稍后再试' } });
  arr.push(now); hits.set(ip, arr);

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const inputs = body && body.inputs;
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs) || !Object.keys(inputs).length) return res.status(400).json({ error: { message: '请求格式不对:缺少 inputs' } });
  if (JSON.stringify(inputs).length > 20000) return res.status(413).json({ error: { message: '内容太长' } });
  const clean = {};
  for (const [k, v] of Object.entries(inputs)) clean[String(k).slice(0, 64)] = typeof v === 'string' ? v : String(v);

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 295000);
  try {
    const r = await fetch(base + '/workflows/run', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ inputs: clean, response_mode: 'blocking', user: 'hotspot-studio' })
    });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) {}
    if (!r.ok || !j) {
      const msg = (j && (j.message || j.error)) || text.slice(0, 200) || '调用失败';
      const hint = r.status === 401 ? '(Dify 密钥不对或已被删除)' : r.status === 400 ? '(多半是输入变量名和 Dify 开始节点里的不一致,或必填变量没传)' : '';
      return res.status(r.status >= 400 && r.status < 600 ? r.status : 502).json({ error: { message: 'Dify 返回错误 ' + r.status + ':' + msg + hint } });
    }
    const d = j.data || {};
    return res.status(200).json({ status: d.status, outputs: d.outputs || {}, error: d.error || null, tokens: d.total_tokens || 0, runId: j.workflow_run_id || d.id || '', elapsed: d.elapsed_time || 0 });
  } catch (e) {
    return res.status(504).json({ error: { message: e.name === 'AbortError' ? '等了 5 分钟 Dify 还没返回' : '调用失败:' + (e.message || e) } });
  } finally { clearTimeout(t); }
};
