/* ============================================================
   EGN CRM — modules/18-sav.js
   SAV
   ============================================================ */
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

