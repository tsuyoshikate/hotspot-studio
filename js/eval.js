/* 评测台界面:用例管理 + 跑评测。历史与对比在 eval-hist.js */
window.E=(function(){
const E={tab:'cases',cases:[],cfg:null,running:false,results:null,runMeta:null,expanded:new Set(),hook:null,agg:null};
const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}};
E.lsGet=lsGet; E.lsSet=lsSet;
const clone=o=>JSON.parse(JSON.stringify(o));
const fx=(n,d=1)=>n==null?'—':(Math.round(n*10**d)/10**d).toString();
const cls=s=>s==null?'na':s>=80?'hi':s>=60?'mid':'lo';
const pill=s=>`<span class="pill-s ${cls(s)}">${s==null?'—':fx(s)}</span>`;
E.pill=pill; E.fx=fx; E.cls=cls;

function saveCases(){Store.set('evalCases',E.cases);}
function defaultCfg(){return {styleIds:null,concurrency:3,repeat:1,wRule:50,wJudge:50,judgeOn:true,autoFix:false,priceIn:2,priceOut:8,flawRate:0.34};}
function saveCfg(){lsSet('hs_evalCfg',E.cfg);}
function products(ids){const all=Store.get('products');return ids.map(id=>all.find(p=>p.id===id)).filter(Boolean);}
function ctxOf(cs,st){
  return {news:{id:cs.id,title:cs.newsTitle,summary:cs.newsSummary,tag:cs.tag},products:products(cs.productIds),persona:cs.tone,style:st};
}
E.ctxOf=ctxOf;
function modelLabel(){const m=Store.get('model');return m.mode==='mock'?'本地模拟':m.model+' · '+(m.mode==='proxy'?'服务端代理':'浏览器直连');}
E.modelLabel=modelLabel;

