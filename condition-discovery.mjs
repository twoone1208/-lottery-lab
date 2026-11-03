// 非數學規律的有界、自動探索。訓練篩選、保留段評估分開；無硬編碼特定號碼。
export function exploreConditions(raw,game,options,core){
 const {rowsOf,backtest,canonical,key,ENGINE}=core,rows=rowsOf(raw),max=game==='mark6'?49:39,count=game==='mark6'?6:5;
 const trainEnd=options.trainEnd??Math.floor((rows.at(-1)?.seq||0)*.7),budget=options.budget??100,cursor=options.cursor??0;
 if(!Number.isInteger(budget)||budget<1||budget>20000||!Number.isInteger(cursor)||cursor<0||cursor>100000000)throw Error('搜尋預算或游標不正確');
 const nums=options.numbers||Array.from({length:max},(_,i)=>i+1),positions=options.positions||Array.from({length:count+1},(_,i)=>i),lags=options.lags||Array.from({length:30},(_,i)=>i+1);
 const triggers=[];for(const a of nums){for(const position of positions)triggers.push({numbers:[a],position,number:position?a:null,order:'sorted'});}
 for(let i=0;i<nums.length;i++)for(let j=i+1;j<nums.length;j++)triggers.push({numbers:[nums[i],nums[j]],position:0,number:null,order:'sorted'});
 const outputs=[];for(const n of nums)outputs.push({kind:'group',values:[n]});for(let a=0;a<10;a++){outputs.push({kind:'tails',values:[a]});for(let b=a+1;b<10;b++)outputs.push({kind:'tails',values:[a,b]});}
 const windows=lags.flatMap(start=>start<30?[{start,end:start,need:1},{start,end:start+1,need:1}]:[{start,end:start,need:1}]);
 // 每個雙開條件另測「原雙號二中一」；直接以整數索引跳到游標，避免反覆重走舊範圍。
 const width=outputs.length+1,total=triggers.length*windows.length*width,results=[];let tested=0,i=cursor;
 for(;i<total&&tested<budget;i++){
  const ti=Math.floor(i/(windows.length*width)),wi=Math.floor(i/width)%windows.length,oi=i%width,t=triggers[ti];
  const output=oi<outputs.length?outputs[oi]:{kind:'group',values:t.numbers};
  if(oi===outputs.length&&t.numbers.length!==2)continue;
  const definition=canonical({game,trigger:t,window:windows[wi],output});tested++;
  const train=backtest(definition,rows,{end:trainEnd});if(train.samples<(options.minSamples??5)||train.hits<(options.minHits??3)||train.wilson<(options.minWilson??.05))continue;
  const compact=x=>({samples:x.samples,hits:x.hits,rate:x.rate,wilson:x.wilson,metric:x.metric});
  results.push({definition,train:compact(train),holdout:compact(backtest(definition,rows,{from:trainEnd+1})),train_end:trainEnd,origin:'conditional-bounded-discovery',engine:ENGINE});
 }
 results.sort((a,b)=>b.train.wilson-a.train.wilson||key(a.definition).localeCompare(key(b.definition)));
 return {engine:ENGINE,tested,total_enumerated:total,cursor,next_cursor:i<total?i:null,truncated:i<total,train_end:trainEnd,results:results.slice(0,100),warning:'有界條件研究；保留段不參與選擇；非未來機率'};
}
