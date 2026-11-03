/* 后台框架 + 统一保存机制 */
window.Admin=(function(){
  const sections=[]; const drafts={}; const dirty=new Set(); let validators={};
  const clone=o=>JSON.parse(JSON.stringify(o));
  // 注册一个配置区块:{id,title,keys:[...],render(el,A),validate(A)->string|null}
  function register(sec){sections.push(sec);}
  function draft(key){ if(!(key in drafts)) drafts[key]=clone(Store.get(key)); return drafts[key]; }
  function mark(key){ dirty.add(key); updateBar(); }
  function updateBar(){
    const el=$('#saveState'); if(!el) return;
    if(dirty.size){el.className='dirty';el.textContent='● 有未保存的改动(尚未生效)';}
    else{el.className='hint';el.textContent='没有未保存的改动';}
    $('#btnSave').disabled=!dirty.size; $('#btnDiscard').disabled=!dirty.size;
    $('#srcBadge').innerHTML=Store.badge(['prompts','model','products','personas','materials','styles','sources']);
    $$('[data-secbadge]').forEach(b=>{const keys=b.dataset.secbadge.split(',');b.innerHTML=Store.badge(keys);});
  }
  function save(){
    // 关键内容为空(比如商品列表空了)要拒绝写入;各区块自己校验
    for(const s of sections){
      if(!s.validate) continue;
      if(!s.keys.some(k=>dirty.has(k))) continue;
      const err=s.validate(api);
      if(err){toast('保存被拦住:'+err,3800); const el=$('#sec-'+s.id); if(el) el.scrollIntoView({behavior:'smooth'}); return false;}
    }
    let ok=true;
    dirty.forEach(k=>{ if(!Store.set(k,drafts[k])) ok=false; });
    if(!ok){toast('保存失败:浏览器不允许写入本机存储(可能是隐私模式)',4000);return false;}
    const n=dirty.size; dirty.clear(); updateBar();
    toast(`已保存 ${n} 项配置,存到了「本机浏览器」。要让线上所有访问者生效,请「导出配置」放进 /data/config.json 随部署发布。`,4800);
    return true;
  }
  function discard(){ Object.keys(drafts).forEach(k=>delete drafts[k]); dirty.clear(); renderAll(); }
  function renderNav(){
    $('#adnav').innerHTML=`<h6>本页配置</h6>`+sections.map(s=>`<a data-go="${s.id}">${s.title}</a>`).join('')
      +`<h6>其他页面</h6><a href="index.html">热点营销工作台</a><a href="eval.html">评测台</a>`;
    $$('#adnav [data-go]').forEach(a=>a.onclick=()=>{const t=$('#sec-'+a.dataset.go); if(t){t.scrollIntoView({behavior:'smooth',block:'start'}); history.replaceState(null,'','#'+a.dataset.go);}});
  }
  function renderAll(){
    const body=$('#adbody'); body.innerHTML='';
    sections.forEach(s=>{
      const sec=document.createElement('section'); sec.className='sec card pad'; sec.id='sec-'+s.id; sec.style.scrollMarginTop='70px';
      body.appendChild(sec); s.render(sec,api);
    });
    updateBar();
  }
  function exportFile(){
    const data=JSON.stringify(Store.exportAll(),null,2);
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));
    a.download='hotspot-config.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function importFile(file){
    const fr=new FileReader();
    fr.onerror=()=>toast('读取文件失败');
    fr.onload=()=>{
      let o; try{o=JSON.parse(fr.result);}catch(e){toast('导入失败:这不是有效的 JSON 文件('+e.message.slice(0,40)+')',4000);return;}
      try{
        if(o.products&&(!Array.isArray(o.products)||!o.products.length)) throw new Error('商品列表为空,已拒绝导入');
        Store.importAll(o); Object.keys(drafts).forEach(k=>delete drafts[k]); dirty.clear(); renderAll(); toast('已导入配置');
      }catch(e){toast('导入失败:'+e.message,4000);}
    };
    fr.readAsText(file);
  }
  function start(){
    Store.init().then(()=>{
      renderNav(); renderAll();
      if(location.hash){const t=$('#sec-'+location.hash.slice(1)); if(t) setTimeout(()=>t.scrollIntoView(),50);}
    });
    $('#btnSave').onclick=save; $('#btnDiscard').onclick=async()=>{ if(await confirmBox('放弃所有未保存的改动?','放弃改动')) discard(); };
    $('#btnExport').onclick=exportFile;
    $('#fileImport').onchange=e=>{const f=e.target.files[0]; if(f) importFile(f); e.target.value='';};
    $('#btnRestore').onclick=()=>{
      const ks=Store.KEYS.filter(k=>Store.restoreBackup(k));
      if(!ks.length){toast('还没有可恢复的上一版(保存过一次以上才会有备份)');return;}
      Object.keys(drafts).forEach(k=>delete drafts[k]); dirty.clear(); renderAll(); toast('已恢复 '+ks.length+' 项配置到上一版');
    };
    document.addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault(); if(dirty.size) save(); else toast('没有需要保存的改动');} });
    window.addEventListener('beforeunload',e=>{ if(dirty.size){e.preventDefault(); e.returnValue='';} });
  }
  const api={register,draft,mark,save,start,renderAll,sections,dirty,clone};
  return api;
})();
// 区块头部:标题 + 说明 + 数据来源徽章
window.secHead=(title,sub,keys)=>`<div class="row" style="align-items:flex-start"><div style="flex:1"><h3 style="margin:0">${title}</h3><div class="sub" style="margin-bottom:12px">${sub}</div></div><span data-secbadge="${keys.join(',')}"></span></div>`;