/* ───────── 用例管理 ───────── */
function seedCases(){
  const news=Store.get('news').filter(n=>Core.assessRelevance(n).relevant&&Core.assessRisk(n).level!=='forbid').sort((a,b)=>b.heat-a.heat).slice(0,6);
  return news.map((n,i)=>({id:'case'+Date.now()+i,name:`种子 ${i+1} · ${n.title}`,newsTitle:n.title,newsSummary:n.summary,tag:n.tag,
    productIds:Core.matchProducts(n).slice(0,2).map(r=>r.p.id),tone:(Core.personaById(Core.matchProducts(n)[0].persona)||Store.get('personas')[0]||{}).name||'',note:'由匹配库自动生成',on:true}));
}
function viewCases(){
  const on=E.cases.filter(c=>c.on).length; const all=Store.get('products');
  $('#eview').innerHTML=`<div class="row"><div style="flex:1"><h3 style="margin:0">评测数据集</h3><div class="sub">用例 = 一条热点 + 一组商品 + 一个客户画像。勾选的用例会参与本次评测,建议固定不变以便版本间横向比较。</div></div></div>
  <div class="card"><div class="row pad" style="justify-content:space-between"><div><b>用例列表</b><div class="hint">共 ${E.cases.length} 条用例,已勾选 ${on} 条参与评测</div></div>
    <div class="row"><button class="btn sm" id="cAll">全选</button><button class="btn sm" id="cNone">全不选</button><button class="btn sm" id="cSeed">从匹配库生成种子用例</button><button class="btn sm primary" id="cNew">+ 新建用例</button></div></div>
    ${!E.cases.length?'<div class="empty">还没有用例。点“从匹配库生成种子用例”,会用真实热点和商品库自动配好 6 条。</div>':
    `<table><thead><tr><th style="width:30px"></th><th>用例名称</th><th>热点</th><th>商品</th><th>客户画像</th><th>备注</th><th style="width:150px">操作</th></tr></thead><tbody>
    ${E.cases.map((c,i)=>`<tr><td><input type="checkbox" data-on="${i}" ${c.on?'checked':''}></td><td><b>${esc(c.name)}</b></td>
      <td>${esc(c.newsTitle)}<div class="hint">#${esc(c.tag)}#</div></td>
      <td>${products(c.productIds).map(p=>esc(Core.shortName(p))).join(' / ')||'<span class="chk-bad">商品已被删除</span>'}<div class="hint">${products(c.productIds).map(p=>Core.hasPrice(p)?'¥'+p.price:'无价格').join(' · ')}</div></td>
      <td>${esc(c.tone)}</td><td class="hint">${esc(c.note||'')}</td>
      <td><button class="btn sm" data-ed="${i}">编辑</button> <button class="btn sm" data-cp="${i}">复制</button> <button class="btn sm danger" data-rm="${i}">删除</button></td></tr>`).join('')}</tbody></table>`}</div>`;
  $$('[data-on]').forEach(c=>c.onchange=()=>{E.cases[+c.dataset.on].on=c.checked;saveCases();viewCases();});
  $('#cAll').onclick=()=>{E.cases.forEach(c=>c.on=true);saveCases();viewCases();};
  $('#cNone').onclick=()=>{E.cases.forEach(c=>c.on=false);saveCases();viewCases();};
  $('#cSeed').onclick=async()=>{
    if(E.cases.length && !await confirmBox('当前已有 '+E.cases.length+' 条用例。生成种子用例会<b>追加</b> 6 条新的(不会删除已有的)。','追加生成')) return;
    E.cases.push(...seedCases()); saveCases(); viewCases(); toast('已生成种子用例');
  };
  $('#cNew').onclick=()=>editCase(null);
  $$('[data-ed]').forEach(b=>b.onclick=()=>editCase(+b.dataset.ed));
  $$('[data-cp]').forEach(b=>b.onclick=()=>{const c=clone(E.cases[+b.dataset.cp]);c.id='case'+Date.now();c.name+=' (副本)';E.cases.splice(+b.dataset.cp+1,0,c);saveCases();viewCases();});
  $$('[data-rm]').forEach(b=>b.onclick=async()=>{ if(await confirmBox('删除这条用例?','删除')){E.cases.splice(+b.dataset.rm,1);saveCases();viewCases();} });
}
function editCase(i){
  const isNew=i==null; const c=isNew?{id:'case'+Date.now(),name:'',newsTitle:'',newsSummary:'',tag:'',productIds:[],tone:(Store.get('personas')[0]||{}).name||'',note:'',on:true}:clone(E.cases[i]);
  const news=Store.get('news').filter(n=>Core.assessRelevance(n).relevant&&Core.assessRisk(n).level!=='forbid'); const all=Store.get('products'); const tones=Store.get('personas').map(x=>x.name);
  const bg=document.createElement('div'); bg.className='modal-bg'; document.body.appendChild(bg); let q='';
  function paint(){
    bg.innerHTML=`<div class="modal"><h3>${isNew?'新建用例':'编辑用例'}</h3>
      <label class="f">用例名称 *</label><input type="text" id="cn" value="${esc(c.name)}">
      <label class="f">从真实热点导入(选一条会填好下面三项)</label><select id="cs"><option value="">— 手动填写 —</option>${news.map(n=>`<option value="${n.id}">${esc(n.title)}</option>`).join('')}</select>
      <label class="f">热点标题 *</label><input type="text" id="ct" value="${esc(c.newsTitle)}">
      <label class="f">热点摘要</label><textarea id="cm" style="min-height:60px">${esc(c.newsSummary)}</textarea>
      <label class="f">话题标签(不带 #) *</label><input type="text" id="cg" value="${esc(c.tag)}">
      <label class="f">商品(1~4 件,已选 ${c.productIds.length})</label><input type="text" id="cq" placeholder="搜索商品" value="${esc(q)}">
      <div style="max-height:150px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px;margin-top:6px">${all.filter(p=>!q||(p.name+p.cat).includes(q)).map(p=>`<label style="display:block;padding:2px 4px"><input type="checkbox" data-p="${p.id}" ${c.productIds.includes(p.id)?'checked':''}> ${esc(p.icon)} ${esc(p.name)} <span class="hint">${Core.hasPrice(p)?'¥'+p.price+' · ':''}${esc(p.cat)}</span></label>`).join('')}</div>
      <div class="grid2"><div><label class="f">客户画像</label><select id="cto">${tones.map(t=>`<option ${t===c.tone?'selected':''}>${esc(t)}</option>`).join('')}</select></div><div><label class="f">备注</label><input type="text" id="cno" value="${esc(c.note||'')}"></div></div>
      <div class="err" id="cerr"></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-x>取消</button><button class="btn primary" data-ok>保存</button></div></div>`;
    $('#cn',bg).oninput=e=>c.name=e.target.value; $('#ct',bg).oninput=e=>c.newsTitle=e.target.value; $('#cm',bg).oninput=e=>c.newsSummary=e.target.value; $('#cg',bg).oninput=e=>c.tag=e.target.value.replace(/#/g,''); $('#cno',bg).oninput=e=>c.note=e.target.value; $('#cto',bg).onchange=e=>c.tone=e.target.value;
    $('#cs',bg).onchange=e=>{const n=news.find(x=>x.id===e.target.value);if(n){c.newsTitle=n.title;c.newsSummary=n.summary;c.tag=n.tag;if(!c.name)c.name=n.title;paint();}};
    $('#cq',bg).oninput=e=>{q=e.target.value;const pos=e.target.selectionStart;paint();const n=$('#cq',bg);n.focus();n.selectionStart=n.selectionEnd=pos;};
    $$('[data-p]',bg).forEach(k=>k.onchange=()=>{const id=k.dataset.p; if(k.checked){ if(c.productIds.length>=4){k.checked=false;$('#cerr',bg).textContent='最多 4 件商品';return;} c.productIds.push(id);} else c.productIds=c.productIds.filter(x=>x!==id); });
    bg.querySelector('[data-x]').onclick=()=>bg.remove();
    bg.querySelector('[data-ok]').onclick=()=>{
      const er=$('#cerr',bg);
      if(!c.name.trim()){er.textContent='请填写用例名称';return;} if(!c.newsTitle.trim()){er.textContent='请填写热点标题';return;} if(!c.tag.trim()){er.textContent='请填写话题标签';return;} if(!c.productIds.length){er.textContent='至少选 1 件商品';return;}
      if(isNew) E.cases.push(c); else E.cases[i]=c; saveCases(); bg.remove(); viewCases();
    };
  }
  paint();
}

/* ───────── 跑评测 ───────── */
function stylesAll(){return Store.get('styles');}
function selStyles(){const all=stylesAll(); if(!E.cfg.styleIds) return all; return all.filter(s=>E.cfg.styleIds.includes(s.id));}
function runCfg(){
  return {cases:E.cases.filter(c=>c.on),styles:selStyles(),repeat:E.cfg.repeat,concurrency:E.cfg.concurrency,judgeOn:E.cfg.judgeOn,autoFix:E.cfg.autoFix,wRule:E.cfg.wRule,wJudge:E.cfg.wJudge,priceIn:E.cfg.priceIn,priceOut:E.cfg.priceOut,flawRate:E.cfg.flawRate,ctxOf};
}
function estLine(){
  const cfg=runCfg(); if(!cfg.cases.length||!cfg.styles.length) return '请先勾选用例和风格';
  const e=Core.estimate(cfg);
  return `总任务数 <b>${e.tasks}</b> = ${cfg.cases.length} 用例 × ${cfg.styles.length} 风格 × ${cfg.repeat} 次 · 预估 token ↑${e.tin.toLocaleString()} ↓${e.tout.toLocaleString()} · 预估费用 <b>¥${e.cost.toFixed(4)}</b>(粗略)`;
}
function viewRun(){
  const m=Store.get('model'), P=Store.get('prompts'), styles=stylesAll();
  const ids=E.cfg.styleIds||styles.map(s=>s.id);
  $('#eview').innerHTML=`<h3 style="margin:0">运行评测</h3><div class="sub">对「每个用例 × 每个风格 × 重复 N 次」生成文案,先跑零成本的规则校验,再(可选)让大模型当评委打分。</div>
  ${m.mode==='mock'?'<div class="alert" style="margin:0 0 12px"><div>当前是<b>本地模拟</b>模式:文案和评审都是本地模板生成的,只用来演示评测流程;模拟写手会故意夹带少量违规。要评测真实模型,请到 <a href="admin.html#model">后台 → 模型参数</a> 切换。</div></div>':''}
  <div class="card pad" style="margin-bottom:14px"><b>运行配置</b> <span class="hint">当前模型:<b>${esc(modelLabel())}</b> · 需要切换到 <a href="admin.html#model">后台 → 模型参数</a></span>
    <label class="f">参与的版本风格(来自后台配置)</label><div class="chips">${styles.map((s,i)=>`<span class="chip ${ids.includes(s.id)?'on':''}" data-st="${s.id}">版本 ${'ABCDEFGH'[i]} · ${esc(s.name)}</span>`).join('')}</div>
    <div class="grid2" style="grid-template-columns:repeat(4,1fr)">
      <div><label class="f">并发数 1~8</label><input type="number" id="fCon" min="1" max="8" value="${E.cfg.concurrency}"><div class="hint">并发太高容易触发服务商限流(429)</div></div>
      <div><label class="f">重复次数</label><input type="number" id="fRep" min="1" max="5" value="${E.cfg.repeat}"><div class="hint">同一组合重复多次可平滑模型随机性</div></div>
      <div><label class="f">规则分权重 %</label><input type="number" id="fWr" min="0" max="100" value="${E.cfg.wRule}"></div>
      <div><label class="f">评委分权重 %</label><input type="number" id="fWj" min="0" max="100" value="${E.cfg.wJudge}"><div class="hint">总分 = 规则分×权重 + 评委分×权重;未启用评委时,规则分即总分</div></div>
    </div>
    <div class="grid2" style="grid-template-columns:1fr 1fr 1fr;margin-top:6px">
      <div><label class="f">LLM 评委</label><label><input type="checkbox" id="fJudge" ${E.cfg.judgeOn?'checked':''}> 启用(每条文案额外调用一次模型打分)</label><br><label><input type="checkbox" id="fFix" ${E.cfg.autoFix?'checked':''}> 对规则没过的文案自动返工(最多 2 轮)</label></div>
      <div><label class="f">输入单价 元 / 百万 token</label><input type="number" id="fPi" step="0.1" value="${E.cfg.priceIn}"></div>
      <div><label class="f">输出单价 元 / 百万 token</label><input type="number" id="fPo" step="0.1" value="${E.cfg.priceOut}"></div>
    </div>
    <div class="hint" style="margin:6px 0 10px">单价是<b>参考价,以服务商官网为准,可自行修改</b>;费用为粗略估算,仅供心里有数。</div>
    <details class="pm"><summary>评委提示词(可编辑,保存后持久化)</summary><div style="padding:10px 0"><textarea id="fJp" style="min-height:130px;font-family:ui-monospace,Menlo,monospace;font-size:12.5px">${esc(P.judge)}</textarea><div class="row" style="margin-top:6px"><button class="btn sm" id="fJpSave">保存评委提示词</button><span class="hint">占位符:{素材} {文案}。评审回复必须是 JSON,解析容错:多写废话、被代码块包住都能捞出来。</span></div></div></details>
  </div>
  <div class="card pad" style="margin-bottom:14px"><div class="row"><div style="flex:1"><b>开跑</b><div class="hint" id="estLine">${estLine()}</div></div>
    <button class="btn primary" id="runBtn" ${E.running?'disabled':''}>${E.running?'<span class="spin"></span> 评测中…':'开始评测'}</button><button class="btn danger" id="stopBtn" ${E.running?'':'disabled'}>中止</button></div>
    <div class="row" style="margin-top:12px"><div class="bar" style="flex:1"><i id="pbar" style="width:0"></i></div><span class="hint" id="ptxt">尚未开始</span></div></div>
  <div id="sumBox"></div><div id="detBox"></div>`;
  $$('[data-st]').forEach(c=>c.onclick=()=>{
    let cur=E.cfg.styleIds||stylesAll().map(s=>s.id); const id=c.dataset.st;
    cur=cur.includes(id)?cur.filter(x=>x!==id):[...cur,id]; if(!cur.length){toast('至少选一个风格');return;}
    E.cfg.styleIds=cur; saveCfg(); viewRun();
  });
  const num=(id,k,min,max)=>{const e=$('#'+id);e.oninput=()=>{let v=+e.value; if(isNaN(v)) return; E.cfg[k]=Math.max(min,Math.min(max,v)); saveCfg(); $('#estLine').innerHTML=estLine();};};
  num('fCon','concurrency',1,8); num('fRep','repeat',1,5); num('fWr','wRule',0,100); num('fWj','wJudge',0,100); num('fPi','priceIn',0,1000); num('fPo','priceOut',0,1000);
  $('#fJudge').onchange=e=>{E.cfg.judgeOn=e.target.checked;saveCfg();$('#estLine').innerHTML=estLine();};
  $('#fFix').onchange=e=>{E.cfg.autoFix=e.target.checked;saveCfg();};
  $('#fJpSave').onclick=()=>{const p=Store.get('prompts');p.judge=$('#fJp').value; if(!p.judge.trim()){toast('评委提示词不能为空');return;} Store.set('prompts',p); toast('评委提示词已保存');};
  $('#runBtn').onclick=start; $('#stopBtn').onclick=()=>{ if(E.hook) E.hook.abort(); toast('正在中止…正在跑的这几条跑完就会停'); };
  drawResults();
}
async function start(){
  const cfg=runCfg();
  if(!cfg.cases.length){toast('请先到「用例管理」勾选至少一条用例');return;}
  if(!cfg.styles.length){toast('至少选一个风格');return;}
  if(cfg.cases.some(c=>!products(c.productIds).length)){toast('有用例的商品已被删除,请先修复(用例管理)');return;}
  if(cfg.judgeOn&&(+cfg.wRule)+(+cfg.wJudge)<=0){toast('规则分权重和评委分权重不能都是 0');return;}
  const m=Store.get('model'); const ps=Core.snapshot();
  E.running=true; E.results=null; E.agg=null; E.expanded.clear(); E.runMeta={time:new Date(),model:modelLabel(),promptId:ps.id,snap:ps.snap,cfg:{judgeOn:cfg.judgeOn,autoFix:cfg.autoFix,wRule:cfg.wRule,wJudge:cfg.wJudge,priceIn:cfg.priceIn,priceOut:cfg.priceOut,styleCount:cfg.styles.length,repeat:cfg.repeat},saved:false};
  E.hook={}; viewRun();
  let pending=false;
  let latest=null;
  E.hook.onUpdate=(results,done,t0)=>{
    E.results=results; latest={results,done,t0}; if(pending) return; pending=true;
    setTimeout(()=>{pending=false; if(!latest||!E.running) return; const {results:rs,done:dn,t0:t}=latest; const n=rs.length; const pb=$('#pbar'); if(pb){pb.style.width=Math.round(dn/n*100)+'%'; $('#ptxt').textContent=`${dn}/${n} 完成 · ${Math.round(dn/n*100)}% · 耗时 ${((performance.now()-t)/1000).toFixed(1)} s · 运行中`;} drawResults(true);},120);
  };
  const out=await Core.runEval(cfg,E.hook);
  E.running=false; E.results=out.results; E.runMeta.ms=out.ms; E.runMeta.aborted=out.aborted; E.runMeta.cfgFull=cfg;
  E.agg=Core.aggregate(out.results,cfg);
  if(E.tab==='run'){ viewRun(); const pb=$('#pbar'); if(pb){pb.style.width='100%'; $('#ptxt').textContent=`${out.results.filter(r=>r.status==='完成').length}/${out.results.length} 完成 · 耗时 ${(out.ms/1000).toFixed(1)} s · ${out.aborted?'已中止':'已完成'}`;} }
  toast(out.aborted?'评测已中止':'评测完成');
}
function drawResults(live){
  const sb=$('#sumBox'), db=$('#detBox'); if(!sb||!E.results) return;
  const cfgNow=E.runMeta&&E.runMeta.cfgFull?E.runMeta.cfgFull:{priceIn:E.cfg.priceIn,priceOut:E.cfg.priceOut};
  const a=Core.aggregate(E.results,{priceIn:E.cfg.priceIn,priceOut:E.cfg.priceOut}); const meta=E.runMeta;
  const st=(label,val,sub,c)=>`<div class="card stat"><small>${label}</small><b class="${c||''}">${val}</b><small>${sub||''}</small></div>`;
  const R=window.DEFAULTS.rules, rr=Store.get('rules');
  sb.innerHTML=`<div class="card pad" style="margin-bottom:14px"><div class="row"><div style="flex:1"><b>本轮汇总</b><div class="hint">${meta.time.toLocaleString('zh-CN')} · ${esc(meta.model)} · prompt <span class="codeid">${meta.promptId}</span> · 权重 规则 ${meta.cfg.wRule}% / 评委 ${meta.cfg.judgeOn?meta.cfg.wJudge+'%':'未启用'}</div></div>
    <button class="btn sm" id="exJ" ${E.running?'disabled':''}>导出 JSON</button><button class="btn sm primary" id="saveRun" ${E.running||meta.saved?'disabled':''}>${meta.saved?'已保存':'保存本次运行'}</button></div>
    <div class="mrow" style="margin-top:12px">
      ${st('平均总分',fx(a.avgTotal),`${a.valid}/${a.total} 条有效`,'s-'+(cls(a.avgTotal)==='hi'?'hi':cls(a.avgTotal)==='mid'?'mid':'lo'))}
      ${st('规则通过率',a.rulePassRate==null?'—':fx(a.rulePassRate)+'%',`全项通过 ${a.allPass} 条`)}
      ${st('规则均分',fx(a.avgRule),'零 token 校验')}
      ${st('评委均分',a.avgJudge==null?'—':fx(a.avgJudge),a.judged+' 条已评')}
      ${st('违禁词命中',a.banned,`共 ${a.bannedWords} 个词`,a.banned?'s-lo':'')}
      ${st('价格幻觉',a.fake,'编造了素材外价格',a.fake?'s-lo':'')}
      ${st('平均字数',fx(a.avgChars),`要求 ${rr.minLen}~${rr.maxLen}`)}
      ${st('Token',(a.tin+a.tout).toLocaleString(),`↑${a.tin.toLocaleString()} ↓${a.tout.toLocaleString()}`)}
      ${st('总耗时',(a.ms/1000).toFixed(1)+' s',`失败 ${a.failed} · 中止 ${a.stopped}`)}
      ${st('预估费用','¥'+a.cost.toFixed(4),`参考价 ↑${E.cfg.priceIn} ↓${E.cfg.priceOut} 元/百万`)}
      ${meta.cfg.autoFix?st('返工修好',a.fixed+'/'+a.hadFix,'规则没过的文案经返工全部通过'):''}
    </div></div>`;
  $('#exJ').onclick=()=>exportJson(); $('#saveRun').onclick=saveRun;
  const open=E.expanded;
  db.innerHTML=`<div class="card"><div class="row pad" style="justify-content:space-between"><div><b>明细</b><div class="hint">点击任意一行展开文案全文、规则逐项与评委点评,并做“好 / 差”人工标注</div></div><div class="row"><button class="btn sm" id="exAll">全部展开</button><button class="btn sm" id="coAll">全部收起</button></div></div>
  <table><thead><tr><th>用例</th><th>风格</th><th>字数</th><th>规则分</th><th>评委分</th><th>总分</th><th>人工标注</th><th>状态</th></tr></thead><tbody>
  ${E.results.map(r=>row(r,open.has(r.idx))).join('')}</tbody></table></div>`;
  $$('tr[data-r]',db).forEach(tr=>tr.onclick=e=>{ if(e.target.closest('button,input,textarea')) return; const i=+tr.dataset.r; open.has(i)?open.delete(i):open.add(i); drawResults(); });
  $('#exAll').onclick=()=>{E.results.forEach(r=>open.add(r.idx));drawResults();}; $('#coAll').onclick=()=>{open.clear();drawResults();};
  $$('[data-mk]',db).forEach(b=>b.onclick=()=>{const [i,k]=b.dataset.mk.split(':');const r=E.results[+i]; r.human.mark=r.human.mark===k?'':k; drawResults();});
  $$('[data-note]',db).forEach(t=>t.oninput=()=>{E.results[+t.dataset.note].human.note=t.value;});
}
function row(r,open){
  const js=r.judge&&r.judge.ok?Core.judgeScore(r.judge):null;
  const done=r.status==='完成';
  const main=`<tr data-r="${r.idx}" style="cursor:pointer"><td><span class="hint">${open?'▾':'▸'}</span> <b>${esc(r.caseName.length>26?r.caseName.slice(0,26)+'…':r.caseName)}</b></td><td>${esc(r.styleName)}${r.rep?` <span class="hint">#${r.rep+1}</span>`:''}</td>
    <td>${done?r.chars:'—'}</td><td>${done?pill(r.ruleScore):'—'}</td><td>${done?(r.judge?(r.judge.ok?pill(js):'<span class="pill-s na" title="'+esc(r.judge.error||'')+'">评审失败</span>'):'—'):'—'}</td><td>${done?pill(r.total):'—'}</td>
    <td><button class="btn sm ${r.human.mark==='good'?'green':''}" data-mk="${r.idx}:good">好</button> <button class="btn sm ${r.human.mark==='bad'?'danger':''}" data-mk="${r.idx}:bad" ${r.human.mark==='bad'?'style="background:var(--bad-weak)"':''}>差</button></td>
    <td>${r.status==='完成'?'<span class="chk-ok">完成</span>':r.status==='失败'?`<span class="chk-bad" title="${esc(r.err||'')}">失败</span>`:r.status==='运行中'?'<span class="spin"></span>':`<span class="hint">${r.status}</span>`}</td></tr>`;
  if(!open) return main;
  let d='';
  if(r.status==='失败') d=`<div class="alert bad" style="margin:0"><div>${esc(r.err)}</div></div>`;
  else if(done){
    d=`<div class="hint" style="margin-bottom:4px">文案全文 · ${r.chars} 字 · ${(r.ms/1000).toFixed(1)} s · ↑${r.usage.in} ↓${r.usage.out} tokens${r.beforeFix?` · 经返工 ${r.beforeFix.rounds} 轮(规则分 ${r.beforeFix.score} → ${r.ruleScore})`:''}</div>
    <div class="copybox" style="margin:0 0 12px;min-height:0">${esc(r.text)}</div>
    <div class="hint" style="margin-bottom:4px">规则校验(权重合计 ${r.res.checks.reduce((a,c)=>a+c.weight,0)})</div>
    ${r.res.checks.map(c=>`<div class="rl"><span class="${c.pass?'chk-ok':'chk-bad'}">${c.pass?'✓':'✗'}</span><b>${esc(c.label)} ×${c.weight}${c.hard?' <span class="tag hot">硬伤</span>':''}</b><span class="hint">${esc(c.msg)}</span></div>`).join('')}
    ${r.judge?(r.judge.ok?`<div class="hint" style="margin:12px 0 6px">LLM 评委 · 总分 ${fx(js)}</div><div class="row" style="gap:8px;align-items:stretch">${Core.JUDGE_DIMS.map(d=>`<div class="dim"><small>${d}</small><b>${r.judge.scores[d]}</b><span class="hint"> / 5</span></div>`).join('')}</div><div class="hint" style="margin-top:6px">点评:${esc(r.judge.comment||'—')}</div>`:`<div class="alert bad" style="margin:12px 0 0"><div>这条评审失败:${esc(r.judge.error)}(不影响其它条目,总分按规则分计算)</div></div>`):''}
    <div class="hint" style="margin:12px 0 6px">人工标注</div><div class="row"><button class="btn sm ${r.human.mark==='good'?'green':''}" data-mk="${r.idx}:good">标记为好</button><button class="btn sm" data-mk="${r.idx}:bad">标记为差</button><input type="text" data-note="${r.idx}" value="${esc(r.human.note)}" placeholder="备注:哪里好 / 哪里不行(随运行记录一起保存)" style="flex:1"></div>`;
  } else d='<span class="hint">还没跑到这一条</span>';
  return main+`<tr class="detail"><td colspan="8">${d}</td></tr>`;
}
function exportJson(){
  const o={meta:{time:E.runMeta.time,model:E.runMeta.model,promptId:E.runMeta.promptId,cfg:E.runMeta.cfg},summary:Core.aggregate(E.results,{priceIn:E.cfg.priceIn,priceOut:E.cfg.priceOut}),results:E.results};
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(o,null,2)],{type:'application/json'})); a.download='eval-run-'+E.runMeta.promptId+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function saveRun(){
  const runs=lsGet('hs_evalRuns',[]);
  const agg=Core.aggregate(E.results,{priceIn:E.cfg.priceIn,priceOut:E.cfg.priceOut});
  runs.unshift({id:'run'+Date.now(),time:E.runMeta.time,model:E.runMeta.model,promptId:E.runMeta.promptId,snap:E.runMeta.snap,cfg:E.runMeta.cfg,caseCount:new Set(E.results.map(r=>r.caseId)).size,agg,results:E.results.map(r=>({...r}))});
  while(runs.length>15) runs.pop();
  if(!lsSet('hs_evalRuns',runs)){toast('保存失败:浏览器存储空间不足,请先在“历史与对比”删除旧记录',4000);return;}
  E.runMeta.saved=true; toast('已保存,提示词快照 '+E.runMeta.promptId+' 已一并存下,可到「历史与对比」做 A/B'); drawResults();
}

/* ───────── 框架 ───────── */
function renderTabs(){
  $('#etabs').innerHTML=[['cases','用例管理'],['run','跑评测'],['hist','历史与对比']].map(([k,t])=>`<button class="${E.tab===k?'on':''}" data-t="${k}">${t}</button>`).join('');
  $$('#etabs button').forEach(b=>b.onclick=()=>{E.tab=b.dataset.t;history.replaceState(null,'','#'+E.tab);show();});
}
function show(){
  renderTabs();
  const m=Store.get('model'); $('#modelBadge').innerHTML=`<span class="badge ${m.mode==='mock'?'warn':'ok'}">${esc(modelLabel())}</span>`;
  if(E.tab==='cases') viewCases(); else if(E.tab==='run') viewRun(); else if(E.viewHist) E.viewHist();
}
E.show=show;
E.init=async function(){
  await Store.init();
  E.cases=Store.get('evalCases'); E.cfg=Object.assign(defaultCfg(),lsGet('hs_evalCfg',{}));
  if(!E.cases.length && Store.source('evalCases')==='default'){ /* 首次进入:留空,让用户点“生成种子用例” */ }
  const h=location.hash.slice(1); if(['cases','run','hist'].includes(h)) E.tab=h;
  show();
};
window.addEventListener('beforeunload',e=>{ if(E.running){e.preventDefault();e.returnValue='';} });
return E;
})();
