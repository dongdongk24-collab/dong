(()=>{'use strict';
const $=s=>document.querySelector(s);
let fixing=false,lastFix=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function norm(s){return String(s||'').replace(/\s+/g,' ').trim()}
function looksUdon(s){return /(우동단|무동다|무동단|무돔단|우동다|우돔단|우동타|무동타)/.test(String(s||''))}
function menuFromText(s){const t=String(s||''),out=[];const add=x=>{if(x&&!out.includes(x))out.push(x)};
 if(/부[카가][게케캐]|보[카가][게케]/.test(t)) add('부카케우동');
 if(/[사자산][루투두][^,\n]{0,8}(?:우동|두동|무동)|사루우동|자루우동|산두우동|사투두동/.test(t)) add('자루우동');
 if(/코.?카.?콜.?라|꼬.?카.?콜.?라|꾸카롤라|코가콜라/.test(t)) add('코카콜라');
 if(/(?:^|[ ,])카스(?:[ ,]|$)/.test(t)) add('카스');
 return out;
}
async function chooseUdon(){for(let i=0;i<12;i++){await sleep(350);const opts=[...document.querySelectorAll('#placeOptions .place-option')];if(!opts.length)continue;let best=opts.find(o=>/우동단/.test(o.querySelector('.pon')?.textContent||'')&&/(인천|중구|영종|오작로)/.test((o.querySelector('.poa')?.textContent||'')+' '+(o.querySelector('.poc')?.textContent||'')));
 if(!best)best=opts.find(o=>/우동단/.test(o.querySelector('.pon')?.textContent||''));if(best){best.click();return true}}
 return false;
}
async function fixUdon(){const now=Date.now();if(fixing||now-lastFix<1200)return;const status=$('#status')?.textContent||'',place=$('#place')?.value||'',menu=$('#menu')?.value||'';if(!looksUdon(status+' '+place))return;fixing=true;lastFix=now;try{
 const pe=$('#place');if(pe&&pe.value!=='우동단'){pe.value='우동단';pe.dispatchEvent(new Event('input',{bubbles:true}))}
 const found=menuFromText(status+' '+menu);if(found.length){$('#menu').value=found.join(', ')}else if($('#menu')){$('#menu').value=''}
 const st=$('#status');if(st){st.textContent='✓ 상호명 보정 · 우동단 · 실제 매장과 공개 메뉴를 확인하는 중이에요…';st.className='status show good'}
 await sleep(120);$('#placeSearchBtn')?.click();await chooseUdon();
 }finally{fixing=false}
}
window.addEventListener('DOMContentLoaded',()=>{const st=$('#status');if(st)new MutationObserver(()=>fixUdon()).observe(st,{childList:true,subtree:true,characterData:true});const p=$('#place');if(p)p.addEventListener('input',()=>fixUdon());['galleryInput','cameraInput'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{setTimeout(fixUdon,700);setTimeout(fixUdon,2200)}));});
})();