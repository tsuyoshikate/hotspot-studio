/* 后台区块:模型参数(与工作台共用同一份配置)。三种接入方式:Dify 工作流 / 服务端代理 / 浏览器直连,外加本地模拟。 */
Admin.register({
  id:'model', title:'模型参数', keys:['model'],
  render(el,A){
    const m=A.draft('model');
    if(!m.dify) m.dify=JSON.parse(JSON.stringify(window.DEFAULTS.model.dify));
    const D=m.dify; if(!Array.isArray(D.inputs)) D.inputs=[];
    const modes=[
      ['dify','Dify 工作流(推荐)','写作交给你在 Dify 里搭好的工作流;工作台负责选热点、选商品、选画像和校验'],
      ['proxy','服务端代理','工作台用后台的提示词直接调大模型;密钥放在 Vercel 环境变量里'],
      ['mock','本地模拟','不调用任何模型,用于演示界面和流程'],
      ['direct','浏览器直连','密钥存在你本机浏览器里,只适合自己调试;部分服务商不允许跨域直连']
    ];
    function difyHtml(){
      return `<div class="card pad" style="background:var(--bg);margin:10px 0">
        <b>传给 Dify 的输入</b>
        <div class="hint" style="margin:4px 0 8px">左边填你在 Dify「开始」节点里建的<b>变量名</b>(要和 Dify 里一字不差),右边选工作台里哪一项填进去。Dify 开始节点的文本变量默认有长度限制,长内容请把变量类型设为“段落”。</div>
        <table><thead><tr><th>Dify 变量名</th><th>填什么</th><th>固定内容(选“固定值”时)</th><th></th></tr></thead><tbody>
        ${D.inputs.map((x,i)=>`<tr><td><input type="text" data-iv="${i}" value="${esc(x.var)}" placeholder="如 query"></td>
          <td><select data-is="${i}">${Core.DIFY_SOURCES.map(s=>`<option ${s===x.src?'selected':''}>${s}</option>`).join('')}</select></td>
          <td><input type="text" data-if="${i}" value="${esc(x.fixed||'')}" ${x.src==='固定值'?'':'disabled'}></td>
          <td><button class="btn sm danger" data-id="${i}">删除</button></td></tr>`).join('')}</tbody></table>
        <button class="btn sm" id="addIn" style="margin-top:8px">+ 增加一个输入</button> <button class="btn sm" id="dRecommend" style="margin-top:8px" title="hot_news / product / persona / platform 四项,输出变量 final_report">恢复为推荐映射(对应已改造的 Dify 工作流)</button>
        <div class="grid2" style="margin-top:12px">
          <div><label class="f">输出变量名 <span class="hint">Dify「结束」节点里要取的那个;留空 = 自动取最长的文字</span></label><input type="text" id="dOut" value="${esc(D.outputKey||'')}" placeholder="如 text"></div>
          <div><label class="f">正文结束标记 <span class="hint">这个词之后的“审核说明”不参与校验;留空 = 全文校验</span></label><input type="text" id="dSplit" value="${esc(D.splitMarker||'')}"></div>
        </div>
        <label class="f">访问码(选填)</label><input type="text" id="mCode" value="${esc(m.accessCode||'')}" placeholder="服务端设置了 ACCESS_CODE 才需要填">
        <div class="hint" style="margin-top:6px">服务端接口是 <span class="kbd">/api/dify</span>,需要在 Vercel 的 Environment Variables 里设置:<span class="kbd">DIFY_API_KEY</span>(必填,Dify 应用「访问 API」里创建的密钥,以 app- 开头)、<span class="kbd">DIFY_BASE_URL</span>(选填,默认 https://api.dify.ai/v1)、<span class="kbd">ACCESS_CODE</span>(建议)。</div>
        <div class="alert" style="margin:10px 0 0"><div><b>注意:</b>工作流里不能有“人工介入”节点(接口调用会一直等下去)。用 Agent 介入没问题;人工审核交给工作台的 Step 5。</div></div>
      </div>`;
    }
    function draw(){
      const P=window.PROVIDERS;
      el.innerHTML=secHead('模型参数','工作台里的“当前模型”与这里共用同一份配置,两边改哪边都生效。',['model'])+`
      <label class="f">接入方式</label>
      <div class="row">${modes.map(x=>`<label class="card" style="padding:10px 14px;cursor:pointer;flex:1;min-width:200px;${m.mode===x[0]?'border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-weak)':''}"><input type="radio" name="mode" value="${x[0]}" ${m.mode===x[0]?'checked':''}> <b>${x[1]}</b><div class="hint">${x[2]}</div></label>`).join('')}</div>
      ${m.mode==='dify'?difyHtml():`<div id="modelFields" style="${m.mode==='mock'?'opacity:.5':''}">
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
      </div></div>`}
      <div class="row" style="margin-top:14px"><button class="btn" id="mTest">测试连接</button>${m.mode==='dify'?'<button class="btn" id="mRun">用示例热点真跑一次工作流</button>':''}<span id="mTestRes"></span></div>
      <div class="hint" style="margin-top:6px">${m.mode==='dify'?'“测试连接”只检查服务端有没有配好 Dify 密钥,不会运行工作流。“真跑一次”会真的运行整条工作流(要 1~3 分钟,会用 Dify 和你接入的模型额度)。':'测试会真发一次最小请求,显示成功与否、耗时、实际响应的模型名。测试用的是上面<b>当前填写的内容</b>(不用先保存)。'}</div>`;
      $$('[name=mode]',el).forEach(r=>r.onchange=()=>{m.mode=r.value;A.mark('model');draw();});
      const bind=(id,k,num,obj)=>{const e=$('#'+id,el); if(e) e.oninput=()=>{(obj||m)[k]=num?(+e.value):e.value;A.mark('model');};};
      bind('mModel','model'); bind('mBase','baseUrl'); bind('mKey','apiKey'); bind('mCode','accessCode'); bind('mTemp','temperature',1); bind('mTemp2','reworkTemp',1); bind('mTemp3','judgeTemp',1);
      bind('dOut','outputKey',0,D); bind('dSplit','splitMarker',0,D);
      $$('[data-iv]',el).forEach(e=>e.oninput=()=>{D.inputs[+e.dataset.iv].var=e.value;A.mark('model');});
      $$('[data-if]',el).forEach(e=>e.oninput=()=>{D.inputs[+e.dataset.if].fixed=e.value;A.mark('model');});
      $$('[data-is]',el).forEach(e=>e.onchange=()=>{D.inputs[+e.dataset.is].src=e.value;A.mark('model');draw();});
      $$('[data-id]',el).forEach(b=>b.onclick=()=>{D.inputs.splice(+b.dataset.id,1);A.mark('model');draw();});
      const rc=$('#dRecommend',el); if(rc) rc.onclick=()=>{const d=JSON.parse(JSON.stringify(window.DEFAULTS.model.dify)); D.inputs=d.inputs; D.outputKey=d.outputKey; D.splitMarker=d.splitMarker; A.mark('model'); draw();};
      const ad=$('#addIn',el); if(ad) ad.onclick=()=>{D.inputs.push({var:'',src:'热点标题',fixed:''});A.mark('model');draw();};
      const pv=$('#mProv',el); if(pv) pv.onchange=()=>{
        m.provider=pv.value; const p=P[pv.value];
        if(p.baseUrl) m.baseUrl=p.baseUrl; if(p.models.length) m.model=p.models[0];
        A.mark('model'); draw();
      };
      $('#mTest',el).onclick=async()=>{
        const out=$('#mTestRes',el);
        if(m.mode==='mock'){out.innerHTML='<span class="chk-bad">当前是本地模拟模式,不会发出请求。</span> 请先选择 Dify、服务端代理或浏览器直连。';return;}
        out.innerHTML='<span class="spin"></span> 测试中…';
        if(m.mode==='dify'){
          try{
            const t0=performance.now(); const r=await fetch('/api/dify',{headers:{'x-access-code':m.accessCode||''}});
            const j=await r.json().catch(()=>null);
            if(r.status===404||r.status===501||!j) throw new Error('服务端接口 /api/dify 不存在(当前环境没有后端函数,请部署到 Vercel 后再测)');
            if(r.status===401) throw new Error('访问码不对或没有填写');
            if(!j.hasKey) throw new Error('服务端还没有配置 DIFY_API_KEY 环境变量(配好后要 Redeploy)');
            out.innerHTML=`<span class="chk-ok">✓ 服务端已配置 Dify 密钥</span> · 地址 ${esc(j.base)} · 耗时 ${Math.round(performance.now()-t0)}ms`;
          }catch(e){out.innerHTML=`<span class="chk-bad">✗ 失败</span> ${esc(e.message)}`;}
          return;
        }
        try{
          const r=await Core.callLLM([{role:'user',content:'只回复两个字:好的'}],{modelCfg:m,temperature:0,timeout:30000});
          out.innerHTML=`<span class="chk-ok">✓ 连接成功</span> · 耗时 ${r.ms}ms · 实际响应模型:<b>${esc(r.model)}</b> · 回复:${esc(r.text.slice(0,20))}`;
        }catch(e){out.innerHTML=`<span class="chk-bad">✗ 失败</span> ${esc(e.message)}`;}
      };
      const rn=$('#mRun',el); if(rn) rn.onclick=async()=>{
        const out=$('#mTestRes',el); rn.disabled=true;
        out.innerHTML='<span class="spin"></span> 工作流运行中…通常 1~3 分钟,请不要离开本页';
        try{
          const news=window.DEFAULTS.news.find(n=>n.id==='n01'); const ps=Store.get('products');
          const r=await Core.callDify({news,products:ps.slice(0,1),persona:Store.get('personas')[0],material:null,style:null},{modelCfg:m});
          out.innerHTML=`<span class="chk-ok">✓ 运行成功</span> · ${(r.ms/1000).toFixed(1)}s · 返回的输出变量:<b>${esc(r.outKeys.join('、'))}</b> · 开头:${esc(r.text.slice(0,60))}…`;
        }catch(e){out.innerHTML=`<span class="chk-bad">✗ 失败</span> ${esc(e.message)}`;}
        rn.disabled=false;
      };
    }
    draw();
  },
  validate(A){
    const m=A.draft('model');
    if(m.mode==='dify'){
      const ins=(m.dify&&m.dify.inputs)||[];
      if(!ins.length||ins.some(x=>!String(x.var).trim())) return '传给 Dify 的输入至少要有一项,且变量名不能为空';
      if(new Set(ins.map(x=>x.var.trim())).size!==ins.length) return 'Dify 变量名不能重复';
      return null;
    }
    if(m.mode!=='mock'&&!m.model.trim()) return '模型名不能为空';
    if(m.mode==='direct'&&!m.baseUrl.trim()) return '浏览器直连需要填写接口地址';
    for(const k of ['temperature','reworkTemp','judgeTemp']) if(!(m[k]>=0&&m[k]<=1.5)) return '温度要在 0~1.5 之间';
    return null;
  }
});
