/* 后台区块:真实素材库(默认不用;话题命中「只用于」关键词才带上;只能写「可以写」里的内容) */
Admin.register({
  id:'materials', title:'真实素材库', keys:['materials'],
  render(el,A){
    const list=A.draft('materials');
    const J=a=>(a||[]).join('、'), N=a=>(a||[]).join('\n');
    function draw(){
      el.innerHTML=secHead('真实素材库','给文案提供 AI 编不出来的真实内容。<b>默认不用</b>:新闻标题或摘要里出现某张卡的“只用于”关键词时才带上(一篇最多 1 张,命中词最多的)。只能写“可以写”里的内容,不许添加、不许夸大;不贬低任何人;学员案例要匿名。真实工作中,素材库由市场部维护,每张卡先过品牌审核。',['materials'])+
      list.map((c,i)=>`<details class="card" style="padding:10px 14px;margin-bottom:10px;background:var(--bg)"><summary style="cursor:pointer"><b>卡片 ${i+1} · ${esc(c.title||'(未命名)')}</b></summary>
        <div style="margin-top:8px">
        <label class="f">标题</label><input type="text" data-m="${i}|title" value="${esc(c.title)}">
        <label class="f">只用于(关键词,顿号分隔;新闻里出现任一个才会带上这张卡)</label><textarea data-k="${i}|kw" style="min-height:48px">${esc(J(c.kw))}</textarea>
        <label class="f">参考写法(一句话,只能用卡片里的事实;本地模拟会直接用它)</label><textarea data-m="${i}|use" style="min-height:70px">${esc(c.use||'')}</textarea>
        <div class="grid2"><div><label class="f">可以写(每行一条)</label><textarea data-n="${i}|can" style="min-height:70px">${esc(N(c.can))}</textarea></div>
        <div><label class="f">不要写(每行一条)</label><textarea data-n="${i}|cannot" style="min-height:70px">${esc(N(c.cannot))}</textarea></div></div>
        <div class="row" style="margin-top:8px"><span class="sp"></span><button class="btn sm danger" data-del="${i}">删除这张卡</button></div></div></details>`).join('')+
      `<button class="btn" id="addM">+ 新增素材卡</button>`;
      $$('[data-m]',el).forEach(e=>e.oninput=()=>{const [i,k]=e.dataset.m.split('|');list[+i][k]=e.value;A.mark('materials');});
      $$('[data-k]',el).forEach(e=>e.oninput=()=>{const [i,k]=e.dataset.k.split('|');list[+i][k]=e.value.split(/[、,,\n]+/).map(x=>x.trim()).filter(Boolean);A.mark('materials');});
      $$('[data-n]',el).forEach(e=>e.oninput=()=>{const [i,k]=e.dataset.n.split('|');list[+i][k]=e.value.split('\n').map(x=>x.trim()).filter(Boolean);A.mark('materials');});
      $$('[data-del]',el).forEach(b=>b.onclick=async()=>{ if(!await confirmBox('删除这张素材卡?','删除')) return; list.splice(+b.dataset.del,1); A.mark('materials'); draw(); });
      $('#addM',el).onclick=()=>{list.push({id:'m_'+Date.now().toString(36),title:'新素材卡',kw:[],use:'',can:[],cannot:[]});A.mark('materials');draw();};
    }
    draw();
  },
  validate(A){
    const l=A.draft('materials');
    const bad=l.find(c=>!String(c.title).trim()||!(c.kw||[]).length||!String(c.use||'').trim());
    if(bad) return `素材卡「${bad.title||'未命名'}」的标题、“只用于”关键词和参考写法都要填(没有关键词的卡永远不会被用到)`;
    return null;
  }
});
