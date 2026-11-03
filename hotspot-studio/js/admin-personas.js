/* 后台区块:客户画像(同一个商品对应多个画像;不为人群新增商品) */
Admin.register({
  id:'personas', title:'客户画像', keys:['personas'],
  render(el,A){
    const list=A.draft('personas');
    const FIELDS=[['name','画像名称',1],['who','是谁',2],['situation','当下处境(一个短句,会直接写进文案)',2],['pain','痛点',2],['question','真实会问的问题(只放亲历过的原话;没有就留空)',2],['want','想要的结果',2],['consequence','不行动的后果(不想写就留空)',2],['pitch','讲法提示(给模型的写作要求)',3]];
    function draw(){
      el.innerHTML=secHead('客户画像','先定画像,再写话。画像不准,就讲不出准的话。商品不变,变的是“对谁说”:每个商品在「商品库」里勾选适用的画像。“真实问题”只放你亲历过的原话,不要让 AI 编。',['personas'])+
      list.map((p,i)=>`<details class="card" style="padding:10px 14px;margin-bottom:10px;background:var(--bg)" ${i===0?'open':''}><summary style="cursor:pointer"><b>${esc(p.name||'(未命名)')}</b> <span class="hint">${esc(p.id)}</span></summary>
        <div style="margin-top:8px">${FIELDS.map(([k,lab,h])=>`<label class="f">${lab}</label>${h===1?`<input type="text" data-f="${i}|${k}" value="${esc(p[k]||'')}">`:`<textarea data-f="${i}|${k}" style="min-height:${h*24}px">${esc(p[k]||'')}</textarea>`}`).join('')}
        <label class="f">候选标题(每行一个,每个 ≤ 标题字数上限;按创作风格 A/B/C 顺序取用,本地模拟用)</label><textarea data-t="${i}" style="min-height:80px">${esc((p.titles||[]).join('\n'))}</textarea>
        <div class="row" style="margin-top:8px"><span class="sp"></span><button class="btn sm danger" data-del="${i}">删除这个画像</button></div></div></details>`).join('')+
      `<button class="btn" id="addP">+ 新增客户画像</button>`;
      $$('[data-f]',el).forEach(e=>e.oninput=()=>{const [i,k]=e.dataset.f.split('|');list[+i][k]=e.value;A.mark('personas');});
      $$('[data-t]',el).forEach(e=>e.oninput=()=>{list[+e.dataset.t].titles=e.value.split('\n').map(x=>x.trim()).filter(Boolean);A.mark('personas');});
      $$('[data-del]',el).forEach(b=>b.onclick=async()=>{
        const p=list[+b.dataset.del]; const used=Store.get('products').filter(x=>(x.personas||[]).includes(p.id)).length;
        if(!await confirmBox(`删除画像「${esc(p.name)}」?${used?`<br><span class="hint">有 ${used} 个商品挂着这个画像,删除后它们会少一个对象。</span>`:''}`,'删除')) return;
        list.splice(+b.dataset.del,1); A.mark('personas'); draw();
      });
      $('#addP',el).onclick=()=>{list.push({id:'p_'+Date.now().toString(36),name:'新画像',who:'',situation:'',pain:'',question:'',want:'',consequence:'',pitch:'',titles:[]});A.mark('personas');draw();};
    }
    draw();
  },
  validate(A){
    const l=A.draft('personas'); if(!l.length) return '至少要保留一个客户画像';
    if(l.some(p=>!String(p.name).trim())) return '客户画像的名称不能为空';
    if(new Set(l.map(p=>p.name.trim())).size!==l.length) return '客户画像的名称不能重复';
    const T=A.draft('rules').titleMax||20; const bad=l.find(p=>(p.titles||[]).some(t=>[...t].length>T));
    if(bad) return `「${bad.name}」里有超过 ${T} 个字的候选标题`;
    return null;
  }
});
