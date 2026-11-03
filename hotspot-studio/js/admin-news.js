/* 后台区块:新闻抓取源 + 风险识别规则 */
Admin.register({
  id:'news', title:'新闻抓取', keys:['sources','riskRules'],
  render(el,A){
    const src=A.draft('sources'), rules=A.draft('riskRules');
    const testRes={};
    function draw(){
      el.innerHTML=secHead('新闻抓取','把抓取来源做成可配置的,而不是写死在代码里。每个来源可以启用或停用,自定义的订阅源可以删除。',['sources','riskRules'])+`
      <div class="alert" style="margin:0 0 14px"><div><b>合规提示</b>:公开热榜接口只适合<b>原型演示</b>,正式上线应改用官方开放平台或商业舆情服务,并遵守对方的爬虫协议与服务条款。</div></div>
      <table><thead><tr><th style="width:44px">启用</th><th>来源名称</th><th>类型</th><th>地址 / 标识</th><th>测试结果</th><th style="width:60px"></th></tr></thead><tbody>
      ${src.map((s,i)=>{const t=testRes[s.id]; return `<tr>
        <td><input type="checkbox" data-en="${i}" ${s.enabled?'checked':''}></td>
        <td>${esc(s.name)}</td><td><span class="tag ${s.kind==='builtin'?'':'new'}">${s.kind==='builtin'?'内置':'订阅源'}</span></td>
        <td class="hint" style="word-break:break-all">${esc(s.url)}</td>
        <td>${t===undefined?'<span class="hint">未测试</span>':t==='...'?'<span class="spin"></span>':t.ok?`<span class="chk-ok">✓ 成功</span> ${t.count} 条 · ${t.ms}ms`:`<span class="chk-bad">✗ 失败</span> ${t.ms}ms<div class="err">${esc(t.reason)}</div>`}</td>
        <td>${s.kind==='custom'?`<button class="btn sm danger" data-del="${i}">删除</button>`:''}</td></tr>`;}).join('')}
      </tbody></table>
      <div class="row" style="margin-top:12px"><button class="btn" id="testAll">测试全部来源</button><span class="hint">真实发起一次抓取,逐个显示成功/失败、条数、耗时和原因。失败的来源不影响其它来源。</span></div>
      <h4 style="margin:20px 0 6px">添加订阅源(RSS / Atom)</h4>
      <div class="row"><input type="text" id="nsName" placeholder="名称,如:某媒体科技频道" style="flex:1;min-width:160px"><input type="text" id="nsUrl" placeholder="https://example.com/feed.xml" style="flex:2;min-width:220px"><button class="btn primary" id="nsAdd">添加</button></div>
      <div class="err" id="nsErr"></div>
      <h4 style="margin:22px 0 4px">风险识别规则(热点可用性)</h4>
      <div class="sub">命中<b>禁止借势</b>的热点,工作台里不能选用;命中<b>需人工判断</b>的热点,选用时会弹窗让运营确认。每行一类规则,词用顿号分隔。</div>
      <table><thead><tr><th style="width:110px">处理方式</th><th style="width:110px">类型</th><th>关键词(顿号分隔)</th></tr></thead><tbody>
      ${rules.map((r,i)=>`<tr><td><span class="tag ${r.level==='forbid'?'hot':'up'}">${r.level==='forbid'?'禁止借势':'需人工判断'}</span></td><td>${esc(r.type)}</td><td><textarea data-rw="${i}" style="min-height:52px">${esc(r.words.join('、'))}</textarea></td></tr>`).join('')}
      </tbody></table>`;
      $$('[data-en]',el).forEach(c=>c.onchange=()=>{src[+c.dataset.en].enabled=c.checked;A.mark('sources');});
      $$('[data-del]',el).forEach(b=>b.onclick=()=>{src.splice(+b.dataset.del,1);A.mark('sources');draw();});
      $$('[data-rw]',el).forEach(t=>t.onchange=()=>{rules[+t.dataset.rw].words=t.value.split(/[、,,\s]+/).map(x=>x.trim()).filter(Boolean);A.mark('riskRules');});
      $('#nsAdd',el).onclick=()=>{
        const name=$('#nsName',el).value.trim(), url=$('#nsUrl',el).value.trim(), er=$('#nsErr',el);
        er.textContent='';
        if(!name){er.textContent='请填写来源名称';return;}
        let u; try{u=new URL(url);}catch(e){er.textContent='地址格式不对,应形如 https://example.com/feed.xml';return;}
        if(!/^https?:$/.test(u.protocol)){er.textContent='只支持 http 或 https 地址';return;}
        if(src.some(s=>s.url===u.toString())){er.textContent='这个地址已经添加过了';return;}
        src.push({id:'c'+Date.now(),name,kind:'custom',url:u.toString(),enabled:true}); A.mark('sources'); draw();
      };
      $('#testAll',el).onclick=async()=>{
        src.forEach(s=>testRes[s.id]='...'); draw();
        await Promise.all(src.map(async s=>{testRes[s.id]=await Core.fetchSource(s); draw();}));
      };
    }
    draw();
  },
  validate(A){
    const src=A.draft('sources');
    if(!src.some(s=>s.enabled)) return '至少要启用一个新闻来源';
    return null;
  }
});
