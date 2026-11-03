/* 三级配置读取:本机浏览器 > 服务端静态配置(/data/config.json) > 内置默认值 */
window.Store = (function(){
  const KEYS=['sources','riskRules','products','personas','materials','styles','tones','rules','prompts','model','evalCases'];
  let server={}; let ready=false;
  const LBL={local:'本机浏览器',server:'服务端配置',default:'内置默认'};
  const clone=o=>JSON.parse(JSON.stringify(o));
  function lsGet(k){try{const v=localStorage.getItem('hs_'+k);return v?JSON.parse(v):undefined}catch(e){return undefined}}
  function lsSet(k,v){try{localStorage.setItem('hs_'+k,JSON.stringify(v));return true}catch(e){return false}}
  async function init(){
    if(ready) return;
    try{const r=await fetch('/data/config.json',{cache:'no-store'}); if(r.ok){const j=await r.json(); if(j&&typeof j==='object') server=j;}}catch(e){}
    ready=true;
  }
  function fill(key,val){ // 读取时对缺失内容补默认值(运营误删一段也不崩)
    const d=window.DEFAULTS[key];
    if(Array.isArray(d)) return Array.isArray(val)?val:clone(d);
    if(d && typeof d==='object') return Object.assign(clone(d),val&&typeof val==='object'?val:{});
    return val===undefined?d:val;
  }
  function get(key){
    const l=lsGet(key); if(l!==undefined) return fill(key,l);
    if(server[key]!==undefined) return fill(key,server[key]);
    return clone(window.DEFAULTS[key]);
  }
  function source(key){
    if(lsGet(key)!==undefined) return 'local';
    if(server[key]!==undefined) return 'server';
    return 'default';
  }
  function set(key,val){
    try{const old=localStorage.getItem('hs_'+key); if(old!==null) localStorage.setItem('hs_bak_'+key,old);}catch(e){}
    return lsSet(key,val);
  }
  function restoreBackup(key){try{const b=localStorage.getItem('hs_bak_'+key); if(b===null) return false; localStorage.setItem('hs_'+key,b); return true}catch(e){return false}}
  function reset(key){try{localStorage.removeItem('hs_'+key)}catch(e){}}
  function exportAll(){const o={}; KEYS.forEach(k=>o[k]=get(k)); return o;}
  function importAll(o){
    if(!o||typeof o!=='object') throw new Error('文件内容不是有效的配置对象');
    const bad=Object.keys(o).filter(k=>!KEYS.includes(k));
    if(bad.length && Object.keys(o).every(k=>!KEYS.includes(k))) throw new Error('文件里没有可识别的配置项('+bad.slice(0,3).join('、')+'…)');
    KEYS.forEach(k=>{if(o[k]!==undefined) set(k,o[k]);});
  }
  /* 顶栏徽章:当前页面用到的数据来自哪一级 */
  function badge(keys){
    const order={local:0,server:1,default:2}; let worst='default';
    keys.forEach(k=>{const s=source(k); if(order[s]<order[worst]) worst=s;});
    const cls=worst==='local'?'warn':worst==='server'?'ok':'';
    return `<span class="badge ${cls}" title="三级读取:本机浏览器 > 服务端配置 > 内置默认">数据来源:${LBL[worst]}</span>`;
  }
  return {init,get,set,source,reset,restoreBackup,exportAll,importAll,badge,KEYS,LBL};
})();
window.$=(s,r=document)=>r.querySelector(s);
window.$$=(s,r=document)=>[...r.querySelectorAll(s)];
window.esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.toast=(msg,ms=2200)=>{const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),ms)};

window.confirmBox=(html,okText)=>new Promise(res=>{
  const bg=document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML=`<div class="modal" style="max-width:460px"><h3>确认</h3><div>${html}</div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-x>取消</button><button class="btn primary" data-ok>${esc(okText||'确定')}</button></div></div>`;
  document.body.appendChild(bg);
  const done=v=>{bg.remove();res(v);};
  bg.querySelector('[data-x]').onclick=()=>done(false); bg.querySelector('[data-ok]').onclick=()=>done(true);
  bg.onclick=e=>{if(e.target===bg)done(false);};
});
