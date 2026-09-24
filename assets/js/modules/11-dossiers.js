/* ============================================================
   EGN CRM — modules/11-dossiers.js
   Listes leads et clients, fiche dossier, comptabilite du dossier, marchandise
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
/* ====================================================================
   COMPTABILITÉ GLOBALE (Super Admin / Admin) — résumé & appels à facturation poseurs
   ==================================================================== */
/* ============================================================
   MARCHANDISE D'UN DOSSIER
   Croise le fournisseur choisi dans la fiche avec le catalogue :
   quantite posee x prix du fournisseur pour ce materiel.
   ============================================================ */
function marchandiseDossier(r){
  const vide={fournisseur:'',lignes:[],ht:0,tva:0,ttc:0,qte:0};
  if(!r||!r.fournisseurDossier)return vide;
  const fourn=r.fournisseurDossier;
  const t=tvaRate()/100;
  const lignes=[];
  getAllMats().forEach(m=>{
    // Le materiel doit concerner l'operation du dossier et ce fournisseur
    if(m.operationId&&m.operationId!==r.productId)return;
    const f=(m.fournisseurs||[]).find(x=>x.nom===fourn);
    if(!f)return;
    const prix=parseFloat(String(f.prix??'').replace(',','.'))||0;
    if(!prix)return;
    // Quantite posee : somme des champs configures sur le materiel
    const champs=[].concat(m.champsDossier||m.champDossier||[]).filter(Boolean);
    let qte=0;
    champs.forEach(cid=>{
      let v=r.opFields?r.opFields[cid]:null;
      if(v==null){
        const op=getAllProducts().find(p=>p.id===r.productId);
        const fd=(op?op.fields||[]:[]).find(x=>x.key===cid||x.label===cid);
        if(fd&&r.opFields)v=r.opFields[fd.id];
      }
      qte+=parseFloat(v)||0;
    });
    if(!qte)return;
    const ht=Math.round(qte*prix*100)/100;
    lignes.push({materiel:m.nom,unite:m.unite||'u',qte,prix,ht});
  });
  if(!lignes.length)return{...vide,fournisseur:fourn};
  const ht=Math.round(lignes.reduce((s,l)=>s+l.ht,0)*100)/100;
  const tva=Math.round(ht*t*100)/100;
  return{fournisseur:fourn,lignes,ht,tva,ttc:Math.round((ht+tva)*100)/100,
         qte:lignes.reduce((s,l)=>s+l.qte,0)};
}
function recordComptaMetrics(r){
  const c=comptaOf(r);
  const pc=effectiveCost(r,'poseur',poseurCostFor);
  const ccC=effectiveCost(r,'callcenter',callCenterCostFor);
  const vtC=effectiveCost(r,'vt',vtCostFor);
  const auditC=effectiveCost(r,'audit',auditCostFor);
  const prC=produitsCostFor(r);
  const ff=c.fauxFrais||[];
  const ffTotal=ff.reduce((s,x)=>s+(x.amount||0),0);
  const ffPoseur=ff.filter(x=>x.origin==='poseur').reduce((s,x)=>s+(x.amount||0),0);
  const march=marchandiseDossier(r);
  const prime=primeOf(r)||0;
  const recettes=prime;
  const charges=pc.montant+ccC.montant+vtC.montant+auditC.montant+prC.montant+ffTotal+march.ttc;
  const marge=recettes-charges;
  const margePct=recettes>0?(marge/recettes*100):0;
  const aPayerPoseur=pc.montant+ffPoseur;
  const aPayerCallCenter=ccC.montant;
  const aPayerVt=vtC.montant;
  const aPayerAudit=auditC.montant;
  return{c,pc,ccC,vtC,auditC,prC,march,ffTotal,ffPoseur,prime,recettes,charges,marge,margePct,aPayerPoseur,aPayerCallCenter,aPayerVt,aPayerAudit};
}
function hasComptaData(r){
  const c=COMPTA_CACHE[r.id];
  const hasCompta=c&&((c.devisTTC||0)>0||(c.produits&&c.produits.length)||(c.fauxFrais&&c.fauxFrais.length)||!!c.poseurUserId||!!(c.nbRdv&&r.userId));
  const hasDeal=DEAL_CACHE[r.id]&&(DEAL_CACHE[r.id].prime||DEAL_CACHE[r.id].cumac);
  return !!(hasCompta||hasDeal);
}
function clientNameOf(r){return (r.raisonSociale||((r.prenom||'')+' '+(r.nom||'')).trim()||r.dossier||'Dossier');}
/* -- sous-statuts de facturation (calculés automatiquement, non modifiables à la main) -- */
const AGENT_TYPES={
  poseur:{label:'Poseur',isSource:false,factureField:'facturePoseur',agentIdFn:r=>comptaOf(r).poseurUserId,montantFn:m=>m.aPayerPoseur,getAgent:id=>userById(id),agentName:u=>u?u.prenom+' '+u.nom:'',listAgents:()=>getUsers().filter(u=>u.role==='poseur'),color:'#B96A0A',icon:'🔧'},
  callcenter:{label:'Call Center (Source / Régie)',isSource:true,factureField:'factureCallCenter',agentIdFn:r=>r.sourceId,montantFn:m=>m.aPayerCallCenter,getAgent:id=>getSources().find(s=>s.id===id),agentName:s=>s?s.name:'',listAgents:()=>getSources(),color:'#2D7DD2',icon:'📞'},
  vt:{label:'Visite Technique',isSource:true,factureField:'factureVt',agentIdFn:r=>comptaOf(r).vtSubId||(subAssignedFor(r,'vt')||{}).subId||'',montantFn:m=>m.aPayerVt,getAgent:id=>load('egncrm_vt',[]).find(x=>x.id===id),agentName:x=>x?x.name:'',listAgents:()=>load('egncrm_vt',[]),color:'#3D9970',icon:'🧰'},
  auditeur:{label:'Auditeur',isSource:true,factureField:'factureAudit',agentIdFn:r=>comptaOf(r).auditSubId||(subAssignedFor(r,'auditeur')||{}).subId||'',montantFn:m=>m.aPayerAudit,getAgent:id=>load('egncrm_auditeurs',[]).find(x=>x.id===id),agentName:x=>x?x.name:'',listAgents:()=>load('egncrm_auditeurs',[]),color:'#8E44AD',icon:'📝'}
};
/* ============================================================
   ACOMPTES VERSES AUX INTERVENANTS
   Un versement credite le compte de l'intervenant, une imputation
   sur un appel a facturation le debite. Le solde est toujours
   recalcule, jamais stocke : aucun risque de divergence.
   ============================================================ */
const getAcomptes=()=>load('egncrm_acomptes',[]);
function saveAcomptes(v){save('egncrm_acomptes',v);}
/* Solde disponible d'un intervenant : ce qu'il reste d'avance a imputer */
function soldeAcompte(type,agentId){
  if(!agentId)return 0;
  const l=getAcomptes().filter(a=>a.type===type&&a.agentId===agentId);
  const verse=l.filter(a=>a.nature==='versement').reduce((s,a)=>s+(a.montant||0),0);
  const conso=l.filter(a=>a.nature==='consommation').reduce((s,a)=>s+(a.montant||0),0);
  return Math.round((verse-conso)*100)/100;
}
/* Detail du compte d'un intervenant */
function compteAcompte(type,agentId){
  const l=getAcomptes().filter(a=>a.type===type&&a.agentId===agentId)
    .sort((a,b)=>(b.date||0)-(a.date||0));
  const verse=l.filter(a=>a.nature==='versement').reduce((s,a)=>s+(a.montant||0),0);
  const conso=l.filter(a=>a.nature==='consommation').reduce((s,a)=>s+(a.montant||0),0);
  return{lignes:l,verse,conso,solde:Math.round((verse-conso)*100)/100};
}
/* Tous les intervenants ayant un mouvement d'acompte */
function comptesAvecAcompte(){
  const map={};
  getAcomptes().forEach(a=>{
    const cle=a.type+'|'+a.agentId;
    map[cle]=map[cle]||{type:a.type,agentId:a.agentId,agentName:a.agentName||'',verse:0,conso:0};
    if(a.nature==='versement')map[cle].verse+=a.montant||0;
    else map[cle].conso+=a.montant||0;
  });
  return Object.values(map).map(x=>({...x,solde:Math.round((x.verse-x.conso)*100)/100}))
    .sort((a,b)=>b.solde-a.solde);
}
/* Enregistre l'imputation d'un acompte sur un appel a facturation */
function imputerAcompte(type,agentId,agentName,montant,factureId,apfNum){
  if(!montant||montant<=0)return;
  const l=getAcomptes();
  l.push({id:uid(),nature:'consommation',type,agentId,agentName,
    montant:Math.round(montant*100)/100,date:Date.now(),
    factureId,apfNum,user:(ME.prenom+' '+ME.nom).trim()||ME.code});
  saveAcomptes(l);
}
const STATUT_COMPTA={transmis:'Transmis',recu:'Reçu',valide:'Validé',paye:'Payé',annule:'Annulé'};
const STATUT_COMPTA_COLOR={transmis:'grey',recu:'blue',valide:'blue',paye:'green',annule:'red'};
// Un statut "actif" = déjà envoyé et non annulé -> verrouille l'édition et exclut des futurs appels à facturation.
/* Restant dû sur une ligne de charge, en TTC, réparti entre
   « à facturer » (aucun APF) et « facturé non payé » (APF émis, pas encore soldé).
   Source unique pour le résumé comptable et le Dashboard Coco. */
