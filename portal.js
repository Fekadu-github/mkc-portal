/* MKC Amanuel Church Management Portal v12
   Production client: Supabase Auth + PostgreSQL + RLS + MFA.
   No service-role key is used in this browser application. */
const CFG=window.MKC_SUPABASE_CONFIG||{};
const supabaseClient=window.supabase?.createClient?.(CFG.url||'',CFG.anonKey||'');
const DEPTS=[
 ['Administration','⚙','Church administration'],['Youth','◉','Youth ministry'],['Children','●','Children services'],['Women','◌','Women ministry'],['Men','◌','Men ministry'],['Teaching & Training','▣','Teaching and training'],['Evangelism & Shepherding','♡','Evangelism and pastoral care'],['Worship & Choir','♪','Worship ministry'],['Sunday School','✦','Sunday school'],['Prayer','✚','Prayer ministry']
];
let people=[],families=[],followups=[],events=[],attendance=[],profiles=[],departments=[],departmentDeletionRequests=[],memberDeletionRequests=[],eventDeletionRequests=[],dailyUpdates=[],sermons=[],siteSettings={},leaders=[],serviceSchedule=[],peopleAuditLogs=[];let currentUser=null,currentAuth=null,lastFocusedElement=null;
let departmentSubgroups=[],personSubgroups=[],smallGroups=[],smallGroupMembers=[],smallGroupSessions=[],smallGroupRecords=[];
const $=id=>document.getElementById(id);
const roleLabel=r=>({super_admin:'Super Admin',secretary:'Secretary',pastor:'Pastor / Leadership',department_user:'Department User',viewer:'Viewer'}[r]||r);
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2500)}
function esc(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function ageOf(dob){if(!dob)return '';const d=new Date(dob+'T00:00:00'),n=new Date();let a=n.getFullYear()-d.getFullYear();if(n.getMonth()<d.getMonth()||(n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()))a--;return a}
function ageGroup(a){if(a===''||a==null)return'Unknown';if(a<13)return'Children';if(a<25)return'Youth';if(a<60)return'Adult';return'Senior'}
function initials(p){return ((p.first_name||p.first||'')[0]||'')+((p.last_name||p.last||'')[0]||'')}
function isAdmin(){return ['super_admin','secretary','pastor'].includes(currentUser?.role)}
function monthKeyOf(dateStr){return dateStr?String(dateStr).slice(0,7):''}
function currentMonthKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function computeBibleStudyStatus(personId,smallGroupId){
  if(!smallGroupId) return 'red';
  const mk=currentMonthKey();
  const sessionsThisMonth=smallGroupSessions.filter(s=>String(s.small_group_id)===String(smallGroupId)&&monthKeyOf(s.session_date)===mk);
  if(!sessionsThisMonth.length) return 'green';
  const sessionIds=new Set(sessionsThisMonth.map(s=>String(s.id)));
  const presentCount=smallGroupRecords.filter(r=>String(r.person_id)===String(personId)&&sessionIds.has(String(r.session_id))&&r.present).length;
  return (presentCount/sessionsThisMonth.length*100)<50?'yellow':'green';
}
function bibleStudyStatusText(status){return{green:'In a Bible study small group — attendance on track this month',red:'Not yet in a Bible study small group',yellow:'In a small group, but under 50% Bible study attendance this month'}[status]||''}
function bibleStatusDot(status){return `<span class="status-dot ${status}" title="${esc(bibleStudyStatusText(status))}"></span>`}
function worshipChoirDept(){return departments.find(d=>String(d.name||'').trim()==='Worship & Choir')}
function bibleStudyDept(){return departments.find(d=>String(d.name||'').trim()==='Small Group Bible Study')}
function isBibleStudyAdmin(){return currentUser?.role==='department_user'&&bibleStudyDept()&&String(currentUser.department_id)===String(bibleStudyDept().id)}
function isChoirAdmin(){return currentUser?.role==='department_user'&&worshipChoirDept()&&String(currentUser.department_id)===String(worshipChoirDept().id)}
// Shared self-lookup viewer account: anyone can sign in with this login to look up
// only their own record by typing their name or ID. TODO: replace the email below
// with the exact login email used for this account if it differs.
const SELF_LOOKUP_VIEWER_EMAIL='ammkc07@gmial.com';
function isSelfLookupViewer(){return currentUser?.role==='viewer'&&String(currentAuth?.user?.email||'').trim().toLowerCase()===SELF_LOOKUP_VIEWER_EMAIL}
function personBibleStudyTeacher(p){const sg=smallGroups.find(g=>String(g.id)===String(p.small_group_id));if(!sg)return'';if(sg.leader_name)return sg.leader_name;const lp=sg.leader_person_id?people.find(x=>String(x.id)===String(sg.leader_person_id)):null;return lp?`${lp.first} ${lp.last}`:''}
function hasMemberDeletionOverride(){return String(currentAuth?.user?.email||'').trim().toLowerCase()==='aamkc01@gmail.com'}
function allowed(p){
  if(isAdmin()) return true;
  if(currentUser?.role==='viewer') return true;
  if(isBibleStudyAdmin()) return true;
  if(isChoirAdmin()) return true;
  if(currentUser?.role!=='department_user'||!currentUser.department_id) return false;
  const assigned=(p.department_ids||[p.department_id]).filter(Boolean).map(String);
  return assigned.includes(String(currentUser.department_id));
}
function cloudReady(){return !!(supabaseClient&&CFG.url&&!CFG.url.includes('YOUR_PROJECT')&&CFG.anonKey&&!CFG.anonKey.includes('YOUR_PUBLIC'))}
function ensureConfigured(){if(!cloudReady()){$('loginError').textContent='Supabase is not configured. Copy your project URL and public/anon key into supabase-config.js, then reload.';return false}return true}
function normalizePerson(p){return {...p, id:p.id, first:p.first_name,last:p.last_name,dob:p.date_of_birth,gender:p.gender,phone:p.phone,email:p.email,family:p.family_name||'',dept:p.department_name||'',status:String(p.status||'member').replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase()),membership:p.membership_date||'',baptized:p.baptism_date?'Yes':'No',emergency:p.emergency_contact_name||'',emergencyPhone:p.emergency_contact_phone||'',guardian:p.guardian_name||'',address:p.address||'',notes:p.notes||'',department_id:p.department_id,family_id:p.family_id,baptism_date:p.baptism_date||''}}
async function loadCloudData(){
  // Load each table directly with select('*'). We intentionally do not use
  // PostgREST embedded relationships because this project does not currently
  // expose every foreign-key relationship in the schema cache.
  const requests = [
    ['departments', supabaseClient.from('departments').select('*').order('name')],
    ['people_directory', supabaseClient.from('people_directory').select('*').order('created_at',{ascending:false})],
    ['families', supabaseClient.from('families').select('*').order('family_name')],
    ['attendance', supabaseClient.from('attendance').select('*').order('attendance_date',{ascending:false})],
    ['events', supabaseClient.from('events').select('*').order('event_date')],
    ['follow_up_cases', supabaseClient.from('follow_up_cases').select('*').order('created_at',{ascending:false})],
  ['profiles', supabaseClient.from('profiles').select('*').order('full_name')],
  ['person_departments', supabaseClient.from('person_departments').select('*')],
  ['department_deletion_requests', supabaseClient.from('department_deletion_requests').select('*').order('requested_at',{ascending:false})],
  ['member_deletion_requests', supabaseClient.from('member_deletion_requests').select('*').order('requested_at',{ascending:false})],
  ['event_deletion_requests', supabaseClient.from('event_deletion_requests').select('*').order('requested_at',{ascending:false})],
  ['daily_updates', supabaseClient.from('daily_updates').select('*').order('created_at',{ascending:false})],
  ['sermons', supabaseClient.from('sermons').select('*').order('sermon_date',{ascending:false})],
  ['site_settings', supabaseClient.from('site_settings').select('*')],
  ['leaders', supabaseClient.from('leaders').select('*').order('sort_order',{ascending:true})],
  ['service_schedule', supabaseClient.from('service_schedule').select('*').order('sort_order',{ascending:true})],
  ['audit_logs', supabaseClient.from('audit_logs').select('action,table_name,created_at').eq('table_name','people').order('created_at',{ascending:false})],
  ['department_subgroups', supabaseClient.from('department_subgroups').select('*').order('sort_order')],
  ['person_subgroups', supabaseClient.from('person_subgroups').select('*')],
  ['small_groups', supabaseClient.from('small_groups').select('*').order('name')],
  ['small_group_members', supabaseClient.from('small_group_members').select('*')],
  ['small_group_attendance_sessions', supabaseClient.from('small_group_attendance_sessions').select('*').order('session_date',{ascending:false})],
  ['small_group_attendance_records', supabaseClient.from('small_group_attendance_records').select('*')]
  ];
  const results = await Promise.all(requests.map(async ([name,promise]) => [name, await promise]));
  const failures=[];
  const data={};
  for(const [name,r] of results){
    if(r.error){
      // Some deployments use the base `people` table instead of the view.
      if(name==='people_directory'){
        const fallback=await supabaseClient.from('people').select('*').order('created_at',{ascending:false});
        if(!fallback.error){data[name]=fallback.data||[];continue;}
        failures.push(`people/people_directory: ${fallback.error.message}`);
      } else failures.push(`${name}: ${r.error.message}`);
      data[name]=[];
    } else data[name]=r.data||[];
  }

  departments=data.departments||[];
  const deptById=new Map(departments.map(d=>[String(d.id),d]));
  const deptNameOf=(row)=>{
    const id=row?.department_id ?? row?.dept_id ?? row?.departmentId;
    if(id!=null && deptById.has(String(id))) return deptById.get(String(id)).name||'';
    return row?.department_name ?? row?.dept_name ?? (typeof row?.department==='string'?row.department:'') ?? '';
  };
  const familyById=new Map((data.families||[]).map(f=>[String(f.id),f.family_name]));
  const assignmentsByPerson=new Map();
  for(const a of data.person_departments||[]){const key=String(a.person_id);assignmentsByPerson.set(key,[...(assignmentsByPerson.get(key)||[]),a.department_id]);}
  people=(data.people_directory||[]).map(p=>{const ids=[...new Set([p.department_id,...(assignmentsByPerson.get(String(p.id))||[])].filter(Boolean))],names=ids.map(id=>deptById.get(String(id))?.name).filter(Boolean);return normalizePerson({...p,department_name:names.join(', ')||deptNameOf(p),family_name:p.family_name||familyById.get(String(p.family_id))||'',department_ids:ids});});
  families=data.families||[];
  attendance=data.attendance||[];
  events=(data.events||[]).map(e=>({...e,department_name:deptNameOf(e)}));
  profiles=(data.profiles||[]).map(p=>({...p,department_name:deptNameOf(p)}));
  departmentDeletionRequests=data.department_deletion_requests||[];
  memberDeletionRequests=data.member_deletion_requests||[];
  eventDeletionRequests=data.event_deletion_requests||[];
  dailyUpdates=data.daily_updates||[];
  sermons=data.sermons||[];
  siteSettings=Object.fromEntries((data.site_settings||[]).map(s=>[s.key,s.value]));
  leaders=(data.leaders||[]).map(l=>({...l,department_name:deptNameOf(l)}));
  serviceSchedule=data.service_schedule||[];
  peopleAuditLogs=data.audit_logs||[];
  departmentSubgroups=data.department_subgroups||[];
  personSubgroups=data.person_subgroups||[];
  smallGroups=data.small_groups||[];
  smallGroupMembers=data.small_group_members||[];
  smallGroupSessions=data.small_group_attendance_sessions||[];
  smallGroupRecords=data.small_group_attendance_records||[];

  const subgroupsByPerson=new Map();
  for(const ps of personSubgroups){const key=String(ps.person_id);subgroupsByPerson.set(key,[...(subgroupsByPerson.get(key)||[]),ps.subgroup_id]);}
  const smallGroupByPerson=new Map(smallGroupMembers.map(m=>[String(m.person_id),m.small_group_id]));
  people.forEach(p=>{
    p.subgroup_ids=subgroupsByPerson.get(String(p.id))||[];
    p.small_group_id=smallGroupByPerson.get(String(p.id))||null;
    p.bibleStudyStatus=computeBibleStudyStatus(p.id,p.small_group_id);
  });

  const peopleById=new Map(people.map(p=>[String(p.id),p]));
  const profileById=new Map(profiles.map(p=>[String(p.id),p]));
  followups=(data.follow_up_cases||[]).map(f=>({
    ...f,
    people: peopleById.get(String(f.person_id ?? f.people_id ?? f.member_id)) || null,
    assigned_profile: profileById.get(String(f.assigned_to)) || null
  }));

  if(failures.length){
    console.warn('Some portal data could not be loaded:', failures);
    // Authentication remains successful. Show a useful warning without
    // throwing the user back to the login screen.
    setTimeout(()=>toast('Signed in. Some optional records could not be loaded; check browser console for details.'),300);
  }
}

const PORTAL_URL=window.location.origin+window.location.pathname;
function showLoginScreen(message=''){$('resetScreen')?.classList.add('hidden');$('app')?.classList.add('hidden');$('loginScreen')?.classList.remove('hidden');if(message)$('loginError').textContent=message;}
function showResetScreen(){$('loginScreen')?.classList.add('hidden');$('app')?.classList.add('hidden');$('resetScreen')?.classList.remove('hidden');if($('resetError'))$('resetError').textContent='';}
async function sendPasswordReset(){if(!ensureConfigured())return;const email=$('username').value.trim();if(!email){$('loginError').textContent='Enter your email address first.';return;}$('loginError').textContent='Sending password reset email…';const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:PORTAL_URL});$('loginError').textContent=error?error.message:'Password reset email sent. Check your Gmail inbox and click the reset link.';}
async function updatePassword(){const p=$('newPassword').value,c=$('confirmPassword').value;if(p.length<8){$('resetError').textContent='Password must be at least 8 characters.';return;}if(p!==c){$('resetError').textContent='Passwords do not match.';return;}$('resetError').textContent='Updating password…';const {error}=await supabaseClient.auth.updateUser({password:p});if(error){$('resetError').textContent=error.message;return;}await supabaseClient.auth.signOut();history.replaceState({},document.title,PORTAL_URL);showLoginScreen('Password updated successfully. Please sign in with your new password.');}
function setupPasswordRecovery(){
  $('forgotPassword')?.addEventListener('click',async e=>{e.preventDefault();await sendPasswordReset();});
  $('backToLogin')?.addEventListener('click',e=>{e.preventDefault();showLoginScreen();});
  $('resetForm')?.addEventListener('submit',async e=>{e.preventDefault();await updatePassword();});
  supabaseClient.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){showResetScreen();return;}if(event==='SIGNED_OUT'){currentAuth=null;currentUser=null;if(!$('resetScreen')?.classList.contains('hidden'))return;showLoginScreen();}});
  const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));const query=new URLSearchParams(window.location.search);if(hash.get('type')==='recovery'||query.get('type')==='recovery')showResetScreen();
}
async function login(){
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!ensureConfigured())return;$('loginError').textContent='Signing in…';try{const email=$('username').value.trim(),password=$('password').value;const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)throw error;currentAuth=data;await finishLogin();}catch(err){console.error('Login error:',err);$('loginError').textContent=err.message||String(err);}});
  const {data}=await supabaseClient.auth.getSession();
  if(data.session && !window.location.hash.includes('type=recovery') && !new URLSearchParams(window.location.search).has('type')){currentAuth={user:data.session.user,session:data.session};try{await finishLogin();}catch(e){console.error('Session restore error:',e);await supabaseClient.auth.signOut();$('loginError').textContent=e.message||String(e);}}
}

