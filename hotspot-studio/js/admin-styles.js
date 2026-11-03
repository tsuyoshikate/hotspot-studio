/* 后台区块:创作风格 / 语调预设 / 文案规则 */
Admin.register({
  id:'styles', title:'创作风格与语调', keys:['styles','tones'],
  render(el,A){
    const st=A.draft('styles'), tones=A.draft('tones');
    function draw(){
      el.innerHTML=secHead('创作风格与语调','一条热点要出多个版本的文案供运营挑,每个版本由一个“创作风格”驱动。工作台生成文案时,每个风格独立跑一次。',['styles','tones'])+`
      ${st.map((s,i)=>`<div class="card" style="padding:12px 14px;margin-bottom:10px;background:var(--bg)">
        <div class="row"><b style="width:26px">${'ABCDEFGH'[i]||i+1}</b><input type="text" data-sn="${i}" value="${esc(s.name)}" style="flex:1;min-width:140px" placeholder="风格名称">
          <button class="btn sm" data-up="${i}" ${i===0?'disabled':''}>↑</button><button class="btn sm" data-dn="${i}" ${i===st.length-1?'disabled':''}>↓</button><button class="btn sm danger" data-del="${i}">删除</button></div>
        <textarea data-sr="${i}" style="min-height:60px;margin-top:8px" placeholder="创作要求">${esc(s.req)}</textarea>
        <div class="err" data-se="${i}"></div></div>`).join('')}
      <button class="btn" id="addStyle">+ 新增创作风格</button>
      <h4 style="margin:22px 0 6px">语调预设</h4>
      <div class="sub">工作台里作为“主打语调”的可选项出现,会作为素材的一部分传给模型。</div>
      <div class="chips">${tones.map((t,i)=>`<span class="chip on" style="cursor:default">${esc(t)} <a data-dt="${i}" style="color:#fff;cursor:pointer;margin-left:4px">×</a></span>`).join('')}</div>
      <div class="row"><input type="text" id="newTone" placeholder="新语调,如:温柔治愈" style="max-width:240px"><button class="btn" id="addTone">添加</button><span class="err" id="toneErr"></span></div>`;
      $$('[data-sn]',el).forEach(i=>i.oninput=()=>{st[+i.dataset.sn].name=i.value;A.mark('styles');});
      $$('[data-sr]',el).forEach(i=>i.oninput=()=>{st[+i.dataset.sr].req=i.value;A.mark('styles');});
      $$('[data-up]',el).forEach(b=>b.onclick=()=>{const i=+b.dataset.up;[st[i-1],st[i]]=[st[i],st[i-1]];A.mark('styles');draw();});
      $$('[data-dn]',el).forEach(b=>b.onclick=()=>{const i=+b.dataset.dn;[st[i+1],st[i]]=[st[i],st[i+1]];A.mark('styles');draw();});
      $$('[data-del]',el).forEach(b=>b.onclick=()=>{
        if(st.length<=1){const e=$('[data-se="'+b.dataset.del+'"]',el);e.textContent='至少要保留一个创作风格,不能删到零(否则工作台就没有文案可生成)。';return;}
        st.splice(+b.dataset.del,1);A.mark('styles');draw();
      });
      $('#addStyle',el).onclick=()=>{st.push({id:'st'+Date.now(),name:'新风格',req:'在这里写创作要求'});A.mark('styles');draw();};
      $$('[data-dt]',el).forEach(a=>a.onclick=()=>{tones.splice(+a.dataset.dt,1);A.mark('tones');draw();});
      $('#addTone',el).onclick=()=>{
        const v=$('#newTone',el).value.trim(),e=$('#toneErr',el);
        if(!v){e.textContent='请输入语调名称';return;} if(tones.includes(v)){e.textContent='已经有这个语调了';return;}
        tones.push(v);A.mark('tones');draw();
      };
    }
    draw();
  },
  validate(A){
    const st=A.draft('styles'); if(!st.length) return '至少要保留一个创作风格';
    if(st.some(s=>!s.name.trim()||!s.req.trim())) return '创作风格的名称和创作要求都不能为空';
    if(new Set(st.map(s=>s.name.trim())).size!==st.length) return '创作风格的名称不能重复';
    if(!A.draft('tones').length) return '至少要保留一个语调';
    return null;
  }
});
Admin.register({
  id:'rules', title:'文案规则', keys:['rules'],
  render(el,A){
    const r=A.draft('rules');
    el.innerHTML=secHead('文案规则','机器校验和提示词里的 {字数下限}、{违禁词} 等占位符都读这里。违禁词和编造价格是“硬伤”,其余是“瑕疵”。',['rules'])+`
    <div class="grid2">
      <div><label class="f">字数下限(不含空白)</label><input type="number" data-n="minLen" value="${r.minLen}"></div>
      <div><label class="f">字数上限</label><input type="number" data-n="maxLen" value="${r.maxLen}"></div>
      <div><label class="f">话题标签总数上限</label><input type="number" data-n="maxTags" value="${r.maxTags}"></div>
      <div><label class="f">表情符号数量(最少 ~ 最多)</label><div class="row"><input type="number" data-n="minEmoji" value="${r.minEmoji}" style="width:90px"> ~ <input type="number" data-n="maxEmoji" value="${r.maxEmoji}" style="width:90px"></div></div>
    </div>
    <label class="f">广告法违禁词(顿号分隔,命中即为硬伤)</label><textarea data-l="banned">${esc(r.banned.join('、'))}</textarea>
    <label class="f">互动引导关键词(结尾 60 字内出现任一个即算有互动引导)</label><textarea data-l="cta" style="min-height:60px">${esc(r.cta.join('、'))}</textarea>`;
    $$('[data-n]',el).forEach(i=>i.oninput=()=>{r[i.dataset.n]=+i.value;A.mark('rules');});
    $$('[data-l]',el).forEach(i=>i.oninput=()=>{r[i.dataset.l]=i.value.split(/[、,,\s]+/).map(x=>x.trim()).filter(Boolean);A.mark('rules');});
  },
  validate(A){
    const r=A.draft('rules');
    if(!(r.minLen>0&&r.maxLen>r.minLen)) return '字数上限要大于下限,且都大于 0';
    if(!(r.maxTags>=1)) return '话题标签上限至少为 1';
    if(!(r.minEmoji>=0&&r.maxEmoji>=r.minEmoji)) return '表情符号数量范围不合理';
    if(!r.banned.length) return '违禁词清单不能为空';
    return null;
  }
});
