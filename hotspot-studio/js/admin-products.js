/* 后台区块:商品库(只读视图 → 编辑 → 批量操作 → 导入导出) */
Admin.register({
  id:'products', title:'商品库', keys:['products'],
  render(el,A){
    const list=A.draft('products');
    const st={view:'table',q:'',cat:'全部',sort:'none',sel:new Set()};
    const EMOJIS=['🥜','🌰','🌻','🍪','🍫','🍬','🍟','🍿','🍤','🥩','🍗','🥭','🍒','🍇','🍞','🥐','🧋','🥣','🍰','🧁','🌽','🍘','💪','🥗','🌸','🍡'];
    const cats=()=>[...new Set(list.map(p=>p.cat))];
    const disc=p=>(p.price/p.orig*10).toFixed(1);
    const nextId=()=>'p'+String(Math.max(0,...list.map(p=>+String(p.id).replace(/\D/g,'')||0))+1).padStart(3,'0');
    function visible(){
      const q=st.q.trim().toLowerCase();
      let r=list.filter(p=>(st.cat==='全部'||p.cat===st.cat)&&(!q||(p.name+p.tags.join('')).toLowerCase().includes(q)));
      if(st.sort==='pa') r=[...r].sort((a,b)=>a.price-b.price); else if(st.sort==='pd') r=[...r].sort((a,b)=>b.price-a.price); else if(st.sort==='cat') r=[...r].sort((a,b)=>a.cat.localeCompare(b.cat,'zh'));
      return r;
    }
    // 引用检查:这件商品出现在多少条热点的推荐关系(每条热点推荐前 6 件)里
    function refCount(){
      const cnt={}; const news=Store.get('news').filter(n=>Core.assessRisk(n).level!=='forbid');
      news.forEach(n=>Core.matchProducts(n,list).slice(0,6).forEach(r=>{cnt[r.p.id]=(cnt[r.p.id]||0)+1;}));
      return cnt;
    }
    function card(p){return `<div class="card prod ${st.sel.has(p.id)?'sel':''}" data-pc="${esc(p.id)}"><div class="pic g${p.grad%12}">${esc(p.icon)}</div><span class="chk">${st.sel.has(p.id)?'✓':''}</span>
      <div class="body"><h5>${esc(p.name)}</h5><div class="tags">${p.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="price">¥${p.price}<s>¥${p.orig}</s><span>${esc(p.cat)}</span></div></div></div>`;}
    function draw(){
      const v=visible(); const prices=list.map(p=>p.price);
      const avgDisc=list.length?(list.reduce((a,p)=>a+p.price/p.orig,0)/list.length*10).toFixed(1):'—';
      el.innerHTML=secHead('商品库','商品库原本写死在代码里,现在由运营自己维护。修改后点底部「保存」才会生效。',['products'])+`
      <div class="row" style="margin-bottom:14px">
        <div class="card stat"><small>商品总数</small><b id="stN">${list.length}</b></div>
        <div class="card stat"><small>品类数</small><b>${cats().length}</b></div>
        <div class="card stat"><small>价格区间</small><b>${list.length?'¥'+Math.min(...prices)+' ~ ¥'+Math.max(...prices):'—'}</b></div>
        <div class="card stat"><small>平均折扣率</small><b>${avgDisc}${list.length?' 折':''}</b></div>
      </div>
      <div class="row" style="margin-bottom:10px">
        <div class="seg"><button data-v="table" class="${st.view==='table'?'on':''}">表格</button><button data-v="card" class="${st.view==='card'?'on':''}">卡片</button></div>
        <input type="text" id="pq" placeholder="按名称或卖点搜索" value="${esc(st.q)}" style="max-width:220px">
        <select id="pcat" style="width:auto"><option>全部</option>${cats().map(c=>`<option ${c===st.cat?'selected':''}>${esc(c)}</option>`).join('')}</select>
        <select id="psort" style="width:auto"><option value="none">默认排序</option><option value="pa" ${st.sort==='pa'?'selected':''}>价格从低到高</option><option value="pd" ${st.sort==='pd'?'selected':''}>价格从高到低</option><option value="cat" ${st.sort==='cat'?'selected':''}>按品类</option></select>
        <span class="sp"></span>
        <button class="btn primary" id="pAdd">+ 新增商品</button>
      </div>
      <div class="row" style="margin-bottom:10px;background:var(--bg);padding:8px 12px;border-radius:8px">
        <label><input type="checkbox" id="pAll" ${v.length&&v.every(p=>st.sel.has(p.id))?'checked':''}> 全选当前列表</label>
        <span class="hint">已选 ${st.sel.size} 件</span>
        <button class="btn sm" id="bCat" ${st.sel.size?'':'disabled'}>批量改品类</button>
        <button class="btn sm danger" id="bDel" ${st.sel.size?'':'disabled'}>批量删除</button>
        <span class="sp"></span>
        <button class="btn sm" id="exJson">导出 JSON</button><button class="btn sm" id="exCsv">导出表格(CSV)</button>
        <label class="btn sm" style="cursor:pointer">导入…<input type="file" id="imp" accept=".json,.csv,text/csv,application/json" hidden></label>
      </div>
      ${!v.length?'<div class="empty">没有符合条件的商品</div>':st.view==='card'?`<div class="pgrid">${v.map(card).join('')}</div>`:
      `<table><thead><tr><th style="width:30px"></th><th>商品</th><th>品类</th><th>卖点</th><th>售价</th><th>原价</th><th>折扣</th><th style="width:110px"></th></tr></thead><tbody>
        ${v.map(p=>`<tr><td><input type="checkbox" data-sel="${esc(p.id)}" ${st.sel.has(p.id)?'checked':''}></td><td><span style="font-size:18px">${esc(p.icon)}</span> ${esc(p.name)}</td><td>${esc(p.cat)}</td><td>${p.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(' ')}</td><td style="color:var(--hot);font-weight:600">¥${p.price}</td><td class="hint"><s>¥${p.orig}</s></td><td>${disc(p)}折</td>
        <td><button class="btn sm" data-ed="${esc(p.id)}">编辑</button> <button class="btn sm danger" data-rm="${esc(p.id)}">删除</button></td></tr>`).join('')}</tbody></table>`}`;
      // 事件
      $$('[data-v]',el).forEach(b=>b.onclick=()=>{st.view=b.dataset.v;draw();});
      $('#pq',el).oninput=e=>{st.q=e.target.value;const pos=e.target.selectionStart;draw();const n=$('#pq',el);n.focus();n.selectionStart=n.selectionEnd=pos;};
      $('#pcat',el).onchange=e=>{st.cat=e.target.value;draw();};
      $('#psort',el).onchange=e=>{st.sort=e.target.value;draw();};
      $('#pAll',el).onchange=e=>{visible().forEach(p=>e.target.checked?st.sel.add(p.id):st.sel.delete(p.id));draw();};
      $$('[data-sel]',el).forEach(c=>c.onchange=()=>{c.checked?st.sel.add(c.dataset.sel):st.sel.delete(c.dataset.sel);draw();});
      $$('[data-pc]',el).forEach(c=>c.onclick=()=>{const id=c.dataset.pc;st.sel.has(id)?st.sel.delete(id):st.sel.add(id);draw();});
      $$('[data-ed]',el).forEach(b=>b.onclick=()=>edit(list.find(p=>p.id===b.dataset.ed)));
      $$('[data-rm]',el).forEach(b=>b.onclick=()=>removeMany([b.dataset.rm]));
      $('#pAdd',el).onclick=()=>edit(null);
      $('#bDel',el).onclick=()=>removeMany([...st.sel]);
      $('#bCat',el).onclick=batchCat;
      $('#exJson',el).onclick=()=>download('products.json',JSON.stringify(list,null,2),'application/json');
      $('#exCsv',el).onclick=()=>download('products.csv','﻿'+toCsv(list),'text/csv;charset=utf-8');
      $('#imp',el).onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)importFile(f);};
    }
    function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

    /* ── 删除(带引用检查) ── */
    async function removeMany(ids){
      const rc=refCount(); const names=ids.map(id=>list.find(p=>p.id===id)).filter(Boolean);
      const refd=names.filter(p=>rc[p.id]);
      const html=`<p>将删除 <b>${names.length}</b> 件商品${names.length<=4?':'+esc(names.map(p=>p.name).join('、')):''}。删除后不可撤销(未保存前可「放弃改动」)。</p>`+
        (refd.length?`<div class="alert" style="margin:0"><div>${refd.map(p=>`「${esc(p.name)}」被 <b>${rc[p.id]}</b> 条热点推荐引用`).join(';')}。删除后这些推荐会失效。</div></div>`:'<p class="hint">这些商品目前没有被任何热点推荐引用。</p>');
      if(!await confirmBox(html,'确认删除')) return;
      const set=new Set(ids); const before=list.length;
      for(let i=list.length-1;i>=0;i--) if(set.has(list[i].id)) list.splice(i,1);
      ids.forEach(id=>st.sel.delete(id)); A.mark('products'); draw();
      toast(`已删除 ${before-list.length} 件${refd.length?`(其中 ${refd.length} 件曾被推荐引用)`:''}`);
    }
    function batchCat(){
      const bg=document.createElement('div'); bg.className='modal-bg';
      bg.innerHTML=`<div class="modal" style="max-width:420px"><h3>批量修改品类</h3><div class="hint">已选 ${st.sel.size} 件商品</div>
        <label class="f">改为已有品类</label><select id="bcSel"><option value="">— 选择 —</option>${cats().map(c=>`<option>${esc(c)}</option>`).join('')}</select>
        <label class="f">或输入新品类</label><input type="text" id="bcNew" placeholder="新品类名称"><div class="err" id="bcErr"></div>
        <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-x>取消</button><button class="btn primary" data-ok>确定</button></div></div>`;
      document.body.appendChild(bg);
      bg.querySelector('[data-x]').onclick=()=>bg.remove();
      bg.querySelector('[data-ok]').onclick=()=>{
        const c=($('#bcNew',bg).value.trim())||$('#bcSel',bg).value; if(!c){$('#bcErr',bg).textContent='请选择或输入品类';return;}
        let ok=0,skip=[]; list.forEach(p=>{ if(!st.sel.has(p.id)) return; if(p.cat===c) skip.push(p.name+'(本来就是该品类)'); else {p.cat=c;ok++;} });
        A.mark('products'); bg.remove(); draw();
        toast(`成功 ${ok} 件,跳过 ${skip.length} 件${skip.length?':'+skip.slice(0,2).join('、')+(skip.length>2?'…':''):''}`,3600);
      };
    }

    /* ── 新增 / 编辑(带实时预览) ── */
    function edit(p0){
      const isNew=!p0;
      const f=p0?{...p0,tags:[...p0.tags]}:{id:nextId(),name:'',price:'',orig:'',cat:cats()[0]||'',tags:[],icon:'🍬',grad:list.length%12};
      const bg=document.createElement('div'); bg.className='modal-bg'; document.body.appendChild(bg);
      const errs={};
      function check(){
        Object.keys(errs).forEach(k=>delete errs[k]);
        if(!f.name.trim()) errs.name='名称必填';
        else if(list.some(x=>x.name===f.name.trim()&&x.id!==f.id)) errs.name='已经有同名商品了';
        const pr=+f.price, og=+f.orig;
        if(!(pr>0)) errs.price='售价必须大于 0'; if(!(og>0)) errs.orig='原价必须大于 0';
        if(pr>0&&og>0&&og<pr) errs.orig='原价不能低于售价(现在售价 ¥'+pr+' > 原价 ¥'+og+')';
        if(!String(f.cat).trim()) errs.cat='请选择或输入品类';
        if(!String(f.icon).trim()) errs.icon='请选择或输入一个图标';
        return !Object.keys(errs).length;
      }
      function paint(){
        const okp=+f.price>0&&+f.orig>=+f.price;
        bg.innerHTML=`<div class="modal"><h3>${isNew?'新增商品':'编辑商品'} <span class="hint">编号 ${esc(f.id)}(自动生成)</span></h3>
        <div style="display:grid;grid-template-columns:1fr 240px;gap:20px">
         <div>
          <label class="f">名称 *</label><input type="text" id="fName" value="${esc(f.name)}"><div class="err">${errs.name||''}</div>
          <div class="grid2"><div><label class="f">售价 *</label><input type="number" step="0.1" id="fPrice" value="${esc(f.price)}"><div class="err">${errs.price||''}</div></div>
          <div><label class="f">原价 *</label><input type="number" step="0.1" id="fOrig" value="${esc(f.orig)}"><div class="err">${errs.orig||''}</div></div></div>
          <div class="hint">折扣率:<b>${okp?disc(f)+' 折':'—'}</b></div>
          <label class="f">品类(选已有的,或直接输入新品类)</label><input type="text" id="fCat" list="catList" value="${esc(f.cat)}"><datalist id="catList">${cats().map(c=>`<option value="${esc(c)}">`).join('')}</datalist><div class="err">${errs.cat||''}</div>
          <label class="f">卖点(回车添加,点 × 删除,建议 2~4 个)</label>
          <div class="chips" style="margin-bottom:6px">${f.tags.map((t,i)=>`<span class="chip on" style="cursor:default">${esc(t)} <a data-rt="${i}" style="cursor:pointer;color:#fff">×</a></span>`).join('')}</div>
          <input type="text" id="fTag" placeholder="输入卖点后按回车">${f.tags.length&&(f.tags.length<2||f.tags.length>4)?`<div class="hint" style="color:var(--warn)">现在有 ${f.tags.length} 个卖点,建议 2~4 个</div>`:''}
          <label class="f">图标</label><div class="chips" style="gap:4px">${EMOJIS.map(e=>`<span class="chip ${e===f.icon?'on':''}" data-em="${e}" style="padding:2px 8px;font-size:16px">${e}</span>`).join('')}</div>
          <input type="text" id="fIcon" value="${esc(f.icon)}" style="max-width:100px"><div class="err">${errs.icon||''}</div>
          <label class="f">背景渐变</label><div class="chips" style="gap:6px">${Array.from({length:12},(_,i)=>`<span class="g${i}" data-g="${i}" style="width:34px;height:24px;border-radius:6px;cursor:pointer;border:2px solid ${f.grad%12===i?'var(--brand)':'var(--line)'}"></span>`).join('')}</div>
         </div>
         <div><div class="hint" style="margin-bottom:6px">实时预览(和工作台里的商品卡一样)</div>${card({...f,price:+f.price||0,orig:+f.orig||0,tags:f.tags,name:f.name||'(商品名称)'})}</div></div>
        <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-x>取消</button><button class="btn primary" data-ok>${isNew?'添加':'保存修改'}</button></div></div>`;
        const re=(id,k,fn)=>{const e=$('#'+id,bg);e.oninput=()=>{f[k]=fn?fn(e.value):e.value;refresh(id);};};
        re('fName','name');re('fPrice','price');re('fOrig','orig');re('fCat','cat');re('fIcon','icon');
        $('#fTag',bg).onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const v=e.target.value.trim();if(v&&!f.tags.includes(v)){f.tags.push(v);keep='fTag';paint();}}};
        $$('[data-rt]',bg).forEach(a=>a.onclick=()=>{f.tags.splice(+a.dataset.rt,1);paint();});
        $$('[data-em]',bg).forEach(c=>c.onclick=()=>{f.icon=c.dataset.em;paint();});
        $$('[data-g]',bg).forEach(c=>c.onclick=()=>{f.grad=+c.dataset.g;paint();});
        bg.querySelector('[data-x]').onclick=()=>bg.remove();
        bg.querySelector('[data-ok]').onclick=()=>{
          f.name=f.name.trim(); f.cat=String(f.cat).trim();
          if(!check()){paint();return;}
          const o={id:f.id,name:f.name,price:+f.price,orig:+f.orig,cat:f.cat,tags:f.tags.slice(),icon:String(f.icon).trim(),grad:f.grad%12};
          if(isNew) list.push(o); else Object.assign(list.find(x=>x.id===f.id),o);
          A.mark('products'); bg.remove(); draw(); toast(isNew?'已添加(记得保存)':'已修改(记得保存)');
        };
        if(keep){const n=$('#'+keep,bg);if(n)n.focus();keep=null;}
      }
      let keep=null;
      function refresh(focusId){ // 输入时只刷新预览和折扣,不打断输入焦点
        const pos=$('#'+focusId,bg).selectionStart; check(); const had=Object.keys(errs).length;
        const val=$('#'+focusId,bg).value; keep=focusId; paint(); const n=$('#'+focusId,bg); n.value=val; n.focus(); try{n.selectionStart=n.selectionEnd=pos;}catch(e){}
      }
      paint();
    }

    /* ── CSV ── */
    function csvCell(s){s=String(s);return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
    function toCsv(ps){return ['名称,售价,原价,品类,卖点,图标'].concat(ps.map(p=>[p.name,p.price,p.orig,p.cat,p.tags.join('、'),p.icon].map(csvCell).join(','))).join('\r\n');}
    function parseCsv(text){ // 能处理带引号的字段,以及字段内部含逗号、引号、换行的情况
      text=text.replace(/^﻿/,''); const rows=[]; let row=[],cur='',q=false;
      for(let i=0;i<text.length;i++){
        const c=text[i];
        if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
        else if(c==='"') q=true;
        else if(c===','){row.push(cur);cur='';}
        else if(c==='\n'||c==='\r'){ if(c==='\r'&&text[i+1]==='\n') i++; row.push(cur);cur='';rows.push(row);row=[]; }
        else cur+=c;
      }
      if(cur!==''||row.length){row.push(cur);rows.push(row);}
      if(q) throw new Error('引号没有闭合(第一个没配对的引号附近),请检查文件');
      return rows.filter(r=>r.some(x=>x.trim()!==''));
    }
    function hashCat(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h%12;}
    // 解析并逐行校验。返回 {items:[{row,p}], problems:[{row,msg}]}
    function parseImport(name,text){
      const items=[],problems=[];
      if(/\.json$/i.test(name)){
        let j; try{j=JSON.parse(text);}catch(e){throw new Error('JSON 格式不对:'+e.message.slice(0,50));}
        const arr=Array.isArray(j)?j:Array.isArray(j.products)?j.products:null; if(!arr) throw new Error('JSON 里没有找到商品数组');
        arr.forEach((o,i)=>validateRow(i+1,{名称:o.name,售价:o.price,原价:o.orig,品类:o.cat,卖点:Array.isArray(o.tags)?o.tags.join('、'):o.tags,图标:o.icon,id:o.id,grad:o.grad},items,problems));
      }else{
        const rows=parseCsv(text); if(!rows.length) throw new Error('文件是空的');
        const head=rows[0].map(x=>x.trim()); const need=['名称','售价','原价','品类','卖点','图标'];
        const miss=need.filter(h=>!head.includes(h)); if(miss.length) throw new Error('表头缺少:'+miss.join('、')+'。表头应为:'+need.join('、'));
        rows.slice(1).forEach((r,i)=>{ const o={}; head.forEach((h,k)=>o[h]=r[k]); validateRow(i+2,o,items,problems); });
      }
      return {items,problems};
    }
    function validateRow(row,o,items,problems){
      const miss=[]; const name=String(o.名称==null?'':o.名称).trim(), cat=String(o.品类==null?'':o.品类).trim(), icon=String(o.图标==null?'':o.图标).trim();
      if(!name) miss.push('名称'); if(!cat) miss.push('品类'); if(!icon) miss.push('图标');
      if(miss.length){problems.push({row,msg:'缺少必填项:'+miss.join('、')});return;}
      const pr=Number(o.售价), og=Number(o.原价);
      if(!(pr>0)||String(o.售价).trim()==='') {problems.push({row,msg:`售价「${o.售价}」不是大于 0 的数字`});return;}
      if(!(og>0)||String(o.原价).trim()==='') {problems.push({row,msg:`原价「${o.原价}」不是大于 0 的数字`});return;}
      if(og<pr){problems.push({row,msg:`原价 ¥${og} 低于售价 ¥${pr}`});return;}
      const tags=String(o.卖点==null?'':o.卖点).split(/[、,,]/).map(x=>x.trim()).filter(Boolean);
      items.push({row,p:{id:o.id,name,price:pr,orig:og,cat,tags,icon,grad:o.grad!=null&&o.grad!==''?(+o.grad%12):hashCat(cat)}});
    }
    function importFile(file){
      const fr=new FileReader(); fr.onerror=()=>toast('读取文件失败');
      fr.onload=()=>{
        let r; try{r=parseImport(file.name,fr.result);}catch(e){toast('导入失败:'+e.message,4500);return;}
        const {items,problems}=r;
        const bg=document.createElement('div'); bg.className='modal-bg';
        bg.innerHTML=`<div class="modal" style="max-width:560px"><h3>导入商品</h3>
          <p>共识别 <b>${items.length+problems.length}</b> 行:可导入 <b class="chk-ok">${items.length}</b> 行${problems.length?`,有问题 <b class="chk-bad">${problems.length}</b> 行`:''}。</p>
          ${problems.length?`<div class="alert bad" style="margin:0 0 10px"><div><b>以下行有问题(导入前先看清楚):</b><ul>${problems.slice(0,12).map(x=>`<li>第 ${x.row} 行:${esc(x.msg)}</li>`).join('')}${problems.length>12?`<li>…还有 ${problems.length-12} 行</li>`:''}</ul></div></div>`:''}
          <label class="f">导入方式</label><label style="display:block"><input type="radio" name="imode" value="replace" checked> 替换整个商品库(导出再导入时用)</label><label style="display:block"><input type="radio" name="imode" value="append"> 追加到现有商品库</label>
          <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-x>取消,什么都不导入</button><button class="btn primary" data-ok ${items.length?'':'disabled'}>${problems.length?'跳过有问题的行,导入其余':'确认导入'}</button></div></div>`;
        document.body.appendChild(bg);
        bg.querySelector('[data-x]').onclick=()=>bg.remove();
        bg.querySelector('[data-ok]').onclick=()=>{
          const mode=bg.querySelector('[name=imode]:checked').value;
          let base=mode==='replace'?[]:list.slice(); const used=new Set(base.map(p=>p.id)); let n=Math.max(0,...base.map(p=>+String(p.id).replace(/\D/g,'')||0));
          const add=items.map(({p})=>{let id=p.id; if(!id||used.has(id)){id='p'+String(++n).padStart(3,'0');} used.add(id); return {...p,id};});
          const skippedDup=[]; const names=new Set(base.map(p=>p.name)); const fin=[];
          add.forEach(p=>{ if(mode==='append'&&names.has(p.name)){skippedDup.push(p.name);return;} fin.push(p); names.add(p.name); });
          list.splice(0,list.length,...base,...fin); st.sel.clear(); A.mark('products'); bg.remove(); draw();
          toast(`已导入 ${fin.length} 件${skippedDup.length?`,跳过同名 ${skippedDup.length} 件`:''}${problems.length?`,跳过有问题的 ${problems.length} 行`:''}(记得保存)`,4200);
        };
      };
      fr.readAsText(file);
    }
    draw();
  },
  validate(A){
    const l=A.draft('products');
    if(!l.length) return '商品库是空的,已拒绝保存(避免一次误操作把库清掉)';
    return null;
  }
});
