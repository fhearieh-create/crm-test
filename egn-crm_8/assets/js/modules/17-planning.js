/* ============================================================
   EGN CRM — modules/17-planning.js
   Modales, planning, carte, rendez-vous, SAV, import
   ============================================================ */
/* ====================================================================
   MODALES
   ==================================================================== */
function openModal(title,body,footer,cls){
  document.getElementById('modalBox').className='modal '+(cls||'');
  document.getElementById('modalBox').innerHTML=`<div class="modal-h"><h3>${title}</h3><button class="x" onclick="closeModal()">✕</button></div><div class="modal-b">${body}</div>${footer?`<div class="modal-f">${footer}</div>`:''}`;
  document.getElementById('modalBg').classList.add('on');
}
function closeModal(){if(SCANNER_STREAM){SCANNER_STREAM.getTracks().forEach(t=>t.stop());SCANNER_STREAM=null;}document.getElementById('modalBg').classList.remove('on');document.getElementById('modalBox').innerHTML='';}
function setModalBody(html){const b=document.querySelector('#modalBox .modal-b');if(b)b.innerHTML=html;}
function modalConfirm(title,msg,onYes){
  window._confirmCb=onYes;
  openModal(title,`<p class="muted" style="font-size:.9rem;line-height:1.5">${esc(msg)}</p>`,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-danger" onclick="window._confirmCb&&window._confirmCb()">Confirmer</button>`);
}
document.getElementById('modalBg').addEventListener('click',e=>{if(e.target.id==='modalBg')closeModal();});

/* ====================================================================
   PLANNING (calendrier + carte)
   ==================================================================== */
let CAL={view:'mois',y:new Date().getFullYear(),m:new Date().getMonth(),sel:null,filterUser:'',filterDept:''};
let MAP=null,MARKERS=null;
function renderRappels(){
  const today=new Date().toISOString().slice(0,10);
  const list=visibleRecs().filter(r=>r.rappelDate).sort((a,b)=>((a.rappelDate||'')+(a.rappelHeure||'')).localeCompare((b.rappelDate||'')+(b.rappelHeure||'')));
  const passes=list.filter(r=>r.rappelDate<today);
  const avenir=list.filter(r=>r.rappelDate>=today);
  const row=r=>{
    const isPast=r.rappelDate<today;
    const isToday=r.rappelDate===today;
    return `<div class="cfg-item" style="align-items:flex-start;${isPast?'opacity:.6':''}">
      <span class="nm" style="cursor:pointer" onclick="ouvrirLigne(event,'${r.id}')">${esc(recName(r))} <span class="muted" style="font-weight:400">— ${esc(r.dossier||'')}</span></span>
      <span class="tag" style="background:${isToday?'rgba(230,148,57,.15)':'rgba(45,125,210,.12)'};color:${isToday?'#B96A0A':'#2D7DD2'}">${fmtDateLong(r.rappelDate)}${r.rappelHeure?' à '+r.rappelHeure:''}</span>
      ${r.rappelNote?`<span class="muted" style="font-size:.78rem">${esc(r.rappelNote)}</span>`:''}
      <span class="sp"><button class="iconbtn" title="Ouvrir le dossier" onclick="openDossier('${r.id}')">📁</button><button class="iconbtn del" title="Annuler le rappel" onclick="delRappel('${r.id}')">🗑️</button></span>
    </div>`;
  };
  let h=`<div class="panel"><div class="panel-h"><h3>À venir <span class="muted" style="font-weight:400">(${avenir.length})</span></h3></div><div class="panel-b">`;
  h+=avenir.length?`<div class="cfg-list">${avenir.map(row).join('')}</div>`:`<div class="empty"><div class="big">⏰</div>Aucun rappel à venir. Fixez-en un depuis la fiche d'un dossier.</div>`;
  h+=`</div></div>`;
  if(passes.length){
    h+=`<div class="panel" style="margin-top:1.2rem"><div class="panel-h"><h3>Passés <span class="muted" style="font-weight:400">(${passes.length})</span></h3></div><div class="panel-b"><div class="cfg-list">${passes.map(row).join('')}</div></div></div>`;
  }
  document.getElementById('content').innerHTML=h;
}
function renderPlanning(){
  if(can('rdv_manage'))document.getElementById('pageActions').innerHTML=actionBtn('+ Nouveau RDV','openRdv()','btn-pri');
  const users=getUsers().filter(u=>u.active&&(can('planning_view_all')||ownScope().includes(u.id)));
  const depts=[...new Set(filteredRdvs().map(r=>r.dept).filter(Boolean))].sort();
  let h=`<div class="plan-tools">
    <div class="seg">
      <button class="${CAL.view==='mois'?'act':''}" onclick="CAL.view='mois';renderPlanning()">Mois</button>
      <button class="${CAL.view==='semaine'?'act':''}" onclick="CAL.view='semaine';renderPlanning()">Semaine</button>
      <button class="${CAL.view==='liste'?'act':''}" onclick="CAL.view='liste';renderPlanning()">Liste</button>
    </div>
    <select id="plUser" onchange="CAL.filterUser=this.value;renderPlanning()"><option value="">Tous les intervenants</option>${users.map(u=>`<option value="${u.id}" ${u.id===CAL.filterUser?'selected':''}>${esc(u.prenom+' '+u.nom)}</option>`).join('')}</select>
    <select id="plDept" onchange="CAL.filterDept=this.value;renderPlanning()"><option value="">Tous les départements</option>${depts.map(d=>`<option value="${d}" ${d===CAL.filterDept?'selected':''}>Dépt ${d}</option>`).join('')}</select>
    <span class="muted" style="margin-left:auto">${filteredRdvs().length} RDV affiché(s)</span>
  </div>
  <div class="plan-layout">
    <div id="calArea"></div>
    <div><div id="map"></div>
      <div class="map-leg"><div class="lt">Légende — type de RDV</div><div id="mapLeg"></div></div>
    </div>
  </div>`;
  document.getElementById('content').innerHTML=h;
  drawCalendar();
  setTimeout(initMap,80);
}
function filteredRdvs(){
  let r=getRdvs().filter(rdvVisible);
  if(CAL.filterUser)r=r.filter(x=>x.userId===CAL.filterUser);
  if(CAL.filterDept)r=r.filter(x=>x.dept===CAL.filterDept);
  return r;
}
const MONTHS=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DOW=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
function drawCalendar(){
  const area=document.getElementById('calArea');if(!area)return;
  if(CAL.view==='liste'){drawCalList(area);return;}
  if(CAL.view==='semaine'){drawCalWeek(area);return;}
  // mois
  const first=new Date(CAL.y,CAL.m,1);let start=(first.getDay()+6)%7;
  const days=new Date(CAL.y,CAL.m+1,0).getDate();
  const rdvs=filteredRdvs();const byDay={};rdvs.forEach(r=>{(byDay[r.date]=byDay[r.date]||[]).push(r);});
  const todayStr=new Date().toISOString().slice(0,10);
  let h=`<div class="cal"><div class="cal-head"><button class="nav" onclick="calMove(-1)">‹</button><div class="mlabel">${MONTHS[CAL.m]} ${CAL.y}</div><button class="nav" onclick="calMove(1)">›</button><div style="margin-left:auto"><button class="btn btn-ghost btn-sm" onclick="calToday()">Aujourd'hui</button></div></div>
  <div class="cal-grid">`+DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<start;i++){const pm=new Date(CAL.y,CAL.m,0-(start-1-i)).getDate();h+=`<div class="cal-cell other"><div class="dnum">${pm}</div></div>`;}
  for(let d=1;d<=days;d++){
    const ds=`${CAL.y}-${String(CAL.m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const evs=(byDay[ds]||[]).sort((a,b)=>(a.heure||'').localeCompare(b.heure||''));
    let ev='';evs.slice(0,3).forEach(e=>{ev+=`<div class="cal-ev" style="background:${rdvTypeColor(e.type)}" onclick="event.stopPropagation();openRdv('${e.id}')">${e.heure?e.heure+' ':''}${esc(e.client||'RDV')}</div>`;});
    if(evs.length>3)ev+=`<div class="cal-more">+${evs.length-3} autres</div>`;
    h+=`<div class="cal-cell ${ds===todayStr?'today':''}" onclick="${can('rdv_manage')?`openRdvDate('${ds}')`:''}"><div class="dnum">${d}</div>${ev}</div>`;
  }
  h+=`</div></div>`;area.innerHTML=h;
}
function drawCalWeek(area){
  // semaine contenant le 1er jour sélectionné ou aujourd'hui
  const base=CAL.sel?new Date(CAL.sel):new Date();
  const dow=(base.getDay()+6)%7;const mon=new Date(base);mon.setDate(base.getDate()-dow);
  const rdvs=filteredRdvs();const byDay={};rdvs.forEach(r=>{(byDay[r.date]=byDay[r.date]||[]).push(r);});
  const todayStr=new Date().toISOString().slice(0,10);
  let h=`<div class="cal"><div class="cal-head"><button class="nav" onclick="calMove(-1)">‹</button><div class="mlabel">Semaine du ${mon.toLocaleDateString('fr-FR',{day:'numeric',month:'long'})}</div><button class="nav" onclick="calMove(1)">›</button><div style="margin-left:auto"><button class="btn btn-ghost btn-sm" onclick="calToday()">Cette semaine</button></div></div><div class="cal-grid">`;
  const ws=[];for(let i=0;i<7;i++){const dd=new Date(mon);dd.setDate(mon.getDate()+i);ws.push(dd);}
  ws.forEach((dd,i)=>h+=`<div class="cal-dow">${DOW[i]} ${dd.getDate()}</div>`);
  ws.forEach(dd=>{const ds=dd.toISOString().slice(0,10);const evs=(byDay[ds]||[]).sort((a,b)=>(a.heure||'').localeCompare(b.heure||''));
    let ev='';evs.forEach(e=>{ev+=`<div class="cal-ev" style="background:${rdvTypeColor(e.type)}" onclick="event.stopPropagation();openRdv('${e.id}')">${e.heure?e.heure+' ':''}${esc(e.client||'RDV')}</div>`;});
    h+=`<div class="cal-cell ${ds===todayStr?'today':''}" style="min-height:240px" onclick="${can('rdv_manage')?`openRdvDate('${ds}')`:''}">${ev||'<div class="muted" style="font-size:.7rem">—</div>'}</div>`;});
  h+=`</div></div>`;area.innerHTML=h;
}
function drawCalList(area){
  const today=new Date();today.setHours(0,0,0,0);
  const rdvs=filteredRdvs().sort((a,b)=>(a.date+a.heure).localeCompare(b.date+b.heure));
  let h=`<div class="panel"><div class="panel-h"><h3>Tous les rendez-vous</h3></div><div class="panel-b">`;
  if(!rdvs.length)h+=`<div class="empty"><div class="big">🗓️</div>Aucun RDV.</div>`;
  else{h+=`<div class="rdv-list" style="max-height:600px">`;rdvs.forEach(r=>{const past=new Date(r.date)<today;
    h+=`<div class="rdv-card" style="border-left-color:${rdvTypeColor(r.type)};${past?'opacity:.6':''}" onclick="openRdv('${r.id}')"><div class="rt"><span class="rn">${esc(r.client||'RDV')}</span><span class="rtime">${fmtDateLong(r.date)} ${r.heure||''}</span></div><div class="rm"><span style="color:${rdvTypeColor(r.type)};font-weight:700">${esc(r.type||'')}</span>${r.ville?' • '+esc(r.ville):''}${rdvWho(r)?' • '+esc(rdvWho(r)):''}</div></div>`;});h+=`</div>`;}
  h+=`</div></div>`;area.innerHTML=h;
}
/* ---- couleur des RDV selon leur TYPE (planning : calendrier, liste, carte) ---- */
const RDV_TYPE_COLORS={
  'Visite technique':'#3D9970',
  'RDV commercial':'#7CC242',
  'Installation':'#B96A0A',
  'Audit':'#8E44AD',
  'SAV':'#E63946',
  'Rappel':'#2D7DD2'
};
function rdvTypeColor(type){return RDV_TYPE_COLORS[type]||'#9aa5b1';}
function calMove(d){if(CAL.view==='semaine'){const b=CAL.sel?new Date(CAL.sel):new Date();b.setDate(b.getDate()+d*7);CAL.sel=b.toISOString().slice(0,10);}else{CAL.m+=d;if(CAL.m<0){CAL.m=11;CAL.y--;}if(CAL.m>11){CAL.m=0;CAL.y++;}}drawCalendar();}
function calToday(){const n=new Date();CAL.y=n.getFullYear();CAL.m=n.getMonth();CAL.sel=n.toISOString().slice(0,10);drawCalendar();}

/* ---- carte ---- */
function initMap(){
  const el=document.getElementById('map');if(!el)return;
  if(MAP){MAP.remove();MAP=null;}
  MAP=L.map('map',{scrollWheelZoom:true}).setView([46.6,2.4],5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(MAP);
  MARKERS=L.layerGroup().addTo(MAP);
  refreshMarkers();
}
function refreshMarkers(){
  if(!MARKERS)return;MARKERS.clearLayers();
  const rdvs=filteredRdvs();
  rdvs.forEach(r=>{
    const c=coordsFor(r);if(!c)return;
    const s=statById(r.statusId);const col=rdvTypeColor(r.type);
    const ic=L.divIcon({className:'',html:`<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:${col};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,iconSize:[18,18],iconAnchor:[9,18]});
    L.marker(c,{icon:ic}).addTo(MARKERS).bindPopup(`<b>${esc(r.client||'RDV')}</b><br>${fmtDateLong(r.date)} ${r.heure||''}<br><span style="color:${col};font-weight:700">${esc(r.type||'')}</span><br>${esc(r.ville||'')} ${esc(r.cp||'')}<br><span class="muted">${s?esc(s.name):''}</span>${r.recordId?`<br><a href="javascript:void(0)" onclick="openDossier('${r.recordId}')" style="color:#2D7DD2;font-weight:700">📁 Voir la fiche client</a>`:''}`);
  });
  // légende par type de RDV
  const leg=document.getElementById('mapLeg');
  if(leg){const typesUsed=[...new Set(filteredRdvs().map(r=>r.type).filter(Boolean))];
    leg.innerHTML=typesUsed.length?typesUsed.map(t=>`<div class="leg-row"><span class="d" style="background:${rdvTypeColor(t)}"></span>${esc(t)}</div>`).join(''):'<span class="muted">Aucun RDV positionné. Les RDV sont placés au centre de leur département (ou aux coordonnées précises si géolocalisé).</span>';}
}

