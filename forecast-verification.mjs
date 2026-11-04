export function resolveForecastTarget(state,date,next) {
 const {rows,config:{game}}=state;
 if(!rows.length)throw Error('請先同步開獎資料');
 const known=date?rows.findIndex(row=>row.date===date):-1;
 if(known===0)throw Error('沒有目標期之前的資料');
 if(known>0)return {index:known,rows:rows.slice(0,known),dateInfo:{
  date,period:rows[known].period,label:date.replaceAll('-','/'),baseLabel:rows[known-1].date,quality:'已開獎 · 事後研究'
 }};
 if(date&&date<=rows.at(-1).date)throw Error('指定日期沒有對應開獎期');
 for(let offset=1;offset<=30;offset++){
  const info=next(rows,game,offset);
  if(!info.date||date&&date!==info.date)continue;
  const last=rows.at(-1);
  const period=/^\d{9}$/.test(last.period||'')&&info.date.slice(0,4)===last.date.slice(0,4)?String(Number(last.period)+offset):null;
  return {index:rows.length+offset-1,rows,dateInfo:{...info,period}};
 }
 throw Error('日期不在目前可判定的開獎日程');
}

const key='lotto-manual-forecasts-v1';
const copy=value=>JSON.parse(JSON.stringify(value));

export function createForecastStore(storage,{owner='local-device',clock=()=>new Date().toISOString(),uuid=()=>crypto.randomUUID()}={}){
 const read=()=>JSON.parse(storage.getItem(key)||'{"records":[],"checks":{}}');
 const write=db=>storage.setItem(key,JSON.stringify(db));
 return {
  save(input,draws){
   const {game,date,period,method,numbers,need=1,cutoffDate}=input;
   const max=game==='mark6'?49:39;
   if(!['539','daily','mark6'].includes(game)||!method||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!cutoffDate||cutoffDate>=date||
    !Array.isArray(numbers)||!numbers.length||new Set(numbers).size!==numbers.length||numbers.some(n=>!Number.isInteger(n)||n<1||n>max)||
    !Number.isInteger(need)||need<1||need>numbers.length)throw Error('預測格式、門檻或資料截止期不正確');
   const db=read(),savedAt=clock();
   const record={...copy(input),id:uuid(),owner,need,count:numbers.length,savedAt,
    retrospective:input.retrospective===true||draws.some(r=>r.date===date&&!r.missing)};
   db.records.push(record);
   write(db);
   return copy(record);
  },
  reconcile(game,draws){
   const db=read();
   let changed=false;
   for(const record of db.records){
    if(record.owner!==owner||record.game!==game)continue;
    const draw=draws.find(r=>!r.missing&&r.date===record.date&&(!record.period||record.period===r.period));
    if(!draw?.nums?.length)continue;
    const opened=[...draw.nums].sort((a,b)=>a-b);
    const hits=record.numbers.filter(n=>opened.includes(n));
    const revisions=db.checks[record.id]||[];
    if(JSON.stringify(revisions.at(-1)?.opened)===JSON.stringify(opened))continue;
    revisions.push({opened,hits,count:hits.length,success:hits.length>=record.need,verifiedAt:clock()});
    db.checks[record.id]=revisions;
    changed=true;
   }
   if(changed)write(db);
  },
  list(){
   const db=read();
   return db.records.filter(r=>r.owner===owner).map(r=>({...r,verification:db.checks[r.id]?.at(-1)||null}));
  }
 };
}

export function compareForecasts(records){
 const groups=new Map();
 for(const record of records){
  if(record.retrospective)continue;
  const key=JSON.stringify([record.game,record.method,record.count,record.need]);
  const item=groups.get(key)||{game:record.game,method:record.method,count:record.count,need:record.need,total:0,verified:0,won:0,missed:0,sum:0,distribution:{}};
  item.total++;
  const check=record.verification;
  if(check){
   item.verified++;item.won+=Number(check.success);item.missed+=Number(!check.success);item.sum+=check.count;
   item.distribution[check.count]=(item.distribution[check.count]||0)+1;
  }
  groups.set(key,item);
 }
 return [...groups.values()].map(g=>({...g,rate:g.verified?g.won/g.verified:null,average:g.verified?g.sum/g.verified:null}));
}
