/* 阶段3:提示词渲染、文案生成(模拟/真实模型)、机器校验、修正。扩展 Core。 */
(function(){
const C=window.Core;
const clone=o=>JSON.parse(JSON.stringify(o));

/* ───────── 提示词模板:占位符渲染 ───────── */
C.PLACEHOLDERS={
  system:[['字数下限','规则里的最少字数'],['字数上限','规则里的最多字数'],['标题上限','标题字数上限'],['标签上限','话题标签总数上限'],['违禁词','广告法违禁词清单(用顿号连接)']],
  material:[['热点标题','选中热点的标题'],['热点摘要','热点摘要'],['话题标签','如 #xxx#'],['画像名','这次要对谁说'],['画像是谁','画像:是谁'],['画像处境','画像:当下处境'],['画像痛点','画像:痛点'],['画像问题','画像:真实会问的问题(没有就写无)'],['画像想要','画像:想要的结果'],['画像后果','画像:不行动的后果(没有就写无)'],['画像讲法','画像:讲法提示'],['风格名','创作风格名称'],['风格要求','创作风格的要求'],['商品清单','所有商品按“单件呈现格式”渲染后拼起来'],['真实素材','命中的真实素材卡(没命中会写明不要编经历)']],
  item:[['商品名','商品名称'],['卖点','卖点说明'],['适合人群','适合哪些人'],['品类','品类'],['价格','价格;商品库没填价格时会写“未提供,不要写价格”'],['售价','售价(没填是空)'],['原价','原价(没填是空)']],
  rework:[['问题清单','校验发现的问题'],['可用金额','商品库里真实的金额(没有就写无)'],['原文案','待修正的笔记']],
  judge:[['素材','热点、画像和商品素材'],['文案','待评审笔记']]
};
// 遇到不认识的占位符原样保留(运营写错时能一眼看出来)
C.renderTpl=function(tpl,vars){
  return String(tpl).replace(/\{([^{}\n]{1,12})\}/g,(m,k)=>Object.prototype.hasOwnProperty.call(vars,k)?String(vars[k]):m);
};
const hasPrice=p=>p&&p.price!==null&&p.price!==undefined&&p.price!==''&&isFinite(+p.price);
C.hasPrice=hasPrice;
C.itemText=function(p,tpl){
  tpl=tpl||Store.get('prompts').item;
  return C.renderTpl(tpl,{商品名:p.name,卖点:p.selling||(p.tags||[]).join('、'),适合人群:p.audience||'',品类:p.cat,价格:(hasPrice(p)&&Store.get('rules').allowPrice)?'¥'+p.price:'内部参考,不要写价格',售价:hasPrice(p)?p.price:'',原价:p.orig==null?'':p.orig});
};
C.systemText=function(P,R){
  P=P||Store.get('prompts'); R=R||Store.get('rules');
  return C.renderTpl(P.system,{字数下限:R.minLen,字数上限:R.maxLen,标题上限:R.titleMax,标签上限:R.maxTags,违禁词:R.banned.join('、')});
};
// 这次要对谁说:ctx 里指定的画像 > 第一件商品的第一个画像
C.ctxPersona=function(ctx){
  if(ctx.persona&&typeof ctx.persona==='object') return ctx.persona;
  const all=Store.get('personas'); if(ctx.persona) {const f=all.find(x=>x.id===ctx.persona||x.name===ctx.persona); if(f) return f;}
  const p0=ctx.products&&ctx.products[0]; const id=p0&&(p0.personas||[])[0];
  return all.find(x=>x.id===id)||all[0]||null;
};
// 这次能用的真实素材:没有命中的话题就是 null(默认不用)
C.ctxMaterial=function(ctx){
  if(ctx.material!==undefined) return ctx.material;
  const m=C.matchMaterial(ctx.news); return m?m.card:null;
};
C.materialCardText=function(card){
  if(!card) return '无。这条热点没有对得上的真实素材,不要写任何个人经历或学员故事。';
  return `卡片「${card.title}」\n可以写:${(card.can||[]).join(';')}\n不要写:${(card.cannot||[]).join(';')}\n参考写法(只能用这里的事实,不许添加或夸大):${card.use||''}`;
};
C.materialText=function(ctx,P){
  P=P||Store.get('prompts');
  const list=ctx.products.map(p=>C.itemText(p,P.item)).join('\n');
  const ps=C.ctxPersona(ctx)||{}; const or=v=>(v&&String(v).trim())?v:'无';
  return C.renderTpl(P.material,{热点标题:ctx.news.title,热点摘要:ctx.news.summary,话题标签:'#'+ctx.news.tag+'#',
    画像名:ps.name||'',画像是谁:or(ps.who),画像处境:or(ps.situation),画像痛点:or(ps.pain),画像问题:or(ps.question),画像想要:or(ps.want),画像后果:or(ps.consequence),画像讲法:or(ps.pitch),
    风格名:ctx.style?ctx.style.name:'',风格要求:ctx.style?ctx.style.req:'',商品清单:list,真实素材:C.materialCardText(C.ctxMaterial(ctx))});
};
C.buildMessages=function(ctx,P,R){
  const system=C.systemText(P,R), user=C.materialText(ctx,P);
  return {system,user,messages:[{role:'system',content:system},{role:'user',content:user}]};
};
C.realPrices=function(products){
  const s=new Set(); if(!Store.get('rules').allowPrice) return []; (products||[]).forEach(p=>{ if(hasPrice(p)) s.add(+p.price); if(p.orig!==null&&p.orig!==undefined&&p.orig!==''&&isFinite(+p.orig)) s.add(+p.orig); }); return [...s];
};

/* ───────── 真实模型调用(代理 / 直连) ───────── */
function humanErr(status,body,m){
  const b=String(body||'');
  if(status===401||status===403) return '密钥无效或没有权限('+status+')';
  if(status===402||/insufficient|balance|quota|欠费|余额/i.test(b)) return '账户余额不足或额度用完';
  if(status===404||/model.*(not|does)|不存在/i.test(b)) return '模型名不存在或接口地址不对('+m.model+')';
  if(status===429) return '请求太频繁,被服务商限流,请稍后再试';
  if(status===504||status===408) return '请求超时';
  if(status>=500) return '服务商暂时不可用('+status+')';
  return '调用失败('+status+')'+(b?':'+b.slice(0,120):'');
}
C.callLLM=async function(messages,opt){
  opt=opt||{}; const m=opt.modelCfg||Store.get('model'); const t0=performance.now();
  if(m.mode==='mock') throw new Error('MOCK');
  if(m.mode==='dify') throw new Error('当前接入方式是 Dify 工作流,它只负责写文案。返工、评审需要大模型:请改用「服务端代理」,或先在 Dify 里改稿');
  const temperature=opt.temperature!=null?opt.temperature:m.temperature;
  let url,headers={'content-type':'application/json'},body;
  if(m.mode==='proxy'){url='/api/chat';headers['x-access-code']=m.accessCode||'';body={messages,temperature,model:m.model};}
  else{
    if(!m.apiKey) throw new Error('还没有填写密钥,请到后台「模型参数」填写');
    if(!m.baseUrl) throw new Error('还没有填写接口地址');
    url=m.baseUrl.replace(/\/$/,'')+'/chat/completions'; headers.authorization='Bearer '+m.apiKey;
    body={model:m.model,messages,temperature,stream:false};
  }
  const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(),opt.timeout||60000);
  let r;
  try{r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:ctl.signal});}
  catch(e){
    throw new Error(e.name==='AbortError'?'请求超时':(m.mode==='direct'?'网络不通,或该服务商不允许浏览器直连(跨域限制),建议改用服务端代理':'网络不通或接口不可达'));
  }finally{clearTimeout(to);}
  const raw=await r.text(); let j=null; try{j=JSON.parse(raw);}catch(e){}
  if(!r.ok && m.mode==='proxy' && (r.status===404||r.status===501) && !j) throw new Error('服务端代理接口 /api/chat 不存在(当前环境没有后端函数,请部署到 Vercel 后再用)');
  if(!r.ok) throw new Error(humanErr(r.status,(j&&(j.error&&(j.error.message||j.error)||j.message))||raw,m));
  const text=j&&j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content;
  if(typeof text!=='string') throw new Error('模型返回的格式不对');
  const u=j.usage||{};
  return {text:text.trim(),ms:Math.round(performance.now()-t0),usage:{in:u.prompt_tokens||0,out:u.completion_tokens||0},model:j.model||m.model,via:m.mode==='proxy'?'服务端代理':'浏览器直连',mock:false};
};

