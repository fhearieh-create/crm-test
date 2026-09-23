/* ============================================================
   EGN CRM — modules/13-paiements.js
   Suivi des paiements et des encaissements delegataires
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