async function finishLogin(){
  if(!currentAuth?.user?.id) throw new Error('Authentication session is missing. Please sign in again.');
  const {data:pf,error}=await supabaseClient.from('profiles').select('*').eq('id',currentAuth.user.id).maybeSingle();
  if(error) throw error;
  if(!pf) throw new Error('Your Supabase account is authenticated, but no matching profile was found in the profiles table. Ask the administrator to create/activate your church profile.');

  // Different database versions may store the department as an id or as a name.
  // Normalize both without requiring a foreign-key relationship.
  const depId=pf.department_id ?? pf.dept_id ?? pf.departmentId ?? null;
  const depName=pf.department_name ?? pf.dept_name ?? (typeof pf.department==='string'?pf.department:'') ?? '';
  currentUser={...pf,department_id:depId,department_name:depName,active:pf.active===undefined?true:pf.active};
  if(!currentUser.active) throw new Error('Your church portal account is inactive. Contact an administrator.');
  if(!currentUser.role) throw new Error('Your profile has no role assigned. Set the role in the profiles table before signing in.');

  const assurance=await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if(assurance.data?.nextLevel==='aal2'&&assurance.data?.currentLevel!=='aal2'){
    const factors=await supabaseClient.auth.mfa.listFactors();
    const factor=(factors.data?.totp||[]).find(x=>x.status==='verified');
    if(factor){
      const ch=await supabaseClient.auth.mfa.challenge({factorId:factor.id});
      if(ch.error) throw ch.error;
      const code=prompt('Enter the 6-digit authenticator code to continue:');
      if(!code){await supabaseClient.auth.signOut();throw new Error('MFA verification is required.');}
      const vr=await supabaseClient.auth.mfa.verify({factorId:factor.id,challengeId:ch.data.id,code:code.trim()});
      if(vr.error){await supabaseClient.auth.signOut();throw new Error('Invalid MFA code. Please sign in again.');}
    }
  }

  await loadCloudData();
  if(!currentUser.department_id && currentUser.department_name){
    const match=departments.find(d=>String(d.name||'').trim().toLowerCase()===String(currentUser.department_name).trim().toLowerCase());
    if(match) currentUser.department_id=match.id;
  }
  $('loginScreen').classList.add('hidden');
  $('resetScreen')?.classList.add('hidden');
  $('app').classList.remove('hidden');
  setupUser();
  renderAll();
  toast('Secure sign-in successful.');
}

function setupUser(){
  const name=currentUser?.full_name||currentAuth?.user?.email||'Portal User';
  let dept=currentUser?.department_name||'';
  if(!dept && currentUser?.department_id!=null){dept=departments.find(d=>String(d.id)===String(currentUser.department_id))?.name||'';}
  $('sideUser').textContent=name;
  $('sideRole').textContent=roleLabel(currentUser.role)+' • '+(dept||'All Church');
  $('userAvatar').textContent=name[0]||'U';
  $('topAvatar').textContent=name[0]||'U';
  document.querySelectorAll('.admin-only').forEach(x=>x.classList.toggle('hidden',!isAdmin()));
  document.querySelectorAll('.super-admin-only').forEach(x=>x.classList.toggle('hidden',currentUser.role!=='super_admin'));
  if(currentUser.role==='viewer'){document.querySelectorAll('.write-action').forEach(x=>x.classList.add('hidden'));['exportCsvTop','exportXlsxTop','exportCsv'].forEach(id=>$(id)?.classList.add('hidden'));}
  document.querySelectorAll('.bible-study-admin-hide').forEach(x=>x.classList.toggle('hidden',isBibleStudyAdmin()));
  document.querySelectorAll('.bible-study-admin-only').forEach(x=>x.classList.toggle('hidden',!isBibleStudyAdmin()));
  document.querySelectorAll('.self-lookup-hide').forEach(x=>x.classList.toggle('hidden',isSelfLookupViewer()));
  $('manageChoirGroupsBtn')?.classList.toggle('hidden',!(isAdmin()||isChoirAdmin()));
  if($('memberSearch'))$('memberSearch').placeholder=isSelfLookupViewer()?'Enter your first name, last name, or ID…':'Search name, phone, ID or family…';
  if(isBibleStudyAdmin()){['addPerson','quickAdd','exportCsvTop','exportXlsxTop','exportCsv'].forEach(id=>$(id)?.classList.add('hidden'));}
}

