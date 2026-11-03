/* 阶段3:提示词渲染、文案生成(模拟/真实模型)、机器校验、修正。扩展 Core。 */
(function(){
const C=window.Core;
const clone=o=>JSON.parse(JSON.stringify(o));

/* ───────── 提示词模板:占位符渲染 ───────── */
C.PLACEHOLDERS={
  system:[['字数下限','规则里的最少字数'],['字数上限','规则里的最多字数'],['标签上限','话题标签总数上限'],['违禁词','广告法违禁词清单(用顿号连接)']],
  material:[['热点标题','选中热点的标题'],['热点摘要','热点摘要'],['话题标签','如 #xxx#'],['语调','主打语调'],['风格名','创作风格名称'],['风格要求','创作风格的要求'],['商品清单','所有商品按“单件呈现格式”渲染后拼起来']],
  item:[['商品名','商品名称'],['卖点','卖点标签,用顿号连接'],['售价','售价'],['原价','原价'],['品类','品类'],['折扣','折扣,如 5.6折']],
  rework:[['问题清单','校验发现的问题'],['可用金额','素材里真实可用的金额'],['原文案','待修正的文案']],
  judge:[['素材','热点和商品素材'],['文案','待评审文案']]
};
// 遇到不认识的占位符原样保留(运营写错时能一眼看出来)
C.renderTpl=function(tpl,vars){
  return String(tpl).replace(/\{([^{}\n]{1,12})\}/g,(m,k)=>Object.prototype.hasOwnProperty.call(vars,k)?String(vars[k]):m);
};
C.itemText=function(p,tpl){
  tpl=tpl||Store.get('prompts').item;
  return C.renderTpl(tpl,{商品名:p.name,卖点:p.tags.join('、'),售价:p.price,原价:p.orig,品类:p.cat,折扣:(p.price/p.orig*10).toFixed(1)+'折'});
};
C.systemText=function(P,R){
  P=P||Store.get('prompts'); R=R||Store.get('rules');
  return C.renderTpl(P.system,{字数下限:R.minLen,字数上限:R.maxLen,标签上限:R.maxTags,违禁词:R.banned.join('、')});
};
C.materialText=function(ctx,P){
  P=P||Store.get('prompts');
  const list=ctx.products.map(p=>C.itemText(p,P.item)).join('\n');
  return C.renderTpl(P.material,{热点标题:ctx.news.title,热点摘要:ctx.news.summary,话题标签:'#'+ctx.news.tag+'#',语调:ctx.tone||'',风格名:ctx.style?ctx.style.name:'',风格要求:ctx.style?ctx.style.req:'',商品清单:list});
};
C.buildMessages=function(ctx,P,R){
  const system=C.systemText(P,R), user=C.materialText(ctx,P);
  return {system,user,messages:[{role:'system',content:system},{role:'user',content:user}]};
};
C.realPrices=function(products){
  const s=new Set(); products.forEach(p=>{s.add(+p.price);s.add(+p.orig);}); return [...s];
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
const OPEN={
 '追剧观影':'想看的小众片熬不过三天就下映,热门档全在拼票房,咱普通人追个片,真得靠手速和运气。',
 '开学季':'开学季一到,书包、文具、新鞋样样要钱,家长和学生的钱包都在默默喊疼。',
 '出行补给':'油价一动,出行的心思也跟着打转,自驾路上总得备点能顶饿的小零嘴。',
 '游戏展会':'展会现场人挤人,打游戏、逛展一站就是一整天,补给得跟上。',
 '消暑解渴':'这天气热得人只想躺平,出门一趟像蒸桑拿,嘴里总得有点清爽的小东西。',
 '生活消费':'生活里的小变化,总会在不经意间影响日常的每一笔消费。',
 '异域风味':'看着远方的热闹,不如先把自己的日子过得有滋有味。',
 '通用':'这个话题刷屏的时候,普通人最想要的,不过是一点踏实的小确幸。'
};
const BRIDGE={热点借势:'那不如把“小确幸”交给自己——',促销导向:'想把日子过得实惠点?这几样值得盯一盯——',互动话题:'先问一句:这种时候,你的快乐小零食是什么?我的答案在这儿——'};
const FILL=['一口下去,压力也跟着散了。','手上忙活的工夫,心情也有了着落。','囤上一份,心里都踏实。'];
const CTA={热点借势:'你最近有什么放不下的“小确幸”?评论区聊聊~',促销导向:'链接放在主页橱窗,想要的先码住,评论区告诉我你想先囤哪一款?',互动话题:'你们的本命零食是哪一款?来评论区投一票👇'};
function sceneOf(news){
  const t=(news.title||'')+(news.summary||'');
  const sc=window.DEFAULTS.scenes.find(s=>s.kw.some(k=>t.includes(k)));
  return sc?sc.scene:'通用';
}
function build(ctx,level){
  const key=(ctx.style&&ctx.style.name)||ctx.tone||'热点借势';
  const bridge=BRIDGE[key]||BRIDGE.热点借势, cta=CTA[key]||CTA.热点借势;
  const h=hash((ctx.news.id||'')+key);
  const ps=ctx.products.map(p=>{
    const short=p.name.split('·')[0];
    const tg=level>=1?p.tags.slice(0,1):p.tags.slice(0,2);
    return `${short}:${tg.join('、')},现价¥${p.price}(原价¥${p.orig})`;
  }).join(';');
  const icon=ctx.products[0]?ctx.products[0].icon:'🛒';
  const parts=['#'+ctx.news.tag+'# '+OPEN[sceneOf(ctx.news)]+icon,'',bridge+ps+'。'+(level>=2?'':FILL[h%FILL.length]),'',cta];
  return parts.join('\n');
}
C.mockWrite=function(ctx,opt){
  opt=opt||{}; const R=Store.get('rules');
  let level=0, text=build(ctx,0);
  while(text.replace(/\s/g,'').length>R.maxLen-4 && level<2){level++;text=build(ctx,level);}
  const key=(ctx.style&&ctx.style.name)||'';
  const h=hash((ctx.news.id||'')+key+(opt.seed||'')+(ctx.tone||''));
  if(opt.flawRate && (h%100)/100<opt.flawRate){
    const kind=h%3;
    if(kind===0) text=text.replace('现价','全网最低,现价');
    else if(kind===1) text=text.replace(/现价¥(\d+(?:\.\d+)?)/,(m,n)=>'现价¥'+(Math.round(n*0.8*10)/10));
    else text=text.replace('\n\n'+(CTA[key]||CTA.热点借势),FILL.join('')+FILL.join('')+'\n\n'+(CTA[key]||CTA.热点借势));
  }
  return text;
};
// 修正(模拟):按校验结果做确定性的修改
C.mockFix=function(text,ctx,res){
  const R=Store.get('rules'); let t=text;
  const ids=new Set(res.checks.filter(c=>!c.pass).map(c=>c.id));
  if(ids.has('markup')) t=t.replace(/\*\*|```/g,'').replace(/^\s*#{1,6}\s+/gm,'').replace(/^\s*[-*]\s+/gm,'');
  if(ids.has('banned')) R.banned.forEach(w=>{t=t.split(w).join(w==='全网最低'?'很划算':'');});
  if(ids.has('price')){
    const real=C.realPrices(ctx.products); let i=0;
    t=t.replace(/[¥￥]\s*(\d+(?:\.\d+)?)/g,(m,n)=>real.includes(+n)?m:'¥'+real[i++%real.length]);
  }
  if(ids.has('tags')){
    const must='#'+ctx.news.tag+'#'; const all=t.match(/#[^#\s]+#/g)||[];
    let kept=false; all.forEach(x=>{ if(x===must && !kept){kept=true;return;} t=t.replace(x,''); });
    if(!t.includes(must)) t=must+' '+t;
  }
  if(ids.has('len')){
    const len=s=>s.replace(/\s/g,'').length;
    if(len(t)>R.maxLen){
      const lines=t.split('\n'); // 去掉中间段落里的“填充句”,再不行就截断结尾前的商品卖点
      for(let k=0;k<FILL.length&&len(t)>R.maxLen;k++) t=t.split(FILL[k]).join('');
      let guard=0; while(len(t)>R.maxLen && guard++<6){
        t=t.replace(/、[^,;。()()]{1,8}(?=,现价)/,'');
      }
    }
    while(len(t)<R.minLen){t=t.replace(/\n\n([^\n]*)$/,'\n\n'+FILL[0]+'$1');if(len(t)>=R.minLen||!t.includes(FILL[0]))break;}
  }
  if(ids.has('emoji')){
    const n=(t.match(/\p{Extended_Pictographic}/gu)||[]).length;
    if(n<R.minEmoji) t+='😊'; else if(n>R.maxEmoji){let k=0;t=t.replace(/\p{Extended_Pictographic}/gu,m=>(++k>R.maxEmoji?'':m));}
  }
  if(ids.has('cta')) t=t.replace(/\s+$/,'')+'\n\n你怎么看?评论区聊聊~';
  return t.replace(/\n{3,}/g,'\n\n').trim();
};

/* ───────── 机器校验 ───────── */
C.validate=function(text,ctx,rules){
  const R=rules||Store.get('rules'); const t=String(text||'');
  const chars=t.replace(/\s/g,'').length;
  const checks=[];
  const add=(id,label,pass,msg,weight,hard,fixable,okMsg)=>checks.push({id,label,pass,msg:pass&&okMsg?okMsg:msg,weight,hard:!!hard,fixable:fixable!==false});
  // 违禁词(硬伤)
  const hits=R.banned.filter(w=>t.includes(w));
  add('banned','广告法违禁词',!hits.length,hits.length?`命中违禁词:${hits.join('、')}`:'未命中违禁词',25,true);
  // 编造价格(硬伤)
  const real=C.realPrices(ctx.products); const amts=[];
  const re=/[¥￥]\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*元/g; let m;
  while((m=re.exec(t))) amts.push(+(m[1]||m[2]));
  const fake=[...new Set(amts.filter(a=>!real.includes(a)))];
  add('price','价格与素材一致',!fake.length,fake.length?`出现素材里没有的金额:¥${fake.join('、¥')};素材里真实可用的金额:¥${real.join('、¥')}`:'价格信息与商品库一致',25,true);
  // 字数
  add('len','字数区间',chars>=R.minLen&&chars<=R.maxLen,`字数 ${R.minLen}~${R.maxLen}:实际 ${chars} 字(不含空白),要求 ${R.minLen}~${R.maxLen}`,15);
  // 话题标签
  const tagList=t.match(/#[^#\s]+#/g)||[]; const must='#'+ctx.news.tag+'#';
  const tagOk=t.includes(must)&&tagList.length<=R.maxTags;
  add('tags','话题标签',tagOk,t.includes(must)?(tagList.length>R.maxTags?`话题标签 ${tagList.length} 个,超过上限 ${R.maxTags} 个`:'含指定话题标签'):`缺少指定话题标签 ${must}`,10);
  // emoji
  const ne=(t.match(/\p{Extended_Pictographic}/gu)||[]).length;
  add('emoji','表情符号数量',ne>=R.minEmoji&&ne<=R.maxEmoji,`表情符号 ${ne} 个,建议 ${R.minEmoji}~${R.maxEmoji} 个`,5);
  // 互动引导
  const tail=t.slice(-60);
  add('cta','结尾互动引导',R.cta.some(k=>tail.includes(k)),'结尾要有互动引导(提问或邀请评论)',8,false,true,'结尾命中互动引导词');
  // 排版符号
  const mk=/\*\*|```|^\s*#{1,6}\s|^\s*[-*]\s|^\s*\d+[.、]\s/m.test(t);
  add('markup','无残留排版符号',!mk,'文案里残留了 markdown 排版符号(如 ** 或 ## 或列表符)',5,false,true,'正文为纯文本');
  // 提到商品(改了也白改,不进返工循环)
  const mention=ctx.products.some(p=>{const s=p.name.split('·')[0];return t.includes(s)||t.includes(s.slice(0,3));});
  add('mention','提到了商品',mention,'文案里没有提到所选商品',7,false,false,'已提及所选商品');
  const score=Math.round(checks.filter(c=>c.pass).reduce((a,c)=>a+c.weight,0)*10)/10;
  const failed=checks.filter(c=>!c.pass);
  return {score,checks,failed,hardFails:failed.filter(c=>c.hard),flaws:failed.filter(c=>!c.hard),chars,pass:!failed.length};
};

/* ───────── 生成与修正 ───────── */
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// 生成一版文案。返回 {text,ms,usage,model,via,mock}
C.generate=async function(ctx,opt){
  opt=opt||{}; const m=Store.get('model');
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
  const prompt=C.renderTpl(P.rework,{问题清单:issues.map(c=>'- '+c.label+':'+c.msg).join('\n'),可用金额:C.realPrices(ctx.products).map(x=>'¥'+x).join('、'),原文案:text});
  const r=await C.callLLM([{role:'system',content:C.systemText()},{role:'user',content:prompt}],{temperature:m.reworkTemp!=null?m.reworkTemp:0.3});
  r.text=r.text.replace(/^```[a-z]*\n?|```$/g,'').trim();
  return r;
};
// 自动返工:只接受改好了的版本;每轮可追溯
C.autoFix=async function(text,ctx,opt){
  opt=opt||{}; const maxRounds=opt.maxRounds||2;
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
