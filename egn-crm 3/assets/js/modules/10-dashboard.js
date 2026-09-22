/* ============================================================
   EGN CRM — modules/10-dashboard.js
   Tableau de bord, Dashboard Coco, documents administratifs
   ============================================================ */
/* ====================================================================
   TABLEAU DE BORD
   ==================================================================== */
/* ============================================================
   DASHBOARD COCO — activité, comptabilité, stock
   Chaque bloc renvoie vers le module concerné
   ============================================================ */
/* Depuis Coco : ouvrir directement un tableau detaille du resume comptable */
function dashGoResume(vue){
  COMPTA_TAB='resume';
  RESUME_VUE=vue;
  go('compta');
}
function dashGo(page,opts){
  opts=opts||{};
  if(opts.comptaTab)COMPTA_TAB=opts.comptaTab;
  if(opts.factType){FACT_TYPE=opts.factType;FACT_AGENT='';FACT_SRC='';FACT_OP='';}
  if(opts.stockTab)STOCK_TAB=opts.stockTab;
  if(opts.recMode)REC_MODE=opts.recMode;
  go(page);
}
function gCard(o){
  const clickable=o.go?`onclick="${o.go}" style="cursor:pointer"`:'';
  return `<div class="kpi ${o.accent?'accent':''}" ${clickable} ${o.border?`style="border:1.5px solid ${o.border};cursor:${o.go?'pointer':'default'}"`:''}>
    <div class="kico">${o.ic}</div>
    <div class="klab">${esc(o.lab)}</div>
    <div class="kval" ${o.col?`style="color:${o.col}"`:''}>${o.val}</div>
    <div class="ksub">${o.sub||''}${o.go?` <span style="color:var(--blue);font-weight:700">→</span>`:''}</div>
  </div>`;
}
async function renderDashGlobal(){
  const el=document.getElementById('content');
  el.innerHTML='<div class="empty"><div class="big">⏳</div>Consolidation des données…</div>';
  // La comptabilité vit dans Supabase : on la charge avant d'agréger
  if(can('compta_global')){
    if(!COMPTA_LOADED){await Promise.all([loadAllCompta(),loadFactures(),loadAllDeal()]);COMPTA_LOADED=true;}
    else await Promise.all([loadAllDeal(),loadFactures()]);
  }
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:0})+' €';
  const eur2=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  const recs=visibleRecs().filter(r=>!COMPTA_OP||r.productId===COMPTA_OP);
  const sts=getStatuses();
  const isClient=r=>{const s=statById(r.statusId);return !!(s&&s.phase==='client');};
  const leads=recs.filter(r=>!isClient(r)),clients=recs.filter(isClient);
  const now=new Date();
  const debutMois=new Date(now.getFullYear(),now.getMonth(),1).getTime();
  const nouveaux=recs.filter(r=>(r.created||0)>=debutMois).length;
  const wonIds=sts.filter(s=>s.won).map(s=>s.id);
  const won=recs.filter(r=>wonIds.includes(r.statusId)).length;
  const conv=recs.length?Math.round(won/recs.length*100):0;
  let h=segBanner();
  h+=opFilterBar('renderDashGlobal');

  /* ---- Activité commerciale ---- */
  h+=`<div class="sectitle" style="margin-top:0">Activité commerciale</div><div class="kpis">`;
  h+=gCard({ic:'👥',lab:'Leads en cours',val:leads.length,sub:`${nouveaux} créé${nouveaux>1?'s':''} ce mois-ci`,go:"dashGo('leads')"});
  h+=gCard({ic:'🏠',lab:'Clients',val:clients.length,sub:'dossiers transmis & installés',go:"dashGo('clients')"});
  h+=gCard({ic:'🎯',lab:'Taux de conversion',val:conv+'%',sub:`${won} dossier${won>1?'s':''} gagné${won>1?'s':''}`,accent:true});
  // RDV
  const idsRecs=new Set(recs.map(r=>r.id));
  const rdvs=getRdvs().filter(rdvVisible).filter(rd=>!COMPTA_OP||idsRecs.has(rd.recordId));
  const toTs=d=>{if(!d)return 0;const s=String(d).trim();if(s.includes('/')){const p=s.split('/');return new Date(p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0')+'T00:00:00').getTime();}return new Date(s+'T00:00:00').getTime();};
  const today0=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  const dans7=today0+7*86400000;
  const rdvAvenir=rdvs.filter(r=>toTs(r.date)>=today0);
  const rdvSemaine=rdvAvenir.filter(r=>toTs(r.date)<dans7);
  const rdvAujourdhui=rdvs.filter(r=>toTs(r.date)===today0);
  h+=gCard({ic:'📅',lab:'RDV à venir',val:rdvAvenir.length,sub:`${rdvAujourdhui.length} aujourd'hui · ${rdvSemaine.length} sous 7 jours`,go:"dashGo('planning')"});
  h+=`</div>`;

  /* ---- Répartition par statut ---- */
  const parStatut=sts.map(s=>({s,nb:recs.filter(r=>r.statusId===s.id).length})).filter(x=>x.nb>0);
  if(parStatut.length){
    const maxNb=Math.max(...parStatut.map(x=>x.nb));
    h+=`<div class="panel"><div class="panel-h"><h3>Répartition du pipeline</h3><div class="sp"><span class="muted">${recs.length} dossier${recs.length>1?'s':''}</span></div></div><div class="panel-b">`;
    parStatut.forEach(({s,nb})=>{
      h+=`<div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.45rem;cursor:pointer" onclick="LF.status='${s.id}';dashGo('${s.phase==='client'?'clients':'leads'}')">
        <span style="width:150px;font-size:.8rem;font-weight:700;color:${s.color||'var(--text)'};flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</span>
        <div style="flex:1;background:#EEF1F4;border-radius:20px;height:16px;overflow:hidden"><div style="width:${Math.round(nb/maxNb*100)}%;height:100%;background:${s.color||'var(--green)'};border-radius:20px"></div></div>
        <span style="width:42px;text-align:right;font-weight:800;font-size:.84rem">${nb}</span>
      </div>`;
    });
    h+=`</div></div>`;
  }

  /* ---- Comptabilité ---- */
  if(can('compta_global')){
    // Mêmes chiffres que l'onglet Comptabilité — aucune recomposition
    const T=comptaTotaux();
    const recettes=T.totRecettes,charges=T.totCharges,marge=T.totMarge,margePct=T.margePct;
    const cRecs=T.recs;
    const aVerser={poseur:T.sumPoseur,callcenter:T.sumCc,vt:T.sumVt,auditeur:T.sumAud};
    const nbFam={poseur:Object.keys(T.byPoseur).filter(k=>k!==T.NONE_KEY).length,
                 callcenter:Object.keys(T.byCc).filter(k=>k!==T.NONE_KEY).length,
                 vt:Object.keys(T.byVt).filter(k=>k!==T.NONE_KEY).length,
                 auditeur:Object.keys(T.byAud).filter(k=>k!==T.NONE_KEY).length};
    const sousTexte=k=>aVerser[k]>0?`${nbFam[k]} intervenant${nbFam[k]>1?'s':''} concerné${nbFam[k]>1?'s':''}`:'Rien à verser';
    h+=`<div class="sectitle">Comptabilité</div><div class="kpis">`;
    h+=gCard({ic:'💶',lab:'CA TTC',val:eur(recettes),sub:`${cRecs.length} dossier${cRecs.length>1?'s':''} chiffré${cRecs.length>1?'s':''}`,go:"dashGoResume('recettes')"});
    h+=gCard({ic:'📤',lab:'Charges variables TTC',val:eur(charges),sub:'poseurs, call center, VT, audits, marchandise',go:"dashGoResume('charges')"});
    h+=gCard({ic:'📈',lab:'Marge brute',val:eur(marge),sub:recettes?margePct.toFixed(1)+'% de marge':'',accent:true,go:"dashGo('compta',{comptaTab:'resume'})"});
    h+=`</div>`;
    // Alerte : charges sans intervenant assigné, non facturables en l'état
    const nonAssignes=[
      {lab:'Poseur non assigné',x:T.byPoseur[T.NONE_KEY]},
      {lab:'Source non assignée',x:T.byCc[T.NONE_KEY]},
      {lab:'Société VT non assignée',x:T.byVt[T.NONE_KEY]},
      {lab:'Auditeur non assigné',x:T.byAud[T.NONE_KEY]}
    ].filter(o=>o.x&&o.x.aPayer>0);
    if(nonAssignes.length){
      const totNA=nonAssignes.reduce((s,o)=>s+o.x.aPayer,0);
      const nbNA=nonAssignes.reduce((s,o)=>s+o.x.nb,0);
      h+=`<div style="background:#FFF7ED;border:1.5px solid #F0C486;border-radius:11px;padding:.7rem 1rem;margin-bottom:.9rem;display:flex;align-items:center;gap:.8rem;flex-wrap:wrap">
        <span style="font-size:1.1rem">⚠️</span>
        <div style="flex:1;min-width:220px">
          <div style="font-weight:800;color:#B96A0A;font-size:.86rem">${eur(totNA)} non facturables — intervenant manquant</div>
          <div class="muted" style="font-size:.74rem">${nbNA} dossier${nbNA>1?'s':''} · ${nonAssignes.map(o=>esc(o.lab)).join(' · ')}</div>
        </div>
        ${nonAssignes.map(o=>`<button class="btn btn-ghost btn-sm" style="font-size:.72rem;color:#B96A0A" onclick="openNonAssignes('${o.lab}',${JSON.stringify(o.x.recIds||[]).replace(/"/g,'&quot;')})">👁️ ${esc(o.lab)}</button>`).join('')}
      </div>`;
    }
    h+=`<div class="sectitle" style="font-size:.66rem">Restant à verser <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">— montants TTC</span></div><div class="kpis">`;
    h+=gCard({ic:'🔧',lab:'À verser aux poseurs',val:eur(aVerser.poseur),sub:sousTexte('poseur'),col:aVerser.poseur>0?'#B96A0A':'var(--green-deep)',go:"dashGo('compta',{comptaTab:'facturation',factType:'poseur'})"});
    h+=gCard({ic:'📞',lab:'À verser au call center',val:eur(aVerser.callcenter),sub:sousTexte('callcenter'),col:aVerser.callcenter>0?'#2D7DD2':'var(--green-deep)',go:"dashGo('compta',{comptaTab:'facturation',factType:'callcenter'})"});
    h+=gCard({ic:'🧰',lab:'À verser aux VT',val:eur(aVerser.vt),sub:sousTexte('vt'),col:aVerser.vt>0?'':'var(--green-deep)',go:"dashGo('compta',{comptaTab:'facturation',factType:'vt'})"});
    h+=gCard({ic:'📝',lab:'À verser aux auditeurs',val:eur(aVerser.auditeur),sub:sousTexte('auditeur'),col:aVerser.auditeur>0?'':'var(--green-deep)',go:"dashGo('compta',{comptaTab:'facturation',factType:'auditeur'})"});
    h+=`</div>`;
    // Encaissements et TVA — suivent le filtre par operation
    const dansFiltre=id=>{if(!COMPTA_OP)return true;const r=recById(id);return !!(r&&r.productId===COMPTA_OP);};
    // Un APF est retenu s'il contient au moins un dossier de l'operation choisie,
    // et son montant est recalcule sur ces seules lignes.
    const factures=segFactures().filter(f=>(f.lignes||[]).some(l=>dansFiltre(l.recId)));
    const partFiltree=f=>(f.lignes||[]).filter(l=>dansFiltre(l.recId)).reduce((s,l)=>s+(l.montant||0),0);
    const apfDus=factures.filter(f=>(f.paiements||{}).statut_apf!=='paye');
    const totApfDus=apfDus.reduce((s,f)=>s+partFiltree(f),0);
    const apfDeleg=segApfDeleg().filter(a=>(a.recIds||[]).some(dansFiltre));
    const delegAttente=apfDeleg.filter(a=>a.statut!=='recu');
    const totDelegAttente=delegAttente.reduce((s,a)=>s+(a.recIds||[]).filter(dansFiltre).reduce((t,id)=>{const r=recById(id);return t+(r?primeOf(r)||0:0);},0),0);
    h+=`<div class="sectitle" style="font-size:.66rem">Encaissements & TVA</div><div class="kpis">`;
    h+=gCard({ic:'🏦',lab:'Encaissements délégataires attendus',val:eur(totDelegAttente),sub:`${delegAttente.length} APF en attente`,col:'#B96A0A',go:"dashGo('compta',{comptaTab:'delegataires'})"});
    h+=gCard({ic:'💳',lab:'APF non soldés',val:eur(totApfDus),sub:`${apfDus.length} appel${apfDus.length>1?'s':''} à facturation`,go:"dashGo('compta',{comptaTab:'paiements'})"});
    h+=gCard({ic:'🏛️',lab:'TVA',val:'Voir',sub:'collectée, déductible et solde',go:"dashGo('compta',{comptaTab:'tva'})"});
    h+=`</div>`;
  }

  /* ---- Stock & fournisseurs ---- */
  if(can('stock_view')){
    // Le filtre par operation s'applique aussi au stock : on ne garde que
    // les materiels rattaches a l'operation choisie, et leurs mouvements.
    const opChoisie=COMPTA_OP?getAllProducts().find(o=>o.id===COMPTA_OP):null;
    const mats=getMats().filter(m=>!COMPTA_OP||m.operationId===COMPTA_OP||(opChoisie&&m.operation===opChoisie.name));
    const idsMat=new Set(mats.map(m=>m.id));
    const mvts=getMvts().filter(v=>idsMat.has(v.materielId));
    const achats=mvts.filter(v=>['entree','reception'].includes(v.sens));
    const totAchete=achats.reduce((s,v)=>s+(v.totalHT||0),0);
    const duFourn=achats.filter(v=>(v.paiement||{}).statut!=='paye').reduce((s,v)=>s+(v.totalHT||0),0);
    const ttc=n=>n*(1+tvaRate()/100);
    const alertes=mats.filter(m=>{
      if(m.typeStock==='circulant'||m.typeStock==='commande')return false;
      const e=mvts.filter(v=>v.materielId===m.id&&v.sens==='entree').reduce((s,v)=>s+(v.qte||0),0);
      const so=mvts.filter(v=>v.materielId===m.id&&v.sens==='sortie').reduce((s,v)=>s+(v.qte||0),0)+calcSortiesAuto(m);
      return m.seuilAlerte&&(e-so)<=m.seuilAlerte;
    });
    const valeurStock=mats.reduce((s,m)=>{
      if(m.typeStock==='commande')return s;
      const e=mvts.filter(v=>v.materielId===m.id&&v.sens==='entree').reduce((a,v)=>a+(v.qte||0),0);
      const so=mvts.filter(v=>v.materielId===m.id&&v.sens==='sortie').reduce((a,v)=>a+(v.qte||0),0)+calcSortiesAuto(m);
      const reste=m.typeStock==='circulant'?e:Math.max(0,e-so);
      return s+reste*coutUnitaireMoyen(m,mvts);
    },0);
    h+=`<div class="sectitle">Stock & fournisseurs${COMPTA_OP&&opChoisie?` <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--blue)">— ${esc(opChoisie.name)}</span>`:''}</div>`;
    if(COMPTA_OP&&!mats.length)h+=`<p class="muted" style="font-size:.8rem;margin-bottom:.9rem">Aucun matériel rattaché à cette opération.</p>`;
    h+=`<div class="kpis">`;
    h+=gCard({ic:'💶',lab:'Valeur du stock',val:eur(valeurStock),sub:`${mats.length} matériel${mats.length>1?'s':''} au catalogue`,go:"dashGo('stock',{stockTab:'etat'})"});
    h+=gCard({ic:'🛒',lab:'Total acheté',val:eur(totAchete),sub:'HT, remises et frais inclus',go:"dashGo('stock',{stockTab:'mouvements'})"});
    h+=gCard({ic:'🧾',lab:'Reste à payer fournisseurs',val:eur(ttc(duFourn)),sub:'TTC · suivi des paiements',col:duFourn>0?'#B96A0A':'',go:"dashGo('compta',{comptaTab:'fournisseurs'})"});
    h+=gCard({ic:alertes.length?'⚠️':'✅',lab:'Alertes stock bas',val:alertes.length,sub:alertes.length?alertes.map(m=>esc(m.nom)).slice(0,2).join(', '):'Tout est OK',col:alertes.length?'var(--coral)':'var(--green-deep)',border:alertes.length?'rgba(230,57,70,.3)':'',go:"dashGo('stock',{stockTab:'etat'})"});
    h+=`</div>`;
  }

  /* ---- Prochains RDV ---- */
  if(rdvAvenir.length){
    const prochains=rdvAvenir.sort((a,b)=>toTs(a.date)-toTs(b.date)).slice(0,6);
    h+=`<div class="panel"><div class="panel-h"><h3>Prochains rendez-vous</h3><div class="sp"><button class="btn btn-ghost btn-sm" onclick="dashGo('planning')">Voir le planning →</button></div></div><div class="panel-b">`;
    h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Heure</th><th>Type</th><th>Dossier</th><th>Client</th><th>Intervenant</th></tr></thead><tbody>`;
    prochains.forEach(rd=>{
      const r=recById(rd.recordId);
      h+=`<tr ${r?`style="cursor:pointer" onclick="ouvrirLigne(event,'${r.id}')"`:''}>
        <td class="muted">${new Date(toTs(rd.date)).toLocaleDateString('fr-FR')}</td>
        <td style="font-weight:700">${esc(rd.heure||'—')}</td>
        <td>${esc(rd.type||'—')}</td>
        <td>${r?`<span class="dossier-tag">${esc(r.dossier||'')}</span>`:'—'}</td>
        <td>${r?esc(clientNameOf(r)):'—'}</td>
        <td class="muted">${esc(rdvWho(rd)||'—')}</td>
      </tr>`;
    });
    h+=`</tbody></table></div></div></div>`;
  }
  el.innerHTML=h;
  document.getElementById('pageActions').innerHTML='';
}

/* ============================================================
   TABLEAU DE BORD — filtre par operation et pipeline interactif
   ============================================================ */
let DASH_OP='';
function setDashOp(v){DASH_OP=v;renderDash();}
function dashOpBar(){
  const dispo=[...new Set(visibleRecs().map(r=>r.productId).filter(Boolean))]
    .map(id=>getAllProducts().find(o=>o.id===id)).filter(Boolean)
    .sort((a,b)=>a.name.localeCompare(b.name));
  if(!dispo.length)return '';
  if(DASH_OP&&!dispo.some(o=>o.id===DASH_OP))DASH_OP='';
  const fs="font-family:'Saira',sans-serif;font-size:.8rem;border:1.5px solid var(--border-grey);border-radius:8px;padding:.35rem .7rem;background:#fff;outline:none;font-weight:700";
  return `<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:.9rem">
    <span style="font-size:.7rem;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.5px">Opération</span>
    <select onchange="setDashOp(this.value)" style="${fs}">
      <option value="">Toutes les opérations</option>
      ${dispo.map(o=>`<option value="${o.id}" ${DASH_OP===o.id?'selected':''}>${esc(o.name)}</option>`).join('')}
    </select>
    ${DASH_OP?`<span style="font-size:.74rem;font-weight:700;background:rgba(45,125,210,.12);color:var(--blue);border-radius:6px;padding:2px 9px">Chiffres filtrés</span>
      <button class="btn btn-ghost btn-sm" style="font-size:.72rem" onclick="setDashOp('')">✕ Tout afficher</button>`:''}
  </div>`;
}
/* Clic sur une ligne du pipeline : ouvre la liste filtree sur ce statut */
function dashOuvrirStatut(sid){
  const s=statById(sid);if(!s)return;
  LF.status=sid;
  LF.prod=DASH_OP||'';      // on conserve le filtre opération du tableau de bord
  LF.q='';LF.src='';LF.user='';LF.sousstatut='';LF.zone='';LF.crmDevis='';
  go(s.phase==='client'?'clients':'leads');
}
/* ============================================================
   DOCUMENTS ADMINISTRATIFS
   Arborescence de dossiers et de fichiers, facon explorateur.
   Les metadonnees vivent dans docs_admin, les fichiers dans le
   bucket Storage sous le prefixe docs_admin/.
   ============================================================ */
let DA_DOSSIER=null;   // dossier courant (null = racine)
let DA_Q='',DA_FOCUS=null;
const getDocsAdmin=()=>load('egncrm_docs_admin',[]);
function saveDocsAdmin(items){save('egncrm_docs_admin',items);}
function daEnfants(parent){
  const q=DA_Q.toLowerCase();
  return getDocsAdmin()
    .filter(x=>q?(x.nom||'').toLowerCase().includes(q):(x.parent||null)===(parent||null))
    .sort((a,b)=>(a.type===b.type)?(a.nom||'').localeCompare(b.nom||''):(a.type==='dossier'?-1:1));
}
function daChemin(id){
  const items=getDocsAdmin();const out=[];let cur=id;
  while(cur){const d=items.find(x=>x.id===cur);if(!d)break;out.unshift(d);cur=d.parent||null;}
  return out;
}
function daOuvrir(id){DA_DOSSIER=id||null;DA_Q='';renderDocsAdmin();}
function setDaQ(el){
  DA_Q=el.value;DA_FOCUS=el.selectionStart||0;
  renderDocsAdmin();
  const i=document.getElementById('da_q');
  if(i&&DA_FOCUS!==null){i.focus();try{i.setSelectionRange(DA_FOCUS,DA_FOCUS);}catch(e){}}
  DA_FOCUS=null;
}
function daTailleLisible(o){
  if(!o)return '';
  if(o<1024)return o+' o';
  if(o<1048576)return Math.round(o/1024)+' Ko';
  return (o/1048576).toFixed(1).replace('.',',')+' Mo';
}
function daIcone(x){
  if(x.type==='dossier')return '📁';
  const e=(x.nom||'').split('.').pop().toLowerCase();
  if(['pdf'].includes(e))return '📕';
  if(['doc','docx','odt'].includes(e))return '📘';
  if(['xls','xlsx','csv','ods'].includes(e))return '📗';
  if(['ppt','pptx'].includes(e))return '📙';
  if(['png','jpg','jpeg','gif','webp','heic'].includes(e))return '🖼️';
  if(['zip','rar','7z'].includes(e))return '🗜️';
  return '📄';
}
function nouveauDossierAdmin(){
  const nom=prompt('Nom du dossier :');
  if(!nom||!nom.trim())return;
  const items=getDocsAdmin();
  items.push({id:uid(),type:'dossier',nom:nom.trim(),parent:DA_DOSSIER||null,
              created:Date.now(),user:(ME.prenom+' '+ME.nom).trim()||ME.code});
  saveDocsAdmin(items);renderDocsAdmin();toast('Dossier créé ✓','ok');
}
function renommerDocAdmin(id){
  const items=getDocsAdmin();const x=items.find(i=>i.id===id);if(!x)return;
  const nom=prompt('Nouveau nom :',x.nom||'');
  if(!nom||!nom.trim())return;
  x.nom=nom.trim();x.updated=Date.now();
  saveDocsAdmin(items);renderDocsAdmin();toast('Renommé ✓','ok');
}
function supprimerDocAdmin(id){
  const items=getDocsAdmin();const x=items.find(i=>i.id===id);if(!x)return;
  // Un dossier n'est supprimable que s'il est vide
  if(x.type==='dossier'){
    const n=items.filter(i=>(i.parent||null)===id).length;
    if(n){toast(`Ce dossier contient ${n} élément${n>1?'s':''} — videz-le d'abord`,'err');return;}
  }
  modalConfirm(x.type==='dossier'?'Supprimer ce dossier ?':'Supprimer ce fichier ?',
    esc(x.nom||''),async()=>{
      if(x.path){try{await SUPA.storage.from(ATTACH_BUCKET).remove([x.path]);}catch(e){console.error('[docs_admin]',e);}}
      saveDocsAdmin(getDocsAdmin().filter(i=>i.id!==id));
      deleteRemoteRow('egncrm_docs_admin',id);
      renderDocsAdmin();toast('Supprimé ✓','ok');
    });
}
async function deposerDocsAdmin(input){
  const fichiers=[...(input.files||[])];
  if(!fichiers.length)return;
  const items=getDocsAdmin();
  let ok=0;
  for(const file of fichiers){
    try{
      const fid=uid();
      const path=`docs_admin/${fid}-${file.name}`.replace(/[^a-zA-Z0-9/_.\-]/g,'_');
      const{error}=await SUPA.storage.from(ATTACH_BUCKET).upload(path,file,{upsert:true});
      if(error)throw error;
      items.push({id:fid,type:'fichier',nom:file.name,parent:DA_DOSSIER||null,path,
                  taille:file.size,mime:file.type||'',created:Date.now(),
                  user:(ME.prenom+' '+ME.nom).trim()||ME.code});
      ok++;
    }catch(e){
      console.error('[docs_admin upload]',e);
      toast('Échec sur '+file.name+' : '+(e.message||e),'err');
    }
  }
  if(ok){saveDocsAdmin(items);toast(`${ok} fichier${ok>1?'s':''} déposé${ok>1?'s':''} ✓`,'ok');}
  input.value='';
  renderDocsAdmin();
}
function renderDocsAdmin(){
  const peutEditer=can('docs_admin_edit');
  const chemin=daChemin(DA_DOSSIER);
  const enfants=daEnfants(DA_DOSSIER);
  const tous=getDocsAdmin();
  const nbF=tous.filter(x=>x.type==='fichier').length;
  const poids=tous.reduce((s,x)=>s+(x.taille||0),0);

  document.getElementById('pageActions').innerHTML=peutEditer
    ?`<button class="btn btn-ghost" onclick="nouveauDossierAdmin()">📁 Nouveau dossier</button>
      <label class="btn btn-pri" style="cursor:pointer">⬆️ Déposer des fichiers<input type="file" multiple style="display:none" onchange="deposerDocsAdmin(this)"></label>`
    :'';

  const fs="font-family:'Saira',sans-serif;font-size:.8rem;border:1.5px solid var(--border-grey);border-radius:8px;padding:.35rem .65rem;background:#fff;outline:none";
  let h=`<div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-bottom:.9rem">
    <div style="display:flex;align-items:center;gap:.3rem;flex-wrap:wrap;flex:1;min-width:200px">
      <span class="dossier-tag" style="cursor:pointer" onclick="daOuvrir(null)">🏠 Racine</span>
      ${chemin.map(d=>`<span style="color:var(--text-mut)">›</span><span class="dossier-tag" style="cursor:pointer" onclick="daOuvrir('${d.id}')">${esc(d.nom)}</span>`).join('')}
    </div>
    <input id="da_q" type="text" value="${esc(DA_Q)}" placeholder="🔍 Rechercher dans tous les dossiers…" oninput="setDaQ(this)" style="${fs};min-width:210px">
    ${DA_Q?`<button class="btn btn-ghost btn-sm" style="font-size:.72rem" onclick="DA_Q='';renderDocsAdmin()">✕</button>`:''}
    <span class="muted" style="font-size:.74rem">${nbF} fichier${nbF>1?'s':''} · ${daTailleLisible(poids)}</span>
  </div>`;

  if(DA_Q)h+=`<p class="muted" style="font-size:.78rem;margin-bottom:.6rem">Résultats dans l'ensemble des dossiers.</p>`;

  if(!enfants.length){
    h+=`<div class="empty"><div class="big">🗂️</div>${DA_Q?'Aucun résultat.':'Ce dossier est vide.'}
      ${peutEditer&&!DA_Q?'<br><span class="muted" style="font-size:.82rem">Créez un dossier ou déposez des fichiers avec les boutons en haut à droite.</span>':''}</div>`;
    document.getElementById('content').innerHTML=h;return;
  }

  h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th style="width:38px"></th><th>Nom</th><th>Ajouté par</th><th>Date</th><th class="r">Taille</th><th class="r">Actions</th>
  </tr></thead><tbody>`;
  enfants.forEach(x=>{
    const estDossier=x.type==='dossier';
    const nb=estDossier?getDocsAdmin().filter(i=>(i.parent||null)===x.id).length:0;
    h+=`<tr>
      <td style="font-size:1.1rem;text-align:center">${daIcone(x)}</td>
      <td>
        <span style="font-weight:700;cursor:pointer" onclick="${estDossier?`daOuvrir('${x.id}')`:`openAttachment('${esc(x.path||'')}','')`}">${esc(x.nom||'')}</span>
        ${estDossier?`<span class="muted" style="font-size:.7rem"> — ${nb} élément${nb>1?'s':''}</span>`:''}
        ${DA_Q&&(x.parent||null)?`<div class="muted" style="font-size:.68rem">dans ${esc((daChemin(x.parent).map(d=>d.nom).join(' › '))||'Racine')}</div>`:''}
      </td>
      <td class="muted" style="font-size:.78rem">${esc(x.user||'—')}</td>
      <td class="muted" style="font-size:.78rem">${x.created?new Date(x.created).toLocaleDateString('fr-FR'):'—'}</td>
      <td style="text-align:right" class="muted">${estDossier?'—':daTailleLisible(x.taille)}</td>
      <td style="text-align:right"><div class="row-act" style="justify-content:flex-end">
        ${estDossier?`<button class="iconbtn" title="Ouvrir" onclick="daOuvrir('${x.id}')">📂</button>`
                    :`<button class="iconbtn" title="Ouvrir le fichier" onclick="openAttachment('${esc(x.path||'')}','')">👁️</button>`}
        ${peutEditer?`<button class="iconbtn" title="Renommer" onclick="renommerDocAdmin('${x.id}')">✏️</button>
                      <button class="iconbtn del" title="Supprimer" onclick="supprimerDocAdmin('${x.id}')">🗑️</button>`:''}
      </div></td>
    </tr>`;
  });
  h+=`</tbody></table></div>`;
  document.getElementById('content').innerHTML=h;
}
function renderDash(){
  const sts=getStatuses(),users=getUsers();
  // Filtre par operation : les indicateurs et le pipeline s'y adaptent
  const recs=visibleRecs().filter(r=>!DASH_OP||r.productId===DASH_OP);
  const idsDash=new Set(recs.map(r=>r.id));
  const rdvs=getRdvs().filter(rd=>!DASH_OP||idsDash.has(rd.recordId));
  const wonIds=sts.filter(s=>s.won).map(s=>s.id);
  const won=recs.filter(r=>wonIds.includes(r.statusId)).length;
  const conv=recs.length?Math.round(won/recs.length*100):0;
  // Recalcul dynamique de la date du jour à chaque rendu
  const now=new Date();
  const todayStr=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  const visRdvs=rdvs.filter(rdvVisible);
  const todayTs=new Date(todayStr+'T00:00:00').getTime();
  const upcoming=visRdvs.filter(r=>{
    if(!r.date)return false;
    const d=String(r.date).trim();
    let iso=d;
    if(d.includes('/')){const p=d.split('/');iso=p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');}
    else if(d.length<=5){return false;}
    const rdvTs=new Date(iso+'T00:00:00').getTime();
    return !isNaN(rdvTs)&&rdvTs>=todayTs;
  }).sort((a,b)=>((a.date||'')+(a.heure||'')).localeCompare((b.date||'')+(b.heure||'')));
  const dashList=upcoming.slice(0,8);
  const actives=users.filter(u=>u.active&&(u.role==='telepro'||u.role==='commercial')).length;
  // pipeline counts
  const counts={};sts.forEach(s=>counts[s.id]=0);recs.forEach(r=>{if(counts[r.statusId]!=null)counts[r.statusId]++;});
  const maxC=Math.max(1,...Object.values(counts));

  let h=dashOpBar();
  h+=`<div class="kpis">
    <div class="kpi"><div class="kico">👥</div><div class="klab">Leads totaux</div><div class="kval">${recs.length}</div><div class="ksub">tous statuts</div></div>
    <div class="kpi"><div class="kico">📅</div><div class="klab">RDV à venir</div><div class="kval">${upcoming.length}</div><div class="ksub">${visRdvs.length} au total</div></div>
    <div class="kpi accent"><div class="kico">✅</div><div class="klab">Taux de conversion</div><div class="kval">${conv}%</div><div class="ksub">${won} installé${won>1?'s':''}</div></div>
    <div class="kpi"><div class="kico">🧑‍💼</div><div class="klab">Commerciaux / Télépros</div><div class="kval">${actives}</div><div class="ksub">actifs</div></div>
  </div>
  <div class="grid2">
    <div class="panel"><div class="panel-h"><h3>Pipeline commercial</h3></div><div class="panel-b">`;
  sts.forEach(s=>{
    const n=counts[s.id]||0;
    const cliquable=n>0;
    h+=`<div class="pipe-row" ${cliquable?`onclick="dashOuvrirStatut('${s.id}')" style="cursor:pointer" title="Voir les ${n} dossier${n>1?'s':''} à ce statut"`:''}>
      <div class="pl"><span class="pdot" style="background:${s.color}"></span>${esc(s.name)}</div>
      <div class="pbar"><div class="pfill" style="width:${n/maxC*100}%;background:${s.color}"></div></div>
      <div class="pn">${n}${cliquable?' <span style="color:var(--blue);font-weight:700">›</span>':''}</div>
    </div>`;
  });
  h+=`</div></div>
    <div class="panel"><div class="panel-h"><h3>Prochains RDV</h3></div><div class="panel-b">`;
  if(!dashList.length){h+=`<div class="empty"><div class="big">🗓️</div>Aucun RDV à venir</div>`;}
  else{h+=`<div class="rdv-list">`;dashList.forEach(r=>{const s=statById(r.statusId);const col=s?s.color:'#7CC242';
    h+=`<div class="rdv-card" style="border-left-color:${col}" onclick="openRdv('${r.id}')"><div class="rt"><span class="rn">${esc(r.client||'RDV')}</span><span class="rtime">${fmtDate(r.date)} ${r.heure||''}</span></div><div class="rm">${esc(r.type||'')}${r.ville?' • '+esc(r.ville):''}${rdvWho(r)?' • '+esc(rdvWho(r)):''}</div></div>`;});h+=`</div>`;}
  h+=`</div></div></div>`;

  // répartition par source
  const srcMap={};getSources().forEach(s=>srcMap[s.id]=0);recs.forEach(r=>{if(srcMap[r.sourceId]!=null)srcMap[r.sourceId]++;});
  const srcArr=getSources().map(s=>({n:s.name,c:srcMap[s.id]||0})).filter(x=>x.c>0).sort((a,b)=>b.c-a.c);
  if(srcArr.length){const tot=srcArr.reduce((a,b)=>a+b.c,0);
    h+=`<div class="panel"><div class="panel-h"><h3>Répartition par source</h3></div><div class="panel-b">`;
    srcArr.forEach(s=>{h+=`<div class="pipe-row"><div class="pl">${esc(s.n)}</div><div class="pbar"><div class="pfill" style="width:${s.c/tot*100}%;background:var(--green)"></div></div><div class="pn">${s.c}</div></div>`;});
    h+=`</div></div>`;}
  document.getElementById('content').innerHTML=h;
}
function fmtDate(d){if(!d)return '';const p=d.split('-');if(p.length!==3)return d;const year=parseInt(p[0]);const curYear=new Date().getFullYear();return year!==curYear?`${p[2]}/${p[1]}/${p[0]}`:`${p[2]}/${p[1]}`;}
function fmtDateLong(d){if(!d)return '';const dt=new Date(d);return dt.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});}

