(()=>{'use strict';
window.__receiptHotfixVersion='6.0.2';
const $=s=>document.querySelector(s);
function cleanMerchant(v){let x=String(v||'').normalize('NFC').replace(/\s+/g,' ').trim();x=x.replace(/^(?:장호|상호|상오|상흐|상호명|매장명)\s*[:：]?\s*/,'');x=x.replace(/무동다|무동단|무돔단|우동다|우돔단/g,'우동단');x=x.replace(/염종도점|엄종도점|영종두점|염종두점/g,'영종도점');x=x.replace(/^0?27(?=\s*\(|\s|$)/i,'C27').replace(/^C27\s*\(([^)]*점)?$/i,(_,a)=>'C27 '+(a||'')).replace(/C27\s*\(([^)]+점)\)/i,'C27 $1');x=x.replace(/마시[린람란렌]/g,'마시란');return x.replace(/\s+/g,' ').trim()}
function norm(s){return String(s||'').toLowerCase().replace(/[^가-힣a-z0-9]+/g,'')}
function sim(a,b){const A=norm(a),B=norm(b);if(!A||!B)return 0;if(A===B)return 100;if(A.includes(B)||B.includes(A))return 90;let hit=0,total=0;for(let i=0;i<A.length-1;i++){total++;if(B.includes(A.slice(i,i+2)))hit++}return total?Math.round(hit/total*80):0}
let busy=false,last='';
function run(){if(busy)return;const p=$('#place');if(!p)return;const fixed=cleanMerchant(p.value);if(!fixed||fixed===last)return;last=fixed;if(fixed!==p.value){p.value=fixed;p.dispatchEvent(new Event('input',{bubbles:true}))}busy=true;setTimeout(()=>{$('#placeSearchBtn')?.click();setTimeout(()=>{const ops=[...document.querySelectorAll('#placeOptions .place-option')];let best=null,score=0;for(const o of ops){const n=o.querySelector('.pon')?.textContent||'';const s=sim(fixed,n);if(s>score){score=s;best=o}}if(best&&score>=72)best.click();busy=false},1500)},200)}
window.addEventListener('DOMContentLoaded',()=>{const s=$('#status');if(!s)return;new MutationObserver(()=>{if(/1차 인식|상호명 후보|인식 완료/.test(s.textContent||''))run()}).observe(s,{childList:true,subtree:true,characterData:true})});
})();