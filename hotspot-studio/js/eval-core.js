/* 评测核心(和界面分开,工作台也可以直接用):模型评审、总分、批量运行、汇总、A/B 对比。 */
(function(){
const C=window.Core;
const DIMS=['热点关联度','素材还原度','传播吸引力','语气自然度'];
C.JUDGE_DIMS=DIMS;
const hash=s=>{let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h;};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ───────── 容错解析:模型常会多写废话或用代码块包住 ───────── */
C.parseJudge=function(raw){
  let t=String(raw||'').replace(/```(?:json)?/gi,'');
  const a=t.indexOf('{'), b=t.lastIndexOf('}');
  let obj=null;
  if(a>=0&&b>a){ try{obj=JSON.parse(t.slice(a,b+1));}catch(e){ try{obj=JSON.parse(t.slice(a,b+1).replace(/,\s*}/g,'}').replace(/'/g,'"'));}catch(e2){} } }
  const scores={}; let ok=true;
  DIMS.forEach(d=>{
    let v=obj&&obj[d]!=null?Number(obj[d]):NaN;
    if(isNaN(v)){const m=t.match(new RegExp('["\']?'+d+'["\']?\\s*[::=]\\s*["\']?(\\d(?:\\.\\d)?)'));if(m) v=Number(m[1]);}
    if(isNaN(v)) ok=false; else scores[d]=clamp(Math.round(v),1,5);
  });
  let comment=(obj&&obj.点评)||''; if(!comment){const m=t.match(/点评["']?\s*[::]\s*["']?([^"'\n}]+)/); if(m) comment=m[1];}
  return ok?{ok:true,scores,comment:String(comment).trim()}:{ok:false,error:'没能从模型回复里解析出四项评分'};
};
// 评审:让另一次模型调用打分。解析失败只标记这条评审失败,不抛出。
C.judge=async function(text,ctx,opt){
  opt=opt||{}; const m=Store.get('model'); const P=Store.get('prompts');
  const res=C.validate(text,ctx);
  if(m.mode==='mock'){
    await sleep(opt.fast?80:300);
    const h=hash(text+ctx.news.id);
    const base=res.score/100*5; const scores={};
    DIMS.forEach((d,i)=>{ const noise=((h>>(i*3))%5)/4-0.9; let v=base+noise; if(d==='素材还原度'&&res.checks.find(c=>c.id==='price'&&!c.pass)) v-=1.5; if(d==='语气自然度'&&!res.checks.find(c=>c.id==='markup').pass) v-=1.5; scores[d]=clamp(Math.round(v),1,5); });
    const avg=DIMS.reduce((a,d)=>a+scores[d],0)/4;
    return {ok:true,scores,avg,comment:avg>=4?'借势自然,卖点和价格用得准(模拟评审)':avg>=3?'整体可用,个别地方偏硬(模拟评审)':'问题较多,建议先修正硬伤(模拟评审)',usage:{in:Math.round(text.length/1.2),out:60},mock:true};
  }
  const prompt=C.renderTpl(P.judge,{素材:C.materialText(ctx),文案:text});
  try{
    const r=await C.callLLM([{role:'user',content:prompt}],{temperature:m.judgeTemp!=null?m.judgeTemp:0.2,timeout:60000});
    const p=C.parseJudge(r.text);
    if(!p.ok) return {ok:false,error:p.error+'(原始回复:'+r.text.slice(0,60)+'…)',usage:r.usage};
    return {ok:true,scores:p.scores,avg:DIMS.reduce((a,d)=>a+p.scores[d],0)/4,comment:p.comment,usage:r.usage};
  }catch(e){ return {ok:false,error:e.message,usage:{in:0,out:0}}; }
};
C.judgeScore=j=>j&&j.ok?Math.round(j.avg/5*1000)/10:null; // 1~5 分折成 0~100(这里按 5 分制线性折算)
C.totalScore=function(ruleScore,judge,cfg){
  const js=C.judgeScore(judge);
  if(!cfg.judgeOn||js==null) return ruleScore;
  const wr=+cfg.wRule||0, wj=+cfg.wJudge||0; if(wr+wj<=0) return ruleScore;
  return Math.round((ruleScore*wr+js*wj)/(wr+wj)*10)/10;
};

/* ───────── 提示词快照:保存每次运行时用的提示词,做对比的锚点 ───────── */
C.snapshot=function(){
  const P=Store.get('prompts'), st=Store.get('styles'), R=Store.get('rules');
  const snap={system:P.system,material:P.material,item:P.item,rework:P.rework,judge:P.judge,styles:st.map(s=>({name:s.name,req:s.req})),rules:R};
  const id=hash(JSON.stringify(snap)).toString(36).padStart(7,'0').slice(0,7);
  return {id,snap};
};
C.diffSnap=function(a,b){
  const names={system:'system(规范)',material:'素材模板',item:'商品行模板',rework:'返工说明',judge:'评审提示词'};
  const out=[]; Object.keys(names).forEach(k=>out.push(a[k]===b[k]?names[k]+'未变':names[k]+'已改'));
  out.push(JSON.stringify(a.styles)===JSON.stringify(b.styles)?`风格未变(${b.styles.length} 个)`:`风格已改(${a.styles.length} → ${b.styles.length} 个)`);
  out.push(JSON.stringify(a.rules)===JSON.stringify(b.rules)?'规则未变':'规则已改');
  return out;
};

/* ───────── 预估 ───────── */
C.estimate=function(cfg){
  const cases=cfg.cases, styles=cfg.styles;
  const tasks=cases.length*styles.length*cfg.repeat; let tin=0,tout=0;
  const sysLen=C.systemText().length;
  cases.forEach(cs=>styles.forEach(st=>{
    const ctx=cfg.ctxOf(cs,st); const inn=(sysLen+C.materialText(ctx).length)/1.6;
    for(let i=0;i<cfg.repeat;i++){ tin+=inn; tout+=260; if(cfg.judgeOn){tin+=inn*0.5+260/1.2+120;tout+=90;} }
  }));
  tin=Math.round(tin); tout=Math.round(tout);
  return {tasks,tin,tout,cost:(tin*cfg.priceIn+tout*cfg.priceOut)/1e6};
};

/* ───────── 批量运行:受控并发,可中止,边跑边回报 ───────── */
C.runEval=async function(cfg,hooks){
  hooks=hooks||{}; const m=Store.get('model');
  const jobs=[]; cfg.cases.forEach(cs=>cfg.styles.forEach(st=>{for(let r=0;r<cfg.repeat;r++) jobs.push({cs,st,rep:r});}));
  const results=jobs.map((j,i)=>({idx:i,caseId:j.cs.id,caseName:j.cs.name,caseTitle:j.cs.newsTitle,styleName:j.st.name,rep:j.rep,status:'等待',text:'',usage:{in:0,out:0},ms:0,human:{mark:'',note:''}}));
  let done=0, stop=false, next=0; const t0=performance.now();
  hooks.abort=()=>{stop=true;};
  async function work(){
    while(!stop){
      const i=next++; if(i>=jobs.length) return;
      const j=jobs[i], r=results[i]; r.status='运行中'; hooks.onUpdate&&hooks.onUpdate(results,done,t0);
      const ctx=cfg.ctxOf(j.cs,j.st); const ts=performance.now();
      try{
        const g=await C.generate(ctx,{fast:true,flawRate:cfg.flawRate,seed:'r'+j.rep});
        let text=g.text; r.usage.in+=g.usage.in; r.usage.out+=g.usage.out; r.model=g.model;
        let res=C.validate(text,ctx);
        r.beforeFix=null;
        if(cfg.autoFix && res.failed.some(c=>c.fixable)){
          const before=res.score; const f=await C.autoFix(text,ctx,{maxRounds:2,fast:true});
          r.usage.in+=f.usage.in; r.usage.out+=f.usage.out;
          r.beforeFix={score:before,rounds:f.log.length,fixedAll:f.res.pass,hadHard:res.hardFails.length>0};
          text=f.text; res=f.res;
        }
        r.text=text; r.res=res; r.ruleScore=res.score; r.chars=res.chars;
        if(cfg.judgeOn){ r.judge=await C.judge(text,ctx,{fast:true}); r.usage.in+=(r.judge.usage||{in:0}).in; r.usage.out+=(r.judge.usage||{out:0}).out; }
        r.total=C.totalScore(r.ruleScore,r.judge,cfg);
        r.status=stop&&false?'中止':'完成';
      }catch(e){ r.status='失败'; r.err=e.message==='MOCK'?'模拟出错':e.message; }
      r.ms=Math.round(performance.now()-ts); done++; hooks.onUpdate&&hooks.onUpdate(results,done,t0);
    }
  }
  const n=Math.max(1,Math.min(8,cfg.concurrency||3));
  await Promise.all(Array.from({length:n},work));
  results.forEach(r=>{ if(r.status==='等待'||r.status==='运行中') r.status='中止'; });
  return {results,aborted:stop,ms:Math.round(performance.now()-t0)};
};

/* ───────── 汇总 ───────── */
C.aggregate=function(results,cfg){
  const ok=results.filter(r=>r.status==='完成'&&r.res);
  const sum=(a,f)=>a.reduce((x,y)=>x+f(y),0), avg=(a,f)=>a.length?Math.round(sum(a,f)/a.length*10)/10:null;
  const checks=sum(ok,r=>r.res.checks.length), passed=sum(ok,r=>r.res.checks.filter(c=>c.pass).length);
  const judged=ok.filter(r=>r.judge&&r.judge.ok);
  const bannedHit=ok.filter(r=>r.res.checks.find(c=>c.id==='banned'&&!c.pass));
  const bannedWords=sum(bannedHit,r=>(r.res.checks.find(c=>c.id==='banned').msg.split(':')[1]||'').split('、').filter(Boolean).length);
  const fake=ok.filter(r=>r.res.checks.find(c=>c.id==='price'&&!c.pass));
  const tin=sum(results,r=>r.usage.in), tout=sum(results,r=>r.usage.out);
  return {
    total:results.length, valid:ok.length, avgTotal:avg(ok,r=>r.total), rulePassRate:checks?Math.round(passed/checks*1000)/10:null,
    avgRule:avg(ok,r=>r.ruleScore), avgJudge:judged.length?avg(judged,r=>C.judgeScore(r.judge)):null, judged:judged.length,
    allPass:ok.filter(r=>r.res.pass).length, banned:bannedHit.length, bannedWords, fake:fake.length,
    avgChars:avg(ok,r=>r.chars), tin, tout, cost:(tin*cfg.priceIn+tout*cfg.priceOut)/1e6,
    failed:results.filter(r=>r.status==='失败').length, stopped:results.filter(r=>r.status==='中止').length,
    fixed:ok.filter(r=>r.beforeFix&&r.beforeFix.fixedAll).length, hadFix:ok.filter(r=>r.beforeFix).length,
    ms:sum(results,r=>r.ms)
  };
};

/* ───────── A/B 对比 ───────── */
C.compareRuns=function(A,B){
  const byCase=run=>{const m={};run.results.filter(r=>r.status==='完成').forEach(r=>{(m[r.caseId]=m[r.caseId]||{name:r.caseName,t:[],r:[],j:[]}); m[r.caseId].t.push(r.total); m[r.caseId].r.push(r.ruleScore); if(r.judge&&r.judge.ok) m[r.caseId].j.push(C.judgeScore(r.judge));}); return m;};
  const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length*10)/10:null;
  const a=byCase(A), b=byCase(B); const ids=[...new Set([...Object.keys(a),...Object.keys(b)])];
  const rows=ids.map(id=>{
    const x=a[id], y=b[id];
    const at=x?mean(x.t):null, bt=y?mean(y.t):null;
    return {id,name:(x||y).name,at,bt,delta:at!=null&&bt!=null?Math.round((bt-at)*10)/10:null,ar:x?mean(x.r):null,br:y?mean(y.r):null,aj:x?mean(x.j):null,bj:y?mean(y.j):null};
  });
  rows.sort((p,q)=>(p.delta==null?1e9:p.delta)-(q.delta==null?1e9:q.delta));
  return rows;
};
})();