function resteDu(r,type,montant){
  const key=type==='auditeur'?'audit':type;
  const ttc=tvaLine(r,key,montant||0).ttc;
  const vide={aFacturer:0,enAttente:0};
  if(!ttc)return vide;
  const f=comptaOf(r)[AGENT_TYPES[type].factureField];
  if(!f)return{aFacturer:ttc,enAttente:0};      // pas encore d'APF
  if(f.statut==='annule')return vide;            // facturation annulée
  const fac=(FACTURES_CACHE||[]).find(x=>x.id===f.factureId);
  if(fac&&(fac.paiements||{}).statut_apf==='paye')return vide; // soldé
  return{aFacturer:0,enAttente:ttc};             // APF émis, en attente de paiement
}
function factureActive(r,type){const c=comptaOf(r);const f=c[AGENT_TYPES[type].factureField];return !!(f&&f.statut!=='annule');}
function factureStatut(r,type){return factureActive(r,type)?'facture':'non_facture';}
function factureStatutBadge(r,type){
  const at=AGENT_TYPES[type];
  const c=comptaOf(r);
  const f=c[at.factureField];
  if(f&&f.statut&&f.statut!=='annule'){
    const st=f.statut||'transmis';
    return `<span class="pill ${STATUT_COMPTA_COLOR[st]||'grey'}">${at.icon} ${at.label} — ${STATUT_COMPTA[st]||st} (${new Date(f.date).toLocaleDateString('fr-FR')})</span>`;
  }
  return `<span class="pill grey">${at.icon} ${at.label} — en attente de facturation</span>`;
}
async function updateFactureStatut(recId,type,statut){
  const r=recById(recId);if(!r)return;
  const c=comptaOf(r);const at=AGENT_TYPES[type];
  if(!c[at.factureField]){toast('Aucune facture pour ce type sur ce dossier','err');return;}
  c[at.factureField].statut=statut;
  await persistCompta(recId);
  logActivity('action',`📄 Statut compta (${at.label}) du dossier ${r.dossier||recId} → ${STATUT_COMPTA[statut]||statut}`,recId);
  toast(`Statut mis à jour : ${STATUT_COMPTA[statut]||statut}${statut==='annule'?' — montant retiré du total à verser, dossier de nouveau facturable':''}`,'ok');
  if(COMPTA_TAB)renderComptaTabs();
  if(DOSSIER_OPEN===recId)openDossier(recId);
}
function statutComptaSelect(r,type){
  const at=AGENT_TYPES[type];const c=comptaOf(r);const f=c[at.factureField];
  if(!f)return '';
  return `<select class="statut-compta-sel" onchange="updateFactureStatut('${r.id}','${type}',this.value)" style="font-size:.72rem;padding:.2rem .4rem;border-radius:6px;border:1px solid var(--border-grey)">${Object.entries(STATUT_COMPTA).map(([k,l])=>`<option value="${k}" ${(f.statut||'transmis')===k?'selected':''}>${l}</option>`).join('')}</select>`;
}
let COMPTA_TAB='resume',FACT_TYPE='poseur',FACT_AGENT='',COMPTA_LOADED=false;
let FACT_SRC='',FACT_OP=''; // filtres facultatifs de l'appel a facturation
let FACT_Q='',FACT_DU='',FACT_AU=''; // recherche client et periode d'installation
let FACT_FOCUS=null;
function setFactFiltre(cle,el){
  if(cle==='q'){FACT_Q=el.value;FACT_FOCUS=el.selectionStart||0;}
  else if(cle==='du')FACT_DU=el.value;
  else FACT_AU=el.value;
  renderComptaTabs();
  if(FACT_FOCUS!==null){
    const i=document.getElementById('fact_q');
    if(i){i.focus();try{i.setSelectionRange(FACT_FOCUS,FACT_FOCUS);}catch(e){}}
    FACT_FOCUS=null;
  }
}
function resetFactFiltres(){FACT_SRC='';FACT_OP='';FACT_Q='';FACT_DU='';FACT_AU='';renderComptaTabs();}
/* Date d'installation ramenee a un horodatage, pour comparer une periode */
function tsInstallation(r){
  const d=dateInstallation(r);if(!d)return null;
  const s=String(d).trim();
  const iso=s.includes('/')?(()=>{const p=s.split('/');return p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');})():s;
  const t=new Date(iso+'T00:00:00').getTime();
  return isNaN(t)?null:t;
}
async function renderComptaGlobal(){
  document.getElementById('pageActions').innerHTML='';
  if(!COMPTA_LOADED){
    document.getElementById('content').innerHTML='<div class="empty"><div class="big">⏳</div>Chargement de la comptabilité depuis Supabase…</div>';
    await Promise.all([loadAllCompta(),loadFactures(),loadAllDeal()]);
    COMPTA_LOADED=true;
  } else {
    await Promise.all([loadAllDeal(),loadFactures()]);
  }
  renderComptaTabs();
}
function renderComptaTabs(){
  const tabs=[['resume','Résumé global','compta_resume'],['facturation','Appels à facturation','compta_facturation'],['paiements','Suivi des paiements','compta_paiements'],['delegataires','Suivi des encaissements','compta_delegataires'],['acomptes','Acomptes','compta_resume'],['tva','TVA','compta_tva_payer']].filter(t=>can(t[2]));
  if(!tabs.length){document.getElementById('content').innerHTML=`<div class="empty"><div class="big">🔒</div>Aucun onglet de comptabilité ne vous est accessible.</div>`;return;}
  if(!tabs.some(t=>t[0]===COMPTA_TAB))COMPTA_TAB=tabs[0][0];
  let h=segBanner();
  h+=`<div class="tabs">`+tabs.map(t=>`<button class="tab ${COMPTA_TAB===t[0]?'act':''}" onclick="COMPTA_TAB='${t[0]}';RESUME_VUE='';DELEG_VUE='';CHARGES_POSTE='';CHARGES_AGENT='';CHARGES_FOURN='';CA_DELEG='';renderComptaTabs()">${t[1]}</button>`).join('')+`</div><div id="comptaBody"></div>`;
  document.getElementById('content').innerHTML=h;
  if(COMPTA_TAB==='resume')renderComptaResume();
  else if(COMPTA_TAB==='facturation')renderComptaFacturation();
  else if(COMPTA_TAB==='paiements')renderComptaPaiements();
  else if(COMPTA_TAB==='delegataires')renderComptaDelegataires();
  else if(COMPTA_TAB==='acomptes')renderComptaAcomptes();
  else if(COMPTA_TAB==='tva')renderComptaTva();
}
/* Liste les dossiers dont une charge n'a pas d'intervenant assigné */
function openNonAssignes(label,recIds){
  const ids=Array.isArray(recIds)?recIds:[];
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  let b=`<p class="muted" style="font-size:.82rem;margin-bottom:.8rem">Ces dossiers ont un montant à verser mais aucun intervenant sélectionné dans leur fiche. Tant qu'il n'est pas renseigné, ils ne peuvent pas être intégrés à un appel à facturation.</p>`;
  if(!ids.length)b+=`<div class="empty"><div class="big">✅</div>Aucun dossier concerné.</div>`;
  else{
    b+=`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>N° Dossier</th><th>Client</th><th>Opération</th><th>Statut</th><th class="r">Montant dû</th></tr></thead><tbody>`;
    ids.forEach(id=>{
      const r=recById(id);if(!r)return;
      const m=recordComptaMetrics(r);
      const op=getAllProducts().find(o=>o.id===r.productId);
      const st=statById(r.statusId);
      const montants={'Poseur non assigné':m.aPayerPoseur,'Source non assignée':m.aPayerCallCenter,'Société VT non assignée':m.aPayerVt,'Auditeur non assigné':m.aPayerAudit};
      const types={'Poseur non assigné':'poseur','Source non assignée':'callcenter','Société VT non assignée':'vt','Auditeur non assigné':'auditeur'};
      const d=resteDu(r,types[label]||'poseur',montants[label]||0);
      b+=`<tr style="cursor:pointer" onclick="ouvrirLigne(event,'${r.id}',true)">
        <td><span class="dossier-tag">${esc(r.dossier||'—')}</span></td>
        <td style="font-weight:700">${esc(clientNameOf(r))}</td>
        <td class="muted">${op?esc(op.name):'—'}</td>
        <td>${st?`<span style="background:${st.color||'#ddd'}22;color:${st.color||'#666'};border-radius:5px;padding:1px 7px;font-size:.72rem;font-weight:700">${esc(st.name)}</span>`:'—'}</td>
        <td style="text-align:right;font-weight:800">${eur(d.aFacturer+d.enAttente)}</td>
      </tr>`;
    });
    b+=`</tbody></table></div><p class="muted" style="font-size:.75rem;margin-top:.6rem">Cliquez sur une ligne pour ouvrir le dossier et compléter sa comptabilité.</p>`;
  }
  openModal('⚠️ '+esc(label),b,`<button class="btn btn-ghost" onclick="closeModal()">Fermer</button>`,'wide');
}
/* Agrégation comptable unique — utilisée par le résumé ET le Dashboard Coco */
/* Filtre par opération, partagé par le résumé comptable et le Dashboard Coco */
let COMPTA_OP='';
function setComptaOp(v,cb){COMPTA_OP=v;if(cb&&typeof window[cb]==='function')window[cb]();}
function opFilterBar(cb){
  const dispo=[...new Set(segRecs().filter(hasComptaData).map(r=>r.productId).filter(Boolean))]
    .map(id=>getAllProducts().find(o=>o.id===id)).filter(Boolean)
    .sort((a,b)=>a.name.localeCompare(b.name));
  if(!dispo.length)return '';
  if(COMPTA_OP&&!dispo.some(o=>o.id===COMPTA_OP))COMPTA_OP='';
  const fs="font-family:'Saira',sans-serif;font-size:.8rem;border:1.5px solid var(--border-grey);border-radius:8px;padding:.35rem .7rem;background:#fff;outline:none;font-weight:700";
  return `<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:.9rem">
    <span style="font-size:.7rem;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.5px">Opération</span>
    <select onchange="setComptaOp(this.value,'${cb}')" style="${fs}">
      <option value="">Toutes les opérations</option>
      ${dispo.map(o=>`<option value="${o.id}" ${COMPTA_OP===o.id?'selected':''}>${esc(o.name)}</option>`).join('')}
    </select>
    ${COMPTA_OP?`<span style="font-size:.74rem;font-weight:700;background:rgba(45,125,210,.12);color:var(--blue);border-radius:6px;padding:2px 9px">Chiffres filtrés</span>
      <button class="btn btn-ghost btn-sm" style="font-size:.72rem" onclick="setComptaOp('','${cb}')">✕ Tout afficher</button>`:''}
  </div>`;
}
function comptaTotaux(){
  const NONE_KEY='__none__';
  const recs=segRecs().filter(hasComptaData).filter(r=>!COMPTA_OP||r.productId===COMPTA_OP);
  let totRecettes=0,totCharges=0,totMarge=0;
  const byPoseur={},byCc={},byVt={},byAud={},byOp={};
  const tvaModesByFam={poseur:{},cc:{},vt:{},aud:{}};
  const rows=recs.map(r=>{
    const m=recordComptaMetrics(r);
    totRecettes+=m.recettes;totCharges+=m.charges;totMarge+=m.marge;
    const cc=comptaOf(r);
    const poseurAnnule=cc.facturePoseur&&cc.facturePoseur.statut==='annule';
    const ccAnnule=cc.factureCallCenter&&cc.factureCallCenter.statut==='annule';
    const vtAnnule=cc.factureVt&&cc.factureVt.statut==='annule';
    const audAnnule=cc.factureAudit&&cc.factureAudit.statut==='annule';
    const du=(t,montant)=>{const d=resteDu(r,t,montant);return d.aFacturer+d.enAttente;};
    // Une charge sans intervenant assigné est regroupée sous NONE pour que rien ne disparaisse du total
    const add=(obj,k,t,montant,modeKey,famObj)=>{
      const v=du(t,montant);
      if(!v&&!k)return;
      const key=k||NONE_KEY;
      obj[key]=obj[key]||{nb:0,aPayer:0,recIds:[]};obj[key].nb++;obj[key].aPayer+=v;obj[key].recIds.push(r.id);
      if(k)famObj[k]=effectiveTvaMode(r,modeKey);
    };
    add(byPoseur,cc.poseurUserId,'poseur',m.aPayerPoseur,'poseur',tvaModesByFam.poseur);
    add(byCc,r.sourceId,'callcenter',m.aPayerCallCenter,'callcenter',tvaModesByFam.cc);
    add(byVt,m.vtC.sub&&m.vtC.sub.id,'vt',m.aPayerVt,'vt',tvaModesByFam.vt);
    add(byAud,m.auditC.sub&&m.auditC.sub.id,'auditeur',m.aPayerAudit,'audit',tvaModesByFam.aud);
    const opk=r.productId||'';byOp[opk]=byOp[opk]||{nb:0,recettes:0,charges:0,marge:0};byOp[opk].nb++;byOp[opk].recettes+=m.recettes;byOp[opk].charges+=m.charges;byOp[opk].marge+=m.marge;
    return{r,m};
  }).sort((a,b)=>(b.r.updated||0)-(a.r.updated||0));
  const margePct=totRecettes>0?(totMarge/totRecettes*100):0;
  const sumPoseur=Object.values(byPoseur).reduce((s,x)=>s+x.aPayer,0);
  const sumCc=Object.values(byCc).reduce((s,x)=>s+x.aPayer,0);
  const sumVt=Object.values(byVt).reduce((s,x)=>s+x.aPayer,0);
  const sumAud=Object.values(byAud).reduce((s,x)=>s+x.aPayer,0);
  return{recs,rows,totRecettes,totCharges,totMarge,margePct,byPoseur,byCc,byVt,byAud,byOp,tvaModesByFam,sumPoseur,sumCc,sumVt,sumAud,NONE_KEY};
}
/* Detail des recettes, dossier par dossier, avec la decomposition de la prime */
let CA_DELEG='';
function setCaDeleg(v){CA_DELEG=v;renderComptaResume();}
/* ---- Onglet Acomptes ---- */
function renderComptaAcomptes(){
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  const peut=can('compta_acomptes');
  const comptes=comptesAvecAcompte();
  const totVerse=comptes.reduce((s,x)=>s+x.verse,0);
  const totConso=comptes.reduce((s,x)=>s+x.conso,0);
  const totSolde=Math.round((totVerse-totConso)*100)/100;
  const actifs=comptes.filter(x=>x.solde>0).length;

  let h=`<div class="kpis">
    <div class="kpi"><div class="kico">💸</div><div class="klab">Acomptes versés</div><div class="kval">${eur(totVerse)}</div><div class="ksub">${comptes.length} intervenant${comptes.length>1?'s':''}</div></div>
    <div class="kpi"><div class="kico">📉</div><div class="klab">Déjà imputé</div><div class="kval">${eur(totConso)}</div><div class="ksub">déduit d'appels à facturation</div></div>
    <div class="kpi accent"><div class="kico">💼</div><div class="klab">Avance restante</div><div class="kval">${eur(totSolde)}</div><div class="ksub">${actifs} compte${actifs>1?'s':''} avec du disponible</div></div>
  </div>`;

  if(peut){
    const inp="font-family:'Saira',sans-serif;font-size:.85rem;border:1.5px solid var(--border-grey);border-radius:9px;padding:.45rem .7rem;background:#fff;outline:none";
    h+=`<div class="panel"><div class="panel-h"><h3>Verser un acompte</h3></div><div class="panel-b">
      <div class="fgrid">
        <div class="fld"><label>Type d'intervenant</label>
          <select id="ac_type" onchange="majAgentsAcompte()" style="${inp}">
            ${Object.entries(AGENT_TYPES).map(([k,v])=>`<option value="${k}">${v.icon||''} ${esc(v.label)}</option>`).join('')}
          </select></div>
        <div class="fld"><label>Bénéficiaire</label><select id="ac_agent" style="${inp}"></select></div>
        <div class="fld"><label>Montant versé (€)</label><input id="ac_montant" type="number" step="any" placeholder="0" style="${inp}"></div>
        <div class="fld"><label>Date du versement</label><input id="ac_date" type="date" value="${new Date().toISOString().slice(0,10)}" style="${inp}"></div>
        <div class="fld"><label>Référence <span class="muted" style="font-size:.62rem;text-transform:none;letter-spacing:0">virement, chèque…</span></label><input id="ac_ref" style="${inp}"></div>
        <div class="fld"><label>Notes</label><input id="ac_notes" style="${inp}"></div>
      </div>
      <button class="btn btn-pri btn-sm" style="margin-top:.7rem" onclick="enregistrerAcompte()">💸 Enregistrer l'acompte</button>
    </div></div>`;
  }

  // Comptes par intervenant
  h+=`<div class="panel"><div class="panel-h"><h3>Comptes par intervenant</h3></div><div class="panel-b">`;
  if(!comptes.length)h+=`<div class="empty"><div class="big">💼</div>Aucun acompte enregistré.</div>`;
  else{
    h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Intervenant</th><th>Type</th><th class="r">Versé</th><th class="r">Imputé</th><th class="r">Avance restante</th><th class="r">Actions</th>
    </tr></thead><tbody>`;
    comptes.forEach(x=>{
      const at=AGENT_TYPES[x.type]||{label:x.type};
      h+=`<tr>
        <td style="font-weight:700">${esc(x.agentName||'—')}</td>
        <td class="muted">${at.icon||''} ${esc(at.label||'')}</td>
        <td style="text-align:right">${eur(x.verse)}</td>
        <td style="text-align:right;color:var(--text-mut)">${eur(x.conso)}</td>
        <td style="text-align:right;font-weight:800;color:${x.solde>0?'var(--green-deep)':'var(--text-mut)'}">${x.solde>0?eur(x.solde):'Soldé ✓'}</td>
        <td style="text-align:right"><button class="btn btn-ghost btn-sm" style="font-size:.72rem" onclick="voirCompteAcompte('${x.type}','${x.agentId}')">👁️ Détail</button></td>
      </tr>`;
    });
    h+=`<tr style="background:#f8faf5;font-weight:800"><td colspan="2">Total</td>
      <td style="text-align:right">${eur(totVerse)}</td>
      <td style="text-align:right">${eur(totConso)}</td>
      <td style="text-align:right;color:var(--green-deep)">${eur(totSolde)}</td><td></td></tr>`;
    h+=`</tbody></table></div>`;
  }
  h+=`</div></div>`;
  document.getElementById('comptaBody').innerHTML=h;
  majAgentsAcompte();
}
/* Liste des beneficiaires selon le type choisi */
function majAgentsAcompte(){
  const sel=document.getElementById('ac_agent');if(!sel)return;
  const t=(document.getElementById('ac_type')||{}).value||'poseur';
  const at=AGENT_TYPES[t];
  const liste=at.listAgents?at.listAgents():[];
  sel.innerHTML=`<option value="">— Choisir —</option>`
    +liste.map(a=>`<option value="${a.id}">${esc(at.agentName(a)||'')}</option>`).join('');
}
function enregistrerAcompte(){
  const type=(document.getElementById('ac_type')||{}).value||'';
  const agentId=(document.getElementById('ac_agent')||{}).value||'';
  const montant=parseFloat((document.getElementById('ac_montant')||{}).value||0)||0;
  if(!agentId){toast('Choisissez le bénéficiaire','err');return;}
  if(montant<=0){toast('Saisissez un montant','err');return;}
  const at=AGENT_TYPES[type];
  const agentName=at.agentName(at.getAgent(agentId))||'';
  const d=(document.getElementById('ac_date')||{}).value;
  const l=getAcomptes();
  l.push({id:uid(),nature:'versement',type,agentId,agentName,
    montant:Math.round(montant*100)/100,
    date:d?new Date(d+'T12:00:00').getTime():Date.now(),
    ref:((document.getElementById('ac_ref')||{}).value||'').trim(),
    notes:((document.getElementById('ac_notes')||{}).value||'').trim(),
    user:(ME.prenom+' '+ME.nom).trim()||ME.code});
  saveAcomptes(l);
  toast(`Acompte de ${montant.toLocaleString('fr-FR')} € enregistré ✓`,'ok');
  renderComptaAcomptes();
}
/* Detail des mouvements d'un compte */
function voirCompteAcompte(type,agentId){
  const eur=n=>(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  const c=compteAcompte(type,agentId);
  const at=AGENT_TYPES[type]||{label:type};
  const nom=(c.lignes[0]||{}).agentName||'';
  let b=`<div style="display:flex;gap:1rem;flex-wrap:wrap;background:${c.solde>0?'#EFF7E8':'#EEF1F4'};border-radius:10px;padding:.7rem 1rem;margin-bottom:.9rem;font-size:.84rem">
    <div><span class="muted" style="font-size:.7rem;display:block">Intervenant</span><b>${esc(nom)}</b></div>
    <div><span class="muted" style="font-size:.7rem;display:block">Type</span><b>${esc(at.label||'')}</b></div>
    <div><span class="muted" style="font-size:.7rem;display:block">Versé</span><b>${eur(c.verse)}</b></div>
    <div><span class="muted" style="font-size:.7rem;display:block">Imputé</span><b>${eur(c.conso)}</b></div>
    <div><span class="muted" style="font-size:.7rem;display:block">Avance restante</span><b style="color:${c.solde>0?'var(--green-deep)':'var(--text-mut)'}">${eur(c.solde)}</b></div>
  </div>`;
  b+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Date</th><th>Mouvement</th><th>Référence</th><th class="r">Montant</th>
  </tr></thead><tbody>`;
  c.lignes.forEach(a=>{
    const versement=a.nature==='versement';
    b+=`<tr>
      <td class="muted">${new Date(a.date).toLocaleDateString('fr-FR')}</td>
      <td><span style="font-size:.72rem;font-weight:700;border-radius:5px;padding:1px 8px;${versement?'background:#E6F7F0;color:#0F6E56':'background:#FFF4E5;color:#B96A0A'}">${versement?'💸 Versement':'📉 Imputé sur APF'}</span>
        ${a.notes?`<div class="muted" style="font-size:.7rem">${esc(a.notes)}</div>`:''}</td>
      <td class="muted" style="font-size:.78rem">${esc(a.apfNum||a.ref||'—')}</td>
      <td style="text-align:right;font-weight:800;color:${versement?'var(--green-deep)':'#B96A0A'}">${versement?'+':'−'} ${eur(a.montant)}</td>
    </tr>`;
  });
  b+=`</tbody></table></div>`;
  if(can('compta_acomptes')&&c.lignes.some(a=>a.nature==='versement')){
    b+=`<p class="muted" style="font-size:.75rem;margin-top:.6rem">Un versement saisi par erreur peut être annulé depuis cette liste.</p>
    <div class="cfg-list" style="margin-top:.3rem">`
      +c.lignes.filter(a=>a.nature==='versement').map(a=>`<div class="cfg-item">
        <span class="nm" style="flex:1">${new Date(a.date).toLocaleDateString('fr-FR')} — ${eur(a.montant)}${a.ref?' · '+esc(a.ref):''}</span>
        <button class="iconbtn del" title="Annuler ce versement" onclick="supprimerAcompte('${a.id}','${type}','${agentId}')">🗑️</button>
      </div>`).join('')+`</div>`;
  }
  openModal('💼 Compte — '+esc(nom),b,`<button class="btn btn-ghost" onclick="closeModal()">Fermer</button>`,'wide');
}
function supprimerAcompte(id,type,agentId){
  const a=getAcomptes().find(x=>x.id===id);if(!a)return;
  modalConfirm('Annuler ce versement ?',
    `${(a.montant||0).toLocaleString('fr-FR')} € du ${new Date(a.date).toLocaleDateString('fr-FR')}. Les imputations déjà faites sur des APF ne sont pas modifiées.`,
    async()=>{
      saveAcomptes(getAcomptes().filter(x=>x.id!==id));
      await deleteRemoteRow('egncrm_acomptes',id);
      closeModal();renderComptaAcomptes();toast('Versement annulé','ok');
    });
}
function renderDetailRecettes(T,eur){
  const toutes=T.recs.filter(matchResumeQ).map(r=>({r,k:primeDetailOf(r),delegId:dealOf(r).delegataireId||''}))
    .filter(x=>x.k.primeCEE>0);
  // Delegataires presents, avec leur volume : le plus gros en tete
  const parDeleg={};
  toutes.forEach(x=>{
    const cle=x.delegId||'__sans__';
    const d=getDelegataires().find(y=>y.id===x.delegId);
    parDeleg[cle]=parDeleg[cle]||{nom:d?d.name:'— Sans délégataire —',total:0,nb:0};
    parDeleg[cle].total+=x.k.primeCEE;parDeleg[cle].nb++;
  });
  if(CA_DELEG&&!parDeleg[CA_DELEG])CA_DELEG='';
  const lignes=toutes
    .filter(x=>!CA_DELEG||(CA_DELEG==='__sans__'?!x.delegId:x.delegId===CA_DELEG))
    .sort((a,b)=>b.k.primeCEE-a.k.primeCEE);
  const totClient=lignes.reduce((s,x)=>s+(x.k.primeClient||0),0);
  const totCom=lignes.reduce((s,x)=>s+(x.k.comTTC||0),0);
  const totCEE=lignes.reduce((s,x)=>s+(x.k.primeCEE||0),0);
  let h=`<div style="display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin-bottom:.9rem">
    <button class="btn btn-ghost btn-sm" onclick="RESUME_VUE='';RESUME_Q='';CA_DELEG='';renderComptaResume()">← Retour au résumé</button>
    <span style="font-weight:800;font-size:.95rem">Détail par dossier</span>
    <span class="muted" style="font-size:.8rem">${lignes.length} dossier${lignes.length>1?'s':''} · ${eur(totCEE)} TTC</span>
  </div>`;
  h+=opFilterBar('renderComptaResume');
  h+=resumeSearchBar();
  // Filtre par delegataire
  const listeD=Object.entries(parDeleg).sort((a,b)=>b[1].total-a[1].total);
  if(listeD.length>1){
    const btnD=(lab,actif,onclick)=>`<button onclick="${onclick}" style="font-family:'Saira',sans-serif;font-size:.78rem;font-weight:700;border:1.5px solid ${actif?'var(--green)':'var(--border-grey)'};background:${actif?'var(--green)':'#fff'};color:${actif?'#fff':'var(--text)'};border-radius:8px;padding:.32rem .7rem;cursor:pointer">${lab}</button>`;
    h+=`<div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;margin-bottom:.8rem">
      <span style="font-size:.7rem;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.5px">Délégataire</span>
      ${btnD('Tous',!CA_DELEG,"setCaDeleg('')")}
      ${listeD.map(([id,d])=>btnD(`${esc(d.nom)} <span style="opacity:.7">${d.nb}</span>`,CA_DELEG===id,`setCaDeleg('${id}')`)).join('')}
      ${CA_DELEG?`<span class="muted" style="font-size:.76rem">${eur(parDeleg[CA_DELEG].total)} sur ce délégataire</span>`:''}
    </div>`;
  }
  if(!lignes.length){
    h+=`<div class="empty"><div class="big">💶</div>${CA_DELEG?'Aucun dossier pour ce délégataire.':'Aucun dossier avec une prime.'}</div>`;
    document.getElementById('comptaBody').innerHTML=h;return;
  }
  h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>N° Dossier</th><th>Client</th><th>Opération</th>
    <th class="r">Prime client HT</th><th class="r">Commission installateur TTC</th><th class="r">Prime CEE TTC</th>
  </tr></thead><tbody>`;
  lignes.forEach(({r,k})=>{
    const op=getAllProducts().find(o=>o.id===r.productId);
    h+=`<tr style="cursor:pointer" onclick="ouvrirLigne(event,'${r.id}')">
      <td><span class="dossier-tag">${esc(r.dossier||'—')}</span></td>
      <td style="font-weight:700">${esc(clientNameOf(r))}${r.ville?`<div class="muted" style="font-size:.68rem">${esc(r.ville)}</div>`:''}</td>
      <td class="muted">${op?esc(op.name):'—'}</td>
      <td style="text-align:right">${k.estime?'<span class="muted">—</span>':eur(k.primeClient)}</td>
      <td style="text-align:right">${k.estime?'<span class="muted">—</span>':`${eur(k.comTTC)}<div class="muted" style="font-size:.64rem">HT ${eur(k.comHT)}</div>`}</td>
      <td style="text-align:right;font-weight:800;color:var(--green-deep)">${eur(k.primeCEE)}${k.estime?'<div class="muted" style="font-size:.62rem">saisie manuelle</div>':''}</td>
    </tr>`;
  });
  h+=`<tr style="background:#f8faf5;font-weight:800">
    <td colspan="3">Total</td>
    <td style="text-align:right">${eur(totClient)}</td>
    <td style="text-align:right">${eur(totCom)}</td>
    <td style="text-align:right;color:var(--green-deep)">${eur(totCEE)}</td>
  </tr></tbody></table></div>`;
  h+=`<div style="display:flex;justify-content:flex-end;margin-top:.6rem"><button class="btn btn-navy btn-sm" onclick="exportRecettesCSV()">📤 Exporter CSV</button></div>`;
  document.getElementById('comptaBody').innerHTML=h;
}
function exportRecettesCSV(){
  const T=comptaTotaux();
  const nb=n=>(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
  let csv='N Dossier;Client;Ville;Operation;Prime client HT;Commission installateur HT;Commission installateur TTC;Prime CEE TTC\n';
  T.recs.map(r=>({r,k:primeDetailOf(r)})).filter(x=>x.k.primeCEE>0)
    .sort((a,b)=>b.k.primeCEE-a.k.primeCEE)
    .forEach(({r,k})=>{
      const op=getAllProducts().find(o=>o.id===r.productId);
      csv+=`${r.dossier||''};${clientNameOf(r)};${r.ville||''};${op?op.name:''};${nb(k.primeClient)};${nb(k.comHT)};${nb(k.comTTC)};${nb(k.primeCEE)}\n`;
    });
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download='recettes_par_dossier.csv';a.click();URL.revokeObjectURL(url);
}
/* Detail des charges, dossier par dossier, poste par poste */
/* Filtres propres a la vue des charges : poste de depense et fournisseur */
let CHARGES_POSTE='', CHARGES_FOURN='', CHARGES_AGENT='';
const POSTES_CHARGES=[
  {cle:'cc',lab:'📞 Call center'},
  {cle:'vt',lab:'🧰 VT'},
  {cle:'au',lab:'📝 Audit'},
  {cle:'po',lab:'🔧 Poseur'},
  {cle:'ma',lab:'📦 Marchandise'}
];
function setChargesPoste(v){CHARGES_POSTE=v;CHARGES_AGENT='';if(v!=='ma')CHARGES_FOURN='';renderComptaResume();}
function setChargesFourn(v){CHARGES_FOURN=v;renderComptaResume();}
function setChargesAgent(v){CHARGES_AGENT=v;renderComptaResume();}
/* Type d'intervenant correspondant a un poste de depense */
const POSTE_VERS_TYPE={cc:'callcenter',vt:'vt',au:'auditeur',po:'poseur'};
/* Nom de l'intervenant d'un dossier pour un poste donne */
function agentDuPoste(r,poste){
  const t=POSTE_VERS_TYPE[poste];if(!t)return{id:'',nom:''};
  const at=AGENT_TYPES[t];
  const id=at.agentIdFn(r)||'';
  if(!id)return{id:'',nom:''};
  const a=at.getAgent(id);
  return{id,nom:at.agentName(a)||'—'};
}
/* Barre de filtres poste / intervenant / fournisseur, partagee par les vues
   Charges et Marge. `lignes` doit porter les montants par poste (cc, vt, au, po, ma). */
function barrePostes(lignes,fournisseurs,eur){
  const btn=(lab,actif,onclick)=>`<button onclick="${onclick}" style="font-family:'Saira',sans-serif;font-size:.78rem;font-weight:700;border:1.5px solid ${actif?'var(--green)':'var(--border-grey)'};background:${actif?'var(--green)':'#fff'};color:${actif?'#fff':'var(--text)'};border-radius:8px;padding:.32rem .7rem;cursor:pointer">${lab}</button>`;
  let h=`<div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;margin-bottom:.8rem">
    <span style="font-size:.7rem;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.5px">Poste</span>
    ${btn('Tous',!CHARGES_POSTE,"setChargesPoste('')")}
    ${POSTES_CHARGES.map(p=>{
      const n=lignes.filter(x=>x[p.cle]>0).length;
      return btn(`${p.lab} <span style="opacity:.7">${n}</span>`,CHARGES_POSTE===p.cle,`setChargesPoste('${p.cle}')`);
    }).join('')}`;
  // Intervenants presents sur le poste choisi, avec leur montant cumule
  if(CHARGES_POSTE&&POSTE_VERS_TYPE[CHARGES_POSTE]){
    const parAgent={};
    lignes.filter(x=>x[CHARGES_POSTE]>0).forEach(x=>{
      const a=agentDuPoste(x.r,CHARGES_POSTE);
      const cle=a.id||'__sans__';
      parAgent[cle]=parAgent[cle]||{nom:a.nom||'— Non assigné —',total:0,nb:0};
      parAgent[cle].total+=x[CHARGES_POSTE];parAgent[cle].nb++;
    });
    const liste=Object.entries(parAgent).sort((a,b)=>b[1].total-a[1].total);
    if(CHARGES_AGENT&&!parAgent[CHARGES_AGENT])CHARGES_AGENT='';
    if(liste.length)h+=`<select onchange="setChargesAgent(this.value)" style="font-family:'Saira',sans-serif;font-size:.78rem;font-weight:700;border:1.5px solid var(--border-grey);border-radius:8px;padding:.32rem .6rem;background:#fff;outline:none">
      <option value="">Tous les intervenants</option>
      ${liste.map(([id,a])=>`<option value="${id==='__sans__'?'':id}" ${CHARGES_AGENT===id?'selected':''}>${esc(a.nom)} — ${eur(a.total)} (${a.nb})</option>`).join('')}
    </select>`;
  }
  if(CHARGES_POSTE==='ma'&&fournisseurs.length){
    h+=`<select onchange="setChargesFourn(this.value)" style="font-family:'Saira',sans-serif;font-size:.78rem;font-weight:700;border:1.5px solid var(--border-grey);border-radius:8px;padding:.32rem .6rem;background:#fff;outline:none">
      <option value="">Tous les fournisseurs</option>
      ${fournisseurs.map(f=>`<option value="${esc(f)}" ${CHARGES_FOURN===f?'selected':''}>${esc(f)}</option>`).join('')}
    </select>`;
  }
  return h+`</div>`;
}
/* Un dossier passe-t-il les filtres poste / intervenant / fournisseur ? */
function passeFiltresPostes(x){
  if(CHARGES_POSTE&&!(x[CHARGES_POSTE]>0))return false;
  if(CHARGES_FOURN&&!(x.march&&x.march.fournisseur===CHARGES_FOURN))return false;
  if(CHARGES_AGENT&&agentDuPoste(x.r,CHARGES_POSTE).id!==CHARGES_AGENT)return false;
  return true;
}
/* Montants par poste d'un dossier, en TTC */
function postesDuDossier(r){
  const m=recordComptaMetrics(r);
  const ttc=(k,v)=>tvaLine(r,k,v||0).ttc;
  return{r,
    cc:ttc('callcenter',m.aPayerCallCenter), vt:ttc('vt',m.aPayerVt),
    au:ttc('audit',m.aPayerAudit), po:ttc('poseur',m.aPayerPoseur),
    ma:m.march?m.march.ttc:0, march:m.march, m};
}
function renderDetailCharges(T,eur){
  const toutes=T.recs.filter(matchResumeQ).map(r=>{
    const m=recordComptaMetrics(r);
    const ttc=(key,montant)=>tvaLine(r,key,montant||0).ttc;
    const cc=ttc('callcenter',m.aPayerCallCenter);
    const vt=ttc('vt',m.aPayerVt);
    const au=ttc('audit',m.aPayerAudit);
    const po=ttc('poseur',m.aPayerPoseur);
    const ma=m.march?m.march.ttc:0;
    return{r,cc,vt,au,po,ma,total:cc+vt+au+po+ma,march:m.march};
  }).filter(x=>x.total>0);
  // Fournisseurs presents, pour le filtre marchandise
  const fournisseurs=[...new Set(toutes.map(x=>x.march&&x.march.fournisseur).filter(Boolean))].sort();
  if(CHARGES_FOURN&&!fournisseurs.includes(CHARGES_FOURN))CHARGES_FOURN='';
  // Filtrage : un poste retenu ne garde que les dossiers qui en portent
  const lignes=toutes
    .filter(x=>!CHARGES_POSTE||x[CHARGES_POSTE]>0)
    .filter(x=>!CHARGES_FOURN||(x.march&&x.march.fournisseur===CHARGES_FOURN))
    .filter(x=>!CHARGES_AGENT||agentDuPoste(x.r,CHARGES_POSTE).id===CHARGES_AGENT)
    .sort((a,b)=>(CHARGES_POSTE?b[CHARGES_POSTE]-a[CHARGES_POSTE]:b.total-a.total));
  const som=k=>lignes.reduce((s,x)=>s+(x[k]||0),0);
  const totGen=som('total');
  const totPoste=CHARGES_POSTE?som(CHARGES_POSTE):0;
  const posteLib=CHARGES_POSTE?(POSTES_CHARGES.find(p=>p.cle===CHARGES_POSTE)||{}).lab:'';
  let h=`<div style="display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin-bottom:.9rem">
    <button class="btn btn-ghost btn-sm" onclick="RESUME_VUE='';RESUME_Q='';CHARGES_POSTE='';CHARGES_FOURN='';CHARGES_AGENT='';renderComptaResume()">← Retour au résumé</button>
    <span style="font-weight:800;font-size:.95rem">Détail des charges par dossier</span>
    <span class="muted" style="font-size:.8rem">${lignes.length} dossier${lignes.length>1?'s':''} · ${CHARGES_POSTE?`${esc(posteLib)} : ${eur(totPoste)}`:`${eur(totGen)} TTC`}</span>
  </div>`;
  h+=opFilterBar('renderComptaResume');
  h+=resumeSearchBar();
  h+=barrePostes(toutes,fournisseurs,eur);
  if(!lignes.length){
    h+=`<div class="empty"><div class="big">📤</div>${CHARGES_POSTE||CHARGES_FOURN?'Aucun dossier pour ce filtre.':'Aucune charge enregistrée.'}</div>`;
    document.getElementById('comptaBody').innerHTML=h;return;
  }
  const cel=v=>v?eur(v):'<span class="muted">—</span>';
  h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>N° Dossier</th><th>Client</th><th>Opération</th>
    ${['cc','vt','au','po','ma'].map((k,i)=>{
      const lab=['Call center','VT','Audit','Poseur','Marchandise'][i];
      const act=CHARGES_POSTE===k;
      return `<th class="r" style="${act?'background:rgba(124,194,66,.14);color:var(--green-deep)':''}">${lab}</th>`;
    }).join('')}<th class="r">Total</th>
  </tr></thead><tbody>`;
  lignes.forEach(x=>{
    const op=getAllProducts().find(o=>o.id===x.r.productId);
    h+=`<tr style="cursor:pointer" onclick="ouvrirLigne(event,'${x.r.id}')">
      <td><span class="dossier-tag">${esc(x.r.dossier||'—')}</span></td>
      <td style="font-weight:700">${esc(clientNameOf(x.r))}${x.r.ville?`<div class="muted" style="font-size:.68rem">${esc(x.r.ville)}</div>`:''}</td>
      <td class="muted">${op?esc(op.name):'—'}</td>
      ${['cc','vt','au','po'].map(k=>{
        const v=x[k];
        if(!v)return `<td style="text-align:right"><span class="muted">—</span></td>`;
        // Le nom de l'intervenant n'est affiche que sur le poste consulte, pour ne pas surcharger
        const a=(CHARGES_POSTE===k)?agentDuPoste(x.r,k):null;
        return `<td style="text-align:right;${CHARGES_POSTE===k?'background:rgba(124,194,66,.07)':''}">${eur(v)}
          ${a?`<div class="muted" style="font-size:.64rem">${esc(a.nom||'— Non assigné —')}</div>`:''}</td>`;
      }).join('')}
      <td style="text-align:right">${x.ma?`${eur(x.ma)}${x.march&&x.march.fournisseur?`<div class="muted" style="font-size:.64rem;color:var(--purple)">${esc(x.march.fournisseur)}</div>`:''}`:'<span class="muted">—</span>'}</td>
      <td style="text-align:right;font-weight:800;color:#B96A0A">${eur(x.total)}</td>
    </tr>`;
  });
  h+=`<tr style="background:#f8faf5;font-weight:800">
    <td colspan="3">Total</td>
    <td style="text-align:right">${eur(som('cc'))}</td>
    <td style="text-align:right">${eur(som('vt'))}</td>
    <td style="text-align:right">${eur(som('au'))}</td>
    <td style="text-align:right">${eur(som('po'))}</td>
    <td style="text-align:right">${eur(som('ma'))}</td>
    <td style="text-align:right;color:#B96A0A">${eur(totGen)}</td>
  </tr></tbody></table></div>`;
  h+=`<div style="display:flex;justify-content:flex-end;margin-top:.6rem"><button class="btn btn-navy btn-sm" onclick="exportChargesCSV()">📤 Exporter CSV</button></div>`;
  document.getElementById('comptaBody').innerHTML=h;
}
function exportChargesCSV(){
  const T=comptaTotaux();
  const nb=n=>(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
  let csv='N Dossier;Client;Ville;Operation;Call center;VT;Audit;Poseur;Marchandise;Fournisseur;Total\n';
  T.recs.forEach(r=>{
    const m=recordComptaMetrics(r);
    const ttc=(key,montant)=>tvaLine(r,key,montant||0).ttc;
    const cc=ttc('callcenter',m.aPayerCallCenter),vt=ttc('vt',m.aPayerVt),
          au=ttc('audit',m.aPayerAudit),po=ttc('poseur',m.aPayerPoseur),
          ma=m.march?m.march.ttc:0;
    const tot=cc+vt+au+po+ma;
    if(!tot)return;
    const op=getAllProducts().find(o=>o.id===r.productId);
    csv+=`${r.dossier||''};${clientNameOf(r)};${r.ville||''};${op?op.name:''};${nb(cc)};${nb(vt)};${nb(au)};${nb(po)};${nb(ma)};${m.march?m.march.fournisseur:''};${nb(tot)}\n`;
  });
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download='charges_par_dossier.csv';a.click();URL.revokeObjectURL(url);
}
/* Detail de la marge : CA, charges et marge pour chaque dossier */
function renderDetailMarge(T,eur){
  const ttcHt=n=>eur(n)+`<span style="display:block;font-size:.64rem;font-weight:500;color:var(--text-mut)">HT ${eur(htOf(n))}</span>`;
  // Montants par poste, pour pouvoir filtrer comme dans la vue des charges
  const toutes=T.rows.filter(x=>matchResumeQ(x.r)).map(x=>({...postesDuDossier(x.r),marge:x.m.marge,mm:x.m}));
  const fournisseurs=[...new Set(toutes.map(x=>x.march&&x.march.fournisseur).filter(Boolean))].sort();
  if(CHARGES_FOURN&&!fournisseurs.includes(CHARGES_FOURN))CHARGES_FOURN='';
  const retenues=toutes.filter(passeFiltresPostes).sort((a,b)=>b.marge-a.marge);
  const rows=retenues.map(x=>({r:x.r,m:x.mm}));
  const margeAffichee=retenues.reduce((s,x)=>s+(x.marge||0),0);
  const caAffiche=retenues.reduce((s,x)=>s+(x.mm.recettes||0),0);
  const chAffichees=retenues.reduce((s,x)=>s+(x.mm.charges||0),0);
  const filtre=CHARGES_POSTE||CHARGES_AGENT||CHARGES_FOURN;
  let h=`<div style="display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin-bottom:.9rem">
    <button class="btn btn-ghost btn-sm" onclick="RESUME_VUE='';RESUME_Q='';CHARGES_POSTE='';CHARGES_FOURN='';CHARGES_AGENT='';renderComptaResume()">← Retour au résumé</button>
    <span style="font-weight:800;font-size:.95rem">Marge par dossier</span>
    <span class="muted" style="font-size:.8rem">${rows.length} dossier${rows.length>1?'s':''} · ${eur(margeAffichee)} de marge</span>
  </div>`;
  h+=opFilterBar('renderComptaResume');
  h+=resumeSearchBar();
  h+=barrePostes(toutes,fournisseurs,eur);
  if(!rows.length){
    h+=`<div class="empty"><div class="big">📈</div>${filtre?'Aucun dossier pour ce filtre.':"Aucun dossier chiffré — renseignez la comptabilité d'un dossier."}</div>`;
    document.getElementById('comptaBody').innerHTML=h;return;
  }
  h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>N° Dossier</th><th>Client</th><th>Opération</th>
    <th class="r">CA TTC</th><th class="r">Charges variables TTC</th><th class="r">Marge brute</th><th class="r">%</th>
  </tr></thead><tbody>`;
  rows.forEach(({r,m})=>{
    const op=getAllProducts().find(o=>o.id===r.productId);
    const pct=m.recettes>0?(m.marge/m.recettes*100):0;
    h+=`<tr style="cursor:pointer" onclick="ouvrirLigne(event,'${r.id}')">
      <td><span class="dossier-tag">${esc(r.dossier||'—')}</span></td>
      <td style="font-weight:700">${esc(clientNameOf(r))}${r.ville?`<div class="muted" style="font-size:.68rem">${esc(r.ville)}</div>`:''}</td>
      <td class="muted">${op?esc(op.name):'—'}</td>
      <td style="text-align:right">${ttcHt(m.recettes)}</td>
      <td style="text-align:right">${ttcHt(m.charges)}</td>
      <td style="text-align:right;font-weight:800;color:${m.marge>=0?'var(--green-deep)':'#E63946'}">${eur(m.marge)}</td>
      <td style="text-align:right;font-weight:700;color:${pct>=0?'var(--green-deep)':'#E63946'}">${m.recettes>0?pct.toFixed(1)+'%':'—'}</td>
    </tr>`;
  });
  h+=`<tr style="background:#f8faf5;font-weight:800">
    <td colspan="3">Total</td>
    <td style="text-align:right">${eur(caAffiche)}</td>
    <td style="text-align:right">${eur(chAffichees)}</td>
    <td style="text-align:right;color:${margeAffichee>=0?'var(--green-deep)':'#E63946'}">${eur(margeAffichee)}</td>
    <td style="text-align:right">${caAffiche>0?(margeAffichee/caAffiche*100).toFixed(1)+'%':'—'}</td>
  </tr></tbody></table></div>`;
  document.getElementById('comptaBody').innerHTML=h;
}
let RESUME_VUE=''; // '' = synthese, 'recettes' / 'charges' / 'marge' = detail par dossier
let RESUME_Q='',RESUME_FOCUS=null;
function setResumeQ(el){
  RESUME_Q=el.value;RESUME_FOCUS=el.selectionStart||0;
  renderComptaResume();
  const i=document.getElementById('resume_q');
  if(i&&RESUME_FOCUS!==null){i.focus();try{i.setSelectionRange(RESUME_FOCUS,RESUME_FOCUS);}catch(e){}}
  RESUME_FOCUS=null;
}
/* Le dossier correspond-il a la recherche en cours ? */
function matchResumeQ(r){
  if(!RESUME_Q)return true;
  const q=RESUME_Q.toLowerCase();
  const op=getAllProducts().find(o=>o.id===r.productId);
  const site=r.opFields?Object.values(r.opFields).join(' '):'';
  return [r.dossier,clientNameOf(r),r.ville,r.cp,r.siret,op?op.name:'',site].join(' ').toLowerCase().includes(q);
}
/* Barre de recherche des vues detaillees */
function resumeSearchBar(){
  const fs="font-family:'Saira',sans-serif;font-size:.8rem;border:1.5px solid var(--border-grey);border-radius:8px;padding:.35rem .65rem;background:#fff;outline:none";
  return `<div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem">
    <input id="resume_q" type="text" value="${esc(RESUME_Q)}" placeholder="🔍 Rechercher un client, un n° de dossier, une ville…" oninput="setResumeQ(this)" style="${fs};flex:1;min-width:200px">
    ${RESUME_Q?`<button class="btn btn-ghost btn-sm" style="font-size:.72rem" onclick="RESUME_Q='';renderComptaResume()">✕</button>`:''}
  </div>`;
}
function renderComptaResume(){
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  const T=comptaTotaux();
  if(RESUME_VUE==='recettes')return renderDetailRecettes(T,eur);
  if(RESUME_VUE==='charges')return renderDetailCharges(T,eur);
  if(RESUME_VUE==='marge')return renderDetailMarge(T,eur);
  const {recs,rows,totRecettes,totCharges,totMarge,margePct,byPoseur,byCc,byVt,byAud,byOp,tvaModesByFam,sumPoseur,sumCc,sumVt,sumAud,NONE_KEY}=T;
  const ttcHt=n=>eur(n)+`<span style="display:block;font-size:.64rem;font-weight:500;color:var(--text-mut)">HT ${eur(htOf(n))}</span>`;
  // Helper : sous-texte KPI selon mode TVA dominant
  const kpiSub=(sum,modes,count,label)=>{
    const vals=Object.values(modes);
    const allSansTva=vals.length&&vals.every(m=>m==='sans_tva');
    const allHT=vals.length&&vals.every(m=>m==='ht');
    const sub=allSansTva?'Sans TVA':allHT?`Payé HT`:`HT ${eur(htOf(sum))}`;
    return `${sub} · ${count} ${label}`;
  };
  let h=opFilterBar('renderComptaResume');
  h+=`<p class="muted" style="font-size:.72rem;margin-bottom:.5rem">💶 Montants TTC — TVA ${tvaRate()}% déduite automatiquement (taux : Paramètres ▸ Société).</p><div class="kpis">
    <div class="kpi" onclick="RESUME_VUE='recettes';renderComptaResume()" style="cursor:pointer"><div class="kico">💶</div><div class="klab">CA TTC</div><div class="kval">${eur(totRecettes)}</div><div class="ksub">HT ${eur(htOf(totRecettes))} · ${recs.length} dossier${recs.length>1?'s':''} chiffré${recs.length>1?'s':''} <span style="color:var(--blue);font-weight:700">→</span></div></div>
    <div class="kpi" onclick="RESUME_VUE='charges';renderComptaResume()" style="cursor:pointer"><div class="kico">📤</div><div class="klab">Charges variables TTC</div><div class="kval">${eur(totCharges)}</div><div class="ksub">HT ${eur(htOf(totCharges))} · poseurs, call center, VT, audits, marchandise <span style="color:var(--blue);font-weight:700">→</span></div></div>
    <div class="kpi accent" onclick="RESUME_VUE='marge';renderComptaResume()" style="cursor:pointer"><div class="kico">📈</div><div class="klab">Marge brute</div><div class="kval">${eur(totMarge)}</div><div class="ksub">HT ${eur(htOf(totMarge))}${totRecettes>0?' · '+margePct.toFixed(1)+'% de marge':''}</div></div>
  </div>`;
  // par opération
  h+=`<div class="panel"><div class="panel-h"><h3>Rentabilité par opération</h3></div><div class="panel-b">`;
  const opKeys=Object.keys(byOp);
  if(!opKeys.length)h+=`<div class="empty"><div class="big">📋</div>Aucune donnée.</div>`;
  else{h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Opération</th><th>Dossiers</th><th style="text-align:right">Recettes</th><th style="text-align:right">Charges</th><th style="text-align:right">Marge</th></tr></thead><tbody>`;
    opKeys.forEach(k=>{const op=getAllProducts().find(o=>o.id===k);const x=byOp[k];h+=`<tr><td>${op?esc(op.name):'—'}</td><td>${x.nb}</td><td style="text-align:right">${ttcHt(x.recettes)}</td><td style="text-align:right">${ttcHt(x.charges)}</td><td style="text-align:right;font-weight:700;color:${x.marge>=0?'var(--green-deep)':'#E63946'}">${ttcHt(x.marge)}</td></tr>`;});
    h+=`</tbody></table></div>`;}
  h+=`</div></div>`;
  document.getElementById('comptaBody').innerHTML=h;
}
function renderComptaFacturation(){
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  // Reste a facturer : ce qui n'a pas encore d'APF. Generer l'APF le deduit.
  const T=comptaTotaux();
  const aCreer={poseur:0,callcenter:0,vt:0,auditeur:0};
  const nbDossiers={poseur:0,callcenter:0,vt:0,auditeur:0};
  T.recs.forEach(r=>{
    const m=recordComptaMetrics(r);
    const montants={poseur:m.aPayerPoseur,callcenter:m.aPayerCallCenter,vt:m.aPayerVt,auditeur:m.aPayerAudit};
    ['poseur','callcenter','vt','auditeur'].forEach(t=>{
      const d=resteDu(r,t,montants[t]);
      if(d.aFacturer>0){aCreer[t]+=d.aFacturer;nbDossiers[t]++;}
    });
  });
  // Acomptes disponibles par famille : ils viendront en deduction
  const avances={poseur:0,callcenter:0,vt:0,auditeur:0};
  comptesAvecAcompte().forEach(x=>{if(avances[x.type]!==undefined&&x.solde>0)avances[x.type]+=x.solde;});
  const carte=(ic,lab,type)=>{
    const brut=aCreer[type], n=nbDossiers[type];
    const av=Math.min(avances[type]||0,brut);
    const montant=Math.round((brut-av)*100)/100;
    return `<div class="kpi" onclick="FACT_TYPE='${type}';FACT_AGENT='';renderComptaTabs()" style="cursor:pointer;${FACT_TYPE===type?'border:1.5px solid var(--green)':''}">
      <div class="kico">${ic}</div><div class="klab">${lab}</div>
      <div class="kval" style="${montant>0?'color:#B96A0A':'color:var(--green-deep)'}">${eur(montant)}</div>
      <div class="ksub">${n?`${av>0?`${eur(brut)} − ${eur(av)} d'acompte`:`HT ${eur(htOf(montant))}`} · ${n} dossier${n>1?'s':''} <span style="color:var(--blue);font-weight:700">→</span>`:'Tout est facturé ✓'}</div>
    </div>`;
  };
  let h=`<div class="kpis">
    ${carte('🔧','APF à créer — poseurs','poseur')}
    ${carte('📞','APF à créer — call center','callcenter')}
    ${carte('🧰','APF à créer — VT','vt')}
    ${carte('📝','APF à créer — auditeurs','auditeur')}
  </div>`;
  h+=`<div class="panel"><div class="panel-h"><h3>Créer un appel à facturation</h3></div><div class="panel-b">
    <div class="fgrid">
      <div class="fld"><label>Type</label><select id="fact_type" onchange="FACT_TYPE=this.value;FACT_AGENT='';FACT_SRC='';FACT_OP='';renderComptaTabs()">
        <option value="poseur" ${FACT_TYPE==='poseur'?'selected':''}>🔧 Poseur</option>
        <option value="callcenter" ${FACT_TYPE==='callcenter'?'selected':''}>📞 Call Center (Source / Régie)</option>
        <option value="vt" ${FACT_TYPE==='vt'?'selected':''}>🧰 Visite Technique</option>
        <option value="auditeur" ${FACT_TYPE==='auditeur'?'selected':''}>📝 Auditeur</option>
      </select></div>
      <div class="fld"><label>${AGENT_TYPES[FACT_TYPE].label} à payer</label><select id="fact_agent" onchange="FACT_AGENT=this.value;renderComptaTabs()">
        <option value="">— Choisir —</option>
        ${AGENT_TYPES[FACT_TYPE].listAgents().map(a=>`<option value="${a.id}" ${FACT_AGENT===a.id?'selected':''}>${esc(AGENT_TYPES[FACT_TYPE].agentName(a))}</option>`).join('')}
      </select></div>
    </div>
  </div></div>`;
  if(FACT_AGENT){
    const at=AGENT_TYPES[FACT_TYPE];
    const agentInfo=at.getAgent(FACT_AGENT);
    const recs=segRecs().filter(r=>at.agentIdFn(r)===FACT_AGENT)
      .filter(r=>!FACT_SRC||r.sourceId===FACT_SRC)
      .filter(r=>!FACT_OP||r.productId===FACT_OP)
      .filter(r=>{
        if(!FACT_Q)return true;
        const q=FACT_Q.toLowerCase();
        const site=r.opFields?Object.values(r.opFields).join(' '):'';
        return [r.dossier,clientNameOf(r),r.ville,r.cp,r.siret,site].join(' ').toLowerCase().includes(q);
      })
      .filter(r=>{
        if(!FACT_DU&&!FACT_AU)return true;
        const t=tsInstallation(r);
        if(t===null)return false; // sans date d'installation, hors periode
        if(FACT_DU&&t<new Date(FACT_DU+'T00:00:00').getTime())return false;
        if(FACT_AU&&t>new Date(FACT_AU+'T23:59:59').getTime())return false;
        return true;
      });
    const showDejaFact=load('egncrm_fact_show_deja','0')==='1';
    const rows=recs.map(r=>({r,m:recordComptaMetrics(r)})).filter(x=>at.montantFn(x.m)>0&&(showDejaFact||!factureActive(x.r,FACT_TYPE)));
    h+=`<div class="panel"><div class="panel-h"><h3>Dossiers à facturer</h3><div class="sp"><span class="muted">${rows.length} dossier${rows.length>1?'s':''}</span></div></div><div class="panel-b">`;
    // Recherche client et periode d'installation
    const fs="font-family:'Saira',sans-serif;font-size:.8rem;border:1.5px solid var(--border-grey);border-radius:8px;padding:.35rem .65rem;background:#fff;outline:none";
    h+=`<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:.7rem">
      <input id="fact_q" type="text" value="${esc(FACT_Q)}" placeholder="🔍 Rechercher un client, un n° de dossier, une ville…" oninput="setFactFiltre('q',this)" style="${fs};flex:1;min-width:200px">
      <span style="font-size:.72rem;color:var(--text-mut);font-weight:700">Installé du</span>
      <input type="date" value="${esc(FACT_DU)}" onchange="setFactFiltre('du',this)" style="${fs}">
      <span style="font-size:.72rem;color:var(--text-mut);font-weight:700">au</span>
      <input type="date" value="${esc(FACT_AU)}" onchange="setFactFiltre('au',this)" style="${fs}">
      ${(FACT_Q||FACT_DU||FACT_AU||FACT_SRC||FACT_OP)?`<button class="btn btn-ghost btn-sm" style="font-size:.72rem" onclick="resetFactFiltres()">✕ Réinitialiser</button>`:''}
    </div>`;
    if(FACT_SRC||FACT_OP||FACT_Q||FACT_DU||FACT_AU){
      const s=FACT_SRC?getSources().find(x=>x.id===FACT_SRC):null;
      const o=FACT_OP?getAllProducts().find(x=>x.id===FACT_OP):null;
      const fr=d=>{if(!d)return '';const p=d.split('-');return `${p[2]}/${p[1]}/${p[0]}`;};
      h+=`<div style="background:rgba(45,125,210,.09);border-left:3px solid var(--blue);border-radius:0 8px 8px 0;padding:.5rem .9rem;margin-bottom:.7rem;font-size:.8rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
        <span style="font-weight:700;color:var(--blue)">Sélection restreinte</span>
        <span class="muted">${[
          s?'source : '+esc(s.name):'',
          o?'opération : '+esc(o.name):'',
          FACT_Q?'recherche : « '+esc(FACT_Q)+' »':'',
          (FACT_DU||FACT_AU)?'installé '+(FACT_DU?'du '+fr(FACT_DU):'')+(FACT_AU?' au '+fr(FACT_AU):''):''
        ].filter(Boolean).join(' · ')}</span>
        <button class="btn btn-ghost btn-sm" style="font-size:.72rem;margin-left:auto" onclick="resetFactFiltres()">✕ Retirer les filtres</button>
      </div>`;
    }
    h+=`<div style="display:flex;align-items:center;gap:1rem;margin-bottom:.7rem;flex-wrap:wrap">
      <p class="muted" style="font-size:.76rem;flex:1">💡 Les dossiers déjà facturés sont masqués par défaut.</p>
      <label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;cursor:pointer;white-space:nowrap">
        <input type="checkbox" ${showDejaFact?'checked':''} onchange="save('egncrm_fact_show_deja',this.checked?'1':'0');renderComptaFacturation()">
        Afficher aussi les dossiers déjà facturés
      </label>
    </div>`;
    if(!rows.length)h+=`<div class="empty"><div class="big">📋</div>Aucun dossier à facturer pour cet agent.</div>`;
    else{
      h+=`<div class="cfg-list">`+rows.map(({r,m})=>{
        const op=getAllProducts().find(o=>o.id===r.productId);
        const dejaFact=factureActive(r,FACT_TYPE);
        const dejaTag=dejaFact?`<span style="font-size:.62rem;background:#FFF4E5;color:#B96A0A;border-radius:4px;padding:1px 5px;margin-left:4px">Déjà facturé</span>`:'';
        const tvaKey=FACT_TYPE==='callcenter'?'callcenter':FACT_TYPE;
        const tvaM=effectiveTvaMode(r,tvaKey);
        const montantTag=tvaM==='sans_tva'
          ?`${eur(at.montantFn(m))} <span style="font-size:.62rem;font-weight:500;color:#5B3AAA">Sans TVA</span>`
          :tvaM==='ht'
          ?`${eur(at.montantFn(m))} <span style="font-size:.62rem;font-weight:500">· payé HT</span>`
          :`${eur(at.montantFn(m))} <span style="font-size:.62rem;font-weight:500">· HT ${eur(htOf(at.montantFn(m)))}</span>`;
        return `<div class="cfg-item" style="${dejaFact?'opacity:.8':''}"><input type="checkbox" class="fact_chk" data-rid="${r.id}" data-montant="${at.montantFn(m)}" ${dejaFact?'':'checked'} style="margin-right:.3rem"><span class="nm"><span class="dossier-tag" style="margin-right:.4rem">${esc(r.dossier||'—')}</span>${esc(clientNameOf(r))}${dejaTag}<span class="muted" style="font-weight:400"> — ${op?esc(op.name):''}</span>${(function(){const di=dateInstallationFr(r);return di?`<span style="font-size:.68rem;font-weight:700;background:#FFF4E5;color:#B96A0A;border-radius:5px;padding:1px 6px;margin-left:5px">🔧 ${esc(di)}</span>`:`<span style="font-size:.68rem;font-weight:600;color:var(--text-mut);margin-left:5px">date d'installation non renseignée</span>`;})()}</span><span class="tag" style="background:rgba(45,125,210,.12);color:#2D7DD2">${montantTag}</span></div>`;
      }).join('')+`</div>
      <label style="display:flex;align-items:center;gap:.5rem;margin-top:1rem;cursor:${agentInfo&&agentInfo.email?'pointer':'not-allowed'}"><input type="checkbox" id="fact_sendmail" ${agentInfo&&agentInfo.email?'':'disabled'}> Envoyer aussi par e-mail à ${agentInfo&&agentInfo.email?esc(agentInfo.email):'(aucun email renseigné pour ce partenaire)'}</label>
      ${(function(){
        const s=soldeAcompte(FACT_TYPE,FACT_AGENT);
        if(s<=0)return '';
        return `<div style="display:flex;align-items:center;gap:.6rem;margin-top:1rem;flex-wrap:wrap;background:#EFF7E8;border:1.5px solid var(--green);border-radius:9px;padding:.55rem .85rem">
          <span style="font-size:1.1rem">💼</span>
          <span style="font-size:.82rem;flex:1"><b>${eur(s)} d'acompte disponible</b> pour cet intervenant — le montant sera déduit de l'appel à facturation, le reliquat restera pour le suivant.</span>
        </div>`;
      })()}
      <div style="display:flex;align-items:center;gap:.6rem;margin-top:1rem;flex-wrap:wrap;background:var(--bg-soft);border-radius:9px;padding:.55rem .85rem">
        <span style="font-size:.78rem;font-weight:700;color:var(--text-mut)">📅 Date de l'appel à facturation</span>
        <input type="date" id="fact_date" value="${new Date().toISOString().slice(0,10)}" style="font-family:'Saira',sans-serif;font-size:.85rem;font-weight:700;border:1.5px solid var(--border-grey);border-radius:8px;padding:.35rem .65rem;background:#fff;outline:none">
        <span class="muted" style="font-size:.72rem">modifiable avant génération</span>
      </div>
      <button class="btn btn-pri" style="margin-top:.7rem" onclick="genererFactureAgent()">📄 Générer le document d'appel à facturation</button>`;
    }
    h+=`</div></div>`;
  }
  document.getElementById('comptaBody').innerHTML=h;
}
let LAST_APF_GEN=0;
async function genererFactureAgent(){
  if(Date.now()-LAST_APF_GEN<2000)return; // anti double-clic
  LAST_APF_GEN=Date.now();
  const type=FACT_TYPE,agentId=FACT_AGENT,at=AGENT_TYPES[type];
  const checks=[...document.querySelectorAll('.fact_chk')].filter(c=>c.checked);
  if(!checks.length){toast('Sélectionnez au moins un dossier','err');return;}
  const agent=at.getAgent(agentId);const agentName=at.agentName(agent);const s=getSettings();
  // Charger la compta de tous les dossiers sélectionnés avant de lire les modes TVA
  toast('Préparation…','ok');
  await Promise.all(checks.map(c=>loadComptaFor(c.dataset.rid)));
  const apfNum=await nextApfNum();
  const lignes=checks.map(c=>{
    const r=recById(c.dataset.rid);
    const montant=parseFloat(c.dataset.montant)||0;
    const tvaMode=effectiveTvaMode(r,type==='callcenter'?'callcenter':type);
    return{r,montant,tvaMode};
  });
  const eur=n=>(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  // Date choisie dans le formulaire, sinon celle du jour
  const dSaisie=(document.getElementById('fact_date')||{}).value||'';
  const dApf=dSaisie?new Date(dSaisie+'T12:00:00'):new Date();
  const dateStr=dApf.toLocaleDateString('fr-FR');
  const t=tvaRate()/100;
  // Chaque ligne porte son propre régime : le montant saisi est HT, TTC ou hors champ TVA
  const det=lignes.map(l=>{
    const m=l.montant||0;
    if(l.tvaMode==='ht')   return {...l,ht:m,tva:m*t,ttc:m+m*t};
    if(l.tvaMode==='sans_tva') return {...l,ht:m,tva:0,ttc:m};
    const ht=t?m/(1+t):m; return {...l,ht,tva:m-ht,ttc:m};
  });
  const totHT=det.reduce((s,l)=>s+l.ht,0);
  const totTVA=det.reduce((s,l)=>s+l.tva,0);
  const total=det.reduce((s,l)=>s+l.ttc,0);
  const hasTva=det.some(l=>l.tvaMode!=='sans_tva');
  // Acompte disponible de cet intervenant : on l'impute a hauteur du total
  const soldeAv=soldeAcompte(type,agentId);
  const impute=Math.min(soldeAv,total);
  const netAPayer=Math.round((total-impute)*100)/100;
  const resteApres=Math.round((soldeAv-impute)*100)/100;
  const rowsHtml=det.map(l=>{
    const op=getAllProducts().find(o=>o.id===l.r.productId);
    const di=dateInstallationFr(l.r);
    const base=`<td>${esc(l.r.dossier||'—')}</td><td>${esc(clientNameOf(l.r))}</td><td>${op?esc(op.name):''}</td><td style="white-space:nowrap">${di?esc(di):'<span style="color:#9aa5b1">—</span>'}</td>`;
    if(!hasTva)return `<tr>${base}<td style="text-align:right;font-weight:700">${eur(l.ttc)}</td></tr>`;
    if(l.tvaMode==='sans_tva')
      return `<tr>${base}<td style="text-align:right;color:#6b7785">${eur(l.ht)}</td><td style="text-align:right;color:#5B3AAA;font-size:.82rem">Sans TVA</td><td style="text-align:right;font-weight:700">${eur(l.ttc)}</td></tr>`;
    return `<tr>${base}<td style="text-align:right;color:#6b7785">${eur(l.ht)}</td><td style="text-align:right;color:#6b7785">${eur(l.tva)}</td><td style="text-align:right;font-weight:700">${eur(l.ttc)}</td></tr>`;
  }).join('');
  const theadTva=hasTva?`<th style="text-align:right">Montant HT</th><th style="text-align:right">TVA (${tvaRate()}%)</th><th style="text-align:right">Montant dû TTC</th>`:`<th style="text-align:right">Montant dû</th>`;
  const tfootTva=hasTva?`<td style="text-align:right">${eur(totHT)}</td><td style="text-align:right">${eur(totTVA)}</td><td style="text-align:right">${eur(total)}</td>`:`<td style="text-align:right">${eur(total)}</td>`;
  const metaTva=hasTva?`<b>TVA :</b> ${tvaRate()}% — le montant dû est exprimé TTC ; les colonnes HT et TVA servent à établir votre facture.`:`<b>Régime :</b> Sans TVA (autoentrepreneur ou exonéré).`;
  const doc=`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${esc(apfNum)} — Appel à facturation — ${esc(agentName)}</title>
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1A2B3D;padding:40px;max-width:800px;margin:0 auto}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #7CC242;padding-bottom:16px;margin-bottom:24px}
    .hd-left{display:flex;align-items:center;gap:14px}
    .hd-logo{max-height:56px;max-width:160px;object-fit:contain}
    .hd h1{font-size:1.3rem;margin:0 0 4px}
    .hd .sub{color:#6b7785;font-size:.85rem}
    .apf-num{display:inline-block;margin-top:4px;font-weight:800;font-size:.9rem;color:#7CC242;background:rgba(124,194,66,.12);padding:.2rem .6rem;border-radius:6px}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{padding:9px 10px;border-bottom:1px solid #e5e8ec;font-size:.9rem;text-align:left}
    th{background:#f4f6f8;font-weight:700;font-size:.78rem;text-transform:uppercase;letter-spacing:.03em;color:#6b7785}
    tfoot td{font-weight:800;font-size:1.05rem;border-top:2px solid #1A2B3D;border-bottom:none}
    .meta{margin:18px 0;font-size:.9rem;line-height:1.7}
    .print-btn{margin-top:28px}
    @media print{.print-btn{display:none}}
  </style></head><body>
  <div class="hd">
    <div class="hd-left">
      ${s.logo?`<img class="hd-logo" src="${s.logo}" alt="Logo">`:''}
      <div><h1>Appel à facturation — ${esc(at.label)}</h1><div class="sub">${esc(s.company||'')}</div><div class="apf-num">${esc(apfNum)}</div></div>
    </div>
    <div class="sub">Édité le ${dateStr}</div>
  </div>
  <div class="meta"><b>${esc(at.label)} :</b> ${esc(agentName)}<br>${agent&&agent.email?'<b>Email :</b> '+esc(agent.email)+'<br>':''}${metaTva}</div>
  <table><thead><tr><th>N° Dossier</th><th>Client</th><th>Opération</th><th>Date d'installation</th>${theadTva}</tr></thead>
  <tbody>${rowsHtml}</tbody>
  <tfoot><tr><td colspan="4">${impute?'Sous-total':'Total à verser'}</td>${tfootTva}</tr>
  ${impute?`<tr><td colspan="4">Acompte déjà versé, imputé sur cet appel</td>
    <td colspan="${hasTva?3:1}" style="text-align:right;color:#B96A0A">− ${eur(impute)}</td></tr>
  <tr style="font-weight:800"><td colspan="4">Net à payer</td>
    <td colspan="${hasTva?3:1}" style="text-align:right">${eur(netAPayer)}</td></tr>`:''}</tfoot>
  </table>
  <button class="print-btn" onclick="window.print()" style="padding:10px 18px;background:#7CC242;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">🖨️ Imprimer / Enregistrer en PDF</button>
  </body></html>`;
  const w=window.open('','_blank');
  if(!w){toast('Autorisez les fenêtres pop-up pour générer le document','err');return;}
  w.document.write(doc);w.document.close();
  const wantsSend=(document.getElementById('fact_sendmail')||{}).checked;
  if(wantsSend&&agent&&agent.email){
    try{
      await callSendEmail({to:agent.email,subject:`${apfNum} — Appel à facturation ${esc(at.label)}`,html:doc});
      toast('Document envoyé par e-mail à '+agent.email+' ✓','ok');
    }catch(e){console.error('[genererFactureAgent] envoi mail',e);toast('Document généré, mais l\'envoi par e-mail a échoué : '+(e.message||e),'err');}
  }
  // enregistrement de la facture (Supabase, protégé par RLS)
  const factureId=uid();
  // Imputation enregistree : le reliquat restera disponible pour le prochain APF
  if(impute>0)imputerAcompte(type,agentId,agentName,impute,factureId,apfNum);
  const factureObj={id:factureId,apfNum,type,date:dApf.getTime(),poseurId:agentId,poseurName:agentName,
    acompteImpute:impute,netAPayer,
    user:(ME.prenom+' '+ME.nom).trim()||ME.code,total,
    lignes:det.map(l=>({recId:l.r.id,client:clientNameOf(l.r),montant:l.ttc,ht:l.ht,tva:l.tva,tvaMode:l.tvaMode})),html:doc};
  await persistFacture(factureObj);
  if(FACTURES_CACHE)FACTURES_CACHE.unshift(factureObj);
  // marquer les dossiers avec le sous-statut « Facturé » correspondant (automatique, toujours conservé)
  // + passer automatiquement le dossier au statut « Installé » s'il ne l'est pas déjà
  const installStatus=getAllStatuses().find(s=>s.name==='Installé')||getAllStatuses().find(s=>s.won);
  const recs=getRecs();
  let nbPasse=0;
  for(const l of lignes){
    const c=comptaOf(l.r);
    c[at.factureField]={date:dApf.getTime(),montant:l.montant,factureId,apfNum,user:(ME.prenom+' '+ME.nom).trim()||ME.code,statut:'transmis'};
    await persistCompta(l.r.id);
    const rr=recs.find(x=>x.id===l.r.id);
    if(rr&&installStatus&&rr.statusId!==installStatus.id){rr.statusId=installStatus.id;rr.updated=Date.now();nbPasse++;}
  }
  save(K.recs,recs);
  toast(`Appel à facturation ${apfNum} généré et archivé ✓${nbPasse?` — ${nbPasse} dossier${nbPasse>1?'s':''} passé${nbPasse>1?'s':''} au statut « Installé »`:''}`,'ok');
  logActivity('action',`📄 Appel à facturation ${apfNum} généré (${at.label} — ${agentName}) — ${lignes.length} dossier${lignes.length>1?'s':''}, ${total.toLocaleString('fr-FR')} €`);
  renderComptaTabs();
}