/* ---- modal RDV ---- */
function openRdvDate(ds){openRdv(null,null,ds);}
function openRdv(id,recId,presetDate){
  if(!can('rdv_manage')&&id){ // lecture seule possible pour voir
  }
  const r=id?getRdvs().find(x=>x.id===id):null;
  const rec=recId?recById(recId):(r&&r.recordId?recById(r.recordId):null);
  const users=getUsers().filter(u=>u.active);
  const recs=visibleRecs();
  const d=r||{};
  const clientName=d.client||(rec?recName(rec):'');
  const recSel=`<option value="">— Saisie libre / hors dossier —</option>`+recs.map(x=>`<option value="${x.id}" ${(d.recordId||recId)===x.id?'selected':''}>${esc(x.dossier)} — ${esc(recName(x))}</option>`).join('');
  const userSel=`<option value="">— Intervenant —</option>`+users.map(u=>`<option value="${u.id}" ${(d.userId||(!id?ME.id:''))===u.id?'selected':''}>${esc(u.prenom+' '+u.nom)}</option>`).join('');
  const types=['Visite technique','RDV commercial','Installation','Audit','SAV','Rappel'];
  const curType=d.type||types[0];
  const curInterId=d.subId||d.userId||(!id&&rdvKind(curType)==='user'?ME.id:'');
  const wa=rec?recWorkAddr(rec):{};const baseRec={...wa,tel:rec?(rec.tel||''):''};
  let body=`<input type="hidden" id="rd_id" value="${id||''}">
  ${id?`<div class="rdv-recap"><div class="rr-row"><span>📅 Date & heure</span><b>${fmtDateLong(d.date)}${d.heure?' à '+d.heure:''}</b></div><div class="rr-row"><span>Type de RDV</span><b>${esc(d.type||'RDV')}</b></div><div class="rr-row"><span>Intervenant</span><b>${esc(rdvWho(d))||'—'}</b></div>${d.client?`<div class="rr-row"><span>Client</span><b>${esc(d.client)}</b></div>`:''}</div>`:''}
  <div class="fgrid">
    <div class="fld full"><label>Dossier lié</label><select id="rd_rec" onchange="rdvFillFromRec()">${recSel}</select></div>
    <div class="fld"><label>Client / Libellé</label><input id="rd_client" value="${esc(clientName)}"></div>
    <div class="fld"><label>Téléphone</label><input id="rd_tel" value="${esc(d.tel||baseRec.tel||'')}"></div>
    <div class="fld"><label>Date</label><input type="date" id="rd_date" value="${esc(d.date||presetDate||new Date().toISOString().slice(0,10))}"></div>
    <div class="fld"><label>Heure</label><input type="time" id="rd_heure" value="${esc(d.heure||'09:00')}"></div>
    <div class="fld"><label>Type de RDV</label><select id="rd_type" onchange="rdvTypeChange()">${types.map(t=>`<option ${d.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
    <div class="fld"><label id="rd_user_lab">${rdvKind(curType)==='user'?'Intervenant':rdvKind(curType)==='poseur'?'Poseur':'Sous-traitant ('+rdvKindLabel(rdvKind(curType))+')'}</label><select id="rd_user">${rdvIntervenantOptions(curType,curInterId)}</select></div>
    <div class="fld full"><label>Adresse</label><input id="rd_adresse" value="${esc(d.adresse||baseRec.adresse||'')}"></div>
    <div class="fld"><label>Code postal</label><input id="rd_cp" value="${esc(d.cp||baseRec.cp||'')}" oninput="document.getElementById('rd_dept').value=deptFromCP(this.value)"></div>
    <div class="fld"><label>Ville</label><input id="rd_ville" value="${esc(d.ville||baseRec.ville||'')}"></div>
    <div class="fld"><label>Département</label><input id="rd_dept" value="${esc(d.dept||baseRec.dept||deptFromCP(baseRec.cp)||'')}"></div>
    <div class="fld"><label>Statut du RDV <span style="font-weight:500;text-transform:none;color:var(--text-mut)">(couleur sur le planning)</span></label><select id="rd_status">${statusOptions(d.statusId||(getAllStatuses().find(s=>s.name==='RDV pris')||getStatuses()[0]||{}).id)}</select></div>
    <div class="fld full"><label>Notes</label><textarea id="rd_notes">${esc(d.notes||'')}</textarea></div>
  </div>
  <p class="muted" style="margin-top:.6rem">📍 Le point sur la carte est placé au centre du département. Utilisez « Géolocaliser » pour l'adresse exacte.</p>`;
  let foot=`<button class="btn btn-ghost" onclick="closeModal()">Fermer</button>`;
  if(rec)foot+=`<button class="btn btn-navy" onclick="ouvrirLigne(event,'${rec.id}',true)">📁 Voir la fiche client</button>`;
  if(can('rdv_manage')){
    foot+=`<button class="btn btn-navy" onclick="geocodeRdv()">📍 Géolocaliser</button>`;
    if(id)foot+=`<button class="btn btn-danger" onclick="delRdv('${id}')">Supprimer</button>`;
    foot+=`<button class="btn btn-pri" onclick="saveRdv()">💾 Enregistrer</button>`;
  }
  openModal(id?'Modifier le RDV':'Nouveau rendez-vous',body,foot,'');
}
function rdvFillFromRec(){
  const rid=document.getElementById('rd_rec').value;const rec=recById(rid);if(!rec)return;
  const a=recWorkAddr(rec);
  document.getElementById('rd_client').value=recName(rec);
  document.getElementById('rd_tel').value=rec.tel||'';
  document.getElementById('rd_adresse').value=a.adresse;
  document.getElementById('rd_cp').value=a.cp;
  document.getElementById('rd_ville').value=a.ville;
  document.getElementById('rd_dept').value=a.dept||'';
}
function saveRdv(){
  const id=val('rd_id');const rdvs=getRdvs();
  let r=id?rdvs.find(x=>x.id===id):null;const isNew=!r;
  if(isNew){r={id:uid(),created:Date.now()};rdvs.push(r);}
  const type=val('rd_type');const kind=rdvKind(type);const interId=val('rd_user');
  let userId='',subId='',subName='',subKind='';
  if(kind==='user'||kind==='poseur'){userId=interId;}
  else{subId=interId;subKind=kind;const it=rdvList(kind).find(x=>x.id===interId);subName=it?it.name:'';}
  Object.assign(r,{recordId:val('rd_rec'),client:val('rd_client'),tel:val('rd_tel'),date:val('rd_date'),heure:val('rd_heure'),
    type,userId,subId,subName,subKind,ownerId:r.ownerId||ME.id,adresse:val('rd_adresse'),cp:val('rd_cp'),ville:val('rd_ville'),
    dept:val('rd_dept')||deptFromCP(val('rd_cp')),statusId:val('rd_status'),notes:val('rd_notes')});
  if(!r.date){toast('Date requise','err');return;}
  if(isNew&&userId&&userId!==ME.id){
    const rec=r.recordId?recById(r.recordId):null;
    createNotification(userId,'rdv_upcoming',`📅 Nouveau RDV le ${fmtDateLong(r.date)}${r.heure?' à '+r.heure:''} — ${rec?recName(rec):(r.client||'')}`,r.recordId);
  }
  // RDV lié à un dossier : on trace dans l'historique SANS jamais modifier le statut (le statut ne change que manuellement)
  if(r.recordId){const recs=getRecs();const rec=recs.find(x=>x.id===r.recordId);if(rec){rec.history=rec.history||[];rec.history.unshift({date:Date.now(),user:(ME.prenom+' '+ME.nom).trim()||ME.code,text:`${isNew?'RDV planifié':'RDV modifié'} : ${r.type||'RDV'} le ${fmtDateLong(r.date)}${r.heure?' à '+r.heure:''}`});save(K.recs,recs);logActivity('action',`📅 ${isNew?'RDV planifié':'RDV modifié'} sur ${rec.dossier||r.recordId} : ${r.type||'RDV'} le ${fmtDateLong(r.date)}${r.heure?' à '+r.heure:''}`,r.recordId);}}
  save(K.rdv,rdvs);closeModal();buildNav();
  if(DOSSIER_OPEN){openDossier(DOSSIER_OPEN);}else if(CUR==='planning'){renderPlanning();}else if(CUR==='rdvs'){renderRdvs();}else if(CUR==='dash'){renderDash();}
  toast(isNew?'RDV créé ✓':'RDV mis à jour ✓','ok');
}
function delRdv(id){save(K.rdv,getRdvs().filter(r=>r.id!==id));deleteRemoteRow(K.rdv,id);closeModal();buildNav();if(DOSSIER_OPEN)openDossier(DOSSIER_OPEN);else if(CUR==='planning')renderPlanning();else if(CUR==='rdvs')renderRdvs();toast('RDV supprimé','ok');}
async function geocodeRdv(){
  const q=[val('rd_adresse'),val('rd_cp'),val('rd_ville')].filter(Boolean).join(', ');
  if(!q){toast('Renseignez une adresse','err');return;}
  toast('Géolocalisation…');
  try{
    const res=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q='+encodeURIComponent(q));
    const j=await res.json();
    if(j&&j[0]){const id=val('rd_id');const rdvs=getRdvs();let r=id?rdvs.find(x=>x.id===id):null;
      if(!r){toast('Enregistrez d\'abord le RDV','err');return;}
      r.lat=parseFloat(j[0].lat);r.lng=parseFloat(j[0].lon);save(K.rdv,rdvs);
      toast('Position trouvée ✓','ok');if(CUR==='planning')refreshMarkers();
    }else toast('Adresse introuvable','err');
  }catch(e){toast('Géolocalisation indisponible','err');}
}

/* ====================================================================
   RDVs (liste globale)
   ==================================================================== */
function renderRdvs(){
  if(can('rdv_manage'))document.getElementById('pageActions').innerHTML=actionBtn('+ Nouveau RDV','openRdv()','btn-pri');
  let rdvs=getRdvs().filter(rdvVisible);
  rdvs.sort((a,b)=>(b.date+(b.heure||'')).localeCompare(a.date+(a.heure||'')));
  let h=`<div class="tbl-wrap"><div class="tbl-toolbar"><div class="srch"><input placeholder="Rechercher un RDV…" oninput="filterRdvTable(this.value)"></div></div><div id="rdvTbl"></div></div>`;
  document.getElementById('content').innerHTML=h;
  drawRdvTable(rdvs);
}
function filterRdvTable(q){let rdvs=getRdvs().filter(rdvVisible);
  q=q.toLowerCase();if(q)rdvs=rdvs.filter(r=>((r.client||'')+(r.ville||'')+(r.type||'')).toLowerCase().includes(q));
  rdvs.sort((a,b)=>(b.date+(b.heure||'')).localeCompare(a.date+(a.heure||'')));drawRdvTable(rdvs);}
function drawRdvTable(rdvs){
  let h;
  if(!rdvs.length)h=`<div class="empty"><div class="big">🗓️</div>Aucun rendez-vous.</div>`;
  else{h=`<table class="tbl"><thead><tr><th>Date</th><th>Heure</th><th>Client</th><th>Type</th><th>Ville</th><th>Intervenant</th><th>Statut</th><th style="text-align:right">Actions</th></tr></thead><tbody>`;
    rdvs.forEach(r=>{const u=userById(r.userId);h+=`<tr><td>${fmtDateLong(r.date)}</td><td><b>${esc(r.heure||'')}</b></td><td class="tbl-name">${esc(r.client||'RDV')}</td><td class="muted">${esc(r.type||'')}</td><td>${esc(r.ville||'')}</td><td class="muted">${esc(rdvWho(r))||'—'}</td><td>${badge(r.statusId)}</td><td><div class="row-act"><button class="iconbtn" onclick="openRdv('${r.id}')">📋</button>${can('rdv_manage')?`<button class="iconbtn del" onclick="delRdv('${r.id}')">🗑️</button>`:''}</div></td></tr>`;});
    h+=`</tbody></table>`;}
  document.getElementById('rdvTbl').innerHTML=h;
}

/* ====================================================================
   SAV
   ==================================================================== */
const getSav=()=>load('egncrm_sav',[]);
function renderSav(){
  document.getElementById('pageActions').innerHTML=actionBtn('+ Nouveau ticket','openSav()','btn-pri');
  const sav=getSav().sort((a,b)=>(b.created||0)-(a.created||0));
  let h=`<div class="tbl-wrap"><div id="savTbl"></div></div>`;document.getElementById('content').innerHTML=h;
  let t;
  if(!sav.length)t=`<div class="empty"><div class="big">🔧</div>Aucun ticket SAV.</div>`;
  else{t=`<table class="tbl"><thead><tr><th>Date</th><th>Client</th><th>Sujet</th><th>Priorité</th><th>Statut</th><th style="text-align:right">Actions</th></tr></thead><tbody>`;
    sav.forEach(s=>{const pc={'Haute':'red','Moyenne':'','Basse':'grey'}[s.priorite]||'';const sc={'Ouvert':'red','En cours':'','Résolu':'green'}[s.statut]||'';
      t+=`<tr><td>${new Date(s.created).toLocaleDateString('fr-FR')}</td><td class="tbl-name">${esc(s.client||'')}</td><td>${esc(s.sujet||'')}</td><td><span class="pill ${pc}">${esc(s.priorite||'')}</span></td><td><span class="pill ${sc}">${esc(s.statut||'')}</span></td><td><div class="row-act"><button class="iconbtn" onclick="openSav('${s.id}')">📋</button><button class="iconbtn del" onclick="delSav('${s.id}')">🗑️</button></div></td></tr>`;});
    t+=`</tbody></table>`;}
  document.getElementById('savTbl').innerHTML=t;
}
function openSav(id){
  const s=id?getSav().find(x=>x.id===id):null;const d=s||{};
  const recs=visibleRecs();const recSel=`<option value="">— Hors dossier —</option>`+recs.map(r=>`<option value="${r.id}" ${d.recordId===r.id?'selected':''}>${esc(r.dossier)} — ${esc(recName(r))}</option>`).join('');
  let body=`<input type="hidden" id="sv_id" value="${id||''}"><div class="fgrid">
    <div class="fld full"><label>Dossier</label><select id="sv_rec" onchange="const r=recById(this.value);if(r)document.getElementById('sv_client').value=recName(r)">${recSel}</select></div>
    <div class="fld full"><label>Client</label><input id="sv_client" value="${esc(d.client)}"></div>
    <div class="fld full"><label>Sujet</label><input id="sv_sujet" value="${esc(d.sujet)}"></div>
    <div class="fld"><label>Priorité</label><select id="sv_prio"><option ${d.priorite==='Haute'?'selected':''}>Haute</option><option ${d.priorite==='Moyenne'||!d.priorite?'selected':''}>Moyenne</option><option ${d.priorite==='Basse'?'selected':''}>Basse</option></select></div>
    <div class="fld"><label>Statut</label><select id="sv_stat"><option ${d.statut==='Ouvert'||!d.statut?'selected':''}>Ouvert</option><option ${d.statut==='En cours'?'selected':''}>En cours</option><option ${d.statut==='Résolu'?'selected':''}>Résolu</option></select></div>
    <div class="fld full"><label>Description</label><textarea id="sv_desc">${esc(d.description)}</textarea></div></div>`;
  openModal(id?'Ticket SAV':'Nouveau ticket SAV',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveSav()">💾 Enregistrer</button>`);
}
function saveSav(){const id=val('sv_id');const sav=getSav();let s=id?sav.find(x=>x.id===id):null;const isNew=!s;if(isNew){s={id:uid(),created:Date.now()};sav.push(s);}Object.assign(s,{recordId:val('sv_rec'),client:val('sv_client'),sujet:val('sv_sujet'),priorite:val('sv_prio'),statut:val('sv_stat'),description:val('sv_desc')});save('egncrm_sav',sav);closeModal();buildNav();renderSav();toast('Ticket enregistré ✓','ok');}
function delSav(id){save('egncrm_sav',getSav().filter(s=>s.id!==id));deleteRemoteRow('egncrm_sav',id);buildNav();renderSav();toast('Ticket supprimé','ok');}

/* ====================================================================
   IMPORT EXCEL / CSV
   ==================================================================== */
const IMPORT_COLS=['Raison sociale','Nom','Téléphone','Email','Adresse','Code postal','Ville'];
let IMPORTED=[];
function renderImport(){
  const users=getUsers().filter(u=>u.active);
  const ops=getProducts();
  const srcs=getSources();
  let h=`<div style="max-width:760px">
    <div class="fgrid c3" style="margin-bottom:1rem">
      <div class="fld"><label>👤 Attribuer les leads importés à</label><select id="imp_user"><option value="">— Non affecté —</option>${users.map(u=>`<option value="${u.id}">${esc(u.prenom+' '+u.nom)} (${ROLES[u.role]||u.role})</option>`).join('')}</select><div class="muted" style="font-size:.74rem;margin-top:.35rem">Tous les leads du fichier seront attribués à cet utilisateur à la validation.</div></div>
      <div class="fld"><label>🏷️ Attribuer à l'opération</label><select id="imp_op"><option value="">— Aucune —</option>${ops.map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select><div class="muted" style="font-size:.74rem;margin-top:.35rem">Tous les leads du fichier seront rattachés à cette fiche CEE.</div></div>
      <div class="fld"><label>📣 Attribuer à la source</label><select id="imp_src"><option value="">— Aucune —</option>${srcs.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><div class="muted" style="font-size:.74rem;margin-top:.35rem">Tous les leads du fichier seront rattachés à cette source / régie.</div></div>
    </div>
    <div class="drop" id="dropZone" onclick="document.getElementById('fileIn').click()">
      <div class="di">📊</div><div class="dt">Glissez votre fichier Excel / CSV ici</div><div class="ds">ou cliquez pour sélectionner — .xlsx, .xls, .csv</div>
    </div>
    <input type="file" id="fileIn" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleFile(this.files[0])">
    <div style="display:flex;gap:.6rem;margin-top:.9rem;flex-wrap:wrap">
      <button class="btn btn-navy" onclick="downloadTemplate()">⬇️ Télécharger le modèle d'import</button>
      <span class="muted" style="align-self:center">Respectez les en-têtes du modèle pour un import propre.</span>
    </div>
    <div class="cols-box"><b>Colonnes du fichier</b><br>${IMPORT_COLS.map(c=>`<span class="chip">${c}</span>`).join('')}<br><span class="muted" style="font-size:.74rem">Au moins « Raison sociale » ou « Nom » est nécessaire. Le département et la zone climatique sont déduits du code postal. L'opération et le reste se renseignent ensuite dans chaque dossier.</span></div>
    <div id="importPreview"></div>
  </div>`;
  document.getElementById('content').innerHTML=h;
  const dz=document.getElementById('dropZone');
  ['dragover','dragenter'].forEach(e=>dz.addEventListener(e,ev=>{ev.preventDefault();dz.classList.add('has');}));
  ['dragleave','drop'].forEach(e=>dz.addEventListener(e,ev=>{ev.preventDefault();dz.classList.remove('has');}));
  dz.addEventListener('drop',ev=>{if(ev.dataTransfer.files[0])handleFile(ev.dataTransfer.files[0]);});
}
function downloadTemplate(){
  const ws=XLSX.utils.aoa_to_sheet([IMPORT_COLS,
    ['HELIA SOLUTIONS','Laurent Dupire','06 27 91 95 28','contact@helia.fr','33 Rue de la Bienfaisance','75008','Paris'],
    ['','Marc Petit','07 81 22 34 56','marc.petit@gmail.com','12 Avenue des Champs','69003','Lyon']]);
  ws['!cols']=IMPORT_COLS.map(()=>({wch:20}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Leads');
  XLSX.writeFile(wb,'Modele_Import_Leads_EGN.xlsx');
  toast('Modèle téléchargé ✓','ok');
}
function handleFile(file){
  if(!file)return;
  const rd=new FileReader();
  rd.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      if(!rows.length){toast('Fichier vide','err');return;}
      IMPORTED=rows;previewImport(rows);
    }catch(err){toast('Erreur de lecture du fichier','err');}
  };
  rd.readAsArrayBuffer(file);
}
function pick(row,keys){for(const k of keys){for(const rk in row){if(rk.toLowerCase().trim()===k.toLowerCase())return row[rk];}}return '';}
function mapRow(row){
  return {
    raisonSociale:pick(row,['Raison sociale','Raison Sociale','raison sociale','Société','Societe','Entreprise']),
    nom:pick(row,['Nom','nom','Nom complet','Contact']),
    tel:String(pick(row,['Téléphone','Telephone','téléphone','tel','Tel','Numéro','Numero','Portable','Mobile'])),
    email:pick(row,['Email','email','Mail','E-mail','mail']),
    adresse:pick(row,['Adresse','adresse','Adresse complète']),
    cp:String(pick(row,['Code postal','CP','cp','code postal'])),
    ville:pick(row,['Ville','ville','Commune'])
  };
}
function previewImport(rows){
  const m=rows.slice(0,50).map(mapRow);
  const cols=['Raison sociale','Nom','Téléphone','Email','Ville'];
  const uid2=val('imp_user');const u=uid2?userById(uid2):null;
  let h=`<div class="panel" style="margin-top:1.2rem"><div class="panel-h"><h3>Aperçu — ${rows.length} ligne(s)</h3><div class="sp"><button class="btn btn-ghost btn-sm" onclick="IMPORTED=[];document.getElementById('importPreview').innerHTML=''">Annuler</button> <button class="btn btn-pri btn-sm" onclick="doImport()">✓ Importer ${rows.length} lead(s)${u?' → '+esc(u.prenom):''}</button></div></div><div class="panel-b">
    <div class="preview-tbl"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>`;
  m.forEach(r=>{h+=`<tr><td>${esc(r.raisonSociale)}</td><td>${esc(r.nom)}</td><td>${esc(r.tel)}</td><td>${esc(r.email)}</td><td>${esc(r.ville)}</td></tr>`;});
  h+=`</tbody></table></div>${rows.length>50?'<p class="muted" style="margin-top:.5rem">Aperçu limité à 50 lignes. Tout sera importé.</p>':''}</div></div>`;
  document.getElementById('importPreview').innerHTML=h;
}
async function doImport(){
  if(!IMPORTED.length)return;
  const recs=getRecs();const sts=getStatuses();
  const defStatus=(sts.find(s=>s.name==='Nouveau')||sts[0]||{}).id;
  const assignId=val('imp_user');const assignUser=assignId?userById(assignId):null;
  const opId=val('imp_op');const op=opId?getAllProducts().find(o=>o.id===opId):null;
  const srcId=val('imp_src');const src=srcId?getSources().find(s=>s.id===srcId):null;
  let n=0;
  document.getElementById('importPreview').innerHTML=`<div class="panel" style="margin-top:1.2rem"><div class="panel-b"><div class="empty"><div class="big">⏳</div>Import en cours… (numérotation des dossiers)</div></div></div>`;
  for(const row of IMPORTED){
    const r=mapRow(row);
    if(!r.raisonSociale&&!r.nom&&!r.tel)continue;
    recs.push({id:uid(),dossier:await nextDossier(),created:Date.now(),
      raisonSociale:r.raisonSociale,nom:r.nom,tel:r.tel,email:r.email,adresse:r.adresse,cp:r.cp,ville:r.ville,
      dept:deptFromCP(r.cp),
      productId:opId||'',sourceId:srcId||'',statusId:defStatus,userId:assignId||'',
      history:[{date:Date.now(),user:(ME.prenom+' '+ME.nom).trim()||ME.code,text:'Importé depuis fichier'+(assignUser?' — attribué à '+assignUser.prenom+' '+assignUser.nom:'')+(op?' — opération : '+op.name:'')+(src?' — source : '+src.name:'')}]});
    n++;
  }
  save(K.recs,recs);IMPORTED=[];buildNav();
  document.getElementById('importPreview').innerHTML=`<div class="panel" style="margin-top:1.2rem"><div class="panel-b"><div class="empty"><div class="big">✅</div><b>${n} lead(s) importé(s) avec succès !</b>${assignUser?`<br><span class="muted">Attribués à ${esc(assignUser.prenom+' '+assignUser.nom)}</span>`:''}<br><button class="btn btn-pri" style="margin-top:1rem" onclick="go('leads')">Voir les leads →</button></div></div></div>`;
  toast(n+' lead(s) importé(s) ✓','ok');
}

