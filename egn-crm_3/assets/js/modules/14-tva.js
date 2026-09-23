/* ============================================================
   EGN CRM — modules/14-tva.js
   TVA mensualisee sur encaissements et decaissements
   ============================================================ */
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
