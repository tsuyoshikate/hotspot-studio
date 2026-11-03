/* 评测台:历史与 A/B 对比 */
(function(){
const E=window.E; const fx=E.fx, pill=E.pill;
let selA=null, selB=null;
const runs=()=>E.lsGet('hs_evalRuns',[]);
const fmt=t=>new Date(t).toLocaleString('zh-CN');

E.viewHist=function(){
  const rs=runs();
  $('#eview').innerHTML=`<h3 style="margin:0">历史与 A/B 对比</h3><div class="sub">选两次运行做对比:指标变化、逐用例总分变化,并高亮“这次改动之后反而变差”的用例。每次保存运行时,当时用的提示词会原样存一份。</div>
  <div class="card" style="margin-bottom:16px"><div class="row pad" style="justify-content:space-between"><div><b>历史运行</b><div class="hint">共 ${rs.length} 条记录 · 来源:本机浏览器</div></div><button class="btn sm" id="hRef">刷新</button></div>
  ${!rs.length?'<div class="empty">还没有保存过的运行。到「跑评测」跑一轮,点“保存本次运行”。</div>':`<table><thead><tr><th>保存时间</th><th>模型</th><th>用例</th><th>任务</th><th>总分</th><th>规则通过</th><th>违禁 / 幻觉</th><th>prompt</th><th>对比</th></tr></thead><tbody>
  ${rs.map(r=>`<tr><td>${fmt(r.time)}</td><td>${esc(r.model)}</td><td>${r.caseCount}</td><td>${r.agg.total}</td><td>${pill(r.agg.avgTotal)}</td><td>${r.agg.rulePassRate==null?'—':fx(r.agg.rulePassRate)+'%'}</td><td>${r.agg.banned} / ${r.agg.fake}</td><td><span class="codeid">${r.promptId}</span></td>
   <td style="white-space:nowrap"><button class="btn sm ${selA===r.id?'primary':''}" data-a="${r.id}">设为 A</button> <button class="btn sm ${selB===r.id?'primary':''}" data-b="${r.id}">设为 B</button> <button class="btn sm danger" data-d="${r.id}">删除</button></td></tr>`).join('')}</tbody></table>`}</div>
  <div id="abBox"></div>`;
  $('#hRef').onclick=E.viewHist;
  $$('[data-a]').forEach(b=>b.onclick=()=>{selA=b.dataset.a;E.viewHist();});
  $$('[data-b]').forEach(b=>b.onclick=()=>{selB=b.dataset.b;E.viewHist();});
  $$('[data-d]').forEach(b=>b.onclick=async()=>{ if(!await confirmBox('删除这条历史运行?','删除')) return; E.lsSet('hs_evalRuns',runs().filter(r=>r.id!==b.dataset.d)); if(selA===b.dataset.d)selA=null; if(selB===b.dataset.d)selB=null; E.viewHist(); });
  drawAB();
};

function drawAB(){
  const box=$('#abBox'); if(!box) return;
  if(!selA||!selB){ box.innerHTML=`<div class="card empty">在上表里分别点一次“设为 A”(基线)和“设为 B”(本次),这里就会显示对比。${runs().length<2?'<br>(至少需要保存两次运行)':''}</div>`; return; }
  if(selA===selB){ box.innerHTML='<div class="card empty">A 和 B 是同一次运行,请选两次不同的运行。</div>'; return; }
  const A=runs().find(r=>r.id===selA), B=runs().find(r=>r.id===selB);
  if(!A||!B){box.innerHTML='<div class="card empty">选中的运行已被删除。</div>';return;}
  const rows=Core.compareRuns(A,B); const worse=rows.filter(r=>r.delta!=null&&r.delta<-0.05);
  const same=A.promptId===B.promptId;
  const diff=Core.diffSnap(A.snap,B.snap);
  const a=A.agg, b=B.agg;
  // [指标, a, b, 越高越好(1) / 越低越好(-1) / 中性(0), 后缀, 小数]
  const M=[['平均总分',a.avgTotal,b.avgTotal,1,''],['规则均分',a.avgRule,b.avgRule,1,''],['评委均分',a.avgJudge,b.avgJudge,1,''],['规则通过率',a.rulePassRate,b.rulePassRate,1,'%'],
    ['全项通过条数',a.allPass,b.allPass,1,''],['违禁词命中',a.banned,b.banned,-1,''],['价格幻觉',a.fake,b.fake,-1,''],['平均字数',a.avgChars,b.avgChars,0,''],['总 token',a.tin+a.tout,b.tin+b.tout,-1,''],['预估费用',a.cost,b.cost,-1,'元']];
  const delta=(x,y,dir,suf)=>{
    if(x==null||y==null) return '<span class="hint">—</span>';
    const d=Math.round((y-x)*(suf==='元'?10000:10))/(suf==='元'?10000:10);
    if(d===0) return '<span class="hint">±0</span>';
    const good=dir===0?null:(dir>0?d>0:d<0);
    const c=good==null?'hint':good?'diff-up':'diff-down';
    return `<b class="${c}">${d>0?'↑+'+d:'↓'+Math.abs(d)}${suf==='%'?'%':suf==='元'?'元':''}</b>`;
  };
  const f2=(v,suf)=>v==null?'—':(suf==='元'?v.toFixed(4):fx(v))+(suf==='%'?'%':suf==='元'?'元':'');
  box.innerHTML=`<div class="card pad"><div class="row"><div style="flex:1"><b>A/B 对比</b><div class="hint">A ${fmt(A.time)} <span class="codeid">${A.promptId}</span> → B ${fmt(B.time)} <span class="codeid">${B.promptId}</span></div></div><button class="btn sm" id="abClr">清除选择</button></div>
    <div class="card pad" style="background:var(--bg);margin:12px 0;font-size:12.5px">${same?'两次运行使用的是<b>同一版提示词</b>,分差主要来自模型随机性。':'<b>提示词差异:</b>'+diff.join(' · ')}<br>${a.total!==b.total?`<span style="color:var(--warn)">两次的任务数不同(A ${a.total} 条,B ${b.total} 条),token 和费用不能直接比。</span><br>`:''}模型:A ${esc(A.model)} → B ${esc(B.model)} · 评委:A ${A.cfg.judgeOn?'开':'关'} → B ${B.cfg.judgeOn?'开':'关'}${A.cfg.styleCount!==B.cfg.styleCount?` · 风格数 ${A.cfg.styleCount} → ${B.cfg.styleCount}`:''}</div>
    ${worse.length?`<div class="alert bad" style="margin:0 0 12px"><div>有 <b>${worse.length}</b> 个用例在 B 里变差了(下表已高亮),改 prompt 前请先看这几条的文案全文。</div></div>`:'<div class="alert ok" style="margin:0 0 12px"><div>没有用例在 B 里变差。</div></div>'}
    <h4 style="margin:0 0 6px">整体指标</h4>
    <table><thead><tr><th>指标</th><th>A(基线)</th><th>B(本次)</th><th>变化</th></tr></thead><tbody>${M.map(m=>`<tr><td>${m[0]}</td><td>${f2(m[1],m[4])}</td><td>${f2(m[2],m[4])}</td><td>${delta(m[1],m[2],m[3],m[4])}</td></tr>`).join('')}</tbody></table>
    <h4 style="margin:18px 0 6px">逐用例总分(按变化从差到好排序)</h4>
    <table><thead><tr><th>用例</th><th>A 总分</th><th>B 总分</th><th>变化</th><th>A 规则</th><th>B 规则</th><th>A 评委</th><th>B 评委</th></tr></thead><tbody>
    ${rows.map(r=>`<tr class="${r.delta!=null&&r.delta<-0.05?'worse':''}"><td>${esc(r.name.length>30?r.name.slice(0,30)+'…':r.name)}</td><td>${pill(r.at)}</td><td>${pill(r.bt)}</td>
      <td>${r.delta==null?'<span class="hint">—</span>':`<b class="${r.delta<0?'diff-down':r.delta>0?'diff-up':'hint'}">${r.delta>0?'↑+'+r.delta:r.delta<0?'↓'+Math.abs(r.delta):'±0'}</b>`}</td><td>${fx(r.ar)}</td><td>${fx(r.br)}</td><td>${fx(r.aj)}</td><td>${fx(r.bj)}</td></tr>`).join('')}</tbody></table></div>`;
  $('#abClr').onclick=()=>{selA=selB=null;E.viewHist();};
}
E.init();
})();
