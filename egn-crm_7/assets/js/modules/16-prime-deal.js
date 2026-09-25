/* ============================================================
   EGN CRM — modules/16-prime-deal.js
   Prime CEE, panneau Deal, formulaire de fiche
   ============================================================ */
/* ============================================================
   CALCUL DE LA PRIME CEE
   Deux lignes, calculees chacune sur le cumac total :
     - Prime client       : versee au client, sans TVA
     - Commission installateur : votre remuneration, TVA 20 %
   ============================================================ */
function calcPrimeCEE(delegId,type,cumac){
  const d=getDelegataires().find(x=>x.id===delegId);
  const mwhc=(parseFloat(cumac)||0)/1000;
  const n=v=>parseFloat(String(v??'').replace(',','.'))||0;
  const precaire=type==='precaire';
  const valoClient=d?(precaire?n(d.valoPrecaire):n(d.valoClassique)):0;
  // Retrocompatibilite : sans commission configuree, on reprend la valo client
  const brutCom=d?(precaire?d.valoComPrecaire:d.valoComClassique):null;
  const valoCom=(brutCom===undefined||brutCom===null||brutCom==='')?valoClient:n(brutCom);
  const r2=v=>Math.round(v*100)/100;
  const t=tvaRate()/100;
  // La prime client est negociee en TTC, mais la TVA ayant deja ete recuperee
  // sur la facture client, elle est comptabilisee en HT.
  const primeClientBrut=r2(mwhc*valoClient);
  const primeClient=r2(primeClientBrut/(1+t));
  const comHT=r2(mwhc*valoCom);
  const comTVA=r2(comHT*t);
  const comTTC=r2(comHT+comTVA);
  return{
    d,mwhc,valoClient,valoCom,
    primeClientBrut,      // base negociee, TTC
    primeClient,          // comptabilisee en HT
    comHT,comTVA,comTTC,  // commission installateur
    primeHT:r2(primeClient+comHT),          // base comptabilisee hors TVA
    // Prime CEE TTC = prime client a sa valeur negociee + commission HT
    primeCEE:r2(primeClientBrut+comHT),
    totalEncaisse:r2(primeClientBrut+comTTC) // virement reel du delegataire
  };
}
/* Prime CEE TTC d'un dossier.
   Recalculee a la volee des que le cumac et le delegataire sont renseignes,
   pour que la compta suive les valos sans avoir a rouvrir chaque dossier.
   La valeur stockee sert de repli (dossiers anciens, valo supprimee). */