/* ───────── 模拟写手(本地模拟模式:不调用任何模型) ───────── */
function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h;}
const dot=s=>String(s||'').replace(/[。.!!??;;,,\s]+$/,'');
function styleIdx(ctx){
  const st=Store.get('styles'); const i=ctx.style?st.findIndex(x=>x.id===ctx.style.id||x.name===ctx.style.name):0; return i<0?0:i;
}
function build(ctx,level){
  const R=Store.get('rules'); const ps=C.ctxPersona(ctx)||{titles:[]}; const mat=C.ctxMaterial(ctx);
  const titles=(ps.titles&&ps.titles.length)?ps.titles:['想学西班牙语,先看这一篇'];
  const title=titles[styleIdx(ctx)%titles.length];
  const prod=ctx.products[0]; const pshort=prod?C.shortName(prod):'西语课';
  const desc=prod?(prod.tags||[]).slice(0,level>=1?1:3).join('、'):'';
  const lines=[];
  lines.push(`你是不是也这样:${dot(ps.situation||'想学西班牙语,又不知道从哪开始')}?`);
  lines.push(`刷到「${ctx.news.title.replace(/(演示用虚构示例)/,'')}」这条的时候,我想到的是:${dot(ps.pain||'这件事值得早点想清楚')}。`);
  if(ps.want) lines.push(`你想要的大概是:${dot(ps.want)}。`);
  if(level<2 && ps.consequence) lines.push(`如果一直拖着:${dot(ps.consequence)}。`);
  if(mat&&level<1) lines.push(mat.use);
  lines.push(`所以我会建议先从${pshort}${/[0-9A-Za-z]$/.test(pshort)?" ":""}开始${desc?`(${desc})`:''},一步一步来。`);
  const tags=['#西班牙语学习#','#'+ctx.news.tag+'#'].slice(0,Math.max(1,R.maxTags));
  return title+'\n\n'+lines.join('\n\n')+'\n\n'+tags.join(' ');
}
C.mockWrite=function(ctx,opt){
  opt=opt||{}; const R=Store.get('rules');
  let level=0, text=build(ctx,0);
  while(text.replace(/\s/g,'').length>R.maxLen-4 && level<2){level++;text=build(ctx,level);}
  const key=(ctx.style&&ctx.style.name)||'';
  const h=hash((ctx.news.id||ctx.news.title||'')+key+(opt.seed||''));
  if(opt.flawRate && (h%100)/100<opt.flawRate){ // 故意夹带一处违规,用来演示校验和一键修正
    const kind=h%3; const parts=text.split('\n\n');
    const at=Math.max(1,parts.length-2);
    if(kind===0) parts.splice(at,0,'学了就一定能拿高分。');
    else if(kind===1) parts[parts.length-1]+=' #'+(R.brand[0]||'小K西语')+'#';
    else parts.splice(at,0,'名额有限,先到先得,再不报就晚了。');
    text=parts.join('\n\n');
  }
  return text;
};
// 修正(模拟):按校验结果做确定性的修改
C.mockFix=function(text,ctx,res){
  const R=Store.get('rules'); let t=text;
  const ids=new Set(res.checks.filter(c=>!c.pass).map(c=>c.id));
  const dropSentences=words=>{ t=t.split(/(?<=[。!?!?\n])/).filter(s=>!words.some(w=>s.includes(w))).join(''); };
  if(ids.has('markup')) t=t.replace(/\*\*|```/g,'').replace(/^\s*#{1,6}\s+/gm,'').replace(/^\s*[-*]\s+/gm,'');
  if(ids.has('banned')) dropSentences(R.banned.filter(w=>t.replace(/第一次/g,'').includes(w)));
  if(ids.has('scarcity')) dropSentences(R.scarcity||[]);
  if(ids.has('invented')) dropSentences(R.experience||[]);
  if(ids.has('selfqa')) dropSentences(R.selfQA||[]);
  if(ids.has('brand')) (R.brand||[]).forEach(b=>{ t=t.split('#'+b+'#').join('').split(b).join(''); });
  if(ids.has('price')) t=t.replace(/[¥￥]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*元/g,'');
  if(ids.has('tags')){
    const all=t.match(/#[^#\s]+#/g)||[]; let k=0;
    all.forEach(x=>{ if(++k>R.maxTags) t=t.replace(x,''); });
    if(R.requireNewsTag){const must='#'+ctx.news.tag+'#'; if(!t.includes(must)) t=t.replace(/\s+$/,'')+' '+must;}
  }
  if(ids.has('title')){
    const ls=t.split('\n'); const i=ls.findIndex(l=>l.trim()); if(i>=0) ls[i]=ls[i].trim().slice(0,R.titleMax); t=ls.join('\n');
  }
  if(ids.has('len')){
    const len=s=>s.replace(/\s/g,'').length;
    let paras=t.split('\n\n'); let g=0;
    while(len(paras.join(''))>R.maxLen && paras.length>3 && g++<8) paras.splice(paras.length-2,1);
    t=paras.join('\n\n');
  }
  if(ids.has('emoji')){
    const n=(t.match(/\p{Extended_Pictographic}/gu)||[]).length;
    if(n<R.minEmoji) t=t.replace(/\s+$/,'')+' ✨'; else if(n>R.maxEmoji){let k=0;t=t.replace(/\p{Extended_Pictographic}/gu,m=>(++k>R.maxEmoji?'':m));}
  }
  if(ids.has('cta')) t=t.replace(/\s+$/,'')+'\n\n你怎么看?评论区聊聊~';
  return t.replace(/\n{3,}/g,'\n\n').replace(/[ \t]+\n/g,'\n').trim();
};

/* ───────── 机器校验 ───────── */
// 标题 = 第一行(去掉“标题:”前缀);Dify 返回的是整份报告,标题和排版符号这两项不查
C.validate=function(text,ctx,rules){
  const R=rules||Store.get('rules'); const t=String(text||'');
  const dify=Store.get('model').mode==='dify';
  const cfg=Store.get('model').dify||{};
  // Dify 模式:只校验「审核说明」标记之前的正文(审核说明里会列出敏感词,不能算违规)
  let body=t; if(dify&&cfg.splitMarker){const i=t.indexOf(cfg.splitMarker); if(i>0) body=t.slice(0,i);}
  const chars=body.replace(/\s/g,'').length;
  const checks=[]; const notes=[];
  const add=(id,label,pass,msg,weight,hard,fixable,okMsg)=>checks.push({id,label,pass,msg:pass&&okMsg?okMsg:msg,weight,hard:!!hard,fixable:fixable!==false});
  const scan=body.replace(/第一次/g,''); // “第一次听懂原声”不算绝对化用语
  const mat=C.ctxMaterial(ctx);
  // 硬伤
  const hits=R.banned.filter(w=>scan.includes(w));
  add('banned','广告法违禁词',!hits.length,`命中违禁词/绝对化承诺:${hits.join('、')}`,20,true,true,'未命中违禁词');
  const brands=(R.brand||[]).filter(w=>w&&body.includes(w));
  add('brand','正文和标签不写品牌名',!brands.length,`出现了机构品牌名:${brands.join('、')}(小红书正文和话题标签里不能写)`,15,true,true,'没有品牌名');
  const sc=(R.scarcity||[]).filter(w=>body.includes(w));
  add('scarcity','不编造稀缺感',!sc.length,`出现了稀缺感/催促说法:${sc.join('、')}(没有真实依据,AI 写出来就是编造)`,10,true,true,'没有稀缺感说法');
  const ex=(R.experience||[]).filter(w=>body.includes(w));
  const st=mat?[]:(R.storyWords||[]).filter(w=>body.includes(w));
  const inv=[...ex,...st];
  add('invented','不编造亲历或案例',!inv.length,`出现了素材库之外的亲历/案例:${inv.join('、')}${mat?'':'(这条热点没有命中真实素材卡,不能写个人经历或学员故事)'}`,15,true,true,'没有素材库之外的亲历或案例');
  const real=C.realPrices(ctx.products); const amts=[];
  const re=/[¥￥]\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*元/g; let m;
  while((m=re.exec(body))) amts.push(+(m[1]||m[2]));
  const fake=[...new Set(amts.filter(a=>!real.includes(a)))];
  add('price','价格与商品库一致',!fake.length,real.length?`出现商品库里没有的金额:¥${fake.join('、¥')};商品库里的金额:¥${real.join('、¥')}`:`出现了金额:¥${fake.join('、¥')}。笔记里不要写价格(或商品库没有这个价格)`,15,true,true,real.length?'价格信息与商品库一致':'没有写价格');
  // 瑕疵
  const qa=(R.selfQA||[]).filter(w=>body.includes(w));
  add('selfqa','不自问自答',!qa.length,`出现自问自答句:${qa.join('、')}`,5,false,true,'没有自问自答句');
  add('len','字数',chars>=(R.minLen||0)&&chars<=R.maxLen,`字数 ${chars}(不含空白),要求${R.minLen?` ${R.minLen}~`:' 不超过 '}${R.maxLen}`,5,false,true,`字数 ${chars},在限制内`);
  if(!dify){
    const first=(body.split('\n').find(l=>l.trim())||'').replace(/^\s*(标题)[::]\s*/,'').trim(); const tl=[...first].length;
    add('title','标题长度',tl>0&&tl<=R.titleMax,`标题 ${tl} 个字,小红书标题要在 ${R.titleMax} 个字以内`,5,false,true,`标题 ${tl} 个字`);
  }
  const tagList=body.match(/#[^#\s]+#/g)||[]; const must='#'+ctx.news.tag+'#';
  const tagOk=tagList.length<=R.maxTags&&(!R.requireNewsTag||body.includes(must));
  add('tags','话题标签',tagOk,tagList.length>R.maxTags?`话题标签 ${tagList.length} 个,超过上限 ${R.maxTags} 个`:`缺少指定话题标签 ${must}`,5,false,true,'话题标签数量合适');
  const ne=(body.match(/\p{Extended_Pictographic}/gu)||[]).length;
  add('emoji','表情符号数量',ne>=R.minEmoji&&ne<=R.maxEmoji,`表情符号 ${ne} 个,要求 ${R.minEmoji}~${R.maxEmoji} 个`,2,false,true);
  if(R.ctaRequired) add('cta','结尾互动引导',R.cta.some(k=>body.slice(-60).includes(k)),'结尾要有互动引导(提问或邀请评论)',3,false,true,'结尾命中互动引导词');
  if(!dify){
    const mk=/\*\*|```|^\s*#{1,6}\s|^\s*[-*]\s|^\s*\d+[.、]\s/m.test(body);
    add('markup','无残留排版符号',!mk,'文案里残留了 markdown 排版符号(如 ** 或 ## 或列表符)',5,false,true,'正文为纯文本');
  }
  const mention=ctx.products.some(p=>{const s=C.shortName(p);return s&&(body.includes(s)||body.includes(s.slice(0,3)));});
  add('mention','提到了商品',mention,'文案里没有提到所选商品',10,false,false,'已提及所选商品');
  // 只提醒、不扣分:需要人工核对的地方(标黄的原则)
  if(/[áéíóúñü¿¡]|[A-Za-z]{5,}/.test(body.replace(/DELE|chimichurri|choripán/g,''))) notes.push('含西班牙语或外文:请西语老师核对');
  const pend=(body.match(/【待核对/g)||[]).length; if(pend) notes.push(`有 ${pend} 处【待核对】,发布前要人工确认`);
  const src=[ctx.news.title,ctx.news.summary,(ctx.products||[]).map(p=>p.name+(p.tags||[]).join('')).join(''),mat?mat.use+mat.title:'',JSON.stringify(C.ctxPersona(ctx)||{})].join(' ');
  const nums=[...new Set((body.match(/\d+(?:\.\d+)?/g)||[]))].filter(n=>!src.includes(n)&&!tagList.some(x=>x.includes(n)));
  if(nums.length) notes.push(`数字 ${nums.join('、')} 在新闻、商品和素材里找不到,请核对来源`);
  const total=checks.reduce((a,c)=>a+c.weight,0)||1;
  const score=Math.round(checks.filter(c=>c.pass).reduce((a,c)=>a+c.weight,0)/total*1000)/10;
  const failed=checks.filter(c=>!c.pass);
  return {score,checks,failed,notes,hardFails:failed.filter(c=>c.hard),flaws:failed.filter(c=>!c.hard),chars,pass:!failed.length};
};

