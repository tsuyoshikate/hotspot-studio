/* 核心逻辑(与界面分开,工作台和评测台共用)。按阶段逐步增加。 */
window.Core = (function(){

  /* ───────── 阶段1:风险识别(可用性) ───────── */
  // 返回 {level:'forbid'|'review'|'ok', type, hits:[]}。禁止借势优先于需人工判断。
  function assessRisk(item, rules){
    rules = rules || Store.get('riskRules');
    const text=(item.title||'')+' '+(item.summary||'');
    let review=null;
    for(const r of rules){
      const hits=r.words.filter(w=>w && text.includes(w));
      if(!hits.length) continue;
      if(r.level==='forbid') return {level:'forbid',type:r.type,hits};
      if(!review) review={level:'review',type:r.type,hits};
    }
    return review||{level:'ok',type:'',hits:[]};
  }

  /* ───────── 阶段1:新闻抓取 ───────── */
  function heatBadge(h){return h>=95?'爆':h>=85?'升':'新';}
  async function fetchWithTimeout(url,ms){
    const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),ms);
    try{return await fetch(url,{signal:ctl.signal});} finally{clearTimeout(t);}
  }
  function normalizeLive(items,platform){
    return items.map((it,i)=>{
      const heat=Math.max(55,99-i*2);
      return {id:platform+'_'+i+'_'+(it.title||'').length,title:it.title,summary:it.summary||`${platform}第${i+1}位,话题正在快速发酵。`,
        platform,heat,badge:heatBadge(heat),tag:(it.tag||it.title||'').replace(/[#\s]/g,'').slice(0,20),ago:'刚刚',live:true};
    });
  }
  // 对每个启用的来源抓取一次,逐个返回结果(成功/失败、条数、耗时、原因)
  async function fetchSource(src){
    const t0=performance.now();
    if(src.url==='demo'){
      const items=Store.get('news');
      return {src,ok:true,count:items.length,ms:Math.round(performance.now()-t0),items:items.map(n=>({...n,platform:n.platform,demo:true}))};
    }
    try{
      const q=src.kind==='builtin'?`source=${encodeURIComponent(src.url)}`:`url=${encodeURIComponent(src.url)}`;
      const r=await fetchWithTimeout('/api/hot?'+q,8000);
      if(!r.ok){
        let msg=''; try{msg=(await r.json()).error||''}catch(e){}
        throw new Error(msg||(r.status===404?'接口不存在(当前环境没有后端函数)':'服务返回 '+r.status));
      }
      const j=await r.json();
      if(!j.items||!j.items.length) throw new Error(j.error||'没有抓到条目');
      return {src,ok:true,count:j.items.length,ms:Math.round(performance.now()-t0),items:normalizeLive(j.items,src.name)};
    }catch(e){
      let reason=e.name==='AbortError'?'超时(8秒无响应)':(e.message||'未知错误');
      if(/Failed to fetch|NetworkError/i.test(reason)) reason='网络不通或接口不可达';
      return {src,ok:false,count:0,ms:Math.round(performance.now()-t0),reason,items:[]};
    }
  }
  async function fetchAllSources(){
    const srcs=Store.get('sources').filter(s=>s.enabled);
    const results=await Promise.all(srcs.map(fetchSource));
    return results;
  }
  function mergeNews(results){
    const seen=new Set(); const out=[];
    results.forEach(r=>r.items.forEach(n=>{ if(seen.has(n.title)) return; seen.add(n.title); out.push(n); }));
    return out.sort((a,b)=>b.heat-a.heat);
  }

  /* ───────── 阶段2:热点 → 商品 + 客户画像 智能匹配 ───────── */
  function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h;}
  function bigrams(s){const o=new Set();s=String(s).replace(/[\s,。、:;!?·()()“”"'#]/g,'');for(let i=0;i<s.length-1;i++)o.add(s.slice(i,i+2));return o;}
  const shortName=p=>(p&&(p.short||String(p.name||'').split(/[·(()]/)[0]))||'';
  function personaById(id){return Store.get('personas').find(x=>x.id===id)||null;}
  // 返回按匹配度降序的 [{p, score, why, scene, persona}]。同一个商品对应多个画像:从命中场景的画像里挑一个这个商品也适合的。
  function matchProducts(news, products){
    products = products || Store.get('products');
    const text=(news.title||'')+(news.summary||'');
    const scenes=window.DEFAULTS.scenes.filter(sc=>sc.kw.some(k=>text.includes(k)));
    const tb=bigrams(text);
    const out=products.map(p=>{
      let score=60, hit=[], sceneName='', best=0, persona=null;
      const pb=bigrams(p.name+p.tags.join(''));
      let ov=0; pb.forEach(g=>{if(tb.has(g)) ov++;});
      for(const sc of scenes){ // 取该商品与各命中场景里最契合的一个
        let s=0, h=[];
        if(sc.cats.includes(p.cat)){s+=18;h.push(p.cat);}
        const tagHits=p.tags.filter(t=>sc.tags.some(w=>t.includes(w)||w.includes(t)));
        if(tagHits.length){s+=Math.min(tagHits.length*10,20);h.push(...tagHits);}
        const pid=(sc.personas||[]).find(id=>(p.personas||[]).includes(id));
        if(pid) s+=8;
        if(s>best){best=s;hit=h;sceneName=sc.scene;persona=pid||null;}
      }
      score+=best;
      score+=Math.min(ov*3,6);
      score+=hash(p.id+news.id)%3;
      score=Math.max(55,Math.min(98,score));
      if(!sceneName){sceneName='通用推荐';hit=[p.cat];}
      if(!persona) persona=(p.personas||[])[0]||null;
      const pn=personaById(persona);
      return {p,score,scene:sceneName,persona,why:`热点命中「${sceneName}」场景,「${[...new Set(hit)].slice(0,3).join('、')}」契合${pn?`;适合对「${pn.name}」说`:''}`};
    });
    return out.sort((a,b)=>b.score-a.score);
  }
  // 真实素材:默认不用。只有新闻话题命中某张卡的「只用于」关键词才带上,最多 1 张(命中词最多的)。
  function matchMaterial(news, cards){
    cards = cards || Store.get('materials');
    const text=(news.title||'')+(news.summary||'');
    let best=null, n=0;
    cards.forEach(c=>{ const hits=(c.kw||[]).filter(k=>k&&text.includes(k)); if(hits.length>n){n=hits.length;best={card:c,hits};} });
    return best;
  }

  return {assessRisk,fetchSource,fetchAllSources,mergeNews,heatBadge,matchProducts,matchMaterial,personaById,shortName};
})();
