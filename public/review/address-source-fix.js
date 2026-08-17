(()=>{'use strict';
const baseFetch=window.fetch.bind(window);
function providerRank(p){const s=new Set([p?.source,...(Array.isArray(p?.sources)?p.sources:[])].filter(Boolean));if(s.has('kakao'))return 3;if(s.has('naver'))return 2;if(s.has('diningcode'))return 1;return 0}
function sourceText(p){const s=new Set([p?.source,...(Array.isArray(p?.sources)?p.sources:[])].filter(Boolean));const names=[];if(s.has('kakao'))names.push('카카오맵');if(s.has('naver'))names.push('네이버');if(s.has('diningcode'))names.push('다이닝코드');return names.join(' + ')}
window.fetch=async function(input,init){
  const r=await baseFetch(input,init);
  try{
    const raw=typeof input==='string'?input:(input&&input.url)||'';
    if(!raw||!raw.includes('/api/place-search'))return r;
    const d=await r.clone().json();
    if(!Array.isArray(d?.places))return r;
    const mapPlaces=d.places.filter(p=>providerRank(p)>=2);
    const rest=d.places.filter(p=>providerRank(p)<2);
    const places=(mapPlaces.length?[...mapPlaces,...rest]:d.places).map(p=>{
      const rank=providerRank(p),src=sourceText(p);
      const context=[rank>=2?'주소 기준: '+src:(src?'주소 참고: '+src:''),p.category||'',p.phone||''].filter(Boolean).join(' · ');
      return {...p,context,addressSource:rank>=2?src:(src||'기타')};
    });
    places.sort((a,b)=>providerRank(b)-providerRank(a)||(Number(b.score)||0)-(Number(a.score)||0));
    return new Response(JSON.stringify({...d,places}),{status:r.status,statusText:r.statusText,headers:r.headers});
  }catch(_){return r}
};
})();