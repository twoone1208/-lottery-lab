import {resolveForecastTarget,createForecastStore,compareForecasts} from './forecast-verification.mjs';

const store=createForecastStore(localStorage);
const byId=id=>document.getElementById(id);
const element=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
const format=values=>values?.map(n=>String(n).padStart(2,'0')).join('、')||'—';
const games={'539':'今彩539',daily:'天天樂',mark6:'六合彩'};
let draft=null;
const state=()=>globalThis.LottoSearchState();
const target=(s,date)=>resolveForecastTarget(s,date,globalThis.ForecastDates.next);
globalThis.ForecastVerification={target,save:async input=>{
 const s=state();
 if(s.config.game!==input.game)throw Error('彩種已切換，請返回原彩種再儲存');
 globalThis.CentralDataset.assert(input.game,s.rows);
 const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'short'}).format(new Date());
 const [today,time]=now.split(' ');
 const drawTime={'539':'20:30',daily:'09:30',mark6:'21:30'}[input.game];
 const record=store.save({...input,retrospective:input.date<today||(input.date===today&&time>=drawTime)},s.rows);
 store.reconcile(input.game,s.rows);
 return record;
}};

const go=byId('rank-go');
if(go){
 const controls=element('section');controls.className='callout';
 const label=element('label','預測目標日期'),date=element('input');date.id='rank-target-date';date.type='date';label.append(date);
 const period=element('p'),message=element('p');
 message.setAttribute('role','status');
 const all=element('button','儲存這組供開獎驗證');
 all.type='button';all.className='button quiet';all.disabled=true;
 controls.append(label,period);
 go.before(controls);
 (byId('rank-stop')||go).after(all,message);
 const invalidate=()=>{draft=null;all.disabled=true;};
 const updateDate=()=>{
  try{const t=target(state(),date.value);if(!date.value)date.value=t.dateInfo.date;period.textContent='目標期別 '+(t.dateInfo.period||'待確認')+' · '+t.dateInfo.quality;}
  catch(error){period.textContent=error.message;}
 };
 date.addEventListener('change',()=>{invalidate();updateDate();});
 byId('game')?.addEventListener('change',()=>{date.value='';invalidate();updateDate();});
 addEventListener('lotto-history-updated',()=>{if(!draft){date.value='';updateDate();}refresh();});
 addEventListener('rank-calculation-start',()=>{invalidate();message.textContent='計算中';});
 addEventListener('rank-calculation-cancel',()=>{invalidate();message.textContent='本次未完整算完';});
 addEventListener('rank-calculation-complete',event=>{
  draft=structuredClone(event.detail);draft.calculatedAt=new Date().toISOString();
  all.disabled=false;message.textContent='計算完成，可儲存整組號碼。';
 });
 async function save(numbers){
  if(!draft||!numbers.length){message.textContent='請先計算並選擇號碼';return;}
  const {state:s,dateInfo,list,calculatedAt}=draft;
  try{
   const record=await globalThis.ForecastVerification.save({
    game:s.config.game,date:dateInfo.date,period:dateInfo.period,method:'綜合推薦',numbers,selectionType:'all',
    calculatedAt,cutoffDate:s.rows.at(-1).date,cutoffPeriod:s.rows.at(-1).period,
    dataRevision:s.config.dataRevision||null,evidence:list.filter(item=>numbers.includes(item.number))
   });
   message.replaceChildren(element('span','已儲存 '+record.id.slice(0,8)+'。 '),link());
   all.disabled=true;refresh();
  }catch(error){message.textContent=error.message;}
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-save-rank-rule]');
  if(!button||!draft)return;
  const ref=globalThis.getRememberedRankRule?.(Number(button.dataset.saveRankRule));
  if(!ref?.rule||ref.state.config.game!==draft.state.config.game||
     ref.state.rows.at(-1)?.date!==draft.state.rows.at(-1)?.date)return;
  const rule=ref.rule,t=draft.dateInfo,c=draft.state;
  try{
   await globalThis.ForecastVerification.save({
    game:c.config.game,date:t.date,period:t.period,method:rule.family,numbers:rule.outputs,
    need:rule.need||rule.memorySpec?.need||1,calculatedAt:draft.calculatedAt,
    cutoffDate:c.rows.at(-1).date,cutoffPeriod:c.rows.at(-1).period,
    dataRevision:c.config.dataRevision||null,evidence:rule
   });
   button.textContent='已儲存這組預測';button.disabled=true;refresh();
  }catch(error){message.textContent=error.message;}
 });
 all.onclick=()=>save(draft?.list.map(item=>item.number)||[]);
 updateDate();
}

