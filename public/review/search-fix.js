(()=>{'use strict';
const originalFetch=window.fetch.bind(window);
function normalizePlaceQuery(q){
  let x=String(q||'').trim();
  const aliases=[
    [/긴\s*자로\s*쿄/gi,'긴자료코'],
    [/긴\s*자료\s*쿄/gi,'긴자료코'],
    [/긴\s*자로\s*코/gi,'긴자료코'],
    [/긴\s*자료\s*코/gi,'긴자료코'],
    [/긴\s*자료\s*꼬/gi,'긴자료코']
  ];
  for(const [re,to] of aliases)x=x.replace(re,to);
  return x.replace(/\s+/g,' ').trim();
}
window.fetch=async function(input,init){
  try{
    const raw=typeof input==='string'?input:(input&&input.url)||'';
    if(raw&&raw.includes('/api/place-search')){
      const u=new URL(raw,location.origin);
      const q=u.searchParams.get('q')||'';
      const nq=normalizePlaceQuery(q);
      if(nq&&nq!==q){
        u.searchParams.set('q',nq);
        input=typeof input==='string'?(u.pathname+u.search):new Request(u.toString(),input);
      }
    }
  }catch(_){}
  return originalFetch(input,init);
};
window.__normalizePlaceQuery=normalizePlaceQuery;
})();