/* 工作台界面。按阶段逐步增加 Step。 */
(function(){
const S = {
  step:1, news:[], fetchInfo:null, selNews:null,
  showAll:false, products:[], selProducts:[], versions:[], activeVer:0, approved:false, persona:null, adopted:null, gen:0
};
const STEPS=[
  ['新闻抓取','监控热点新闻'],['建议匹配商品','系统智能推荐'],['匹配商品','商品库深度筛选'],['创作文案','小红书笔记生成'],['审核并发送','合规审核·模拟发布']
];
const fmtTime=d=>d.toTimeString().slice(0,8);

function modelBadge(){
  const m=Store.get('model');
  const label=m.mode==='mock'?'本地模拟(未接真实模型)':m.mode==='dify'?'Dify 工作流':m.model+' · '+(m.mode==='proxy'?'服务端代理':'浏览器直连');
  $('#modelBadge').innerHTML=`<span class="badge ${m.mode==='mock'?'warn':'ok'}" title="在后台「模型参数」里切换">${esc(label)}</span>`;
}

function renderSteps(){
  $('#steps').innerHTML=STEPS.map((s,i)=>{
    const n=i+1, cls=n===S.step?'on':(n<S.step?'done':'');
    return `<div class="step ${cls}" data-s="${n}"><span class="n">${n}</span><span><b>Step ${n} · ${s[0]}</b><small>${s[1]}</small></span></div>`;
  }).join('<div style="height:2px"></div>');
  $$('#steps .step').forEach(el=>el.onclick=()=>goStep(+el.dataset.s));
}
function renderChain(){
  const parts=[];
  if(!S.selNews) parts.push('<span>尚未选择热点 — 从 <b>Step 1 新闻抓取</b> 开始你的爆款之旅</span>');
  else{
    parts.push(`<span>当前链路</span><span class="pill hotc">${esc(S.selNews.title)}</span>`);
    if(S.selProducts.length) parts.push('→',`<span class="pill">${S.selProducts.length} 件商品:${esc(S.selProducts.map(Core.shortName).join('、'))}</span>`);
    if(S.versions.length) parts.push('→',`<span class="pill">文案 × ${S.versions.length} 版本</span>`);
  }
  $('#chain').innerHTML=parts.join(' ');
}
function goStep(n){
  if(n>1 && !S.selNews){toast('请先在 Step 1 选择一个热点');return;}
  if(n>=4 && !S.selProducts.length){toast('请先在 Step 2/3 采纳至少一件商品');return;}
  if(n>=5 && !S.versions.length){toast('请先在 Step 4 生成文案');return;}
  S.step=n; render();
}
function render(){
  renderSteps(); renderChain(); modelBadge();
  syncProducts();
  const v={1:viewNews,2:viewSuggest,3:viewLibrary,4:viewCopy,5:viewPublish}[S.step];
  v();
  window.scrollTo(0,0);
}
function viewPlaceholder(){
  $('#view').innerHTML=`<h2 class="t">Step ${S.step} · ${STEPS[S.step-1][0]}</h2><div class="card empty">这一步将在后续阶段开发。</div>`;
}

/* ───────── Step 1 · 新闻抓取 ───────── */
function riskBox(r){
  if(r.level==='ok') return '';
  const cls=r.level==='forbid'?'risk forbid':'risk';
  const head=r.level==='forbid'?'禁止借势':'需人工判断';
  const why=r.level==='forbid'?`涉及${r.type},不得借势`:`涉及${r.type},谨慎借势`;
  return `<div class="${cls}">👤 ${head} · ${why} · 命中「${esc(r.hits.join('、'))}」</div>`;
}
function newsCard(n){
  const r=n._risk, rel=n._rel, sel=S.selNews&&S.selNews.id===n.id;
  const bcls=n.badge==='爆'?'hot':n.badge==='升'?'up':'new';
  return `<div class="card news ${sel?'sel':''} ${r.level==='forbid'||!rel.relevant?'blocked':''}" style="${rel.relevant?'':'opacity:.6'}" data-id="${esc(n.id)}">
    <div class="meta"><span class="tag ${bcls}">${n.badge}</span><span class="tag live">${n.demo||!n.live?'快照':'实时'}</span>${n.posted?`<span class="tag" title="近期已用这条热点发过文案">⏱ ${esc(n.posted)}</span>`:''}<span>${esc(n.platform)} · ${esc(n.ago)}</span></div>
    <h4>${esc(n.title)}</h4>
    <p>${esc(n.summary)}</p>
    <div class="hint" style="margin:6px 0">${rel.relevant?`<span class="chk-ok">✓ 与业务相关</span> · ${esc(rel.reason)}`:`<span class="chk-bad">✗ 与业务无关</span> · ${esc(rel.reason)}`}</div>
    ${riskBox(r)}
    <div class="heat"><span>热度</span><i><s style="width:${n.heat}%"></s></i><b>${n.heat}</b><em>#${esc(n.tag)}#</em></div>
  </div>`;
}
function viewNews(){
  const all=S.news.map(n=>({...n,_risk:Core.assessRisk(n),_rel:Core.assessRelevance(n)}));
  S.news=all;
  const irrel=all.filter(n=>!n._rel.relevant).length;
  const list=S.showAll?all:all.filter(n=>n._rel.relevant);
  const forbid=list.filter(n=>n._rel.relevant&&n._risk.level==='forbid').length;
  const review=list.filter(n=>n._rel.relevant&&n._risk.level==='review').length;
  const fi=S.fetchInfo;
  const src=fi?fi.results.map(r=>r.ok?`${esc(r.src.name)} <b class="chk-ok">✓${r.count}</b>`:`${esc(r.src.name)} <b class="chk-bad" title="${esc(r.reason)}">✗ ${esc(r.reason)}</b>`).join(' · '):'';
  $('#view').innerHTML=`
    <h2 class="t">Step 1 · 新闻抓取</h2>
    <div class="sub">抓取全网热点后,先按业务<b>筛选相关新闻</b>(和西语培训无关的自动过滤),再显示热度值、话题标签,以及<b>可用性</b>:涉及违法、灾难的禁止借势,涉及时政外交的需人工判断。</div>
    <div class="card statusbar">
      <span class="chk-ok">●</span><span>${fi&&fi.live?'实时抓取':'演示快照'}${src?' · '+src:''}</span>
      <span class="hint">|</span><span>上次抓取 ${fi?fmtTime(fi.time):'—'}</span>
      <span class="hint">|</span><span>抓到 ${all.length} 条 · <b>相关 ${all.length-irrel} 条</b> · 已过滤无关 ${irrel} 条</span>
      <span class="hint">|</span><span class="${forbid?'chk-bad':''}">${forbid} 条已标记禁止借势</span>
      <span class="${review?'':'hint'}" style="${review?'color:var(--warn)':''}">${review} 条需人工判断</span>
      <span class="sp"></span>
      <label class="hint" style="cursor:pointer"><input type="checkbox" id="showAll" ${S.showAll?'checked':''}> 显示被过滤的无关新闻</label>
      <button class="btn sm" id="btnFetch">立即抓取</button>
    </div>
    <div class="news-grid" id="grid">${list.map(newsCard).join('')}</div>
    <div class="foot"><span>${S.selNews?`已选热点:<b>${esc(S.selNews.title)}</b>`:'请选择一个热点'}</span><span class="sp"></span>
      <button class="btn primary" id="btnNext" ${S.selNews?'':'disabled'}>下一步:建议匹配商品 →</button></div>`;
  $('#btnFetch').onclick=doFetch;
  $('#showAll').onchange=e=>{S.showAll=e.target.checked;viewNews();};
  $('#btnNext').onclick=()=>goStep(2);
  $$('#grid .news').forEach(el=>el.onclick=()=>pickNews(el.dataset.id));
}
function pickNews(id){
  const n=S.news.find(x=>x.id===id); if(!n) return;
  const r=n._risk;
  if(!n._rel.relevant){toast(`「${n.title}」与西语业务无关(${n._rel.reason}),不能选用`,3200);return;}
  if(r.level==='forbid'){toast(`「${n.title}」涉及${r.type},按边界规则禁止借势`,3000);return;}
  if(r.level==='review'){
    confirmModal(`<b>需人工判断</b><p>这条热点涉及<b>${esc(r.type)}</b>(命中「${esc(r.hits.join('、'))}」)。借势这类热点可能带来舆情风险。</p><p>请你确认已判断过,可以借势吗?</p>`,'我已判断,继续选用',()=>setNews(n));
    return;
  }
  setNews(n);
}
function setNews(n){
  if(!S.selNews||S.selNews.id!==n.id){S.selProducts=[];S.versions=[];S.approved=false;}
  S.selNews=n; render();
}
function confirmModal(html,okText,onOk){
  const bg=document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML=`<div class="modal" style="max-width:460px"><h3>确认</h3><div>${html}</div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-x>取消</button><button class="btn primary" data-ok>${esc(okText)}</button></div></div>`;
  document.body.appendChild(bg);
  bg.querySelector('[data-x]').onclick=()=>bg.remove();
  bg.querySelector('[data-ok]').onclick=()=>{bg.remove();onOk();};
  bg.onclick=e=>{if(e.target===bg)bg.remove();};
}
async function doFetch(){
  const btn=$('#btnFetch'); btn.disabled=true; btn.innerHTML='<span class="spin"></span> 抓取中…';
  const results=await Core.fetchAllSources();
  const liveOk=results.some(r=>r.ok&&!r.src.url.startsWith('demo'));
  const merged=Core.mergeNews(results.filter(r=>!(liveOk&&r.src.url==='demo')));
  if(!merged.length){toast('所有来源都失败了,保留当前列表');S.fetchInfo={results,time:new Date(),live:false};render();return;}
  S.news=merged; S.fetchInfo={results,time:new Date(),live:liveOk};
  if(S.selNews&&!S.news.find(n=>n.id===S.selNews.id)){S.selNews=null;S.selProducts=[];S.versions=[];}
  render();
  toast(liveOk?`抓取完成,共 ${merged.length} 条`:'实时来源都不可用,已用演示快照兜底',2600);
}

/* ───────── Step 2 / 3 · 商品 ───────── */
const MAX_PROD=4;
function syncProducts(){ // 商品库被运营改动后,已选商品按最新数据刷新;被删除的自动去掉,不报错
  const all=Store.get('products');
  S.selProducts=S.selProducts.map(p=>all.find(x=>x.id===p.id)).filter(Boolean);
}
function isSel(id){return S.selProducts.some(p=>p.id===id);}
function toggleProd(p){
  if(isSel(p.id)) S.selProducts=S.selProducts.filter(x=>x.id!==p.id);
  else{
    if(S.selProducts.length>=MAX_PROD){toast(`一条文案最多搭配 ${MAX_PROD} 件商品`);return false;}
    S.selProducts.push(p);
  }
  S.versions=[]; S.approved=false; return true;
}
function prodCard(p,o={}){
  const sel=isSel(p.id);
  return `<div class="card prod ${sel?'sel':''}" data-id="${esc(p.id)}">
    <div class="pic g${p.grad%12}">${esc(p.icon)}</div>
    ${o.score?`<span class="score">匹配度 <b>${o.score}%</b></span>`:''}
    <span class="chk">${sel?'✓':''}</span>
    <div class="body"><h5>${esc(p.name)}</h5>
      <div class="tags">${p.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
      ${o.why?`<div class="why">${esc(o.why)}</div>`:''}
      <div class="price">${Core.hasPrice(p)?'¥'+p.price+(p.orig?`<s>¥${p.orig}</s>`:''):'<span style="margin-left:0">价格未提供</span>'}<span>${esc(p.cat)}</span></div></div></div>`;
}
function bindProdCards(root,after){
  $$('.prod',root).forEach(el=>el.onclick=()=>{
    const p=Store.get('products').find(x=>x.id===el.dataset.id); if(!p) return;
    if(toggleProd(p)) after();
  });
}
function viewSuggest(){
  const all=Store.get('products');
  const ranked=Core.matchProducts(S.selNews,all).slice(0,6);
  $('#view').innerHTML=`
    <div class="row"><div style="flex:1"><h2 class="t">Step 2 · 建议匹配商品</h2>
    <div class="sub">系统基于热点语义与商品卖点自动推荐,点击卡片采纳/取消(可多选,最多 ${MAX_PROD} 件)</div></div>
    <button class="btn sm" id="adoptAll">一键采纳全部</button></div>
    <div class="pgrid" id="pg">${ranked.map(r=>prodCard(r.p,{score:r.score,why:r.why})).join('')}</div>
    <div class="foot"><span>已采纳 <b>${S.selProducts.length}</b> 件 · 可到 Step 3 从完整商品库补充</span><span class="sp"></span>
      <button class="btn" id="toLib">去商品库深度筛选</button>
      <button class="btn primary" id="next" ${S.selProducts.length?'':'disabled'}>下一步:创作文案 →</button></div>`;
  bindProdCards($('#pg'),render);
  $('#adoptAll').onclick=()=>{
    const room=MAX_PROD-S.selProducts.length;
    const add=ranked.map(r=>r.p).filter(p=>!isSel(p.id));
    if(!add.length){toast('这 6 件已全部采纳');return;}
    add.slice(0,Math.max(room,0)).forEach(p=>S.selProducts.push(p));
    if(add.length>room) toast(`最多采纳 ${MAX_PROD} 件,已按匹配度从高到低采纳到上限`,2800);
    S.versions=[]; S.approved=false; render();
  };
  $('#toLib').onclick=()=>goStep(3);
  $('#next').onclick=()=>goStep(4);
}
const libState={q:'',cat:'全部'};
function viewLibrary(){
  const all=Store.get('products');
  const cats=['全部',...new Set(all.map(p=>p.cat))];
  if(!cats.includes(libState.cat)) libState.cat='全部';
  $('#view').innerHTML=`
    <div class="row"><div style="flex:1"><h2 class="t">Step 3 · 匹配商品</h2>
    <div class="sub">在完整商品库中手动筛选并绑定商品,与 Step 2 的采纳结果实时同步</div></div>
    <span class="chk-ok" id="boundCnt">已绑定 ${S.selProducts.length} 件</span></div>
    <div class="row" style="margin-bottom:12px"><input type="text" id="q" placeholder="搜索商品名称 / 卖点…" value="${esc(libState.q)}" style="max-width:340px"></div>
    <div class="chips" id="chips">${cats.map(c=>`<span class="chip ${c===libState.cat?'on':''}" data-c="${esc(c)}">${esc(c)}</span>`).join('')}</div>
    <div class="pgrid" id="pg"></div>
    <div class="foot"><span id="libInfo"></span><span class="sp"></span>
      <button class="btn" id="back">← 返回建议商品</button>
      <button class="btn primary" id="next" ${S.selProducts.length?'':'disabled'}>下一步:创作文案 →</button></div>`;
  const draw=()=>{
    const q=libState.q.trim().toLowerCase();
    const list=all.filter(p=>(libState.cat==='全部'||p.cat===libState.cat)&&(!q||(p.name+p.tags.join('')+p.cat).toLowerCase().includes(q)));
    $('#pg').innerHTML=list.length?list.map(p=>prodCard(p)).join(''):'<div class="card empty" style="grid-column:1/-1">没有符合条件的商品</div>';
    $('#libInfo').textContent=`共 ${list.length} 件商品 · 已绑定 ${S.selProducts.length} 件`;
    $('#boundCnt').textContent=`已绑定 ${S.selProducts.length} 件`;
    $('#next').disabled=!S.selProducts.length;
    bindProdCards($('#pg'),draw);
  };
  draw();
  $('#q').oninput=e=>{libState.q=e.target.value;draw();};
  $$('#chips .chip').forEach(c=>c.onclick=()=>{libState.cat=c.dataset.c;$$('#chips .chip').forEach(x=>x.classList.toggle('on',x===c));draw();});
  $('#back').onclick=()=>goStep(2);
  $('#next').onclick=()=>goStep(4);
}

/* ───────── Step 4 · 创作文案 ───────── */
const LETTERS='ABCDEFGH';
const personaObj=()=>Store.get('personas').find(x=>x.id===S.persona)||null;
const matCard=()=>{const m=Core.matchMaterial(S.selNews);return m?m.card:null;};
const ctxFor=(style)=>({news:S.selNews,products:S.selProducts,persona:personaObj(),material:matCard(),style});
const lenOf=t=>String(t).replace(/\s/g,'').length;
async function genVersion(i){
  const v=S.versions[i]; v.loading=true; v.err=null; renderCopyRight();
  try{
    const r=await Core.generate(ctxFor(v.style));
    v.text=r.text; v.meta=r; v.fixLog=null;
  }catch(e){ v.err=e.message==='MOCK'?'模拟模式出错':e.message; }
  v.loading=false; v.res=v.text?Core.validate(v.text,ctxFor(v.style)):null;
  renderCopyRight();
}
function startGenerate(){
  const m=Store.get('model');
  const styles=m.mode==='dify'?[{id:'dify',name:'Dify 工作流',req:''}]:Store.get('styles');
  S.gen++; S.adopted=null; S.approved=false;
  S.versions=styles.map(st=>({style:st,text:'',meta:null,res:null,loading:true,err:null,fixLog:null}));
  S.activeVer=0; renderChain();
  renderCopyRight();
  S.versions.forEach((_,i)=>genVersion(i));
}
function viewCopy(){
  const ps=Store.get('personas');
  if(!ps.find(x=>x.id===S.persona)){ const top=Core.matchProducts(S.selNews,S.selProducts)[0]; S.persona=(top&&top.persona)||(ps[0]&&ps[0].id)||null; }
  const m=Store.get('model'); const mat=matCard(); const pn=personaObj();
  const modeTxt=m.mode==='mock'?'本地模拟':m.mode==='dify'?'Dify 工作流':esc(m.model);
  $('#view').innerHTML=`
    <h2 class="t">Step 4 · 创作文案</h2>
    <div class="sub">基于“热点 + 商品 + 客户画像”写小红书笔记。${m.mode==='dify'?'当前由你的 <b>Dify 工作流</b>写作,工作台负责选热点、选商品、选画像和事后校验。':'多版本可微调。'}提示词、画像和素材卡可在 <a href="admin.html">后台管理</a> 查看修改。</div>
    <div style="display:grid;grid-template-columns:270px 1fr;gap:16px;align-items:start" id="copyWrap">
      <div class="card pad">
        <h6 style="margin:0 0 10px;font-size:11px;color:var(--ink3);letter-spacing:.08em;font-weight:500">创作素材 INGREDIENTS</h6>
        <div class="ing hotc"><b>${esc(S.selNews.title)}</b><div style="color:var(--hot);font-size:12px">#${esc(S.selNews.tag)}#</div></div>
        ${S.selProducts.map(p=>`<div class="ing"><span style="font-size:22px">${esc(p.icon)}</span><div><b style="font-size:12px">${esc(p.name)}</b><div style="color:var(--hot);font-size:12px"><span class="hint">${esc(p.tags[0]||'')}</span></div></div></div>`).join('')}
        <h6 style="margin:14px 0 8px;font-size:11px;color:var(--ink3);letter-spacing:.08em;font-weight:500">这次对谁说 PERSONA</h6>
        <div class="chips" id="personas">${ps.map(x=>`<span class="chip ${x.id===S.persona?'on':''}" data-p="${esc(x.id)}" title="${esc(x.who)}">${esc(x.name)}</span>`).join('')}</div>
        <div class="hint" style="margin-bottom:10px">${pn?esc(pn.who):''}${S.selProducts.some(p=>(p.personas||[]).includes(S.persona))?'':'<br><span style="color:var(--warn)">所选商品没有挂这个画像,可到后台调整</span>'}</div>
        <h6 style="margin:4px 0 8px;font-size:11px;color:var(--ink3);letter-spacing:.08em;font-weight:500">真实素材 MATERIAL</h6>
        <div class="hint" style="margin-bottom:12px">${mat?`<b class="chk-ok">命中</b>「${esc(mat.title)}」<br>只能写卡片里「可以写」的内容`:'没有对得上的素材卡(默认不用)<br>文案里不会出现个人经历或学员故事'}</div>
        <button class="btn primary" style="width:100%" id="btnRegen">${S.versions.length?'重新生成文案':'生成文案'}</button>
        <div class="hint" style="margin-top:10px">当前:<b>${modeTxt}</b> <a href="admin.html#model">切换</a><br>${m.mode==='dify'?'Dify 只跑一次(每次都会真的运行整条工作流,费时也费额度)。':`共 ${Store.get('styles').length} 个风格版本并发生成,每个风格独立跑一次。`}</div>
        ${m.mode==='mock'?'<div class="risk" style="margin-top:10px">模拟模式:文案由本地模板拼出来,不代表真实效果;为了演示校验与修正,会故意夹带少量违规。</div>':''}
      </div>
      <div class="card" id="copyRight"></div>
    </div>
    <div class="foot"><button class="btn" id="back3">← 返回匹配商品</button><span class="sp"></span>
      <button class="btn green" id="adopt" ${S.versions.some(v=>v.text)?'':'disabled'}>采用当前版本,去审核 →</button></div>`;
  $$('#personas .chip').forEach(c=>c.onclick=()=>{S.persona=c.dataset.p;if(S.versions.length){S.versions=[];S.approved=false;S.adopted=null;}viewCopy();});
  $('#btnRegen').onclick=startGenerate;
  $('#back3').onclick=()=>goStep(3);
  $('#adopt').onclick=adoptCurrent;
  if(!S.versions.length) startGenerate(); else renderCopyRight();
}
function renderCopyRight(){
  const box=$('#copyRight'); if(!box||S.step!==4) return;
  const vs=S.versions; if(!vs.length){box.innerHTML='<div class="empty">点击左侧“生成文案”</div>';return;}
  const i=Math.min(S.activeVer,vs.length-1), v=vs[i];
  const tabs=`<div class="tabs">${vs.map((x,k)=>`<button class="${k===i?'on':''}" data-k="${k}">版本 ${LETTERS[k]} · ${esc(x.style.name)}${x.loading?' <span class="spin"></span>':(x.res&&!x.res.pass?' <span class="chk-bad">●</span>':(x.res?' <span class="chk-ok">✓</span>':''))}</button>`).join('')}</div>`;
  let body='';
  if(v.loading) body=`<div class="copybox"><span class="spin"></span> ${v.style.id==='dify'?'正在运行 Dify 工作流…通常要 1~3 分钟,请不要关闭页面':'正在生成「'+esc(v.style.name)+'」版本…'}</div>`;
  else if(v.err) body=`<div class="alert bad" style="margin-top:14px"><div><b>生成失败</b><br>${esc(v.err)}<br><span class="hint">可到后台「模型参数」检查密钥、模型名和接入方式,或先切回本地模拟。</span></div></div><div style="padding:0 14px 14px"><button class="btn" id="retry">重试这一版</button></div>`;
  else{
    const r=v.res, mt=v.meta||{};
    body=`<textarea class="copybox" id="copyText" style="width:calc(100% - 28px);min-height:200px;display:block">${esc(v.text)}</textarea>
    <div class="row" style="padding:0 14px 12px">
      <button class="btn sm primary" id="copyBtn">一键复制</button><button class="btn sm" id="regenOne">↻ 重新生成</button>
      <span class="sp"></span><span class="hint" id="metaLine"></span></div>
    <div id="alertBox"></div>`;
  }
  box.innerHTML=tabs+body;
  $$('.tabs button',box).forEach(b=>b.onclick=()=>{S.activeVer=+b.dataset.k;renderCopyRight();});
  if($('#retry',box)) $('#retry',box).onclick=()=>genVersion(i);
  if(v.text&&!v.loading&&!v.err){
    $('#regenOne',box).onclick=()=>genVersion(i);
    $('#copyBtn',box).onclick=()=>copyText(v.text);
    let tm; $('#copyText',box).oninput=e=>{v.text=e.target.value;v.res=Core.validate(v.text,ctxFor(v.style));clearTimeout(tm);tm=setTimeout(()=>{drawMeta(v);drawAlert(v,i);updateTabDots();},250);};
    drawMeta(v); drawAlert(v,i);
  }
  const ad=$('#adopt'); if(ad) ad.disabled=!vs.some(x=>x.text);
}
function updateTabDots(){ // 编辑文案后刷新标签页上的 ●/✓
  const tabs=$$('#copyRight .tabs button'); S.versions.forEach((x,k)=>{ if(!tabs[k]||x.loading) return;
    tabs[k].innerHTML=`版本 ${LETTERS[k]} · ${esc(x.style.name)}${x.res&&!x.res.pass?' <span class="chk-bad">●</span>':(x.res?' <span class="chk-ok">✓</span>':'')}`; });
}
function drawMeta(v){
  const mt=v.meta||{}; const el=$('#metaLine'); if(!el) return;
  el.textContent=`共 ${lenOf(v.text)} 字 · ${mt.model||''} · ${mt.via||''} · ${((mt.ms||0)/1000).toFixed(1)}s · ↑${(mt.usage||{}).in||0} ↓${(mt.usage||{}).out||0} tokens`;
}
function drawAlert(v,i){
  const el=$('#alertBox'); if(!el) return; const r=v.res;
  if(!r){el.innerHTML='';return;}
  const log=v.fixLog?`<div class="alert ok" style="margin-top:0">${v.fixLog}</div>`:'';
  const notes=r.notes&&r.notes.length?`<div class="alert" style="margin-top:8px"><div><b>需要人工核对(不扣分)</b><ul>${r.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div></div>`:'';
  if(r.pass){el.innerHTML=log+`<div class="alert ok"><div>✓ 规则校验全部通过 · 规则分 ${r.score}</div></div>`+notes;return;}
  const hard=r.hardFails.length;
  el.innerHTML=log+`<div class="alert ${hard?'bad':''}"><div style="flex:1"><b>! 有 ${r.failed.length} 项待优化 · 规则分 ${r.score}${hard?' · 含 '+hard+' 项硬伤':''}</b>
    <ul>${r.failed.map(c=>`<li>${c.hard?'<b>[硬伤]</b> ':''}${esc(c.msg)}${c.fixable&&Store.get('model').mode!=='dify'?'':(Store.get('model').mode==='dify'&&c.fixable?'(Dify 的稿子请在 Dify 里改,或在上面直接手动改)':'(需要换商品或重写,自动修正改不了)')}</li>`).join('')}</ul></div>
    ${r.failed.some(c=>c.fixable)&&Store.get('model').mode!=='dify'?'<button class="btn sm" id="fixBtn">一键修正</button>':''}</div>`+notes;
  const fb=$('#fixBtn'); if(fb) fb.onclick=async()=>{
    fb.disabled=true; fb.innerHTML='<span class="spin"></span> 修正中…';
    try{
      const out=await Core.autoFix(v.text,ctxFor(v.style),{maxRounds:2});
      if(!out.log.length||!out.log.some(l=>l.accepted)){v.fixLog='这次修正没有让分数提高,已保留原文案。';}
      else v.fixLog='已修正 '+out.log.length+' 轮:'+out.log.map(l=>`第${l.round}轮 ${l.before}→${l.after}${l.accepted?'':'(未采纳)'}`).join(';')+(out.res.pass?'。全部通过。':'。还剩:'+out.res.failed.map(c=>c.label).join('、'));
      v.text=out.text; v.res=out.res;
    }catch(e){v.fixLog='修正失败:'+esc(e.message);}
    renderCopyRight();
  };
}
function copyText(t){
  const ok=()=>toast('已复制到剪贴板');
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok,()=>fallbackCopy(t,ok));
  else fallbackCopy(t,ok);
}
function fallbackCopy(t,ok){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy');ok();}catch(e){toast('复制失败,请手动选择文字复制');}a.remove();}
function adoptCurrent(){
  const v=S.versions[S.activeVer]; if(!v||!v.text){toast('当前版本还没有文案');return;}
  S.adopted=S.activeVer; S.approved=false; goStep(5);
}

/* ───────── Step 5 · 审核并发送(模拟) ───────── */
const ACCOUNT='Kate的西语课堂';
function noteHtml(t){
  const ls=String(t).split('\n'); const i=ls.findIndex(l=>l.trim());
  const title=i>=0?ls[i].replace(/^\s*标题[::]\s*/,''):''; const rest=ls.slice(i+1).join('\n');
  return `<b style="font-size:15px;display:block;margin-bottom:6px">${esc(title)}</b>`+esc(rest).replace(/#[^#\s]+#/g,m=>`<span class="hashtag">${m}</span>`).replace(/【待核对[^】]*】/g,m=>`<mark>${m}</mark>`);
}
function viewPublish(){
  const v=S.versions[S.adopted]; if(!v||!v.text){S.step=4;render();return;}
  const ctx=ctxFor(v.style); const r=Core.validate(v.text,ctx);
  const by=id=>r.checks.find(c=>c.id===id)||{pass:true,msg:''};
  const risk=S.selNews._risk||Core.assessRisk(S.selNews);
  const pend=(v.text.match(/【待核对/g)||[]).length;
  const R=Store.get('rules');
  const items=[
    [by('banned').pass,'无绝对化用语和违禁词'+(by('banned').pass?'':'——'+by('banned').msg),true],
    [by('brand').pass,'正文和话题标签里没有品牌名'+(by('brand').pass?'':'——'+by('brand').msg),true],
    [by('scarcity').pass&&by('invented').pass,'没有编造稀缺感、个人经历或学员案例'+((by('scarcity').pass&&by('invented').pass)?'':'——'+[by('scarcity'),by('invented')].filter(c=>!c.pass).map(c=>c.msg).join(';')),true],
    [by('price').pass,'没有写商品库之外的价格'+(by('price').pass?'':'——'+by('price').msg),true],
    [pend===0,pend?`还有 ${pend} 处【待核对】没处理——请人工核对后删掉标记`:'没有待核对的标记',true],
    [lenOf(v.text)<=R.maxLen,`字数 ${lenOf(v.text)} / ${R.maxLen},符合小红书限制`,true],
    [risk.level!=='forbid',risk.level==='review'?`热点涉及${risk.type},已由人工确认可借势`:'热点可用性检查通过',true]
  ];
  const blocked=items.some(i=>!i[0]&&i[2]);
  const state=S.approved==='sent'?['sent','已发送(模拟)']:S.approved?['ok','已通过']:['warn','⏳ 未审核'];
  $('#view').innerHTML=`
    <div class="row"><div style="flex:1"><h2 class="t">Step 5 · 审核并发送</h2>
    <div class="sub">最终小红书效果预览 → 人工审核 → 一键发送(模拟,不会真的发到小红书)</div></div>
    <span class="badge ${state[0]}" id="stateBadge">${state[1]}</span></div>
    <div style="display:grid;grid-template-columns:minmax(300px,1fr) 1.5fr;gap:16px;align-items:start">
      <div class="card weibo">
        <div class="u"><i></i><div><b>${ACCOUNT}</b> <span class="tag live">V</span><br><span class="hint">${S.approved==='sent'?'刚刚 · 来自 热点营销工作台(模拟)':'预览 · 尚未发布'}</span></div></div>
        <div class="tx">${noteHtml(v.text)}</div>
        <div class="acts"><span>收藏 —</span><span>评论 —</span><span>赞 —</span></div>
      </div>
      <div class="card pad">
        <h4 style="margin:0 0 6px">发布信息</h4>
        <div class="kv"><span>关联热点</span><b>${esc(S.selNews.title)}</b></div>
        <div class="kv"><span>关联商品</span><b>${esc(S.selProducts.map(Core.shortName).join('、'))}</b></div>
        <div class="kv"><span>对谁说</span><b>${esc((personaObj()||{}).name||'—')}</b></div>
        <div class="kv"><span>真实素材</span><b>${matCard()?esc(matCard().title):'未使用'}</b></div>
        <div class="kv"><span>采用版本</span><b>${v.style.id==='dify'?'Dify 工作流':'版本 '+LETTERS[S.adopted]+' · '+esc(v.style.name)}</b></div>
        <div class="kv"><span>发布账号</span><b>@${ACCOUNT}</b></div>
        <h4 style="margin:18px 0 8px">合规自检</h4>
        ${items.map(i=>`<div style="padding:3px 0;font-size:13px"><span class="${i[0]?'chk-ok':'chk-bad'}">${i[0]?'✓':'✗'}</span> ${esc(i[1])}</div>`).join('')}
        ${r.notes&&r.notes.length?`<div class="alert" style="margin:12px 0 0"><div><b>请人工确认</b><ul>${r.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div></div>`:''}
        ${blocked?'<div class="alert bad" style="margin:12px 0 0"><div>有硬伤未通过,不能审核通过。请返回修改文案。</div></div>':''}
        <div class="row" style="margin-top:16px">
          ${S.approved==='sent'?'<span class="chk-ok">✓ 已模拟发送。真实发布需接入官方开放平台,演示版不会真的发出。</span>'
            :S.approved?'<button class="btn primary" id="send">一键发送(模拟)</button><button class="btn" id="unapprove">撤回审核</button>'
            :`<button class="btn green" id="approve" ${blocked?'disabled':''}>通过审核</button><button class="btn" id="backEdit">← 返回修改文案</button>`}
        </div>
      </div>
    </div>`;
  const on=(id,f)=>{const el=$('#'+id);if(el)el.onclick=f;};
  on('approve',()=>{S.approved=true;render();toast('已通过审核');});
  on('backEdit',()=>goStep(4));
  on('unapprove',()=>{S.approved=false;render();});
  on('send',()=>{S.approved='sent';S.selNews.posted='刚刚发过';const nn=S.news.find(x=>x.id===S.selNews.id);if(nn)nn.posted='刚刚发过';render();toast('已模拟发送(没有真的发到小红书)',2800);});
}

/* ───────── 启动 ───────── */
(async function init(){
  await Store.init();
  S.news=Store.get('news').map(n=>({...n,demo:true}));
  S.fetchInfo={results:[],time:new Date(),live:false};
  window.__S=S; // 方便调试
  render();
})();
})();
