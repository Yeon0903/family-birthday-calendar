(()=>{'use strict';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cfg=window.FAMILY_CONFIG||{};
const ready=!!(cfg.apiKey&&cfg.projectId&&cfg.authDomain&&window.firebase);
let auth=null,db=null;
if(ready){firebase.initializeApp({apiKey:cfg.apiKey,authDomain:cfg.authDomain,projectId:cfg.projectId,appId:cfg.appId});auth=firebase.auth();db=firebase.firestore();auth.setPersistence(firebase.auth.Auth.Persistence.NONE).catch(console.error);}
const expectedRoleUids={superadmin:'birthday-superadmin',admin:'birthday-admin',viewer:'birthday-viewer'};
let authFrame=null;

const now=new Date(), today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
const state={user:null,role:'viewer',records:[],page:'calendar',year:today.getFullYear(),month:today.getMonth(),selected:today.getDate(),lunar:{},form:null,modal:false,msg:'',edit:null,users:[]};
const sample=[{id:'s1',name:'김하늘',birth_year:1975,birth_month:10,birth_day:20,calendar_type:'solar',is_leap:false},{id:'s2',name:'박서연',birth_year:1955,birth_month:9,birth_day:15,calendar_type:'lunar',is_leap:false},{id:'s3',name:'이준호',birth_year:2001,birth_month:11,birth_day:3,calendar_type:'solar',is_leap:false}];
const admin=()=>['admin','superadmin'].includes(state.role),superadmin=()=>state.role==='superadmin';
function parseDate(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
function lunarDate(r,y){const map=state.lunar[String(y)];if(!map)return null;const val=map[`${String(r.birth_month).padStart(2,'0')}-${String(r.birth_day).padStart(2,'0')}-${r.is_leap?1:0}`];if(val)return `${y}-${val}`;if(r.is_leap){const alt=map[`${String(r.birth_month).padStart(2,'0')}-${String(r.birth_day).padStart(2,'0')}-0`];return alt?`${y}-${alt}`:null;}return null}
function occurrences(r,y){if(r.calendar_type==='solar'){const dt=new Date(y,r.birth_month-1,r.birth_day);return dt.getMonth()===r.birth_month-1?`${y}-${String(r.birth_month).padStart(2,'0')}-${String(r.birth_day).padStart(2,'0')}`:null}return lunarDate(r,y)}
function nextEvent(r){for(let y=today.getFullYear();y<=Math.min(2050,today.getFullYear()+3);y++){let iso=occurrences(r,y);if(!iso)continue;const date=parseDate(iso);if(date>=today)return {date,iso,days:Math.round((date-today)/864e5)};}return null}
const fmt=date=>date?`${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`:'변환 범위 밖';
const md=r=>`${String(r.birth_month).padStart(2,'0')}.${String(r.birth_day).padStart(2,'0')}`;
function itemLabel(r){return `${r.calendar_type==='solar'?'양력':'음력'} ${md(r)}${r.is_leap?' (윤달)':''}`}
function upcoming(){return state.records.map(r=>({...r,next:nextEvent(r)})).filter(r=>r.next).sort((a,b)=>a.next.days-b.next.days)}
function header(title,subtitle=''){return `<header><div><h1>${title}</h1><p>${subtitle}</p></div><div class="topactions">${admin()?'<button class="iconbtn" data-act="add">＋ 등록</button>':''}<button class="iconbtn" data-act="logout" title="로그아웃">↪</button></div></header>`}
function upHTML(){let a=upcoming().slice(0,3);return `<section class="card highlight"><h2 class="sectiontitle">🎁 다가오는 생일</h2><div class="upcoming">${a.length?a.map(r=>`<div class="uprow"><div class="avatar">🎂</div><div class="info"><div class="name">${esc(r.name)}</div><div class="sub">${fmt(r.next.date)} · ${itemLabel(r)}</div></div><div class="dday">${r.next.days===0?'D-DAY':`D-${r.next.days}`}</div></div>`).join(''):'<div class="empty">등록된 생일이 없습니다.</div>'}</div></section>`}
function datesForMonth(){const year=state.year,month=state.month;return state.records.map(r=>({r,iso:occurrences(r,year)})).filter(a=>a.iso && +a.iso.slice(5,7)===month+1)}
function calHTML(){const first=new Date(state.year,state.month,1).getDay(),count=new Date(state.year,state.month+1,0).getDate(),occ=datesForMonth();let cells=['일','월','화','수','목','금','토'].map(d=>`<div class="weekday">${d}</div>`).join('');for(let i=0;i<first;i++)cells+='<div></div>';for(let n=1;n<=count;n++){let on=occ.filter(v=>+v.iso.slice(8)===n),thisday=state.year===today.getFullYear()&&state.month===today.getMonth()&&n===today.getDate();cells+=`<button class="day ${thisday?'today':''} ${n===state.selected?'selected':''} ${on.length>2?'more':''}" data-act="day" data-day="${n}"><span class="num">${n}</span>${on.slice(0,2).map(({r})=>`<span class="event ${r.calendar_type==='lunar'?'lunar':''}"><small>${r.calendar_type==='solar'?'양력':'음력'} ${md(r)}</small><b>${esc(r.name)} 생일</b></span>`).join('')}</button>`}
const chosen=occ.filter(v=>+v.iso.slice(8)===state.selected);return `${header('우리 가족 생일 달력 🎂','소중한 날을 함께 기억해요')}${upHTML()}<div class="months"><button class="iconbtn" data-act="prev">‹</button><strong>${state.year}년 ${state.month+1}월</strong><button class="iconbtn" data-act="next">›</button></div><div class="calendarwrap"><div class="calendar">${cells}</div></div><div class="card selectedbox"><div class="sectiontitle">${state.month+1}월 ${state.selected}일</div>${chosen.length?chosen.map(({r})=>`<div style="margin-top:10px">🎂 <b>${esc(r.name)}</b> 생일 · ${itemLabel(r)}</div>`).join(''):'<div class="small">등록된 생일이 없습니다.</div>'}</div>${state.year<2020||state.year>2050?'<div class="notice">음력 날짜 변환은 2020~2050년에 지원됩니다.</div>':''}`}
function listHTML(){let sort=state.sort||'upcoming',recs=state.records.map(r=>({...r,next:nextEvent(r)}));recs.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'ko'):(a.next?.days??999999)-(b.next?.days??999999));return `${header('가족 생일 목록 🎂','등록된 생일을 한눈에 확인하세요')}<div class="listcontrols"><strong>총 ${recs.length}명</strong><select id="sort"><option value="upcoming" ${sort==='upcoming'?'selected':''}>다가오는 순</option><option value="name" ${sort==='name'?'selected':''}>이름순</option></select></div><div class="listrows">${recs.length?recs.map(r=>`<div class="listrow"><div class="avatar">🎂</div><div class="info"><div class="name">${esc(r.name)}</div><div class="sub">${itemLabel(r)} · ${r.birth_year}년생</div><div class="sub">다음 생일: ${r.next?fmt(r.next.date):'변환 범위 밖'}</div></div><div class="actions"><div class="dday">${r.next?(r.next.days===0?'D-DAY':`D-${r.next.days}`):'—'}</div>${admin()?`<button data-act="edit" data-id="${esc(r.id)}">수정</button>`:''}</div></div>`).join(''):'<div class="empty">아직 등록된 생일이 없습니다.</div>'}</div>`}
function settingsHTML(){return `${header('가족 달력 설정','우리 가족의 소중한 생일을 관리해요')}${admin()?`<section class="card"><h2 class="sectiontitle">🎂 생일 관리</h2><p class="small">생일을 등록하거나 목록에서 수정할 수 있어요.</p><button class="primary full" data-act="add">생일 등록</button></section>`:''}${superadmin()?`<section class="card" style="margin-top:14px"><h2 class="sectiontitle">🔐 역할별 비밀번호 변경</h2><p class="small">최고관리자 비밀번호를 다시 입력해서 변경할 수 있어요.</p>${cfg.appsScriptUrl?`<div class="authframe"><iframe title="비밀번호 관리" sandbox="allow-scripts allow-forms allow-same-origin allow-popups" src="${esc(cfg.appsScriptUrl)}?mode=change"></iframe></div>`:'<div class="notice">인증 서버 URL을 먼저 설정해 주세요.</div>'}</section>`:''}<section class="card" style="margin-top:14px"><h2 class="sectiontitle">현재 권한</h2><p>${state.role==='superadmin'?'👑 최고관리자':state.role==='admin'?'🛡️ 관리자':'👀 일반 사용자'}</p><button class="secondary full" data-act="logout">로그아웃</button></section>`}
function navHTML(){return `<nav class="bottomnav"><button data-act="page" data-page="calendar" class="${state.page==='calendar'?'active':''}">▦<br>달력</button><button data-act="page" data-page="list" class="${state.page==='list'?'active':''}">☷<br>생일 목록</button><button data-act="page" data-page="settings" class="${state.page==='settings'?'active':''}">⚙<br>설정</button></nav>`}
function loginHTML(){return `<section class="card login"><div class="hero">🎂</div><h1>우리 가족 생일 달력</h1><div class="caption">소중한 날을 함께 기억해요</div>${!ready?'<div class="notice">Firebase config.js 설정을 확인해 주세요.</div>':!cfg.appsScriptUrl?'<div class="notice">Apps Script 웹 앱 주소를 config.js에 입력해야 로그인할 수 있어요.</div>':`<div class="authframe" id="loginframe"><iframe title="비밀번호로 로그인" sandbox="allow-scripts allow-forms allow-same-origin allow-popups" src="${esc(cfg.appsScriptUrl)}?mode=login"></iframe></div>`}<div class="msg">${esc(state.msg)}</div></section>`}
function modalHTML(){const r=state.edit||{},yr=r.birth_year||1980,mo=r.birth_month||1,dy=r.birth_day||1,tp=r.calendar_type||'solar';return `<div class="modalshade"><div class="modal"><div class="modalhead"><h2>${r.id?'생일 수정':'생일 등록'} 🎂</h2><button class="iconbtn" data-act="closemodal">✕</button></div><form id="birthform"><div class="formgroup"><label>이름</label><input name="name" required maxlength="50" value="${esc(r.name||'')}" placeholder="가족 이름"></div><div class="formgroup"><label>생년월일</label><div class="formgrid"><input type="number" name="year" aria-label="태어난 연도" min="1900" max="2050" value="${yr}" required><input type="number" name="month" aria-label="태어난 월" min="1" max="12" value="${mo}" required><input type="number" name="day" aria-label="태어난 일" min="1" max="31" value="${dy}" required></div><div class="small" style="margin-top:6px">연도 / 월 / 일을 입력하세요.</div></div><div class="formgroup"><label>생일 종류</label><select name="type" id="birthtype"><option value="solar" ${tp==='solar'?'selected':''}>양력</option><option value="lunar" ${tp==='lunar'?'selected':''}>음력</option></select></div><div class="formgroup" id="leapwrap" style="${tp==='solar'?'display:none':''}"><label><input type="checkbox" name="leap" ${r.is_leap?'checked':''} style="width:auto;min-height:auto"> 윤달 생일</label></div><button type="submit" class="primary full">${r.id?'변경사항 저장':'생일 등록'}</button>${r.id?'<button type="button" class="secondary danger full" style="margin-top:10px" data-act="delete">생일 삭제</button>':''}</form><div class="msg">${esc(state.msg)}</div></div></div>`}
function render(){const root=$('#app');if(!root)return;if(!state.user){root.innerHTML=loginHTML();return;}root.innerHTML=(state.page==='calendar'?calHTML():state.page==='list'?listHTML():settingsHTML())+navHTML()+(state.modal?modalHTML():'');}
function message(s){state.msg=s;render()}
async function reload(){if(!db||!state.user)return;try{const snapshot=await db.collection('birthdays').get();state.records=snapshot.docs.map(d=>({id:d.id,...d.data()}));state.records.sort((a,b)=>a.name.localeCompare(b.name,'ko'));state.msg='';render()}catch(err){if(err.code==='permission-denied'){await signout();state.msg='접근 권한이 만료됐어요. 다시 로그인해 주세요.';render();}else message('생일 목록을 불러오지 못했어요: '+err.message)}}
async function afterLogin(){if(!auth.currentUser){state.user=null;render();return;}const uid=auth.currentUser.uid;const entry=Object.entries(expectedRoleUids).find(([role,id])=>id===uid);if(!entry){await auth.signOut();state.user=null;message('허용되지 않은 로그인 계정입니다.');return;}state.user=auth.currentUser;state.role=entry[0];state.page='calendar';state.msg='';await reload()}
async function signout(){if(auth)await auth.signOut();state.user=null;state.records=[];state.msg='';render()}
async function acceptBridgeMessage(event) {
  if (!auth || !cfg.appsScriptUrl) return;

  // 실제 로그인 iframe에서 보낸 메시지만 수신
  if (!authFrame || event.source !== authFrame.contentWindow) {
    return;
  }

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
    typeof data.token !== 'string'
  ) {
    return;
  }

  try {
    await auth.signInWithCustomToken(data.token);
    await afterLogin();
  } catch (err) {
    message('로그인 연결 실패: ' + err.message);
  }
}

