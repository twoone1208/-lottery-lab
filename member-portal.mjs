import { MEMBER_TERMS } from './member-terms.mjs';
// 主站會員入口：沿用同一個 Supabase client，不另建登入或版路儲存系統。
export function createMemberPortal({client, signIn}) {
  const routes = new Set(['member','member-admin','member-library','member-research','member-company']);
  const host = document.getElementById('page-home').parentElement;
  const sections = new Map();
  let generation = 0;
  const el = (tag,text) => { const n=document.createElement(tag); if(text)n.textContent=text; return n; };
  const check = r => { if(r.error)throw r.error; return r.data; };
  const link = (text,hash) => {const n=el('a',text);n.href=hash;n.className='button quiet';return n;};
  const action = (text,fn,output) => {const b=el('button',text);b.type='button';b.className='button quiet';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){output.textContent=e.message;}finally{b.disabled=false;}};return b;};
  for(const route of routes){const s=el('section');s.id='page-'+route;s.className='page member-portal-page';host.append(s);sections.set(route,s);}
  async function api(action,p={}){return check(await client.rpc('lab3_api',{action,p}));}
  async function render(){
    const route=location.hash.slice(1);if(!routes.has(route))return;
    const run=++generation,s=sections.get(route);s.replaceChildren(link('← 功能首頁','#home'),el('h1',route==='member'?'會員中心':route==='member-admin'?'會員管理':route==='member-library'?'雲端公式庫':route==='member-company'?'公司私有研究':'條件研究'));
    for(const [key,section]of sections)section.classList.toggle('active',key===route);
    const note=el('p','正在讀取會員資料…');note.setAttribute('role','status');s.append(note);
    try{
      const auth=check(await client.auth.getUser());if(run!==generation)return;
      if(!auth.user){note.textContent='請使用 LINE 登入。';s.append(action('LINE 登入',signIn,note));return;}
      const [profile,ctx]=await Promise.all([client.from('profiles').select('display_name,contact_email,tier,vip_expire_at').eq('id',auth.user.id).single().then(check),client.rpc('lab3_company_context').then(check)]);
      if(run!==generation)return;note.textContent='';
      const admin=['super_admin','admin'].includes(ctx.role);
      if(route==='member'){
        const card=el('div');card.className='panel';
        card.append(el('h2',profile.display_name||auth.user.user_metadata?.name||'LINE會員'));
        const vip=profile.tier==='vip'&&(!profile.vip_expire_at||Date.parse(profile.vip_expire_at)>Date.now());
        card.append(el('p','會員等級：'+(vip?'VIP 會員':'一般會員')));
        if(admin||ctx.company_role)card.append(el('p','管理身分：'+({super_admin:'總管理員',admin:'管理員',researcher:'研究員'}[ctx.role]||ctx.company_role)));
        const form=el('form');form.className='portal-contact';const label=el('label','聯絡 Email');
        const input=el('input');input.type='email';input.maxLength=254;input.autocomplete='email';input.value=profile.contact_email||'';label.append(input);
        const msg=el('p');msg.setAttribute('role','status');const save=el('button','儲存 Email');save.type='submit';save.className='button';
        form.append(label,save,msg,el('small','聯絡及未來電子發票使用；登入仍使用 LINE，寄信與發票尚未串接。'));
        form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{check(await client.from('profiles').update({contact_email:input.value.trim().toLowerCase()||null}).eq('id',auth.user.id).select('contact_email').single());msg.textContent='✅ 已儲存';}catch(e){msg.textContent=e.message;}finally{save.disabled=false;}};
        card.append(form);s.append(card);
        const tools=el('div');tools.className='portal-tools';tools.append(link('我的版路','#memory'),link('驗證開獎紀錄','#verification'),link('雲端同步與備份','#member'));
        tools.lastChild.onclick=e=>{e.preventDefault();[...document.querySelectorAll('.member-cloud button')].find(b=>b.textContent==='重新同步')?.focus();note.textContent='請使用頁首「重新同步」；首次合併前會詢問，原本機版路不會被清除。';};
        tools.append(link('雲端公式庫','#member-library'),link('條件研究','#member-research'));
        if(admin)tools.append(link('會員管理','#member-admin'));
        if(ctx.company_role)tools.append(link('公司私有研究','#member-company'));
        s.append(tools,el('p','「我的版路」與「驗證開獎紀錄」沿用主站資料。雲端公式庫為另外正式送入研究庫的版本，不以其數量代表所有已存版路。'));
        const consent=el('details');consent.className='panel';consent.append(el('summary','研究授權設定 · '+(ctx.consented?'已同意':'尚未同意或已撤回')));
        const terms=el('div');terms.innerHTML=MEMBER_TERMS;consent.append(terms);
        const agreement=el('label');const checkbox=el('input');checkbox.type='checkbox';agreement.append(checkbox,document.createTextNode('我已閱讀並同意此版本公告'));consent.append(agreement);
        consent.append(action('同意研究條款',async()=>{if(!checkbox.checked)throw Error('請先主動勾選同意');await api('consent',{agree:true,terms_version:'member-research-2026-11-01-v2'});await render();},note));
        if(ctx.consented)consent.append(action('撤回研究授權',async()=>{await api('consent',{agree:false,terms_version:'member-research-2026-11-01-v2'});await render();},note));
        s.append(consent);return;
      }
      if(route==='member-admin'){
        if(!admin)throw Error('沒有會員管理權限');
        const members=check(await client.rpc('lab3_member_admin_portal',{p:{action:'list'}}));if(run!==generation)return;
        const form=el('form');form.className='panel portal-contact';const label=el('label','選擇會員（LINE 名稱）'),select=el('select');
        for(const m of members){const option=el('option',`${m.name}${m.contact_email?' · '+m.contact_email:''}`);option.value=m.id;select.append(option);}label.append(select);
        const roleLabel=el('label','管理身分'),role=el('select');for(const [value,name]of [['member','一般會員'],['admin','協助管理員'],['researcher','研究員']]){const o=el('option',name);o.value=value;role.append(o);}roleLabel.append(role);
        const enabledLabel=el('label','帳號狀態'),enabled=el('select');for(const [v,name]of [['true','啟用'],['false','停用']]){const o=el('option',name);o.value=v;enabled.append(o);}enabledLabel.append(enabled);
        const save=el('button','儲存會員設定');save.className='button';save.type='submit';
        const current=el('p');function update(){const m=members.find(x=>x.id===select.value);const locked=m.role==='super_admin'||m.id===auth.user.id||ctx.role!=='super_admin';role.value=m.role==='super_admin'?'member':m.role;enabled.value=String(m.enabled);role.disabled=enabled.disabled=save.disabled=locked;current.textContent=m.role==='super_admin'?'總管理員：保留最高權限，不可在此降權或停用。':'';}select.onchange=update;update();
        form.append(label,current,roleLabel,enabledLabel,save);form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{check(await client.rpc('lab3_member_admin_portal',{p:{action:'update',id:select.value,role:role.value,enabled:enabled.value==='true'}}));await render();}catch(e){note.textContent=e.message;save.disabled=false;}};s.append(form);return;
      }
      if(route==='member-company'&&!ctx.company_role)throw Error('沒有公司私有研究權限');
      // 重用原研究工具，僅去除舊網站外框；資料及 RPC 仍由後端驗證。
      const legacy={ 'member-library':'library','member-research':'research','member-company':'company'}[route];
      const frame=el('iframe');frame.title=route==='member-company'?'公司私有研究工具':'雲端公式研究工具';frame.className='portal-research-frame';
      frame.src='./internal-3.html?embed=main#'+legacy;s.append(frame);
    }catch(e){if(run===generation)note.textContent=e.message==='Auth session missing!'?'請先使用頁首 LINE 登入。':e.message;}
  }
  addEventListener('hashchange',render);
  client.auth.onAuthStateChange(()=>setTimeout(render,0));
  render();
  return {refresh:render};
}
