/* 后台区块:模型参数(与工作台共用同一份配置) */
Admin.register({
  id:'model', title:'模型参数', keys:['model'],
  render(el,A){
    const m=A.draft('model');
    const modes=[['mock','本地模拟','不调用任何模型,用于演示界面和流程'],['proxy','服务端代理(推荐)','密钥放在 Vercel 环境变量里,浏览器看不到'],['direct','浏览器直连','密钥存在你本机浏览器里,只适合自己调试;部分服务商不允许跨域直连']];
    function draw(){
      const P=window.PROVIDERS;
      el.innerHTML=secHead('模型参数','工作台里的“当前模型”与这里共用同一份配置,两边改哪边都生效。',['model'])+`
      <label class="f">接入方式</label>
      <div class="row">${modes.map(x=>`<label class="card" style="padding:10px 14px;cursor:pointer;flex:1;min-width:200px;${m.mode===x[0]?'border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-weak)':''}"><input type="radio" name="mode" value="${x[0]}" ${m.mode===x[0]?'checked':''}> <b>${x[1]}</b><div class="hint">${x[2]}</div></label>`).join('')}</div>
      <div id="modelFields" style="${m.mode==='mock'?'opacity:.5':''}">
      <div class="grid2">
        <div><label class="f">服务商</label><select id="mProv">${Object.entries(P).map(([k,v])=>`<option value="${k}" ${m.provider===k?'selected':''}>${v.name}</option>`).join('')}</select></div>
        <div><label class="f">模型名</label><input type="text" id="mModel" list="mModels" value="${esc(m.model)}"><datalist id="mModels">${(P[m.provider]||{models:[]}).models.map(x=>`<option value="${x}">`).join('')}</datalist></div>
      </div>
      ${m.mode==='direct'?`<label class="f">接口地址</label><input type="text" id="mBase" value="${esc(m.baseUrl)}">
        <label class="f">密钥 API Key</label><input type="password" id="mKey" value="${esc(m.apiKey)}" placeholder="sk-..." autocomplete="off">
        <div class="alert" style="margin:6px 0 0"><div>⚠ 密钥只存在你<b>本机浏览器</b>里,不会上传。正式使用请走<b>服务端代理</b>,把密钥放在服务端环境变量里。</div></div>`
      :m.mode==='proxy'?`<label class="f">访问码(选填)</label><input type="text" id="mCode" value="${esc(m.accessCode||'')}" placeholder="服务端设置了 ACCESS_CODE 才需要填">
        <div class="hint" style="margin-top:6px">代理由 <span class="kbd">/api/chat</span> 提供。需要在 Vercel 项目里设置环境变量:<span class="kbd">LLM_API_KEY</span>(必填)、<span class="kbd">LLM_BASE_URL</span>、<span class="kbd">LLM_MODEL</span>、<span class="kbd">ACCESS_CODE</span>。服务商和模型名以服务端环境变量为准。</div>`:''}
      <div class="grid2" style="margin-top:4px">
        <div><label class="f">创作温度 <span class="hint">创作类 0.8~1.0 · 越高越发散</span></label><input type="number" id="mTemp" min="0" max="1.5" step="0.1" value="${m.temperature}"></div>
        <div><label class="f">返工温度 <span class="hint">照清单改错,0.2~0.3</span></label><input type="number" id="mTemp2" min="0" max="1.5" step="0.1" value="${m.reworkTemp}"></div>
        <div><label class="f">评审温度 <span class="hint">打分要稳定,0.1~0.2</span></label><input type="number" id="mTemp3" min="0" max="1.5" step="0.1" value="${m.judgeTemp}"></div>
        <div><label class="f">流式输出</label><label style="display:block;padding:7px 0"><input type="checkbox" disabled> 暂未支持(预留)</label></div>
      </div></div>
      <div class="row" style="margin-top:14px"><button class="btn" id="mTest">测试连接</button><span id="mTestRes"></span></div>
      <div class="hint" style="margin-top:6px">测试会真发一次最小请求,显示成功与否、耗时、实际响应的模型名。测试用的是上面<b>当前填写的内容</b>(不用先保存)。</div>`;
      $$('[name=mode]',el).forEach(r=>r.onchange=()=>{m.mode=r.value;A.mark('model');draw();});
      const bind=(id,k,num)=>{const e=$('#'+id,el); if(e) e.oninput=()=>{m[k]=num?(+e.value):e.value;A.mark('model');};};
      bind('mModel','model'); bind('mBase','baseUrl'); bind('mKey','apiKey'); bind('mCode','accessCode'); bind('mTemp','temperature',1); bind('mTemp2','reworkTemp',1); bind('mTemp3','judgeTemp',1);
      const pv=$('#mProv',el); if(pv) pv.onchange=()=>{
        m.provider=pv.value; const p=P[pv.value];
        if(p.baseUrl) m.baseUrl=p.baseUrl; if(p.models.length) m.model=p.models[0];
        A.mark('model'); draw();
      };
      $('#mTest',el).onclick=async()=>{
        const out=$('#mTestRes',el);
        if(m.mode==='mock'){out.innerHTML='<span class="chk-bad">当前是本地模拟模式,不会发出请求。</span> 请先选择“服务端代理”或“浏览器直连”。';return;}
        out.innerHTML='<span class="spin"></span> 测试中…';
        try{
          const r=await Core.callLLM([{role:'user',content:'只回复两个字:好的'}],{modelCfg:m,temperature:0,timeout:30000});
          out.innerHTML=`<span class="chk-ok">✓ 连接成功</span> · 耗时 ${r.ms}ms · 实际响应模型:<b>${esc(r.model)}</b> · 回复:${esc(r.text.slice(0,20))}`;
        }catch(e){out.innerHTML=`<span class="chk-bad">✗ 失败</span> ${esc(e.message)}`;}
      };
    }
    draw();
  },
  validate(A){
    const m=A.draft('model');
    if(m.mode!=='mock'&&!m.model.trim()) return '模型名不能为空';
    if(m.mode==='direct'&&!m.baseUrl.trim()) return '浏览器直连需要填写接口地址';
    for(const k of ['temperature','reworkTemp','judgeTemp']) if(!(m[k]>=0&&m[k]<=1.5)) return '温度要在 0~1.5 之间';
    return null;
  }
});
