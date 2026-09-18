/* ============================================================
   EGN CRM — modules/11-dossiers.js
   Listes leads / clients, colonnes, export, fiche dossier, comptabilité du dossier
   ============================================================ */
/* ====================================================================
   LEADS / CLIENTS
   ==================================================================== */
let LF={q:'',status:'',prod:'',src:'',user:'',sousstatut:'',zone:'',crmDevis:''};
function ownScope(){return [ME.id,...((ME&&ME.assignedUsers)||[])];}
function recVisible(r){return can('leads_view_all')||ownScope().includes(r.userId);}
function rdvVisible(r){return can('planning_view_all')||ownScope().includes(r.userId)||ownScope().includes(r.ownerId);}
/* intervenant RDV selon le type (sous-traitants) */
function rdvKind(type){if(type==='Visite technique')return 'vt';if(type==='Installation'||type==='Pose / Installation')return 'poseur';if(type==='Audit')return 'auditeur';return 'user';}
function rdvListKey(kind){return kind==='vt'?'egncrm_vt':kind==='auditeur'?'egncrm_auditeurs':'';}
function rdvList(kind){const k=rdvListKey(kind);return k?load(k,[]):[];}
function rdvKindLabel(kind){return kind==='vt'?'société de visite technique':kind==='poseur'?'poseur':kind==='auditeur'?'auditeur':'intervenant';}
function rdvWho(rd){if(rd.subName)return rd.subName;const u=userById(rd.userId);return u?u.prenom+' '+u.nom:'';}
function rdvsOf(r){return getRdvs().filter(x=>x.recordId===r.id);}
function nextRdvOf(r){
  const list=rdvsOf(r);if(!list.length)return null;
  const todayStr=new Date().toISOString().slice(0,10);
  const up=list.filter(x=>(x.date||'')>=todayStr).sort((a,b)=>((a.date||'')+(a.heure||'')).localeCompare((b.date||'')+(b.heure||'')));
  if(up.length)return up[0];
  return list.slice().sort((a,b)=>((b.date||'')+(b.heure||'')).localeCompare((a.date||'')+(a.heure||'')))[0];
}
function rdvIntervenantOptions(type,selectedId){
  const kind=rdvKind(type);
  if(kind==='user'||kind==='poseur'){
    // Poseur = compte CRM réel (comme n'importe quel intervenant) : la tarification (famille) est gérée à part
    const users=(kind==='poseur'?getUsers().filter(u=>u.role==='poseur'):getUsers()).filter(u=>u.active);
    if(!users.length)return `<option value="">— Aucun compte ${kind==='poseur'?'Poseur':'actif'} (à créer dans Utilisateurs) —</option>`;
    return `<option value="">— ${kind==='poseur'?'Choisir un poseur':'Intervenant'} —</option>`+users.map(u=>`<option value="${u.id}" ${selectedId===u.id?'selected':''}>${esc(u.prenom+' '+u.nom)}${kind==='poseur'&&poseurFamilyOf(u.id)?' — '+esc(poseurFamilyOf(u.id)):''}</option>`).join('');
  }
  const list=rdvList(kind);const lbl=rdvKindLabel(kind);
  if(!list.length)return `<option value="">— Aucun ${lbl} (à créer dans Paramètres) —</option>`;
  return `<option value="">— Choisir ${lbl} —</option>`+list.map(x=>`<option value="${x.id}" ${selectedId===x.id?'selected':''}>${esc(x.name)}</option>`).join('');
}
function rdvTypeChange(){const t=(document.getElementById('rd_type')||{}).value||'';const sel=document.getElementById('rd_user');if(sel)sel.innerHTML=rdvIntervenantOptions(t,'');const lab=document.getElementById('rd_user_lab');if(lab)lab.textContent=rdvKind(t)==='user'?'Intervenant':rdvKind(t)==='poseur'?'Poseur':'Sous-traitant ('+rdvKindLabel(rdvKind(t))+')';}
function visibleRecs(){return getRecs().filter(r=>segOf(r)===SEGMENT&&recVisible(r));}
/* Tous les dossiers du segment courant, sans filtre de visibilité — pour les agrégats compta */
function segRecs(){return getRecs().filter(r=>segOf(r)===SEGMENT);}
function allVisibleRecs(){return getRecs().filter(recVisible);}
function renderLeads(){
  if(can('leads_create'))document.getElementById('pageActions').innerHTML=actionBtn('+ Nouveau lead','openLead()','btn-pri');
  drawRecTable('leads');
}
function renderClients(){
  drawRecTable('clients');
}
let REC_SELECTED=new Set(),REC_MODE='leads';
function drawRecTable(mode){
  REC_MODE=mode;REC_SELECTED.clear();
  const sts=getStatuses();
  let recs=visibleRecs();
  const cIds=sts.filter(s=>s.phase==='client').map(s=>s.id);
  recs=mode==='clients'?recs.filter(r=>cIds.includes(r.statusId)):recs.filter(r=>!cIds.includes(r.statusId));
  // filters UI
  const opts=arr=>arr.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  let h=`<div class="tbl-wrap">
    <div class="tbl-toolbar">
      <div class="srch"><input id="recSrch" placeholder="Rechercher nom, téléphone, ville, dossier, nom du site…" oninput="LF.q=this.value;applyRecFilter('${mode}')"></div>
      <select id="recStatus" onchange="LF.status=this.value;applyRecFilter('${mode}')"><option value="">Tous les statuts</option>${opts(sts)}</select>
      <select id="recProd" onchange="LF.prod=this.value;applyRecFilter('${mode}')"><option value="">Toutes les opérations</option>${opts(getProducts())}</select>
      <select id="recSrc" onchange="LF.src=this.value;applyRecFilter('${mode}')"><option value="">Toutes les sources</option>${opts(getSources())}</select>
      <select id="recUser" onchange="LF.user=this.value;applyRecFilter('${mode}')"><option value="">Tous les intervenants</option>${getUsers().filter(u=>u.active).map(u=>`<option value="${u.id}">${esc(u.prenom+' '+u.nom)}</option>`).join('')}</select>
      ${can('sousstatut_view')?`<select id="recSousStatut" onchange="LF.sousstatut=this.value;applyRecFilter('${mode}')"><option value="">Tous les sous-statuts</option>${load('egncrm_sousstatuts',[]).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>`:''}
      <select id="recZone" onchange="LF.zone=this.value;applyRecFilter('${mode}')"><option value="">Toutes les zones</option><option value="H1">Zone H1</option><option value="H2">Zone H2</option><option value="H3">Zone H3</option></select>
      <select id="recCrmDevis" onchange="LF.crmDevis=this.value;applyRecFilter('${mode}')"><option value="">Tous les CRM devis</option><option value="Qhare CRM">Qhare CRM</option><option value="Pixel CRM">Pixel CRM</option><option value="">Non renseigné</option></select>
      <button class="btn btn-ghost btn-sm" onclick="openExportModal()" title="Exporter en Excel / CSV">⬇️ Exporter</button>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="openColsModal('${mode}')" title="Choisir les colonnes affichées">⚙ Colonnes</button>
    </div>
    <div id="recBulkBar"></div>
    <div id="recTblBody"></div></div>`;
  document.getElementById('content').innerHTML=h;
  document.getElementById('recSrch').value=LF.q;
  document.getElementById('recStatus').value=LF.status;
  document.getElementById('recProd').value=LF.prod;
  document.getElementById('recSrc').value=LF.src;
  const recUser=document.getElementById('recUser');if(recUser)recUser.value=LF.user;
  const recSS=document.getElementById('recSousStatut');if(recSS)recSS.value=LF.sousstatut;
  const recZone=document.getElementById('recZone');if(recZone)recZone.value=LF.zone;
  const recCrm=document.getElementById('recCrmDevis');if(recCrm)recCrm.value=LF.crmDevis;
  renderRecRows(mode,recs);
}
function applyRecFilter(mode){
  const sts=getStatuses();
  let recs=visibleRecs();
  const cIds=sts.filter(s=>s.phase==='client').map(s=>s.id);
  recs=mode==='clients'?recs.filter(r=>cIds.includes(r.statusId)):recs.filter(r=>!cIds.includes(r.statusId));
  renderRecRows(mode,recs);
}
function renderRecRows(mode,recs){
  let f=recs.slice();
  if(LF.status)f=f.filter(r=>r.statusId===LF.status);
  if(LF.prod)f=f.filter(r=>r.productId===LF.prod);
  if(LF.src)f=f.filter(r=>r.sourceId===LF.src);
  if(LF.user)f=f.filter(r=>r.userId===LF.user);
  if(LF.sousstatut)f=f.filter(r=>r.sousStatutId===LF.sousstatut);
  if(LF.zone){f=f.filter(r=>{const wz=recWorkAddr(r);return zoneOf(wz.dept)===LF.zone;});}
  if(LF.crmDevis)f=f.filter(r=>(r.crmDevis||'')===LF.crmDevis);
  if(LF.q){const q=LF.q.toLowerCase();f=f.filter(r=>{const nomSite=(r.opFields&&Object.values(r.opFields).join(' '))||r.nomSite||'';return(recName(r)+' '+(r.tel||'')+' '+(r.telFixe||'')+' '+(r.ville||'')+' '+(r.dossier||'')+' '+(r.email||'')+' '+(r.siret||'')+' '+nomSite).toLowerCase().includes(q);});}
  f.sort((a,b)=>(b.created||0)-(a.created||0));
  REC_LAST_LIST=f;
  const isAdminCompta=can('fiche_deal');
  const RESTRICTED_COLS=['prime','delegataire'];
  const cols=getCols(mode).filter(c=>c.visible&&COLS[c.key]&&(isAdminCompta||!RESTRICTED_COLS.includes(c.key)||(c.key==='sousstatut'&&can('sousstatut_view'))));
  let h='';
  if(!f.length){h=`<div class="empty"><div class="big">📭</div>Aucun dossier${LF.q||LF.status||LF.prod||LF.src?' pour ces filtres':''}.<br>${can('leads_create')?'Créez-en un ou importez votre base.':''}</div>`;}
  else{
    const allChecked=f.length>0&&f.every(r=>REC_SELECTED.has(r.id));
    h=`<table class="tbl"><thead><tr><th style="width:34px"><input type="checkbox" ${allChecked?'checked':''} onchange="toggleRecSelAll(this.checked)"></th>${cols.map(c=>`<th>${esc(COLS[c.key].label)}</th>`).join('')}<th style="text-align:right">Actions</th></tr></thead><tbody>`;
    f.forEach(r=>{
      h+=`<tr><td><input type="checkbox" class="rec-chk" ${REC_SELECTED.has(r.id)?'checked':''} onchange="toggleRecSel('${r.id}',this.checked)"></td>${cols.map(c=>`<td>${COLS[c.key].val(r)}</td>`).join('')}
        <td><div class="row-act">
          <button class="iconbtn" title="Aperçu rapide" onclick="openLead('${r.id}')">📋</button>
          <button class="iconbtn" title="Ouvrir le dossier" onclick="openDossier('${r.id}')">⛶</button>
          <button class="iconbtn" title="Commentaires" onclick="openCommentsPreview('${r.id}')">💬</button>
          ${can('rdv_manage')?`<button class="iconbtn" title="RDV" onclick="openRdv(null,'${r.id}')">📅</button>`:''}
          ${can('leads_delete')?`<button class="iconbtn del" title="Supprimer" onclick="delRec('${r.id}')">🗑️</button>`:''}
        </div></td></tr>`;
    });
    h+=`</tbody></table>`;
  }
  document.getElementById('recTblBody').innerHTML=h;
  renderRecBulkBar();
}
let REC_LAST_LIST=[];
function toggleRecSel(id,checked){if(checked)REC_SELECTED.add(id);else REC_SELECTED.delete(id);renderRecBulkBar();syncSelectAllCheckbox();}
function toggleRecSelAll(checked){
  if(checked)REC_LAST_LIST.forEach(r=>REC_SELECTED.add(r.id));
  else REC_LAST_LIST.forEach(r=>REC_SELECTED.delete(r.id));
  document.querySelectorAll('.rec-chk').forEach(cb=>cb.checked=checked);
  renderRecBulkBar();
}
function syncSelectAllCheckbox(){
  const head=document.querySelector('#recTblBody thead input[type="checkbox"]');
  if(head)head.checked=REC_LAST_LIST.length>0&&REC_LAST_LIST.every(r=>REC_SELECTED.has(r.id));
}
function renderRecBulkBar(){
  const bar=document.getElementById('recBulkBar');if(!bar)return;
  const n=REC_SELECTED.size;
  if(!n){bar.innerHTML='';return;}
  const isAdmin=ME&&(ME.role==='superadmin'||ME.role==='admin');
  const users=getUsers().filter(u=>u.active);
  const roleGroups=[['telepro','Téléprospecteurs'],['confirmateur','Confirmateurs'],['commercial','Commerciaux / Régies'],['poseur','Poseurs'],['manager','Managers'],['admin','Administrateurs'],['superadmin','Super Admins']];
  const optHtml=roleGroups.map(([rk,lbl])=>{
    const list=users.filter(u=>u.role===rk);
    if(!list.length)return '';
    return `<optgroup label="${esc(lbl)}">${list.map(u=>`<option value="${u.id}">${esc(u.prenom+' '+u.nom)}</option>`).join('')}</optgroup>`;
  }).join('');
  bar.innerHTML=`<div class="bulk-bar">
    <span><b>${n}</b> dossier${n>1?'s':''} sélectionné${n>1?'s':''}</span>
    <select id="bulkAssignPick" style="max-width:280px">
      <option value="">— Affecter à… (par rôle) —</option>
      ${optHtml}
    </select>
    <button class="btn btn-pri btn-sm" onclick="bulkAssign()">✅ Affecter</button>
    <button class="btn btn-ghost btn-sm" onclick="openExportModal()">⬇️ Exporter la sélection</button>
    ${isAdmin?`<button class="btn btn-ghost btn-sm" style="color:#E63946;border-color:#E63946" onclick="bulkDelete()">🗑️ Supprimer la sélection</button>`:''}
    <button class="btn btn-ghost btn-sm" onclick="REC_SELECTED.clear();renderRecRows(REC_MODE,visibleRecs())">Annuler la sélection</button>
  </div>`;
}
async function bulkDelete(){
  const isAdmin=ME&&(ME.role==='superadmin'||ME.role==='admin');
  if(!isAdmin){toast('Réservé aux administrateurs','err');return;}
  const n=REC_SELECTED.size;if(!n)return;
  modalConfirm(`Supprimer ${n} dossier${n>1?'s':''} ?`,'Cette action est définitive (RDV liés et pièces jointes inclus).',async()=>{
    const ids=[...REC_SELECTED];
    let recs=getRecs();let rdvsAll=getRdvs();
    for(const id of ids){
      const rec=recs.find(x=>x.id===id);
      if(rec&&rec.docs)for(const d of rec.docs){try{if(d.path)await SUPA.storage.from(ATTACH_BUCKET).remove([d.path]);}catch(e){console.error('[storage remove]',e);}try{await idbDel(d.id);}catch(e){}}
      const linkedRdvs=rdvsAll.filter(r=>r.recordId===id);
      for(const rd of linkedRdvs)await deleteRemoteRow(K.rdv,rd.id);
      await deleteRemoteRow(K.recs,id);
    }
    recs=recs.filter(r=>!ids.includes(r.id));
    rdvsAll=rdvsAll.filter(r=>!ids.includes(r.recordId));
    save(K.recs,recs);save(K.rdv,rdvsAll);
    REC_SELECTED.clear();
    closeModal();buildNav();
    CUR==='clients'?applyRecFilter('clients'):applyRecFilter('leads');
    toast(`${n} dossier${n>1?'s':''} supprimé${n>1?'s':''} ✓`,'ok');
    logActivity('action',`🗑️ Suppression groupée de ${n} dossier(s)`);
  });
}
function bulkAssign(){
  const uid2=val('bulkAssignPick');
  if(!uid2){toast('Choisissez un utilisateur','err');return;}
  const u=userById(uid2);if(!u)return;
  const recs=getRecs();
  let n=0;
  REC_SELECTED.forEach(id=>{
    const r=recs.find(x=>x.id===id);if(!r)return;
    r.userId=uid2;r.updated=Date.now();
    r.history=r.history||[];
    r.history.push({date:Date.now(),user:(ME.prenom+' '+ME.nom).trim()||ME.code,text:`Affecté à ${u.prenom} ${u.nom} (${ROLES[u.role]||u.role})`});
    n++;
    logActivity('action',`👤 Affectation du dossier ${r.dossier||r.id} à ${u.prenom} ${u.nom}`,r.id);
  });
  save(K.recs,recs);
  if(n)createNotification(uid2,'lead_assigned',`👤 ${n} dossier${n>1?'s':''} vous ${n>1?'ont':'a'} été affecté${n>1?'s':''} par ${(ME.prenom+' '+ME.nom).trim()||ME.code}`);
  REC_SELECTED.clear();
  toast(`${n} dossier${n>1?'s':''} affecté${n>1?'s':''} à ${u.prenom} ${u.nom} ✓`,'ok');
  applyRecFilter(REC_MODE);
}
/* ---- export Leads / Clients (XLSX / XLS / CSV) ---- */
let EXPORT_COLS=null;
function openExportModal(){
  const isAdminCompta=can('fiche_deal');
  const RESTRICTED_COLS=['prime','delegataire'];
  const availCols=getCols(REC_MODE).filter(c=>COLS[c.key]&&(isAdminCompta||!RESTRICTED_COLS.includes(c.key)||(c.key==='sousstatut'&&can('sousstatut_view'))));
  if(!availCols.length){toast('Aucune colonne disponible','err');return;}
  EXPORT_COLS=availCols.map(c=>({key:c.key,checked:c.visible}));
  const hasSelection=REC_SELECTED.size>0;
  const users=getUsers().filter(u=>u.active);
  const sts=getStatuses();
  const label=REC_MODE==='clients'?'clients':'leads';
  let body=`
    <div class="fld"><label>Quels dossiers exporter ?</label>
      <select id="exp_scope" onchange="toggleExpScopeFields()">
        ${hasSelection?`<option value="selection">Sélection actuelle (${REC_SELECTED.size})</option>`:''}
        <option value="filtered">Résultats actuellement affichés (recherche/filtres en cours)</option>
        <option value="access">Filtrer par accès (utilisateur)</option>
        <option value="status">Filtrer par statut</option>
        <option value="all">Tous les ${label}</option>
      </select>
    </div>
    <div class="fld" id="exp_access_wrap" style="display:none"><label>Accès</label><select id="exp_access">${users.map(u=>`<option value="${u.id}">${esc(u.prenom+' '+u.nom)} (${ROLES[u.role]||u.role})</option>`).join('')}</select></div>
    <div class="fld" id="exp_status_wrap" style="display:none"><label>Statut</label><select id="exp_status">${sts.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
    <div class="sectitle" style="margin-top:1rem">Colonnes à exporter</div>
    <div class="cfg-list" id="exp_cols">${availCols.map((c,i)=>`<label class="cfg-item" style="cursor:pointer;display:flex;align-items:center;gap:.5rem"><input type="checkbox" ${c.visible?'checked':''} onchange="EXPORT_COLS[${i}].checked=this.checked"> ${esc(COLS[c.key].label)}</label>`).join('')}</div>
    <div class="sectitle" style="margin-top:1rem">Format du fichier</div>
    <div class="fgrid c3">
      <label class="cfg-item" style="cursor:pointer;justify-content:center"><input type="radio" name="exp_fmt" value="xlsx" checked style="margin-right:.4rem"> XLSX</label>
      <label class="cfg-item" style="cursor:pointer;justify-content:center"><input type="radio" name="exp_fmt" value="xls" style="margin-right:.4rem"> XLS</label>
      <label class="cfg-item" style="cursor:pointer;justify-content:center"><input type="radio" name="exp_fmt" value="csv" style="margin-right:.4rem"> CSV</label>
    </div>`;
  openModal('Exporter les '+label,body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="runExport()">⬇️ Télécharger</button>`,'wide');
  toggleExpScopeFields();
}
function toggleExpScopeFields(){
  const v=val('exp_scope');
  const aw=document.getElementById('exp_access_wrap'),sw=document.getElementById('exp_status_wrap');
  if(aw)aw.style.display=v==='access'?'':'none';
  if(sw)sw.style.display=v==='status'?'':'none';
}
function colExportVal(r,key){
  try{const html=COLS[key].val(r);const div=document.createElement('div');div.innerHTML=html;return div.textContent.replace(/\s+/g,' ').trim();}
  catch(e){return '';}
}
function runExport(){
  const scope=val('exp_scope');
  let recs;
  if(scope==='selection')recs=REC_LAST_LIST.filter(r=>REC_SELECTED.has(r.id));
  else if(scope==='filtered')recs=REC_LAST_LIST.slice();
  else{
    recs=visibleRecs();
    const sts=getStatuses();const cIds=sts.filter(s=>s.phase==='client').map(s=>s.id);
    recs=REC_MODE==='clients'?recs.filter(r=>cIds.includes(r.statusId)):recs.filter(r=>!cIds.includes(r.statusId));
    if(scope==='access'){const uid2=val('exp_access');if(!uid2){toast('Choisissez un accès','err');return;}recs=recs.filter(r=>r.userId===uid2);}
    else if(scope==='status'){const sid=val('exp_status');if(!sid){toast('Choisissez un statut','err');return;}recs=recs.filter(r=>r.statusId===sid);}
  }
  const cols=EXPORT_COLS.filter(c=>c.checked);
  if(!cols.length){toast('Choisissez au moins une colonne','err');return;}
  if(!recs.length){toast('Aucun dossier à exporter pour cette sélection','err');return;}
  const rows=recs.map(r=>{const o={};cols.forEach(c=>{o[COLS[c.key].label]=colExportVal(r,c.key);});return o;});
  const fmt=(document.querySelector('input[name="exp_fmt"]:checked')||{value:'xlsx'}).value;
  const ws=XLSX.utils.json_to_sheet(rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Export');
  const fname=`export_${REC_MODE}_${new Date().toISOString().slice(0,10)}.${fmt}`;
  XLSX.writeFile(wb,fname,{bookType:fmt});
  closeModal();
  toast(`Export généré : ${rows.length} dossier${rows.length>1?'s':''} ✓`,'ok');
  logActivity('action',`⬇️ Export ${fmt.toUpperCase()} de ${rows.length} dossier(s) (${REC_MODE})`);
}
/* ---- colonnes configurables (Lead/Client) ---- */
function prodNameById(id){return (getAllProducts().find(p=>p.id===id)||{}).name||'';}
function srcNameById(id){return (getSources().find(s=>s.id===id)||{}).name||'';}
const COLS={
  dossier:{label:'N° Dossier',val:r=>`<span class="dossier-tag lien-dossier" onclick="ouvrirLigne(event,'${r.id}')" title="Ouvrir le dossier">${esc(r.dossier||'—')}</span>`},
  name:{label:'Nom / Raison sociale',val:r=>{const rd=nextRdvOf(r);return `<span class="tbl-name lien-dossier" onclick="ouvrirLigne(event,'${r.id}')" title="Ouvrir le dossier">${esc(recName(r))}</span>`+(rd?`<div class="rdv-mini">📅 ${fmtDate(rd.date)}${rd.heure?' '+rd.heure:''} · ${esc(rd.type||'RDV')}</div>`:'');}},
  tel:{label:'Téléphone mobile',val:r=>esc(r.tel||'')||'—'},
  telFixe:{label:'Téléphone fixe',val:r=>esc(r.telFixe||'')||'—'},
  email:{label:'Email',val:r=>esc(r.email||'')||'—'},
  ville:{label:'Ville',val:r=>(esc(r.ville||'')||'—')+(r.dept?` <span class="muted">(${esc(r.dept)})</span>`:'')},
  dept:{label:'Département',val:r=>esc(r.dept||'')||'—'},
  adresse:{label:'Adresse du siège',val:r=>esc(r.adresse||'')||'—'},
  siret:{label:'SIRET',val:r=>esc(r.siret||'')||'—'},
  fonction:{label:'Fonction signataire',val:r=>esc(r.fonction||'')||'—'},
  nomSite:{label:'Nom du site',val:r=>esc(r.nomSite||'')||'—'},
  operation:{label:'Opération',val:r=>`<span class="muted">${esc(prodNameById(r.productId))||'—'}</span>`},
  statut:{label:'Statut',val:r=>{
    const statHtml=can('status_change')?statusInline(r):badge(r.statusId);
    if(!can('sousstatut_view'))return statHtml;
    const subs=load('egncrm_sousstatuts',[]);
    const s=subs.find(x=>x.id===r.sousStatutId);
    if(!s)return statHtml;
    return statHtml+`<div style="margin-top:3px"><span style="background:${s.color}1a;color:${s.color};border-radius:5px;padding:1px 7px;font-size:.68rem;font-weight:600">${esc(s.name)}</span></div>`;
  }},
  source:{label:'Source',val:r=>`<span class="muted">${esc(srcNameById(r.sourceId))||'—'}</span>`},
  intervenant:{label:'Intervenant',val:r=>{const u=userById(r.userId);return `<span class="muted">${u?esc(u.prenom+' '+(u.nom[0]||'')+'.'):'—'}</span>`;}},
  created:{label:'Date de création',val:r=>`<span class="muted">${r.created?new Date(r.created).toLocaleDateString('fr-FR'):''}</span>`},
  updated:{label:'Date de modification',val:r=>`<span class="muted">${r.updated?new Date(r.updated).toLocaleDateString('fr-FR'):''}</span>`},
  zone:{label:'Zone climatique',val:r=>{const z=zoneOf(recWorkAddr(r).dept);return z?`<span class="zpill z-${z}">${z}</span>`:'<span class="muted">—</span>';}},
  delegataire:{label:'Délégataire',val:r=>`<span class="muted">${esc(dealOf(r).delegataireName||'')||'—'}</span>`},
  prime:{label:'Prime CEE TTC',val:r=>primeOf(r)?`<b style="color:var(--green-deep)">${primeOf(r).toLocaleString('fr-FR')} €</b><span style="display:block;font-size:.62rem;color:var(--text-mut)">HT ${htOf(dealOf(r).prime).toLocaleString('fr-FR',{maximumFractionDigits:2})} €</span>`:'<span class="muted">—</span>'},
  sousstatut:{label:'Sous-statut admin.',val:r=>{
    if(!can('sousstatut_view'))return '';
    const subs=load('egncrm_sousstatuts',[]);
    const s=subs.find(x=>x.id===r.sousStatutId);
    return s?`<span style="background:${s.color}1a;color:${s.color};border-radius:6px;padding:2px 8px;font-size:.75rem;font-weight:600">${esc(s.name)}</span>`:'<span class="muted">—</span>';
  }}
};
const ALL_COL_KEYS=['dossier','name','tel','telFixe','email','ville','dept','adresse','siret','fonction','nomSite','operation','statut','source','intervenant','zone','delegataire','prime','created','updated'];
const DEFAULT_VISIBLE=['dossier','name','tel','ville','operation','statut','source'];
function defaultCols(){return ALL_COL_KEYS.map(k=>({key:k,visible:DEFAULT_VISIBLE.includes(k)}));}
function getCols(mode){
  const key=mode==='clients'?'egncrm_cols_clients':'egncrm_cols_leads';
  let saved=load(key,null);
  if(!saved||!Array.isArray(saved))return defaultCols();
  saved=saved.filter(c=>ALL_COL_KEYS.includes(c.key));
  const have=new Set(saved.map(c=>c.key));
  ALL_COL_KEYS.forEach(k=>{if(!have.has(k))saved.push({key:k,visible:false});});
  return saved;
}
function saveColsCfg(mode,cfg){save(mode==='clients'?'egncrm_cols_clients':'egncrm_cols_leads',cfg);}
let COLWORK=[],COLMODE='leads',COLDRAG=null;
function openColsModal(mode){
  COLMODE=mode;COLWORK=getCols(mode).map(c=>({...c}));
  const body=`<p class="muted" style="margin-bottom:.7rem">Cochez les colonnes à afficher, puis glissez (ou ↑↓) pour changer l'ordre. La colonne « Actions » reste toujours à droite. Réglage propre à <b>${mode==='clients'?'Clients':'Leads'}</b>.</p>
  <div style="text-align:right;margin-bottom:.5rem"><button class="btn btn-ghost btn-sm" onclick="colReset()">↺ Rétablir par défaut</button></div>
  <div id="colList"></div>`;
  openModal('Choix des colonnes',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="colApply()">Appliquer</button>`);
  renderColList();
}
function renderColList(){
  const el=document.getElementById('colList');if(!el)return;
  const isAdminCompta=can('fiche_deal');
  const RESTRICTED_COLS=['prime','delegataire'];
  const list=COLWORK.filter(c=>!RESTRICTED_COLS.includes(c.key)||isAdminCompta||(c.key==='sousstatut'&&can('sousstatut_view')));
  el.innerHTML='<div class="cfg-list">'+list.map((c)=>{const i=COLWORK.indexOf(c);return `<div class="cfg-item col-item" draggable="true" ondragstart="colDragStart(event,${i})" ondragover="event.preventDefault()" ondrop="colDrop(event,${i})"><span class="grip">⠿</span><label style="display:flex;align-items:center;gap:.55rem;flex:1;cursor:pointer;font-weight:600;color:var(--navy)"><input type="checkbox" ${c.visible?'checked':''} onchange="COLWORK[${i}].visible=this.checked" style="width:17px;height:17px;accent-color:var(--green-dark);cursor:pointer"> ${esc(COLS[c.key].label)}</label><span class="sp"><button class="iconbtn" onclick="colMove(${i},-1)" style="${i===0?'opacity:.3;pointer-events:none':''}">↑</button><button class="iconbtn" onclick="colMove(${i},1)" style="${i===COLWORK.length-1?'opacity:.3;pointer-events:none':''}">↓</button></span></div>`;}).join('')+'</div>';
}
function colMove(i,d){const j=i+d;if(j<0||j>=COLWORK.length)return;const t=COLWORK[i];COLWORK[i]=COLWORK[j];COLWORK[j]=t;renderColList();}
function colDragStart(e,i){COLDRAG=i;e.dataTransfer.effectAllowed='move';}
function colDrop(e,i){e.preventDefault();if(COLDRAG==null||COLDRAG===i)return;const [m]=COLWORK.splice(COLDRAG,1);COLWORK.splice(i,0,m);COLDRAG=null;renderColList();}
function colReset(){COLWORK=defaultCols();renderColList();}
function colApply(){saveColsCfg(COLMODE,COLWORK);closeModal();applyRecFilter(COLMODE);toast('Colonnes mises à jour ✓','ok');}

/* ---- page complète d'un dossier ---- */
let DOSSIER_OPEN=null;
/* Ouvre le dossier, sauf si le clic visait un champ de saisie ou un bouton
   place dans la ligne (date, menu deroulant, lien, case a cocher). */
function ouvrirLigne(ev,id,fermerModal){
  const t=ev&&ev.target;
  if(t&&t.closest&&t.closest('input,select,textarea,button,a,label,option'))return;
  if(fermerModal)closeModal();
  openDossier(id);
}
async function openDossier(id){
  const r=recById(id);if(!r){toast('Dossier introuvable','err');return;}
  DOSSIER_OPEN=id;
  // Se caler sur le segment du dossier pour résoudre statuts et opérations
  if(segOf(r)!==SEGMENT){setSegment(segOf(r));buildNav();renderSegSwitch();}
  window._dossierBack=(CUR==='clients')?'clients':'leads';
  document.getElementById('pageTitle').innerHTML=`Dossier ${esc(r.dossier||'')}`;
  document.getElementById('pageSub').textContent=recName(r);
  const locBtn=(r.dossier||'').includes('-LOC-')
    ?`<button class="btn btn-sm" style="background:#FFF4E5;color:#B96A0A;border-color:#F0C486" onclick="renumeroterDossier('${r.id}')" title="Ce numéro provisoire a été généré hors-ligne">⚠️ Attribuer un n° définitif</button>`
    :'';
  document.getElementById('pageActions').innerHTML=`${locBtn}<button class="btn btn-ghost btn-sm" onclick="go(window._dossierBack||'leads')">← Retour à la liste</button>`;
  logActivity('view',`👁️ Consultation du dossier ${r.dossier||''} — ${recName(r)}`,id);
  const isAdminCompta=can('fiche_deal')||can('fiche_compta');
  if(isAdminCompta){document.getElementById('content').innerHTML='<div class="empty"><div class="big">⏳</div>Chargement du dossier…</div>';await Promise.all([loadComptaFor(id),loadDealFor(id),loadEtudeFor(id)]);}
  renderDossier(r);
}
function renderDossier(r){
  const op=getAllProducts().find(p=>p.id===r.productId);
  const src=getSources().find(x=>x.id===r.sourceId);
  const u=userById(r.userId);
  const rdvs=getRdvs().filter(x=>x.recordId===r.id).sort((a,b)=>((a.date||'')+(a.heure||'')).localeCompare((b.date||'')+(b.heure||'')));
  const row=(l,v)=>v?`<div class="info-row"><span class="il">${esc(l)}</span><span class="iv">${esc(v)}</span></div>`:'';
  // zone climatique de l'adresse des travaux
  const wz=recWorkAddr(r);const z=zoneOf(wz.dept);
  const zoneBadge=`<div class="zone-box"><div class="zinfo"><span class="zl">Zone climatique · adresse des travaux</span><span class="zaddr">${esc([wz.ville,wz.cp?'('+wz.cp+')':''].filter(Boolean).join(' '))||'Adresse des travaux non renseignée'}</span></div><span class="zbig z-${z||'na'}">${z||'?'}</span></div>`;
  // ---- détection de doublons ----
  let doublonBanner='';
  const doublonIgnores=load('egncrm_doublon_ignore',[]);
  if(r.productId&&!doublonIgnores.includes(r.id)){
    const tel=(r.tel||'').replace(/\s/g,'');
    const siret=(r.siret||'').replace(/\s/g,'');
    const nomSite=(r.nomSite||'').trim().toLowerCase();
    const doublons=visibleRecs().filter(x=>{
      if(x.id===r.id||x.productId!==r.productId)return false;
      const xTel=(x.tel||'').replace(/\s/g,'');
      const xSiret=(x.siret||'').replace(/\s/g,'');
      const xNomSite=(x.nomSite||'').trim().toLowerCase();
      return (tel&&xTel===tel)||(siret&&xSiret===siret)||(nomSite&&xNomSite===nomSite);
    });
    if(doublons.length){
      const raisons=doublons.map(d=>{
        const tel2=(r.tel||'').replace(/\s/g,'');const siret2=(r.siret||'').replace(/\s/g,'');const ns2=(r.nomSite||'').trim().toLowerCase();
        const xTel=(d.tel||'').replace(/\s/g,'');const xSiret=(d.siret||'').replace(/\s/g,'');const xNs=(d.nomSite||'').trim().toLowerCase();
        const why=[];
        if(tel2&&xTel===tel2)why.push('même téléphone');
        if(siret2&&xSiret===siret2)why.push('même SIRET');
        if(ns2&&xNs===ns2)why.push('même nom de site');
        return `<div style="margin:.3rem 0"><a href="#" onclick="openDossier('${d.id}');return false" style="color:#fff;font-weight:700;text-decoration:underline">${esc(d.dossier||'—')} — ${esc(clientNameOf(d))}</a> <span style="opacity:.8;font-size:.75rem">(${why.join(', ')})</span></div>`;
      }).join('');
      const annuleStatut=getAllStatuses().find(s=>s.name&&s.name.toLowerCase().includes('annul'));
      doublonBanner=`<div style="background:#E63946;color:#fff;border-radius:10px;padding:12px 16px;margin-bottom:12px">
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
          <span style="font-size:1.3rem;flex-shrink:0">⚠️</span>
          <div style="flex:1"><b>Doublon détecté — même opération et :</b>${raisons}</div>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.3);padding-top:10px">
          <button onclick="ignoreDoublon('${r.id}')" style="background:rgba(255,255,255,.2);color:#fff;border:1.5px solid rgba(255,255,255,.5);border-radius:8px;padding:5px 12px;font-size:.8rem;font-weight:700;cursor:pointer">✅ Pas un doublon</button>
          ${doublons.map(d=>`<button onclick="doubonAnnulerExistant('${d.id}')" style="background:rgba(255,255,255,.15);color:#fff;border:1.5px solid rgba(255,255,255,.4);border-radius:8px;padding:5px 12px;font-size:.8rem;font-weight:700;cursor:pointer">📋 Annuler ${esc(d.dossier||d.id)}</button>`).join('')}
          <button onclick="supprimerDoublon('${r.id}')" style="background:rgba(0,0,0,.25);color:#fff;border:1.5px solid rgba(255,255,255,.3);border-radius:8px;padding:5px 12px;font-size:.8rem;font-weight:700;cursor:pointer">🗑️ Supprimer ce dossier</button>
        </div>
      </div>`;
    }
  }
  let coord=`<div class="panel"><div class="panel-h"><h3>Bénéficiaire & coordonnées</h3></div><div class="panel-b">`
    +row('Raison sociale',r.raisonSociale)+row('SIRET',r.siret)
    +row('Signataire',((r.prenom||'')+' '+(r.nom||'')).trim())+row('Fonction',r.fonction)
    +row('Téléphone mobile',r.tel)+row('Téléphone fixe',r.telFixe)+row('Email',r.email)+row('Nom du site',r.nomSite)
    +row('Adresse du siège',[r.adresse,r.cp,r.ville].filter(Boolean).join(', '))
    +(r.adresseTravauxDiff?row('Adresse des travaux',[r.adresseTravaux,r.cpTravaux,r.villeTravaux].filter(Boolean).join(', ')):'')
    +`</div></div>`;
  const subs=load('egncrm_sousstatuts',[]);
  const canSub=can('sousstatut_view');
  const curSub=subs.find(s=>s.id===r.sousStatutId);
  const sousStatutRow=canSub&&subs.length?`<div class="info-row"><span class="il">Sous-statut administratif</span><span class="iv"><select class="status-sel" style="color:${curSub?curSub.color:'#9aa5b1'};background:${curSub?curSub.color+'1a':'#f5f5f5'}" onchange="quickSousStatut('${r.id}',this.value)"><option value="">— Aucun —</option>${subs.map(s=>`<option value="${s.id}" ${r.sousStatutId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></span></div>`:canSub&&!subs.length?`<div class="info-row"><span class="il">Sous-statut administratif</span><span class="iv muted" style="font-size:.78rem">Aucun sous-statut configuré — <a href="#" onclick="go('settings');return false">Paramètres ▸ Statuts</a></span></div>`:'';
  let suivi=`<div class="panel"><div class="panel-h"><h3>Suivi commercial</h3></div><div class="panel-b">`
    +`<div class="info-row"><span class="il">Statut</span><span class="iv">${statusInline(r)}</span></div>`
    +sousStatutRow
    +row('Opération',op?op.name:'')+row('Source',src?src.name:'')+row('Intervenant',u?u.prenom+' '+u.nom:'')
    +row('Créé le',r.created?new Date(r.created).toLocaleString('fr-FR'):'')
    +row('Modifié le',r.updated?new Date(r.updated).toLocaleString('fr-FR'):'')
    +`<div class="info-row"><span class="il" style="font-weight:600">CRM devis</span><span class="iv"><select data-crm-devis="${r.id}" onchange="saveCrmDevis('${r.id}',this.value)" style="font-size:.82rem;padding:.3rem .6rem;border-radius:7px;border:1.5px solid var(--border-grey);background:var(--surface-1);color:var(--text-primary);font-weight:500"><option value="" ${!r.crmDevis?'selected':''}>— Non renseigné —</option><option value="Qhare CRM" ${r.crmDevis==='Qhare CRM'?'selected':''}>Qhare CRM</option><option value="Pixel CRM" ${r.crmDevis==='Pixel CRM'?'selected':''}>Pixel CRM</option></select></span></div>`
    +`</div></div>`;
  let opf='';
  if(op&&op.fields){
    const rows=op.fields.filter(f=>!CANON_KEYS[f.key]&&f.key!=='adresse_travaux_diff').map(f=>{const v=(r.opFields&&r.opFields[f.id])||'';return v?row(f.label,v):'';}).join('');
    // Fournisseur lié à ce dossier (depuis le catalogue stock)
    const matsLies=getMats().filter(m=>m.operationId===r.productId||(m.operation&&m.operation===op.name));
    let fournRow='';
    if(matsLies.length){
      const allFourns=[...new Set(matsLies.flatMap(m=>(m.fournisseurs||[]).map(f=>f.nom).filter(Boolean)))];
      if(allFourns.length){
        const cur=r.fournisseurDossier||'';
        fournRow=`<div class="info-row"><span class="il" style="font-weight:600">🏭 Fournisseur matériel</span><span class="iv"><select onchange="saveFournisseurDossier('${r.id}',this.value)" style="font-family:'Saira',sans-serif;font-size:.82rem;padding:.28rem .6rem;border-radius:7px;border:1.5px solid var(--border-grey);background:#fff"><option value="">— Non renseigné —</option>${allFourns.map(f=>`<option value="${esc(f)}" ${cur===f?'selected':''}>${esc(f)}</option>`).join('')}</select></span></div>`;
      }
    }
    if(rows||fournRow)opf=`<div class="panel"><div class="panel-h"><h3>Informations — ${esc(op.name)}</h3></div><div class="panel-b">${rows}${fournRow}</div></div>`;
  }
  let rappelP=`<div class="panel"><div class="panel-h"><h3>⏰ Rappel</h3></div><div class="panel-b">`;
  if(r.rappelDate){
    rappelP+=`<div class="info-row"><span class="il">Prévu le</span><span class="iv">${fmtDateLong(r.rappelDate)}${r.rappelHeure?' à '+r.rappelHeure:''}</span></div>`
      +(r.rappelNote?`<div class="info-row"><span class="il">Note</span><span class="iv">${esc(r.rappelNote)}</span></div>`:'')
      +`<button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="delRappel('${r.id}')">🗑️ Annuler le rappel</button>`;
  } else {
    rappelP+=`<div class="fgrid c3">
      <div class="fld"><label>Date</label><input type="date" id="rp_date"></div>
      <div class="fld"><label>Heure</label><input type="time" id="rp_heure"></div>
      <div class="fld"><label>Note (optionnel)</label><input id="rp_note" placeholder="ex : rappeler pour signature"></div>
    </div>
    <button class="btn btn-pri btn-sm" style="margin-top:.5rem" onclick="saveRappel('${r.id}')">💾 Fixer le rappel</button>`;
  }
  rappelP+=`</div></div>`;
  let rdvP=`<div class="panel"><div class="panel-h"><h3>Rendez-vous liés</h3>${can('rdv_manage')?`<div class="sp"><button class="btn btn-pri btn-sm" onclick="openRdv(null,'${r.id}')">+ RDV</button></div>`:''}</div><div class="panel-b">`;
  if(!rdvs.length)rdvP+=`<div class="muted">Aucun rendez-vous lié à ce dossier.</div>`;
  else rdvP+=`<div class="rdv-list">`+rdvs.map(rd=>{const ss=statById(rd.statusId);return `<div class="rdv-card" style="border-left-color:${ss?ss.color:'#7CC242'}" onclick="openRdv('${rd.id}')"><div class="rt"><span class="rn">${esc(rd.type||'RDV')}</span><span class="rtime">${fmtDateLong(rd.date)} ${rd.heure||''}</span></div><div class="rm">${esc(rd.ville||'')}${rdvWho(rd)?' • '+esc(rdvWho(rd)):''}</div></div>`;}).join('')+`</div>`;
  rdvP+=`</div></div>`;
  let hist=`<div class="panel"><div class="panel-h"><h3>Historique</h3></div><div class="panel-b">`;
  const isSuperAdmin=ME&&ME.role==='superadmin';
  if(r.history&&r.history.length)hist+=`<div class="hist" style="max-height:320px">`+r.history.map((h,i)=>`<div class="hist-item" style="display:flex;justify-content:space-between;align-items:flex-start;gap:.4rem"><div style="flex:1"><div class="hm">${new Date(h.date).toLocaleString('fr-FR')} • ${esc(h.user||'')}</div>${esc(h.text)}</div>${isSuperAdmin?`<button class="iconbtn del" style="width:22px;height:22px;font-size:.65rem;flex-shrink:0" title="Supprimer cette entrée" onclick="delHistoryEntry('${r.id}',${i})">🗑️</button>`:''}</div>`).join('')+`</div>`;
  else hist+=`<div class="muted">Aucun historique.</div>`;
  hist+=`</div></div>`;
  // documents / pièces jointes
  const dts=getDocTypes();const docList=r.docs||[];
  let docs=`<div class="panel"><div class="panel-h"><h3>📄 Documents & pièces jointes</h3></div><div class="panel-b">
    <div class="fgrid" style="align-items:end">
      <div class="fld"><label>Type de document</label><select id="doc_type">${dts.length?dts.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join(''):'<option value="">— à définir dans Paramètres —</option>'}</select></div>
      <div class="fld"><label>Fichier (PDF / image)</label><input type="file" id="doc_file" accept=".pdf,image/*"></div>
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.6rem;flex-wrap:wrap">
      <button class="btn btn-pri btn-sm" onclick="attachDoc('${r.id}')">📎 Joindre au dossier</button>
      <button class="btn btn-ghost btn-sm" onclick="openScanner('${r.id}')">📷 Scanner un document</button>
    </div>
    <div class="cfg-list" style="margin-top:1rem">`;

  if(!docList.length)docs+=`<div class="muted">Aucune pièce jointe.</div>`;
  else docList.forEach(d=>{docs+=`<div class="cfg-item"><span style="font-size:1.1rem">${/image\//.test(d.mime||'')?'🖼️':'📄'}</span><div style="flex:1;min-width:0"><div class="nm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.typeName||'Document')} — ${esc(d.filename||'')}</div><div class="muted" style="font-size:.68rem">${esc(d.user||'')} • ${new Date(d.date).toLocaleString('fr-FR')} • ${fmtSize(d.size)}</div></div><span class="sp"><button class="iconbtn" title="Voir / télécharger" onclick="viewDoc('${d.id}','${r.id}')">👁️</button><button class="iconbtn del" onclick="delDoc('${r.id}','${d.id}')">🗑️</button></span></div>`;});
  docs+=`</div>
    <div class="flex" style="flex-wrap:wrap;gap:.5rem;margin-top:1rem;border-top:1px dashed var(--border-soft);padding-top:.9rem">${(ME&&(ME.role==='superadmin'||ME.role==='admin')&&op&&op.etudeType)?`<button class="btn btn-navy btn-sm" onclick="openEtudePanel('${r.id}')">📐 Étude technique & PDF</button>`:''}<button class="btn btn-ghost btn-sm" onclick="toast('Module à configurer prochainement')">🖊️ Envoyer en signature</button></div>
  </div></div>`;
  // génération de documents (modèles créés dans Administration ▸ Documents)
  const applicableTpls=getDocTemplates().filter(t=>!t.operationIds||!t.operationIds.length||t.operationIds.includes(r.productId));
  let docsGen=`<div class="panel"><div class="panel-h"><h3>📑 Génération de documents</h3></div><div class="panel-b">`;
  if(!applicableTpls.length)docsGen+=`<div class="muted" style="font-size:.84rem">Aucun modèle disponible pour cette opération. Les modèles se créent dans Administration ▸ Documents.</div>`;
  else docsGen+=`<div class="cfg-list">`+applicableTpls.map(t=>`<div class="cfg-item"><div style="flex:1;min-width:0"><div class="nm">${esc(t.name)}</div>${t.subtitle?`<div class="muted" style="font-size:.72rem">${esc(t.subtitle)}</div>`:''}</div><button class="btn btn-pri btn-sm" onclick="genererDocFromTemplate('${t.id}','${r.id}')">📄 Générer</button></div>`).join('')+`</div>`;
  // Modeles PDF applicables a ce dossier
  const pdfTpls=getPdfTemplates().filter(t=>t.path&&(!t.operationIds||!t.operationIds.length||t.operationIds.includes(r.productId)));
  if(pdfTpls.length){
    docsGen+=`<div class="sectitle" style="margin-top:.8rem">Modèles PDF</div><div class="cfg-list">`
      +pdfTpls.map(t=>`<div class="cfg-item"><div style="flex:1;min-width:0">
        <div class="nm">📕 ${esc(t.nom||'—')}</div>
        <div class="muted" style="font-size:.7rem">${(t.champs||[]).length} champ${(t.champs||[]).length>1?'s':''} rempli${(t.champs||[]).length>1?'s':''} automatiquement</div>
      </div><button class="btn btn-pri btn-sm" onclick="genererPdfDepuisModele('${t.id}','${r.id}')">⬇️ Générer</button></div>`).join('')
      +`</div>`;
  }
  docsGen+=`</div></div>`;
  // commentaires
  const cmts=(r.comments||[]).slice().sort((a,b)=>(b.date||0)-(a.date||0));
  let comm=`<div class="panel"><div class="panel-h"><h3>Commentaires</h3><div class="sp"><span class="muted">${cmts.length} commentaire${cmts.length>1?'s':''}</span></div></div><div class="panel-b">
    <textarea id="cmt_input" placeholder="Ajouter un commentaire…" oninput="mentionInput(this)" onkeydown="mentionKeydown(this,event)" onblur="hideMentionBox()" style="width:100%;border:1.5px solid var(--border-grey);border-radius:9px;padding:.6rem .8rem;font-size:.88rem;min-height:72px;font-family:'Saira',sans-serif"></textarea>
    <div style="display:flex;align-items:center;gap:.6rem;margin-top:.5rem;flex-wrap:wrap">
      <button class="btn btn-pri btn-sm" onclick="addComment('${r.id}')">+ Ajouter le commentaire</button>
      <span class="muted" style="font-size:.72rem">Tapez <b>@</b> pour mentionner un collègue — il recevra une notification.</span>
    </div>
    <div style="margin-top:1rem;display:flex;flex-direction:column;gap:.55rem">`;
  if(!cmts.length)comm+=`<div class="muted">Aucun commentaire pour l'instant.</div>`;
  else cmts.forEach(c=>{comm+=`<div class="cmt"><div class="cmt-txt">${renderCommentText(c.text,c.mentions)}</div><div class="cmt-meta"><span>${esc(c.user||'')} · ${new Date(c.date).toLocaleString('fr-FR')}</span>${ME&&ME.role==='superadmin'?`<button class="iconbtn del" style="width:24px;height:24px;font-size:.7rem" onclick="delComment('${r.id}','${c.id}')">🗑️</button>`:''}</div></div>`;});
  comm+=`</div></div></div>`;
  // panneau DEAL (compact, placé en bas à côté des commentaires) — réservé Admin / Super Admin, comme la Comptabilité
  const isAdminCompta=can('fiche_deal');
  const delegs=getDelegataires();const deal=dealOf(r);
  let dealP='';
  if(isAdminCompta){
    dealP=`<div class="panel deal-panel"><div class="panel-h"><h3>💰 Deal <span style="font-size:.66rem;font-weight:600;color:var(--text-mut);text-transform:none">— Super Admin / Admin uniquement</span></h3>${deal.prime?`<div class="sp"><span class="deal-tag">${deal.prime.toLocaleString('fr-FR')} € TTC · HT ${htOf(deal.prime).toLocaleString('fr-FR',{maximumFractionDigits:2})} €</span></div>`:''}</div><div class="panel-b">
    <div class="deal-fields">
      <div class="fld"><label>Délégataire</label><select id="deal_deleg" onchange="dealRecalc()"><option value="">— Choisir —</option>${delegs.map(d=>`<option value="${d.id}" ${deal.delegataireId===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="fld"><label>Type de prime</label><select id="deal_type" onchange="dealRecalc()"><option value="classique" ${deal.type!=='precaire'?'selected':''}>Classique</option><option value="precaire" ${deal.type==='precaire'?'selected':''}>Précaire</option></select></div>
      <div class="fld"><label>Cumac (kWh cumac)</label><input type="number" id="deal_cumac" value="${deal.cumac!=null&&deal.cumac!==''?deal.cumac:''}" oninput="dealRecalc()" placeholder="ex : 1200000"></div>
      <div style="grid-column:1/-1;background:var(--bg-soft);border-radius:10px;padding:.6rem .85rem;margin-top:.3rem">
        <div style="font-size:.66rem;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.3rem">Détail de la prime CEE</div>
        <div id="deal_detail"></div>
      </div>
    </div>
    <div class="deal-info muted" id="deal_valoinfo"></div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.6rem">
      ${op&&op.cumac&&(op.cumac.mode==='coef'||op.cumac.mode==='multi')?`<button class="btn btn-navy btn-sm" onclick="dealAutoCumac('${r.id}')">⚡ Calculer le cumac</button>`:''}
      <button class="btn btn-pri btn-sm" onclick="saveDeal('${r.id}')">💾 Enregistrer</button>
    </div>
  </div></div>`;
  }
  const acts=`<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem">`
    +(can('leads_edit')?`<button class="btn btn-pri" onclick="editDossier('${r.id}')">✏️ Modifier le dossier</button>`:'')
    +(can('rdv_manage')?`<button class="btn btn-navy" onclick="openRdv(null,'${r.id}')">📅 Planifier un RDV</button>`:'')
    +`<button class="btn btn-ghost" onclick="openMailSend('${r.id}')">✉️ Envoyer un e-mail</button>`
    +(can('sav_view')?`<button class="btn btn-ghost" onclick="openSav()">🔧 Nouveau ticket SAV</button>`:'')
    +`</div>`;
  const comptaP=can('fiche_compta')?renderComptaPanel(r):'';
  document.getElementById('content').innerHTML=acts+doublonBanner+zoneBadge+`<div class="grid2"><div>${coord}${opf}${docs}${docsGen}</div><div>${suivi}${rappelP}${rdvP}${hist}</div></div><div class="grid-bottom">${comm}${dealP}${comptaP}</div>`;
  dealRecalc();
}
/* ---- comptabilité du dossier (Super Admin / Admin) : faux frais & rentabilité ---- */
function comptaOf(r){
  if(!COMPTA_CACHE[r.id])COMPTA_CACHE[r.id]=rowToCompta(null); // valeurs par défaut en attendant le chargement async
  return COMPTA_CACHE[r.id];
}
function surfaceFieldValue(r){
  const op=getAllProducts().find(p=>p.id===r.productId);if(!op)return 0;
  const fields=op.fields||[];
  // 1) champ standard (clé stable "surface_m2")
  let f=fields.find(x=>x.key==='surface_m2');
  let v=f?(r.opFields&&r.opFields[f.id]):null;
  // 2) repli : tout champ numérique dont le libellé contient "surface" (ex : ancien champ créé à la main avant l'ajout du champ standard)
  if(v==null||v===''){
    const alt=fields.filter(x=>x.type==='number'&&/surface/i.test(x.label||''));
    for(const a of alt){const av=r.opFields&&r.opFields[a.id];if(av!=null&&av!==''){v=av;break;}}
  }
  return parseFloat(String(v||0).replace(',','.'))||0;
}
/* ---- override manuel simple : si un montant est saisi à la main, il prend la place du calcul auto ---- */
function effectiveCost(r,key,autoFn){
  const c=comptaOf(r);
  const ovr=(c.overrides||{})[key];
  const auto=autoFn(r);
  if(ovr!=null&&ovr!=='')return{...auto,montant:parseFloat(ovr)||0,overridden:true};
  return{...auto,overridden:false};
}
function poseurCostFor(r){
  const c=comptaOf(r);
  if(!c.poseurUserId)return{mode:null,montant:0,label:'Aucun poseur assigné'};
  const fam=load('egncrm_poseurs',[]).find(f=>(f.userIds||[]).includes(c.poseurUserId));
  if(!fam)return{mode:null,montant:0,label:"Ce poseur n'appartient à aucune famille"};
  const prices=fam.prices||[];
  const rule=prices.find(p=>p.opId===r.productId)||prices.find(p=>!p.opId);
  if(!rule)return{mode:null,montant:0,label:`Aucun tarif défini pour cette opération dans « ${fam.name} »`};
  let montant=0;
  if(rule.mode==='pourcentage')montant=(c.devisTTC||0)*(rule.value||0)/100;
  else if(rule.mode==='fixe')montant=rule.value||0;
  else if(rule.mode==='jour')montant=(rule.value||0)*(c.jours||0);
  else if(rule.mode==='m2')montant=(rule.value||0)*surfaceFieldValue(r);
  const detail=rule.mode==='pourcentage'?`${rule.value}% de la marge brute`:rule.mode==='m2'?`${rule.value} €/m²`:rule.mode==='jour'?`${rule.value} €/jour`:`${rule.value} € fixe`;
  return{mode:rule.mode,montant,label:`${fam.name} — ${detail}`};
}
function callCenterCostFor(r){
  const c=comptaOf(r);
  if(!r.sourceId)return{mode:null,montant:0,label:'Aucune source / régie sur ce dossier'};
  const src=getSources().find(s=>s.id===r.sourceId);
  if(!src)return{mode:null,montant:0,label:'Source introuvable'};
  const prices=src.prices||[];
  const rule=prices.find(p=>p.opId===r.productId)||prices.find(p=>!p.opId);
  if(!rule)return{mode:null,montant:0,label:`Aucun tarif call center défini pour cette opération sur « ${src.name} »`,src};
  let montant=0;
  if(rule.mode==='rdv')montant=(rule.value||0)*(c.nbRdv||0);
  else if(rule.mode==='m2')montant=(rule.value||0)*surfaceFieldValue(r);
  else if(rule.mode==='pourcentage')montant=(c.devisTTC||0)*(rule.value||0)/100;
  const detail=rule.mode==='m2'?`${rule.value} €/m²`:rule.mode==='pourcentage'?`${rule.value}% de la marge brute`:`${rule.value} €/RDV`;
  return{mode:rule.mode,montant,label:`${src.name} — ${detail}`,src};
}
/* -- VT (Visite technique) & Auditeur : tarif fixe par opération, ajouté automatiquement selon le statut du dossier -- */
function statusNameOf(r){const st=statById(r.statusId);return st?st.name:'';}
function subAssignedFor(r,kind){
  const rdvs=rdvsOf(r).filter(x=>rdvKind(x.type)===kind&&x.subId).sort((a,b)=>((a.date||'')+(a.heure||'')).localeCompare((b.date||'')+(b.heure||'')));
  return rdvs.length?rdvs[rdvs.length-1]:null;
}
function subCostFor(r,kind){
  const listKey=kind==='vt'?'egncrm_vt':'egncrm_auditeurs';
  const label=kind==='vt'?'VT':'Audit';
  const c=comptaOf(r);
  const manualSubId=kind==='vt'?c.vtSubId:c.auditSubId;
  const list=load(listKey,[]);
  let sub=null;
  if(manualSubId)sub=list.find(x=>x.id===manualSubId)||null;
  if(!sub){
    const rdv=subAssignedFor(r,kind);
    if(!rdv)return{montant:0,active:true,label:`Aucun ${label==='VT'?'RDV Visite technique':'RDV Audit'} avec sous-traitant assigné, ni sélection manuelle`,sub:null};
    sub=list.find(x=>x.id===rdv.subId)||null;
  }
  if(!sub)return{montant:0,active:true,label:'Sous-traitant introuvable',sub:null};
  const prices=sub.prices||[];
  const rule=prices.find(p=>p.opId===r.productId)||prices.find(p=>!p.opId);
  if(!rule)return{montant:0,active:true,label:`Aucun tarif défini pour cette opération sur « ${sub.name} »`,sub};
  return{montant:rule.value||0,active:true,label:`${sub.name} — ${rule.value} € fixe`,sub};
}
function vtCostFor(r){return subCostFor(r,'vt');}
function auditCostFor(r){return subCostFor(r,'auditeur');}
/* -- produits installés : plusieurs lignes possibles (quantité, marques différentes) -- */
function produitLigneCost(r,ligne){
  const it=getItems().find(i=>i.id===ligne.produitId);if(!it)return{montant:0,label:'Produit introuvable',qty:ligne.qty||1};
  const qty=ligne.qty||1;
  const unit=it.mode==='m2'?(it.price||0)*surfaceFieldValue(r):(it.price||0);
  return{montant:unit*qty,label:it.name,unit,mode:it.mode,qty,item:it};
}
function produitsCostFor(r){
  const c=comptaOf(r);
  const lignes=(c.produits||[]).map(l=>({...l,calc:produitLigneCost(r,l)}));
  const montant=lignes.reduce((s,l)=>s+l.calc.montant,0);
  return{montant,lignes};
}
function renderComptaPanel(r){
  const c=comptaOf(r);
  const poseurs=getUsers().filter(u=>u.role==='poseur');
  const pc=effectiveCost(r,'poseur',poseurCostFor);
  const ccC=effectiveCost(r,'callcenter',callCenterCostFor);
  const vtC=effectiveCost(r,'vt',vtCostFor);
  const auditC=effectiveCost(r,'audit',auditCostFor);
  const prC=produitsCostFor(r);
  const itemsOp=getItems().filter(i=>i.opId===r.productId);
  const surf=surfaceFieldValue(r);
  const usesM2=itemsOp.some(i=>i.mode==='m2')||prC.lignes.some(l=>l.calc.mode==='m2')||ccC.mode==='m2';
  const ff=c.fauxFrais||[];
  const ffTotal=ff.reduce((s,x)=>s+(x.amount||0),0);
  const ffPoseur=ff.filter(x=>x.origin==='poseur').reduce((s,x)=>s+(x.amount||0),0);
  const ffSociete=ffTotal-ffPoseur;
  const march=marchandiseDossier(r);
  const prime=primeOf(r)||0;
  const recettes=(prime||0);
  const charges=pc.montant+ccC.montant+vtC.montant+auditC.montant+prC.montant+ffTotal+march.ttc;
  const marge=recettes-charges;
  const margePct=recettes>0?(marge/recettes*100):0;
  const poseurLocked=factureActive(r,'poseur');
  const ccLocked=factureActive(r,'callcenter');
  const vtLocked=factureActive(r,'vt');
  const auditLocked=factureActive(r,'auditeur');
  const poseurAnnule=c.facturePoseur&&c.facturePoseur.statut==='annule';
  const ccAnnule=c.factureCallCenter&&c.factureCallCenter.statut==='annule';
  const vtAnnule=c.factureVt&&c.factureVt.statut==='annule';
  const audAnnule=c.factureAudit&&c.factureAudit.statut==='annule';
  const aPayerPoseur=poseurAnnule?0:pc.montant+ffPoseur;
  const aPayerCallCenter=ccAnnule?0:ccC.montant;
  const aPayerVt=vtAnnule?0:vtC.montant;
  const aPayerAudit=audAnnule?0:auditC.montant;
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  const tvaModePoseur=effectiveTvaMode(r,'poseur');
  const tvaModeCC=effectiveTvaMode(r,'callcenter');
  const tvaModeLine=(key,n)=>{
    const tl=tvaLine(r,key,n);
    if(tl.mode==='sans_tva')return eur(tl.ttc)+`<span style="display:block;font-size:.64rem;font-weight:500;color:#5B3AAA">Sans TVA (autoentrepreneur)</span>`;
    if(tl.mode==='ht')return eur(tl.ttc)+`<span style="display:block;font-size:.64rem;font-weight:500;color:var(--text-mut)">${eur(tl.ht)} HT + ${eur(tl.tva)} TVA · récupérable</span>`;
    return eur(tl.ttc)+`<span style="display:block;font-size:.64rem;font-weight:500;color:var(--text-mut)">dont HT ${eur(tl.ht)} · TVA ${eur(tl.tva)}</span>`;
  };
  const ttcHt=n=>eur(n)+htSub(n);
  let ffRows=ff.length?ff.map(x=>`<div class="cfg-item"><span class="nm">${esc(x.label)}</span><span class="tag" style="background:${x.origin==='poseur'?'rgba(230,148,57,.15);color:#B96A0A':'rgba(90,110,130,.12);color:#5A6E82'}">${x.origin==='poseur'?'🔧 Poseur':'🏢 Société'}</span><span class="tag" style="background:rgba(230,57,70,.1);color:#E63946">${eur(x.amount)} <span style="font-size:.62rem;font-weight:500">· HT ${eur(htOf(x.amount))}</span></span><span class="sp"><button class="iconbtn del" onclick="delFauxFrais('${r.id}','${x.id}')">🗑️</button></span></div>`).join(''):`<div class="muted" style="font-size:.82rem;padding:.4rem 0">Aucun faux frais.</div>`;
  let prRows=prC.lignes.length?prC.lignes.map(l=>`<div class="cfg-item"><span class="nm">${l.calc.qty}× ${esc(l.calc.label)}</span><span class="tag" style="background:#eef0f2;color:#6b7785">${l.calc.mode==='m2'?'au m²':'à la pièce'}</span><span class="tag" style="background:rgba(45,125,210,.12);color:#2D7DD2">${eur(l.calc.montant)} <span style="font-size:.62rem;font-weight:500">· HT ${eur(htOf(l.calc.montant))}</span></span><span class="sp"><button class="iconbtn del" onclick="delProduitLigne('${r.id}','${l.id}')">🗑️</button></span></div>`).join(''):`<div class="muted" style="font-size:.82rem;padding:.4rem 0">Aucun produit ajouté.</div>`;
  const sourceAssignee=r.sourceId?getSources().find(s=>s.id===r.sourceId):null;
  return `<div class="panel" style="border:1.5px solid rgba(230,57,70,.25)">
    <div class="panel-h"><h3>💼 Comptabilité <span style="font-size:.66rem;font-weight:600;color:var(--text-mut);text-transform:none">— Super Admin / Admin uniquement</span></h3><div class="sp" style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">${factureStatutBadge(r,'poseur')}${c.facturePoseur?statutComptaSelect(r,'poseur'):''}</div></div>
    <div class="panel-b">
      ${poseurLocked?`<p class="muted" style="font-size:.74rem;color:#B96A0A;margin-bottom:.5rem">🔒 APF Poseur déjà envoyé — devis / poseur / jours verrouillés. Passez le statut à « Annulé » pour les modifier et pouvoir refacturer.</p>`:''}
      <div class="fgrid c3">
        <div class="fld"><label>Marge brute du dossier <span class="muted" style="font-size:.62rem">(TTC — sert au calcul de la commission en %)</span></label><input type="number" step="any" id="cp_devis" value="${c.devisTTC||''}" placeholder="0" ${poseurLocked?'disabled':''}></div>
        <div class="fld"><label>Poseur assigné</label><select id="cp_poseur" ${poseurLocked?'disabled':''}><option value="">— Aucun —</option>${poseurs.map(u=>`<option value="${u.id}" ${c.poseurUserId===u.id?'selected':''}>${esc(u.prenom+' '+u.nom)}</option>`).join('')}</select></div>
        <div class="fld"><label>Nombre de jours <span class="muted" style="font-size:.66rem">(si tarif journalier)</span></label><input type="number" step="any" id="cp_jours" value="${c.jours||''}" placeholder="0" ${poseurLocked?'disabled':''}></div>
      </div>
      <div class="sectitle" style="margin-top:1.1rem">Call Center <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(source / régie déjà renseignée sur le lead — ${sourceAssignee?esc(sourceAssignee.name):'aucune'})</span> ${c.factureCallCenter?statutComptaSelect(r,'callcenter'):''}</div>
      ${ccLocked?`<p class="muted" style="font-size:.74rem;color:#2D7DD2;margin-bottom:.3rem">🔒 APF Call Center déjà envoyé — nombre de RDV verrouillé. Passez le statut à « Annulé » pour le modifier et pouvoir refacturer.</p>`:''}
      <div class="fgrid c3">
        <div class="fld"><label>Nombre de RDV à facturer <span class="muted" style="font-size:.62rem">(si tarif au RDV)</span></label><input type="number" step="1" min="0" id="cp_nbrdv" value="${c.nbRdv||''}" placeholder="0" ${ccLocked?'disabled':''}></div>
      </div>
      ${!sourceAssignee?`<p class="muted" style="font-size:.72rem;color:#E63946;margin-top:.3rem">⚠️ Ce dossier n'a pas de source / régie renseignée — aucun coût Call Center ne sera calculé. Modifiez le dossier pour en choisir une.</p>`:(!(sourceAssignee.prices&&sourceAssignee.prices.length)?`<p class="muted" style="font-size:.72rem;color:#E63946;margin-top:.3rem">⚠️ La source « ${esc(sourceAssignee.name)} » n'a aucun tarif configuré (Paramètres ▸ Sources / Régies).</p>`:'')}

      <div class="sectitle" style="margin-top:1.1rem">Visite Technique &amp; Audit <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(sélection manuelle — utilisée si aucun RDV VT/Audit n'est encore créé, ou pour surcharger le RDV)</span></div>
      <div class="fgrid c3">
        <div class="fld"><label>Société VT</label><select id="cp_vtsub" ${vtLocked?'disabled':''}><option value="">— Auto (via RDV) —</option>${load('egncrm_vt',[]).map(x=>`<option value="${x.id}" ${c.vtSubId===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="fld"><label>Auditeur</label><select id="cp_audsub" ${auditLocked?'disabled':''}><option value="">— Auto (via RDV) —</option>${load('egncrm_auditeurs',[]).map(x=>`<option value="${x.id}" ${c.auditSubId===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
      </div>
      <button class="btn btn-pri btn-sm" style="margin-top:.5rem" onclick="saveCompta('${r.id}')">💾 Enregistrer</button>

      <div class="sectitle" style="margin-top:1.1rem">Faux frais</div>
      <div class="cfg-list">${ffRows}</div>
      <div class="fgrid c3" style="margin-top:.6rem">
        <div class="fld"><label>Libellé</label><input id="ff_label" placeholder="Ex : Déplacement, matériel supplémentaire…"></div>
        <div class="fld"><label>Montant TTC (€)</label><input type="number" step="any" id="ff_amount" placeholder="0"></div>
        <div class="fld"><label>Engendré par</label><select id="ff_origin"><option value="societe">🏢 Société (charge interne)</option><option value="poseur">🔧 Poseur (à lui facturer / déduire)</option></select></div>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addFauxFrais('${r.id}')">+ Ajouter un faux frais</button>

      <div class="sectitle" style="margin-top:1.1rem">Rentabilité du dossier</div>
      <p class="muted" style="font-size:.7rem;margin:.15rem 0 .45rem">Montants saisis <b>TTC</b> — TVA ${tvaRate()}% déduite automatiquement (taux modifiable dans Paramètres ▸ Société).</p>
      <div class="info-row"><span class="il">Marge brute du dossier <span class="muted" style="font-size:.68rem">(TTC — sert au calcul de la commission en %, non comptée en recette)</span></span><span class="iv muted">${ttcHt(c.devisTTC)}</span></div>
      <div class="info-row"><span class="il">Prime CEE TTC <span class="muted" style="font-size:.68rem">(recette prise en compte pour la rentabilité)</span></span><span class="iv">${ttcHt(prime)}</span></div>
      <div class="info-row">${ovLine(r,'poseur','Coût poseur'+(pc.mode?` — ${esc(pc.label)}`:''),pc.montant,c)}</div>
      <div class="info-row">${ovLine(r,'callcenter','Coût Call Center'+(ccC.mode?` — ${esc(ccC.label)}`:''),ccC.montant,c)}</div>
      <div class="info-row">${ovLine(r,'vt','Coût VT — '+esc(vtC.label),vtC.montant,c)}</div>
      <div class="info-row">${ovLine(r,'audit','Coût Audit — '+esc(auditC.label),auditC.montant,c)}</div>
      ${(function(){
        const mr=march;
        if(!r.fournisseurDossier)return `<div class="info-row"><span class="il">Marchandise <span class="muted" style="font-size:.68rem">(fournisseur non renseigné dans la fiche)</span></span><span class="iv muted">—</span></div>`;
        if(!mr.ttc)return `<div class="info-row"><span class="il">Marchandise — ${esc(mr.fournisseur)} <span class="muted" style="font-size:.68rem">(aucune quantité saisie ou tarif absent du catalogue)</span></span><span class="iv muted">—</span></div>`;
        const det=mr.lignes.map(l=>`${l.qte} ${esc(l.unite)} × ${eur(l.prix)}`).join(' · ');
        return `<div class="info-row">
          <span class="il">Marchandise — <b style="color:var(--purple)">${esc(mr.fournisseur)}</b>
            <span class="muted" style="font-size:.68rem;display:block">${esc(det)}</span></span>
          <span class="iv">${eur(mr.ttc)}
            <span class="muted" style="display:block;font-size:.64rem;font-weight:500">HT ${eur(mr.ht)} · TVA ${eur(mr.tva)}</span></span>
        </div>`;
      })()}
      <div class="info-row"><span class="il">Faux frais — Société</span><span class="iv">${ttcHt(ffSociete)}</span></div>
      <div class="info-row"><span class="il">Faux frais — Poseur</span><span class="iv">${ttcHt(ffPoseur)}</span></div>
      <div class="info-row" style="font-weight:700"><span class="il">Charges totales</span><span class="iv" style="font-weight:700">${ttcHt(charges)}</span></div>
      <div class="info-row" style="margin-top:.4rem;border-top:1.5px solid var(--border-soft);padding-top:.5rem"><span class="il" style="font-weight:800">Marge brute</span><span class="iv" style="font-weight:800;color:${marge>=0?'var(--green-deep)':'#E63946'}">${eur(marge)}${recettes>0?' ('+margePct.toFixed(1)+'%)':''}${htSub(marge)}</span></div>
      <div style="margin-top:.4rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">${factureStatutBadge(r,'poseur')}${c.facturePoseur?statutComptaSelect(r,'poseur'):''}</div>
      <div style="margin-top:.4rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">${factureStatutBadge(r,'callcenter')}${c.factureCallCenter?statutComptaSelect(r,'callcenter'):''}</div>
      <div style="margin-top:.4rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">${factureStatutBadge(r,'vt')}${c.factureVt?statutComptaSelect(r,'vt'):''}</div>
      <div style="margin-top:.4rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">${factureStatutBadge(r,'auditeur')}${c.factureAudit?statutComptaSelect(r,'auditeur'):''}</div>
      <div style="margin-top:1rem;display:flex;align-items:center;gap:.8rem;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;cursor:pointer"><input type="checkbox" id="rpt_include_deal" checked> Inclure le Deal (prime CEE) dans le rapport</label>
        <button class="btn btn-navy btn-sm" onclick="genererRapportCompta('${r.id}')">📄 Télécharger le rapport comptable (PDF)</button>
      </div>
    </div>
  </div>`;
}
function genererRapportCompta(recId){
  const r=recById(recId);if(!r)return;
  const includeDeal=(document.getElementById('rpt_include_deal')||{checked:true}).checked;
  const m=recordComptaMetrics(r);
  const s=getSettings();
  const eur=n=>(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  const op=getAllProducts().find(o=>o.id===r.productId);
  const deleg=dealOf(r).delegataireId?getDelegataires().find(d=>d.id===dealOf(r).delegataireId):null;
  const siege=`${r.adresse||''}${r.cp||r.ville?', ':''}${r.cp||''} ${r.ville||''}`.trim();
  const wa=recWorkAddr(r);
  const travaux=`${wa.adresse||''}${wa.cp||wa.ville?', ':''}${wa.cp||''} ${wa.ville||''}`.trim();
  const diffAddr=r.adresseTravauxDiff&&travaux&&travaux!==siege;
  const pc=m.pc,ccC=m.ccC,prC=m.prC,c=m.c;
  const ff=c.fauxFrais||[];
  // base de recette du rapport : prime CEE si le Deal est inclus, sinon montant du devis (affichage uniquement, ne change rien au CRM)
  const rptRecettes=includeDeal?m.recettes:(c.devisTTC||0);
  const rptMarge=rptRecettes-m.charges;
  const rptMargePct=rptRecettes>0?(rptMarge/rptRecettes*100):0;
  const dateStr=new Date().toLocaleDateString('fr-FR');
  const prRows=prC.lignes.length?prC.lignes.map(l=>`<tr><td>${l.calc.qty}× ${esc(l.calc.label)}</td><td>${l.calc.mode==='m2'?'au m²':'à la pièce'}</td><td style="text-align:right;color:#6b7785">${eur(htOf(l.calc.montant))}</td><td style="text-align:right">${eur(l.calc.montant)}</td></tr>`).join(''):`<tr><td colspan="4" style="color:#9aa5b1">Aucun produit installé</td></tr>`;
  const ffRows=ff.length?ff.map(x=>`<tr><td>${esc(x.label)}</td><td>${x.origin==='poseur'?'🔧 Poseur':'🏢 Société'}</td><td style="text-align:right;color:#6b7785">${eur(htOf(x.amount))}</td><td style="text-align:right">${eur(x.amount)}</td></tr>`).join(''):`<tr><td colspan="4" style="color:#9aa5b1">Aucun faux frais</td></tr>`;
  const doc=`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Rapport comptable — ${esc(r.dossier||'')}</title>
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1A2B3D;padding:40px;max-width:820px;margin:0 auto}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #7CC242;padding-bottom:16px;margin-bottom:22px}
    .hd-left{display:flex;align-items:center;gap:14px}
    .hd-logo{max-height:52px;max-width:150px;object-fit:contain}
    .hd h1{font-size:1.25rem;margin:0 0 4px}
    .hd .sub{color:#6b7785;font-size:.85rem}
    .dossier-num{display:inline-block;margin-top:4px;font-weight:800;font-size:.85rem;color:#7CC242;background:rgba(124,194,66,.12);padding:.2rem .6rem;border-radius:6px}
    h2{font-size:.95rem;text-transform:uppercase;letter-spacing:.03em;color:#5A6E82;border-bottom:1px solid #e5e8ec;padding-bottom:6px;margin:26px 0 10px}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:.88rem}
    .info-grid .lbl{color:#6b7785}
    .info-grid .val{font-weight:700}
    table{width:100%;border-collapse:collapse;margin-top:6px}
    th,td{padding:7px 9px;border-bottom:1px solid #e5e8ec;font-size:.85rem;text-align:left}
    th{background:#f4f6f8;font-weight:700;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:#6b7785}
    .totrow td{font-weight:800;border-top:2px solid #1A2B3D;border-bottom:none}
    .marge-box{margin-top:18px;padding:14px 18px;border-radius:10px;background:${rptMarge>=0?'rgba(124,194,66,.1)':'rgba(230,57,70,.08)'};display:flex;justify-content:space-between;align-items:center}
    .marge-box .lbl{font-weight:800;font-size:1rem}
    .marge-box .val{font-weight:800;font-size:1.3rem;color:${rptMarge>=0?'#5BA82E':'#E63946'}}
    .print-btn{margin-top:30px}
    @media print{.print-btn{display:none}}
  </style></head><body>
  <div class="hd">
    <div class="hd-left">
      ${s.logo?`<img class="hd-logo" src="${s.logo}" alt="Logo">`:''}
      <div><h1>Rapport comptable — Dossier</h1><div class="sub">${esc(s.company||'')}</div><div class="dossier-num">${esc(r.dossier||'')}</div></div>
    </div>
    <div class="sub">Édité le ${dateStr}</div>
  </div>

  <h2>Client</h2>
  <div class="info-grid">
    <div><span class="lbl">Nom / Raison sociale</span><br><span class="val">${esc(clientNameOf(r))}</span></div>
    <div><span class="lbl">Opération</span><br><span class="val">${op?esc(op.name):'—'}</span></div>
    <div><span class="lbl">Adresse${diffAddr?' (siège)':''}</span><br><span class="val">${esc(siege||'—')}</span></div>
    ${diffAddr?`<div><span class="lbl">Adresse des travaux</span><br><span class="val">${esc(travaux)}</span></div>`:''}
    ${r.tel?`<div><span class="lbl">Téléphone</span><br><span class="val">${esc(r.tel)}</span></div>`:''}
    ${r.email?`<div><span class="lbl">Email</span><br><span class="val">${esc(r.email)}</span></div>`:''}
  </div>

  ${includeDeal?`<h2>Deal utilisé</h2>
  <div class="info-grid">
    <div><span class="lbl">Délégataire</span><br><span class="val">${deleg?esc(deleg.name):'—'}</span></div>
    <div><span class="lbl">Type de prime</span><br><span class="val">${dealOf(r).type==='precaire'?'Précaire':'Classique'}</span></div>
    <div><span class="lbl">Cumac</span><br><span class="val">${dealOf(r).cumac?Number(dealOf(r).cumac).toLocaleString('fr-FR')+' kWhc':'—'}</span></div>
    <div><span class="lbl">Prime CEE (TTC)</span><br><span class="val">${eur(m.prime)}</span> <span style="color:#6b7785;font-size:.78rem">— HT ${eur(htOf(m.prime))} · TVA ${eur(tvaOf(m.prime))}</span></div>
  </div>`:''}

  <h2>Faux frais</h2>
  <table><thead><tr><th>Libellé</th><th>Origine</th><th style="text-align:right">Montant HT</th><th style="text-align:right">Montant TTC</th></tr></thead>
  <tbody>${ffRows}</tbody></table>

  <h2>Synthèse des coûts</h2>
  <p style="font-size:.76rem;color:#6b7785;margin:0 0 4px">Montants saisis TTC — TVA ${tvaRate()}% déduite automatiquement.</p>
  <table>
    <thead><tr><th>Désignation</th><th style="text-align:right">Montant HT</th><th style="text-align:right">TVA (${tvaRate()}%)</th><th style="text-align:right">Montant TTC</th></tr></thead>
    <tbody>
      <tr><td>Marge brute du dossier</td><td style="text-align:right">${eur(htOf(c.devisTTC))}</td><td style="text-align:right">${eur(tvaOf(c.devisTTC))}</td><td style="text-align:right">${eur(c.devisTTC)}</td></tr>
      <tr><td>Coût poseur${pc.mode?' — '+esc(pc.label):''}</td><td style="text-align:right">${eur(htOf(pc.montant))}</td><td style="text-align:right">${eur(tvaOf(pc.montant))}</td><td style="text-align:right">${eur(pc.montant)}</td></tr>
      <tr><td>Coût Call Center${ccC.mode?' — '+esc(ccC.label):''}</td><td style="text-align:right">${eur(htOf(ccC.montant))}</td><td style="text-align:right">${eur(tvaOf(ccC.montant))}</td><td style="text-align:right">${eur(ccC.montant)}</td></tr>
      <tr><td>Coût VT — ${esc(m.vtC.label)}</td><td style="text-align:right">${eur(htOf(m.vtC.montant))}</td><td style="text-align:right">${eur(tvaOf(m.vtC.montant))}</td><td style="text-align:right">${eur(m.vtC.montant)}</td></tr>
      <tr><td>Coût Audit — ${esc(m.auditC.label)}</td><td style="text-align:right">${eur(htOf(m.auditC.montant))}</td><td style="text-align:right">${eur(tvaOf(m.auditC.montant))}</td><td style="text-align:right">${eur(m.auditC.montant)}</td></tr>
      ${m.march.ttc?`<tr><td>Marchandise — ${esc(m.march.fournisseur)}<br><span style="font-size:.78rem;color:#6b7785">${esc(m.march.lignes.map(l=>l.qte+' '+(l.unite||'u')+' × '+eur(l.prix)).join(' · '))}</span></td><td style="text-align:right">${eur(m.march.ht)}</td><td style="text-align:right">${eur(m.march.tva)}</td><td style="text-align:right">${eur(m.march.ttc)}</td></tr>`:''}
      <tr><td>Faux frais (société + poseur)</td><td style="text-align:right">${eur(htOf(m.ffTotal))}</td><td style="text-align:right">${eur(tvaOf(m.ffTotal))}</td><td style="text-align:right">${eur(m.ffTotal)}</td></tr>
      <tr class="totrow"><td>Charges totales</td><td style="text-align:right">${eur(htOf(m.charges))}</td><td style="text-align:right">${eur(tvaOf(m.charges))}</td><td style="text-align:right">${eur(m.charges)}</td></tr>
      <tr class="totrow"><td>Recettes totales (${includeDeal?'prime CEE TTC':'marge brute du dossier'})</td><td style="text-align:right">${eur(htOf(rptRecettes))}</td><td style="text-align:right">${eur(tvaOf(rptRecettes))}</td><td style="text-align:right">${eur(rptRecettes)}</td></tr>
    </tbody>
  </table>

  <div class="marge-box"><span class="lbl">Marge brute</span><span class="val">${eur(rptMarge)}${rptRecettes>0?' ('+rptMargePct.toFixed(1)+'%)':''}<div style="font-size:.85rem;font-weight:700;opacity:.8">HT ${eur(htOf(rptMarge))} · TVA ${eur(tvaOf(rptMarge))}</div></span></div>

  <button class="print-btn" onclick="window.print()" style="padding:10px 18px;background:#7CC242;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">🖨️ Imprimer / Enregistrer en PDF</button>
  </body></html>`;
  const w=window.open('','_blank');
  if(!w){toast('Autorisez les fenêtres pop-up pour générer le rapport','err');return;}
  w.document.write(doc);w.document.close();
  logActivity('action',`📄 Rapport comptable téléchargé — dossier ${r.dossier||recId}`,recId);
}
/* ---- saisie manuelle d'un montant sur une ligne de charge ---- */
function ovLine(r,key,label,autoMontant,c){
  const ovr=(c.overrides||{})[key];
  const isManuel=(ovr!=null&&ovr!=='');
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  const badge=isManuel?`<span style="font-size:.6rem;background:rgba(230,148,57,.15);color:#B96A0A;border-radius:4px;padding:1px 5px;margin-left:3px">✏️ Manuel</span>`:'';
  const editBtn=isManuel
    ?`<button class="btn btn-ghost btn-sm" style="padding:1px 6px;font-size:.7rem;margin-left:4px" onclick="clearOverrideCompta('${r.id}','${key}')">🔄</button>`
    :`<button class="iconbtn" title="Modifier" onclick="openOverrideCompta('${r.id}','${key}',${autoMontant})" style="font-size:.7rem;padding:2px 5px;margin-left:4px">✏️</button>`;
  const montant=isManuel?(parseFloat(ovr)||0):autoMontant;
  // Toggle HT/TTC
  const tvaMode=effectiveTvaMode(r,key);
  const tl=tvaLine(r,key,montant);
  const tvaSel=`<select onchange="saveTvaMode('${r.id}','${key}',this.value)" style="font-family:'Saira',sans-serif;font-size:.68rem;font-weight:700;border:1px solid var(--border-grey);border-radius:5px;padding:1px 5px;margin-left:4px;cursor:pointer;background:#fff">
    <option value="ttc" ${tvaMode==='ttc'?'selected':''}>TTC</option>
    <option value="ht" ${tvaMode==='ht'?'selected':''}>HT</option>
    <option value="sans_tva" ${tvaMode==='sans_tva'?'selected':''}>Sans TVA</option>
  </select>`;
  const tvaInfo=tvaMode==='ht'
    ?`<span class="muted" style="font-size:.6rem;display:block;text-align:right">+ TVA ${eur(tl.tva)} → <b>${eur(tl.ttc)} TTC</b> · récup. ${eur(tl.tvaRecup)}</span>`
    :tvaMode==='sans_tva'
    ?`<span class="muted" style="font-size:.6rem;display:block;text-align:right">Sans TVA (autoentrepreneur)</span>`
    :`<span class="muted" style="font-size:.6rem;display:block;text-align:right">dont HT ${eur(tl.ht)} · TVA ${eur(tl.tva)}</span>`;
  return `<span class="il" style="display:flex;align-items:center;flex-wrap:wrap;gap:.2rem;min-width:0">${label}${badge}${editBtn}${tvaSel}</span><span class="iv" style="flex-shrink:0">${eur(montant)}${tvaInfo}</span>`;
}
function openOverrideCompta(recId,key,autoMontant){
  const r=recById(recId);if(!r)return;
  const c=comptaOf(r);const current=(c.overrides||{})[key]??autoMontant;
  const labels={poseur:'Coût poseur',callcenter:'Coût Call Center',vt:'Coût VT',audit:'Coût Audit'};
  const body=`<p class="muted" style="margin-bottom:.8rem;font-size:.84rem">Laissez le champ vide ou cliquez sur 🔄 Auto pour revenir au calcul automatique (${(autoMontant||0).toLocaleString('fr-FR',{maximumFractionDigits:2})} € depuis les paramètres).</p>
    <div class="fld"><label>Montant manuel TTC (€)</label><input type="number" step="any" id="ovr_inp" value="${current!==''?current:autoMontant}" autofocus></div>`;
  openModal('Montant manuel — '+labels[key],body,`<button class="btn btn-ghost" onclick="clearOverrideCompta('${recId}','${key}');closeModal()">🔄 Revenir à l'auto</button><button class="btn btn-pri" onclick="saveOverrideCompta('${recId}','${key}')">✅ Valider</button>`);
}
async function saveOverrideCompta(recId,key){
  const r=recById(recId);if(!r)return;
  const inp=document.getElementById('ovr_inp');
  const val=parseFloat(String(inp?inp.value:0).replace(',','.'))||0;
  const c=comptaOf(r);c.overrides=c.overrides||{};c.overrides[key]=val;
  await persistCompta(recId);closeModal();openDossier(recId);toast('Montant enregistré ✓','ok');
}
async function clearOverrideCompta(recId,key){
  const r=recById(recId);if(!r)return;
  const c=comptaOf(r);c.overrides=c.overrides||{};delete c.overrides[key];
  await persistCompta(recId);openDossier(recId);toast('Revenu au calcul automatique ✓','ok');
}
async function saveCompta(id){
  const r=recById(id);if(!r)return;
  const c=comptaOf(r);
  c.devisTTC=parseFloat(String(val('cp_devis')||'').replace(',','.'))||0;
  c.poseurUserId=val('cp_poseur')||'';
  c.jours=parseFloat(String(val('cp_jours')||'').replace(',','.'))||0;
  c.nbRdv=parseFloat(String(val('cp_nbrdv')||'').replace(',','.'))||0;
  c.vtSubId=val('cp_vtsub')||'';
  c.auditSubId=val('cp_audsub')||'';
  await persistCompta(id);openDossier(id);toast('Comptabilité enregistrée ✓','ok');
  logActivity('action',`💼 Comptabilité modifiée sur ${r.dossier||id} — devis ${c.devisTTC} €`,id);
}
async function addProduitLigne(id){
  const produitId=val('pr_pick');const qty=parseFloat(String(val('pr_qty')||'').replace(',','.'))||1;
  if(!produitId){toast('Choisissez un produit','err');return;}
  const r=recById(id);if(!r)return;
  const c=comptaOf(r);
  c.produits.push({id:uid(),produitId,qty});
  await persistCompta(id);openDossier(id);toast('Produit ajouté ✓','ok');
  logActivity('action',`📦 Produit ajouté à la compta de ${r.dossier||id}`,id);
}
async function delProduitLigne(id,lid){
  const r=recById(id);if(!r)return;
  const c=comptaOf(r);
  c.produits=(c.produits||[]).filter(p=>p.id!==lid);
  await persistCompta(id);openDossier(id);toast('Ligne supprimée','ok');
}
async function addFauxFrais(id){
  const label=val('ff_label');const amount=parseFloat(String(val('ff_amount')||'').replace(',','.'))||0;
  const origin=val('ff_origin')||'societe';
  if(!label){toast('Libellé requis','err');return;}
  if(!amount){toast('Montant requis','err');return;}
  const r=recById(id);if(!r)return;
  const c=comptaOf(r);
  c.fauxFrais.push({id:uid(),label,amount,origin,date:Date.now(),user:(ME.prenom+' '+ME.nom).trim()||ME.code});
  await persistCompta(id);openDossier(id);toast('Faux frais ajouté ✓','ok');
  logActivity('action',`💸 Faux frais ajouté sur ${r.dossier||id} : ${label} — ${amount} €`,id);
}
async function delFauxFrais(id,fid){
  const r=recById(id);if(!r)return;
  const c=comptaOf(r);
  c.fauxFrais=(c.fauxFrais||[]).filter(x=>x.id!==fid);
  await persistCompta(id);openDossier(id);toast('Faux frais supprimé','ok');
}