function showView(view){document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));$(view+'View').classList.remove('hidden');document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view));const labels={dashboard:'Dashboard',members:'People & Members',families:'Families',departments:'Departments',attendance:'Attendance',smallGroups:'Bible Study',events:'Events',followup:'Follow-up',reports:'Reports',content:'Website Content',users:'Users & Permissions'};$('pageTitle').textContent=labels[view]||'Dashboard';if(view==='members')renderMembers();if(view==='families')renderFamilies();if(view==='departments')renderDepartments();if(view==='attendance')renderAttendance();if(view==='smallGroups')renderSmallGroups();if(view==='events')renderEvents();if(view==='followup')renderFollowup();if(view==='reports')renderReports();if(view==='users')renderUsers();if(view==='content')renderContentView()}
function renderDashboard(){const visible=people.filter(allowed);$('statPeople').textContent=visible.length;$('statFamilies').textContent=new Set(visible.map(p=>p.family_id).filter(Boolean)).size;$('statDepartments').textContent=departments.filter(d=>d.active).length;$('statFollowup').textContent=followups.filter(f=>f.people&&allowed(f.people)).length;const groups=['Children','Youth','Adult','Senior'],counts=groups.map(g=>visible.filter(p=>ageGroup(ageOf(p.dob))===g).length),max=Math.max(...counts,1);$('ageBars').innerHTML=groups.map((g,i)=>`<div class="bar-row"><span>${g}</span><div class="bar"><i style="width:${counts[i]/max*100}%"></i></div><b>${counts[i]}</b></div>`).join('');$('deptSnapshot').innerHTML=departments.filter(d=>d.active).slice(0,6).map(d=>`<div class="dept-line"><span>◉ ${esc(d.name)}</span><b>${visible.filter(p=>(p.department_ids||[p.department_id]).map(String).includes(String(d.id))).length}</b></div>`).join('');$('recentPeople').innerHTML=visible.slice(0,5).map(p=>personRow(p)).join('')||'<div class="empty">No people records yet.</div>'}
function personRow(p){return `<div class="dept-line"><span class="person-cell"><i class="person-avatar">${esc(initials(p))}</i><span><b>${esc(p.first)} ${esc(p.last)}</b><small>${esc(p.member_no||p.id)} • ${esc(p.family||'No family')}</small></span></span><span class="badge">${ageGroup(ageOf(p.dob))}</span></div>`}
let currentMemberList=[];
function sortPeopleList(list,sf){const arr=[...list];const byName=(a,b)=>`${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`);const byAge=(a,b)=>(ageOf(a.dob)===''?-1:ageOf(a.dob))-(ageOf(b.dob)===''?-1:ageOf(b.dob));const byDept=(a,b)=>String(a.dept||'').localeCompare(String(b.dept||''));switch(sf){case 'name_desc':return arr.sort((a,b)=>byName(b,a));case 'age_asc':return arr.sort(byAge);case 'age_desc':return arr.sort((a,b)=>byAge(b,a));case 'dept_asc':return arr.sort(byDept);case 'dept_desc':return arr.sort((a,b)=>byDept(b,a));default:return arr.sort(byName)}}
function subgroupName(id){return departmentSubgroups.find(s=>String(s.id)===String(id))?.name||''}
function personSubgroupNames(p){return (p.subgroup_ids||[]).map(id=>subgroupName(id)).filter(Boolean)}
function renderMembers(){const deptOptions='<option value="">All departments</option>'+departments.filter(d=>d.active).map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');$('deptFilter').innerHTML=deptOptions;const wc=worshipChoirDept();const subgroupOptions='<option value="">All choir/worship groups</option>'+departmentSubgroups.filter(sg=>!wc||String(sg.department_id)===String(wc.id)).map(sg=>`<option value="${sg.id}">${esc(sg.name)}</option>`).join('');$('subgroupFilter').innerHTML=subgroupOptions;const q=($('memberSearch').value||'').toLowerCase(),ag=$('ageFilter').value,dp=$('deptFilter').value,sg=$('subgroupFilter')?.value||'',st=$('statusFilter').value,bs=$('bibleStudyFilter')?.value||'',sf=$('sortFilter')?.value||'name_asc';let list=people.filter(allowed).filter(p=>(`${p.first} ${p.last} ${p.phone||''} ${p.member_no||p.id} ${p.family||''}`).toLowerCase().includes(q)).filter(p=>!ag||ageGroup(ageOf(p.dob))===ag).filter(p=>!dp||(p.department_ids||[p.department_id]).map(String).includes(String(dp))).filter(p=>!sg||(p.subgroup_ids||[]).map(String).includes(String(sg))).filter(p=>!st||p.status===st).filter(p=>!bs||(p.bibleStudyStatus||'red')===bs);if(isSelfLookupViewer()&&!q)list=[];list=sortPeopleList(list,sf);currentMemberList=list;const requests=currentUser?.role==='super_admin'?`<div class="panel"><h3>Member deletion requests</h3>${memberDeletionRequests.map(r=>`<div class="dept-line"><span><b>${esc(r.member_name)}</b><br><small>Requested reason: ${esc(r.justification)}${r.rejection_reason?` · Rejection reason: ${esc(r.rejection_reason)}`:''}</small></span><span>${requestStatus(r)} ${r.status==='pending'?`<button onclick="reviewMemberDeletion('${r.id}','approved')">Approve & permanently delete</button><button onclick="reviewMemberDeletion('${r.id}','rejected')">Reject</button>`:''}${r.status==='approved'&&currentUser?.role==='super_admin'?`<button class="danger" onclick="deleteMemberDeletionRequest('${r.id}')">Delete request permanently</button>`:''}</span></div>`).join('')||'<div class="empty">No member deletion requests.</div>'}</div>`:'';$('memberTable').innerHTML=list.length?list.map(p=>`<tr><td><div class="person-cell"><i class="person-avatar">${esc(initials(p))}</i><span><b>${esc(p.first)} ${esc(p.last)}</b><small>${esc(p.member_no||p.id)} • ${esc(p.family||'No family')}</small></span></div></td><td>${ageOf(p.dob)}</td><td><span class="badge">${ageGroup(ageOf(p.dob))}</span></td><td>${esc(p.dept)}</td><td>${esc(personSubgroupNames(p).join(', ')||'—')}</td><td><span class="badge ${p.status==='Visitor'?'red':p.status==='Leader'?'green':''}">${esc(p.status)}</span></td><td>${bibleStatusDot(p.bibleStudyStatus||'red')}</td><td>${esc(personBibleStudyTeacher(p)||'—')}</td><td>${esc(p.phone||'—')}</td><td class="row-actions"><button onclick="viewPerson('${p.id}')">View</button>${(isAdmin()||hasMemberDeletionOverride()||(currentUser.role==='department_user'&&!isBibleStudyAdmin()&&(p.department_ids||[p.department_id]).map(String).includes(String(currentUser.department_id))))?`${hasMemberDeletionOverride()?'':`<button onclick="editPerson('${p.id}')">Edit</button>`}${hasMemberDeletionOverride()?`<button class="danger" onclick="deletePerson('${p.id}')">Delete</button>`:`<button class="danger" onclick="requestMemberDeletion('${p.id}')">Request delete</button>`}`:''}</td></tr>`).join(''):`<tr><td colspan="10"><div class="empty">${isSelfLookupViewer()&&!q?'Enter your first name, last name, or ID above to find your record.':'No records match your filters.'}</div></td></tr>`;$('memberDeletionRequests').innerHTML=requests;}
function openModal(title,body){lastFocusedElement=document.activeElement;$('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modal').classList.remove('hidden');$('modal').setAttribute('aria-hidden','false');setTimeout(()=>$('modal').querySelector('input,select,textarea,button')?.focus(),0)}
function closeModal(){$('modal').classList.add('hidden');$('modal').setAttribute('aria-hidden','true');lastFocusedElement?.focus?.()}
function personForm(p={}) {
  const allowedDepartments = currentUser?.role==='department_user'
    ? departments.filter(d => String(d.id) === String(currentUser.department_id))
    : departments;
  const opts = allowedDepartments
    .filter(d => d.active !== false)
    .map(d => `<option value="${d.id}" ${String(p.department_id ?? '') === String(d.id) ? 'selected' : ''}>${esc(d.name)}</option>`)
    .join('');

  return `<form id="personForm"><p class="muted">Fields marked <b>*</b> are required.</p><div class="form-grid">
    <label>First name <b aria-hidden="true">*</b><input name="first_name" required value="${esc(p.first||'')}"></label>
    <label>Last name <b aria-hidden="true">*</b><input name="last_name" required value="${esc(p.last||'')}"></label>
    <div class="dob-field">
      <label>Date of birth <b aria-hidden="true">*</b></label>
      <div class="dob-toggle">
        <label class="dob-radio"><input type="radio" name="dobCalendarType" value="ethiopian" checked> Ethiopian (ኢትዮጵያዊ)</label>
        <label class="dob-radio"><input type="radio" name="dobCalendarType" value="gregorian"> Gregorian</label>
      </div>
      <div class="dob-ec-fields dob-row">
        <select class="dob-ec-day"><option value="">Day</option></select>
        <select class="dob-ec-month"><option value="">Month</option></select>
        <select class="dob-ec-year"><option value="">Year</option></select>
      </div>
      <div class="dob-gc-fields dob-row hidden">
        <input type="date" class="dob-gc-input">
      </div>
      <small class="dob-age-display muted"></small>
      <input type="hidden" name="date_of_birth" class="dob-hidden-input" value="${esc(p.dob||'')}">
    </div>
    <label>Gender <b aria-hidden="true">*</b><select name="gender" required>
      <option value="">Select gender</option>
      <option value="Male" ${p.gender==='Male'?'selected':''}>Male</option>
      <option value="Female" ${p.gender==='Female'?'selected':''}>Female</option>
      <option value="Other" ${p.gender==='Other'?'selected':''}>Other</option>
    </select></label>
    <label>Phone<input name="phone" value="${esc(p.phone||'')}"></label>
    <label>Email<input name="email" type="email" value="${esc(p.email||'')}"></label>
    <label>Primary department <b aria-hidden="true">*</b><select name="department_id" required>
      <option value="">Select Department</option>
      ${opts}
    </select></label>
    ${isAdmin()?`<label>Additional departments<select name="additional_department_ids" multiple size="4">${departments.filter(d=>d.active!==false&&String(d.id)!==String(p.department_id??'')).map(d=>`<option value="${d.id}" ${(p.department_ids||[]).map(String).includes(String(d.id))?'selected':''}>${esc(d.name)}</option>`).join('')}</select><small>Hold Ctrl (Windows) or Command (Mac) to select several.</small></label>`:''}
    <div class="wide hidden" id="choirSubgroupsField"><label>Worship &amp; Choir group(s)</label><div class="checkbox-group">${(worshipChoirDept()?departmentSubgroups.filter(sg=>String(sg.department_id)===String(worshipChoirDept().id)):[]).map(sg=>`<label class="checkbox-pill"><input type="checkbox" name="subgroup_ids" value="${sg.id}" ${(p.subgroup_ids||[]).map(String).includes(String(sg.id))?'checked':''}> ${esc(sg.name)}</label>`).join('')||'<small class="muted">No sub-groups configured for Worship &amp; Choir yet.</small>'}</div><small class="muted">Shown when Worship &amp; Choir is selected as a department. A member can belong to more than one group.</small></div>
    <label>Status><select name="status">
      ${[['member','Member'],['visitor','Visitor'],['new_believer','New Believer'],['leader','Leader']].map(x =>
        `<option value="${x[0]}" ${p.status?.toLowerCase().replace(' ','_')===x[0]?'selected':''}>${x[1]}</option>`
      ).join('')}
    </select></label>
    <label>Membership date<input name="membership_date" type="date" value="${esc(p.membership||'')}"></label>
    <label>Baptism date<input name="baptism_date" type="date" value="${esc(p.baptism_date||'')}"></label>
    <label>Family ID (optional)<select name="family_id">
      <option value="">No family</option>
      ${families.map(f => `<option value="${f.id}" ${p.family_id===f.id?'selected':''}>${esc(f.family_name)}</option>`).join('')}
    </select></label>
    <label>Guardian / Parent<input name="guardian_name" value="${esc(p.guardian||'')}"></label>
    <label>Emergency contact<input name="emergency_contact_name" value="${esc(p.emergency||'')}"></label>
    <label>Emergency phone<input name="emergency_contact_phone" value="${esc(p.emergencyPhone||'')}"></label>
    <label>Address <b aria-hidden="true">*</b><input name="address" required value="${esc(p.address||'')}"></label>
    <label>Notes<textarea name="notes" rows="3">${esc(p.notes||'')}</textarea></label>
  </div>
  <div class="form-actions">
    <button type="button" class="secondary" onclick="closeModal()">Cancel</button>
    <button class="primary">Save Person</button>
  </div></form>`;
}
function initPersonDobWidget(form, initialIso){
  const root=form.querySelector('.dob-field');
  if(!root) return;
  const radios=root.querySelectorAll('input[name="dobCalendarType"]');
  const ecFields=root.querySelector('.dob-ec-fields'), gcFields=root.querySelector('.dob-gc-fields');
  const daySel=root.querySelector('.dob-ec-day'), monthSel=root.querySelector('.dob-ec-month'), yearSel=root.querySelector('.dob-ec-year');
  const gcInput=root.querySelector('.dob-gc-input'), ageOut=root.querySelector('.dob-age-display'), hidden=root.querySelector('.dob-hidden-input');

  EthiopianCalendar.getEthiopianMonths().forEach(m=>{
    const o=document.createElement('option'); o.value=m.index; o.textContent=`${m.am} (${m.en})`; monthSel.appendChild(o);
  });
  const today=new Date(), todayEc=EthiopianCalendar.gregorianToEthiopian(today.getFullYear(),today.getMonth()+1,today.getDate());
  for(let y=todayEc.year;y>=todayEc.year-120;y--){const o=document.createElement('option');o.value=y;o.textContent=y;yearSel.appendChild(o)}

  function populateDays(){
    const y=parseInt(yearSel.value,10), m=parseInt(monthSel.value,10);
    const max=(y&&m)?EthiopianCalendar.daysInEthiopianMonth(y,m):30;
    const cur=daySel.value;
    daySel.innerHTML='<option value="">Day</option>';
    for(let d=1;d<=max;d++){const o=document.createElement('option');o.value=d;o.textContent=d;daySel.appendChild(o)}
    if(cur&&parseInt(cur,10)<=max) daySel.value=cur;
  }
  populateDays();

  function activeCalendar(){return [...radios].find(r=>r.checked)?.value||'ethiopian'}
  function sync(){
    let iso='', age='';
    if(activeCalendar()==='ethiopian'){
      const y=parseInt(yearSel.value,10), m=parseInt(monthSel.value,10), d=parseInt(daySel.value,10);
      if(y&&m&&d){
        try{
          const g=EthiopianCalendar.ethiopianToGregorian(y,m,d);
          iso=EthiopianCalendar.toIsoDateString(g.year,g.month,g.day);
          age=EthiopianCalendar.calculateAgeFromGregorian(g.year,g.month,g.day);
        }catch(e){}
      }
    } else if(gcInput.value){
      iso=gcInput.value;
      const [gy,gm,gd]=gcInput.value.split('-').map(Number);
      age=EthiopianCalendar.calculateAgeFromGregorian(gy,gm,gd);
    }
    hidden.value=iso;
    ageOut.textContent=iso?`Age: ${age} years`:'';
  }

  radios.forEach(r=>r.addEventListener('change',()=>{
    const isEth=activeCalendar()==='ethiopian';
    ecFields.classList.toggle('hidden',!isEth);
    gcFields.classList.toggle('hidden',isEth);
    sync();
  }));
  monthSel.addEventListener('change',()=>{populateDays();sync()});
  yearSel.addEventListener('change',()=>{populateDays();sync()});
  daySel.addEventListener('change',sync);
  gcInput.addEventListener('change',sync);

  if(initialIso){
    const [gy,gm,gd]=initialIso.split('-').map(Number);
    if(gy&&gm&&gd){
      const e=EthiopianCalendar.gregorianToEthiopian(gy,gm,gd);
      yearSel.value=e.year; monthSel.value=e.month; populateDays(); daySel.value=e.day;
      gcInput.value=initialIso;
    }
  }
  sync();
}
function cleanPersonPayload(form){
  const raw=Object.fromEntries(new FormData(form));
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const optional=(value)=>value?.trim?.()||null;
  const optionalUuid=(value)=>uuid.test(value||'')?value:null;
  const selectedDepartment=optionalUuid(raw.department_id);
  const department_id=currentUser?.role==='department_user' ? currentUser.department_id : selectedDepartment;
  const required={
    'First name':raw.first_name?.trim(), 'Last name':raw.last_name?.trim(),
    'Date of birth':raw.date_of_birth, Gender:raw.gender, Address:raw.address?.trim(),
    'Primary department':department_id
  };
  const missing=Object.entries(required).filter(([,value])=>!value).map(([label])=>label);
  if(missing.length) throw new Error(`Required: ${missing.join(', ')}.`);
  return {
    first_name:raw.first_name.trim(), last_name:raw.last_name.trim(), date_of_birth:raw.date_of_birth,
    gender:optional(raw.gender), phone:optional(raw.phone), email:optional(raw.email), address:optional(raw.address),
    family_id:optionalUuid(raw.family_id), department_id, status:raw.status,
    membership_date:optional(raw.membership_date), baptism_date:optional(raw.baptism_date),
    guardian_name:optional(raw.guardian_name), emergency_contact_name:optional(raw.emergency_contact_name),
    emergency_contact_phone:optional(raw.emergency_contact_phone), notes:optional(raw.notes)
  };
}
function additionalDepartmentIds(form,primaryId){if(!isAdmin())return [];const uuid=/^[0-9a-f-]{36}$/i;return [...form.querySelectorAll('select[name="additional_department_ids"] option:checked')].map(x=>x.value).filter(x=>uuid.test(x)&&x!==primaryId)}
async function saveDepartmentAssignments(personId,primaryId,additionalIds){const ids=[...new Set([primaryId,...additionalIds])];let r=await supabaseClient.from('person_departments').delete().eq('person_id',personId);if(r.error)throw r.error;r=await supabaseClient.from('person_departments').insert(ids.map(department_id=>({person_id:personId,department_id,is_primary:department_id===primaryId})));if(r.error)throw r.error}
function initChoirSubgroupToggle(form){
  const field=form.querySelector('#choirSubgroupsField');
  if(!field) return;
  const wc=worshipChoirDept();
  const deptSel=form.querySelector('select[name="department_id"]');
  const addlSel=form.querySelector('select[name="additional_department_ids"]');
  function sync(){
    const selected=[deptSel?.value,...(addlSel?[...addlSel.selectedOptions].map(o=>o.value):[])].filter(Boolean).map(String);
    field.classList.toggle('hidden',!(wc&&selected.includes(String(wc.id))));
  }
  deptSel?.addEventListener('change',sync);
  addlSel?.addEventListener('change',sync);
  sync();
}
function selectedSubgroupIds(form){return [...form.querySelectorAll('input[name="subgroup_ids"]:checked')].map(x=>x.value)}
async function saveSubgroupAssignments(personId,subgroupIds){let r=await supabaseClient.from('person_subgroups').delete().eq('person_id',personId);if(r.error)throw r.error;if(subgroupIds.length){r=await supabaseClient.from('person_subgroups').insert(subgroupIds.map(subgroup_id=>({person_id:personId,subgroup_id})));if(r.error)throw r.error}}
async function addPerson(){if(currentUser.role==='viewer'||isBibleStudyAdmin())return;openModal('Add Person',personForm());initPersonDobWidget($('personForm'),null);initChoirSubgroupToggle($('personForm'));$('personForm').onsubmit=async e=>{e.preventDefault();try{
  const f=cleanPersonPayload(e.target),additionalIds=additionalDepartmentIds(e.target,cleanPersonPayload(e.target).department_id),subgroupIds=selectedSubgroupIds(e.target);

  const actorId=currentAuth?.user?.id;
  if(!/^[0-9a-f-]{36}$/i.test(actorId||'')) throw new Error('Your sign-in session is invalid. Please sign out and sign in again.');
  f.created_by = actorId;
  f.updated_by = actorId;
const {data:createdPerson,error } = await supabaseClient
    .from('people')
    .insert(f).select('id').single();

if (error) throw error;
  await saveDepartmentAssignments(createdPerson.id,f.department_id,additionalIds);
  await saveSubgroupAssignments(createdPerson.id,subgroupIds);

  await loadCloudData();
closeModal();
renderAll();
showView('members');
toast('Person added to the secure database.');
} catch(err) {
    toast(err.message);
}}}
async function editPerson(id){if(currentUser.role==='viewer'||isBibleStudyAdmin())return;const p=people.find(x=>x.id===id);if(!p||!allowed(p))return;openModal('Update Person',personForm(p));initPersonDobWidget($('personForm'),p.dob||null);initChoirSubgroupToggle($('personForm'));$('personForm').onsubmit=async e=>{e.preventDefault();try{const f=cleanPersonPayload(e.target),additionalIds=additionalDepartmentIds(e.target,f.department_id),subgroupIds=selectedSubgroupIds(e.target);f.updated_by=currentAuth.user.id;const {error}=await supabaseClient.from('people').update(f).eq('id',id);if(error)throw error;await saveDepartmentAssignments(id,f.department_id,additionalIds);await saveSubgroupAssignments(id,subgroupIds);await loadCloudData();closeModal();renderAll();showView('members');toast('Person updated securely.')}catch(err){toast(err.message)}}}
async function requestMemberDeletion(personId){if(currentUser.role==='viewer'||isBibleStudyAdmin())return;const person=people.find(p=>String(p.id)===String(personId));if(!person||!allowed(person))return;openModal(`Request deletion: ${person.first} ${person.last}`,`<form id="memberDeletionForm"><p class="muted">A Super Admin must approve this request before the member record is permanently deleted.</p><label>Justification<textarea name="justification" rows="4" required minlength="5" placeholder="Explain why this member record should be deleted."></textarea></label><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="danger">Submit request</button></div></form>`);$('memberDeletionForm').onsubmit=async e=>{e.preventDefault();try{const justification=new FormData(e.target).get('justification').trim();const {error}=await supabaseClient.rpc('request_member_deletion',{target_person_id:personId,request_justification:justification});if(error)throw error;await loadCloudData();closeModal();renderMembers();toast('Member deletion request submitted.');}catch(err){toast(err.message)}}}
async function deletePerson(personId){if(!hasMemberDeletionOverride())return;if(!confirm('Permanently delete this member record? This cannot be undone.'))return;try{const {error}=await supabaseClient.rpc('delete_member_without_approval',{target_person_id:personId});if(error)throw error;await loadCloudData();renderAll();showView('members');toast('Member record permanently deleted.');}catch(err){toast(err.message)}}
async function reviewMemberDeletion(requestId,decision){if(currentUser?.role!=='super_admin')return;const rejectionReason=decision==='rejected'?prompt('Give the reason for rejecting this deletion request:'):'';if(decision==='rejected'&&!rejectionReason?.trim()){toast('A rejection reason is required.');return;}if(decision==='approved'&&!confirm('Approve this request? The member record will be permanently deleted.'))return;try{const {error}=await supabaseClient.rpc('review_member_deletion',{request_id:requestId,decision,rejection_reason:rejectionReason?.trim()||null});if(error)throw error;await loadCloudData();renderAll();showView('members');toast(decision==='approved'?'Member record permanently deleted.':'Member deletion request rejected.');}catch(err){toast(err.message)}}
function viewPerson(id){const p=people.find(x=>x.id===id);if(!p||!allowed(p))return;const sg=smallGroups.find(g=>String(g.id)===String(p.small_group_id));const subgroupNames=(p.subgroup_ids||[]).map(sid=>departmentSubgroups.find(s=>String(s.id)===String(sid))?.name).filter(Boolean);const bsStatus=p.bibleStudyStatus||'red';const bsPct=p.small_group_id?smallGroupPercentThisMonth(p.small_group_id):null;openModal('Member Profile',`<div class="profile-card"><div class="profile-hero"><div class="profile-big-avatar">${esc(initials(p))}</div><div><span class="eyebrow">${esc(p.member_no||p.id)}</span><h2>${esc(p.first)} ${esc(p.last)}</h2><p>${esc(p.status)} • ${ageGroup(ageOf(p.dob))} • ${ageOf(p.dob)} years</p></div></div><div class="profile-grid"><div><small>Department(s)</small><b>${esc(p.dept||'—')}</b></div><div><small>Family</small><b>${esc(p.family||'—')}</b></div>${subgroupNames.length?`<div><small>Choir / Worship group</small><b>${esc(subgroupNames.join(', '))}</b></div>`:''}<div><small>Bible study small group</small><b>${bibleStatusDot(bsStatus)} ${esc(sg?.name||'Not assigned')}</b></div><div><small>Bible study attendance status</small><b>${bibleStatusDot(bsStatus)} ${esc(bibleStudyStatusText(bsStatus))}${bsPct!=null?` (${bsPct}% this month)`:''}</b></div><div><small>Bible study teacher</small><b>${esc(personBibleStudyTeacher(p)||'—')}</b></div><div><small>Phone</small><b>${esc(p.phone||'—')}</b></div><div><small>Email</small><b>${esc(p.email||'—')}</b></div><div><small>Membership</small><b>${esc(p.membership||'—')}</b></div><div><small>Baptized</small><b>${esc(p.baptized||'—')}</b></div><div><small>Guardian</small><b>${esc(p.guardian||'—')}</b></div><div><small>Emergency</small><b>${esc(p.emergency||'—')} ${esc(p.emergencyPhone||'')}</b></div><div class="wide"><small>Address</small><b>${esc(p.address||'—')}</b></div><div class="wide"><small>Notes</small><b>${esc(p.notes||'—')}</b></div></div><div class="form-actions"><button class="secondary" onclick="closeModal()">Close</button>${currentUser.role==='viewer'?'':`<button class="primary" onclick="printMemberCard('${p.id}')">Print Member Card</button>`}</div></div>`)}
function printMemberCard(id){if(currentUser.role==='viewer')return;const p=people.find(x=>x.id===id);if(!p||!allowed(p))return;const w=window.open('','_blank','width=700,height=500');if(!w){toast('Allow pop-ups to print the member card.');return}w.document.write(`<html><head><title>${esc(p.first)} ${esc(p.last)}</title><style>body{font-family:Arial;padding:40px}.card{border:2px solid #083b5c;border-radius:18px;padding:30px;max-width:560px;margin:auto}.top{display:flex;gap:18px;align-items:center}.avatar{width:70px;height:70px;border-radius:50%;background:#eaf6fb;color:#083b5c;display:grid;place-items:center;font-weight:bold;font-size:24px}.id{color:#a7192e;font-size:12px;font-weight:bold}.name{font-size:26px;color:#083b5c;margin:5px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:25px}.grid small{display:block;color:#777}.grid b{display:block;margin-top:4px}.grid .wide{grid-column:1/-1}.foot{margin-top:25px;color:#777;font-size:11px}</style></head><body><div class="card"><div class="top"><div class="avatar">${esc(initials(p))}</div><div><div class="id">MESERETE KRISTOS CHURCH — AMANUEL LOCAL CHURCH</div><div class="name">${esc(p.first)} ${esc(p.last)}</div><div>${esc(p.member_no||p.id)} • ${ageGroup(ageOf(p.dob))}</div></div></div><div class="grid"><div><small>Department</small><b>${esc(p.dept||'—')}</b></div><div><small>Status</small><b>${esc(p.status||'—')}</b></div><div><small>Phone</small><b>${esc(p.phone||'—')}</b></div><div><small>Family</small><b>${esc(p.family||'—')}</b></div>${p.address?`<div class="wide"><small>Address</small><b>${esc(p.address)}</b></div>`:''}</div><div class="foot">Official church record • Keep this card private.</div></div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()}
function renderFamilies(){const map={};people.filter(allowed).forEach(p=>{const f=p.family||'Unassigned Household';(map[f]??=[]).push(p)});$('familyGrid').innerHTML=Object.entries(map).map(([name,ps])=>`<div class="family-card"><span class="eyebrow">HOUSEHOLD • ${ps.length}</span><h3>${esc(name)}</h3><p>${ps.map(p=>`${esc(p.first)} ${esc(p.last)} (${ageGroup(ageOf(p.dob))})`).join(' · ')}</p></div>`).join('')||'<div class="empty">No family records.</div>'}
function requestStatus(request){return `<span class="badge ${request.status==='approved'?'green':request.status==='rejected'?'red':''}">${esc(request.status)}</span>`}
function renderDepartments(){
  const cards=departments.filter(d=>d.active).map(d=>`<div class="department-card"><div class="dept-icon"><svg class="ic" aria-hidden="true"><use href="#i-dept"/></svg></div><h3>${esc(d.name)}</h3><p>${esc(d.description||'')}</p><span class="badge">${people.filter(p=>allowed(p)&&(p.department_ids||[p.department_id]).map(String).includes(String(d.id))).length} people</span>${isAdmin()?`<div class="form-actions"><button class="danger" onclick="requestDepartmentDeletion('${d.id}')">Request deletion</button></div>`:''}</div>`).join('')||'<div class="empty">No active departments.</div>';
  const requests=currentUser?.role==='super_admin'?departmentDeletionRequests.map(r=>`<div class="dept-line"><span><b>${esc(r.department_name)}</b><br><small>Requested reason: ${esc(r.justification)}${r.rejection_reason?` · Rejection reason: ${esc(r.rejection_reason)}`:''}</small></span><span>${requestStatus(r)} ${r.status==='pending'?`<button onclick="reviewDepartmentDeletion('${r.id}','approved')">Approve & permanently delete</button><button onclick="reviewDepartmentDeletion('${r.id}','rejected')">Reject</button>`:''}</span></div>`).join('')||'<div class="empty">No deletion requests.</div>':'';
  $('departmentGrid').innerHTML=cards+(currentUser?.role==='super_admin'?`<div class="panel"><h3>Deletion requests</h3>${requests}</div>`:'');
  if(isAdmin()){
    const current=$('departmentMembersSelect').value;
    $('departmentMembersSelect').innerHTML='<option value="">Choose a department…</option>'+departments.filter(d=>d.active).map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');
    $('departmentMembersSelect').value=current;
    renderDepartmentMembersList();
  }
}
function renderDepartmentMembersList(){
  const deptId=$('departmentMembersSelect')?.value;
  if(!deptId){$('departmentMembersList').innerHTML='';return}
  const members=people.filter(allowed).filter(p=>(p.department_ids||[p.department_id]).map(String).includes(String(deptId)));
  $('departmentMembersList').innerHTML=members.length?members.map(p=>personRow(p)).join(''):'<div class="empty">No members in this department yet.</div>';
}
function addDepartment(){if(!isAdmin())return;openModal('Add Department',`<form id="departmentForm"><div class="form-grid"><label>Name<input name="name" required placeholder="e.g. Media Ministry"></label><label>Description<textarea name="description" rows="3"></textarea></label></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Add Department</button></div></form>`);$('departmentForm').onsubmit=async e=>{e.preventDefault();try{const fd=new FormData(e.target);const {error}=await supabaseClient.from('departments').insert({name:fd.get('name').trim(),description:fd.get('description').trim()||null});if(error)throw error;await loadCloudData();closeModal();renderDepartments();toast('Department added.')}catch(err){toast(err.message)}}}
async function requestDepartmentDeletion(departmentId){
  if(!isAdmin())return;
  const department=departments.find(d=>String(d.id)===String(departmentId));
  if(!department)return;
  openModal(`Request deletion: ${department.name}`,`<form id="departmentDeletionForm"><p class="muted">Deletion requires Super Admin approval. Approval permanently removes this department and its department assignments.</p><label>Justification<textarea name="justification" rows="4" required minlength="5" placeholder="Explain why this department should be deleted."></textarea></label><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="danger">Submit request</button></div></form>`);
  $('departmentDeletionForm').onsubmit=async e=>{e.preventDefault();try{const justification=new FormData(e.target).get('justification').trim();const {error}=await supabaseClient.rpc('request_department_deletion',{target_department_id:departmentId,request_justification:justification});if(error)throw error;await loadCloudData();closeModal();renderDepartments();toast('Department deletion request submitted.');}catch(err){toast(err.message)}};
}
async function reviewDepartmentDeletion(requestId,decision){
  if(currentUser?.role!=='super_admin')return;
  const rejectionReason=decision==='rejected'?prompt('Give the reason for rejecting this deletion request:') : '';
  if(decision==='rejected'&&!rejectionReason?.trim()){toast('A rejection reason is required.');return;}
  if(decision==='approved'&&!confirm('Approve this request? The department will be permanently deleted.'))return;
  try{const {error}=await supabaseClient.rpc('review_department_deletion',{request_id:requestId,decision,rejection_reason:rejectionReason?.trim()||null});if(error)throw error;await loadCloudData();renderAll();showView('departments');toast(decision==='approved'?'Department permanently deleted.':'Deletion request rejected.');}catch(err){toast(err.message)}
}
function canManageSmallGroups(){return isAdmin()||(currentUser?.role==='department_user'&&bibleStudyDept()&&String(currentUser.department_id)===String(bibleStudyDept().id))}
function smallGroupMemberCount(gid){return smallGroupMembers.filter(m=>String(m.small_group_id)===String(gid)).length}
function smallGroupPercentThisMonth(gid){
  const mk=currentMonthKey();
  const sessions=smallGroupSessions.filter(s=>String(s.small_group_id)===String(gid)&&monthKeyOf(s.session_date)===mk);
  const memberIds=smallGroupMembers.filter(m=>String(m.small_group_id)===String(gid)).map(m=>String(m.person_id));
  if(!sessions.length||!memberIds.length) return null;
  const sessionIds=new Set(sessions.map(s=>String(s.id)));
  const perMember=memberIds.map(pid=>smallGroupRecords.filter(r=>String(r.person_id)===pid&&sessionIds.has(String(r.session_id))&&r.present).length/sessions.length);
  return Math.round(perMember.reduce((a,b)=>a+b,0)/perMember.length*100);
}
function renderSmallGroups(){
  const canManage=canManageSmallGroups();
  $('addSmallGroup')?.classList.toggle('hidden',!canManage);
  const groups=smallGroups.filter(g=>g.active!==false);
  $('smallGroupGrid').innerHTML=groups.map(g=>{
    const count=smallGroupMemberCount(g.id),pct=smallGroupPercentThisMonth(g.id);
    const leaderPerson=g.leader_person_id?people.find(p=>String(p.id)===String(g.leader_person_id)):null;
    const leaderLabel=g.leader_name||(leaderPerson?`${leaderPerson.first} ${leaderPerson.last}`:'No leader set');
    const meta=[leaderLabel,g.meeting_day,g.meeting_time,g.location].filter(Boolean).join(' • ');
    return `<div class="small-group-card"><div class="dept-icon"><svg class="ic" aria-hidden="true"><use href="#i-book"/></svg></div><h3>${esc(g.name)}</h3><p>${esc(meta)}</p><span class="badge">${count} member${count===1?'':'s'}</span> ${pct!=null?`<span class="badge ${pct<50?'red':'green'}">${pct}% this month</span>`:'<span class="badge">No sessions this month</span>'}<div class="form-actions">${canManage?`<button onclick="manageSmallGroupMembers('${g.id}')">Members</button><button onclick="takeSmallGroupAttendance('${g.id}')">Attendance</button><button onclick="editSmallGroup('${g.id}')">Edit</button><button class="danger" onclick="deleteSmallGroup('${g.id}')">Delete</button>`:`<button onclick="manageSmallGroupMembers('${g.id}')">View members</button>`}</div></div>`;
  }).join('')||'<div class="empty">No small groups yet. Add one to get started.</div>';
  if($('sgReportGroup')) $('sgReportGroup').innerHTML='<option value="">All small groups</option>'+groups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');
}
function smallGroupForm(g={}){
  const defaultDept=bibleStudyDept();
  const deptPool=isAdmin()?departments.filter(d=>d.active!==false):departments.filter(d=>String(d.id)===String(currentUser.department_id));
  const deptOptions=deptPool.map(d=>`<option value="${d.id}" ${String(g.department_id??defaultDept?.id??'')===String(d.id)?'selected':''}>${esc(d.name)}</option>`).join('');
  const peopleOptions='<option value="">— Select a member (optional) —</option>'+(canManageSmallGroups()?people:people.filter(allowed)).sort((a,b)=>`${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`)).map(p=>`<option value="${p.id}" ${String(g.leader_person_id??'')===String(p.id)?'selected':''}>${esc(p.first)} ${esc(p.last)}</option>`).join('');
  return `<form id="smallGroupForm"><div class="form-grid">
    <label>Group name <b aria-hidden="true">*</b><input name="name" required value="${esc(g.name||'')}" placeholder="e.g. Amanuel Cell 1"></label>
    <label>Department<select name="department_id">${deptOptions}</select></label>
    <label>Leader (existing member)<select name="leader_person_id">${peopleOptions}</select></label>
    <label>Leader / teacher name<input name="leader_name" value="${esc(g.leader_name||'')}" placeholder="If not yet a member record"></label>
    <label>Meeting day<input name="meeting_day" value="${esc(g.meeting_day||'')}" placeholder="e.g. Wednesday"></label>
    <label>Meeting time<input name="meeting_time" value="${esc(g.meeting_time||'')}" placeholder="e.g. 6:00 PM"></label>
    <label>Location<input name="location" value="${esc(g.location||'')}"></label>
    <label class="wide">Notes<textarea name="notes" rows="2">${esc(g.notes||'')}</textarea></label>
  </div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">${g.id?'Save Changes':'Add Small Group'}</button></div></form>`;
}
async function addSmallGroup(){
  if(!canManageSmallGroups())return;
  openModal('Add Small Group',smallGroupForm());
  $('smallGroupForm').onsubmit=async e=>{e.preventDefault();try{
    const fd=Object.fromEntries(new FormData(e.target));
    const payload={name:fd.name.trim(),department_id:fd.department_id||bibleStudyDept()?.id||null,leader_person_id:fd.leader_person_id||null,leader_name:fd.leader_name?.trim()||null,meeting_day:fd.meeting_day?.trim()||null,meeting_time:fd.meeting_time?.trim()||null,location:fd.location?.trim()||null,notes:fd.notes?.trim()||null,created_by:currentAuth.user.id};
    const {error}=await supabaseClient.from('small_groups').insert(payload);
    if(error)throw error;
    await loadCloudData();closeModal();renderSmallGroups();toast('Small group added.');
  }catch(err){toast(err.message)}}
}
async function editSmallGroup(id){
  const g=smallGroups.find(x=>String(x.id)===String(id));if(!g||!canManageSmallGroups())return;
  openModal('Edit Small Group',smallGroupForm(g));
  $('smallGroupForm').onsubmit=async e=>{e.preventDefault();try{
    const fd=Object.fromEntries(new FormData(e.target));
    const payload={name:fd.name.trim(),department_id:fd.department_id||null,leader_person_id:fd.leader_person_id||null,leader_name:fd.leader_name?.trim()||null,meeting_day:fd.meeting_day?.trim()||null,meeting_time:fd.meeting_time?.trim()||null,location:fd.location?.trim()||null,notes:fd.notes?.trim()||null};
    const {error}=await supabaseClient.from('small_groups').update(payload).eq('id',id);
    if(error)throw error;
    await loadCloudData();closeModal();renderSmallGroups();toast('Small group updated.');
  }catch(err){toast(err.message)}}
}
async function deleteSmallGroup(id){
  if(!canManageSmallGroups())return;
  if(!confirm('Delete this small group? Its members and attendance history will be permanently removed.'))return;
  try{const {error}=await supabaseClient.from('small_groups').delete().eq('id',id);if(error)throw error;await loadCloudData();renderSmallGroups();renderMembers();toast('Small group deleted.');}catch(err){toast(err.message)}
}
function manageSmallGroupMembers(id){
  const g=smallGroups.find(x=>String(x.id)===String(id));if(!g)return;
  const canManage=canManageSmallGroups();
  const currentIds=new Set(smallGroupMembers.filter(m=>String(m.small_group_id)===String(id)).map(m=>String(m.person_id)));
  const pool=(canManage?people:people.filter(allowed)).sort((a,b)=>`${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`));
  const rows=pool.map(p=>{
    const otherGroup=p.small_group_id&&String(p.small_group_id)!==String(id)?smallGroups.find(x=>String(x.id)===String(p.small_group_id)):null;
    return `<label class="member-check-row"><input type="checkbox" name="member_ids" value="${p.id}" ${currentIds.has(String(p.id))?'checked':''} ${canManage?'':'disabled'}><span>${esc(p.first)} ${esc(p.last)}${otherGroup?` <small class="muted">(currently in ${esc(otherGroup.name)}${canManage?' — will move here':''})</small>`:''}</span></label>`;
  }).join('')||'<div class="empty">No members available.</div>';
  openModal(`Members — ${g.name}`,`<form id="smallGroupMembersForm"><input id="sgMemberSearch" placeholder="Search members…" style="margin-bottom:8px;width:100%"><div class="member-check-list" id="sgMemberList">${rows}</div><div class="form-actions">${canManage?'<button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save Members</button>':'<button type="button" class="secondary" onclick="closeModal()">Close</button>'}</div></form>`);
  $('sgMemberSearch').addEventListener('input',()=>{
    const q=$('sgMemberSearch').value.toLowerCase();
    $('sgMemberList').querySelectorAll('.member-check-row').forEach(row=>{row.style.display=row.textContent.toLowerCase().includes(q)?'':'none'});
  });
  if(canManage) $('smallGroupMembersForm').onsubmit=async e=>{e.preventDefault();try{
    const ids=[...e.target.querySelectorAll('input[name="member_ids"]:checked')].map(x=>x.value);
    await saveSmallGroupMembers(id,ids);
    await loadCloudData();closeModal();renderSmallGroups();renderMembers();toast('Small group members updated.');
  }catch(err){toast(err.message)}};
}
async function saveSmallGroupMembers(groupId,personIds){
  let r=await supabaseClient.from('small_group_members').delete().eq('small_group_id',groupId);
  if(r.error)throw r.error;
  if(personIds.length){
    r=await supabaseClient.from('small_group_members').delete().in('person_id',personIds);
    if(r.error)throw r.error;
    r=await supabaseClient.from('small_group_members').insert(personIds.map(person_id=>({small_group_id:groupId,person_id})));
    if(r.error)throw r.error;
  }
}
function manageChoirGroups(){
  if(!(isAdmin()||isChoirAdmin()))return;
  const wc=worshipChoirDept();if(!wc)return;
  const subgroups=departmentSubgroups.filter(sg=>String(sg.department_id)===String(wc.id));
  if(!subgroups.length){toast('No Worship & Choir sub-groups are configured yet.');return}
  const pool=people.filter(allowed).sort((a,b)=>`${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`));
  const rows=pool.map(p=>`<label class="member-check-row"><span>${esc(p.first)} ${esc(p.last)} <small class="muted">${esc(p.member_no||p.id)}</small></span><span>${subgroups.map(sg=>`<label class="checkbox-pill"><input type="checkbox" name="choir_${p.id}" value="${sg.id}" ${(p.subgroup_ids||[]).map(String).includes(String(sg.id))?'checked':''}> ${esc(sg.name)}</label>`).join('')}</span></label>`).join('')||'<div class="empty">No members available.</div>';
  openModal('Choir & Worship Group Membership',`<form id="choirGroupsForm"><input id="choirMemberSearch" placeholder="Search the whole congregation by name or ID…" style="margin-bottom:8px;width:100%"><div class="member-check-list" id="choirMemberList">${rows}</div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save</button></div></form>`);
  $('choirMemberSearch').addEventListener('input',()=>{
    const q=$('choirMemberSearch').value.toLowerCase();
    $('choirMemberList').querySelectorAll('.member-check-row').forEach(row=>{row.style.display=row.textContent.toLowerCase().includes(q)?'':'none'});
  });
  $('choirGroupsForm').onsubmit=async e=>{e.preventDefault();try{
    const assignments={};
    pool.forEach(p=>{assignments[p.id]=[...e.target.querySelectorAll(`input[name="choir_${p.id}"]:checked`)].map(x=>x.value)});
    await saveChoirGroupAssignments(subgroups.map(sg=>sg.id),assignments);
    await loadCloudData();closeModal();renderMembers();toast('Choir & Worship group membership updated.');
  }catch(err){toast(err.message)}};
}
async function saveChoirGroupAssignments(choirSubgroupIds,assignments){
  let r=await supabaseClient.from('person_subgroups').delete().in('subgroup_id',choirSubgroupIds);
  if(r.error)throw r.error;
  const rows=[];
  Object.entries(assignments).forEach(([person_id,subgroupIds])=>{subgroupIds.forEach(subgroup_id=>rows.push({person_id,subgroup_id}))});
  if(rows.length){r=await supabaseClient.from('person_subgroups').insert(rows);if(r.error)throw r.error}
}
function takeSmallGroupAttendance(id){
  if(!canManageSmallGroups())return;
  const g=smallGroups.find(x=>String(x.id)===String(id));if(!g)return;
  const members=people.filter(p=>String(p.small_group_id)===String(id)).sort((a,b)=>`${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`));
  if(!members.length){toast('Add members to this small group first.');return;}
  const today=new Date().toISOString().slice(0,10);
  openModal(`Take Attendance — ${g.name}`,`<form id="sgAttendanceForm"><label>Session date <b aria-hidden="true">*</b><input name="session_date" type="date" required value="${today}"></label><p class="muted">Uncheck anyone who was absent. Saving again for the same date updates that session.</p><div class="member-check-list">${members.map(p=>`<label class="member-check-row"><input type="checkbox" name="present_ids" value="${p.id}" checked><span>${esc(p.first)} ${esc(p.last)}</span></label>`).join('')}</div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save Attendance</button></div></form>`);
  $('sgAttendanceForm').onsubmit=async e=>{e.preventDefault();try{
    const sessionDate=e.target.session_date.value;
    const presentIds=new Set([...e.target.querySelectorAll('input[name="present_ids"]:checked')].map(x=>x.value));
    const existing=await supabaseClient.from('small_group_attendance_sessions').select('id').eq('small_group_id',id).eq('session_date',sessionDate).maybeSingle();
    if(existing.error)throw existing.error;
    let sessionId=existing.data?.id;
    if(!sessionId){
      const ins=await supabaseClient.from('small_group_attendance_sessions').insert({small_group_id:id,session_date:sessionDate,recorded_by:currentAuth.user.id}).select('id').single();
      if(ins.error)throw ins.error;
      sessionId=ins.data.id;
    }
    const records=members.map(p=>({session_id:sessionId,person_id:p.id,present:presentIds.has(String(p.id))}));
    const up=await supabaseClient.from('small_group_attendance_records').upsert(records,{onConflict:'session_id,person_id'});
    if(up.error)throw up.error;
    await loadCloudData();closeModal();renderSmallGroups();renderMembers();toast('Attendance saved.');
  }catch(err){toast(err.message)}};
}
function exportBibleStudyReport(){
  if(typeof XLSX==='undefined'){toast('Excel export library did not load. Check your internet connection and try again.');return}
  const groupId=$('sgReportGroup')?.value||'';
  const months=parseInt($('sgReportPeriod')?.value||'1',10);
  const targetGroups=groupId?smallGroups.filter(g=>String(g.id)===String(groupId)):smallGroups;
  if(!targetGroups.length){toast('No small groups to export.');return}
  const now=new Date(),monthKeys=[];
  for(let i=months-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);monthKeys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
  const wb=XLSX.utils.book_new();
  const usedNames=new Set();
  targetGroups.forEach(g=>{
    const members=people.filter(p=>String(p.small_group_id)===String(g.id)).sort((a,b)=>`${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`));
    const sessions=smallGroupSessions.filter(s=>String(s.small_group_id)===String(g.id)&&monthKeys.includes(monthKeyOf(s.session_date)));
    const header=['Member No','Member Name',...monthKeys.map(mk=>`${mk} Sessions`),...monthKeys.map(mk=>`${mk} Present`),...monthKeys.map(mk=>`${mk} %`),'Overall Sessions','Overall Present','Overall %'];
    const rows=members.map(p=>{
      const perMonthSessions=monthKeys.map(mk=>sessions.filter(s=>monthKeyOf(s.session_date)===mk).length);
      const perMonthPresent=monthKeys.map(mk=>{
        const sIds=new Set(sessions.filter(s=>monthKeyOf(s.session_date)===mk).map(s=>String(s.id)));
        return smallGroupRecords.filter(r=>String(r.person_id)===String(p.id)&&sIds.has(String(r.session_id))&&r.present).length;
      });
      const perMonthPct=perMonthSessions.map((tot,i)=>tot?Math.round(perMonthPresent[i]/tot*100):'');
      const overallSessions=sessions.length,overallPresent=perMonthPresent.reduce((a,b)=>a+b,0);
      const overallPct=overallSessions?Math.round(overallPresent/overallSessions*100):'';
      return [p.member_no,`${p.first} ${p.last}`,...perMonthSessions,...perMonthPresent,...perMonthPct,overallSessions,overallPresent,overallPct];
    });
    let sheetName=(g.name||'Group').replace(/[\\/?*\[\]:]/g,'').slice(0,28)||'Group';
    let n=sheetName,i=2;while(usedNames.has(n)){n=`${sheetName} ${i++}`.slice(0,31);}
    usedNames.add(n);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows.length?[header,...rows]:[header,['No members in this group']]),n);
  });
  const periodLabel=months===1?'1month':`${months}months`;
  XLSX.writeFile(wb,`MKC_Amanuel_bible_study_attendance_${periodLabel}_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function attendanceInPeriod(a){const period=$('attendancePeriod')?.value||'';if(!period)return true;if(!a.attendance_date)return true;const d=new Date(a.attendance_date+'T00:00:00');if(period==='custom'){const from=$('attendanceFrom')?.value,to=$('attendanceTo')?.value;if(from&&d<new Date(from+'T00:00:00'))return false;if(to&&d>new Date(to+'T23:59:59'))return false;return true}const months=parseInt(period,10);const cutoff=new Date();cutoff.setMonth(cutoff.getMonth()-months);return d>=cutoff}
function renderAttendance(){const list=attendance.filter(attendanceInPeriod);$('attendanceList').innerHTML=list.map(a=>{const department=departments.find(d=>String(d.id)===String(a.department_id))?.name||'All Church';const attendee=a.attendee_name?`<b>${esc(a.attendee_name)}</b>${a.father_name?` <small>(Father: ${esc(a.father_name)})</small>`:''}`:`<b>${esc(a.service_name)}</b>`;const status=a.attendee_name?'<span class="badge green">Present</span>':`<span class="badge green">${a.present_count} present</span> <span class="badge red">${a.absent_count} absent</span>`;return `<div class="dept-line"><span>${attendee}<br><small>${esc(a.attendance_date)} • ${esc(a.service_name)} • ${esc(department)}</small></span><span>${status}</span></div>`}).join('')||'<div class="empty">No attendance records match this period.</div>'}
function canRequestEventDeletion(e){if(!e.department_id)return false;if(isAdmin())return true;return currentUser?.role==='department_user'&&String(e.department_id)===String(currentUser.department_id)}
function renderEvents(){
  const cards=events.map(e=>`<div class="event-card"><span class="date">${esc(e.event_date)}${e.start_time?' • '+esc(e.start_time):''}</span><h3>${esc(e.title)}</h3><p>${esc(e.department_name||'All Church')} • ${esc(e.location||'')}</p>${canRequestEventDeletion(e)?`<div class="form-actions"><button class="danger" onclick="requestEventDeletion('${e.id}')">Request deletion</button></div>`:''}</div>`).join('')||'<div class="empty">No events.</div>';
  const requests=currentUser?.role==='super_admin'?eventDeletionRequests.map(r=>`<div class="dept-line"><span><b>${esc(r.event_title)}</b>${r.department_name?` <small>(${esc(r.department_name)})</small>`:''}<br><small>Requested reason: ${esc(r.justification)}${r.rejection_reason?` · Rejection reason: ${esc(r.rejection_reason)}`:''}</small></span><span>${requestStatus(r)} ${r.status==='pending'?`<button onclick="reviewEventDeletion('${r.id}','approved')">Approve & permanently delete</button><button onclick="reviewEventDeletion('${r.id}','rejected')">Reject</button>`:''}</span></div>`).join('')||'<div class="empty">No deletion requests.</div>':'';
  $('eventGrid').innerHTML=cards+(currentUser?.role==='super_admin'?`<div class="panel"><h3>Deletion requests</h3>${requests}</div>`:'');
}
async function requestEventDeletion(eventId){
  const event=events.find(e=>String(e.id)===String(eventId));
  if(!event||!canRequestEventDeletion(event))return;
  openModal(`Request deletion: ${event.title}`,`<form id="eventDeletionForm"><p class="muted">Deletion requires Super Admin approval. Approval permanently removes this event.</p><label>Reason<textarea name="justification" rows="4" required minlength="5" placeholder="Explain why this event should be deleted."></textarea></label><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="danger">Submit request</button></div></form>`);
  $('eventDeletionForm').onsubmit=async e=>{e.preventDefault();try{const justification=new FormData(e.target).get('justification').trim();const {error}=await supabaseClient.rpc('request_event_deletion',{target_event_id:eventId,request_justification:justification});if(error)throw error;await loadCloudData();closeModal();renderEvents();toast('Event deletion request submitted.');}catch(err){toast(err.message)}};
}
async function reviewEventDeletion(requestId,decision){
  if(currentUser?.role!=='super_admin')return;
  const rejectionReason=decision==='rejected'?prompt('Give the reason for rejecting this deletion request:'):'';
  if(decision==='rejected'&&!rejectionReason?.trim()){toast('A rejection reason is required.');return;}
  if(decision==='approved'&&!confirm('Approve this request? The event will be permanently deleted.'))return;
  try{const {error}=await supabaseClient.rpc('review_event_deletion',{request_id:requestId,decision,rejection_reason:rejectionReason?.trim()||null});if(error)throw error;await loadCloudData();renderEvents();toast(decision==='approved'?'Event permanently deleted.':'Deletion request rejected.');}catch(err){toast(err.message)}
}
function renderFollowup(){const bsf=isBibleStudyAdmin()?($('followupBibleStudyFilter')?.value||''):'';const visible=followups.filter(f=>f.people&&allowed(f.people)).filter(f=>!bsf||(f.people.bibleStudyStatus||'red')===bsf);$('followupTable').innerHTML=visible.map(f=>`<tr><td><b>${esc(f.people?.first||'')} ${esc(f.people?.last||'')}</b></td><td>${bibleStatusDot(f.people?.bibleStudyStatus||'red')}</td><td>${esc(f.reason)}${f.status==='closed'&&f.closed_reason?`<br><small class="muted">Closed: ${esc(f.closed_reason)}</small>`:''}</td><td>${esc(f.assigned_profile?.full_name||'Unassigned')}</td><td>${esc(f.last_contact||'—')}</td><td><span class="badge ${f.status==='open'?'red':'green'}">${esc(f.status)}</span></td><td class="row-actions"><button onclick="toggleFollowup('${f.id}','${f.status}')">${f.status==='open'?'Close':'Reopen'}</button>${f.status==='closed'&&currentUser?.role==='super_admin'?`<button class="danger" onclick="deleteFollowupCase('${f.id}')">Delete permanently</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7"><div class="empty">No follow-up cases.</div></td></tr>'}
async function toggleFollowup(id,status){
  const next=status==='open'?'closed':'open';
  const patch={status:next};
  if(next==='closed'){
    const reason=prompt('Reason for closing this follow-up case:');
    if(!reason?.trim()){toast('A closing reason is required.');return}
    patch.closed_reason=reason.trim();
  }
  const {error}=await supabaseClient.from('follow_up_cases').update(patch).eq('id',id);
  if(error){toast(error.message);return}
  await loadCloudData();renderFollowup();renderDashboard();
}
function renderReports(){const visible=people.filter(allowed);$('reportCards').innerHTML=[['People',visible.length,'Registered people'],['Children',visible.filter(p=>ageGroup(ageOf(p.dob))==='Children').length,'Under 13'],['Youth',visible.filter(p=>ageGroup(ageOf(p.dob))==='Youth').length,'Age 13–24'],['Adults',visible.filter(p=>ageGroup(ageOf(p.dob))==='Adult').length,'Age 25–59'],['Seniors',visible.filter(p=>ageGroup(ageOf(p.dob))==='Senior').length,'Age 60+'],['Visitors',visible.filter(p=>p.status==='Visitor').length,'Current visitor records']].map(x=>`<div class="report-card"><span class="eyebrow">${x[0]}</span><strong>${x[1]}</strong><p>${x[2]}</p></div>`).join('');$('periodReportResults').innerHTML=''}
function reportDateRange(){
  const period=$('reportPeriod').value;
  let from,to;
  if(period==='custom'){
    from=$('reportFrom').value?new Date($('reportFrom').value+'T00:00:00'):null;
    to=$('reportTo').value?new Date($('reportTo').value+'T23:59:59'):null;
    if(!from||!to)return null;
  } else {
    to=new Date();
    from=new Date();
    from.setMonth(from.getMonth()-Number(period));
  }
  return {from,to};
}
function renderPeriodReport(){
  const range=reportDateRange();
  if(!range){toast('Choose both a from and to date.');return}
  const {from,to}=range;
  const inRange=iso=>{if(!iso)return false;const d=new Date(iso);return d>=from&&d<=to};

  const eventsInRange=events.filter(e=>inRange(e.event_date));
  const addedPeople=people.filter(allowed).filter(p=>inRange(p.created_at));
  const closedCases=followups.filter(f=>f.people&&allowed(f.people)&&f.status==='closed'&&inRange(f.closed_at));
  const canSeeRemovals=isAdmin();
  const removedPeople=canSeeRemovals?peopleAuditLogs.filter(a=>a.action==='DELETE'&&inRange(a.created_at)):null;

  const cards=[
    ['Events', eventsInRange.length, 'Events in this period'],
    ['People Added', addedPeople.length, 'New member records created'],
    ['People Removed', canSeeRemovals?removedPeople.length:'—', canSeeRemovals?'Member records permanently deleted':'Administrative roles only'],
    ['Follow-up Closed', closedCases.length, 'Cases closed in this period'],
  ].map(x=>`<div class="report-card"><span class="eyebrow">${x[0]}</span><strong>${x[1]}</strong><p>${x[2]}</p></div>`).join('');

  const rangeLabel=`${from.toISOString().slice(0,10)} to ${to.toISOString().slice(0,10)}`;
  const eventsList=eventsInRange.length?`<div class="panel"><h3>Events (${rangeLabel})</h3>${eventsInRange.map(e=>`<div class="dept-line"><span><b>${esc(e.title)}</b><br><small>${esc(e.event_date)} • ${esc(e.department_name||'All Church')}</small></span></div>`).join('')}</div>`:'';
  const closedList=closedCases.length?`<div class="panel"><h3>Follow-up cases closed (${rangeLabel})</h3>${closedCases.map(f=>`<div class="dept-line"><span><b>${esc(f.people?.first||'')} ${esc(f.people?.last||'')}</b><br><small>Opened: ${esc(f.reason)}${f.closed_reason?` · Closed: ${esc(f.closed_reason)}`:''}</small></span><span class="muted">${esc((f.closed_at||'').slice(0,10))}</span></div>`).join('')}</div>`:'';

  $('periodReportResults').innerHTML=`<div class="report-grid">${cards}</div>${eventsList}${closedList}`;
}
function exportPeriodReportXLSX(){
  if(typeof XLSX==='undefined'){toast('Excel export library did not load. Check your internet connection and try again.');return}
  const range=reportDateRange();
  if(!range){toast('Choose both a from and to date.');return}
  const {from,to}=range;
  const inRange=iso=>{if(!iso)return false;const d=new Date(iso);return d>=from&&d<=to};

  const eventsInRange=events.filter(e=>inRange(e.event_date));
  // "Follow-up cases done at that period" = cases opened in the period (whatever their
  // current status) plus cases closed in the period — so open and closed activity from
  // the period both show up, even if a case opened earlier was only closed just now.
  const followupsInRange=followups.filter(f=>f.people&&allowed(f.people)&&(inRange(f.created_at)||(f.status==='closed'&&inRange(f.closed_at))));

  if(!eventsInRange.length&&!followupsInRange.length){toast('No events or follow-up cases in this period.');return}

  const rangeLabel=`${from.toISOString().slice(0,10)} to ${to.toISOString().slice(0,10)}`;

  const summarySheet=XLSX.utils.aoa_to_sheet([
    ['Meserete Kristos Church — Amanuel Local Church'],
    ['Period Report'],
    ['Period', rangeLabel],
    ['Generated', new Date().toISOString().slice(0,19).replace('T',' ')+' UTC'],
    ['Generated by', currentUser?.full_name||''],
    [],
    ['Events in period', eventsInRange.length],
    ['Follow-up cases in period', followupsInRange.length],
    ['  — Open', followupsInRange.filter(f=>f.status==='open').length],
    ['  — Closed', followupsInRange.filter(f=>f.status==='closed').length],
  ]);
  summarySheet['!cols']=[{wch:30},{wch:28}];

  const eventsRows=[
    ['Date','Department','Issue','Details','Location','Time'],
    ...eventsInRange.map(e=>[e.event_date||'',e.department_name||'All Church',e.title||'',e.description||'',e.location||'',e.start_time||''])
  ];
  const eventsSheet=XLSX.utils.aoa_to_sheet(eventsRows);
  eventsSheet['!cols']=[{wch:12},{wch:22},{wch:30},{wch:42},{wch:20},{wch:8}];

  const followupRows=[
    ['Person','Department','Issue / Reason','Assigned To','Status','Date Opened','Last Contact','Date Closed','Closed Reason'],
    ...followupsInRange.map(f=>[
      `${f.people?.first||''} ${f.people?.last||''}`.trim(),
      f.people?.dept||'',
      f.reason||'',
      f.assigned_profile?.full_name||'Unassigned',
      f.status==='closed'?'Closed':'Open',
      (f.created_at||'').slice(0,10),
      f.last_contact||'',
      f.status==='closed'?(f.closed_at||'').slice(0,10):'',
      f.status==='closed'?(f.closed_reason||''):''
    ])
  ];
  const followupSheet=XLSX.utils.aoa_to_sheet(followupRows);
  followupSheet['!cols']=[{wch:20},{wch:18},{wch:28},{wch:18},{wch:10},{wch:12},{wch:12},{wch:12},{wch:32}];

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,summarySheet,'Summary');
  XLSX.utils.book_append_sheet(wb,eventsSheet,'Events');
  XLSX.utils.book_append_sheet(wb,followupSheet,'Follow-up Cases');

  XLSX.writeFile(wb,`MKC_Amanuel_Period_Report_${from.toISOString().slice(0,10)}_to_${to.toISOString().slice(0,10)}.xlsx`);
}
function renderUsers(){$('usersTable').innerHTML=profiles.map(p=>`<tr><td><b>${esc(p.full_name)}</b><br><small>${esc(p.id)}</small></td><td>${esc(roleLabel(p.role))}</td><td>${esc(p.department_name||'All Church')}</td><td>${p.role==='super_admin'?'Full access':p.role==='department_user'?'Assigned department':p.role==='viewer'?'No member write access':'Church records & reports'}</td><td><span class="badge ${p.active?'green':'red'}">${p.active?'Active':'Inactive'}</span></td></tr>`).join('')||'<tr><td colspan="5">No profiles found.</td></tr>'}
function exportCSV(){if(currentUser?.role==='viewer'||isBibleStudyAdmin()){toast('This role cannot export member records.');return}const rows=people.filter(allowed);const headers=['ID','First Name','Last Name','DOB','Age','Age Group','Gender','Phone','Email','Department','Choir/Worship Group','Status','Membership Date','Baptism Date','Emergency Contact','Emergency Phone','Address','Guardian','Notes'];const lines=[headers,...rows.map(p=>[p.member_no,p.first,p.last,p.dob,ageOf(p.dob),ageGroup(ageOf(p.dob)),p.gender,p.phone,p.email,p.dept,personSubgroupNames(p).join(', '),p.status,p.membership,p.baptism_date,p.emergency,p.emergencyPhone,p.address,p.guardian,p.notes])].map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','));const blob=new Blob([lines.join('\n')],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='MKC_Amanuel_people.csv';a.click();URL.revokeObjectURL(a.href)}
function exportMembersXLSX(){
  if(currentUser?.role==='viewer'||isBibleStudyAdmin()){toast('This role cannot export member records.');return}
  if(typeof XLSX==='undefined'){toast('Excel export library did not load. Check your internet connection and try again.');return}
  const rows=currentMemberList&&currentMemberList.length?currentMemberList:people.filter(allowed);
  if(!rows.length){toast('No records match the current filters.');return}
  const headers=['ID','First Name','Last Name','DOB','Age','Age Group','Gender','Phone','Email','Department','Choir/Worship Group','Status','Membership Date','Baptism Date','Emergency Contact','Emergency Phone','Address','Guardian','Notes'];
  const aoa=[headers,...rows.map(p=>[p.member_no,p.first,p.last,p.dob,ageOf(p.dob),ageGroup(ageOf(p.dob)),p.gender,p.phone,p.email,p.dept,personSubgroupNames(p).join(', '),p.status,p.membership,p.baptism_date,p.emergency,p.emergencyPhone,p.address,p.guardian,p.notes])];
  const sheet=XLSX.utils.aoa_to_sheet(aoa);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,sheet,'Filtered People');
  const q=($('memberSearch')?.value||'').trim(),ag=$('ageFilter')?.value||'',dp=$('deptFilter')?.value||'',sg=$('subgroupFilter')?.value||'',st=$('statusFilter')?.value||'';
  const deptName=dp?(departments.find(d=>String(d.id)===String(dp))?.name||''):'';
  const subgroupNameFilter=sg?subgroupName(sg):'';
  const filterNote=[['Applied filters:'],['Search',q||'—'],['Age group',ag||'All'],['Department',deptName||'All'],['Choir/Worship group',subgroupNameFilter||'All'],['Status',st||'All'],['Records exported',rows.length]];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(filterNote),'Filters used');
  XLSX.writeFile(wb,`MKC_Amanuel_people_filtered_${new Date().toISOString().slice(0,10)}.xlsx`);
}
async function deleteMemberDeletionRequest(requestId){
  if(currentUser?.role!=='super_admin')return;
  if(!confirm('Permanently remove this deletion request record? This cannot be undone.'))return;
  try{
    const {error}=await supabaseClient.rpc('delete_member_deletion_request',{request_id:requestId});
    if(error)throw error;
    await loadCloudData();renderMembers();toast('Deletion request record permanently removed.');
  }catch(err){toast(err.message)}
}
async function deleteFollowupCase(id){
  if(currentUser?.role!=='super_admin')return;
  if(!confirm('Permanently delete this closed follow-up case? This cannot be undone.'))return;
  try{
    const {error}=await supabaseClient.from('follow_up_cases').delete().eq('id',id);
    if(error)throw error;
    await loadCloudData();renderFollowup();renderDashboard();toast('Follow-up case permanently deleted.');
  }catch(err){toast(err.message)}
}
async function addAttendance(){if(currentUser.role==='viewer')return;const availableDepartments=currentUser.role==='department_user'?departments.filter(d=>String(d.id)===String(currentUser.department_id)):departments;const departmentOptions=availableDepartments.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');openModal('Record Attendance',`<form id="attForm"><div class="form-grid"><label>Attendee name<input name="attendee_name" required placeholder="Full name"></label><label>Father’s name<input name="father_name" required placeholder="Father’s full name"></label><label>Date<input name="attendance_date" type="date" required value="${new Date().toISOString().slice(0,10)}"></label><label>Service<input name="service_name" required value="Sunday Worship"></label><label>Department<select name="department_id" required>${departmentOptions}</select></label></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save Attendance</button></div></form>`);$('attForm').onsubmit=async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));if(currentUser.role==='department_user')f.department_id=currentUser.department_id;f.attendee_name=f.attendee_name.trim();f.father_name=f.father_name.trim();f.present_count=1;f.absent_count=0;f.recorded_by=currentAuth.user.id;const {error}=await supabaseClient.from('attendance').insert(f);if(error)throw error;await loadCloudData();closeModal();renderAttendance();toast('Attendance saved.')}catch(err){toast(err.message)}}}
async function addEvent(){if(currentUser.role==='viewer')return;const eventDepartments=currentUser.role==='department_user'?departments.filter(d=>String(d.id)===String(currentUser.department_id)):departments;const eventOptions=(currentUser.role==='department_user'?'':`<option value="">All Church</option>`)+eventDepartments.filter(d=>d.active!==false).map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');openModal('Add Event',`<form id="eventForm"><div class="form-grid"><label>Event title<input name="title" required></label><label>Date<input name="event_date" type="date" required></label><label>Time<input name="start_time" type="time"></label><label>Department<select name="department_id" ${currentUser.role==='department_user'?'required':''}>${eventOptions}</select></label><label>Location<input name="location"></label><label>Description<textarea name="description" rows="3"></textarea></label></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save Event</button></div></form>`);$('eventForm').onsubmit=async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));if(currentUser.role==='department_user')f.department_id=currentUser.department_id;else if(!f.department_id)f.department_id=null;f.created_by=currentAuth.user.id;const {error}=await supabaseClient.from('events').insert(f);if(error)throw error;await loadCloudData();closeModal();renderEvents();toast('Event added.')}catch(err){toast(err.message)}}}
async function addFollowup(){if(currentUser.role==='viewer')return;const visible=people.filter(allowed);const assignees=isAdmin()?profiles.filter(p=>p.active):profiles.filter(p=>p.active&&p.id===currentAuth.user.id);openModal('Add Follow-up Case',`<form id="followForm"><div class="form-grid"><label>Person<select name="person_id" required>${visible.map(p=>`<option value="${p.id}">${esc(p.first)} ${esc(p.last)} — ${esc(p.member_no)}</option>`).join('')}</select></label><label>Reason<input name="reason" placeholder="Visitor, new believer, pastoral care…" required></label><label>Assigned to<select name="assigned_to"><option value="">Unassigned</option>${assignees.map(p=>`<option value="${p.id}">${esc(p.full_name)}</option>`).join('')}</select></label><label>Last contact<input name="last_contact" type="date"></label><label>Status<select name="status"><option value="open">Open</option><option value="closed">Closed</option></select></label><label>Notes<textarea name="notes" rows="3"></textarea></label></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save Case</button></div></form>`);$('followForm').onsubmit=async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));if(!f.assigned_to)f.assigned_to=null;f.created_by=currentAuth.user.id;const {error}=await supabaseClient.from('follow_up_cases').insert(f);if(error)throw error;await loadCloudData();closeModal();renderFollowup();renderDashboard();toast('Follow-up case saved.')}catch(err){toast(err.message)}}}
async function manageMFA(){const factors=await supabaseClient.auth.mfa.listFactors();const verified=(factors.data?.totp||[]).find(x=>x.status==='verified');if(verified){openModal('Multi-Factor Authentication',`<p>MFA is enabled for this account.</p><div class="form-actions"><button class="secondary" onclick="closeModal()">Close</button><button class="danger" onclick="disableMFA('${verified.id}')">Disable MFA</button></div>`);return}openModal('Enable MFA',`<p>Use an authenticator app such as Microsoft Authenticator, Google Authenticator or Authy.</p><div id="mfaBox"><button class="primary" id="startMFA">Generate authenticator setup</button></div>`);$('startMFA').onclick=async()=>{try{const r=await supabaseClient.auth.mfa.enroll({factorType:'totp',friendlyName:'MKC Amanuel Church Portal'});if(r.error)throw r.error;const q=r.data; $('mfaBox').innerHTML=`<img src="${q.totp.qr_code}" alt="MFA QR code" style="max-width:220px;display:block;margin:12px auto"><p class="muted">If you cannot scan the QR code, use secret: <b>${esc(q.totp.secret)}</b></p><input id="mfaCode" inputmode="numeric" maxlength="6" placeholder="6-digit code"><button class="primary full" id="verifyMFA">Verify and enable</button>`;$('verifyMFA').onclick=async()=>{const ch=await supabaseClient.auth.mfa.challenge({factorId:q.id});if(ch.error){toast(ch.error.message);return}const vr=await supabaseClient.auth.mfa.verify({factorId:q.id,challengeId:ch.data.id,code:$('mfaCode').value.trim()});if(vr.error){toast(vr.error.message);return}closeModal();toast('MFA enabled successfully.')}}catch(err){toast(err.message)}}}
async function disableMFA(id){const r=await supabaseClient.auth.mfa.unenroll({factorId:id});if(r.error){toast(r.error.message);return}closeModal();toast('MFA disabled. Enable it again before production use.')}
function addUser(){if(currentUser?.role!=='super_admin'){toast('Only a Super Admin can create portal users.');return;}const departmentOptions='<option value="">No department</option>'+departments.filter(d=>d.active!==false).map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');openModal('Create Portal User',`<form id="createUserForm"><p class="muted">This creates a sign-in account, password, role, and department in one step.</p><div class="form-grid"><label>Full name<input name="full_name" required></label><label>Email address<input name="email" type="email" required></label><label>Temporary password<input name="password" type="password" minlength="8" required placeholder="At least 8 characters"></label><label>Role<select name="role" required><option value="viewer">Viewer</option><option value="department_user">Department User</option><option value="secretary">Secretary</option><option value="pastor">Pastor / Leadership</option><option value="super_admin">Super Admin</option></select></label><label>Department<select name="department_id">${departmentOptions}</select><small>Required for Department User.</small></label></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Create User</button></div></form>`);$('createUserForm').onsubmit=async e=>{e.preventDefault();try{const payload=Object.fromEntries(new FormData(e.target));if(payload.role==='department_user'&&!payload.department_id)throw new Error('Choose a department for a Department User.');const {data,error}=await supabaseClient.functions.invoke('admin-create-user',{body:payload});if(error)throw error;if(data?.error)throw new Error(data.error);await loadCloudData();closeModal();renderUsers();toast(`Portal user created for ${data.email}.`);}catch(err){toast(err.message||'Could not create user.')}}}
function isSuperAdmin(){return currentUser?.role==='super_admin'}
function isPrimarySuperAdmin(){return isSuperAdmin()&&(currentAuth?.user?.email||'').toLowerCase()==='fekaduendrias@gmail.com'}
function switchContentTab(tab){document.querySelectorAll('.content-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.content-panel').forEach(p=>p.classList.add('hidden'));$(tab+'Tab').classList.remove('hidden')}
function renderContentView(){if(!isSuperAdmin()){$('contentView').innerHTML='<div class="empty">Only Super Admins can manage website content.</div>';return}renderUpdatesAdmin();renderSermonsAdmin();renderFeaturedEvents();renderContactAdmin();renderLeadersAdmin();renderScheduleAdmin()}
async function uploadContentImage(file){if(!file)return null;const path=`${Date.now()}-${file.name}`.replace(/[^a-zA-Z0-9.\-_]/g,'_');const {error}=await supabaseClient.storage.from('site-content').upload(path,file,{cacheControl:'3600',upsert:false});if(error)throw error;const {data}=supabaseClient.storage.from('site-content').getPublicUrl(path);return data.publicUrl}
async function uploadSermonMedia(file){if(!file)return null;const MAX=104857600;if(file.size>MAX)throw new Error('That file is larger than 100MB. Please upload a shorter clip, or use an external link instead.');const path=`${Date.now()}-${file.name}`.replace(/[^a-zA-Z0-9.\-_]/g,'_');const {error}=await supabaseClient.storage.from('sermon-media').upload(path,file,{cacheControl:'3600',upsert:false});if(error)throw error;const {data}=supabaseClient.storage.from('sermon-media').getPublicUrl(path);return data.publicUrl}

function renderUpdatesAdmin(){$('updatesAdminGrid').innerHTML=dailyUpdates.map(u=>`<div class="admin-content-card">${u.image_url?`<img src="${esc(u.image_url)}" alt="" class="admin-content-thumb">`:''}<div class="admin-content-body"><span class="badge ${u.published?'green':''}">${u.published?'Published':'Draft'}</span><h3>${esc(u.title)}</h3><p>${esc((u.body||'').slice(0,140))}${(u.body||'').length>140?'…':''}</p><div class="row-actions"><button onclick="editUpdate('${u.id}')">Edit</button><button onclick="togglePublishUpdate('${u.id}',${u.published})">${u.published?'Unpublish':'Publish'}</button><button class="danger" onclick="deleteUpdate('${u.id}')">Delete</button></div></div></div>`).join('')||'<div class="empty">No daily updates yet.</div>'}
function updateForm(u={}){return `<form id="updateForm"><div class="form-grid"><label>Title<input name="title" required value="${esc(u.title||'')}"></label><label>Body<textarea name="body" rows="5" required>${esc(u.body||'')}</textarea></label><label>Photo (optional)<input name="image" type="file" accept="image/*"></label>${u.image_url?`<p class="muted">Current photo: <a href="${esc(u.image_url)}" target="_blank" rel="noopener">view</a> (uploading a new one replaces it)</p>`:''}</div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">${u.id?'Save Changes':'Save Update'}</button></div></form>`}
function addUpdate(){if(!isSuperAdmin())return;openModal('New Daily Update',updateForm());$('updateForm').onsubmit=async e=>{e.preventDefault();try{const fd=new FormData(e.target);const file=fd.get('image');let image_url=null;if(file&&file.size)image_url=await uploadContentImage(file);const {error}=await supabaseClient.from('daily_updates').insert({title:fd.get('title').trim(),body:fd.get('body').trim(),image_url,created_by:currentAuth.user.id});if(error)throw error;await loadCloudData();closeModal();renderUpdatesAdmin();toast('Daily update saved as a draft. Publish it to show it on the website.')}catch(err){toast(err.message)}}}
function editUpdate(id){const u=dailyUpdates.find(x=>String(x.id)===String(id));if(!u)return;openModal('Edit Daily Update',updateForm(u));$('updateForm').onsubmit=async e=>{e.preventDefault();try{const fd=new FormData(e.target);const file=fd.get('image');const patch={title:fd.get('title').trim(),body:fd.get('body').trim(),updated_by:currentAuth.user.id};if(file&&file.size)patch.image_url=await uploadContentImage(file);const {error}=await supabaseClient.from('daily_updates').update(patch).eq('id',id);if(error)throw error;await loadCloudData();closeModal();renderUpdatesAdmin();toast('Daily update saved.')}catch(err){toast(err.message)}}}
async function togglePublishUpdate(id,published){if(!isSuperAdmin())return;const next=!published;const {error}=await supabaseClient.from('daily_updates').update({published:next,published_at:next?new Date().toISOString():null}).eq('id',id);if(error){toast(error.message);return}await loadCloudData();renderUpdatesAdmin();toast(next?'Update is now live on the website.':'Update removed from the website.')}
async function deleteUpdate(id){if(!isSuperAdmin())return;if(!confirm('Delete this daily update? This cannot be undone.'))return;const {error}=await supabaseClient.from('daily_updates').delete().eq('id',id);if(error){toast(error.message);return}await loadCloudData();renderUpdatesAdmin();toast('Daily update deleted.')}

function renderSermonsAdmin(){$('sermonsAdminGrid').innerHTML=sermons.map(s=>`<div class="admin-content-card"><div class="admin-content-body"><span class="badge ${s.published?'green':''}">${s.published?'Published':'Draft'}</span><h3>${esc(s.title)}</h3><p class="muted">${esc(s.speaker||'')} • ${esc(s.scripture_reference||'')} • ${esc(s.sermon_date||'')}</p><p>${esc((s.summary||'').slice(0,140))}${(s.summary||'').length>140?'…':''}</p><div class="row-actions"><button onclick="editSermon('${s.id}')">Edit</button><button onclick="togglePublishSermon('${s.id}',${s.published})">${s.published?'Unpublish':'Publish'}</button><button class="danger" onclick="deleteSermon('${s.id}')">Delete</button></div></div></div>`).join('')||'<div class="empty">No sermons yet.</div>'}
function sermonForm(s={}){const isUpload=s.media_url&&!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be|facebook\.com|fb\.watch)/i.test(s.media_url);return `<form id="sermonForm"><div class="form-grid"><label>Title<input name="title" required value="${esc(s.title||'')}"></label><label>Speaker<input name="speaker" value="${esc(s.speaker||'')}"></label><label>Scripture reference<input name="scripture_reference" placeholder="e.g. 1 Corinthians 3:11" value="${esc(s.scripture_reference||'')}"></label><label>Date<input name="sermon_date" type="date" required value="${s.sermon_date||new Date().toISOString().slice(0,10)}"></label><label>Media type<select name="media_type"><option value="">None</option><option value="video" ${s.media_type==='video'?'selected':''}>Video</option><option value="audio" ${s.media_type==='audio'?'selected':''}>Audio</option></select></label><label>External link (YouTube, Facebook, etc. — optional)<input name="media_url" type="url" placeholder="https://…" value="${esc(s.media_url||'')}"></label><label>Or upload a short clip from your device (optional, max 100MB)<input name="media_file" type="file" accept="video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/ogg"></label>${isUpload?`<p class="muted">Current uploaded file: <a href="${esc(s.media_url)}" target="_blank" rel="noopener">view</a> (uploading a new one replaces it)</p>`:''}<label>Summary<textarea name="summary" rows="4" placeholder="Short text summary of the message">${esc(s.summary||'')}</textarea></label></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">${s.id?'Save Changes':'Save Sermon'}</button></div></form>`}
function addSermon(){if(!isSuperAdmin())return;openModal('New Sermon / Teaching',sermonForm());$('sermonForm').onsubmit=async e=>{e.preventDefault();try{const fd=new FormData(e.target);const file=fd.get('media_file');const payload={title:fd.get('title').trim(),speaker:fd.get('speaker').trim()||null,scripture_reference:fd.get('scripture_reference').trim()||null,sermon_date:fd.get('sermon_date'),media_type:fd.get('media_type')||null,media_url:fd.get('media_url').trim()||null,summary:fd.get('summary').trim()||null,created_by:currentAuth.user.id};if(file&&file.size){payload.media_url=await uploadSermonMedia(file);payload.media_type=file.type.startsWith('audio')?'audio':'video';}const {error}=await supabaseClient.from('sermons').insert(payload);if(error)throw error;await loadCloudData();closeModal();renderSermonsAdmin();toast('Sermon saved as a draft. Publish it to show it on the website.')}catch(err){toast(err.message)}}}
function editSermon(id){if(!isSuperAdmin())return;const s=sermons.find(x=>String(x.id)===String(id));if(!s)return;openModal('Edit Sermon / Teaching',sermonForm(s));$('sermonForm').onsubmit=async e=>{e.preventDefault();try{const fd=new FormData(e.target);const file=fd.get('media_file');const patch={title:fd.get('title').trim(),speaker:fd.get('speaker').trim()||null,scripture_reference:fd.get('scripture_reference').trim()||null,sermon_date:fd.get('sermon_date'),media_type:fd.get('media_type')||null,media_url:fd.get('media_url').trim()||null,summary:fd.get('summary').trim()||null,updated_by:currentAuth.user.id};if(file&&file.size){patch.media_url=await uploadSermonMedia(file);patch.media_type=file.type.startsWith('audio')?'audio':'video';}const {error}=await supabaseClient.from('sermons').update(patch).eq('id',id);if(error)throw error;await loadCloudData();closeModal();renderSermonsAdmin();toast('Sermon saved.')}catch(err){toast(err.message)}}}
async function togglePublishSermon(id,published){const next=!published;const {error}=await supabaseClient.from('sermons').update({published:next,published_at:next?new Date().toISOString():null}).eq('id',id);if(error){toast(error.message);return}await loadCloudData();renderSermonsAdmin();toast(next?'Sermon is now live on the website.':'Sermon removed from the website.')}
async function deleteSermon(id){if(!isSuperAdmin())return;if(!confirm('Delete this sermon? This cannot be undone.'))return;const {error}=await supabaseClient.from('sermons').delete().eq('id',id);if(error){toast(error.message);return}await loadCloudData();renderSermonsAdmin();toast('Sermon deleted.')}

function renderFeaturedEvents(){$('featuredEventsList').innerHTML=events.map(e=>`<div class="admin-content-card"><div class="admin-content-body"><span class="badge ${e.published?'green':''}">${e.published?'Featured on website':'Not featured'}</span><h3>${esc(e.title)}</h3><p class="muted">${esc(e.event_date)}${e.start_time?' • '+esc(e.start_time):''} • ${esc(e.department_name||'All Church')}</p><div class="row-actions"><button onclick="toggleEventPublish('${e.id}',${!!e.published})">${e.published?'Remove from website':'Feature on website'}</button></div></div></div>`).join('')||'<div class="empty">No events yet — add one in the Events module first.</div>'}
async function toggleEventPublish(id,published){if(!isSuperAdmin())return;const next=!published;const {error}=await supabaseClient.from('events').update({published:next,published_at:next?new Date().toISOString():null}).eq('id',id);if(error){toast(error.message);return}await loadCloudData();renderFeaturedEvents();toast(next?'Event featured on the public website.':'Event removed from the public website.')}

// ---- Contact Info (address / phone / email) — fekaduendrias@gmail.com only ----
function renderContactAdmin(){
  const locked=!isPrimarySuperAdmin();
  const field=(key,label,value)=>`<label>${label}<input name="${key}" value="${esc(value||'')}" ${locked?'disabled':''}></label>`;
  $('contactAdminBody').innerHTML=`${locked?'<p class="muted">Only the primary Super Admin can edit contact information. You can view the current values below.</p>':''}<form id="contactForm"><div class="form-grid">${field('address_line','Address',siteSettings.address_line)}${field('address_note','Address note',siteSettings.address_note)}${field('phone','Phone',siteSettings.phone)}${field('email','Email',siteSettings.email)}</div>${locked?'':'<div class="form-actions"><button class="primary">Save Contact Info</button></div>'}</form>`;
  if(locked)return;
  $('contactForm').onsubmit=async e=>{e.preventDefault();try{const fd=new FormData(e.target);const rows=[...fd.entries()].map(([key,value])=>({key,value:String(value).trim(),updated_by:currentAuth.user.id}));const {error}=await supabaseClient.from('site_settings').upsert(rows,{onConflict:'key'});if(error)throw error;await loadCloudData();renderContactAdmin();toast('Contact info updated on the website.')}catch(err){toast(err.message)}}
}

// ---- Leadership Team — any Super Admin ----
function renderLeadersAdmin(){
  const deptOptions='<option value="">No department</option>'+departments.filter(d=>d.active!==false).map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');
  $('leadersAdminGrid').dataset.deptOptions=deptOptions;
  $('leadersAdminGrid').innerHTML=leaders.map(l=>`<div class="admin-content-card"><div class="admin-content-body"><span class="badge ${l.active?'green':''}">${l.active?'Visible':'Hidden'}</span><h3>${esc(l.full_name)}</h3><p>${esc(l.title)}${l.department_name?' • '+esc(l.department_name):''}</p><div class="row-actions"><button onclick="editLeader('${l.id}')">Edit</button><button class="danger" onclick="deleteLeader('${l.id}')">Delete</button></div></div></div>`).join('')||'<div class="empty">No leaders yet.</div>';
}
function leaderForm(l={}){const deptOptions='<option value="">No department</option>'+departments.filter(d=>d.active!==false).map(d=>`<option value="${d.id}" ${String(l.department_id||'')===String(d.id)?'selected':''}>${esc(d.name)}</option>`).join('');return `<form id="leaderForm"><div class="form-grid"><label>Full name<input name="full_name" required value="${esc(l.full_name||'')}"></label><label>Title / Role<input name="title" required value="${esc(l.title||'')}" placeholder="e.g. Senior Pastor"></label><label>Department<select name="department_id">${deptOptions}</select></label><label>Order<input name="sort_order" type="number" value="${l.sort_order??0}"></label></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">${l.id?'Save Changes':'Add Leader'}</button></div></form>`}
function addLeader(){if(!isSuperAdmin())return;openModal('Add Leader',leaderForm());$('leaderForm').onsubmit=async e=>{e.preventDefault();try{const fd=new FormData(e.target);const payload={full_name:fd.get('full_name').trim(),title:fd.get('title').trim(),department_id:fd.get('department_id')||null,sort_order:Number(fd.get('sort_order'))||0,created_by:currentAuth.user.id};const {error}=await supabaseClient.from('leaders').insert(payload);if(error)throw error;await loadCloudData();closeModal();renderLeadersAdmin();toast('Leader added to the website.')}catch(err){toast(err.message)}}}
function editLeader(id){if(!isSuperAdmin())return;const l=leaders.find(x=>String(x.id)===String(id));if(!l)return;openModal('Edit Leader',leaderForm(l));$('leaderForm').onsubmit=async e=>{e.preventDefault();try{const fd=new FormData(e.target);const patch={full_name:fd.get('full_name').trim(),title:fd.get('title').trim(),department_id:fd.get('department_id')||null,sort_order:Number(fd.get('sort_order'))||0,updated_by:currentAuth.user.id};const {error}=await supabaseClient.from('leaders').update(patch).eq('id',id);if(error)throw error;await loadCloudData();closeModal();renderLeadersAdmin();toast('Leader updated.')}catch(err){toast(err.message)}}}
async function deleteLeader(id){if(!isSuperAdmin())return;if(!confirm('Remove this leader from the website?'))return;const {error}=await supabaseClient.from('leaders').delete().eq('id',id);if(error){toast(error.message);return}await loadCloudData();renderLeadersAdmin();toast('Leader removed.')}

// ---- Weekly Service Schedule — any Super Admin ----
function renderScheduleAdmin(){
  $('scheduleAdminGrid').innerHTML=serviceSchedule.map(s=>`<div class="admin-content-card"><div class="admin-content-body"><span class="badge ${s.active?'green':''}">${s.active?'Visible':'Hidden'}</span><h3>${esc(s.title)}</h3><p>${esc(s.day_label)} • ${esc(s.time_label)}</p><p class="muted">${esc(s.description||'')}</p><div class="row-actions"><button onclick="editSchedule('${s.id}')">Edit</button><button class="danger" onclick="deleteSchedule('${s.id}')">Delete</button></div></div></div>`).join('')||'<div class="empty">No scheduled services yet.</div>';
}
function scheduleForm(s={}){return `<form id="scheduleForm"><div class="form-grid"><label>Day<input name="day_label" required value="${esc(s.day_label||'')}" placeholder="e.g. SUN"></label><label>Title<input name="title" required value="${esc(s.title||'')}"></label><label>Time<input name="time_label" required value="${esc(s.time_label||'')}" placeholder="e.g. 3:00 – 6:00"></label><label>Description<textarea name="description" rows="3">${esc(s.description||'')}</textarea></label><label>Order<input name="sort_order" type="number" value="${s.sort_order??0}"></label></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">${s.id?'Save Changes':'Add Service'}</button></div></form>`}
function addSchedule(){if(!isSuperAdmin())return;openModal('Add Service',scheduleForm());$('scheduleForm').onsubmit=async e=>{e.preventDefault();try{const fd=new FormData(e.target);const payload={day_label:fd.get('day_label').trim(),title:fd.get('title').trim(),time_label:fd.get('time_label').trim(),description:fd.get('description').trim()||null,sort_order:Number(fd.get('sort_order'))||0,created_by:currentAuth.user.id};const {error}=await supabaseClient.from('service_schedule').insert(payload);if(error)throw error;await loadCloudData();closeModal();renderScheduleAdmin();toast('Service added to the website.')}catch(err){toast(err.message)}}}
function editSchedule(id){if(!isSuperAdmin())return;const s=serviceSchedule.find(x=>String(x.id)===String(id));if(!s)return;openModal('Edit Service',scheduleForm(s));$('scheduleForm').onsubmit=async e=>{e.preventDefault();try{const fd=new FormData(e.target);const patch={day_label:fd.get('day_label').trim(),title:fd.get('title').trim(),time_label:fd.get('time_label').trim(),description:fd.get('description').trim()||null,sort_order:Number(fd.get('sort_order'))||0,updated_by:currentAuth.user.id};const {error}=await supabaseClient.from('service_schedule').update(patch).eq('id',id);if(error)throw error;await loadCloudData();closeModal();renderScheduleAdmin();toast('Service updated.')}catch(err){toast(err.message)}}}
async function deleteSchedule(id){if(!isSuperAdmin())return;if(!confirm('Remove this service from the website?'))return;const {error}=await supabaseClient.from('service_schedule').delete().eq('id',id);if(error){toast(error.message);return}await loadCloudData();renderScheduleAdmin();toast('Service removed.')}

function renderAll(){renderDashboard();renderMembers()}
document.addEventListener('click',e=>{const n=e.target.closest('.nav-item,.text-btn');if(n&&n.dataset.view)showView(n.dataset.view);const t=e.target.closest('.content-tab');if(t)switchContentTab(t.dataset.tab);if(e.target===$('modal'))closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').classList.contains('hidden'))closeModal();});
$('addPerson').onclick=addPerson;$('quickAdd').onclick=addPerson;$('closeModal').onclick=closeModal;$('addEvent').onclick=addEvent;$('addFollowup').onclick=addFollowup;$('markAttendance').onclick=addAttendance;$('exportCsv').onclick=exportCSV;$('exportCsvTop').onclick=exportCSV;$('exportXlsxTop')?.addEventListener('click',exportMembersXLSX);$('addUser').onclick=addUser;$('addUpdate').onclick=addUpdate;$('addSermon').onclick=addSermon;$('addDepartment').onclick=addDepartment;$('addLeader').onclick=addLeader;$('addSchedule').onclick=addSchedule;$('topAvatar').onclick=manageMFA;$('logout').onclick=async()=>{await supabaseClient.auth.signOut();location.reload()};$('departmentMembersSelect')?.addEventListener('change',renderDepartmentMembersList);$('reportPeriod')?.addEventListener('change',()=>{const custom=$('reportPeriod').value==='custom';$('reportFromWrap').classList.toggle('hidden',!custom);$('reportToWrap').classList.toggle('hidden',!custom)});$('generateReport')?.addEventListener('click',renderPeriodReport);$('exportPeriodReportXlsx')?.addEventListener('click',exportPeriodReportXLSX);['memberSearch','ageFilter','deptFilter','subgroupFilter','statusFilter','bibleStudyFilter','sortFilter'].forEach(id=>$(id)?.addEventListener('input',renderMembers));$('attendancePeriod')?.addEventListener('change',()=>{const custom=$('attendancePeriod').value==='custom';$('attendanceFromWrap').classList.toggle('hidden',!custom);$('attendanceToWrap').classList.toggle('hidden',!custom);renderAttendance()});$('attendanceFrom')?.addEventListener('input',renderAttendance);$('attendanceTo')?.addEventListener('input',renderAttendance);$('followupBibleStudyFilter')?.addEventListener('input',renderFollowup);$('addSmallGroup')?.addEventListener('click',addSmallGroup);$('manageChoirGroupsBtn')?.addEventListener('click',manageChoirGroups);$('exportSmallGroupReport')?.addEventListener('click',exportBibleStudyReport);/* ============================================================
   MOBILE PORTAL ENHANCEMENT
   Keeps the existing Supabase/authentication logic unchanged.
   The public website is not affected.
   ============================================================ */
(function enableMobilePortal(){
  const css = `
    html,body{width:100%;max-width:100%;overflow-x:hidden}
    *,*::before,*::after{box-sizing:border-box}
    @media (max-width:900px){
      .sidebar{
        position:fixed!important;
        left:0!important;top:0!important;bottom:0!important;
        width:min(86vw,320px)!important;
        max-width:320px!important;
        z-index:1100!important;
        transform:translateX(-105%);
        transition:transform .25s ease;
        overflow-y:auto;
        -webkit-overflow-scrolling:touch;
        box-shadow:12px 0 30px rgba(0,0,0,.22);
      }
      .sidebar.open{transform:translateX(0)!important}
      .main{width:100%!important;margin-left:0!important;min-width:0!important}
      .topbar{
        position:sticky!important;top:0!important;z-index:1000!important;
        min-height:60px;display:flex;align-items:center;
        gap:10px;padding:10px 14px!important;
      }
      #mobileMenu{display:inline-flex!important;align-items:center;justify-content:center;min-width:44px;min-height:44px}
      .content{width:100%;min-width:0;padding:14px!important}
      .welcome-row,.section-toolbar,.panel-head{display:flex;flex-wrap:wrap;gap:12px}
      .welcome-row>div,.section-toolbar>div:first-child{flex:1 1 100%;min-width:0}
      .welcome-row>.primary,.section-toolbar>.primary,.section-toolbar>.secondary,
      .toolbar-actions{width:100%}
      .toolbar-actions{display:flex;flex-wrap:wrap;gap:8px}
      .toolbar-actions button{flex:1 1 150px;min-height:44px}
      .stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .dashboard-grid{grid-template-columns:1fr!important}
      .filter-panel{
        display:grid!important;grid-template-columns:1fr!important;
        gap:10px!important;
      }
      .filter-panel input,.filter-panel select{width:100%!important;min-width:0!important;min-height:44px}
      .event-grid,.family-grid,.department-grid,.report-grid{
        grid-template-columns:1fr!important
      }
      .table-wrap{
        width:100%;overflow-x:auto!important;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:thin;
      }
      .table-wrap table{min-width:680px}
      .modal{padding:10px!important;align-items:flex-end!important}
      .modal-card{
        width:100%!important;max-width:100%!important;
        max-height:92vh;overflow-y:auto;
        border-radius:18px 18px 0 0;
      }
      .login-screen{padding:14px!important}
      .login-card{
        width:min(100%,460px)!important;
        max-height:calc(100vh - 28px);
        overflow-y:auto;
      }
      body.mobile-sidebar-open{overflow:hidden}
      body.mobile-sidebar-open::after{
        content:"";position:fixed;inset:0;z-index:1050;
        background:rgba(0,0,0,.42);
      }
      .nav-item,.side-bottom a,.side-bottom button{min-height:46px}
    }
    @media (max-width:600px){
      .content{padding:10px!important}
      .crumb{display:none}
      .topbar h2{font-size:1.05rem;line-height:1.2}
      .lang-pill{display:none}
      .stat-grid{grid-template-columns:1fr!important}
      .welcome-row h1,.section-toolbar h1{font-size:1.5rem;line-height:1.2}
      .panel{padding:13px!important}
      .panel-head .text-btn{width:100%;min-height:44px}
      .primary,.secondary,.text-btn{min-height:44px}
      .table-panel{padding:0!important}
      .login-card{padding:20px!important}
    }
    @media (min-width:901px){
      #mobileMenu{display:none!important}
    }
  `;
  const style=document.createElement('style');
  style.id='mkc-mobile-portal-css';
  style.textContent=css;
  document.head.appendChild(style);

  const sidebar=document.querySelector('.sidebar');
  const menu=$('mobileMenu');
  if(!sidebar||!menu)return;

  const mobileQuery=window.matchMedia('(max-width:900px)');

  function closeMenu(){
    sidebar.classList.remove('open');
    document.body.classList.remove('mobile-sidebar-open');
    menu.setAttribute('aria-expanded','false');
    menu.setAttribute('aria-label','Open navigation');
  }
  function openMenu(){
    if(!mobileQuery.matches)return;
    sidebar.classList.add('open');
    document.body.classList.add('mobile-sidebar-open');
    menu.setAttribute('aria-expanded','true');
    menu.setAttribute('aria-label','Close navigation');
  }

  menu.onclick=e=>{
    e.preventDefault();
    sidebar.classList.contains('open')?closeMenu():openMenu();
  };

  document.addEventListener('click',e=>{
    if(!mobileQuery.matches||!sidebar.classList.contains('open'))return;
    if(!sidebar.contains(e.target)&&!menu.contains(e.target))closeMenu();
    if(e.target.closest('.nav-item,.side-bottom a,.side-bottom button'))closeMenu();
  });

  window.addEventListener('resize',()=>{
    if(!mobileQuery.matches)closeMenu();
  });

  /* Expose a safe helper for showView() without changing its behavior. */
  window.closeMobilePortalMenu=closeMenu;
})();

setupPasswordRecovery();login();
