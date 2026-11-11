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
 const controls=element('section');controls.className='rank-date-field';controls.style.minWidth='0';
 const label=element('label','預測日期'),date=element('input');date.id='rank-target-date';date.type='date';label.append(date);
 const period=element('p'),message=element('p');
 message.setAttribute('role','status');
 const all=element('button','儲存這組供開獎驗證');
 all.type='button';all.className='button quiet';all.disabled=true;
 controls.append(label,period);
 const dateStyle=element('style');dateStyle.textContent='#rank-target-date::-webkit-date-and-time-value{text-align:left;min-height:0;margin:0} #rank-target-date::-webkit-datetime-edit{padding:0}';controls.append(dateStyle);
 const countField=byId('rank-count').closest('label');
 const fields=element('div');fields.className='rank-settings-row';
 fields.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start;margin-bottom:12px';
 countField.before(fields);
 fields.append(countField,controls);
 for(const field of [countField,label]){field.style.cssText='display:flex;flex-direction:column;gap:8px;min-width:0;width:100%;max-width:none;margin:0;padding:0;color:inherit;font:700 14px/20px system-ui,sans-serif';const input=field.querySelector('input');input.style.cssText='display:block;width:100%;min-width:0;max-width:100%;height:46px;min-height:46px;box-sizing:border-box;appearance:none;-webkit-appearance:none;margin:0;padding:0 8px;text-align:left;font:700 16px/normal system-ui,sans-serif';}
 (byId('rank-stop')||go).after(all,message);
 const invalidate=()=>{draft=null;all.disabled=true;};
 const updateDate=()=>{
  try{const t=target(state(),date.value);if(!date.value)date.value=t.dateInfo.date;period.textContent='';period.hidden=true;}
  catch(error){period.hidden=false;period.textContent=error.message;}
 };
 date.addEventListener('change',()=>{
  invalidate();updateDate();
  byId('rank-list').replaceChildren();
  byId('rank-status').textContent='日期已變更，請重新計算。';
  byId('rank-forecast-date').textContent=date.value&&!period.textContent?'本次預測：'+globalThis.ForecastDates.format(date.value):'請選擇有效的預測日期。';
  message.replaceChildren();
 });
 addEventListener('rank-forecast-restored',event=>{
  invalidate();
  date.value=event.detail?.date||'';
  updateDate();
  message.replaceChildren();
 });
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
   all.disabled=true;openSavedRecord(record);
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
   const record=await globalThis.ForecastVerification.save({
    game:c.config.game,date:t.date,period:t.period,method:rule.family,numbers:rule.outputs,
    need:rule.need||rule.memorySpec?.need||1,calculatedAt:draft.calculatedAt,
    cutoffDate:c.rows.at(-1).date,cutoffPeriod:c.rows.at(-1).period,
    dataRevision:c.config.dataRevision||null,evidence:rule
   });
   button.textContent='已儲存這組預測';button.disabled=true;openSavedRecord(record);
  }catch(error){message.textContent=error.message;}
 });
 all.onclick=()=>save(draft?.list.map(item=>item.number)||[]);
 date.value=byId('rank-forecast-date').dataset.restoredDate||'';
 updateDate();
}