/* ───────── 调用 Dify 工作流(通过 /api/dify,密钥在服务端) ───────── */
C.DIFY_SOURCES=['热点标题','热点摘要','话题标签','客户画像名','客户画像全文','第一件商品名','全部商品名','商品清单','真实素材','风格名','固定值'];
C.difySource=function(src,ctx,fixed){
  const ps=C.ctxPersona(ctx)||{};
  switch(src){
    case '热点标题':return ctx.news.title;
    case '热点摘要':return ctx.news.summary||'';
    case '话题标签':return '#'+ctx.news.tag+'#';
    case '客户画像名':return ps.name||'';
    case '客户画像全文':return ['是谁:'+(ps.who||''),'处境:'+(ps.situation||''),'痛点:'+(ps.pain||''),'真实问题:'+(ps.question||'无'),'想要:'+(ps.want||''),'不行动的后果:'+(ps.consequence||'无'),'讲法:'+(ps.pitch||'')].join('\n');
    case '第一件商品名':return ctx.products[0]?ctx.products[0].name:'';
    case '全部商品名':return ctx.products.map(p=>p.name).join('、');
    case '商品清单':return ctx.products.map(p=>C.itemText(p)).join('\n');
    case '真实素材':return C.materialCardText(C.ctxMaterial(ctx));
    case '风格名':return ctx.style?ctx.style.name:'';
    case '固定值':return fixed||'';
  }
  return '';
};
C.difyInputs=function(ctx,cfg){
  const o={}; ((cfg&&cfg.inputs)||[]).forEach(x=>{ if(x.var&&x.var.trim()) o[x.var.trim()]=String(C.difySource(x.src,ctx,x.fixed)).slice(0,4000); }); return o;
};
C.callDify=async function(ctx,opt){
  opt=opt||{}; const m=opt.modelCfg||Store.get('model'); const cfg=m.dify||{inputs:[]}; const t0=performance.now();
  const inputs=C.difyInputs(ctx,cfg);
  if(!Object.keys(inputs).length) throw new Error('还没有设置传给 Dify 的输入变量,请到后台「模型参数」里填写');
  const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(),opt.timeout||305000);
  let r;
  try{r=await fetch('/api/dify',{method:'POST',headers:{'content-type':'application/json','x-access-code':m.accessCode||''},body:JSON.stringify({inputs}),signal:ctl.signal});}
  catch(e){throw new Error(e.name==='AbortError'?'等了 5 分钟 Dify 还没返回,可能工作流停在了某个节点':'网络不通或接口不可达');}
  finally{clearTimeout(to);}
  const raw=await r.text(); let j=null; try{j=JSON.parse(raw);}catch(e){}
  if(!r.ok&&(r.status===404||r.status===501)&&!j) throw new Error('服务端接口 /api/dify 不存在(当前环境没有后端函数,请部署到 Vercel 后再用)');
  if(!r.ok||!j) throw new Error((j&&j.error&&(j.error.message||j.error))||('调用失败('+r.status+')'));
  if(j.status&&j.status!=='succeeded') throw new Error(j.status==='paused'?'Dify 工作流停在了需要人工介入的节点,接口调用会一直等下去。请检查 Dify 工作流里是否还有“人工介入”节点,有的话改成 Agent 或加分支绕开(见 README)':('Dify 工作流没有成功:'+(j.error||j.status)));
  const outs=j.outputs||{}; let text='';
  if(cfg.outputKey&&outs[cfg.outputKey]!=null) text=outs[cfg.outputKey];
  else{ const strs=Object.values(outs).filter(v=>typeof v==='string').sort((a,b)=>b.length-a.length); text=strs[0]||''; }
  if(!text) throw new Error('Dify 返回成功,但输出里没有文字。返回的输出变量有:'+(Object.keys(outs).join('、')||'无')+'。请在「模型参数」里填对“输出变量名”');
  if(typeof text!=='string') text=JSON.stringify(text,null,2);
  return {text:text.trim(),ms:Math.round(performance.now()-t0),usage:{in:0,out:j.tokens||0},model:'Dify 工作流',via:'Dify 工作流',mock:false,outKeys:Object.keys(outs),runId:j.runId};
};

