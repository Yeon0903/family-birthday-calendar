(()=>{'use strict';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cfg=window.FAMILY_CONFIG||{};
const ready=!!(cfg.apiKey&&cfg.projectId&&cfg.authDomain&&window.firebase);
let auth=null,db=null;
if(ready){firebase.initializeApp({apiKey:cfg.apiKey,authDomain:cfg.authDomain,projectId:cfg.projectId,appId:cfg.appId});auth=firebase.auth();db=firebase.firestore();auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(console.error);}
const expectedRoleUids={superadmin:'birthday-superadmin',admin:'birthday-admin',viewer:'birthday-viewer'};
let authFrame=null;
let sessionTimer=null;
let sessionChecking=false;
const SESSION_CHECK_MS=15000;

const now=new Date(), today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
const state={user:null,role:'viewer',records:[],page:'calendar',year:today.getFullYear(),month:today.getMonth(),selected:today.getDate(),datePicker:null,yearGridStart:Math.floor(today.getFullYear()/10)*10,lunar:{},form:null,modal:false,msg:'',edit:null,users:[]};
const sample=[{id:'s1',name:'김하늘',birth_year:1975,birth_month:10,birth_day:20,calendar_type:'solar',is_leap:false},{id:'s2',name:'박서연',birth_year:1955,birth_month:9,birth_day:15,calendar_type:'lunar',is_leap:false},{id:'s3',name:'이준호',birth_year:2001,birth_month:11,birth_day:3,calendar_type:'solar',is_leap:false}];
const admin=()=>['admin','superadmin'].includes(state.role),superadmin=()=>state.role==='superadmin';
function parseDate(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const lunarYearCache=new Map();
let lunarFormatter=null;
try{lunarFormatter=new Intl.DateTimeFormat('ko-KR-u-ca-dangi',{month:'numeric',day:'numeric',year:'numeric',timeZone:'Asia/Seoul'});if(lunarFormatter.resolvedOptions().calendar!=='dangi')lunarFormatter=null}catch(e){lunarFormatter=null}
function lunarDatesInYear(year){
 if(lunarYearCache.has(year))return lunarYearCache.get(year);
 const dates=new Map();
 if(lunarFormatter){
  const count=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/864e5;
  for(let n=0;n<count;n++){
   const dt=new Date(Date.UTC(year,0,n+1,3));
   const parts=lunarFormatter.formatToParts(dt);
   const m=parts.find(p=>p.type==='month')?.value||'';
   const day=Number(parts.find(p=>p.type==='day')?.value);
   const month=Number((m.match(/\d+/)||[])[0]);
   if(!month||!day)continue;
   const leap=/윤|bis|leap/i.test(m)?1:0;
   const key=`${month}-${day}-${leap}`;
   if(!dates.has(key))dates.set(key,[]);
   dates.get(key).push(dt.toISOString().slice(0,10));
  }
 }else{
  const old=state.lunar[String(year)]||{};
  for(const [key,value] of Object.entries(old)){
   const match=key.match(/^(\d+)-(\d+)-([01])$/);
   if(match)dates.set(`${Number(match[1])}-${Number(match[2])}-${match[3]}`,[`${year}-${value}`]);
  }
 }
 lunarYearCache.set(year,dates);return dates;
}
function occurrences(r,year){
 const m=Number(r.birth_month),d=Number(r.birth_day);
 if(r.calendar_type==='solar'){
  const dt=new Date(year,m-1,d);
  return dt.getFullYear()===year&&dt.getMonth()===m-1&&dt.getDate()===d?[`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`]:[];
 }
 const dates=lunarDatesInYear(year), found=dates.get(`${m}-${d}-${r.is_leap?1:0}`)||[];
 return found.length?found:(r.is_leap?(dates.get(`${m}-${d}-0`)||[]):[]);
}
function nextEvent(r){for(let y=today.getFullYear();y<=today.getFullYear()+3;y++)for(const iso of occurrences(r,y)){const date=parseDate(iso);if(date>=today)return {date,iso,days:Math.round((date-today)/864e5)}}return null}
const fmt=date=>date?`${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`:'날짜 확인 필요';
const md=r=>`${String(r.birth_month).padStart(2,'0')}.${String(r.birth_day).padStart(2,'0')}`;
function itemLabel(r){return `${r.calendar_type==='solar'?'양력':'음력'} ${md(r)}${r.is_leap?' (윤달)':''}`}
function upcoming(){return state.records.map(r=>({...r,next:nextEvent(r)})).filter(r=>r.next).sort((a,b)=>a.next.days-b.next.days)}
function header(title,subtitle=''){return `<header><div><h1>${title}</h1><p>${subtitle}</p></div><div class="topactions">${admin()?'<button class="iconbtn" data-act="add">＋ 등록</button>':''}<button class="iconbtn" data-act="logout" title="로그아웃">↪</button></div></header>`}
function upHTML(){let a=upcoming().filter(r=>r.next.days>=0 && r.next.days<=30).slice(0,3);return `<section class="card highlight"><h2 class="sectiontitle">🎁 다가오는 생일</h2><div class="upcoming">${a.length?a.map(r=>`<div class="uprow"><div class="avatar">🎂</div><div class="info"><div class="name">${esc(r.name)}</div><div class="sub">${fmt(r.next.date)} · ${itemLabel(r)}</div></div><div class="dday">${r.next.days===0?'D-DAY':`D-${r.next.days}`}</div></div>`).join(''):'<div class="empty">30일 이내 다가오는 생일이 없어요.</div>'}</div></section>`}
function datesForMonth(){const year=state.year,month=state.month;return state.records.flatMap(r=>occurrences(r,year).map(iso=>({r,iso}))).filter(a=>+a.iso.slice(5,7)===month+1)}
function datePickerHTML(){
  if(!state.datePicker)return '';
  const y=state.year, decade=state.yearGridStart;
  const years=Array.from({length:12},(_,i)=>decade-1+i).map(n=>`<button type="button" data-act="pickyear" data-year="${n}" style="border:0;border-radius:12px;padding:12px 4px;cursor:pointer;background:${n===y?'#da5b83':'transparent'};color:${n===y?'white':'inherit'};font-weight:${n===y?'700':'400'}">${n}</button>`).join('');
  const months=Array.from({length:12},(_,i)=>`<button type="button" data-act="pickmonth" data-month="${i}" style="border:0;border-radius:12px;padding:14px 4px;cursor:pointer;background:${i===state.month?'#da5b83':'transparent'};color:${i===state.month?'white':'inherit'};font-weight:${i===state.month?'700':'400'}">${i+1}월</button>`).join('');
  return `<div class="date-picker-shade" style="position:fixed;inset:0;z-index:1500;background:rgba(20,14,20,.36);display:flex;align-items:center;justify-content:center;padding:20px" data-act="closepicker"><div role="dialog" aria-modal="true" aria-label="달력 날짜 선택" style="width:min(100%,390px);background:#fff;color:#29242c;border-radius:22px;box-shadow:0 16px 40px rgba(0,0,0,.2);padding:20px" data-date-picker-dialog="true"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:18px">${state.datePicker==='years'?'<span style="font-size:16px;font-weight:750">연도 선택</span>':`<button type="button" data-act="showyears" style="border:0;background:transparent;color:inherit;font-size:20px;font-weight:750;cursor:pointer">${y}년 ▾</button>`}<button type="button" data-act="resetcalendar" title="현재 날짜로 돌아가기" style="border:1px solid #eadde3;background:white;color:#59505b;border-radius:10px;padding:7px 10px;cursor:pointer">↺ 초기화</button><button type="button" data-act="closepicker" aria-label="닫기" style="border:1px solid #eadde3;background:white;color:#59505b;border-radius:10px;padding:7px 12px;cursor:pointer">✕</button></div>${state.datePicker==='years'?`<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px"><button type="button" data-act="decadeprev" style="border:0;background:#f9eef2;padding:8px 14px;border-radius:10px;cursor:pointer">‹ 이전 10년</button><button type="button" data-act="decadenext" style="border:0;background:#f9eef2;padding:8px 14px;border-radius:10px;cursor:pointer">다음 10년 ›</button></div><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px">${years}</div>`:`<div style="font-size:13px;color:#8b7180;margin-bottom:10px">월을 선택하면 해당 달력으로 이동해요.</div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">${months}</div>`}</div></div>`;
}
function calHTML(){const first=new Date(state.year,state.month,1).getDay(),count=new Date(state.year,state.month+1,0).getDate(),occ=datesForMonth();let cells=['일','월','화','수','목','금','토'].map(d=>`<div class="weekday">${d}</div>`).join('');for(let i=0;i<first;i++)cells+='<div></div>';for(let n=1;n<=count;n++){let on=occ.filter(v=>+v.iso.slice(8)===n),thisday=state.year===today.getFullYear()&&state.month===today.getMonth()&&n===today.getDate();cells+=`<button class="day ${thisday?'today':''} ${n===state.selected?'selected':''} ${on.length>2?'more':''}" data-act="day" data-day="${n}"><span class="num">${n}</span>${on.slice(0,2).map(({r})=>`<span class="event ${r.calendar_type==='lunar'?'lunar':''}"><small>${r.calendar_type==='solar'?'양력':'음력'} ${md(r)}</small><b>${esc(r.name)} 생일</b></span>`).join('')}</button>`}
const chosen=occ.filter(v=>+v.iso.slice(8)===state.selected);return `${header('우리 가족 생일 달력 🎂','소중한 날을 함께 기억해요')}${upHTML()}<div style="display:flex;justify-content:flex-end;margin:0 0 8px"><button type="button" data-act="resetcalendar" title="현재 날짜로 돌아가기" style="background:white;border:1px solid #eadde3;border-radius:10px;padding:8px 13px;color:#5b4b55;cursor:pointer;font-weight:650">↺ 초기화</button></div><div class="months"><button class="iconbtn" data-act="prev">‹</button><button type="button" data-act="openpicker" title="연도와 월 선택" aria-label="연도와 월 선택" style="border:1px solid #eadde3;background:#fff;border-radius:12px;padding:9px 13px;font-size:16px;font-weight:700;color:inherit;cursor:pointer">${state.year}년 ${state.month+1}월 ▾</button><button class="iconbtn" data-act="next">›</button></div><div class="calendarwrap"><div class="calendar">${cells}</div></div><div class="card selectedbox"><div class="sectiontitle">${state.month+1}월 ${state.selected}일</div>${chosen.length?chosen.map(({r})=>`<div style="margin-top:10px">🎂 <b>${esc(r.name)}</b> 생일 · ${itemLabel(r)}</div>`).join(''):'<div class="small">등록된 생일이 없습니다.</div>'}</div>${datePickerHTML()}`}
function listHTML(){let sort=state.sort||'upcoming',recs=state.records.map(r=>({...r,next:nextEvent(r)}));recs.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'ko'):(a.next?.days??999999)-(b.next?.days??999999));return `${header('가족 생일 목록 🎂','등록된 생일을 한눈에 확인하세요')}<div class="listcontrols"><strong>총 ${recs.length}명</strong><select id="sort"><option value="upcoming" ${sort==='upcoming'?'selected':''}>다가오는 순</option><option value="name" ${sort==='name'?'selected':''}>이름순</option></select></div><div class="listrows">${recs.length?recs.map(r=>`<div class="listrow"><div class="avatar">🎂</div><div class="info"><div class="name">${esc(r.name)}</div><div class="sub">${itemLabel(r)}${r.birth_year?` · ${r.birth_year}년생`:""}</div><div class="sub">다음 생일: ${r.next?fmt(r.next.date):'날짜 확인 필요'}</div></div><div class="actions"><div class="dday">${r.next?(r.next.days===0?'D-DAY':`D-${r.next.days}`):'—'}</div>${admin()?`<button data-act="edit" data-id="${esc(r.id)}">수정</button>`:''}</div></div>`).join(''):'<div class="empty">아직 등록된 생일이 없습니다.</div>'}</div>`}
function settingsHTML(){return `${header('가족 달력 설정','우리 가족의 소중한 생일을 관리해요')}${admin()?`<section class="card"><h2 class="sectiontitle">🎂 생일 관리</h2><p class="small">생일을 등록하거나 목록에서 수정할 수 있어요.</p><button class="primary full" data-act="add">생일 등록</button></section>`:''}${superadmin()?`<section class="card" style="margin-top:14px"><h2 class="sectiontitle">🔐 역할별 비밀번호 변경</h2><p class="small">최고관리자 비밀번호를 다시 입력해서 변경할 수 있어요.</p>${cfg.appsScriptUrl?`<div class="authframe"><iframe title="비밀번호 관리" sandbox="allow-scripts allow-forms allow-same-origin allow-popups" src="${esc(cfg.appsScriptUrl)}?mode=change"></iframe></div>`:'<div class="notice">인증 서버 URL을 먼저 설정해 주세요.</div>'}</section>`:''}<section class="card" style="margin-top:14px"><h2 class="sectiontitle">현재 권한</h2><p>${state.role==='superadmin'?'👑 최고관리자':state.role==='admin'?'🛡️ 관리자':'👀 일반 사용자'}</p><button class="secondary full" data-act="logout">로그아웃</button></section>`}
function navHTML(){return `<nav class="bottomnav"><button data-act="page" data-page="calendar" class="${state.page==='calendar'?'active':''}">▦<br>달력</button><button data-act="page" data-page="list" class="${state.page==='list'?'active':''}">☷<br>생일 목록</button><button data-act="page" data-page="settings" class="${state.page==='settings'?'active':''}">⚙<br>설정</button></nav>`}
function loginHTML(){return `<section class="card login"><div class="hero">🎂</div><h1>우리 가족 생일 달력</h1><div class="caption">소중한 날을 함께 기억해요</div>${!ready?'<div class="notice">Firebase config.js 설정을 확인해 주세요.</div>':!cfg.appsScriptUrl?'<div class="notice">Apps Script 웹 앱 주소를 config.js에 입력해야 로그인할 수 있어요.</div>':`<div class="authframe" id="loginframe"><iframe title="비밀번호로 로그인" sandbox="allow-scripts allow-forms allow-same-origin allow-popups" src="${esc(cfg.appsScriptUrl)}?mode=login"></iframe></div>`}<div class="msg">${esc(state.msg)}</div></section>`}
function modalHTML(){const r=state.edit||{},mo=Number(r.birth_month)||1,dy=Number(r.birth_day)||1,tp=r.calendar_type||'solar';const months=Array.from({length:12},(_,i)=>{const v=i+1;return `<option value="${v}" ${mo===v?'selected':''}>${v}월</option>`}).join('');const days=Array.from({length:31},(_,i)=>{const v=i+1;return `<option value="${v}" ${dy===v?'selected':''}>${v}일</option>`}).join('');return `<div class="modalshade"><div class="modal"><div class="modalhead"><h2>${r.id?'생일 수정':'생일 등록'} 🎂</h2><button class="iconbtn" data-act="closemodal">✕</button></div><form id="birthform"><div class="formgroup"><label>이름</label><input name="name" required maxlength="50" value="${esc(r.name||'')}" placeholder="가족 이름"></div><div class="formgroup"><label>생일</label><div class="formgrid" style="grid-template-columns:repeat(2,minmax(0,1fr))"><select name="month" aria-label="생일 월" required>${months}</select><select name="day" aria-label="생일 일" required>${days}</select></div></div><div class="formgroup"><label>생일 종류</label><select name="type" id="birthtype"><option value="solar" ${tp==='solar'?'selected':''}>양력</option><option value="lunar" ${tp==='lunar'?'selected':''}>음력</option></select></div><div class="formgroup" id="leapwrap" style="${tp==='solar'?'display:none':''}"><label><input type="checkbox" name="leap" ${r.is_leap?'checked':''} style="width:auto;min-height:auto"> 윤달 생일</label></div><button type="submit" class="primary full">${r.id?'변경사항 저장':'생일 등록'}</button>${r.id?'<button type="button" class="secondary danger full" style="margin-top:10px" data-act="delete">생일 삭제</button>':''}</form><div class="msg">${esc(state.msg)}</div></div></div>`}
function render(){
  const root=$('#app');if(!root)return;
  if(!state.user){
    root.innerHTML=loginHTML();
    // 로그인 iframe은 렌더링마다 새로 만들어지므로 참조도 다시 잡습니다.
    authFrame=root.querySelector('#loginframe iframe');
    return;
  }
  authFrame=null;
  root.innerHTML=(state.page==='calendar'?calHTML():state.page==='list'?listHTML():settingsHTML())+navHTML()+(state.modal?modalHTML():'');
}
function message(s){state.msg=s;render()}
async function reload(){if(!db||!state.user)return;try{const snapshot=await db.collection('birthdays').get({source:'server'});state.records=snapshot.docs.map(d=>({id:d.id,...d.data()}));state.records.sort((a,b)=>a.name.localeCompare(b.name,'ko'));state.msg='';render()}catch(err){if(err.code==='permission-denied'){await signout();state.msg='접근 권한이 만료됐어요. 다시 로그인해 주세요.';render();}else message('생일 목록을 불러오지 못했어요: '+err.message)}}
async function afterLogin(){if(!auth.currentUser){state.user=null;render();return;}const uid=auth.currentUser.uid;const entry=Object.entries(expectedRoleUids).find(([role,id])=>id===uid);if(!entry){await auth.signOut();state.user=null;message('허용되지 않은 로그인 계정입니다.');return;}state.user=auth.currentUser;state.role=entry[0];state.page='calendar';state.msg='';await reload();startSessionWatch_()}
async function signout(){
  stopSessionWatch_();
  if(auth)await auth.signOut();
  state.user=null;state.records=[];state.msg='';render();
}
function stopSessionWatch_(){if(sessionTimer){clearInterval(sessionTimer);sessionTimer=null;}}
function startSessionWatch_(){
  stopSessionWatch_();
  sessionTimer=setInterval(checkSession_,SESSION_CHECK_MS);
}
async function checkSession_(){
  if(sessionChecking||!state.user||!auth?.currentUser||!db)return;
  if(document.visibilityState==='hidden')return;
  sessionChecking=true;
  try{
    // 서버 강제 조회로 authVersions 변경 이후 권한 거부 여부를 검증합니다.
    await db.collection('birthdays').limit(1).get({source:'server'});
  }catch(err){
    if(err.code==='permission-denied'){
      await signout();
      state.msg='비밀번호 변경 또는 권한 만료로 로그아웃됐어요.';
      render();
    }else{
      // 오프라인·일시적 서버 오류는 강제 로그아웃하지 않습니다.
      console.warn('세션 검증 일시 실패:',err.code||err.message);
    }
  }finally{sessionChecking=false;}
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')checkSession_();
});

