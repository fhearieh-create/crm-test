/* ============================================================
   EGN CRM — modules/13-paiements.js
   Suivi des paiements et suivi des encaissements délégataires
   ============================================================ */
/* ============================================================
   SUIVI DES PAIEMENTS
   Liste toutes les lignes de charge (poseur, call center, VT, audit)
   par APF. Statut À payer / Payé / Annulé + N° facture reçue.
   ============================================================ */
let PAIEMENTS_LOCKED=false;
let PAY_TYPE='',PAY_STAT='',PAY_Q='';
let PAY_FOCUS=null;
function setPayQ(el){
  PAY_Q=el.value;PAY_FOCUS=el.selectionStart||0;
  renderComptaPaiements();
  const i=document.getElementById('pay_fil_search');
  if(i&&PAY_FOCUS!==null){i.focus();try{i.setSelectionRange(PAY_FOCUS,PAY_FOCUS);}catch(e){}}
  PAY_FOCUS=null;
}
function filtrerPaiements(statut){PAY_STAT=statut;renderComptaPaiements();}
function renderComptaPaiements(){
  const factures=segFactures();
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  // Factures fournisseurs : tout mouvement de stock chiffre (entree, reception, sortie)
  const tvaT=tvaRate()/100;
  const fournFactures=can('stock_view')
    ? getMvts().filter(v=>['entree','reception','sortie'].includes(v.sens)&&(v.totalHT||0)>0)
        .map(v=>({...v,ttc:Math.round((v.totalHT||0)*(1+tvaT)*100)/100,paye:(v.paiement||{}).statut==='paye'}))
        .sort((a,b)=>b.date-a.date)
    : [];
  const fTot=fournFactures.reduce((s,v)=>s+v.ttc,0);
  const fPaye=fournFactures.filter(v=>v.paye).reduce((s,v)=>s+v.ttc,0);
  const fAttente=fTot-fPaye;
  const fNbPaye=fournFactures.filter(v=>v.paye).length;
  const fNbAttente=fournFactures.length-fNbPaye;
  // KPIs — APF agents et factures fournisseurs cumules
  const totApf=factures.reduce((s,f)=>s+f.total,0);
  const payeApf=factures.filter(f=>(f.paiements||{}).statut_apf==='paye').reduce((s,f)=>s+f.total,0);
  const nbPayeApf=factures.filter(f=>(f.paiements||{}).statut_apf==='paye').length;
  const nbAttenteApf=factures.length-nbPayeApf;
  const totPaye=payeApf+fPaye;
  const totAttente=(totApf-payeApf)+fAttente;
  const nbPaye=nbPayeApf+fNbPaye;
  const nbAttente=nbAttenteApf+fNbAttente;
  let h=`<div class="kpis">
    <div class="kpi" onclick="filtrerPaiements('attente')" style="cursor:pointer;border:1.5px solid rgba(230,148,57,.3)"><div class="kico">⏳</div><div class="klab">En attente de paiement</div><div class="kval" style="color:#B96A0A">${eur(totAttente)}</div><div class="ksub">${nbAttenteApf} APF${fNbAttente?` · ${fNbAttente} facture${fNbAttente>1?'s':''} fournisseur`:''}</div></div>
    <div class="kpi accent" onclick="filtrerPaiements('paye')" style="cursor:pointer"><div class="kico">✅</div><div class="klab">Payé</div><div class="kval">${eur(totPaye)}</div><div class="ksub">${nbPayeApf} APF${fNbPaye?` · ${fNbPaye} facture${fNbPaye>1?'s':''} fournisseur`:''}</div></div>
  </div>`;
  // Filtres
  const fsty="font-family:'Saira',sans-serif;font-size:.8rem;border:1.5px solid var(--border-grey);border-radius:8px;padding:.35rem .65rem;background:#fff;outline:none";
  h+=`<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:.9rem">
    <select onchange="PAY_TYPE=this.value;renderComptaPaiements()" style="${fsty}">
      <option value="">Tous les types</option>
      <option value="poseur" ${PAY_TYPE==='poseur'?'selected':''}>🔧 Poseur</option>
      <option value="callcenter" ${PAY_TYPE==='callcenter'?'selected':''}>📞 Call Center</option>
      <option value="vt" ${PAY_TYPE==='vt'?'selected':''}>🧰 VT</option>
      <option value="auditeur" ${PAY_TYPE==='auditeur'?'selected':''}>📝 Audit</option>
    </select>
    <select onchange="PAY_STAT=this.value;renderComptaPaiements()" style="${fsty}">
      <option value="">Tous les statuts</option>
      <option value="attente" ${PAY_STAT==='attente'?'selected':''}>⏳ En attente</option>
      <option value="paye" ${PAY_STAT==='paye'?'selected':''}>✅ Payé</option>
    </select>
    <input id="pay_fil_search" value="${esc(PAY_Q)}" placeholder="Rechercher N° APF, bénéficiaire…" oninput="setPayQ(this)" style="${fsty};flex:1;min-width:160px">
    ${(PAY_TYPE||PAY_STAT||PAY_Q)?`<button class="btn btn-ghost btn-sm" style="font-size:.72rem" onclick="PAY_TYPE='';PAY_STAT='';PAY_Q='';renderComptaPaiements()">✕ Réinitialiser</button>`:''}
  </div>`;
  const filType=PAY_TYPE,filStat=PAY_STAT,filSearch=PAY_Q.toLowerCase();
  const filtered=factures.filter(f=>{
    if(filType&&f.type!==filType)return false;
    if(filSearch&&![f.apfNum,f.poseurName].join(' ').toLowerCase().includes(filSearch))return false;
    if(filStat){const s=(f.paiements||{}).statut_apf==='paye';if(filStat==='paye'&&!s)return false;if(filStat==='attente'&&s)return false;}
    return true;
  });
  if(!filtered.length){h+=`<div class="empty"><div class="big">💳</div>Aucun APF à afficher.</div>`;document.getElementById('comptaBody').innerHTML=h;return;}
  // Tableau — une ligne par APF
  h+=`<div class="tbl-wrap"><table class="tbl">
    <thead><tr>
      <th>N° APF</th>
      <th>Bénéficiaire / Type</th>
      <th>Opération(s)</th>
      <th>Dossiers</th>
      <th class="r">Montant TTC</th>
      <th style="width:120px">Statut paiement</th>
      <th style="width:150px">N° facture reçue</th>
      <th style="width:125px">Date de paiement</th>
      <th style="width:110px">Pièce jointe</th>
      <th style="width:110px">Actions</th>
    </tr></thead><tbody>`;
  filtered.forEach(f=>{
    const at=AGENT_TYPES[f.type||'poseur'];
    const p=f.paiements||{};
    const locked=p.statut_apf==='paye';
    const recs=getRecs();
    const ops=[...new Set((f.lignes||[]).map(l=>{const r=recs.find(x=>x.id===l.recId);const op=r?getAllProducts().find(o=>o.id===r.productId):null;return op?op.name:'—';}))].join(', ');
    // Mode TVA de l'APF
    const tvaKey=f.type==='callcenter'?'callcenter':f.type==='vt'?'vt':f.type==='auditeur'?'audit':'poseur';
    const tvaModes=(f.lignes||[]).map(l=>{const r=recs.find(x=>x.id===l.recId);return r?effectiveTvaMode(r,tvaKey):'ttc';});
    const allSansTva=tvaModes.length&&tvaModes.every(m=>m==='sans_tva');
    const allHT=tvaModes.length&&tvaModes.every(m=>m==='ht');
    const montantDisplay=allSansTva
      ?`${eur(f.total)}<div class="muted" style="font-size:.62rem;color:#5B3AAA">Sans TVA</div>`
      :allHT
      ?`${eur(f.total)}<div class="muted" style="font-size:.62rem">Payé HT</div>`
      :`${eur(f.total)}<div class="muted" style="font-size:.62rem">HT ${eur(htOf(f.total))}</div>`;
    // Statut = select modifiable (pas bloqué par validate)
    const statSel=`<select onchange="savePaiementApf('${f.id}','statut_apf',this.value)" style="font-family:'Saira',sans-serif;font-size:.75rem;font-weight:700;border:none;border-radius:7px;padding:3px 8px;cursor:pointer;${p.statut_apf==='paye'?'background:#E6F7F0;color:#0F6E56':'background:#FFF4E5;color:#B96A0A'};width:100%">
      <option value="attente" ${p.statut_apf!=='paye'?'selected':''}>⏳ En attente</option>
      <option value="paye" ${p.statut_apf==='paye'?'selected':''}>✅ Payé</option>
    </select>`;
    // N° facture — verrouillé après validate
    const facRefCell=locked
      ?`<span style="font-size:.78rem;font-weight:600">${p.facRef||'—'}</span>`
      :`<input type="text" value="${esc(p.facRef||'')}" placeholder="FAC-2026-…" onchange="savePaiementApf('${f.id}','facRef',this.value)" style="font-family:'Saira',sans-serif;font-size:.78rem;border:1.5px solid var(--border-grey);border-radius:7px;padding:3px 7px;width:100%;outline:none">`;
    // PJ — verrouillée après validate
    const pjCell=p.fileUrl
      ?`<div style="display:flex;align-items:center;gap:.3rem">${attachLink(p.filePath,p.fileName||'Voir',p.fileUrl)}${!locked?`<button class="iconbtn del" style="font-size:.65rem;padding:1px 3px" onclick="deletePaiementApfFile('${f.id}')">✕</button>`:''}</div>`
      :locked?`<span class="muted" style="font-size:.72rem">—</span>`
      :`<label style="cursor:pointer;display:inline-flex;align-items:center;gap:.2rem;font-size:.72rem;font-weight:600;color:var(--blue)"><input type="file" accept=".pdf,image/*" style="display:none" onchange="uploadPaiementApfFile('${f.id}',this)">📎 Joindre</label>`;
    // Bouton valider/rouvrir + supprimer
    const actions=locked
      ?`<div style="display:flex;flex-direction:column;gap:3px"><button class="btn btn-ghost btn-sm" style="font-size:.7rem" onclick="savePaiementApf('${f.id}','statut_apf_lock',false)">🔓 Déverrouiller</button><button class="iconbtn del" onclick="supprimerApfPaiement('${f.id}')" title="Supprimer l'APF">🗑️</button></div>`
      :`<div style="display:flex;flex-direction:column;gap:3px"><button class="btn btn-pri btn-sm" style="font-size:.7rem" onclick="savePaiementApf('${f.id}','statut_apf_lock',true)">🔒 Verrouiller</button><button class="iconbtn del" onclick="supprimerApfPaiement('${f.id}')" title="Supprimer l'APF">🗑️</button></div>`;
    h+=`<tr style="${locked?'background:#F0FBF0':''}">
      <td><span class="dossier-tag" style="cursor:pointer" onclick="voirApfDossiers('${f.id}')" title="Voir les dossiers concernés">${esc(f.apfNum||'—')} 👁️</span></td>
      <td><div style="font-weight:700;font-size:.83rem">${at.icon} ${esc(f.poseurName)}</div><div class="muted" style="font-size:.68rem">${at.label}</div></td>
      <td class="muted" style="font-size:.75rem">${esc(ops)}</td>
      <td style="text-align:center"><button class="btn btn-ghost btn-sm" style="font-size:.74rem" onclick="voirApfDossiers('${f.id}')">${(f.lignes||[]).length} ›</button></td>
      <td style="text-align:right;font-weight:700">${montantDisplay}</td>
      <td>${statSel}</td>
      <td>${facRefCell}</td>
      <td>${locked
        ?`<span style="font-size:.78rem;font-weight:600">${p.datePaiement?new Date(p.datePaiement+'T12:00:00').toLocaleDateString('fr-FR'):'—'}</span>`
        :`<input type="date" value="${esc(p.datePaiement||'')}" onchange="savePaiementApf('${f.id}','datePaiement',this.value)" style="font-family:'Saira',sans-serif;font-size:.76rem;border:1.5px solid var(--border-grey);border-radius:7px;padding:3px 5px;width:100%;outline:none">`}</td>
      <td>${pjCell}</td>
      <td>${actions}</td>
    </tr>`;
  });
  h+=`</tbody></table></div>`;
  // ---- Factures fournisseurs issues des mouvements de stock ----
  const fourVisibles=fournFactures.filter(v=>{
    if(filStat==='paye'&&!v.paye)return false;
    if(filStat==='attente'&&v.paye)return false;
    if(filSearch){
      const mat=getMats().find(m=>m.id===v.materielId);
      if(![v.fournisseurNom,mat?mat.nom:'',v.factureNom,(v.paiement||{}).ref].join(' ').toLowerCase().includes(filSearch))return false;
    }
    return true;
  });
  if(fournFactures.length){
    h+=`<div class="panel" style="margin-top:1rem"><div class="panel-h"><h3>🧾 Factures fournisseurs</h3><div class="sp">
      <span class="muted">${fourVisibles.length} sur ${fournFactures.length}</span>
    </div></div><div class="panel-b">`;
    if(!fourVisibles.length)h+=`<div class="empty" style="padding:1rem"><div class="big" style="font-size:1.5rem">🔍</div>Aucune facture fournisseur pour ces filtres.</div>`;
    else{
      h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
        <th>Date</th><th>Fournisseur</th><th>Matériel</th><th class="r">Qté</th>
        <th class="r">Montant TTC</th><th style="width:130px">Statut</th>
        <th style="width:150px">Réf. paiement</th><th style="width:125px">Payée le</th><th>Facture</th>
      </tr></thead><tbody>`;
      fourVisibles.forEach(v=>{
        const mat=getMats().find(m=>m.id===v.materielId);
        const p=v.paiement||{};
        h+=`<tr style="${v.paye?'background:#F6FBF4':''}">
          <td class="muted">${new Date(v.date).toLocaleDateString('fr-FR')}</td>
          <td style="font-weight:700;color:var(--purple)">${esc(v.fournisseurNom||'—')}</td>
          <td>${mat?esc(mat.nom):'—'}</td>
          <td style="text-align:right">${v.qte||'—'}</td>
          <td style="text-align:right;font-weight:800">${eur(v.ttc)}<div class="muted" style="font-size:.64rem">HT ${eur(v.totalHT)}</div></td>
          <td><select onchange="saveFournPaiement('${v.id}','statut',this.value)" style="font-family:'Saira',sans-serif;font-size:.74rem;font-weight:700;border:none;border-radius:7px;padding:3px 7px;cursor:pointer;width:100%;${v.paye?'background:#E6F7F0;color:#0F6E56':'background:#FFF4E5;color:#B96A0A'}">
            <option value="attente" ${!v.paye?'selected':''}>⏳ À payer</option>
            <option value="paye" ${v.paye?'selected':''}>✅ Payée</option>
          </select></td>
          <td><input type="text" value="${esc(p.ref||'')}" placeholder="Virement, chèque…" onchange="saveFournPaiement('${v.id}','ref',this.value)" style="font-family:'Saira',sans-serif;font-size:.76rem;border:1.5px solid var(--border-grey);border-radius:7px;padding:3px 7px;width:100%;outline:none"></td>
          <td><input type="date" value="${esc(p.date||'')}" onchange="saveFournPaiement('${v.id}','date',this.value)" style="font-family:'Saira',sans-serif;font-size:.76rem;border:1.5px solid var(--border-grey);border-radius:7px;padding:3px 5px;width:100%;outline:none"></td>
          <td>${v.factureUrl||v.facturePath?attachLink(v.facturePath,v.factureNom||'Voir',v.factureUrl):'<span style="font-size:.68rem;color:var(--coral);font-weight:700">⚠️ Manquante</span>'}</td>
        </tr>`;
      });
      const stt=fourVisibles.reduce((s,v)=>s+v.ttc,0);
      h+=`<tr style="background:#f8faf5;font-weight:800"><td colspan="4">Total</td><td style="text-align:right">${eur(stt)}</td><td colspan="4"></td></tr>`;
      h+=`</tbody></table></div>`;
    }
    h+=`</div></div>`;
  }
  h+=`<div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:.5rem"><button class="btn btn-ghost btn-sm" onclick="testStorage()">🔧 Test storage</button><button class="btn btn-navy btn-sm" onclick="exportPaiementsCSV()">📤 Exporter CSV</button></div>`;
  document.getElementById('comptaBody').innerHTML=h;
}
async function testStorage(){
  const r=await SUPA.storage.listBuckets();
  alert('Buckets: '+JSON.stringify(r.data?.map(b=>b.id))+'\nError: '+JSON.stringify(r.error));
}
/* Detail d'un APF agent : dossiers factures et montants */
function voirApfDossiers(factureId){
  const f=(FACTURES_CACHE||[]).find(x=>x.id===factureId);
  if(!f){toast('APF introuvable','err');return;}
  const eur=n=>(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  const at=AGENT_TYPES[f.type||'poseur'];
  const p=f.paiements||{};
  const paye=p.statut_apf==='paye';
  let b=`<div style="display:flex;gap:1rem;flex-wrap:wrap;background:${paye?'#EFF7E8':'#FFF4E5'};border-radius:10px;padding:.7rem 1rem;margin-bottom:.9rem;font-size:.84rem">
    <div><span class="muted" style="font-size:.7rem;display:block">Bénéficiaire</span><b>${at.icon} ${esc(f.poseurName||'—')}</b></div>
    <div><span class="muted" style="font-size:.7rem;display:block">Type</span><b>${esc(at.label)}</b></div>
    <div><span class="muted" style="font-size:.7rem;display:block">Date de l'APF</span><b>${new Date(f.date).toLocaleDateString('fr-FR')}</b></div>
    <div><span class="muted" style="font-size:.7rem;display:block">Total</span><b style="color:var(--green-deep)">${eur(f.total)}</b></div>
    <div><span class="muted" style="font-size:.7rem;display:block">Statut</span><b style="color:${paye?'#0F6E56':'#B96A0A'}">${paye?'✅ Payé':'⏳ En attente'}</b></div>
    ${p.datePaiement?`<div><span class="muted" style="font-size:.7rem;display:block">Payé le</span><b>${new Date(p.datePaiement+'T12:00:00').toLocaleDateString('fr-FR')}</b></div>`:''}
    ${p.facRef?`<div><span class="muted" style="font-size:.7rem;display:block">N° facture</span><b>${esc(p.facRef)}</b></div>`:''}
  </div>`;
  const lignes=(f.lignes||[]);
  if(!lignes.length)b+=`<div class="empty"><div class="big">📋</div>Aucun dossier rattaché à cet APF.</div>`;
  else{
    b+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>N° Dossier</th><th>Client</th><th>Opération</th><th>Date d'installation</th><th class="r">Montant</th>
    </tr></thead><tbody>`;
    let tot=0;
    lignes.forEach(l=>{
      const r=recById(l.recId);
      const op=r?getAllProducts().find(o=>o.id===r.productId):null;
      const di=r?dateInstallationFr(r):'';
      tot+=l.montant||0;
      b+=`<tr ${r?`style="cursor:pointer" onclick="ouvrirLigne(event,'${r.id}',true)"`:''}>
        <td><span class="dossier-tag">${esc(r?r.dossier||'—':'—')}</span></td>
        <td style="font-weight:700">${esc(l.client||(r?clientNameOf(r):'Dossier supprimé'))}${r&&r.ville?`<div class="muted" style="font-size:.68rem">${esc(r.ville)}</div>`:''}</td>
        <td class="muted">${op?esc(op.name):'—'}</td>
        <td class="muted">${di?esc(di):'—'}</td>
        <td style="text-align:right;font-weight:800">${eur(l.montant||0)}</td>
      </tr>`;
    });
    b+=`<tr style="background:#f8faf5;font-weight:800"><td colspan="4">Total</td><td style="text-align:right">${eur(tot)}</td></tr>`;
    b+=`</tbody></table></div><p class="muted" style="font-size:.75rem;margin-top:.6rem">Cliquez sur une ligne pour ouvrir le dossier.</p>`;
  }
  openModal('💳 APF '+esc(f.apfNum||''),b,
    `<button class="btn btn-ghost" onclick="closeModal()">Fermer</button><button class="btn btn-navy" onclick="voirApfPdf('${f.id}')">📄 Voir le document</button>`,'wide');
}
function voirApfPdf(factureId){
  const f=FACTURES_CACHE&&FACTURES_CACHE.find(x=>x.id===factureId);
  if(!f||!f.html){toast('PDF non disponible pour cet APF','err');return;}
  const w=window.open('','_blank');
  if(!w){toast('Autorisez les pop-ups pour voir le PDF','err');return;}
  w.document.write(f.html);w.document.close();
}
async function savePaiementApf(factureId,key,val){
  const f=FACTURES_CACHE&&FACTURES_CACHE.find(x=>x.id===factureId);if(!f)return;
  f.paiements=f.paiements||{};
  if(key==='statut_apf_lock'){
    // Verrouillage/déverrouillage du N° facture et PJ uniquement
    f.paiements.statut_apf=val?'paye':'attente';
    if(val&&!f.paiements.datePaiement)f.paiements.datePaiement=new Date().toISOString().slice(0,10);
    toast(val?'N° facture verrouillé 🔒':'Déverrouillé 🔓','ok');
  } else {
    f.paiements[key]=val;
    if(key==='statut_apf'){
      if(val==='paye'&&!f.paiements.datePaiement)f.paiements.datePaiement=new Date().toISOString().slice(0,10);
      toast(val==='paye'?'Marqué comme payé ✅':'Marqué en attente ⏳','ok');
    }
    else toast('Enregistré ✓','ok');
  }
  await persistFacture(f);
  renderComptaPaiements();
}
async function supprimerApfPaiement(factureId){
  modalConfirm('Supprimer cet APF ?','Les dossiers concernés repasseront en "non facturés" et pourront être refacturés.',async()=>{
    // Remettre les dossiers en non facturés
    const f=FACTURES_CACHE&&FACTURES_CACHE.find(x=>x.id===factureId);
    if(f){
      const at=AGENT_TYPES[f.type||'poseur'];
      const recs=getRecs();let changed=false;
      (f.lignes||[]).forEach(l=>{
        const r=recs.find(x=>x.id===l.recId);if(!r)return;
        const c=comptaOf(r);
        if(c[at.factureField]&&c[at.factureField].factureId===factureId){
          c[at.factureField]=null;changed=true;
        }
      });
      if(changed){
        save(K.recs,recs);
        // Persister dans Supabase pour chaque dossier modifié
        for(const l of f.lignes||[]){await persistCompta(l.recId).catch(()=>{});}
      }
      await deleteFactureRemote(factureId);
      FACTURES_CACHE=FACTURES_CACHE.filter(x=>x.id!==factureId);
    }
    closeModal();renderComptaPaiements();
    toast('APF supprimé — dossiers repassés en non facturés ✓','ok');
    logActivity('action',`🗑️ APF supprimé : ${f?f.apfNum:'?'}`);
  });
}
async function uploadPaiementApfFile(factureId,input){
  const file=input.files[0];if(!file)return;
  if(file.size>10*1024*1024){toast('Fichier trop lourd (max 10 Mo)','err');return;}
  toast('Envoi en cours…','ok');
  try{
    const fid=uid();const ext=file.name.split('.').pop();
    const path=`paiements/${factureId}/${fid}.${ext}`;
    const{error:upErr}=await SUPA.storage.from('attachments').upload(path,file,{cacheControl:'3600',upsert:false});
    if(upErr)throw upErr;
    const pub={publicUrl:''}; // bucket prive : l'URL est signee a l'ouverture
    const f=FACTURES_CACHE&&FACTURES_CACHE.find(x=>x.id===factureId);if(!f)return;
    f.paiements=f.paiements||{};
    f.paiements.fileUrl=pub.publicUrl;f.paiements.filePath=path;f.paiements.fileName=file.name;
    await persistFacture(f);
    toast('Facture jointe ✓','ok');renderComptaPaiements();
  }catch(e){console.error('[upload]',e);toast('Échec : '+(e.message||JSON.stringify(e)),'err');}
}
async function deletePaiementApfFile(factureId){
  const f=FACTURES_CACHE&&FACTURES_CACHE.find(x=>x.id===factureId);if(!f)return;
  if(f.paiements&&f.paiements.filePath){try{await SUPA.storage.from(ATTACH_BUCKET).remove([f.paiements.filePath]);}catch(e){}}
  if(f.paiements){delete f.paiements.fileUrl;delete f.paiements.filePath;delete f.paiements.fileName;}
  await persistFacture(f);toast('Pièce jointe supprimée ✓','ok');renderComptaPaiements();
}

function exportPaiementsCSV(){
  const factures=segFactures();
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2});
  const recs=getRecs();
  let csv='N° APF;Date APF;Type;Bénéficiaire;Dossiers;Total TTC;HT;Statut;N° Facture reçue;Date de paiement\n';
  factures.forEach(f=>{
    const at=AGENT_TYPES[f.type||'poseur'];
    const p=f.paiements||{};
    const stat=p.statut_apf==='paye'?'Payé':'En attente';
    const dApf=f.date?new Date(f.date).toLocaleDateString('fr-FR'):'';
    const dPay=p.datePaiement?new Date(p.datePaiement+'T12:00:00').toLocaleDateString('fr-FR'):'';
    csv+=`${f.apfNum||''};${dApf};${at.label};${f.poseurName||''};${(f.lignes||[]).length};${eur(f.total)};${eur(htOf(f.total))};${stat};${p.facRef||''};${dPay}\n`;
  });
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download='suivi_paiements_egn.csv';a.click();URL.revokeObjectURL(url);
}
