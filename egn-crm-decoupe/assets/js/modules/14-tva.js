/* ============================================================
   EGN CRM — modules/14-tva.js
   TVA mensualisée sur encaissements et décaissements
   ============================================================ */
/* ============================================================
   TVA À PAYER — TVA collectée sur les recettes (prime CEE)
   ============================================================ */
/* ============================================================
   PAIEMENTS DÉLÉGATAIRES
   Regroupe les dossiers par délégataire, création d'APF délégataire,
   suivi En attente de virement / Virement reçu.
   Quand virement reçu → sous-statut administratif "Payé" sur les dossiers.
   ============================================================ */
let DELEG_DRAFT_APF=null; // APF délégataire en cours de création
let DELEG_VUE='',DELEG_VUE_FILTRE='';
/* Vue transversale des APF delegataires, tous delegataires confondus */
function renderVirements(statut){
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  const attente=statut==='attente';
  const tous=segApfDeleg().filter(a=>attente?a.statut!=='recu':a.statut==='recu');
  const delegs=getDelegataires();
  const nomDe=id=>{const d=delegs.find(x=>x.id===id);return d?d.name:'— Délégataire supprimé —';};
  const presents=[...new Set(tous.map(a=>a.delegId))].map(id=>({id,nom:nomDe(id)})).sort((a,b)=>a.nom.localeCompare(b.nom));
  if(DELEG_VUE_FILTRE&&!presents.some(p=>p.id===DELEG_VUE_FILTRE))DELEG_VUE_FILTRE='';
  const apfs=tous.filter(a=>!DELEG_VUE_FILTRE||a.delegId===DELEG_VUE_FILTRE)
    .sort((a,b)=>(b.date||0)-(a.date||0));
  const montantDe=a=>(a.recIds||[]).reduce((s,id)=>{const r=recById(id);return s+(r?primeOf(r)||0:0);},0);
  const total=apfs.reduce((s,a)=>s+montantDe(a),0);
  const fsty="font-family:'Saira',sans-serif;font-size:.8rem;border:1.5px solid var(--border-grey);border-radius:8px;padding:.35rem .65rem;background:#fff;outline:none;font-weight:700";
  let h=`<div style="display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin-bottom:.9rem">
    <button class="btn btn-ghost btn-sm" onclick="DELEG_VUE='';DELEG_VUE_FILTRE='';renderComptaDelegataires()">← Retour</button>
    <span style="font-weight:800;font-size:.95rem">${attente?'⏳ Virements en attente':'✅ Virements reçus'}</span>
    <span class="muted" style="font-size:.8rem">${apfs.length} APF · ${eur(total)}</span>
    <select onchange="DELEG_VUE_FILTRE=this.value;renderComptaDelegataires()" style="${fsty};margin-left:auto">
      <option value="">Tous les délégataires</option>
      ${presents.map(p=>`<option value="${p.id}" ${DELEG_VUE_FILTRE===p.id?'selected':''}>${esc(p.nom)}</option>`).join('')}
    </select>
  </div>`;
  if(!apfs.length){
    h+=`<div class="empty"><div class="big">${attente?'⏳':'✅'}</div>Aucun APF ${attente?'en attente de virement':'avec virement reçu'}.</div>`;
    document.getElementById('comptaBody').innerHTML=h;return;
  }
  h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>N° APF</th><th>Délégataire</th><th>Date</th><th class="r">Dossiers</th><th class="r">Prime client HT</th><th class="r">Commission installateur</th><th class="r">Montant TTC</th><th>Justificatif</th><th style="width:130px">Statut</th><th style="width:125px">Reçu le</th>
  </tr></thead><tbody>`;
  apfs.forEach(a=>{
    const m=montantDe(a);
    const recu=a.statut==='recu';
    const dd=(a.recIds||[]).map(id=>recById(id)).filter(Boolean).map(primeDetailOf);
    const kc=dd.reduce((s,k)=>s+(k.primeClient||0),0);
    const kt=dd.reduce((s,k)=>s+(k.comTTC||0),0);
    const kh=dd.reduce((s,k)=>s+(k.comHT||0),0);
    h+=`<tr>
      <td><span class="dossier-tag" style="cursor:pointer" onclick="voirApfDeleg('${a.id}')">${esc(a.numApf||'—')} 👁️</span></td>
      <td style="font-weight:700">${esc(nomDe(a.delegId))}</td>
      <td class="muted">${new Date(a.date).toLocaleDateString('fr-FR')}</td>
      <td style="text-align:right"><button class="btn btn-ghost btn-sm" style="font-size:.74rem" onclick="voirApfDeleg('${a.id}')">${(a.recIds||[]).length} ›</button></td>
      <td style="text-align:right">${kc?eur(kc):'<span class="muted">—</span>'}</td>
      <td style="text-align:right">${kt?`${eur(kt)}<div class="muted" style="font-size:.64rem">HT ${eur(kh)}</div>`:'<span class="muted">—</span>'}</td>
      <td style="text-align:right;font-weight:800">${eur(m)}</td>
      <td>${a.fileUrl||a.filePath?attachLink(a.filePath,a.fileName||'Voir',a.fileUrl):'<span class="muted" style="font-size:.72rem">—</span>'}</td>
      <td><select onchange="saveApfDelegStatut('${a.id}',this.value)" style="font-family:'Saira',sans-serif;font-size:.74rem;font-weight:700;border:none;border-radius:7px;padding:3px 7px;cursor:pointer;width:100%;${recu?'background:#E6F7F0;color:#0F6E56':'background:#FFF4E5;color:#B96A0A'}">
        <option value="attente" ${!recu?'selected':''}>⏳ En attente</option>
        <option value="recu" ${recu?'selected':''}>✅ Virement reçu</option>
      </select></td>
      <td><input type="date" value="${esc(a.dateVirement||'')}" title="Saisir la date marque le virement comme reçu" onchange="saveApfDelegDate('${a.id}',this.value)" style="font-family:'Saira',sans-serif;font-size:.76rem;border:1.5px solid ${recu?'var(--green)':'var(--border-grey)'};border-radius:7px;padding:3px 5px;width:100%;outline:none;background:${recu?'#F0FBF0':'#fff'}"></td>
    </tr>`;
  });
  const tt=apfs.flatMap(a=>(a.recIds||[]).map(id=>recById(id)).filter(Boolean).map(primeDetailOf));
  h+=`<tr style="background:#f8faf5;font-weight:800"><td colspan="4">Total</td>
    <td style="text-align:right">${eur(tt.reduce((s,k)=>s+(k.primeClient||0),0))}</td>
    <td style="text-align:right">${eur(tt.reduce((s,k)=>s+(k.comTTC||0),0))}</td>
    <td style="text-align:right">${eur(total)}</td><td colspan="3"></td></tr>`;
  h+=`</tbody></table></div>`;
  document.getElementById('comptaBody').innerHTML=h;
}
function renderComptaDelegataires(){
  if(DELEG_VUE)return renderVirements(DELEG_VUE);
  const delegs=getDelegataires();
  const apfs=segApfDeleg();
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  // KPIs globaux tous délégataires confondus
  const totAttente=apfs.filter(a=>a.statut!=='recu').reduce((s,a)=>{
    return s+(a.recIds||[]).reduce((s2,rid)=>{const r=recById(rid);return s2+(r?primeOf(r)||0:0);},0);
  },0);
  const totRecu=apfs.filter(a=>a.statut==='recu').reduce((s,a)=>{
    return s+(a.recIds||[]).reduce((s2,rid)=>{const r=recById(rid);return s2+(r?primeOf(r)||0:0);},0);
  },0);
  const nbAttente=apfs.filter(a=>a.statut!=='recu').length;
  const nbRecu=apfs.filter(a=>a.statut==='recu').length;
  let h=`<div class="kpis" style="margin-bottom:1.1rem">
    <div class="kpi" onclick="DELEG_VUE='attente';renderComptaDelegataires()" style="cursor:pointer;border:1.5px solid rgba(230,148,57,.3)"><div class="kico">⏳</div><div class="klab">Virements en attente</div><div class="kval" style="color:#B96A0A">${eur(totAttente)}</div><div class="ksub">${nbAttente} APF · HT ${eur(htOf(totAttente))}</div></div>
    <div class="kpi" onclick="DELEG_VUE='recu';renderComptaDelegataires()" style="cursor:pointer;border:1.5px solid rgba(91,186,84,.4)"><div class="kico">✅</div><div class="klab">Virements reçus</div><div class="kval" style="color:var(--green-deep)">${eur(totRecu)}</div><div class="ksub">${nbRecu} APF · HT ${eur(htOf(totRecu))}</div></div>
    <div class="kpi"><div class="kico">📄</div><div class="klab">Total APF délégataires</div><div class="kval">${apfs.length}</div><div class="ksub">sur ${delegs.length} délégataire${delegs.length>1?'s':''}</div></div>
  </div>`;
  // Sélecteur délégataire
  const curDeleg=(DELEG_DRAFT_APF&&DELEG_DRAFT_APF.delegId)||load('egncrm_deleg_tab_sel','');
  const filtreNonAffilie=load('egncrm_deleg_tab_filter','1')==='1';
  h+=`<div class="panel"><div class="panel-h"><h3>Sélectionner un délégataire</h3></div><div class="panel-b">
    <div style="display:flex;gap:.7rem;align-items:center;flex-wrap:wrap">
      <select id="deleg_sel" onchange="selectDelegTab(this.value)" style="font-family:'Saira',sans-serif;font-size:.88rem;border:1.5px solid var(--border-grey);border-radius:9px;padding:.45rem .8rem;flex:1;min-width:200px">
        <option value="">— Choisir un délégataire —</option>
        ${delegs.map(d=>`<option value="${d.id}" ${d.id===curDeleg?'selected':''}>${esc(d.name)}</option>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;cursor:pointer;white-space:nowrap">
        <input type="checkbox" ${filtreNonAffilie?'checked':''} onchange="toggleDelegFilter(this.checked)">
        Afficher seulement les dossiers sans APF délégataire
      </label>
    </div>
  </div></div>`;
  if(!curDeleg){document.getElementById('comptaBody').innerHTML=h;return;}
  const deleg=delegs.find(d=>d.id===curDeleg);
  if(!deleg){document.getElementById('comptaBody').innerHTML=h;return;}
  // Dossiers valorisés chez ce délégataire
  const recs=segRecs().filter(r=>{
    const deal=dealOf(r);
    return deal&&deal.delegataireId===curDeleg&&(primeOf(r)||0)>0;
  });
  // APFs délégataire existants pour ce délégataire
  const myApfs=apfs.filter(a=>a.delegId===curDeleg).sort((a,b)=>(b.date||0)-(a.date||0));
  // IDs déjà affiliés
  const affilieIds=new Set(myApfs.flatMap(a=>a.recIds||[]));
  let filtered=filtreNonAffilie?recs.filter(r=>!affilieIds.has(r.id)):recs;
  // Recherche client / n° dossier + filtre par opération
  const dq=load('egncrm_deleg_q','');
  const dop=load('egncrm_deleg_op','');
  const opsDispo=[...new Set(recs.map(r=>r.productId).filter(Boolean))]
    .map(id=>getAllProducts().find(o=>o.id===id)).filter(Boolean)
    .sort((a,b)=>a.name.localeCompare(b.name));
  if(dop)filtered=filtered.filter(r=>r.productId===dop);
  if(dq){
    const q=dq.toLowerCase();
    filtered=filtered.filter(r=>{
      const site=r.opFields?Object.values(r.opFields).join(' '):'';
      return [r.dossier,clientNameOf(r),r.ville,r.cp,r.siret,site].join(' ').toLowerCase().includes(q);
    });
  }
  // Stats
  const totPrime=filtered.reduce((s,r)=>s+(primeOf(r)||0),0);
  // Grouper par opération
  const byOp={};
  filtered.forEach(r=>{const k=r.productId||'';byOp[k]=byOp[k]||[];byOp[k].push(r);});
  h+=`<div class="kpis">
    <div class="kpi"><div class="kico">🏦</div><div class="klab">Dossiers affichés</div><div class="kval">${filtered.length}</div><div class="ksub">${recs.length} total chez ${esc(deleg.name)}</div></div>
    <div class="kpi accent"><div class="kico">💶</div><div class="klab">Total prime affiché</div><div class="kval">${eur(totPrime)}</div><div class="ksub">HT ${eur(htOf(totPrime))}</div></div>
    <div class="kpi"><div class="kico">📄</div><div class="klab">APF délégataires créés</div><div class="kval">${myApfs.length}</div><div class="ksub">${myApfs.filter(a=>a.statut==='recu').length} virements reçus</div></div>
  </div>`;
  // Tableau des dossiers
  h+=`<div class="panel"><div class="panel-h"><h3>Dossiers valorisés — ${esc(deleg.name)}</h3>
    <div class="sp"><button class="btn btn-pri btn-sm" onclick="ouvrirCreerApfDeleg('${curDeleg}')">+ Créer un APF délégataire</button></div>
  </div><div class="panel-b">`;
  // Barre de recherche + filtre opération
  const fs="font-family:'Saira',sans-serif;font-size:.8rem;border:1.5px solid var(--border-grey);border-radius:8px;padding:.35rem .65rem;background:#fff;outline:none";
  h+=`<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:.8rem">
    <input id="deleg_q" type="text" value="${esc(dq)}" placeholder="🔍 Rechercher un client, un n° de dossier, une ville…" oninput="setDelegSearch('q',this)" style="${fs};flex:1;min-width:200px">
    <select onchange="setDelegSearch('op',this)" style="${fs}">
      <option value="">Toutes les opérations</option>
      ${opsDispo.map(o=>`<option value="${o.id}" ${dop===o.id?'selected':''}>${esc(o.name)}</option>`).join('')}
    </select>
    ${(dq||dop)?`<button class="btn btn-ghost btn-sm" style="font-size:.72rem" onclick="resetDelegSearch()">✕ Réinitialiser</button>`:''}
    ${(dq||dop)?`<span class="muted" style="font-size:.75rem">${filtered.length} sur ${recs.length}</span>`:''}
  </div>`;
  if(!filtered.length)h+=`<div class="empty"><div class="big">🔍</div>Aucun dossier ne correspond${(dq||dop)?' à votre recherche':''}.</div>`;
  else{
    h+=`<div class="tbl-wrap"><table class="tbl">
      <thead><tr>
        <th style="width:36px"><input type="checkbox" id="deleg_chk_all" onchange="delegToggleAll(this.checked)"></th>
        <th>N° Dossier</th><th>Client</th><th>Opération</th>
        <th class="r">Prime client HT</th><th class="r">Commission installateur</th>
        <th class="r">Prime CEE TTC</th><th>APF délégataire</th>
      </tr></thead><tbody>`;
    filtered.forEach(r=>{
      const deal=dealOf(r);const op=getAllProducts().find(o=>o.id===r.productId);
      const k=primeDetailOf(r);
      const apfLie=myApfs.find(a=>(a.recIds||[]).includes(r.id));
      const apfBadge=apfLie
        ?`<span style="font-size:.72rem;font-weight:700;background:${apfLie.statut==='recu'?'#E6F7F0':'#FFF4E5'};color:${apfLie.statut==='recu'?'#0F6E56':'#B96A0A'};border-radius:6px;padding:2px 8px">${esc(apfLie.numApf||'—')} · ${apfLie.statut==='recu'?'✅ Reçu':'⏳ En attente'}</span>`
        :`<span class="muted" style="font-size:.72rem">—</span>`;
      h+=`<tr>
        <td><input type="checkbox" class="deleg_chk" data-rid="${r.id}" ${apfLie?'disabled title="Déjà affilié à un APF"':''}></td>
        <td><span class="dossier-tag" style="cursor:pointer" onclick="ouvrirLigne(event,'${r.id}')">${esc(r.dossier||'—')}</span></td>
        <td>${esc(clientNameOf(r))}</td>
        <td class="muted">${op?esc(op.name):'—'}</td>
        <td style="text-align:right">${k.estime?'<span class="muted">—</span>':eur(k.primeClient)}</td>
        <td style="text-align:right">${k.estime?'<span class="muted">—</span>':`${eur(k.comTTC)}<div class="muted" style="font-size:.64rem">HT ${eur(k.comHT)}</div>`}</td>
        <td style="text-align:right;font-weight:800">${eur(primeOf(r)||0)}</td>
        <td>${apfBadge}</td>
      </tr>`;
    });
    h+=`</tbody></table></div>`;
    h+=`<div style="display:flex;align-items:center;justify-content:flex-end;margin-top:.7rem">
      <button class="btn btn-navy btn-sm" onclick="ouvrirCreerApfDelegSelection('${curDeleg}')">📄 Créer un APF avec la sélection</button>
    </div>`;
  }
  h+=`</div></div>`;
  // Liste des APFs délégataires existants
  if(myApfs.length){
    h+=`<div class="panel"><div class="panel-h"><h3>APF délégataires — ${esc(deleg.name)}</h3></div><div class="panel-b">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>N° APF délégataire</th><th>Date</th><th>Dossiers</th><th class="r">Prime client HT</th><th class="r">Commission installateur</th><th class="r">Total prime TTC</th><th>Statut</th><th style="width:125px">Reçu le</th><th>Pièce jointe</th><th class="r">Actions</th></tr></thead><tbody>`;
    myApfs.forEach(a=>{
      const tot=(a.recIds||[]).reduce((s,rid)=>{const r=recById(rid);return s+(r?primeOf(r)||0:0);},0);
      const det=(a.recIds||[]).map(rid=>recById(rid)).filter(Boolean).map(primeDetailOf);
      const totClient=det.reduce((s,k)=>s+(k.primeClient||0),0);
      const totComTTC=det.reduce((s,k)=>s+(k.comTTC||0),0);
      const totComHT=det.reduce((s,k)=>s+(k.comHT||0),0);
      const statSel=`<select onchange="saveApfDelegStatut('${a.id}',this.value)" style="font-family:'Saira',sans-serif;font-size:.75rem;font-weight:700;border:none;border-radius:7px;padding:3px 8px;cursor:pointer;${a.statut==='recu'?'background:#E6F7F0;color:#0F6E56':'background:#FFF4E5;color:#B96A0A'}">
        <option value="attente" ${a.statut!=='recu'?'selected':''}>⏳ En attente de virement</option>
        <option value="recu" ${a.statut==='recu'?'selected':''}>✅ Virement reçu</option>
      </select>`;
      const pjCell=a.fileUrl
        ?`<div style="display:flex;align-items:center;gap:.3rem">${attachLink(a.filePath,a.fileName||'Voir',a.fileUrl)}<button class="iconbtn del" style="font-size:.65rem;padding:1px 3px" onclick="deleteApfDelegFile('${a.id}')" title="Supprimer">✕</button></div>`
        :`<label style="cursor:pointer;display:inline-flex;align-items:center;gap:.2rem;font-size:.72rem;font-weight:600;color:var(--blue)"><input type="file" accept=".pdf,image/*" style="display:none" onchange="uploadApfDelegFile('${a.id}',this)">📎 Joindre</label>`;
      h+=`<tr>
        <td><span class="dossier-tag" style="cursor:pointer" onclick="voirApfDeleg('${a.id}')" title="Voir les dossiers de cet APF">${esc(a.numApf||'—')} 👁️</span></td>
        <td class="muted">${new Date(a.date).toLocaleDateString('fr-FR')}</td>
        <td><button class="btn btn-ghost btn-sm" style="font-size:.74rem" onclick="voirApfDeleg('${a.id}')">${(a.recIds||[]).length} dossier${(a.recIds||[]).length>1?'s':''} ›</button></td>
        <td style="text-align:right">${totClient?eur(totClient):'<span class="muted">—</span>'}</td>
        <td style="text-align:right">${totComTTC?`${eur(totComTTC)}<div class="muted" style="font-size:.64rem">HT ${eur(totComHT)}</div>`:'<span class="muted">—</span>'}</td>
        <td style="text-align:right;font-weight:800">${eur(tot)}</td>
        <td>${statSel}</td>
        <td><input type="date" value="${esc(a.dateVirement||'')}" title="Saisir la date marque le virement comme reçu" onchange="saveApfDelegDate('${a.id}',this.value)" style="font-family:'Saira',sans-serif;font-size:.76rem;border:1.5px solid ${a.statut==='recu'?'var(--green)':'var(--border-grey)'};border-radius:7px;padding:3px 5px;width:100%;outline:none;background:${a.statut==='recu'?'#F0FBF0':'#fff'}"></td>
        <td>${pjCell}</td>
        <td style="text-align:right"><button class="iconbtn del" onclick="supprimerApfDeleg('${a.id}')" title="Supprimer">🗑️</button></td>
      </tr>`;
    });
    h+=`</tbody></table></div></div></div>`;
  }
  document.getElementById('comptaBody').innerHTML=h;
}
async function uploadApfDelegFile(apfId,input){
  const file=input.files[0];if(!file)return;
  if(file.size>10*1024*1024){toast('Fichier trop lourd (max 10 Mo)','err');return;}
  toast('Envoi en cours…','ok');
  try{
    const fid=uid();const ext=file.name.split('.').pop();
    const path=`apf_deleg/${apfId}/${fid}.${ext}`;
    const{error}=await SUPA.storage.from('attachments').upload(path,file,{cacheControl:'3600',upsert:false});
    if(error)throw error;
    const pub={publicUrl:''}; // bucket prive : l'URL est signee a l'ouverture
    const apfs=load('egncrm_apf_deleg',[]);
    const a=apfs.find(x=>x.id===apfId);if(!a)return;
    a.fileUrl=pub.publicUrl;a.filePath=path;a.fileName=file.name;
    save('egncrm_apf_deleg',apfs);
    toast('Document joint ✓','ok');renderComptaDelegataires();
  }catch(e){toast('Échec : '+(e.message||e),'err');}
}
async function deleteApfDelegFile(apfId){
  const apfs=load('egncrm_apf_deleg',[]);
  const a=apfs.find(x=>x.id===apfId);if(!a)return;
  if(a.filePath){try{await SUPA.storage.from('attachments').remove([a.filePath]);}catch(e){}}
  delete a.fileUrl;delete a.filePath;delete a.fileName;
  save('egncrm_apf_deleg',apfs);
  toast('Document supprimé ✓','ok');renderComptaDelegataires();
}
let DELEG_Q_FOCUS=null;
function setDelegSearch(key,el){
  save(key==='q'?'egncrm_deleg_q':'egncrm_deleg_op',el.value);
  DELEG_Q_FOCUS=(key==='q')?(el.selectionStart||0):null;
  renderComptaDelegataires();
  if(DELEG_Q_FOCUS!==null){
    const i=document.getElementById('deleg_q');
    if(i){i.focus();try{i.setSelectionRange(DELEG_Q_FOCUS,DELEG_Q_FOCUS);}catch(e){}}
    DELEG_Q_FOCUS=null;
  }
}
function resetDelegSearch(){save('egncrm_deleg_q','');save('egncrm_deleg_op','');renderComptaDelegataires();}
function selectDelegTab(val){save('egncrm_deleg_tab_sel',val);renderComptaDelegataires();}
function toggleDelegFilter(val){save('egncrm_deleg_tab_filter',val?'1':'0');renderComptaDelegataires();}
function delegToggleAll(checked){document.querySelectorAll('.deleg_chk:not(:disabled)').forEach(c=>c.checked=checked);}
function ouvrirCreerApfDeleg(delegId){
  const body=`<div class="fld"><label>Numéro d'APF fourni par le délégataire</label><input id="apf_deleg_num" placeholder="Ex : APF-DEL-2026-041" autofocus></div>
    <p class="muted" style="margin-top:.6rem;font-size:.78rem">Cochez les dossiers dans le tableau, puis cliquez sur "📄 Créer un APF avec la sélection", ou créez un APF vide ici.</p>`;
  openModal('Créer un APF délégataire',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="creerApfDeleg('${delegId}',[])">📄 Créer APF vide</button>`);
}
function ouvrirCreerApfDelegSelection(delegId){
  const checks=[...document.querySelectorAll('.deleg_chk:checked')];
  if(!checks.length){toast('Cochez au moins un dossier','err');return;}
  const recIds=checks.map(c=>c.dataset.rid);
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  const tot=recIds.reduce((s,rid)=>{const r=recById(rid);return s+(r?primeOf(r)||0:0);},0);
  const body=`<div class="fld"><label>Numéro d'APF fourni par le délégataire</label><input id="apf_deleg_num" placeholder="Ex : APF-DEL-2026-041" autofocus></div>
    <div style="margin-top:.8rem;background:var(--bg-soft);border-radius:9px;padding:.7rem .9rem;font-size:.82rem">
      <b>${recIds.length} dossier${recIds.length>1?'s':''} sélectionné${recIds.length>1?'s':''}</b> — Total prime : <b>${eur(tot)}</b>
    </div>`;
  openModal('Créer un APF délégataire',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="creerApfDeleg('${delegId}',[${recIds.map(id=>`'${id}'`).join(',')}])">📄 Créer l'APF</button>`);
}
function creerApfDeleg(delegId,recIds){
  const num=(document.getElementById('apf_deleg_num')||{}).value||'';
  if(!num.trim()){toast('Saisissez le numéro d\'APF fourni par le délégataire','err');return;}
  const apfs=load('egncrm_apf_deleg',[]);
  const apf={id:uid(),delegId,numApf:num.trim(),recIds,date:Date.now(),statut:'attente',user:(ME.prenom+' '+ME.nom).trim()};
  apfs.push(apf);save('egncrm_apf_deleg',apfs);
  closeModal();toast(`APF ${num} créé ✓`,'ok');
  logActivity('action',`📄 APF délégataire créé : ${num} — ${recIds.length} dossier${recIds.length>1?'s':''}`);
  renderComptaDelegataires();
}
/* Date du virement recu, modifiable independamment du statut */
async function saveApfDelegDate(apfId,date){
  const apfs=load('egncrm_apf_deleg',[]);
  const apf=apfs.find(a=>a.id===apfId);if(!apf)return;
  // Saisir une date vaut reception du virement ; l'effacer remet l'APF en attente
  if(date&&apf.statut!=='recu'){
    apf.dateVirement=date;
    save('egncrm_apf_deleg',apfs);
    return saveApfDelegStatut(apfId,'recu');
  }
  if(!date&&apf.statut==='recu'){
    apf.dateVirement='';
    save('egncrm_apf_deleg',apfs);
    return saveApfDelegStatut(apfId,'attente');
  }
  apf.dateVirement=date||'';
  save('egncrm_apf_deleg',apfs);
  toast(date?'Date de virement enregistrée ✓':'Date retirée','ok');
  renderComptaDelegataires();
}
async function saveApfDelegStatut(apfId,statut){
  const apfs=load('egncrm_apf_deleg',[]);
  const apf=apfs.find(a=>a.id===apfId);if(!apf)return;
  apf.statut=statut;
  if(statut!=='recu')delete apf.dateVirement;
  if(statut==='recu'){
    if(!apf.dateVirement)apf.dateVirement=new Date().toISOString().slice(0,10);
    // Trouver le sous-statut administratif "Payé"
    const sousStatuts=load('egncrm_sousstatuts',[]);
    const payeSS=sousStatuts.find(s=>s.name&&s.name.toLowerCase().includes('pay'));
    if(payeSS){
      const recs=getRecs();let nb=0;
      (apf.recIds||[]).forEach(rid=>{
        const r=recs.find(x=>x.id===rid);if(!r)return;
        r.sousStatutId=payeSS.id;r.updated=Date.now();
        r.history=r.history||[];r.history.unshift({date:Date.now(),user:ME.prenom,text:`Virement délégataire reçu (APF ${apf.numApf}) → ${payeSS.name}`});
        nb++;
      });
      if(nb>0){save(K.recs,recs);toast(`✅ Virement reçu — ${nb} dossier${nb>1?'s':''} passé${nb>1?'s':''} en "${payeSS.name}"`, 'ok');}
      else toast('Statut mis à jour — aucun sous-statut "Payé" trouvé dans les paramètres','ok');
    } else {
      toast('Virement reçu enregistré — configurez un sous-statut "Payé" dans Paramètres ▸ Statuts pour la mise à jour automatique','ok');
    }
  } else {
    toast('Statut mis à jour ✓','ok');
  }
  save('egncrm_apf_deleg',apfs);renderComptaDelegataires();
}
/* Detail d'un APF delegataire : dossiers concernes et repartition de la prime */
function voirApfDeleg(apfId){
  const a=segApfDeleg().find(x=>x.id===apfId);
  if(!a){toast('APF introuvable','err');return;}
  const eur=n=>(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  const deleg=getDelegataires().find(d=>d.id===a.delegId);
  const lignes=(a.recIds||[]).map(id=>recById(id)).filter(Boolean);
  const tot=lignes.reduce((s,r)=>s+(primeOf(r)||0),0);
  const recu=a.statut==='recu';
  let b=`<div style="display:flex;gap:1rem;flex-wrap:wrap;background:${recu?'#EFF7E8':'#FFF4E5'};border-radius:10px;padding:.7rem 1rem;margin-bottom:.9rem;font-size:.84rem">
    <div><span class="muted" style="font-size:.7rem;display:block">Délégataire</span><b>${esc(deleg?deleg.name:'—')}</b></div>
    <div><span class="muted" style="font-size:.7rem;display:block">Date</span><b>${new Date(a.date).toLocaleDateString('fr-FR')}</b></div>
    <div><span class="muted" style="font-size:.7rem;display:block">Dossiers</span><b>${lignes.length}</b></div>
    <div><span class="muted" style="font-size:.7rem;display:block">Total prime TTC</span><b style="color:var(--green-deep)">${eur(tot)}</b></div>
    <div><span class="muted" style="font-size:.7rem;display:block">Statut</span><b style="color:${recu?'#0F6E56':'#B96A0A'}">${recu?'✅ Virement reçu':'⏳ En attente'}</b></div>
    ${recu&&a.dateVirement?`<div><span class="muted" style="font-size:.7rem;display:block">Reçu le</span><b>${new Date(a.dateVirement+'T12:00:00').toLocaleDateString('fr-FR')}</b></div>`:''}
  </div>`;
  if(!lignes.length)b+=`<div class="empty"><div class="big">📋</div>Aucun dossier rattaché — ils ont peut-être été supprimés.</div>`;
  else{
    b+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>N° Dossier</th><th>Client</th><th>Opération</th><th>Statut</th>
      <th class="r">Cumac</th><th class="r">Prime client HT</th><th class="r">Commission installateur</th><th class="r">Prime CEE TTC</th>
    </tr></thead><tbody>`;
    lignes.forEach(r=>{
      const op=getAllProducts().find(o=>o.id===r.productId);
      const st=statById(r.statusId);
      const d=dealOf(r);
      const k=primeDetailOf(r);
      b+=`<tr style="cursor:pointer" onclick="ouvrirLigne(event,'${r.id}',true)">
        <td><span class="dossier-tag">${esc(r.dossier||'—')}</span></td>
        <td style="font-weight:700">${esc(clientNameOf(r))}${r.ville?`<div class="muted" style="font-size:.68rem">${esc(r.ville)}</div>`:''}</td>
        <td class="muted">${op?esc(op.name):'—'}</td>
        <td>${st?`<span style="background:${st.color||'#ddd'}22;color:${st.color||'#666'};border-radius:5px;padding:1px 7px;font-size:.72rem;font-weight:700">${esc(st.name)}</span>`:'—'}</td>
        <td style="text-align:right" class="muted">${d.cumac?Number(d.cumac).toLocaleString('fr-FR'):'—'}</td>
        <td style="text-align:right">${k.estime?'<span class="muted">—</span>':eur(k.primeClient)}</td>
        <td style="text-align:right">${k.estime?'<span class="muted">—</span>':`${eur(k.comTTC)}<div class="muted" style="font-size:.64rem">HT ${eur(k.comHT)}</div>`}</td>
        <td style="text-align:right;font-weight:800">${eur(primeOf(r)||0)}</td>
      </tr>`;
    });
    const dt=lignes.map(primeDetailOf);
    b+=`<tr style="background:#f8faf5;font-weight:800"><td colspan="5">Total</td>
      <td style="text-align:right">${eur(dt.reduce((s,k)=>s+(k.primeClient||0),0))}</td>
      <td style="text-align:right">${eur(dt.reduce((s,k)=>s+(k.comTTC||0),0))}</td>
      <td style="text-align:right">${eur(tot)}</td></tr>`;
    b+=`</tbody></table></div><p class="muted" style="font-size:.75rem;margin-top:.6rem">Cliquez sur une ligne pour ouvrir le dossier.</p>`;
  }
  openModal('🏦 APF '+esc(a.numApf||''),b,`<button class="btn btn-ghost" onclick="closeModal()">Fermer</button>`,'wide');
}
function supprimerApfDeleg(apfId){
  modalConfirm('Supprimer cet APF délégataire ?','Les dossiers affiliés repasseront comme non affiliés.',async()=>{
    const apf=load('egncrm_apf_deleg',[]).find(a=>a.id===apfId);
    save('egncrm_apf_deleg',load('egncrm_apf_deleg',[]).filter(a=>a.id!==apfId));
    await deleteRemoteRow('egncrm_apf_deleg',apfId);
    if(apf&&apf.filePath){try{await SUPA.storage.from('attachments').remove([apf.filePath]);}catch(e){}}
    closeModal();renderComptaDelegataires();toast('APF supprimé ✓','ok');
  });
}

/* ============================================================
   TVA — collectee sur le chiffre d'affaires, deductible sur les
   charges, et solde a payer (ou credit si negatif).
   ============================================================ */
let TVA_ANNEE=new Date().getFullYear(), TVA_MOIS=''; // '' = annee entiere
function setTvaPeriode(annee,mois){TVA_ANNEE=annee;TVA_MOIS=mois;renderComptaTva();}
const MOIS_FR=['Janv','Févr','Mars','Avril','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
function periodeDe(ts){
  if(!ts)return null;
  const d=new Date(ts);
  if(isNaN(d.getTime()))return null;
  return{annee:d.getFullYear(),mois:d.getMonth()};
}
/* Ecritures de TVA — regime sur encaissements et decaissements.
   Une piece n'entre dans la TVA que lorsqu'elle est reellement reglee :
     - Entree  : APF delegataire en « virement recu »   -> date du virement
     - Sortie  : APF agent en « paye »                   -> date de paiement
     - Sortie  : facture fournisseur en « payee »        -> date de paiement
   Les pieces en attente sont comptees a part, sans etre rattachees a un mois. */
function collecterEcrituresTva(){
  const retenues=[],attente=[];
  const t=tvaRate()/100;
  const r2=v=>Math.round(v*100)/100;

  // --- Entrees : APF delegataires ---
  segApfDeleg().forEach(a=>{
    const recu=a.statut==='recu';
    const ts=recu?(a.dateVirement?new Date(a.dateVirement+'T12:00:00').getTime():a.date):null;
    (a.recIds||[]).forEach(id=>{
      const r=recById(id);if(!r)return;
      const k=primeDetailOf(r);
      const ttc=k.primeCEE||0;if(!ttc)return;
      const ht=k.estime?htOf(ttc):(k.primeHT||0);
      const e={sens:'ca',r,ttc,ht,tva:r2(ttc-ht),piece:a.numApf||'APF délégataire',p:periodeDe(ts)};
      (recu&&e.p?retenues:attente).push(e);
    });
  });

  // --- Sorties : APF agents (poseurs, call center, VT, auditeurs) ---
  segFactures().forEach(f=>{
    const pm=f.paiements||{};
    const paye=pm.statut_apf==='paye';
    const ts=paye?(pm.datePaiement?new Date(pm.datePaiement+'T12:00:00').getTime():f.date):null;
    (f.lignes||[]).forEach(l=>{
      const r=recById(l.recId);if(!r)return;
      const ttc=l.montant||0;if(!ttc)return;
      const ht=(l.ht!=null)?l.ht:(l.tvaMode==='sans_tva'?ttc:htOf(ttc));
      const e={sens:'charge',r,ttc,ht,tva:r2(ttc-ht),piece:f.apfNum||'APF',p:periodeDe(ts)};
      (paye&&e.p?retenues:attente).push(e);
    });
  });

  // --- Sorties : factures fournisseurs (achats de stock) ---
  getMvts().filter(v=>['entree','reception'].includes(v.sens)).forEach(v=>{
    const pm=v.paiement||{};
    const paye=pm.statut==='paye';
    const ht=v.totalHT||0;if(!ht)return;
    const tva=v.tvaRecup!=null?v.tvaRecup:r2(ht*t);
    const ts=paye?(pm.date?new Date(pm.date+'T12:00:00').getTime():v.date):null;
    const mat=getMats().find(m=>m.id===v.materielId);
    const e={sens:'charge',r:null,ttc:r2(ht+tva),ht,tva,
             piece:(v.fournisseurNom||'Fournisseur')+(mat?' — '+mat.nom:''),p:periodeDe(ts)};
    (paye&&e.p?retenues:attente).push(e);
  });

  return{retenues,attente};
}

/* Statut de reglement d'une facture fournisseur (mouvement de stock chiffre) */
async function saveFournPaiement(mvtId,key,val){
  const mvts=getMvts();const v=mvts.find(x=>x.id===mvtId);if(!v)return;
  v.paiement=v.paiement||{};
  v.paiement[key]=val;
  // Marquer payee renseigne la date du jour si elle est vide
  if(key==='statut'&&val==='paye'&&!v.paiement.date)v.paiement.date=new Date().toISOString().slice(0,10);
  save('egncrm_stock_mvt',mergeSeg(getAllMvts(),mvts));
  toast(key==='statut'?(val==='paye'?'Facture marquée payée ✅':'Remise à payer ⏳'):'Enregistré ✓','ok');
  if(COMPTA_TAB==='paiements')renderComptaPaiements();
}
/* Date saisie (AAAA-MM-JJ) ramenee a un horodatage */
function jourDe(d){
  if(!d)return null;
  const t=new Date(String(d).length<=10?d+'T12:00:00':d).getTime();
  return isNaN(t)?null:t;
}
/* TVA deductible sur les achats de materiel : factures fournisseurs reglees */
function ecrituresTvaStock(){
  const t=tvaRate()/100;
  const mats=getMats();
  return getMvts()
    .filter(v=>['entree','reception'].includes(v.sens)&&(v.totalHT||0)>0)
    .map(v=>{
      const p=v.paiement||{};
      const paye=p.statut==='paye';
      const mat=mats.find(m=>m.id===v.materielId);
      const ht=v.totalHT||0, tva=Math.round(ht*t*100)/100;
      return{sens:'charge',stock:true,ttc:Math.round((ht+tva)*100)/100,ht,tva,
             p:paye?periodeDe(jourDe(p.date)||v.date):null,
             piece:(v.fournisseurNom||'')+(mat?' — '+mat.nom:''),
             attente:paye?'':'facture fournisseur non payée'};
    });
}
function renderComptaTva(){
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  const T=comptaTotaux();
  // Pieces reglees uniquement, filtrees ensuite sur la periode choisie
  const{retenues:toutes,attente:nonDatees}=collecterEcrituresTva();
  const opOk=e=>!COMPTA_OP||(e.r&&e.r.productId===COMPTA_OP)||(!e.r&&!COMPTA_OP);
  const annees=[...new Set(toutes.filter(e=>e.p).map(e=>e.p.annee))].sort((a,b)=>b-a);
  if(annees.length&&!annees.includes(TVA_ANNEE))TVA_ANNEE=annees[0];
  const dansPeriode=e=>{
    if(!e.p)return false;
    if(e.p.annee!==TVA_ANNEE)return false;
    return TVA_MOIS===''||e.p.mois===TVA_MOIS;
  };
  const retenues=toutes.filter(e=>dansPeriode(e)&&opOk(e));
  const som=(arr,sens,champ)=>Math.round(arr.filter(e=>e.sens===sens).reduce((s,e)=>s+(e[champ]||0),0)*100)/100;
  const caTTC=som(retenues,'ca','ttc'), caHT=som(retenues,'ca','ht');
  const chTTC=som(retenues,'charge','ttc'), chHT=som(retenues,'charge','ht');
  const tvaCollectee=som(retenues,'ca','tva');
  const tvaDeductible=som(retenues,'charge','tva');
  const solde=Math.round((tvaCollectee-tvaDeductible)*100)/100;

  let h=opFilterBar('renderComptaTva');

  // Barre de periode
  const btn=(lib,actif,onclick,titre)=>`<button onclick="${onclick}" ${titre?`title="${titre}"`:''} style="font-family:'Saira',sans-serif;font-size:.76rem;font-weight:700;border:1.5px solid ${actif?'var(--green)':'var(--border-grey)'};background:${actif?'var(--green)':'#fff'};color:${actif?'#fff':'var(--text)'};border-radius:8px;padding:.3rem .62rem;cursor:pointer">${lib}</button>`;
  h+=`<div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin-bottom:.5rem">
    <span style="font-size:.7rem;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.5px">Année</span>
    ${(annees.length?annees:[TVA_ANNEE]).map(a=>btn(a,a===TVA_ANNEE,`setTvaPeriode(${a},'${TVA_MOIS}')`)).join('')}
  </div>`;
  h+=`<div style="display:flex;gap:.3rem;align-items:center;flex-wrap:wrap;margin-bottom:.9rem">
    ${btn('Année entière',TVA_MOIS==='',`setTvaPeriode(${TVA_ANNEE},'')`)}
    ${MOIS_FR.map((lib,i)=>{
      const n=toutes.filter(e=>e.p&&e.p.annee===TVA_ANNEE&&e.p.mois===i&&opOk(e)).length;
      return btn(lib,TVA_MOIS===i,`setTvaPeriode(${TVA_ANNEE},${i})`,n?`${n} écriture${n>1?'s':''}`:'aucune écriture');
    }).join('')}
  </div>`;

  const libPeriode=TVA_MOIS===''?`Année ${TVA_ANNEE}`:`${MOIS_FR[TVA_MOIS]} ${TVA_ANNEE}`;
  h+=`<div class="kpis">
    <div class="kpi"><div class="kico">💶</div><div class="klab">CA TTC</div><div class="kval">${eur(caTTC)}</div><div class="ksub">HT ${eur(caHT)}</div></div>
    <div class="kpi" style="border:1.5px solid rgba(230,57,70,.25)"><div class="kico">🏛️</div><div class="klab">TVA collectée</div><div class="kval" style="color:var(--coral)">${eur(tvaCollectee)}</div><div class="ksub">sur le chiffre d'affaires</div></div>
    <div class="kpi"><div class="kico">📤</div><div class="klab">Charges variables TTC</div><div class="kval">${eur(chTTC)}</div><div class="ksub">HT ${eur(chHT)}</div></div>
    <div class="kpi" style="border:1.5px solid rgba(45,125,210,.25)"><div class="kico">✅</div><div class="klab">TVA déductible</div><div class="kval" style="color:var(--blue)">${eur(tvaDeductible)}</div><div class="ksub">charges et marchandise</div></div>
  </div>`;

  const crediteur=solde<0;
  h+=`<div style="background:${crediteur?'rgba(45,125,210,.08)':'rgba(230,57,70,.07)'};border:1.5px solid ${crediteur?'rgba(45,125,210,.35)':'rgba(230,57,70,.3)'};border-radius:14px;padding:1.1rem 1.3rem;margin-bottom:1rem;display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap">
    <div style="font-size:2rem">${crediteur?'💙':'🏛️'}</div>
    <div style="flex:1;min-width:230px">
      <div style="font-size:.7rem;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.5px">${crediteur?'Crédit de TVA':'TVA à payer'} — ${esc(libPeriode)}</div>
      <div style="font-size:2rem;font-weight:800;color:${crediteur?'var(--blue)':'var(--coral)'};line-height:1.15">${eur(Math.abs(solde))}</div>
      <div class="muted" style="font-size:.76rem">${eur(tvaCollectee)} collectée − ${eur(tvaDeductible)} déductible</div>
    </div>
  </div>`;

  if(nonDatees.length){
    const tvaEnt=Math.round(nonDatees.filter(e=>e.sens==='ca').reduce((s,e)=>s+e.tva,0)*100)/100;
    const tvaSor=Math.round(nonDatees.filter(e=>e.sens==='charge').reduce((s,e)=>s+e.tva,0)*100)/100;
    h+=`<div style="background:#FFF7ED;border:1.5px solid #F0C486;border-radius:10px;padding:.6rem 1rem;margin-bottom:.9rem;font-size:.8rem">
      ⏳ <b>${nonDatees.length} pièce${nonDatees.length>1?'s':''} non réglée${nonDatees.length>1?'s':''}</b> — hors TVA tant que le règlement n'est pas enregistré :
      ${eur(tvaEnt)} collectée en attente d'encaissement, ${eur(tvaSor)} déductible en attente de paiement.
      <span class="muted" style="display:block;margin-top:.15rem">La TVA est calculée sur les encaissements et décaissements réels : APF délégataire reçu, APF agent payé, facture fournisseur payée.</span>
    </div>`;
  }

  // Ventilation par mois de l'annee
  h+=`<div class="panel"><div class="panel-h"><h3>Ventilation ${TVA_ANNEE}</h3></div><div class="panel-b"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Mois</th><th class="r">CA TTC</th><th class="r">TVA collectée</th><th class="r">Charges TTC</th><th class="r">TVA déductible</th><th class="r">Solde</th></tr></thead><tbody>`;
  let cumul=0;
  MOIS_FR.forEach((lib,i)=>{
    const e=toutes.filter(x=>x.p&&x.p.annee===TVA_ANNEE&&x.p.mois===i&&opOk(x));
    if(!e.length)return;
    const col=som(e,'ca','tva'), ded=som(e,'charge','tva'), sd=Math.round((col-ded)*100)/100;
    cumul+=sd;
    h+=`<tr style="cursor:pointer;${TVA_MOIS===i?'background:#EFF7E8':''}" onclick="setTvaPeriode(${TVA_ANNEE},${i})">
      <td style="font-weight:700">${lib} ${TVA_ANNEE}</td>
      <td style="text-align:right">${eur(som(e,'ca','ttc'))}</td>
      <td style="text-align:right;color:var(--coral);font-weight:700">${eur(col)}</td>
      <td style="text-align:right">${eur(som(e,'charge','ttc'))}</td>
      <td style="text-align:right;color:var(--blue);font-weight:700">${eur(ded)}</td>
      <td style="text-align:right;font-weight:800;color:${sd>=0?'var(--coral)':'var(--blue)'}">${eur(sd)}</td>
    </tr>`;
  });
  h+=`<tr style="background:#f8faf5;font-weight:800"><td>Total ${TVA_ANNEE}</td>
    <td style="text-align:right">${eur(som(toutes.filter(e=>e.p&&e.p.annee===TVA_ANNEE&&opOk(e)),'ca','ttc'))}</td>
    <td style="text-align:right;color:var(--coral)">${eur(som(toutes.filter(e=>e.p&&e.p.annee===TVA_ANNEE&&opOk(e)),'ca','tva'))}</td>
    <td style="text-align:right">${eur(som(toutes.filter(e=>e.p&&e.p.annee===TVA_ANNEE&&opOk(e)),'charge','ttc'))}</td>
    <td style="text-align:right;color:var(--blue)">${eur(som(toutes.filter(e=>e.p&&e.p.annee===TVA_ANNEE&&opOk(e)),'charge','tva'))}</td>
    <td style="text-align:right;color:${cumul>=0?'var(--coral)':'var(--blue)'}">${eur(cumul)}</td>
  </tr></tbody></table></div></div></div>`;

  // Detail des ecritures de la periode
  if(retenues.length){
    h+=`<div class="panel"><div class="panel-h"><h3>Écritures — ${esc(libPeriode)}</h3><div class="sp"><span class="muted">${retenues.length} ligne${retenues.length>1?'s':''}</span><button class="btn btn-navy btn-sm" onclick="exportTvaCSV()">📤 Exporter</button></div></div><div class="panel-b"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Sens</th><th>N° Dossier</th><th>Client</th><th>Pièce</th><th class="r">TTC</th><th class="r">HT</th><th class="r">TVA</th></tr></thead><tbody>`;
    retenues.sort((a,b)=>b.tva-a.tva).forEach(e=>{
      const ca=e.sens==='ca';
      h+=`<tr ${e.r?`style="cursor:pointer" onclick="ouvrirLigne(event,'${e.r.id}')"`:''}>
        <td><span style="font-size:.7rem;font-weight:700;border-radius:5px;padding:1px 7px;background:${ca?'#FEE8E8':'#E8F0FE'};color:${ca?'#A32D2D':'#1A5FD4'}">${ca?'Entrée':'Sortie'}</span></td>
        <td>${e.r?`<span class="dossier-tag">${esc(e.r.dossier||'—')}</span>`:'<span class="muted" style="font-size:.72rem">achat stock</span>'}</td>
        <td style="font-weight:700">${e.r?esc(clientNameOf(e.r)):'<span class="muted" style="font-weight:400">—</span>'}</td>
        <td class="muted" style="font-size:.75rem">${esc(e.piece||'—')}</td>
        <td style="text-align:right">${eur(e.ttc)}</td>
        <td style="text-align:right" class="muted">${eur(e.ht)}</td>
        <td style="text-align:right;font-weight:800;color:${ca?'var(--coral)':'var(--blue)'}">${eur(e.tva)}</td>
      </tr>`;
    });
    h+=`</tbody></table></div></div></div>`;
  } else {
    h+=`<div class="empty"><div class="big">🏛️</div>Aucune écriture sur ${esc(libPeriode)}.</div>`;
  }
  document.getElementById('comptaBody').innerHTML=h;
}

function exportTvaCSV(){
  const nb=n=>(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const lib=TVA_MOIS===''?String(TVA_ANNEE):`${MOIS_FR[TVA_MOIS]}_${TVA_ANNEE}`;
  const{retenues}=collecterEcrituresTva();
  let csv='Sens;N Dossier;Client;Operation;Piece;Mois;TTC;HT;TVA\n';
  retenues.forEach(e=>{
    if(!e.p||e.p.annee!==TVA_ANNEE)return;
    if(TVA_MOIS!==''&&e.p.mois!==TVA_MOIS)return;
    if(COMPTA_OP&&(!e.r||e.r.productId!==COMPTA_OP))return;
    const op=e.r?getAllProducts().find(o=>o.id===e.r.productId):null;
    csv+=`${e.sens==='ca'?'Entree':'Sortie'};${e.r?e.r.dossier||'':''};${e.r?clientNameOf(e.r):''};${op?op.name:''};${e.piece||''};${MOIS_FR[e.p.mois]} ${e.p.annee};${nb(e.ttc)};${nb(e.ht)};${nb(e.tva)}\n`;
  });
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download='tva_'+lib+'.csv';a.click();URL.revokeObjectURL(url);
}



function toggleWaEnabled(v){
  const s=getSettings();s.waEnabled=!!v;save(K.set,s);
  toast(v?'Notifications WhatsApp activées ✓':'Notifications WhatsApp désactivées','ok');
}
async function testWhatsApp(){
  const num=(document.getElementById('wa_test_num')||{}).value||'';
  const box=document.getElementById('wa_test_res');
  if(!normWaNumber(num)){if(box)box.innerHTML='<span style="color:var(--coral);font-size:.8rem">Saisissez un numéro au format international.</span>';return;}
  if(box)box.innerHTML='<span class="muted" style="font-size:.8rem">⏳ Envoi en cours…</span>';
  const s=getSettings();const avant=s.waEnabled;
  s.waEnabled=true;save(K.set,s); // le test ignore l'interrupteur
  const res=await sendWhatsApp(num,`✅ Test depuis le CRM ${getSettings().company||'EGN'}\n\nSi vous lisez ce message, les notifications WhatsApp fonctionnent.`,'test');
  s.waEnabled=avant;save(K.set,s);
  if(!box)return;
  box.innerHTML=res.ok
    ?`<div style="background:#EFF7E8;border:1.5px solid var(--green);border-radius:9px;padding:.6rem .9rem;font-size:.82rem"><b>✅ Message envoyé</b> — vérifiez le téléphone ${esc(normWaNumber(num))}.</div>`
    :`<div style="background:#FEE8E8;border:1.5px solid var(--coral);border-radius:9px;padding:.6rem .9rem;font-size:.82rem"><b>⛔ Échec</b><div class="muted" style="font-size:.76rem;margin-top:.2rem">${esc(res.error||'La fonction send-whatsapp est-elle déployée sur Supabase ?')}</div></div>`;
}