function link(){const a=element('a','驗證開獎紀錄');a.href='#verification';return a;}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-save-located]');
 if(!button)return;
 button.parentElement.querySelector('[data-located-save-error]')?.remove();button.disabled=true;
 try{
  const {state:s,rules,targetIndex,statisticsDate}=globalThis.LottoLocatedState();
  const rule=rules.find(item=>item.key===button.dataset.saveLocated);
  if(!rule?.outputs.length||!Number.isInteger(targetIndex))throw Error('請先完成定位分析並取得候選號碼。');
  if(s.config.offset>=s.config.n)throw Error('準期必須早於目標期才能儲存。');
  const spec=globalThis.LocatedMemory.convert(rule,s.config);
  const source=s.rows[targetIndex-s.config.n+s.config.offset];
  const statistics=s.rows.find(row=>row.date===statisticsDate);
  if(!source||!statistics)throw Error('缺少準期或統計資料，請重新計算。');
  const cutoff=source.date>statistics.date?source:statistics;
  const date=s.rows[targetIndex]?.date||globalThis.ForecastDates.next(s.rows,s.config.game,targetIndex-s.rows.length+1).date;
  if(!date)throw Error('無法判定目標開獎日期。');
  const {dateInfo}=target(s,date);
  const record=await globalThis.ForecastVerification.save({game:s.config.game,date:dateInfo.date,period:dateInfo.period,
   method:'定位加減',numbers:rule.outputs,calculatedAt:new Date().toISOString(),
   cutoffDate:cutoff.date,cutoffPeriod:cutoff.period,evidence:{spec,rule}});
  button.textContent='✅';button.setAttribute('aria-label','已儲存供開獎驗證');openSavedRecord(record);
 }catch(error){const note=element("span",error.message);note.dataset.locatedSaveError="";note.setAttribute("role","status");note.style.flexBasis="100%";button.after(note);button.disabled=false;}
});
const center=element('section');center.className='page panel';center.id='page-verification';
document.querySelector('main')?.append(center);
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
filters.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px';
for(const [label,input] of [['彩種',gameFilter],['狀態',statusFilter],['開始日期',from],['計算方式',methodFilter],['結束日期',to]]){
 const field=element('label',label);field.append(input);filters.append(field);input.onchange=()=>refresh();
}
const results=element('div');
const savedNotice=element('p');savedNotice.setAttribute('role','status');
center.append(element('h1','驗證開獎紀錄'),savedNotice,element('p','此頁使用本機手動保存的快照。'),filters,results);
function openSavedRecord(record){
 gameFilter.value=record.game;
 for(const filter of [from,to,methodFilter,statusFilter,count])filter.value='';
 savedNotice.textContent='已儲存 '+record.date+' 的預測：'+format(record.numbers);

 refresh();
}
const researchRecord=byId('branch-study-panel');
const remembered=byId('memory-rules');
if(researchRecord&&remembered){
 const archive=element('details');
 archive.append(element('summary','既有研究核驗 · 今彩539 · 2026/11/02'),researchRecord);
 center.append(archive);
 const rule=element('details');
 rule.className='panel';
 rule.id='remembered-borrow39';
 rule.append(element('summary','借39減法＋加法＋尾數'),
  element('p','今彩539 · 已入雲端研究庫 · 尚未核准列入綜合推薦'),
  element('p','階梯從順4走到順1，每個來源對應下3期。取碼不足減6時先加39再減，另算加6和加法結果的個位數。走到順1後停止。'),
  link());
 remembered.before(rule);
 byId('game')?.addEventListener('change',()=>{rule.hidden=state().config.game!=='539';});
 rule.hidden=state().config.game!=='539';
}


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
   const card=element('article'),v=r.verification;card.className='archive-result';
   const badge=element('span',games[r.game]);badge.className='game-badge';
   const date=globalThis.ForecastDates.format(r.date);
   const balls=element('div');balls.className='archive-balls';
   for(const number of r.numbers){
    const ball=element('strong',format([number]));
    if(v?.hits?.includes(number))ball.className='archive-hit';
    balls.append(ball);
   }
   const outcome=element('p',r.retrospective?'事後研究':v?
    '命中 '+v.count+' 顆：'+format(v.hits)+(r.need>1?' · '+(v.success?'達到':'未達')+'至少'+r.need+'顆':''):'等待開獎／資料尚未載入');
   outcome.className='archive-outcome';outcome.setAttribute('role','status');
   card.append(badge,element('h3',date+' · '+r.count+'顆'),element('p',r.method+'｜目標 '+date),balls,outcome);
   if(v){
    const opened=element('p');opened.className='archive-opened';
    opened.append(element('span',games[r.game]+'｜實際開獎 '+r.date),element('strong',format(v.opened)));
    card.append(opened);
   }
   const version=element('details');
   version.append(element('summary','版本資料'),
    element('p','期別 '+(r.period||'待確認')+' · 保存 '+new Date(r.savedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})),
    element('p','紀錄 '+r.id));
   card.append(version);
   const evidence=element('details');evidence.append(element('summary','查看推算公式'));
   const entries=Array.isArray(r.evidence)?r.evidence:[r.evidence];
   let shown=0;
   for(const entry of entries.filter(Boolean)){
    const rules=entry.rules||entry.methodGroups?.map(group=>group.rule)||[entry.rule||entry];
    const section=element('section');
    if(entry.number)section.append(element('h4','候選號碼 '+format([entry.number])));
    for(const rule of rules.filter(Boolean)){
     if(!rule.label&&rule.value==null)continue;
     const item=element('p',rule.label||((rule.op==='sum'?'合數':'差數')+' · 準順'+(rule.p+1)+' · 公式值 '+rule.value));
     section.append(item);
     if(rule.sourceDate)section.append(element('p','來源日期 '+rule.sourceDate));
     if(rule.samples)section.append(element('p','歷史符合 '+rule.hits+'／'+rule.samples+' 組'));
     shown++;
    }
    evidence.append(section);
   }
   if(!shown)evidence.append(element('p','此舊紀錄未保存可顯示的公式摘要。原始研究資料仍保留。'));
   card.append(evidence);
   groups.get(label).append(card);
  }
  if(!matched.length)results.append(element('p','沒有符合條件的手動保存紀錄。'));
 }catch(error){results.replaceChildren(element('p',error.message));}
}
// Move the existing result nodes. Their original renderers and stored records stay in use.
const rankArchive=document.querySelector('#page-rank .rank-archive-panel');
if(rankArchive){
 const shortcut=link();shortcut.textContent='查看已存推薦與開獎核驗';
 rankArchive.before(shortcut);
 center.append(rankArchive);
}
const chainSnapshots=byId('chain-snapshots');
if(chainSnapshots){
 const heading=chainSnapshots.previousElementSibling;
 const records=element('section');records.className='panel';records.id='verification-chain-records';
 records.append(heading,chainSnapshots);
 center.append(records);
 const shortcut=link();shortcut.textContent='查看兩階段版路的開獎核驗';
 byId('chain-rules')?.after(shortcut);
}
const memoryLog=byId('memory-log')?.closest('section');
if(memoryLog&&memoryLog.id!=='page-memory')center.append(memoryLog);
addEventListener('verification-page-open',refresh);
if(location.hash==='#verification'){
 center.classList.add('active');
 refresh();
}
