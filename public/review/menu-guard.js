(()=>{'use strict';
const originalFetch=window.fetch.bind(window);
const allowed=new Set();
function key(p){return [p.place||'',p.placeAddress||'',p.menu||''].join('|').toLowerCase().replace(/\s+/g,'')}
function syntheticError(message){return new Response(JSON.stringify({error:message}),{status:422,headers:{'Content-Type':'application/json; charset=utf-8'}})}
window.fetch=async function(input,init){
  const raw=typeof input==='string'?input:(input&&input.url)||'';
  if(!raw||!raw.includes('/api/review3'))return originalFetch(input,init);
  let payload=null;
  try{payload=JSON.parse(init?.body||'{}')}catch(_){}
  if(!payload?.menu||!String(payload.menu).trim())return originalFetch(input,init);
  const k=key(payload);
  if(allowed.has(k))return originalFetch(input,init);
  try{
    const r=await originalFetch('/api/menu-check',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(payload),cache:'no-store'});
    const d=await r.json();
    if(d?.checked&&d?.warn&&Array.isArray(d.unmatched)&&d.unmatched.length){
      const bad=d.unmatched.join(', ');
      const examples=Array.isArray(d.examples)&&d.examples.length?'\n\n이 매장에서 확인되는 메뉴 예시: '+d.examples.slice(0,5).join(', '):'';
      const ok=window.confirm(`⚠️ 메뉴명을 한 번 더 확인해 주세요.\n\n선택한 매장의 공개 메뉴정보에서 “${bad}”을(를) 확인하지 못했어요.${examples}\n\n입력이 맞다면 [확인]을 눌러 그대로 진행하고, 잘못 입력했다면 [취소]를 눌러 메뉴를 다시 입력해 주세요.`);
      if(!ok){
        const el=document.querySelector('#menu');
        if(el){el.focus();try{el.select()}catch(_){}}
        return syntheticError('메뉴명을 다시 확인해 주세요.');
      }
      allowed.add(k);
    }
  }catch(_){}
  return originalFetch(input,init);
};
})();