/* ───────── 生成与修正 ───────── */
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// 生成一版文案。返回 {text,ms,usage,model,via,mock}
C.generate=async function(ctx,opt){
  opt=opt||{}; const m=Store.get('model');
  if(m.mode==='dify'){ // 工作流自己写,只调一次(每次都会真的跑一遍 Dify,费时也费额度)
    return await C.callDify(ctx,{timeout:opt.timeout});
  }
  if(m.mode==='mock'){
    const t0=performance.now(); await sleep(opt.fast?150+Math.random()*250:1500);
    const text=C.mockWrite(ctx,{flawRate:opt.flawRate==null?0.34:opt.flawRate,seed:opt.seed});
    const mm=C.buildMessages(ctx);
    return {text,ms:Math.round(performance.now()-t0),usage:{in:Math.round((mm.system.length+mm.user.length)/1.6),out:Math.round(text.length/1.5)},model:'本地模拟',via:'本地模拟',mock:true};
  }
  const mm=C.buildMessages(ctx);
  const r=await C.callLLM(mm.messages,{temperature:opt.temperature});
  r.text=r.text.replace(/^```[a-z]*\n?|```$/g,'').trim();
  return r;
};
// 返工一轮:把具体哪条没过、为什么没过告诉模型
C.rework=async function(text,ctx,res,opt){
  opt=opt||{}; const m=Store.get('model');
  const issues=res.failed.filter(c=>c.fixable);
  if(!issues.length) return {text,usage:{in:0,out:0},ms:0,mock:m.mode==='mock',fixed:[]};
  if(m.mode==='mock'){
    if(!opt.fast) await sleep(900);
    return {text:C.mockFix(text,ctx,res),usage:{in:Math.round(text.length/1.6),out:Math.round(text.length/1.5)},ms:900,mock:true};
  }
  const P=Store.get('prompts');
  const prompt=C.renderTpl(P.rework,{问题清单:issues.map(c=>'- '+c.label+':'+c.msg).join('\n'),可用金额:C.realPrices(ctx.products).map(x=>'¥'+x).join('、')||'无(商品库没有提供价格)',原文案:text});
  const r=await C.callLLM([{role:'system',content:C.systemText()},{role:'user',content:prompt}],{temperature:m.reworkTemp!=null?m.reworkTemp:0.3});
  r.text=r.text.replace(/^```[a-z]*\n?|```$/g,'').trim();
  return r;
};
// 自动返工:只接受改好了的版本;每轮可追溯
C.autoFix=async function(text,ctx,opt){
  opt=opt||{}; const maxRounds=opt.maxRounds||2;
  if(Store.get('model').mode==='dify') return {text,res:C.validate(text,ctx),log:[],usage:{in:0,out:0}}; // Dify 的稿子请在 Dify 里改或手动改
  let cur=text, res=C.validate(cur,ctx); const log=[]; const usage={in:0,out:0};
  for(let i=1;i<=maxRounds;i++){
    if(!res.failed.some(c=>c.fixable)) break;
    const before=res; const r=await C.rework(cur,ctx,res,opt);
    usage.in+=r.usage.in; usage.out+=r.usage.out;
    const nr=C.validate(r.text,ctx);
    const fixedIds=before.failed.filter(c=>!nr.failed.some(x=>x.id===c.id)).map(c=>c.label);
    const accepted=nr.score>before.score;
    log.push({round:i,before:before.score,after:nr.score,accepted,fixed:fixedIds,remaining:nr.failed.map(c=>c.label)});
    if(!accepted) break; // 分数没涨就保留上一版
    cur=r.text; res=nr;
  }
  return {text:cur,res,log,usage};
};
})();