function link(){const a=element('a','驗證開獎紀錄');a.href='#verification';return a;}
const center=element('section');center.className='panel';center.id='verification-center';center.hidden=true;
document.querySelector('main')?.append(center);
const menu=document.querySelector('.mobile-nav');
if(menu){const a=link();a.className='nav';menu.append(a);}
byId('page-home')?.append(link());
const gameFilter=element('select'),methodFilter=element('select'),statusFilter=element('select');
const from=element('input'),to=element('input'),count=element('input');
from.type=to.type='date';count.type='number';count.min='1';
function options(select,entries){
 const old=select.value;select.replaceChildren();
 for(const [value,label] of entries){const option=element('option',label);option.value=value;select.append(option);}
 if([...select.options].some(x=>x.value===old))select.value=old;
}
options(gameFilter,[['','全部彩種'],...Object.entries(games)]);
options(statusFilter,[['','全部狀態'],['pending','待開獎'],['hit','已命中'],['miss','未命中'],['research','事後研究']]);
const filters=element('div');filters.className='field-grid';
for(const [label,input] of [['彩種',gameFilter],['開始日期',from],['結束日期',to],['計算方式',methodFilter],['狀態',statusFilter],['推薦顆數',count]]){
 const field=element('label',label);field.append(input);filters.append(field);input.onchange=()=>refresh();
}
const results=element('div');
center.append(element('h1','驗證開獎紀錄'),element('p','此頁使用本機手動保存的快照。'),filters,results);

function refresh(){
 try{
  for(const game of Object.keys(games)){
   const draws=globalThis.CentralDataset?.cached(game)?.rows;
   if(draws?.length)store.reconcile(game,draws);
  }
  const records=store.list();
  options(methodFilter,[['','全部方式'],...[...new Set(records.map(r=>r.method))].map(m=>[m,m])]);
  const eligible=records.filter(r=>{
   return (!gameFilter.value||r.game===gameFilter.value)&&(!methodFilter.value||r.method===methodFilter.value)&&
    (!from.value||r.date>=from.value)&&(!to.value||r.date<=to.value)&&(!count.value||r.count===Number(count.value));
  });
  const matched=eligible.filter(r=>!statusFilter.value||statusFilter.value===(r.retrospective?'research':r.verification?(r.verification.success?'hit':'miss'):'pending'));
  results.replaceChildren(element('h2','公式成績比較'));
  for(const g of compareForecasts(eligible).sort((a,b)=>(b.rate??-1)-(a.rate??-1)||b.verified-a.verified)){
   results.append(element('p',games[g.game]+' · '+g.method+' · '+g.count+'顆／門檻'+g.need+' · 總預測 '+g.total+' · 已驗證 '+g.verified+' · 命中 '+g.won+' · 未命中 '+g.missed+' · 命中率 '+(g.rate==null?'—':(100*g.rate).toFixed(1)+'%')+' · 平均 '+(g.average?.toFixed(2)??'—')+'顆 · 分布 '+Object.entries(g.distribution).map(([n,v])=>n+'顆 '+v+'次').join('、')));
  }
  const groups=new Map();
  for(const r of matched.sort((a,b)=>b.date.localeCompare(a.date)||b.savedAt.localeCompare(a.savedAt))){
   const label=games[r.game]+' · '+r.date+' · '+r.method;
   if(!groups.has(label)){const group=element('section');group.className='panel';group.append(element('h3',label));groups.set(label,group);results.append(group);}
   const card=element('details'),v=r.verification;
   card.append(element('summary',format(r.numbers)+' · '+(r.retrospective?'事後研究':v?(v.success?'已命中':'未命中'):'待開獎')),
    element('p','期別 '+(r.period||'待確認')+' · 命中 '+format(v?.hits)+'（'+(v?.count??'—')+'顆） · 實際開出 '+format(v?.opened)),
    element('p','保存 '+new Date(r.savedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+' · '+r.id));
   const evidence=element('pre',JSON.stringify(r.evidence,null,2));evidence.style.whiteSpace='pre-wrap';evidence.style.overflowWrap='anywhere';card.append(evidence);
   groups.get(label).append(card);
  }
  if(!matched.length)results.append(element('p','沒有符合條件的手動保存紀錄。'));
 }catch(error){results.replaceChildren(element('p',error.message));}
}
function route(){
 const open=location.hash==='#verification';
 center.hidden=!open;
 if(open){document.querySelectorAll('.page.active').forEach(page=>page.classList.remove('active'));refresh();}
}
addEventListener('hashchange',route);
route();
