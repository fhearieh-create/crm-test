/* ============================================================
   EGN CRM — admin/20-utilisateurs.js
   Utilisateurs et acces
   ============================================================ */
/* ====================================================================
   UTILISATEURS
   ==================================================================== */
function renderUsers(){
  document.getElementById('pageActions').innerHTML=actionBtn('+ Nouvel utilisateur','openUser()','btn-pri');
  const users=getUsers();
  let h=`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Utilisateur</th><th>Code d'accès</th><th>Rôle</th><th>Équipe</th><th>Statut</th><th style="text-align:right">Actions</th></tr></thead><tbody>`;
  users.forEach(u=>{
    const isSuper=u.role==='superadmin';
    h+=`<tr>
      <td><div class="flex"><div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--green),var(--green-deep));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:.75rem">${esc((u.prenom[0]||'')+(u.nom[0]||''))}</div><div><div class="tbl-name">${esc(u.prenom+' '+u.nom)}</div><div class="muted" style="font-size:.72rem">${esc(u.email||'')}</div></div></div></td>
      <td><span class="dossier-tag">${esc(u.code)}</span></td>
      <td>${ROLES[u.role]||u.role}${(u.assignedUsers&&u.assignedUsers.length)?`<br><span class="muted" style="font-size:.68rem">👁️ voit ${u.assignedUsers.length} accès</span>`:''}${u.role==='poseur'?(poseurFamilyOf(u.id)?`<br><span class="muted" style="font-size:.68rem">🏷️ ${esc(poseurFamilyOf(u.id))}</span>`:`<br><span class="muted" style="font-size:.68rem;color:var(--coral)">⚠️ aucune famille</span>`):''}</td>
      <td class="muted">${esc((getTeams().find(t=>t.id===u.team)||{}).name||'—')}</td>
      <td>${u.active?'<span class="pill green">Actif</span>':'<span class="pill grey">Inactif</span>'}</td>
      <td><div class="row-act">
        <button class="iconbtn" title="Modifier" onclick="openUser('${u.id}')">✏️</button>
        <button class="iconbtn" title="${u.active?'Désactiver':'Activer'}" onclick="toggleUser('${u.id}')">${u.active?'🚫':'✅'}</button>
        ${!isSuper?`<button class="iconbtn del" title="Supprimer" onclick="delUser('${u.id}')">🗑️</button>`:''}
      </div></td></tr>`;
  });
  h+=`</tbody></table></div>
  <div class="panel" style="margin-top:1.2rem"><div class="panel-b"><p class="muted" style="font-size:.84rem;line-height:1.6">💡 <b>Codes d'accès</b> — transmettez le <b>code utilisateur</b> + le <b>mot de passe</b> à vos collaborateurs, régies ou call centers. Ils se connectent sur le même écran que vous. Réglez leurs droits dans la fiche via les <b>permissions</b> (par défaut, un commercial / télépro ne voit que ses propres dossiers). Seul un <b>Super Admin</b> peut créer d'autres administrateurs.</p></div></div>
  ${can('compta_global')?`<div class="panel" style="margin-top:1.2rem"><div class="panel-h"><h3>Historique de connexion</h3><div class="sp"><span class="muted">50 dernières connexions</span></div></div><div class="panel-b" id="loginHistBody"><div class="empty"><div class="big">⏳</div>Chargement…</div></div></div>`:''}`;
  document.getElementById('content').innerHTML=h;
  if(can('compta_global'))renderLoginHistory();
}
async function renderLoginHistory(){
  const body=document.getElementById('loginHistBody');if(!body)return;
  try{
    const{data,error}=await SUPA.from('login_events').select('*').order('at',{ascending:false}).limit(50);
    if(error)throw error;
    if(!data||!data.length){body.innerHTML=`<div class="empty"><div class="big">🔐</div>Aucune connexion enregistrée.</div>`;return;}
    // pour chaque connexion : la session se termine à la connexion suivante DU MÊME utilisateur, ou maintenant
    body.innerHTML=`<p class="muted" style="margin-bottom:.7rem;font-size:.78rem">💡 Clique sur une ligne pour voir tout ce que cette personne a consulté / modifié pendant cette connexion.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date & heure</th><th>Utilisateur</th><th>Code</th></tr></thead><tbody>`+
      data.map((ev,i)=>{
        const u=userById(ev.user_id);
        const nextForSameUser=data.slice(0,i).reverse().find(e2=>e2.user_id===ev.user_id); // la connexion suivante chronologiquement pour ce même user
        const sessionEnd=nextForSameUser?nextForSameUser.at:new Date().toISOString();
        return `<tr style="cursor:pointer" onclick="openSessionActivity('${ev.user_id}','${ev.at}','${sessionEnd}','${esc(u?u.prenom+' '+u.nom:'Compte supprimé')}')"><td>${new Date(ev.at).toLocaleString('fr-FR')}</td><td>${u?esc(u.prenom+' '+u.nom):'<span class=\"muted\">Compte supprimé</span>'}</td><td><span class="dossier-tag">${esc(ev.code||'')}</span></td></tr>`;
      }).join('')+
      `</tbody></table></div>`;
  }catch(e){console.error('[login history]',e);body.innerHTML=`<div class="empty"><div class="big">⚠️</div>Impossible de charger l'historique.</div>`;}
}
async function openSessionActivity(userId,fromIso,toIso,userLabel){
  openModal(`Activité de ${esc(userLabel)}`,`<div class="empty"><div class="big">⏳</div>Chargement…</div>`,`<button class="btn btn-ghost" onclick="closeModal()">Fermer</button>`,'wide');
  try{
    const{data,error}=await SUPA.from('activity_log').select('*').eq('user_id',userId).gte('created_at',fromIso).lte('created_at',toIso).order('created_at',{ascending:true});
    if(error)throw error;
    let h=`<p class="muted" style="margin-bottom:.7rem;font-size:.8rem">Du ${new Date(fromIso).toLocaleString('fr-FR')} au ${new Date(toIso).toLocaleString('fr-FR')}</p>`;
    if(!data||!data.length)h+=`<div class="empty"><div class="big">📭</div>Aucune activité enregistrée pour cette connexion.</div>`;
    else h+=`<div class="hist">`+data.map(a=>`<div class="hist-item"><div class="hm">${new Date(a.created_at).toLocaleString('fr-FR')}</div>${esc(a.message)}${a.record_id?` <span style="cursor:pointer;color:var(--green-deep);font-weight:700" onclick="ouvrirLigne(event,'${a.record_id}')">→ ouvrir</span>`:''}</div>`).join('')+`</div>`;
    setModalBody(h);
  }catch(e){console.error('[session activity]',e);setModalBody(`<div class="empty"><div class="big">⚠️</div>Impossible de charger l'activité.</div>`);}
}
function genCode(){
  const L='ABCDEFGHJKLMNPQRSTUVWXYZ';let c;const ex=getUsers().map(u=>u.code.toUpperCase());
  do{c='';for(let i=0;i<3;i++)c+=L[Math.floor(Math.random()*L.length)];c+=Math.floor(100+Math.random()*900);}while(ex.includes(c));
  const f=document.getElementById('us_code');if(f)f.value=c;
}
function roleOptions(sel){
  let roles=Object.keys(ROLES);
  if(ME.role!=='superadmin')roles=roles.filter(r=>r!=='superadmin'&&r!=='admin');
  return roles.map(r=>`<option value="${r}" ${r===sel?'selected':''}>${ROLES[r]}</option>`).join('');
}
function permGrid(perms){
  const p=perms||{};
  return PERM_GROUPS.map((g,gi)=>{
    const nbOn=g.items.filter(it=>p[it.k]).length;
    return `<div class="perm-group" data-group="${gi}" style="margin-bottom:.9rem">
      <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.35rem;padding-bottom:.3rem;border-bottom:1px solid var(--border-grey)">
        <span style="font-size:.72rem;font-weight:800;color:var(--navy);text-transform:uppercase;letter-spacing:.5px;flex:1">${esc(g.g)}</span>
        <span class="muted" id="pg_count_${gi}" style="font-size:.68rem">${nbOn}/${g.items.length}</span>
        <button type="button" class="btn btn-ghost btn-sm" style="font-size:.66rem;padding:.15rem .5rem" onclick="toggleGroupPerms(${gi},true)">Tout</button>
        <button type="button" class="btn btn-ghost btn-sm" style="font-size:.66rem;padding:.15rem .5rem" onclick="toggleGroupPerms(${gi},false)">Aucun</button>
      </div>
      <div class="perm-grid">${g.items.map(it=>`<label class="perm-item"><input type="checkbox" data-perm="${it.k}" data-grp="${gi}" ${p[it.k]?'checked':''} onchange="updatePermCount(${gi})">${esc(it.l)}</label>`).join('')}</div>
    </div>`;
  }).join('');
}
function toggleGroupPerms(gi,val){
  document.querySelectorAll(`#us_perms input[data-grp="${gi}"]`).forEach(c=>c.checked=val);
  updatePermCount(gi);
}
function updatePermCount(gi){
  const boxes=[...document.querySelectorAll(`#us_perms input[data-grp="${gi}"]`)];
  const el=document.getElementById('pg_count_'+gi);
  if(el)el.textContent=`${boxes.filter(b=>b.checked).length}/${boxes.length}`;
}
function setAllPerms(val){
  document.querySelectorAll('#us_perms input[data-perm]').forEach(c=>c.checked=val);
  PERM_GROUPS.forEach((g,gi)=>updatePermCount(gi));
}
function applyRolePreset(){
  const role=(document.getElementById('us_role')||{}).value;
  if(!role)return;
  const preset=rolePerms(role);
  document.querySelectorAll('#us_perms input[data-perm]').forEach(c=>{c.checked=!!preset[c.dataset.perm];});
  PERM_GROUPS.forEach((g,gi)=>updatePermCount(gi));
  toast('Droits réinitialisés selon le rôle « '+(ROLES[role]||role)+' »','ok');
}
function openUser(id){
  const u=id?userById(id):null;
  if(u&&u.role==='superadmin'&&ME.role!=='superadmin'){toast('Seul un Super Admin peut modifier ce compte','err');return;}
  const d=u||{role:'telepro',active:true,perms:rolePerms('telepro')};
  US_ASSIGN=(u&&u.assignedUsers)?[...u.assignedUsers]:[];
  const teams=getTeams();
  let body=`<input type="hidden" id="us_id" value="${id||''}">
  <div class="sectitle">Identité</div>
  <div class="fgrid">
    <div class="fld"><label>Prénom</label><input id="us_prenom" value="${esc(d.prenom)}"></div>
    <div class="fld"><label>Nom</label><input id="us_nom" value="${esc(d.nom)}"></div>
    <div class="fld"><label>Email</label><input id="us_email" value="${esc(d.email)}"></div>
    <div class="fld"><label>📱 WhatsApp <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">— format international</span></label><input id="us_whatsapp" value="${esc(d.whatsapp||'')}" placeholder="+33 6 12 34 56 78"></div>
    <div class="fld"><label>Équipe</label><select id="us_team"><option value="">—</option>${teams.map(t=>`<option value="${t.id}" ${t.id===d.team?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div>
  </div>
  <div class="sectitle">Accès & connexion</div>
  <div class="fgrid c3">
    <div class="fld"><label>Rôle</label><select id="us_role" onchange="applyRolePerms(this.value);toggleFamilyField(this.value)">${roleOptions(d.role)}</select></div>
    <div class="fld"><label>Code utilisateur</label><div class="flex"><input id="us_code" value="${esc(d.code||'')}" style="text-transform:uppercase"><button class="btn btn-ghost btn-sm" type="button" onclick="genCode()" title="Générer">🎲</button></div></div>
    <div class="fld"><label>Mot de passe</label><input id="us_pwd" value="${esc(d.pwd||'')}"></div>
  </div>
  <div class="fld" id="us_family_wrap" style="${d.role==='poseur'?'':'display:none'}">
    <label>Famille de poseurs <span style="color:var(--coral)">*</span> <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(définit sa tarification — obligatoire pour un compte Poseur)</span></label>
    <select id="us_family">${familyOptions(u?poseurFamilyId(u.id):'')}</select>
  </div>
  <div class="fld" id="us_source_wrap" style="${d.role==='commercial'?'':'display:none'}">
    <label>Source / Régie affiliée <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(pré-remplit automatiquement la source sur les leads qu'il crée)</span></label>
    <select id="us_source"><option value="">— Aucune —</option>${getSources().map(s=>`<option value="${s.id}" ${d.sourceId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select>
  </div>
  <div class="sectitle">Affectation <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(accès aux RDV / dossiers d'autres utilisateurs)</span></div>
  <p class="muted" style="margin-bottom:.5rem">Pour un <b>confirmateur</b> : choisissez les commerciaux / télépros dont il pourra voir et confirmer les rendez-vous. Vide = l'utilisateur ne voit que ses propres RDV (sauf si ses permissions lui donnent accès à tout).</p>
  <div class="fld"><label>Ajouter un accès</label><select id="us_assign_pick" onchange="addAssign(this.value)"></select></div>
  <div id="us_assign_chips" class="flex" style="flex-wrap:wrap;gap:.4rem;margin-top:.55rem"></div>
  <div class="sectitle" style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
    <span style="flex:1">Permissions <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(cochez précisément ce que cet utilisateur peut voir)</span></span>
    <button type="button" class="btn btn-ghost btn-sm" style="font-size:.68rem" onclick="applyRolePreset()">↺ Modèle du rôle</button>
    <button type="button" class="btn btn-ghost btn-sm" style="font-size:.68rem" onclick="setAllPerms(true)">Tout cocher</button>
    <button type="button" class="btn btn-ghost btn-sm" style="font-size:.68rem" onclick="setAllPerms(false)">Tout décocher</button>
  </div>
  <div id="us_perms">${permGrid(normalizePerms(d.perms,d.role))}</div>`;
  openModal(id?"Modifier l'utilisateur":'Nouvel utilisateur',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveUser()">💾 Enregistrer</button>`,'wide');
  renderAssignChips();
  if(!id&&!d.code)genCode();
}
function applyRolePerms(role){const p=rolePerms(role);document.querySelectorAll('#us_perms input[data-perm]').forEach(cb=>{cb.checked=!!p[cb.dataset.perm];});PERM_GROUPS.forEach((g,gi)=>updatePermCount(gi));}
function toggleFamilyField(role){
  const w=document.getElementById('us_family_wrap');if(w)w.style.display=role==='poseur'?'':'none';
  const ws=document.getElementById('us_source_wrap');if(ws)ws.style.display=role==='commercial'?'':'none';
}
function poseurFamilyId(userId){const f=load('egncrm_poseurs',[]).find(x=>(x.userIds||[]).includes(userId));return f?f.id:'';}
function familyOptions(sel){const list=load('egncrm_poseurs',[]);return `<option value="">— Choisir une famille —</option>`+list.map(f=>`<option value="${f.id}" ${f.id===sel?'selected':''}>${esc(f.name)}</option>`).join('');}
function assignUserToFamily(userId,familyId){
  const list=load('egncrm_poseurs',[]);
  list.forEach(f=>{if(f.userIds)f.userIds=f.userIds.filter(x=>x!==userId);});
  if(familyId){const f=list.find(x=>x.id===familyId);if(f){f.userIds=f.userIds||[];f.userIds.push(userId);}}
  save('egncrm_poseurs',list);
}
function renderAssignChips(){
  const selfId=val('us_id');
  const others=getUsers().filter(u=>u.id!==selfId);
  const chips=document.getElementById('us_assign_chips');
  if(chips)chips.innerHTML=US_ASSIGN.length?US_ASSIGN.map(id=>{const u=userById(id);return `<span class="chip" style="display:inline-flex;align-items:center;gap:.4rem;padding:.2rem .6rem">${u?esc(u.prenom+' '+u.nom):'?'}<span style="cursor:pointer;font-weight:800;color:var(--coral)" onclick="removeAssign('${id}')">✕</span></span>`;}).join(''):'<span class="muted" style="font-size:.78rem">Aucun accès affecté.</span>';
  const pick=document.getElementById('us_assign_pick');
  if(pick)pick.innerHTML='<option value="">+ Choisir un utilisateur…</option>'+others.filter(u=>!US_ASSIGN.includes(u.id)).map(u=>`<option value="${u.id}">${esc(u.prenom+' '+u.nom)} (${ROLES[u.role]||u.role})</option>`).join('');
}
function addAssign(id){if(!id)return;if(!US_ASSIGN.includes(id))US_ASSIGN.push(id);renderAssignChips();}
function removeAssign(id){US_ASSIGN=US_ASSIGN.filter(x=>x!==id);renderAssignChips();}
async function callAdminManageUser(payload){
  const{data:{session}}=await SUPA.auth.getSession();
  if(!session)throw new Error('Session Supabase expirée — reconnectez-vous.');
  const{data,error}=await SUPA.functions.invoke('admin-manage-user',{
    body:payload,
    headers:{Authorization:'Bearer '+session.access_token}
  });
  if(error)throw error;
  if(data&&data.error)throw new Error(data.error);
  return data;
}
/* ---- envoi réel d'e-mail (Gmail via Edge Function "send-email") ---- */
async function callSendEmail(payload){
  const{data:{session}}=await SUPA.auth.getSession();
  if(!session)throw new Error('Session Supabase expirée — reconnectez-vous.');
  const{data,error}=await SUPA.functions.invoke('send-email',{
    body:payload,
    headers:{Authorization:'Bearer '+session.access_token}
  });
  if(error)throw error;
  if(data&&data.error)throw new Error(data.error);
  return data;
}
async function blobToBase64(blob){
  return await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result).split(',')[1]);fr.onerror=rej;fr.readAsDataURL(blob);});
}
async function saveUser(){
  const id=val('us_id');const code=val('us_code').toUpperCase();const pwd=val('us_pwd');
  const prenom=val('us_prenom'),nom=val('us_nom');
  if(!prenom&&!nom){toast('Nom requis','err');return;}
  if(!code){toast('Code utilisateur requis','err');return;}
  if(!pwd){toast('Mot de passe requis','err');return;}
  const role=val('us_role');
  const familyId=val('us_family');
  if(role==='poseur'&&!familyId){
    const hasFamilies=load('egncrm_poseurs',[]).length>0;
    toast(hasFamilies?'Famille de poseurs requise pour ce rôle':'Créez d\'abord une famille dans Paramètres ▸ Poseur','err');
    return;
  }
  const users=getUsers();
  if(users.some(u=>u.code.toUpperCase()===code&&u.id!==id)){toast('Ce code est déjà utilisé','err');return;}
  let u=id?users.find(x=>x.id===id):null;const isNew=!u;
  const perms={};document.querySelectorAll('#us_perms input[data-perm]').forEach(cb=>perms[cb.dataset.perm]=cb.checked);
  const email=val('us_email'),team=val('us_team'),whatsapp=normWaNumber(val('us_whatsapp'));
  const passwordChanged=!isNew&&u.pwd!==pwd;

  if(isNew){
    try{
      const res=await callAdminManageUser({action:'create',code,password:pwd,prenom,nom,email,team,role,perms,active:true});
      u={id:res.id,created:Date.now(),active:true};
      users.push(u);
    }catch(e){toast('Erreur Supabase : '+e.message,'err');return;}
  }else if(passwordChanged||true){
    // synchronise systématiquement le profil (rôle/perms/actif), + mot de passe si modifié
    try{
      await callAdminManageUser({action:'update',userId:u.id,password:passwordChanged?pwd:undefined,prenom,nom,email,team,role,perms,active:u.active});
    }catch(e){toast('⚠️ Compte enregistré localement mais non synchronisé avec Supabase : '+e.message,'err');}
  }

  Object.assign(u,{prenom,nom,email,whatsapp,team,role,code,pwd,perms,sourceId:role==='commercial'?(val('us_source')||''):(u.sourceId||''),assignedUsers:US_ASSIGN.filter(x=>x!==u.id)});
  assignUserToFamily(u.id,role==='poseur'?familyId:'');
  save(K.users,users);
  await pushAssignedUsers(u.id,u.assignedUsers,u.sourceId,u.whatsapp);
  if(u.id===ME.id){ME=u;document.getElementById('meName').textContent=ME.prenom+' '+ME.nom;document.getElementById('meRole').textContent=ROLES[ME.role]||ME.role;}
  closeModal();buildNav();renderUsers();toast(isNew?'Utilisateur créé ✓':'Utilisateur enregistré ✓','ok');
}
async function toggleUser(id){const users=getUsers();const u=users.find(x=>x.id===id);if(!u)return;
  if(u.id===ME.id){toast('Vous ne pouvez pas vous désactiver','err');return;}
  if(u.role==='superadmin'){toast('Compte Super Admin protégé','err');return;}
  u.active=!u.active;
  try{await callAdminManageUser({action:'update',userId:u.id,prenom:u.prenom,nom:u.nom,email:u.email,team:u.team,role:u.role,perms:u.perms,active:u.active});}
  catch(e){toast('⚠️ Non synchronisé avec Supabase : '+e.message,'err');}
  save(K.users,users);renderUsers();buildNav();toast(u.active?'Compte activé':'Compte désactivé','ok');}
async function delUser(id){const u=userById(id);if(!u)return;
  if(u.role==='superadmin'){toast('Compte Super Admin non supprimable','err');return;}
  if(u.id===ME.id){toast('Vous ne pouvez pas vous supprimer','err');return;}
  modalConfirm('Supprimer cet utilisateur ?',"Son compte Supabase sera aussi supprimé. Ses dossiers sont conservés.",async()=>{
    try{await callAdminManageUser({action:'delete',userId:u.id});}
    catch(e){toast('⚠️ Suppression Supabase échouée : '+e.message,'err');}
    save(K.users,getUsers().filter(x=>x.id!==id));closeModal();renderUsers();buildNav();toast('Utilisateur supprimé','ok');});
}

