(()=>{'use strict';
const baseFetch=window.fetch.bind(window);
const norm=s=>String(s||'').toLowerCase().replace(/[^가-힣a-z0-9]+/g,'');
const phone=s=>String(s||'').replace(/\D/g,'');
function modeLabel(mode){
 if(mode==='kakao-api')return'주소 기준: 카카오맵 공식 API';
 if(mode==='naver-api')return'주소 기준: 네이버 공식 API';
 if(mode==='kakao-public')return'주소 기준: 카카오맵 공개정보';
 if(mode==='naver-public')return'주소 기준: 네이버 공개정보';
 if(mode==='diningcode')return'지도 결과 없음 · 다이닝코드 보조';
 return'주소 확인 완료';
}
window.fetch=async function(input,init){
 const r=await baseFetch(input,init);
 try{
   const raw=typeof input==='string'?input:(input&&input.url)||'';
   if(!raw.includes('/api/place-search'))return r;
   const d=await r.clone().json();
   if(!Array.isArray(d?.places))return r;
   const seen=new Set(),out=[];
   for(const p of d.places){
     if(!p?.name||!p?.address)continue;
     const pk=phone(p.phone),k=pk?`p:${pk}`:`a:${norm(p.name)}:${norm(p.address)}`;
     if(seen.has(k))continue;seen.add(k);
     out.push({...p,context:[modeLabel(d.mode),p.category||'',p.phone||''].filter(Boolean).join(' · ')});
     if(out.length>=10)break;
   }
   return new Response(JSON.stringify({...d,places:out,totalCandidates:out.length}),{status:r.status,statusText:r.statusText,headers:r.headers});
 }catch(_){return r}
};
})();