/* 后台区块:创作风格 / 文案规则 */
Admin.register({
  id:'styles', title:'创作风格', keys:['styles'],
  render(el,A){
    const st=A.draft('styles');
    function draw(){
      el.innerHTML=secHead('创作风格','一条热点要出多个版本的文案供运营挑,每个版本由一个“创作风格”驱动(主要区别在标题写法)。每个客户画像下有 3 个候选标题,按风格顺序挑。Dify 模式下只跑一次,不使用这里的风格。',['styles'])+`
      ${st.map((s,i)=>`<div class="card" style="padding:12px 14px;margin-bottom:10px;background:var(--bg)">
        <div class="row"><b style="width:26px">${'ABCDEFGH'[i]||i+1}</b><input type="text" data-sn="${i}" value="${esc(s.name)}" style="flex:1;min-width:140px" placeholder="风格名称">
          <button class="btn sm" data-up="${i}" ${i===0?'disabled':''}>↑</button><button class="btn sm" data-dn="${i}" ${i===st.length-1?'disabled':''}>↓</button><button class="btn sm danger" data-del="${i}">删除</button></div>
        <textarea data-sr="${i}" style="min-height:60px;margin-top:8px" placeholder="创作要求">${esc(s.req)}</textarea>
        <div class="err" data-se="${i}"></div></div>`).join('')}
      <button class="btn" id="addStyle">+ 新增创作风格</button>`;
      $$('[data-sn]',el).forEach(i=>i.oninput=()=>{st[+i.dataset.sn].name=i.value;A.mark('styles');});
      $$('[data-sr]',el).forEach(i=>i.oninput=()=>{st[+i.dataset.sr].req=i.value;A.mark('styles');});
      $$('[data-up]',el).forEach(b=>b.onclick=()=>{const i=+b.dataset.up;[st[i-1],st[i]]=[st[i],st[i-1]];A.mark('styles');draw();});
      $$('[data-dn]',el).forEach(b=>b.onclick=()=>{const i=+b.dataset.dn;[st[i+1],st[i]]=[st[i],st[i+1]];A.mark('styles');draw();});
      $$('[data-del]',el).forEach(b=>b.onclick=()=>{
        if(st.length<=1){const e=$('[data-se="'+b.dataset.del+'"]',el);e.textContent='至少要保留一个创作风格,不能删到零(否则工作台就没有文案可生成)。';return;}
        st.splice(+b.dataset.del,1);A.mark('styles');draw();
      });
      $('#addStyle',el).onclick=()=>{st.push({id:'st'+Date.now(),name:'新风格',req:'在这里写创作要求'});A.mark('styles');draw();};
    }
    draw();
  },
  validate(A){
    const st=A.draft('styles'); if(!st.length) return '至少要保留一个创作风格';
    if(st.some(s=>!s.name.trim()||!s.req.trim())) return '创作风格的名称和创作要求都不能为空';
    if(new Set(st.map(s=>s.name.trim())).size!==st.length) return '创作风格的名称不能重复';
    return null;
  }
});
Admin.register({
  id:'rules', title:'文案规则', keys:['rules'],
  render(el,A){
    const r=A.draft('rules');
    const L=(k,lab,hint,h)=>`<label class="f">${lab} <span class="hint">${hint}</span></label><textarea data-l="${k}" style="min-height:${h||56}px">${esc((r[k]||[]).join('、'))}</textarea>`;
    el.innerHTML=secHead('文案规则','机器校验和提示词里的 {标题上限}、{违禁词} 等占位符都读这里。命中下面“硬伤”类的词会挡住审核。这些规则来自小K的底线(广告法、不编造、不写品牌名、标黄核对),数字只是平台限制,可按需调整。',['rules'])+`
    <div class="grid2">
      <div><label class="f">标题字数上限</label><input type="number" data-n="titleMax" value="${r.titleMax}"></div>
      <div><label class="f">正文字数上限(不含空白)</label><input type="number" data-n="maxLen" value="${r.maxLen}"></div>
      <div><label class="f">正文字数下限(0=不限)</label><input type="number" data-n="minLen" value="${r.minLen}"></div>
      <div><label class="f">话题标签总数上限</label><input type="number" data-n="maxTags" value="${r.maxTags}"></div>
      <div><label class="f">表情符号数量(最少 ~ 最多)</label><div class="row"><input type="number" data-n="minEmoji" value="${r.minEmoji}" style="width:90px"> ~ <input type="number" data-n="maxEmoji" value="${r.maxEmoji}" style="width:90px"></div></div>
      <div><label class="f">开关</label><label style="display:block;padding:4px 0"><input type="checkbox" data-b="ctaRequired" ${r.ctaRequired?'checked':''}> 结尾必须有互动引导</label><label style="display:block;padding:4px 0"><input type="checkbox" data-b="requireNewsTag" ${r.requireNewsTag?'checked':''}> 必须带热点话题标签</label><label style="display:block;padding:4px 0"><input type="checkbox" data-b="allowPrice" ${r.allowPrice?'checked':''}> 允许在笔记里写商品库里的价格(默认不写)</label></div>
    </div>
    ${L('banned','广告法违禁词与绝对化承诺','顿号分隔,命中即硬伤。“第一次、第一个、第一步”这类序数不会被当成“第一”')}
    ${L('brand','机构品牌名','正文和话题标签里不能出现')}
    ${L('scarcity','稀缺感 / 催促说法','没有真实依据的稀缺感,AI 写出来就是编造')}
    ${L('experience','疑似编造亲历的说法','比如“我亲测”“我接触过”')}
    ${L('storyWords','学员案例 / 个人经历用词','只有命中真实素材卡时才允许出现')}
    ${L('selfQA','自问自答句','出现了算瑕疵')}
    ${L('cta','互动引导关键词','仅在上面开了“必须有互动引导”时检查,结尾 60 字内出现任一个即可',48)}`;
    $$('[data-n]',el).forEach(i=>i.oninput=()=>{r[i.dataset.n]=+i.value;A.mark('rules');});
    $$('[data-b]',el).forEach(i=>i.onchange=()=>{r[i.dataset.b]=i.checked;A.mark('rules');});
    $$('[data-l]',el).forEach(i=>i.oninput=()=>{r[i.dataset.l]=i.value.split(/[、,,\n]+/).map(x=>x.trim()).filter(Boolean);A.mark('rules');});
  },
  validate(A){
    const r=A.draft('rules');
    if(!(r.maxLen>0&&r.maxLen>=(r.minLen||0))) return '字数上限要大于 0,且不小于下限';
    if(!(r.titleMax>=1)) return '标题字数上限至少为 1';
    if(!(r.maxTags>=1)) return '话题标签上限至少为 1';
    if(!(r.minEmoji>=0&&r.maxEmoji>=r.minEmoji)) return '表情符号数量范围不合理';
    if(!r.banned.length) return '违禁词清单不能为空';
    return null;
  }
});
