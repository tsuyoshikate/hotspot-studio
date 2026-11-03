/* 后台区块:提示词模板(编辑 + 实时预览 + 试运行) */
Admin.register({
  id:'prompts', title:'提示词模板', keys:['prompts'],
  render(el,A){
    const P=A.draft('prompts'), model=A.draft('model'), rules=A.draft('rules');
    const BLOCKS=[
      ['system','给模型的角色设定与写作规范','每次调用都会作为系统指令发给模型。'],
      ['material','每次调用拼装素材的模板','把热点、客户画像、风格、商品清单和真实素材拼成这次要写的“题目”。'],
      ['item','单件商品在素材里的呈现格式','商品清单里每一件商品按这个格式渲染后再拼起来(嵌套)。'],
      ['rework','自动返工的说明','校验没过时,把具体问题交给模型改一版用的提示词。'],
      ['judge','模型评审提示词','评测台里让另一次模型调用给文案打分用的提示词。']
    ];
    let lastTa=null, sample=0;
    const news=window.DEFAULTS.news.filter(n=>n.id==='n01'||n.id==='n02'||n.id==='n05');
    const prods=()=>Store.get('products');
    function sampleCtx(){
      const n=news[sample], ps=prods(); const ranked=Core.matchProducts(n,ps).slice(0,2).map(r=>r.p);
      const st=Store.get('styles')[0]; const top=Core.matchProducts(n,ps)[0]; return {news:n,products:ranked,persona:top?Core.personaById(top.persona):null,style:st};
    }
    function unknownPh(tpl,kind){
      const known=new Set(Core.PLACEHOLDERS[kind].map(x=>x[0]));
      return [...new Set((tpl.match(/\{([^{}\n]{1,12})\}/g)||[]).map(x=>x.slice(1,-1)).filter(x=>!known.has(x)))];
    }
    function drawPreview(){
      const box=$('#pvBox',el); if(!box) return;
      const ctx=sampleCtx();
      const sys=Core.systemText(P,rules), usr=Core.materialText(ctx,P);
      const unk=[...unknownPh(P.system,'system'),...unknownPh(P.material,'material'),...unknownPh(P.item,'item')];
      box.innerHTML=`
        <div class="preview-block"><header><b>给模型的规范说明(system)</b><span>${sys.length} 字</span></header><pre>${esc(sys)}</pre></div>
        <div class="preview-block"><header><b>拼装好的素材(user)</b><span>${usr.length} 字</span></header><pre>${esc(usr)}</pre></div>
        ${unk.length?`<div class="alert bad" style="margin:0"><div>发现不认识的占位符:${unk.map(x=>'<b>{'+esc(x)+'}</b>').join('、')}。它们会原样发给模型,不会被替换成空白,请检查是不是写错了。</div></div>`:''}`;
    }
    function draw(){
      el.innerHTML=secHead('提示词模板','把原本写死在代码里的指令搬到后台,运营不改代码就能调模型的输出。点一下占位符就会插入到光标当前位置;商品清单是嵌套占位符。',['prompts'])+
      BLOCKS.map(([k,t,d])=>`<div style="margin-bottom:14px"><div class="row"><b>${t}</b><span class="hint">${d}</span><span class="sp"></span><span class="hint" data-cnt="${k}">${P[k].length} 字</span></div>
        <textarea data-k="${k}" style="min-height:${k==='item'?52:k==='judge'||k==='rework'?110:150}px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px">${esc(P[k])}</textarea>
        <div>${Core.PLACEHOLDERS[k].map(x=>`<span class="ph" data-ph="${k}" data-n="${x[0]}" title="${esc(x[1])}">{${x[0]}}</span>`).join('')}</div></div>`).join('')+
      `<h4 style="margin:18px 0 8px">实时预览</h4>
      <div class="row" style="margin-bottom:10px"><span class="hint">用一条示例素材,把最终会发给模型的完整内容渲染出来:</span>
        <select id="pvSample" style="width:auto">${news.map((n,i)=>`<option value="${i}" ${i===sample?'selected':''}>${esc(n.title)}</option>`).join('')}</select></div>
      <div id="pvBox"></div>
      <h4 style="margin:18px 0 8px">试运行</h4>
      <div class="row"><button class="btn primary" id="trial">用当前模板和模型配置真调一次</button><span class="hint">结果只用于调试,不写回工作台。当前接入方式:<b>${model.mode==='mock'?'本地模拟':model.mode==='proxy'?'服务端代理':model.mode==='dify'?'Dify 工作流(这里的提示词不会用到,写作在 Dify 里)':'浏览器直连'}</b></span></div>
      <div id="trialOut" style="margin-top:10px"></div>`;
      $$('textarea[data-k]',el).forEach(t=>{
        t.onfocus=()=>lastTa=t;
        t.oninput=()=>{P[t.dataset.k]=t.value;A.mark('prompts');$('[data-cnt='+t.dataset.k+']',el).textContent=t.value.length+' 字';drawPreview();};
      });
      $$('.ph',el).forEach(s=>{
        s.onmousedown=e=>e.preventDefault();
        s.onclick=()=>{
          const ta=$('textarea[data-k='+s.dataset.ph+']',el); const ins='{'+s.dataset.n+'}';
          const a=(lastTa&&lastTa===ta)?ta.selectionStart:ta.value.length, b=(lastTa&&lastTa===ta)?ta.selectionEnd:ta.value.length;
          ta.value=ta.value.slice(0,a)+ins+ta.value.slice(b); ta.focus(); ta.selectionStart=ta.selectionEnd=a+ins.length;
          ta.dispatchEvent(new Event('input')); lastTa=ta;
        };
      });
      $('#pvSample',el).onchange=e=>{sample=+e.target.value;drawPreview();};
      $('#trial',el).onclick=trial;
      drawPreview();
    }
    async function trial(){
      const out=$('#trialOut',el); const ctx=sampleCtx();
      out.innerHTML='<span class="spin"></span> 试运行中…';
      const mm=Core.buildMessages(ctx,P,rules);
      try{
        let text,meta;
        if(model.mode==='mock'){
          await new Promise(r=>setTimeout(r,900)); text=Core.mockWrite(ctx,{flawRate:0}); meta={model:'本地模拟',via:'本地模拟',ms:900,usage:{in:Math.round((mm.system.length+mm.user.length)/1.6),out:Math.round(text.length/1.5)}};
        }else{ const r=await Core.callLLM(mm.messages,{modelCfg:model,temperature:model.temperature}); text=r.text; meta=r; }
        const res=Core.validate(text,ctx,rules);
        out.innerHTML=(model.mode==='mock'?'<div class="alert" style="margin:0 0 8px"><div>现在是<b>模拟输出</b>,不代表真实模型效果。到「模型参数」里选择服务端代理或浏览器直连,才会真的调用模型。</div></div>':'')+
          `<div class="preview-block"><header><b>生成结果</b><span>共 ${text.replace(/\s/g,'').length} 字 · ${esc(meta.model||'')} · ${esc(meta.via||'')} · ${((meta.ms||0)/1000).toFixed(1)}s · ↑${meta.usage.in} ↓${meta.usage.out} tokens · 规则分 ${res.score}</span></header><pre>${esc(text)}</pre></div>`;
      }catch(e){ out.innerHTML=`<div class="alert bad" style="margin:0"><div><b>调用失败</b>:${esc(e.message==='MOCK'?'模拟模式':e.message)}</div></div>`; }
    }
    draw();
  },
  validate(A){
    const P=A.draft('prompts');
    for(const [k,n] of [['system','角色设定与写作规范'],['material','素材拼装模板'],['item','单件商品呈现格式'],['rework','返工说明'],['judge','评审提示词']]) if(!String(P[k]||'').trim()) return `「${n}」不能为空`;
    if(!P.material.includes('{商品清单}')) return '素材拼装模板里必须包含 {商品清单},否则模型看不到商品';
    return null;
  }
});
