import {canonical,rankEvidence,wilson} from './research-core.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=x=>x==null?'—':(100*x).toFixed(1)+'%';
const fld=(text,control)=>`<label>${text}${control}</label>`;
export async function mount(client,ctx,game,root){
 const api=async(action,p={})=>{const r=await client.rpc('lab3_research_api',{action,p});if(r.error)throw Error(r.error.message);return r.data;};
 const edge=async body=>{const r=await client.functions.invoke('lab3-research-engine',{body});if(r.error)throw r.error;if(r.data?.error)throw Error(r.data.error);return r.data;};
 let busy=false;const act=fn=>async()=>{if(busy)return;busy=true;const msg=root.querySelector('[data-message]');msg.textContent='處理中…';try{await fn();}catch(e){msg.textContent=e.message||String(e);}finally{busy=false;}};
 const [versions,forecasts,rankings,terms]=await Promise.all([api('list'),api('predictions'),ctx.consented?api('rankings',{game}):Promise.resolve([]),api('terms')]);
 const adm=['super_admin','admin'].includes(ctx.role),count=game==='mark6'?6:5;
 root.innerHTML=`<div class="notice">條件規律、跨期來源與階梯公式獨立研究。先回測，再追蹤，累積前瞻核驗後才能核准。觀察窗/候選組命中率不作單碼機率。</div><p data-message role="status"></p>${!terms.accepted?'<p class="notice">新增前請到個人中心閱讀並主動同意新版公告。</p>':''}
 <div class="toolbar"><button data-export>匯出自己的研究版本</button><label>主動匯入JSON版本<input data-import type="file" accept="application/json,.json" ${terms.accepted?'':'disabled'}></label></div>
 <details class="panel"><summary>＋ 建立條件／跨期／階梯規律</summary><form data-form class="form">
 ${fld('名稱','<input name="name" maxlength="120" required>')}
 ${fld('公式種類','<select name="kind"><option value="tails">尾數規律</option><option value="group">固定候選組</option><option value="arithmetic">跨期2／3來源運算</option><option value="staircase">固定合數階梯</option></select>')}
 ${fld('定位號碼（空白表示每期）','<input name="trigger" placeholder="37 或 11,22">')}
 ${fld('定位順位','<select name="position"><option value="0">不限</option>'+Array.from({length:count},(_,i)=>`<option>${i+1}</option>`).join('')+'</select>')}
 ${fld('球序','<select name="order"><option value="sorted">順球（小至大）</option><option value="draw">實際落球</option></select>')}
 ${fld('目標起期','<input name="start" type="number" min="1" max="30" value="1" required>')}
 ${fld('目標終期','<input name="end" type="number" min="1" max="30" value="2" required>')}
 ${fld('同一期至少命中','<select name="need"><option>1</option><option>2</option><option>3</option></select>')}
 ${fld('尾數／候選號碼','<input name="values" placeholder="尾數：6,9；二中一：11,22">')}
 ${fld('跨期來源（偏移:順位，以逗號分隔）','<input name="sources" placeholder="-7:1,0:2 或 -3:1,-1:2,0:3">')}
 ${fld('跨期運算','<select name="op"><option value="sum">加法</option><option value="difference">依序相減</option><option value="absolute">兩來源絕對差</option></select>')}
 ${fld('常數／階梯固定合數','<input name="constant" type="number" value="0" min="-1000" max="1000">')}
 ${fld('循環','<select name="cycle"><option value="true">依彩種39／49循環</option><option value="false">只保留有效值</option></select>')}
 ${fld('階梯期距','<input name="lag" type="number" min="1" max="30" value="3">')}
 ${fld('階梯相位（期序固定，不隨日期滑動）','<input name="phase" type="number" min="0" max="'+(count-1)+'" value="0">')}
 ${fld('階梯步長','<input name="step" type="number" min="1" max="'+(count-1)+'" value="1">')}
 ${fld('另建版本（可空白）','<select name="previous"><option value="">新公式</option>'+versions.filter(v=>v.owner_id===ctx.user_id&&v.game===game).map(v=>`<option value="${v.id}">${esc(v.name)} v${v.revision}</option>`).join('')+'</select>')}
 ${adm?fld('建立來源','<select name="company"><option value="false">個人</option><option value="true">公司</option></select>'):''}
 <button class="primary full" ${terms.accepted?'':'disabled'}>明確儲存此版本到雲端研究庫</button><p class="muted full">偏移以定位期為0；負數往上、正數往下。所有來源必須早於目標起期，且建立快照時已可取得。尾數與候選組以整個觀察窗／組別統計。</p></form></details>
 <div class="panel"><h2>雲端研究版本</h2>${versions.filter(v=>v.game===game).map(v=>`<details><summary>${esc(v.name)} v${v.revision} · ${esc(v.status)} · ${v.authorized?'授權有效':'已撤回'}</summary><p>識別 ${v.formula_hash.slice(0,16)}</p><pre style="white-space:pre-wrap">${esc(JSON.stringify(v.definition,null,2))}</pre><p>訓練：${v.evaluation?`${v.evaluation.train.hits}/${v.evaluation.train.samples}（${pct(v.evaluation.train.rate)}）`:'尚未回測'}；保留段：${v.evaluation?`${v.evaluation.holdout.hits}/${v.evaluation.holdout.samples}（${pct(v.evaluation.holdout.rate)}）`:'尚未回測'}；建版後嚴格前瞻（開獎日前已封存）：${v.prospective.hits}/${v.prospective.samples}</p><button data-backtest="${v.id}">雲端回測</button>${adm?`<button data-state="tracking" data-id="${v.id}">啟用追蹤</button><button data-state="paused" data-id="${v.id}">暫停</button>`:''}${ctx.role==='super_admin'?`<button data-state="approved" data-id="${v.id}">通過門檻後核准</button>`:''}</details>`).join('')||'<p>尚無版本。</p>'}</div>
 ${adm?'<div class="panel"><h2>電腦自動探索</h2><p>不必指定哪個號碼加哪個號碼。每批100組，保留游標接續；來源偏移−30～＋29、目標期距1～30、全部順位。正偏移僅限目標開獎前已知來源。範圍很大，不宣稱單次已窮盡；每批最多保留20條訓練研究結果。</p><button data-discover="two">兩來源探索</button><button data-discover="three">三來源探索</button><button data-discover="staircase">階梯合數探索</button><button data-tick>立即掃描有效規律</button></div>':''}
 <div class="panel"><h2>前瞻快照與核驗</h2>${forecasts.filter(f=>f.game===game).map(f=>`<p>來源截止序${f.cutoff_seq} → 目標序${f.target_start}${f.target_end!==f.target_start?'～'+f.target_end:''}：${f.candidates.join('／')} · ${f.verified_at?(f.hit?'命中':'未命中'):'待驗證'} · ${esc(f.metric)}</p>`).join('')||'<p>尚無封存快照，不補造命中紀錄。</p>'}</div>
 <div class="panel"><h2>中央核准單碼研究榜</h2><p>組別／觀察窗不轉換成單碼命中率。原版完整計算及原榜仍獨立保留。</p>${rankings.map(r=>{const evidence=r.payload.flatMap(x=>x.evidence.map(e=>({...e,candidates:[x.number],approved:true,authorized:true})));const list=rankEvidence(evidence,r.target_seq,game==='mark6'?49:39);return `<details><summary>截止序${r.cutoff_seq} → 目標序${r.target_seq} · ${r.created_at}</summary>${list.map(n=>`<p><b>${String(n.number).padStart(2,'0')}</b>　${n.families}類支持 · Wilson研究分數 ${n.score.toFixed(3)}</p>`).join('')||'沒有通過門檻的單碼證據'}</details>`;}).join('')||'<p>尚無正式核准證據，中央榜不補數字。</p>'}</div>`;
 root.querySelector('[data-export]').onclick=()=>{const mine=versions.filter(v=>v.owner_id===ctx.user_id),ids=new Set(mine.map(v=>v.id));const blob=new Blob([JSON.stringify({schema:'lab3-research-export/2',versions:mine,predictions:forecasts.filter(f=>ids.has(f.version_id)),restore_note:'匯入僅重建你主動選擇的公式版本並記錄新授權；快照與核驗供備份保存，不匯入為過去命中或同意證據。'},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='我的研究版本.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 root.querySelector('[data-import]').onchange=act(async()=>{const file=root.querySelector('[data-import]').files[0];if(!file||file.size>1000000)throw Error('檔案需小於1MB');const raw=JSON.parse(await file.text()),items=raw.versions||raw;if(!Array.isArray(items)||items.length>100)throw Error('每批最多100個版本');let ok=0,errors=[];for(const item of items){try{await api('create',{name:item.name,definition:canonical(item.definition),company:false});ok++;}catch(e){errors.push((item.name||'未命名')+'：'+e.message);}}await mount(client,ctx,game,root);root.querySelector('[data-message]').textContent='已匯入並記錄指定版本授權 '+ok+'筆。'+errors.join('；');});
 root.querySelector('[data-form]').onsubmit=e=>{e.preventDefault();act(async()=>{
 const f=Object.fromEntries(new FormData(e.target)),nums=s=>s.split(/[,，\s]+/).filter(Boolean).map(Number);let output;
 if(['tails','group'].includes(f.kind))output={kind:f.kind,values:nums(f.values)};
 else if(f.kind==='arithmetic')output={kind:f.kind,sources:f.sources.split(',').filter(Boolean).map(x=>{const [offset,position]=x.split(':').map(Number);return {offset,position};}),op:f.op,constant:Number(f.constant),cycle:f.cycle==='true'};
 else output={kind:f.kind,lag:Number(f.lag),phase:Number(f.phase),step:Number(f.step),constant:Number(f.constant),cycle:f.cycle==='true'};
 const definition=canonical({game,trigger:{numbers:nums(f.trigger),number:nums(f.trigger)[0],position:Number(f.position),order:f.order},window:{start:Number(f.start),end:Number(f.end),need:Number(f.need)},output});
 await api('create',{name:f.name,definition,company:f.company==='true',...(f.previous?{previous_id:f.previous}:{})});await mount(client,ctx,game,root);
 })();};
 root.querySelectorAll('[data-backtest]').forEach(b=>b.onclick=act(async()=>{await edge({mode:'backtest',id:b.dataset.backtest});await mount(client,ctx,game,root);}));
 root.querySelectorAll('[data-state]').forEach(b=>b.onclick=act(async()=>{await api('status',{id:b.dataset.id,status:b.dataset.state});await mount(client,ctx,game,root);}));
 root.querySelectorAll('[data-discover]').forEach(b=>b.onclick=act(async()=>{const r=await edge({mode:'discover',game,family:b.dataset.discover});await mount(client,ctx,game,root);root.querySelector('[data-message]').textContent=JSON.stringify(r.report);}));
 const tick=root.querySelector('[data-tick]');if(tick)tick.onclick=act(async()=>{await edge({mode:'tick'});await mount(client,ctx,game,root);});
}
window.Lab3Research={mount};window.dispatchEvent(new Event('lab3-research-ready'));
