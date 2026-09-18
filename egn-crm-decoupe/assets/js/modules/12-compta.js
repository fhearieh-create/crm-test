/* ============================================================
   EGN CRM — modules/12-compta.js
   Comptabilité globale : résumé, détails CA / charges / marge, appels à facturation
   ============================================================ */
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
  const tabs=[['resume','Résumé global','compta_resume'],['facturation','Appels à facturation','compta_facturation'],['paiements','Suivi des paiements','compta_paiements'],['delegataires','Suivi des encaissements','compta_delegataires'],['tva','TVA','compta_tva_payer']].filter(t=>can(t[2]));
  if(!tabs.length){document.getElementById('content').innerHTML=`<div class="empty"><div class="big">🔒</div>Aucun onglet de comptabilité ne vous est accessible.</div>`;return;}
  if(!tabs.some(t=>t[0]===COMPTA_TAB))COMPTA_TAB=tabs[0][0];
  let h=segBanner();
  h+=`<div class="tabs">`+tabs.map(t=>`<button class="tab ${COMPTA_TAB===t[0]?'act':''}" onclick="COMPTA_TAB='${t[0]}';RESUME_VUE='';DELEG_VUE='';renderComptaTabs()">${t[1]}</button>`).join('')+`</div><div id="comptaBody"></div>`;
  document.getElementById('content').innerHTML=h;
  if(COMPTA_TAB==='resume')renderComptaResume();
  else if(COMPTA_TAB==='facturation')renderComptaFacturation();
  else if(COMPTA_TAB==='paiements')renderComptaPaiements();
  else if(COMPTA_TAB==='delegataires')renderComptaDelegataires();
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
function renderDetailRecettes(T,eur){
  const lignes=T.recs.filter(matchResumeQ).map(r=>({r,k:primeDetailOf(r)}))
    .filter(x=>x.k.primeCEE>0)
    .sort((a,b)=>b.k.primeCEE-a.k.primeCEE);
  const totClient=lignes.reduce((s,x)=>s+(x.k.primeClient||0),0);
  const totCom=lignes.reduce((s,x)=>s+(x.k.comTTC||0),0);
  const totCEE=lignes.reduce((s,x)=>s+(x.k.primeCEE||0),0);
  let h=`<div style="display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin-bottom:.9rem">
    <button class="btn btn-ghost btn-sm" onclick="RESUME_VUE='';RESUME_Q='';renderComptaResume()">← Retour au résumé</button>
    <span style="font-weight:800;font-size:.95rem">Détail par dossier</span>
    <span class="muted" style="font-size:.8rem">${lignes.length} dossier${lignes.length>1?'s':''} · ${eur(totCEE)} TTC</span>
  </div>`;
  h+=opFilterBar('renderComptaResume');
  h+=resumeSearchBar();
  if(!lignes.length){
    h+=`<div class="empty"><div class="big">💶</div>Aucun dossier avec une prime.</div>`;
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
function renderDetailCharges(T,eur){
  const lignes=T.recs.filter(matchResumeQ).map(r=>{
    const m=recordComptaMetrics(r);
    const ttc=(key,montant)=>tvaLine(r,key,montant||0).ttc;
    const cc=ttc('callcenter',m.aPayerCallCenter);
    const vt=ttc('vt',m.aPayerVt);
    const au=ttc('audit',m.aPayerAudit);
    const po=ttc('poseur',m.aPayerPoseur);
    const ma=m.march?m.march.ttc:0;
    return{r,cc,vt,au,po,ma,total:cc+vt+au+po+ma,march:m.march};
  }).filter(x=>x.total>0).sort((a,b)=>b.total-a.total);
  const som=k=>lignes.reduce((s,x)=>s+(x[k]||0),0);
  const totGen=som('total');
  let h=`<div style="display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin-bottom:.9rem">
    <button class="btn btn-ghost btn-sm" onclick="RESUME_VUE='';RESUME_Q='';renderComptaResume()">← Retour au résumé</button>
    <span style="font-weight:800;font-size:.95rem">Détail des charges par dossier</span>
    <span class="muted" style="font-size:.8rem">${lignes.length} dossier${lignes.length>1?'s':''} · ${eur(totGen)} TTC</span>
  </div>`;
  h+=opFilterBar('renderComptaResume');
  h+=resumeSearchBar();
  if(!lignes.length){
    h+=`<div class="empty"><div class="big">📤</div>Aucune charge enregistrée.</div>`;
    document.getElementById('comptaBody').innerHTML=h;return;
  }
  const cel=v=>v?eur(v):'<span class="muted">—</span>';
  h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>N° Dossier</th><th>Client</th><th>Opération</th>
    <th class="r">Call center</th><th class="r">VT</th><th class="r">Audit</th><th class="r">Poseur</th><th class="r">Marchandise</th><th class="r">Total</th>
  </tr></thead><tbody>`;
  lignes.forEach(x=>{
    const op=getAllProducts().find(o=>o.id===x.r.productId);
    h+=`<tr style="cursor:pointer" onclick="ouvrirLigne(event,'${x.r.id}')">
      <td><span class="dossier-tag">${esc(x.r.dossier||'—')}</span></td>
      <td style="font-weight:700">${esc(clientNameOf(x.r))}${x.r.ville?`<div class="muted" style="font-size:.68rem">${esc(x.r.ville)}</div>`:''}</td>
      <td class="muted">${op?esc(op.name):'—'}</td>
      <td style="text-align:right">${cel(x.cc)}</td>
      <td style="text-align:right">${cel(x.vt)}</td>
      <td style="text-align:right">${cel(x.au)}</td>
      <td style="text-align:right">${cel(x.po)}</td>
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
  const rows=T.rows.filter(x=>matchResumeQ(x.r)).sort((a,b)=>b.m.marge-a.m.marge);
  let h=`<div style="display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin-bottom:.9rem">
    <button class="btn btn-ghost btn-sm" onclick="RESUME_VUE='';RESUME_Q='';renderComptaResume()">← Retour au résumé</button>
    <span style="font-weight:800;font-size:.95rem">Marge par dossier</span>
    <span class="muted" style="font-size:.8rem">${rows.length} dossier${rows.length>1?'s':''} · ${eur(T.totMarge)} de marge</span>
  </div>`;
  h+=opFilterBar('renderComptaResume');
  h+=resumeSearchBar();
  if(!rows.length){
    h+=`<div class="empty"><div class="big">📈</div>Aucun dossier chiffré — renseignez la comptabilité d'un dossier.</div>`;
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
    <td style="text-align:right">${eur(T.totRecettes)}</td>
    <td style="text-align:right">${eur(T.totCharges)}</td>
    <td style="text-align:right;color:${T.totMarge>=0?'var(--green-deep)':'#E63946'}">${eur(T.totMarge)}</td>
    <td style="text-align:right">${T.totRecettes>0?T.margePct.toFixed(1)+'%':'—'}</td>
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
  const carte=(ic,lab,type)=>{
    const montant=aCreer[type], n=nbDossiers[type];
    return `<div class="kpi" onclick="FACT_TYPE='${type}';FACT_AGENT='';renderComptaTabs()" style="cursor:pointer;${FACT_TYPE===type?'border:1.5px solid var(--green)':''}">
      <div class="kico">${ic}</div><div class="klab">${lab}</div>
      <div class="kval" style="${montant>0?'color:#B96A0A':'color:var(--green-deep)'}">${eur(montant)}</div>
      <div class="ksub">${n?`HT ${eur(htOf(montant))} · ${n} dossier${n>1?'s':''} <span style="color:var(--blue);font-weight:700">→</span>`:'Tout est facturé ✓'}</div>
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
  <tfoot><tr><td colspan="4">Total à verser</td>${tfootTva}</tr></tfoot>
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
  const factureObj={id:factureId,apfNum,type,date:dApf.getTime(),poseurId:agentId,poseurName:agentName,
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
