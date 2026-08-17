(()=>{'use strict';
const baseFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  const raw=typeof input==='string'?input:(input&&input.url)||'';
  if(!raw||!raw.includes('/api/place-search'))return baseFetch(input,init);
  try{
    const u=new URL(raw,location.origin);
    const q=u.searchParams.get('q')||'';
    const address=u.searchParams.get('address')||'';
    if(q.trim().length>=2){
      const fast=new URL('/api/naver-local',location.origin);
      fast.searchParams.set('q',q);
      if(address)fast.searchParams.set('address',address);
      const r=await baseFetch(fast.pathname+fast.search,{cache:'no-store'});
      const d=await r.json();
      if(d?.available&&Array.isArray(d.places)&&d.places.length){
        return new Response(JSON.stringify({query:q,places:d.places,mode:d.mode,providers:{naver:true,kakao:false,diningcode:false}}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
      }
    }
  }catch(_){}
  return baseFetch(input,init);
};
})();
