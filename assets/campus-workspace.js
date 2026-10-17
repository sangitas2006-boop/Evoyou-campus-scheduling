(() => {
  const $ = (id) => document.getElementById(id);
  const status = $('page-status');
  let client;
  let session;
  let memberships = [];
  let activeMembership;
  let sessions = [];
  let invitations = [];
  let busy = false;

  const say = (text, error = false, target = status) => { target.textContent = text; target.classList.toggle('error', error); target.hidden = false; };
  const setBusy = (value) => { busy = value; document.body.classList.toggle('busy', value); };
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[ch]);

  function getClient() {
    if (client) return client;
    if (!window.EVOYOU_SUPABASE_URL || !window.EVOYOU_SUPABASE_PUBLISHABLE_KEY || !window.supabase?.createClient) throw new Error('Supabase configuration or browser client did not load.');
    client = window.supabase.createClient(window.EVOYOU_SUPABASE_URL, window.EVOYOU_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    return client;
  }
  function selectedInstitutionId() {
    return $('institution-select').value || activeMembership?.institution_id;
  }
  function renderMemberships() {
    const select = $('institution-select');
    select.replaceChildren(...memberships.map((m,i) => { const option=document.createElement('option'); option.value=m.institution_id; option.textContent=m.institution?.name || `Campus ${i+1}`; return option; }));
    const saved = sessionStorage.getItem('evoyou-active-institution');
    const found = memberships.find(m => m.institution_id === saved) || memberships[0];
    if (found) { select.value=found.institution_id; activeMembership=found; }
    $('institution-wrap').hidden = memberships.length < 2;
    $('user-email').textContent = session.user.email || '';
    $('welcome').textContent = `Welcome, ${activeMembership?.full_name || session.user.email}. Your campus timetable is loaded from shared storage.`;
    $('role-badge').textContent = activeMembership?.role || '';
    $('role-badge').hidden = !activeMembership;
    const admin = activeMembership?.role === 'admin';
    $('add-panel').hidden = !admin;
    $('invite-panel').hidden = !admin;
    $('actions-head').hidden = !admin;
    if (activeMembership) sessionStorage.setItem('evoyou-active-institution', activeMembership.institution_id);
  }
  async function loadMemberships() {
    const { data: membershipRows, error } = await client.from('memberships').select('institution_id,role,full_name').eq('user_id',session.user.id);
    if(error) throw error;
    if(!membershipRows?.length){await client.auth.signOut();location.replace('auth.html');return false;}
    const ids=membershipRows.map(m=>m.institution_id);
    const {data:institutions,error:instError}=await client.from('institutions').select('id,name').in('id',ids);
    if(instError)throw instError;
    memberships=membershipRows.map(m=>({...m,institution:institutions.find(i=>i.id===m.institution_id)}));
    renderMemberships();
    return true;
  }
  async function loadSessions() {
    if(!activeMembership)return;
    say('Loading the shared timetable…');
    const {data,error}=await client.from('campus_sessions').select('id,course,teacher,room,cohort,student_count,room_capacity,day,start_time,end_time').eq('institution_id',selectedInstitutionId()).order('day').order('start_time');
    if(error)throw error;
    sessions=data||[];
    renderSessions();
    status.hidden=true;
  }
  function renderSessions(){
    const body=$('session-rows');body.replaceChildren();$('session-empty').hidden=sessions.length>0;
    const admin=activeMembership?.role==='admin';
    for(const item of sessions){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${escape(item.day)}<br>${escape(String(item.start_time).slice(0,5))}–${escape(String(item.end_time).slice(0,5))}</td><td>${escape(item.course)}</td><td>${escape(item.teacher)}</td><td>${escape(item.room)} · ${escape(item.room_capacity)} seats</td><td>${escape(item.cohort)}</td><td>${escape(item.student_count)}</td>${admin?`<td><button class="btn danger" type="button" data-remove-session="${escape(item.id)}">Remove</button></td>`:''}`;
      body.append(tr);
    }
    body.querySelectorAll('[data-remove-session]').forEach(button=>button.addEventListener('click',()=>removeSession(button.dataset.removeSession)));
  }
  async function addSession(event){
    event.preventDefault();if(busy)return;
    const form=event.currentTarget;if(!form.reportValidity())return;
    const f=new FormData(form);const student_count=Number(f.get('student_count'));const room_capacity=Number(f.get('room_capacity'));
    if(student_count>room_capacity){say('Student count cannot exceed room capacity.','',status);status.classList.add('error');return;}
    const start_time=String(f.get('start_time'));const end_time=String(f.get('end_time'));
    if(end_time<=start_time){say('End time must be later than start time.',true);return;}
    const row={institution_id:selectedInstitutionId(),course:String(f.get('course')).trim(),teacher:String(f.get('teacher')).trim(),room:String(f.get('room')).trim(),cohort:String(f.get('cohort')).trim(),student_count,room_capacity,day:String(f.get('day')),start_time,end_time,created_by:session.user.id};
    setBusy(true);try{const {error}=await client.from('campus_sessions').insert(row);if(error)throw error;form.reset();form.querySelector('[name=student_count]').value='40';form.querySelector('[name=room_capacity]').value='60';form.querySelector('[name=start_time]').value='09:00';form.querySelector('[name=end_time]').value='10:00';await loadSessions();say('Shared session saved.');}catch(error){say(error.message||'Could not save this session.',true);}finally{setBusy(false);}
  }
  async function removeSession(id){if(busy)return;const item=sessions.find(x=>x.id===id);if(!item)return;if(!confirm(`Remove ${item.course} from the shared timetable?`))return;setBusy(true);try{const {error}=await client.from('campus_sessions').delete().eq('id',id).eq('institution_id',selectedInstitutionId());if(error)throw error;await loadSessions();say('Session removed from the shared timetable.');}catch(error){say(error.message||'Could not remove this session.',true);}finally{setBusy(false);}}
  function csvEscape(value){return `"${String(value??'').replace(/"/g,'""')}"`;}
  function exportCsv(){const header=['Course','Teacher','Room','Capacity','Cohort','Students','Day','Start','End'];const rows=sessions.map(s=>[s.course,s.teacher,s.room,s.room_capacity,s.cohort,s.student_count,s.day,s.start_time,s.end_time]);const text=[header,...rows].map(r=>r.map(csvEscape).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='evoyou-campus-shared-timetable.csv';a.click();URL.revokeObjectURL(url);}
  async function loadInvitations(){if(activeMembership?.role!=='admin')return;const {data,error}=await client.from('student_invitations').select('id,email,expires_at,accepted_at,revoked_at,claimed_at,created_at').eq('institution_id',selectedInstitutionId()).order('created_at',{ascending:false}).limit(100);if(error)throw error;invitations=data||[];renderInvitations();}
  function renderInvitations(){const body=$('invite-rows');body.replaceChildren();for(const invite of invitations){const state=invite.accepted_at?'Accepted':invite.revoked_at?'Revoked':new Date(invite.expires_at)<=new Date()?'Expired':invite.claimed_at?'Being accepted':'Active';const tr=document.createElement('tr');tr.innerHTML=`<td>${escape(invite.email)}</td><td>${escape(new Date(invite.expires_at).toLocaleString())}</td><td>${state}</td><td>${state==='Active'?`<button class="btn danger" type="button" data-revoke-invite="${escape(invite.id)}">Revoke</button>`:''}</td>`;body.append(tr);}body.querySelectorAll('[data-revoke-invite]').forEach(b=>b.addEventListener('click',()=>revokeInvitation(b.dataset.revokeInvite)));}
  function makeCode(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
  async function digestCode(code){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
  async function createInvitation(event){event.preventDefault();if(busy)return;const form=event.currentTarget;if(!form.reportValidity())return;const email=String(new FormData(form).get('email')).trim().toLowerCase();const days=Number(new FormData(form).get('days'));const code=makeCode();const code_hash=await digestCode(code);const expires_at=new Date(Date.now()+days*86400000).toISOString();const result=$('invite-result');setBusy(true);result.hidden=true;try{const {error}=await client.rpc('issue_student_invitation',{p_institution_id:selectedInstitutionId(),p_email:email,p_code_hash:code_hash,p_expires_at:expires_at});if(error)throw error;result.replaceChildren();const p=document.createElement('span');p.textContent=`One-time invitation for ${email}: `;const strong=document.createElement('strong');strong.textContent=code;const br=document.createElement('br');const copy=document.createElement('button');copy.className='btn secondary';copy.type='button';copy.textContent='Copy code';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code);copy.textContent='Copied';}catch{say('Clipboard unavailable; select and copy the code shown above.',true,result);}});result.append(p,strong,br,copy);result.classList.remove('error');result.hidden=false;form.reset();await loadInvitations();}catch(error){say(error.message||'Could not create the invitation.',true,result);}finally{setBusy(false);}}
  async function revokeInvitation(id){if(busy||!confirm('Revoke this unused student invitation?'))return;setBusy(true);try{const {data,error}=await client.rpc('revoke_student_invitation',{p_invitation_id:id});if(error)throw error;if(!data)throw new Error('Invitation was already used, expired, or revoked.');await loadInvitations();say('Invitation revoked.');}catch(error){say(error.message||'Could not revoke invitation.',true);}finally{setBusy(false);}}
  $('session-form').addEventListener('submit',addSession);
  $('invite-form').addEventListener('submit',createInvitation);
  $('export-csv').addEventListener('click',exportCsv);
  $('refresh').addEventListener('click',()=>Promise.all([loadSessions(),loadInvitations()]).catch(e=>say(e.message||'Could not reload campus data.',true)));
  $('institution-select').addEventListener('change',async()=>{activeMembership=memberships.find(m=>m.institution_id===selectedInstitutionId());renderMemberships();await Promise.all([loadSessions(),loadInvitations()]).catch(e=>say(e.message||'Could not load this campus.',true));});
  $('signout').addEventListener('click',async()=>{try{await getClient().auth.signOut();}finally{sessionStorage.removeItem('evoyou-active-institution');location.replace('auth.html');}});
  (async()=>{try{client=getClient();const {data,error}=await client.auth.getSession();if(error)throw error;session=data?.session;if(!session?.user){location.replace('auth.html');return;}const {data:userData,error:userError}=await client.auth.getUser();if(userError||!userData?.user){location.replace('auth.html');return;}session.user=userData.user;const found=await loadMemberships();if(!found)return;await Promise.all([loadSessions(),loadInvitations()]);}catch(error){say(`Could not load the protected campus workspace: ${error.message||'Supabase error'}. Check that the approved migrations are applied.`,true);}})();
})();