async function acceptBridgeMessage(event) {
  if (!auth || !cfg.appsScriptUrl) return;

  // Apps Script HTML Service는 로그인 화면을 내부 iframe에서 실행할 수 있어
  // event.source가 바깥쪽 authFrame.contentWindow와 같지 않을 수 있습니다.
  // 따라서 창 객체 동일성 검사는 하지 않고, 발신 출처 및 메시지 형식을 확인합니다.
  if (!authFrame || !authFrame.isConnected) return;

  // Google Apps Script에서 전달한 메시지만 허용
  const allowedOrigin =
    event.origin === 'https://script.google.com' ||
    /^https:\/\/[a-zA-Z0-9-]+\.googleusercontent\.com$/.test(event.origin);

  if (!allowedOrigin) return;

  const data = event.data;

  if (
    !data ||
    data.app !== 'family-birthday-v2' ||
    data.type !== 'login' ||
    (typeof data.token !== 'string' || data.token.length > 8192)
  ) {
    return;
  }

  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    await auth.signInWithCustomToken(data.token);
    await afterLogin();
  } catch (err) {
    message('로그인 연결 실패: ' + err.message);
  }
}

window.addEventListener('message', acceptBridgeMessage);
function rangeMove(step){let d=new Date(state.year,state.month+step,1);state.year=d.getFullYear();state.month=d.getMonth();state.selected=1;render()}
async function saveBirthday(e){e.preventDefault();if(!admin()||!db)return;const f=new FormData(e.target),name=String(f.get('name')).trim(),month=Number(f.get('month')),day=Number(f.get('day')),type=String(f.get('type')),leap=!!f.get('leap');if(!name||!Number.isInteger(month)||month<1||month>12||!Number.isInteger(day)||day<1||day>31){message('이름과 생일을 확인해 주세요.');return;}if(type==='solar'){const d=new Date(2000,month-1,day);if(d.getMonth()!==month-1||d.getDate()!==day){message('존재하지 않는 양력 날짜입니다.');return;}}else if(type!=='lunar'||day>30){message('음력 날짜를 확인해 주세요.');return;}const obj={name,birth_month:month,birth_day:day,calendar_type:type,is_leap:type==='lunar'&&leap};try{if(state.edit?.id)await db.collection('birthdays').doc(state.edit.id).update(obj);else await db.collection('birthdays').add(obj);state.modal=false;state.edit=null;state.msg='';await reload()}catch(err){message('저장 실패: '+err.message)}}
async function removeBirthday(){if(!admin()||!state.edit?.id||!confirm('이 생일을 삭제할까요?'))return;try{await db.collection('birthdays').doc(state.edit.id).delete();state.modal=false;state.edit=null;await reload()}catch(err){message('삭제 실패: '+err.message)}}
function handleClick(e){const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;if(a==='resetcalendar'){const now=new Date();state.year=now.getFullYear();state.month=now.getMonth();state.selected=now.getDate();state.datePicker=null;state.yearGridStart=Math.floor(state.year/10)*10;state.page='calendar';render()}else if(a==='openpicker'){state.datePicker='months';state.yearGridStart=Math.floor(state.year/10)*10;render()}else if(a==='closepicker'){if(b.classList.contains('date-picker-shade')&&e.target!==b)return;state.datePicker=null;render()}else if(a==='showyears'){state.datePicker='years';render()}else if(a==='decadeprev'){state.yearGridStart-=10;render()}else if(a==='decadenext'){state.yearGridStart+=10;render()}else if(a==='pickyear'){state.year=Number(b.dataset.year);state.datePicker='months';render()}else if(a==='pickmonth'){state.month=Number(b.dataset.month);state.selected=1;state.datePicker=null;render()}else if(a==='page'){state.page=b.dataset.page;state.msg='';render()}else if(a==='prev')rangeMove(-1);else if(a==='next')rangeMove(1);else if(a==='day'){state.selected=+b.dataset.day;render()}else if(a==='add'){state.edit=null;state.modal=true;state.msg='';render()}else if(a==='edit'){state.edit=state.records.find(r=>String(r.id)===b.dataset.id);state.modal=true;state.msg='';render()}else if(a==='closemodal'){state.modal=false;state.msg='';render()}else if(a==='logout')signout();else if(a==='delete')removeBirthday(); }
async function init(){if(!lunarFormatter){try{const res=await fetch('lunar-map.json');if(res.ok)state.lunar=await res.json()}catch(err){console.warn('음력 변환 대체표를 읽지 못했습니다.',err)}}
  if(auth){
    auth.onAuthStateChanged(async user=>{
      if(user){
        if(!state.user || state.user.uid!==user.uid)await afterLogin();
      }else{
        stopSessionWatch_();state.user=null;state.records=[];render();
      }
    });
  }
  render();
}
document.addEventListener('click',handleClick);document.addEventListener('submit',e=>{if(e.target.id==='birthform')saveBirthday(e)});document.addEventListener('change',e=>{if(e.target.id==='sort'){state.sort=e.target.value;render()}else if(e.target.id==='birthtype'){$('#leapwrap').style.display=e.target.value==='lunar'?'':'none'}});init();
})();