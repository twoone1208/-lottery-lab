// 共用純運算模組：瀏覽器、測試及雲端使用同一份；無eval、無網路、無會員資料。
export const ENGINE='research-2.0.0';
const int=(x,min,max,label)=>{if(!Number.isInteger(x)||x<min||x>max)throw Error(label+'超出範圍');return x;};
const uniq=a=>[...new Set(a)].sort((a,b)=>a-b);
export const wrap=(n,m)=>((n-1)%m+m)%m+1;
export function canonical(input){
 const game=input.game;if(!['539','daily','mark6'].includes(game))throw Error('彩種不正確');
 const max=game==='mark6'?49:39,count=game==='mark6'?6:5;
 const trigger=input.trigger||{},numbers=uniq(trigger.numbers||[]);if(numbers.length>2||numbers.length!==(trigger.numbers||[]).length)throw Error('定位號碼需不同且最多兩顆');numbers.forEach(n=>int(n,1,max,'定位'));
 const position=int(trigger.position??0,0,count,'定位順位');if(position&&!numbers.length)throw Error('定位順位需號碼');
 const order=trigger.order||'sorted';if(!['sorted','draw'].includes(order))throw Error('球序不正確');
 const w=input.window||{},start=int(w.start,1,30,'起期'),end=int(w.end,start,30,'終期'),need=int(w.need??1,1,3,'命中門檻');
 const o=input.output||{};let output;
 if(o.kind==='group'){const values=uniq(o.values||[]);if(!values.length||values.length>3)throw Error('候選組需1至3顆');values.forEach(n=>int(n,1,max,'候選'));if(need>values.length)throw Error('命中門檻超過候選數');output={kind:'group',values};}
 else if(o.kind==='tails'){const values=uniq(o.values||[]);if(!values.length||values.length>3||need!==1)throw Error('尾數需1至3種，命中門檻為1');values.forEach(n=>int(n,0,9,'尾數'));output={kind:'tails',values};}
 else if(o.kind==='arithmetic'){
  const sources=(o.sources||[]).map(s=>({offset:int(s.offset,-30,start-1,'來源偏移'),position:int(s.position,1,count,'來源順位')}));if(sources.length<1||sources.length>3)throw Error('來源需1至3個');
  const op=o.op;if(!['sum','difference','absolute'].includes(op)||need!==1)throw Error('運算不正確');
  const signs=o.signs??sources.map((_,i)=>op==='difference'&&i>0?-1:1);if(signs.length!==sources.length||signs.some(x=>![1,-1].includes(x)))throw Error('來源正負號不正確');
  output={kind:'arithmetic',sources,op,signs,constant:int(o.constant??0,-1000,1000,'常數'),cycle:!!o.cycle};
  // 加法與絕對差交換來源不應製造重複公式。
  if(op==='sum'||op==='absolute'){const pairs=output.sources.map((s,i)=>({s,sign:signs[i]})).sort((a,b)=>a.s.offset-b.s.offset||a.s.position-b.s.position);output.sources=pairs.map(x=>x.s);output.signs=pairs.map(x=>x.sign);}
  if(op==='absolute'&&sources.length!==2)throw Error('絕對差需兩個來源');
 }
 else if(o.kind==='staircase'){if(start!==end||need!==1)throw Error('階梯以單期單碼核驗');output={kind:'staircase',lag:int(o.lag,1,30,'階梯期距'),phase:int(o.phase,0,count-1,'階梯相位'),step:int(o.step,1,count-1,'階梯步長'),constant:int(o.constant,0,max,'固定合數'),cycle:!!o.cycle};}
 else throw Error('未知公式類型');
 const bound=position?int(trigger.number??trigger.numbers[0],1,max,'定位綁定號碼'):null;if(position&&!numbers.includes(bound))throw Error('定位順位綁定號碼需在定位條件內');
 if(output.cycle&&'constant' in output)output.constant=((output.constant%max)+max)%max;
 return {schema:'lab3.research/2',game,trigger:{numbers,position,number:bound,order},window:{start,end,need},output};
}
export const key=d=>JSON.stringify(canonical(d));
export function rowsOf(input){return input.map((r,i)=>({seq:r.seq??i+1,date:r.draw_date||r.date,nums:r.nums,draw:r.draw_nums??r.drawNums??null}));}
function balls(r,order){return r&&(order==='draw'?r.draw:r.nums);}
export function predict(input,raw,anchor,cutoff){
 const d=canonical(input),rows=rowsOf(raw),by=new Map(rows.map(r=>[r.seq,r]));return prepared(d,by,anchor,cutoff);
}
function prepared(d,by,anchor,cutoff){
 const t=d.trigger,o=d.output,m=d.game==='mark6'?49:39,count=d.game==='mark6'?6:5;
 const base=by.get(anchor),ns=balls(base,t.order);if(!ns||anchor>cutoff||!t.numbers.every(n=>ns.includes(n))||(t.position&&ns[t.position-1]!==t.number))return null;
 let candidates=[],sources=[];
 if(o.kind==='group')candidates=o.values;
 if(o.kind==='tails')candidates=Array.from({length:m},(_,i)=>i+1).filter(n=>o.values.includes(n%10));
 if(o.kind==='arithmetic'){
  const values=[];for(const s of o.sources){const seq=anchor+s.offset;if(seq>cutoff||seq>=anchor+d.window.start)return null;const b=balls(by.get(seq),t.order);if(!b)return null;values.push(b[s.position-1]);sources.push({seq,position:s.position,value:b[s.position-1]});}
  let value=o.op==='absolute'?Math.abs(values[0]-values[1]):values.reduce((a,b,i)=>a+b*o.signs[i],0);value+=o.constant;
  candidates=[o.cycle?wrap(value,m):value].filter(n=>n>=1&&n<=m);
 }
 if(o.kind==='staircase'){
  const seq=anchor+d.window.start-o.lag,pos=((seq-1)*o.step+o.phase)%count+1,b=balls(by.get(seq),t.order);if(!b||seq>cutoff||seq>=anchor+d.window.start)return null;
  const value=o.constant-b[pos-1];candidates=[o.cycle?wrap(value,m):value].filter(n=>n>=1&&n<=m);sources=[{seq,position:pos,value:b[pos-1]}];
 }
 if(!candidates.length)return null;
 return {anchor,cutoff,target_start:anchor+d.window.start,target_end:anchor+d.window.end,candidates:uniq(candidates),need:d.window.need,sources,metric:d.window.start!==d.window.end?'window_group':candidates.length===1?'single_number':'same_draw_group'};
}
export function verify(p,raw){
 const rows=rowsOf(raw).filter(r=>r.seq>=p.target_start&&r.seq<=p.target_end);if(rows.length!==p.target_end-p.target_start+1)return null;
 const details=rows.map(r=>({seq:r.seq,date:r.date,opened:r.nums,hits:p.candidates.filter(n=>r.nums.includes(n))}));
 return {hit:details.some(r=>r.hits.length>=p.need),details,metric:p.metric};
}
export function wilson(h,n){if(!n)return 0;const z=1.96,p=h/n;return (p+z*z/(2*n)-z*Math.sqrt((p*(1-p)+z*z/(4*n))/n))/(1+z*z/n);}
export function backtest(d,raw,{end=Infinity,from=1}={}){
 const rows=rowsOf(raw),by=new Map(rows.map(r=>[r.seq,r])),cd=canonical(d),cases=[];for(const r of rows){const a=r.seq;if(a<from)continue;const last=a+cd.window.end;if(last>end)continue;
  const p=prepared(cd,by,a,a+cd.window.start-1);if(!p)continue;const v=verify(p,rows);if(v)cases.push({...p,...v});}
 const hits=cases.filter(r=>r.hit).length;return {samples:cases.length,hits,rate:cases.length?hits/cases.length:null,wilson:wilson(hits,cases.length),metric:cases[0]?.metric||null,cases};
}
// 有界搜尋，逐一回傳進度/繼續游標；不把截斷搜尋稱為所有可能公式。
export function explore(raw,game,options={}){
 const rows=rowsOf(raw),max=game==='mark6'?49:39,count=game==='mark6'?6:5,latest=rows.at(-1)?.seq||0;
 const trainEnd=options.trainEnd??Math.floor(latest*.7),minSamples=options.minSamples??5,minHits=options.minHits??3;
 const offsets=options.offsets||Array.from({length:60},(_,i)=>i-30),lags=options.lags||Array.from({length:30},(_,i)=>i+1),positions=options.positions||Array.from({length:count},(_,i)=>i+1);
 const budget=int(options.budget??3000,1,20000,'搜尋上限'),cursor=int(options.cursor??0,0,100000000,'搜尋游標');let tested=0,index=0,results=[],truncated=false;
 const test=d=>{index++;if(index<=cursor)return true;if(tested>=budget){truncated=true;return false;}tested++;
  const train=backtest(d,rows,{end:trainEnd});if(train.samples<minSamples||train.hits<minHits||train.wilson<(options.minWilson??.05))return true;
  // 只用訓練區篩選；保留段不參與挑公式、常數或排序。
  const holdout=backtest(d,rows,{from:trainEnd+1});results.push({definition:canonical(d),train:{...train,cases:undefined},holdout:{...holdout,cases:undefined},train_end:trainEnd,origin:'bounded-discovery',engine:ENGINE});return true;};
 const def=(lag,output)=>({game,trigger:{numbers:[],position:0,order:'sorted'},window:{start:lag,end:lag,need:1},output});
 const sources=offsets.flatMap(offset=>positions.map(position=>({offset,position})));
 outer:for(const lag of options.family==='staircase'?[]:lags){if(options.family!=='three')for(let i=0;i<sources.length;i++)for(let j=i+1;j<sources.length;j++)for(const op of ['sum','difference','absolute'])for(const cycle of [false,true])for(const signs of op==='difference'?[[1,-1],[-1,1]]:[[1,1]]){
  if(Math.max(sources[i].offset,sources[j].offset)>=lag)continue;
  if(!test(def(lag,{kind:'arithmetic',sources:[sources[i],sources[j]],op,signs,cycle})))break outer;
 }
 // 三來源搜尋獨立游標分區，避免永遠被二來源先佔滿。
 if(options.family==='three'||options.three!==false)for(let i=0;i<sources.length;i++)for(let j=i+1;j<sources.length;j++)for(let k=j+1;k<sources.length;k++)for(const op of ['sum','difference'])for(const signs of op==='difference'?[[1,-1,-1],[1,1,-1],[1,-1,1],[-1,1,1]]:[[1,1,1]]){
  if(Math.max(sources[i].offset,sources[j].offset,sources[k].offset)>=lag)continue;
  if(!test(def(lag,{kind:'arithmetic',sources:[sources[i],sources[j],sources[k]],op,signs,cycle:true})))break outer;
 }}
 if(options.family==='staircase'){
  // 階梯另行搜尋，不受前述算術預算影響；跨批游標仍可重現。
  tested=0;index=0;results=[];truncated=false;
  stair:for(const lag of lags)for(let phase=0;phase<count;phase++)for(let step=1;step<count;step++)for(let constant=0;constant<=max;constant++){
   if(!test(def(lag,{kind:'staircase',lag,phase,step,constant,cycle:true})))break stair;
  }
 }
 results.sort((a,b)=>b.train.wilson-a.train.wilson||key(a.definition).localeCompare(key(b.definition)));
 return {engine:ENGINE,tested,total_enumerated:index,cursor,next_cursor:truncated?cursor+tested:null,truncated,train_end:trainEnd,results:results.slice(0,100),warning:'搜尋範圍內的歷史研究結果，非未來機率；未自動核准'};
}
// 僅單期單碼的歷史指標才可作單碼分數；組/觀察窗只計支持，不借用組命中率。
export function rankEvidence(evidence,target,max=39){
 const map=new Map();for(const e of evidence){if(e.target_start!==target||e.target_end!==target||!e.approved||!e.authorized)continue;
  for(const n of e.candidates||[]){if(n<1||n>max)continue;let r=map.get(n);if(!r)map.set(n,r={number:n,families:new Map(),group_support:[],evidence:[]});
   if(e.metric!=='single_number'){r.group_support.push(e);continue;}if(e.samples<5||e.hits<3)continue;
   const score=wilson(e.hits,e.samples),family=e.family||e.hash;const prior=r.families.get(family);if(!prior||prior.score<score)r.families.set(family,{score,e});}
 }
 return [...map.values()].map(r=>({number:r.number,score:[...r.families.values()].reduce((s,x)=>s+x.score,0),families:r.families.size,group_support:r.group_support.length,evidence:[...r.families.values()].map(x=>x.e)})).filter(r=>r.families).sort((a,b)=>b.score-a.score||a.number-b.number);
}
