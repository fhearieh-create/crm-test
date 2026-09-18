/* ============================================================
   EGN CRM — modules/19-import.js
   Import Excel / CSV
   ============================================================ */
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