window.addEventListener('message', acceptBridgeMessage);
function rangeMove(step){let d=new Date(state.year,state.month+step,1);state.year=d.getFullYear();state.month=d.getMonth();state.selected=1;render()}
async function saveBirthday(e){e.preventDefault();if(!admin()||!db)return;const f=new FormData(e.target),name=String(f.get('name')).trim(),year=+f.get('year'),month=+f.get('month'),day=+f.get('day'),type=String(f.get('type')),leap=!!f.get('leap');if(!name||year<1900||year>2050||month<1||month>12||day<1||day>31||!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day)){message('생년월일을 확인해 주세요.');return;}if(type==='solar'){const d=new Date(year,month-1,day);if(d.getFullYear()!==year||d.getMonth()+1!==month||d.getDate()!==day){message('존재하지 않는 양력 날짜입니다.');return;}}else if(type!=='lunar'||day>30){message('음력 날짜를 확인해 주세요.');return;}const obj={name,birth_year:year,birth_month:month,birth_day:day,calendar_type:type,is_leap:type==='lunar'&&leap};try{if(state.edit?.id)await db.collection('birthdays').doc(state.edit.id).update(obj);else await db.collection('birthdays').add(obj);state.modal=false;state.edit=null;state.msg='';await reload()}catch(err){message('저장 실패: '+err.message)}}
async function removeBirthday(){if(!admin()||!state.edit?.id||!confirm('이 생일을 삭제할까요?'))return;try{await db.collection('birthdays').doc(state.edit.id).delete();state.modal=false;state.edit=null;await reload()}catch(err){message('삭제 실패: '+err.message)}}
function handleClick(e){const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;if(a==='page'){state.page=b.dataset.page;state.msg='';render()}else if(a==='prev')rangeMove(-1);else if(a==='next')rangeMove(1);else if(a==='day'){state.selected=+b.dataset.day;render()}else if(a==='add'){state.edit=null;state.modal=true;state.msg='';render()}else if(a==='edit'){state.edit=state.records.find(r=>String(r.id)===b.dataset.id);state.modal=true;state.msg='';render()}else if(a==='closemodal'){state.modal=false;state.msg='';render()}else if(a==='logout')signout();else if(a==='delete')removeBirthday(); }
async function init(){try{const res=await fetch('lunar-map.json');if(!res.ok)throw new Error('음력표 오류');state.lunar=await res.json()}catch(err){console.error('음력 날짜 변환표 로드 실패',err)}render()}
document.addEventListener('click',handleClick);document.addEventListener('submit',e=>{if(e.target.id==='birthform')saveBirthday(e)});document.addEventListener('change',e=>{if(e.target.id==='sort'){state.sort=e.target.value;render()}else if(e.target.id==='birthtype'){$('#leapwrap').style.display=e.target.value==='lunar'?'':'none'}});init();
})();