/* Decomposition de la prime d'un dossier : client, commission, total */
function primeDetailOf(r){
  const d=dealOf(r);
  if(!d.delegataireId||!d.cumac){
    const st=parseFloat(d.prime)||0;
    return{primeClient:0,comHT:0,comTVA:0,comTTC:0,primeCEE:st,estime:true};
  }
  const k=calcPrimeCEE(d.delegataireId,d.type,d.cumac);
  if(!k.valoClient&&!k.valoCom){
    const st=parseFloat(d.prime)||0;
    return{primeClient:0,comHT:0,comTVA:0,comTTC:0,primeCEE:st,estime:true};
  }
  return{...k,estime:false};
}
function primeOf(r){
  const d=dealOf(r);
  const stockee=parseFloat(d.prime)||0;
  if(!d.delegataireId||!d.cumac)return stockee;
  const k=calcPrimeCEE(d.delegataireId,d.type,d.cumac);
  if(!k.valoClient&&!k.valoCom)return stockee;
  return k.primeCEE;
}
function dealRecalc(){
  const did=(document.getElementById('deal_deleg')||{}).value||'';
  const type=(document.getElementById('deal_type')||{}).value||'classique';
  const cumac=parseFloat((document.getElementById('deal_cumac')||{}).value||'')||0;
  const k=calcPrimeCEE(did,type,cumac);
  const eur=n=>(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  const primeAuto=(cumac&&(k.valoClient||k.valoCom))?k.primeCEE:null;

  // Detail du calcul, affiche sous la prime
  const det=document.getElementById('deal_detail');
  if(det){
    if(!cumac||!k.d){
      det.innerHTML='<span class="muted" style="font-size:.72rem">Renseignez le délégataire et le cumac pour obtenir le détail.</span>';
    }else{
      const lg=(lib,sous,montant,coul)=>`<div style="display:flex;align-items:baseline;gap:.5rem;padding:.22rem 0">
        <span style="flex:1;font-size:.78rem">${lib}<span class="muted" style="font-size:.66rem;display:block">${sous}</span></span>
        <span style="font-weight:700;font-size:.82rem;${coul?'color:'+coul:''}">${eur(montant)}</span></div>`;
      det.innerHTML=
        lg('Prime client','TVA 0 % · '+k.valoClient.toString().replace('.',',')+' €/MWhc',k.primeClientBrut)
       +lg('<span style="color:var(--text-mut)">dont comptabilisé en HT</span>','TVA déjà récupérée sur la facture client',k.primeClient,'var(--text-mut)')
       +lg('Commission installateur','HT · '+k.valoCom.toString().replace('.',',')+' €/MWhc',k.comHT)
       +lg('TVA sur commission',tvaRate()+' %',k.comTVA,'var(--text-mut)')
       +`<div style="border-top:1px solid var(--border-grey);margin-top:.3rem;padding-top:.3rem">`
       +lg('<b>Prime CEE TTC</b>','prime client TTC + commission HT',k.primeCEE,'var(--green-deep)')
       +`</div>`;
    }
  }

  const vl=document.getElementById('deal_valoinfo');
  if(vl)vl.textContent=k.d
    ?`${k.d.name} — client ${k.valoClient.toString().replace('.',',')} €/MWhc · commission ${k.valoCom.toString().replace('.',',')} €/MWhc`
    :'';
}
function dealAutoCumac(id){
  const r=recById(id);const c=computeCumac(r);
  if(c==null){toast('Renseignez d\'abord les champs de calcul et les coefficients dans Paramètres ▸ Opérations','err');return;}
  const el=document.getElementById('deal_cumac');if(el){el.value=c;}
  const k=calcPrimeCEE(dealOf(r).delegataireId,dealOf(r).type,c);
  dealRecalc();
  if(k.primeCEE)toast('Cumac : '+c.toLocaleString('fr-FR')+' kWhc → Prime CEE : '+k.primeCEE.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' € TTC','ok');
  else toast('Cumac : '+c.toLocaleString('fr-FR')+' kWhc — renseignez le délégataire pour obtenir la prime','ok');
}
async function saveDeal(id){
  const recs=getRecs();const r=recs.find(x=>x.id===id);if(!r)return;
  const did=(document.getElementById('deal_deleg')||{}).value||'';
  const type=(document.getElementById('deal_type')||{}).value||'classique';
  const cumac=parseFloat((document.getElementById('deal_cumac')||{}).value||'')||0;
  const delegs=getDelegataires();const d=delegs.find(x=>x.id===did);
  // Prime entierement calculee : prime client + commission TTC
  const k=calcPrimeCEE(did,type,cumac);
  const valo=k.valoClient;
  const prime=k.primeCEE;
  Object.assign(dealOf(r),{delegataireId:did,delegataireName:d?d.name:'',type,cumac,valo,prime});
  // Synchroniser r.deal dans localStorage
  r.deal=r.deal||{};
  Object.assign(r.deal,{delegataireId:did,delegataireName:d?d.name:'',type,cumac,valo,prime});
  await persistDeal(id);
  // Mettre à jour le cache avec la nouvelle prime pour que la compta globale la voit immédiatement
  DEAL_CACHE[id]=DEAL_CACHE[id]||rowToDeal(null);
  Object.assign(DEAL_CACHE[id],{delegataireId:did,delegataireName:d?d.name:'',type,cumac,valo,prime});
  // Invalider la compta globale pour forcer le rechargement depuis Supabase au prochain accès
  COMPTA_LOADED=false;
  r.updated=Date.now();
  r.history=r.history||[];
  r.history.unshift({date:Date.now(),user:(ME.prenom+' '+ME.nom).trim()||ME.code,text:'Deal mis à jour'});
  logActivity('action',`💰 Deal enregistré sur ${r.dossier||id} — prime ${prime.toLocaleString('fr-FR')} € TTC`,id);
  save(K.recs,recs);openDossier(id);toast('Deal enregistré ✓','ok');
}
function statusInline(r){
  const s=statById(r.statusId);const col=s?s.color:'#9aa5b1';
  return `<select class="status-sel" style="color:${col};background:${col}1a" onchange="quickStatus('${r.id}',this.value)">${statusOptions(r.statusId)}</select>`;
}
function ignoreDoublon(id){
  const ignores=load('egncrm_doublon_ignore',[]);
  if(!ignores.includes(id))ignores.push(id);
  save('egncrm_doublon_ignore',ignores);
  openDossier(id);toast('Marqué comme non-doublon ✓','ok');
}
async function doubonAnnulerExistant(id){
  const annuleStatut=getAllStatuses().find(s=>s.name&&s.name.toLowerCase().includes('annul'));
  if(!annuleStatut){toast('Aucun statut "Annulé" trouvé dans les paramètres','err');return;}
  const recs=getRecs();const r=recs.find(x=>x.id===id);if(!r)return;
  r.statusId=annuleStatut.id;r.updated=Date.now();
  r.history=r.history||[];r.history.unshift({date:Date.now(),user:ME.prenom,text:`Statut → ${annuleStatut.name} (doublon)`});
  save(K.recs,recs);toast(`Dossier ${r.dossier||id} passé en "${annuleStatut.name}" ✓`,'ok');
  if(DOSSIER_OPEN)openDossier(DOSSIER_OPEN);
}
function supprimerDoublon(id){
  modalConfirm('Supprimer définitivement ce dossier ?','Cette action est irréversible.',()=>{
    const recs=getRecs().filter(x=>x.id!==id);
    save(K.recs,recs);closeModal();
    logActivity('action',`🗑️ Dossier doublon supprimé : ${id}`);
    toast('Dossier supprimé ✓','ok');
    go('leads');
  });
}
function saveFournisseurDossier(id,val){
  const recs=getRecs();const r=recs.find(x=>x.id===id);if(!r)return;
  r.fournisseurDossier=val||null;r.updated=Date.now();
  r.history=r.history||[];
  if(val)r.history.unshift({date:Date.now(),user:ME.prenom,text:`Fournisseur matériel : ${val}`});
  save(K.recs,recs);toast('Fournisseur enregistré ✓','ok');
}
function saveCrmDevis(id,val){
  const recs=getRecs();const r=recs.find(x=>x.id===id);if(!r)return;
  r.crmDevis=val||null;r.updated=Date.now();
  r.history=r.history||[];
  if(val)r.history.unshift({date:Date.now(),user:ME.prenom,text:`CRM devis : ${val}`});
  save(K.recs,recs);
  // Pas de rechargement complet pour garder la position de scroll
  const el=document.querySelector(`[data-crm-devis="${id}"]`);
  if(el)el.value=val||'';
  toast('CRM devis enregistré ✓','ok');
}
function quickSousStatut(id,ssid){
  const recs=getRecs();const r=recs.find(x=>x.id===id);if(!r)return;
  const old=load('egncrm_sousstatuts',[]).find(s=>s.id===r.sousStatutId);
  const nw=load('egncrm_sousstatuts',[]).find(s=>s.id===ssid);
  r.sousStatutId=ssid||null;r.updated=Date.now();
  r.history=r.history||[];r.history.unshift({date:Date.now(),user:ME.prenom,text:`Sous-statut : ${old?old.name:'—'} → ${nw?nw.name:'Aucun'}`});
  save(K.recs,recs);
  if(DOSSIER_OPEN===id)openDossier(id);
  toast('Sous-statut mis à jour','ok');
}
function quickStatus(id,sid){
  const recs=getRecs();const r=recs.find(x=>x.id===id);if(!r)return;
  const old=statById(r.statusId),nw=statById(sid);
  r.statusId=sid;r.updated=Date.now();
  r.history=r.history||[];r.history.unshift({date:Date.now(),user:ME.prenom,text:`Statut : ${old?old.name:'—'} → ${nw?nw.name:'—'}`});
  logActivity('action',`🔄 Statut du dossier ${r.dossier||id} : ${old?old.name:'—'} → ${nw?nw.name:'—'}`,id);
  save(K.recs,recs);buildNav();
  if(DOSSIER_OPEN===id)openDossier(id);
  else applyRecFilter(CUR==='clients'?'clients':'leads');
  toast('Statut mis à jour','ok');
  // Passage de lead à client : on prévient l'équipe concernée
  const etaitLead=!old||old.phase!=='client';
  if(etaitLead&&nw&&nw.phase==='client')notifierPassageClient(r,old,nw);
}
/* Prévient le propriétaire du dossier et les managers quand un lead devient client */
async function notifierPassageClient(r,old,nw){
  const who=((ME.prenom||'')+' '+(ME.nom||'')).trim()||ME.code;
  const label=r.dossier||recName(r);
  const op=getAllProducts().find(o=>o.id===r.productId);
  const prime=primeOf(r)||0;
  const msg=`🎉 *Nouveau client !*\n\n`
    +`📁 Dossier ${label}\n`
    +`👤 ${clientNameOf(r)}${r.ville?' — '+r.ville:''}\n`
    +(op?`⚡ ${op.name}\n`:'')
    +(prime?`💰 Prime : ${prime.toLocaleString('fr-FR')} €\n`:'')
    +`\n${old?old.name:'—'} → *${nw.name}*\n`
    +`Par ${who}\n\n`
    +`${lienDossier(r)}`;
  // Destinataires : propriétaire du dossier + comptes ayant la vue globale, sans doublon ni soi-même
  const dest=new Set();
  if(r.userId)dest.add(r.userId);
  getUsers().forEach(u=>{
    if(u.active===false||!u.whatsapp)return;
    const p=normalizePerms(u.perms,u.role);
    if(u.role==='superadmin'||p.dash_global)dest.add(u.id);
  });
  dest.delete(ME.id);
  let envoyes=0;
  for(const uid of dest){
    await createNotification(uid,'client',`🎉 ${label} — ${clientNameOf(r)} est passé en ${nw.name}`,r.id);
    const res=await sendWhatsAppToUser(uid,msg,'passage_client');
    if(res.ok)envoyes++;
  }
  if(envoyes)toast(`📱 ${envoyes} notification${envoyes>1?'s':''} WhatsApp envoyée${envoyes>1?'s':''}`,'ok');
}
function delRec(id){
  modalConfirm('Supprimer ce dossier ?','Cette action est définitive (RDV liés et pièces jointes inclus).',async()=>{
    const rec=recById(id);
    if(rec&&rec.docs)for(const d of rec.docs){try{if(d.path)await SUPA.storage.from(ATTACH_BUCKET).remove([d.path]);}catch(e){console.error('[storage remove]',e);}try{await idbDel(d.id);}catch(e){}}
    const linkedRdvs=getRdvs().filter(r=>r.recordId===id);
    save(K.recs,getRecs().filter(r=>r.id!==id));
    save(K.rdv,getRdvs().filter(r=>r.recordId!==id));
    await deleteRemoteRow(K.recs,id);
    for(const rd of linkedRdvs)await deleteRemoteRow(K.rdv,rd.id);
    logActivity('action',`🗑️ Suppression du dossier ${rec?rec.dossier||id:id}${rec?' — '+recName(rec):''}`,id);
    closeModal();buildNav();
    CUR==='clients'?applyRecFilter('clients'):applyRecFilter('leads');
    toast('Dossier supprimé','ok');
  });
}

/* ---- fiche lead (création / édition) ---- */
function openLead(id){
  const r=id?recById(id):null;
  const ro=!id&&!can('leads_create');if(ro){toast('Non autorisé','err');return;}
  const editable=can('leads_edit')||(!id&&can('leads_create'));
  LF_REC=r;
  LF_OPVALS=(r&&r.opFields)?{...r.opFields}:{};
  let body=leadFormBody(r);
  if(r&&r.history&&r.history.length){body+=`<div class="sectitle">Historique</div><div class="hist">`+r.history.map(hh=>`<div class="hist-item"><div class="hm">${new Date(hh.date).toLocaleString('fr-FR')} • ${esc(hh.user||'')}</div>${esc(hh.text)}</div>`).join('')+`</div>`;}
  const title=r?`Dossier ${esc(r.dossier)} — ${esc(recName(r))}`:'Nouveau lead';
  openModal(title,body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>${editable?`<button class="btn btn-pri" onclick="saveLead()">💾 Enregistrer</button>`:''}`,'wide');
  renderOpFields();
  if(!editable)document.querySelectorAll('#modalBox input,#modalBox select,#modalBox textarea').forEach(e=>e.disabled=true);
}
function leadFormBody(r){
  const d=r||{};
  const prods=getProducts(),srcs=getSources(),users=getUsers().filter(u=>u.active);
  // nouveau lead : pré-remplit la source du commercial connecté s'il en a une affiliée
  if(!r&&!d.sourceId&&ME&&ME.role==='commercial'&&ME.sourceId)d.sourceId=ME.sourceId;
  const sel=(arr,v,ph)=>`<option value="">${ph||'—'}</option>`+arr.map(x=>`<option value="${x.id}" ${x.id===v?'selected':''}>${esc(x.name)}</option>`).join('');
  const userSel=v=>`<option value="">— Non affecté —</option>`+users.map(u=>`<option value="${u.id}" ${u.id===v?'selected':''}>${esc(u.prenom+' '+u.nom)} (${ROLES[u.role]||u.role})</option>`).join('');
  return `<input type="hidden" id="lf_id" value="${r?r.id:''}">
  <div class="sectitle">Opération & affectation</div>
  <div class="fgrid">
    <div class="fld"><label>Opération (fiche CEE)</label><select id="lf_op" onchange="renderOpFields()">${sel(prods,d.productId,'— Choisir l\'opération —')}</select></div>
    <div class="fld"><label>Statut</label><select id="lf_status">${statusOptions(d.statusId||(getStatuses()[0]||{}).id)}</select></div>
    <div class="fld"><label>Source</label><select id="lf_src">${sel(srcs,d.sourceId,'— Choisir —')}</select></div>
    <div class="fld"><label>Intervenant</label><select id="lf_user">${userSel(d.userId)}</select></div>
  </div>
  <div id="lf_opfields_wrap" style="margin-top:.7rem"></div>
  <div class="fgrid" style="margin-top:.7rem"><div class="fld full"><label>Note à ajouter (ajoutée à l'historique)</label><textarea id="lf_note" placeholder="Commentaire, compte-rendu d'appel…"></textarea></div></div>`;
}
function editDossier(id){
  const r=recById(id);if(!r){toast('Dossier introuvable','err');return;}
  if(!can('leads_edit')){toast('Modification non autorisée','err');return;}
  DOSSIER_OPEN=id;LF_REC=r;LF_OPVALS=(r.opFields)?{...r.opFields}:{};
  document.getElementById('pageTitle').innerHTML=`Modifier — ${esc(r.dossier||'')}`;
  document.getElementById('pageSub').textContent=recName(r);
  document.getElementById('pageActions').innerHTML=`<button class="btn btn-ghost btn-sm" onclick="openDossier('${id}')">← Annuler</button>`;
  document.getElementById('content').innerHTML=`<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1.2rem"><button class="btn btn-pri" onclick="saveLead()">💾 Enregistrer les modifications</button><button class="btn btn-ghost" onclick="openDossier('${id}')">Annuler</button></div><div class="panel"><div class="panel-b" style="max-width:880px">${leadFormBody(r)}</div></div>`;
  renderOpFields();
}
function lfAutoDept(){const cp=document.getElementById('lf_cp').value;const dd=document.getElementById('lf_dept');if(!dd.value)dd.value=deptFromCP(cp);}
function val(id){const e=document.getElementById(id);return e?e.value.trim():'';}
function recName(r){if(r.raisonSociale){const sig=((r.prenom||'')+' '+(r.nom||'')).trim();return r.raisonSociale+(sig?' — '+sig:'');}return fullName(r);}
function recWorkAddr(r){return r.adresseTravauxDiff?{adresse:r.adresseTravaux||'',cp:r.cpTravaux||'',ville:r.villeTravaux||'',dept:deptFromCP(r.cpTravaux)}:{adresse:r.adresse||'',cp:r.cp||'',ville:r.ville||'',dept:r.dept||deptFromCP(r.cp)};}
/* zones climatiques RT2012 (indicatif, ajustable) */
const ZONE={'01':'H1','02':'H1','03':'H1','04':'H2','05':'H1','06':'H3','07':'H2','08':'H1','09':'H2','10':'H1','11':'H3','12':'H2','13':'H3','14':'H1','15':'H1','16':'H2','17':'H2','18':'H2','19':'H1','21':'H1','22':'H2','23':'H1','24':'H2','25':'H1','26':'H2','27':'H1','28':'H1','29':'H2','2A':'H3','2B':'H3','30':'H3','31':'H2','32':'H2','33':'H2','34':'H3','35':'H2','36':'H2','37':'H2','38':'H1','39':'H1','40':'H2','41':'H2','42':'H1','43':'H1','44':'H2','45':'H1','46':'H2','47':'H2','48':'H2','49':'H2','50':'H1','51':'H1','52':'H1','53':'H1','54':'H1','55':'H1','56':'H2','57':'H1','58':'H1','59':'H1','60':'H1','61':'H1','62':'H1','63':'H1','64':'H2','65':'H2','66':'H3','67':'H1','68':'H1','69':'H1','70':'H1','71':'H1','72':'H1','73':'H1','74':'H1','75':'H1','76':'H1','77':'H1','78':'H1','79':'H2','80':'H1','81':'H2','82':'H2','83':'H3','84':'H3','85':'H2','86':'H2','87':'H1','88':'H1','89':'H1','90':'H1','91':'H1','92':'H1','93':'H1','94':'H1','95':'H1'};
function zoneOf(dept){return ZONE[dept]||'';}
function applyOpConditionals(){
  document.querySelectorAll('#lf_opfields_wrap .op-cond').forEach(div=>{
    const ctrlId=div.dataset.ctrl;
    if(!ctrlId){div.style.display='';return;}
    const el=document.getElementById('opf_'+ctrlId);
    const show=el?(el.value==='Oui'||el.value==='true'):true;
    div.style.display=show?'':'none';
  });
}
const CANON_KEYS={raison_sociale:'raisonSociale',siret:'siret',nom:'nom',prenom:'prenom',tel_mobile:'tel',tel_fixe:'telFixe',fonction:'fonction',nom_site:'nomSite',email:'email',adresse_siege:'adresse',cp_siege:'cp',ville_siege:'ville',adresse_travaux:'adresseTravaux',cp_travaux:'cpTravaux',ville_travaux:'villeTravaux',civilite:'civilite',date_naissance:'dateNaissance',revenu_fiscal:'revenuFiscal',nb_personnes:'nbPersonnes',precarite:'precarite',occupation:'occupation',type_logement:'typeLogement',annee_construction:'anneeConstruction'};
function canonByKey(r,key){if(!r)return '';if(key==='adresse_travaux_diff')return r.adresseTravauxDiff?'Oui':'Non';const t=CANON_KEYS[key];return t?(r[t]||''):'';}
function commonFieldDefs(){return SEGMENT==='btoc'?commonFieldDefsBtoC():commonFieldDefsBtoB();}
function commonFieldDefsBtoC(){return [
  {key:'civilite',label:'Civilité',type:'select',options:['M.','Mme','M. et Mme']},
  {key:'nom',label:'Nom',type:'text'},
  {key:'prenom',label:'Prénom',type:'text'},
  {key:'date_naissance',label:'Date de naissance',type:'date'},
  {key:'tel_mobile',label:'Téléphone mobile',type:'tel'},
  {key:'tel_fixe',label:'Téléphone fixe',type:'tel'},
  {key:'email',label:'Email',type:'email'},
  {key:'adresse_siege',label:'Adresse du logement',type:'text'},
  {key:'cp_siege',label:'Code postal',type:'text'},
  {key:'ville_siege',label:'Ville',type:'text'},
  {key:'adresse_travaux_diff',label:'Adresse de travaux différente ?',type:'bool'},
  {key:'adresse_travaux',label:'Adresse des travaux',type:'text',showIf:'adresse_travaux_diff'},
  {key:'cp_travaux',label:'Code postal (travaux)',type:'text',showIf:'adresse_travaux_diff'},
  {key:'ville_travaux',label:'Ville (travaux)',type:'text',showIf:'adresse_travaux_diff'},
  {key:'occupation',label:'Statut d\'occupation',type:'select',options:['Propriétaire occupant','Propriétaire bailleur','Locataire']},
  {key:'type_logement',label:'Type de logement',type:'select',options:['Maison individuelle','Appartement']},
  {key:'annee_construction',label:'Année de construction',type:'number'},
  {key:'nb_personnes',label:'Nombre de personnes au foyer',type:'number'},
  {key:'revenu_fiscal',label:'Revenu fiscal de référence (€)',type:'number'},
  {key:'precarite',label:'Catégorie de revenus',type:'select',options:['Classique','Modeste','Très modeste']},
  {key:'surface_m2',label:'Surface (m²)',type:'number'}
].map(f=>({id:uid(),options:[],required:false,...f}));}
function commonFieldDefsBtoB(){return [
  {key:'raison_sociale',label:'Raison sociale',type:'text'},
  {key:'siret',label:'Numéro de SIRET',type:'siret'},
  {key:'nom',label:'Nom',type:'text'},
  {key:'prenom',label:'Prénom',type:'text'},
  {key:'tel_mobile',label:'Téléphone mobile',type:'tel'},
  {key:'tel_fixe',label:'Téléphone fixe',type:'tel'},
  {key:'fonction',label:'Fonction du signataire',type:'text'},
  {key:'nom_site',label:'Nom du site',type:'text'},
  {key:'email',label:'Email',type:'email'},
  {key:'adresse_siege',label:'Adresse du siège',type:'text'},
  {key:'cp_siege',label:'Code postal',type:'text'},
  {key:'ville_siege',label:'Ville',type:'text'},
  {key:'adresse_travaux_diff',label:'Adresse de travaux différente ?',type:'bool'},
  {key:'adresse_travaux',label:'Adresse des travaux',type:'text',showIf:'adresse_travaux_diff'},
  {key:'cp_travaux',label:'Code postal (travaux)',type:'text',showIf:'adresse_travaux_diff'},
  {key:'ville_travaux',label:'Ville (travaux)',type:'text',showIf:'adresse_travaux_diff'},
  {key:'surface_m2',label:'Surface (m²)',type:'number'}
].map(f=>({id:uid(),options:[],required:false,...f}));}
async function lookupSiret(fieldId){
  const inp=document.getElementById('opf_'+fieldId);if(!inp)return;
  const siret=inp.value.replace(/\s/g,'');
  if(siret.length<9){toast('SIRET (14) ou SIREN (9) requis','err');return;}
  const opId=(document.getElementById('lf_op')||{}).value;const op=getAllProducts().find(p=>p.id===opId);if(!op)return;
  const setByKey=(key,v)=>{if(!v)return;const fd=(op.fields||[]).find(f=>f.key===key);if(fd){const el=document.getElementById('opf_'+fd.id);if(el)el.value=v;}};
  toast('Recherche de l\'entreprise…');
  try{
    const res=await fetch('https://recherche-entreprises.api.gouv.fr/search?q='+encodeURIComponent(siret)+'&page=1&per_page=1');
    if(!res.ok)throw 0;const j=await res.json();const r=j.results&&j.results[0];
    if(!r){toast('Entreprise introuvable','err');return;}
    setByKey('raison_sociale',r.nom_raison_sociale||r.nom_complet||'');
    const s=r.siege||{};
    setByKey('adresse_siege',[s.numero_voie,s.type_voie,s.libelle_voie].filter(Boolean).join(' ').trim()||s.geo_adresse||s.adresse||'');
    setByKey('cp_siege',s.code_postal||'');
    setByKey('ville_siege',s.libelle_commune||'');
    toast('Entreprise trouvée ✓','ok');
  }catch(e){toast('Service SIRET indisponible — saisie manuelle','err');}
}
let LAST_LEAD_SAVE=0;
async function saveLead(){
  if(Date.now()-LAST_LEAD_SAVE<1500)return; // anti double-clic : évite de créer deux dossiers d'un coup
  LAST_LEAD_SAVE=Date.now();
  const id=val('lf_id');
  const opId=val('lf_op');
  const op=getAllProducts().find(p=>p.id===opId);
  // validation des champs obligatoires de l'opération (on ignore les champs masqués)
  if(op&&op.fields){for(const f of op.fields){if(f.required){const el=document.getElementById('opf_'+f.id);if(el&&el.offsetParent!==null&&!el.value.trim()){toast('Champ requis : '+f.label,'err');return;}}}}
  const recs=getRecs();
  let r=id?recs.find(x=>x.id===id):null;
  const isNew=!r;
  if(isNew){r={id:uid(),dossier:await nextDossier(),created:Date.now(),history:[],segment:SEGMENT};recs.push(r);}
  if(!r.segment)r.segment=SEGMENT;
  const prevStatus=r.statusId;
  const ancienStatut=statById(r.statusId);
  r.productId=opId;r.statusId=val('lf_status');r.sourceId=val('lf_src');r.userId=val('lf_user');r.updated=Date.now();
  // champs personnalisés de l'opération + synchronisation des données canoniques (par clé)
  const opVals={...(r.opFields||{})};
  if(op&&op.fields){op.fields.forEach(f=>{
    const el=document.getElementById('opf_'+f.id);
    const v=el?el.value.trim():(opVals[f.id]||'');
    if(el)opVals[f.id]=v;
    if(f.key){
      if(f.key==='adresse_travaux_diff')r.adresseTravauxDiff=(v==='Oui');
      else if(CANON_KEYS[f.key])r[CANON_KEYS[f.key]]=v;
    }
  });}
  r.opFields=opVals;
  r.dept=deptFromCP(r.cp)||r.dept||'';
  r.lat=null;r.lng=null; // recalcul auto par centroïde dept
  r.history=r.history||[];
  const note=val('lf_note');
  if(isNew)r.history.unshift({date:Date.now(),user:ME.prenom,text:'Dossier créé'});
  else if(prevStatus!==r.statusId){const o=statById(prevStatus),n=statById(r.statusId);r.history.unshift({date:Date.now(),user:ME.prenom,text:`Statut : ${o?o.name:'—'} → ${n?n.name:'—'}`});}
  if(note)r.history.unshift({date:Date.now(),user:ME.prenom,text:note});
  logActivity('action',isNew?`➕ Création du dossier ${r.dossier||r.id} — ${recName(r)}`:`✏️ Modification du dossier ${r.dossier||r.id} — ${recName(r)}`,r.id);
  const nouveauStatut=statById(r.statusId);
  const devientClient=!isNew&&nouveauStatut&&nouveauStatut.phase==='client'&&(!ancienStatut||ancienStatut.phase!=='client');
  save(K.recs,recs);closeModal();buildNav();
  if(DOSSIER_OPEN&&DOSSIER_OPEN===r.id)openDossier(r.id);
  else if(CUR==='leads')applyRecFilter('leads');else if(CUR==='clients')applyRecFilter('clients');else go(CUR);
  toast(isNew?'Lead créé ✓':'Dossier enregistré ✓','ok');
  if(devientClient)notifierPassageClient(r,ancienStatut,nouveauStatut);
}

