/* ============================================================
   EGN CRM — modules/21-stock.js
   Module stock : état, mouvements, catalogue, transferts de matériel
   ============================================================ */
/* ====================================================================
   PARAMÈTRES
   ==================================================================== */
let SETTAB='statuts';
/* ============================================================
   MODULE STOCK v2 — État, Mouvements, Catalogue
   Fournisseurs multiples par matériel, détail par dossier,
   localisation circulant, sorties auto depuis dossiers
   ============================================================ */
const STOCK_TYPES={
  stock_fixe:{label:'Stock fixe',icon:'📦',desc:'Acheté en amont, déduit à chaque installation'},
  commande:{label:'À la commande',icon:'🛒',desc:'Commandé uniquement quand l\'installation est placée'},
  circulant:{label:'Stock circulant',icon:'🔄',desc:'Matériel qui tourne de chantier en chantier'}
};
let STOCK_TAB='etat';
let STOCK_LOADED=false;
let STOCK_DRAFT=null;

function getAllMats(){return load('egncrm_materiels',[]);}
function getMats(){return getAllMats().filter(m=>segOf(m)===SEGMENT);}
function getAllMvts(){return load('egncrm_stock_mvt',[]);}
function getMvts(){const ids=new Set(getMats().map(m=>m.id));return getAllMvts().filter(v=>ids.has(v.materielId));}

async function renderStock(){
  if(!STOCK_LOADED){
    document.getElementById('content').innerHTML='<div class="empty"><div class="big">⏳</div>Chargement du stock…</div>';
    STOCK_LOADED=true;
  }
  const tabs=[['etat','État du stock','stock_etat'],['mouvements','Mouvements','stock_mouvements'],['catalogue','Catalogue matériels','stock_catalogue']].filter(t=>can(t[2]));
  if(!tabs.length){document.getElementById('content').innerHTML=`<div class="empty"><div class="big">🔒</div>Aucun onglet du stock ne vous est accessible.</div>`;return;}
  if(!tabs.some(t=>t[0]===STOCK_TAB))STOCK_TAB=tabs[0][0];
  let h=segBanner();
  h+=`<div class="tabs">`+tabs.map(t=>`<button class="tab ${STOCK_TAB===t[0]?'act':''}" onclick="STOCK_TAB='${t[0]}';renderStock()">${t[1]}</button>`).join('')+`</div><div id="stockBody"></div>`;
  document.getElementById('content').innerHTML=h;
  if(STOCK_TAB==='etat')renderStockEtat();
  else if(STOCK_TAB==='mouvements')renderStockMouvements();
  else renderStockCatalogue();
}

/* ---- Calcul sorties automatiques depuis dossiers ---- */
function calcSortiesAuto(mat){
  const champs=[].concat(mat.champsDossier||mat.champDossier||[]).filter(Boolean);
  const triggerIds=[].concat(mat.statutsDeclencheur||mat.statutDeclencheur||[]).filter(Boolean);
  if(!champs.length||!triggerIds.length)return 0;
  const stats=getStatuses();
  const triggerOrders=triggerIds.map(id=>{const s=stats.find(x=>x.id===id);return s?s.order??999:999;});
  const minOrder=Math.min(...triggerOrders);
  const fournisseursMat=(mat.fournisseurs||[]).map(f=>f.nom).filter(Boolean);
  const recs=getRecs().filter(r=>{
    if(mat.operationId&&r.productId!==mat.operationId)return false;
    const s=stats.find(x=>x.id===r.statusId);
    if(!s||(s.order??999)<minOrder)return false;
    // Filtre strict : le dossier DOIT avoir un fournisseur renseigné correspondant à ce matériel
    if(!r.fournisseurDossier)return false;
    return fournisseursMat.includes(r.fournisseurDossier);
  });
  let total=0;
  recs.forEach(r=>{
    if(!r.opFields)return;
    champs.forEach(champId=>{
      let val=r.opFields[champId];
      if(val==null){
        const op=getAllProducts().find(p=>p.id===r.productId);
        const field=(op?op.fields||[]:[] ).find(f=>f.key===champId||f.label===champId);
        if(field)val=r.opFields[field.id];
      }
      total+=parseFloat(val)||0;
    });
  });
  return Math.round(total*100)/100;
}

/* Dossiers contribuant aux sorties auto pour un matériel */
function getDossiersSorties(mat){
  const champs=[].concat(mat.champsDossier||mat.champDossier||[]).filter(Boolean);
  const triggerIds=[].concat(mat.statutsDeclencheur||mat.statutDeclencheur||[]).filter(Boolean);
  if(!champs.length||!triggerIds.length)return [];
  const stats=getStatuses();
  const triggerOrders=triggerIds.map(id=>{const s=stats.find(x=>x.id===id);return s?s.order??999:999;});
  const minOrder=Math.min(...triggerOrders);
  const fournisseursMat=(mat.fournisseurs||[]).map(f=>f.nom).filter(Boolean);
  return getRecs().filter(r=>{
    if(mat.operationId&&r.productId!==mat.operationId)return false;
    const s=stats.find(x=>x.id===r.statusId);
    if(!s||(s.order??999)<minOrder)return false;
    if(!r.fournisseurDossier)return false;
    return fournisseursMat.includes(r.fournisseurDossier);
  }).map(r=>{
    let qte=0;
    if(r.opFields){
      champs.forEach(champId=>{
        let val=r.opFields[champId];
        if(val==null){
          const op=getAllProducts().find(p=>p.id===r.productId);
          const field=(op?op.fields||[]:[] ).find(f=>f.key===champId||f.label===champId);
          if(field)val=r.opFields[field.id];
        }
        qte+=parseFloat(val)||0;
      });
    }
    // Trouver le fournisseur utilisé (depuis les entrées précédant ce dossier)
    return{r,qte};
  }).filter(x=>x.qte>0).sort((a,b)=>(b.r.updated||0)-(a.r.updated||0));
}

/* ---- ÉTAT DU STOCK ---- */
/* ---- FILTRES STOCK ---- */
const STOCK_FILTERS={
  etat:{q:'',op:'',type:'',fourn:'',statut:''},
  mvt:{q:'',mat:'',op:'',sens:'',fourn:'',du:'',au:''},
  cat:{q:'',op:'',type:'',fourn:''}
};
let STOCK_FOCUS_ID=null,STOCK_FOCUS_POS=0;
function setStockFilter(tab,key,el){
  STOCK_FILTERS[tab][key]=el.value;
  if(el.tagName==='INPUT'&&el.type==='text'){STOCK_FOCUS_ID=el.id;STOCK_FOCUS_POS=el.selectionStart||0;}
  else STOCK_FOCUS_ID=null;
  renderStock();
}
function resetStockFilter(tab){Object.keys(STOCK_FILTERS[tab]).forEach(k=>STOCK_FILTERS[tab][k]='');STOCK_FOCUS_ID=null;renderStock();}
function stockFilterActive(tab){return Object.values(STOCK_FILTERS[tab]).some(v=>v);}
function restoreStockFocus(){
  if(!STOCK_FOCUS_ID)return;
  const el=document.getElementById(STOCK_FOCUS_ID);
  if(el){el.focus();try{el.setSelectionRange(STOCK_FOCUS_POS,STOCK_FOCUS_POS);}catch(e){}}
  STOCK_FOCUS_ID=null;
}
const FSTY="font-family:'Saira',sans-serif;font-size:.78rem;border:1.5px solid var(--border-grey);border-radius:8px;padding:.32rem .6rem;background:#fff;outline:none";
function allFournNames(){return [...new Set(getMats().flatMap(m=>(m.fournisseurs||[]).map(f=>f.nom).filter(Boolean)))].sort();}
function allOpNames(){return [...new Set(getMats().map(m=>m.operation).filter(Boolean))].sort();}
function stockStateOf(m,mvts){
  const e=mvts.filter(v=>v.materielId===m.id&&v.sens==='entree').reduce((s,v)=>s+(v.qte||0),0);
  const so=mvts.filter(v=>v.materielId===m.id&&v.sens==='sortie').reduce((s,v)=>s+(v.qte||0),0)+calcSortiesAuto(m);
  const stock=e-so;
  return{entrees:e,sorties:so,stock,alerte:!!(m.seuilAlerte&&stock<=m.seuilAlerte)};
}
function optList(items,cur){return items.map(v=>`<option value="${esc(v)}" ${cur===v?'selected':''}>${esc(v)}</option>`).join('');}
function stockResetBtn(tab){return stockFilterActive(tab)?`<button class="btn btn-ghost btn-sm" style="font-size:.72rem" onclick="resetStockFilter('${tab}')">✕ Réinitialiser</button>`:'';}
function stockFilterBar(tab){
  const F=STOCK_FILTERS[tab];
  const typeOpts=Object.entries(STOCK_TYPES).map(([k,v])=>`<option value="${k}" ${F.type===k?'selected':''}>${v.icon} ${v.label}</option>`).join('');
  let h=`<div style="display:flex;gap:.45rem;flex-wrap:wrap;align-items:center;margin-bottom:.9rem">`;
  h+=`<input id="fl_${tab}_q" type="text" value="${esc(F.q||'')}" placeholder="🔍 Rechercher…" oninput="setStockFilter('${tab}','q',this)" style="${FSTY};flex:1;min-width:160px">`;
  if(tab==='mvt'){
    h+=`<select onchange="setStockFilter('mvt','mat',this)" style="${FSTY}"><option value="">Tous les matériels</option>${getMats().map(m=>`<option value="${m.id}" ${F.mat===m.id?'selected':''}>${esc(m.nom)}</option>`).join('')}</select>`;
    h+=`<select onchange="setStockFilter('mvt','op',this)" style="${FSTY}"><option value="">Toutes les opérations</option>${optList(allOpNames(),F.op)}</select>`;
    h+=`<select onchange="setStockFilter('mvt','sens',this)" style="${FSTY}"><option value="">Tous les types</option>
      <option value="entree" ${F.sens==='entree'?'selected':''}>📥 Entrée</option>
      <option value="sortie" ${F.sens==='sortie'?'selected':''}>📤 Sortie</option>
      <option value="commande" ${F.sens==='commande'?'selected':''}>🛒 Commande</option>
      <option value="reception" ${F.sens==='reception'?'selected':''}>✅ Réception</option>
      <option value="localisation" ${F.sens==='localisation'?'selected':''}>📍 Localisation</option></select>`;
  } else {
    h+=`<select onchange="setStockFilter('${tab}','op',this)" style="${FSTY}"><option value="">Toutes les opérations</option>${optList(allOpNames(),F.op)}</select>`;
    h+=`<select onchange="setStockFilter('${tab}','type',this)" style="${FSTY}"><option value="">Tous les types</option>${typeOpts}</select>`;
  }
  h+=`<select onchange="setStockFilter('${tab}','fourn',this)" style="${FSTY}"><option value="">Tous les fournisseurs</option>${optList(allFournNames(),F.fourn)}</select>`;
  if(tab==='etat'){
    h+=`<select onchange="setStockFilter('etat','statut',this)" style="${FSTY}"><option value="">Tous les statuts</option>
      <option value="ok" ${F.statut==='ok'?'selected':''}>✅ Stock OK</option>
      <option value="alerte" ${F.statut==='alerte'?'selected':''}>⚠️ Stock bas</option>
      <option value="epuise" ${F.statut==='epuise'?'selected':''}>⛔ Épuisé / négatif</option></select>`;
  }
  if(tab==='mvt'){
    h+=`<label style="font-size:.72rem;color:var(--text-mut);font-weight:600">Du</label><input type="date" value="${esc(F.du||'')}" onchange="setStockFilter('mvt','du',this)" style="${FSTY}">`;
    h+=`<label style="font-size:.72rem;color:var(--text-mut);font-weight:600">Au</label><input type="date" value="${esc(F.au||'')}" onchange="setStockFilter('mvt','au',this)" style="${FSTY}">`;
  }
  h+=stockResetBtn(tab);
  h+=`</div>`;
  return h;
}
function filterMats(mats,tab,mvts){
  const F=STOCK_FILTERS[tab];
  return mats.filter(m=>{
    if(F.q){const q=F.q.toLowerCase();if(!`${m.nom||''} ${m.reference||''} ${m.operation||''}`.toLowerCase().includes(q))return false;}
    if(F.op&&m.operation!==F.op)return false;
    if(F.type&&(m.typeStock||'stock_fixe')!==F.type)return false;
    if(F.fourn&&!(m.fournisseurs||[]).some(f=>f.nom===F.fourn))return false;
    if(F.statut&&mvts){
      const st=stockStateOf(m,mvts);
      if(F.statut==='epuise'&&st.stock>0)return false;
      if(F.statut==='alerte'&&!(st.alerte&&st.stock>0))return false;
      if(F.statut==='ok'&&(st.alerte||st.stock<=0))return false;
    }
    return true;
  });
}

/* Coût unitaire moyen pondéré, calculé sur les achats réels (remise et frais inclus) */
function coutUnitaireMoyen(m,mvts){
  const ent=mvts.filter(v=>v.materielId===m.id&&['entree','reception'].includes(v.sens));
  const qte=ent.reduce((s,v)=>s+(v.qte||0),0);
  const ht=ent.reduce((s,v)=>s+(v.totalHT||0),0);
  if(qte&&ht)return ht/qte;
  if(m.prixUnitaire)return m.prixUnitaire;
  const px=(m.fournisseurs||[]).map(f=>parseFloat(f.prix)||0).filter(Boolean);
  return px.length?px.reduce((s,p)=>s+p,0)/px.length:0;
}
function renderStockEtat(){
  const mats=getMats();const mvts=getMvts();
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  let h='';
  if(!mats.length){
    h=`<div class="empty"><div class="big">📦</div>Aucun matériel dans le catalogue.<br><button class="btn btn-pri" style="margin-top:.8rem" onclick="STOCK_TAB='catalogue';renderStock()">+ Ajouter un matériel</button></div>`;
    document.getElementById('stockBody').innerHTML=h;return;
  }
  // Filtrage d'abord : les indicateurs portent sur la sélection affichée
  const matsF=filterMats(mats,'etat',mvts);
  const idsF=new Set(matsF.map(m=>m.id));
  const mvtsF=mvts.filter(v=>idsF.has(v.materielId));
  const filtre=stockFilterActive('etat');
  // KPIs sur la sélection
  const nbAlertes=matsF.filter(m=>{
    if(m.typeStock==='circulant'||m.typeStock==='commande')return false;
    const e=mvts.filter(v=>v.materielId===m.id&&v.sens==='entree').reduce((s,v)=>s+(v.qte||0),0);
    const s=mvts.filter(v=>v.materielId===m.id&&v.sens==='sortie').reduce((s,v)=>s+(v.qte||0),0)+calcSortiesAuto(m);
    return m.seuilAlerte&&(e-s)<=m.seuilAlerte;
  }).length;
  const valeurTot=matsF.reduce((s,m)=>{
    if(m.typeStock==='commande')return s;
    const e=mvts.filter(v=>v.materielId===m.id&&v.sens==='entree').reduce((acc,v)=>acc+(v.qte||0),0);
    const so=mvts.filter(v=>v.materielId===m.id&&v.sens==='sortie').reduce((acc,v)=>acc+(v.qte||0),0)+calcSortiesAuto(m);
    const reste=m.typeStock==='circulant'?e:Math.max(0,e-so);
    return s+reste*coutUnitaireMoyen(m,mvts);
  },0);
  const achats=mvtsF.filter(v=>['entree','reception'].includes(v.sens));
  const totalAchete=achats.reduce((s,v)=>s+(v.totalHT||0),0);
  const qteAchetee=achats.reduce((s,v)=>s+(v.qte||0),0);
  const valeurConsommee=Math.max(0,totalAchete-valeurTot);
  const nbFourn=new Set(matsF.flatMap(m=>(m.fournisseurs||[]).map(f=>f.nom).filter(Boolean))).size;
  const scope=filtre?`<span style="color:var(--green-deep)">sélection filtrée</span>`:'tous matériels';
  h+=`<div class="kpis">
    <div class="kpi"><div class="kico">📦</div><div class="klab">Matériels</div><div class="kval">${matsF.length}${filtre?`<span style="font-size:.8rem;font-weight:600;color:var(--text-mut)"> / ${mats.length}</span>`:''}</div><div class="ksub">${nbFourn} fournisseur${nbFourn>1?'s':''} · ${scope}</div></div>
    <div class="kpi" style="${nbAlertes?'border:1.5px solid rgba(230,57,70,.3)':''}"><div class="kico">${nbAlertes?'⚠️':'✅'}</div><div class="klab">Alertes stock bas</div><div class="kval" style="${nbAlertes?'color:var(--coral)':'color:var(--green-deep)'}">${nbAlertes}</div><div class="ksub">${nbAlertes?'matériel(s) à réapprovisionner':'Tout est OK'}</div></div>
    <div class="kpi"><div class="kico">🛒</div><div class="klab">Total acheté</div><div class="kval">${eur(totalAchete)}</div><div class="ksub">HT · ${qteAchetee.toLocaleString('fr-FR')} unités entrées</div></div>
    <div class="kpi accent"><div class="kico">💶</div><div class="klab">Valeur du stock restant</div><div class="kval">${eur(valeurTot)}</div><div class="ksub">HT · au coût moyen d'achat</div></div>
    <div class="kpi"><div class="kico">📤</div><div class="klab">Valeur consommée</div><div class="kval">${eur(valeurConsommee)}</div><div class="ksub">HT · sortie sur dossiers</div></div>
  </div>`;
  // Barre de filtres
  h+=stockFilterBar('etat');
  if(!matsF.length){
    h+=`<div class="empty"><div class="big">🔍</div>Aucun matériel ne correspond aux filtres.</div>`;
    document.getElementById('stockBody').innerHTML=h;restoreStockFocus();return;
  }
  // Un panel par matériel
  matsF.forEach(m=>{
    const stype=STOCK_TYPES[m.typeStock||'stock_fixe'];
    const entrees=mvts.filter(v=>v.materielId===m.id&&v.sens==='entree').reduce((s,v)=>s+(v.qte||0),0);
    const sortiesManuel=mvts.filter(v=>v.materielId===m.id&&v.sens==='sortie').reduce((s,v)=>s+(v.qte||0),0);
    const sortiesAuto=calcSortiesAuto(m);
    const sorties=sortiesManuel+sortiesAuto;
    const stock=entrees-sorties;
    const cuMoyen=coutUnitaireMoyen(m,mvts);
    const valeur=Math.max(0,stock)*cuMoyen;
    const alerte=m.seuilAlerte&&stock<=m.seuilAlerte;
    const totalHtEntrees=mvts.filter(v=>v.materielId===m.id&&v.sens==='entree').reduce((s,v)=>s+(v.totalHT||0),0);
    const locaux=mvts.filter(v=>v.materielId===m.id&&v.sens==='localisation').sort((a,b)=>(b.date||0)-(a.date||0));
    const curLoc=locaux[0]||null;
    const trigStatNames=(m.statutsDeclencheur||[]).map(id=>{const s=getAllStatuses().find(x=>x.id===id);return s?s.name:'';}).filter(Boolean).join(', ');
    const fourns=(m.fournisseurs||[]);
    const enCours=mvts.filter(v=>v.materielId===m.id&&v.sens==='commande'&&!v.recu).length;
    // Header couleur selon statut
    const panelStyle=alerte?'border:1.5px solid rgba(230,57,70,.35)':'';
    h+=`<div class="panel" style="${panelStyle}">
      <div class="panel-h">
        <span style="font-size:1.2rem">${stype.icon}</span>
        <div>
          <div style="font-weight:800;font-size:.95rem">${esc(m.nom)} ${alerte?'<span style="font-size:.72rem;background:#FEE8E8;color:#A32D2D;border-radius:6px;padding:2px 8px;margin-left:4px">⚠️ Stock bas</span>':''}</div>
          <div class="muted" style="font-size:.72rem">${esc(m.operation||'')} · ${stype.label}${m.reference?' · Réf: '+esc(m.reference):''}${m.seuilAlerte?' · Seuil: '+m.seuilAlerte+' '+esc(m.unite||'u'):''}</div>
        </div>
        <div class="sp">
          ${m.typeStock==='stock_fixe'?`<div style="text-align:right"><div style="font-size:1.4rem;font-weight:800;color:${alerte?'var(--coral)':stock>0?'var(--green-deep)':'var(--text-mut)'}">${stock} ${esc(m.unite||'u')}</div><div class="muted" style="font-size:.7rem">restant${stock>1?'s':''} · ${eur(valeur)} HT</div></div>`:''}
          ${m.typeStock==='commande'?`<div style="text-align:right"><div style="font-size:1.1rem;font-weight:800;color:var(--blue)">${enCours} en cours</div><div class="muted" style="font-size:.7rem">commande${enCours>1?'s':''} active${enCours>1?'s':''}</div></div>`:''}
          ${m.typeStock==='circulant'?`<div style="text-align:right"><div style="font-size:1rem;font-weight:800">${entrees} ${esc(m.unite||'u')}</div><div style="font-size:.7rem;color:var(--green-deep);margin-top:2px">${curLoc?'📍 '+esc(curLoc.lieu||'—'):'Non localisé'}</div></div>`:''}
          ${m.typeStock==='circulant'?`<button class="btn btn-ghost btn-sm" onclick="openLocModal('${m.id}')">🔄 Déplacer</button>`:`<button class="btn btn-pri btn-sm" onclick="openMvtModal(null,'${m.id}')">+ Entrée</button>`}
          <button class="btn btn-ghost btn-sm" onclick="toggleStockDetail('sd_${m.id}')">👁️ Dossiers</button>
        </div>
      </div>`;
    // Stats 4 colonnes
    if(m.typeStock==='stock_fixe'){
      h+=`<div style="display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--border-grey)">
        <div style="padding:.65rem 1.1rem;border-right:1px solid var(--border-grey)"><div class="muted" style="font-size:.65rem;margin-bottom:.2rem">ENTRÉES (achats)</div><div style="font-weight:800">${entrees} ${esc(m.unite||'u')}</div><div class="muted" style="font-size:.68rem">${eur(totalHtEntrees)} HT</div></div>
        <div style="padding:.65rem 1.1rem;border-right:1px solid var(--border-grey)"><div class="muted" style="font-size:.65rem;margin-bottom:.2rem">SORTIES AUTO${trigStatNames?' ('+esc(trigStatNames)+')':''}</div><div style="font-weight:800">${sortiesAuto} ${esc(m.unite||'u')}</div><div class="muted" style="font-size:.68rem">${getDossiersSorties(m).length} dossiers</div></div>
        <div style="padding:.65rem 1.1rem;border-right:1px solid var(--border-grey)"><div class="muted" style="font-size:.65rem;margin-bottom:.2rem">STOCK RESTANT</div><div style="font-weight:800;color:${alerte?'var(--coral)':stock>0?'var(--green-deep)':'var(--text-mut)'}">${stock} ${esc(m.unite||'u')}</div><div class="muted" style="font-size:.68rem">Valeur ${eur(valeur)} HT${cuMoyen?' · '+eur(cuMoyen)+'/u':''}</div></div>
        <div style="padding:.65rem 1.1rem"><div class="muted" style="font-size:.65rem;margin-bottom:.2rem">FOURNISSEURS</div>${fourns.length?fourns.map(f=>`<div style="font-size:.72rem"><span style="font-weight:700;color:var(--purple)">${esc(f.nom)}</span> <span class="muted">${eur(f.prix)}/u</span></div>`).join(''):'<span class="muted" style="font-size:.75rem">—</span>'}</div>
      </div>`;
    }
    // Détail dossiers (replié par défaut)
    h+=`<div id="sd_${m.id}" style="display:none">`;
    if(m.typeStock==='stock_fixe'){
      const dossiers=getDossiersSorties(m);
      h+=`<div style="padding:.6rem 1.1rem;background:#f8faf5;border-bottom:1px solid var(--border-grey);display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:.78rem;font-weight:700;color:var(--text-mut)">${dossiers.length} dossier${dossiers.length>1?'s':''} — ${(m.champsDossier||[]).map(id=>{const op=getAllProducts().find(p=>p.id===m.operationId);const f=op?(op.fields||[]).find(x=>x.id===id):null;return f?esc(f.label||f.key||id):id;}).join(' + ')}</span>
      </div>`;
      if(!dossiers.length){h+=`<div class="empty" style="padding:1rem"><div class="big" style="font-size:1.5rem">📋</div>Aucun dossier au statut déclencheur.</div>`;}
      else{
        dossiers.slice(0,20).forEach(({r,qte})=>{
          const stat=getAllStatuses().find(s=>s.id===r.statusId);
          // Trouver le dernier fournisseur utilisé avant ce dossier
          const mvtEntrees=getMvts().filter(v=>v.materielId===m.id&&v.sens==='entree'&&v.fournisseurNom).sort((a,b)=>(b.date||0)-(a.date||0));
          const fourn=r.fournisseurDossier||'';
          const fournBadge=`<span style="font-size:.7rem;font-weight:700;color:var(--purple);background:#EFE9FC;border-radius:5px;padding:1px 7px;flex-shrink:0">${esc(fourn)}</span>`;
          h+=`<div style="display:flex;align-items:center;gap:.8rem;padding:.55rem 1.1rem;border-bottom:1px solid var(--border-soft)">
            <span class="dossier-tag" style="cursor:pointer;flex-shrink:0" onclick="openDossier('${r.id}')">${esc(r.dossier||'—')}</span>
            <div style="flex:1"><div style="font-weight:700;font-size:.83rem">${esc(clientNameOf(r))}</div><div class="muted" style="font-size:.7rem">${esc(r.ville||'')}${stat?' · '+esc(stat.name):''}</div></div>
            ${fournBadge}
            <div style="text-align:right;flex-shrink:0"><div style="font-size:.95rem;font-weight:800;color:var(--green-deep)">${qte} ${esc(m.unite||'u')}</div><div class="muted" style="font-size:.65rem">${eur(qte*(m.prixUnitaire||0))} HT</div></div>
          </div>`;
        });
        if(dossiers.length>20)h+=`<div style="padding:.6rem 1.1rem;text-align:center;font-size:.78rem;color:var(--text-mut)">... et ${dossiers.length-20} autres dossiers</div>`;
      }
    } else if(m.typeStock==='circulant'){
      h+=`<div style="padding:.6rem 1.1rem;background:#f8faf5;border-bottom:1px solid var(--border-grey);display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:.78rem;font-weight:700;color:var(--text-mut)">Parcours du matériel — ${locaux.length} déplacement${locaux.length>1?'s':''}</span>
        <button class="btn btn-pri btn-sm" style="font-size:.7rem" onclick="openLocModal('${m.id}')">🔄 Nouveau transfert</button>
      </div>`;
      if(!locaux.length)h+=`<div class="empty" style="padding:1rem"><div class="big" style="font-size:1.5rem">📍</div>Aucun déplacement enregistré — le matériel est au dépôt.</div>`;
      else{
        locaux.slice(0,12).forEach((v,i)=>{
          const rTo=v.dossierId?recById(v.dossierId):null;
          const rFrom=v.fromId?recById(v.fromId):null;
          const chip=(r,label,col)=>r
            ?`<span class="dossier-tag" style="cursor:pointer;background:${col}1a;color:${col}" onclick="openDossier('${r.id}')">${esc(r.dossier||'—')}</span> <span style="font-weight:700;font-size:.8rem">${esc(clientNameOf(r))}</span>`
            :`<span style="font-size:.78rem;color:var(--text-mut)">🏬 ${esc(label||'Dépôt')}</span>`;
          h+=`<div style="display:flex;align-items:center;gap:.7rem;padding:.6rem 1.1rem;border-bottom:1px solid var(--border-soft);flex-wrap:wrap">
            <span style="font-size:.68rem;font-weight:800;${i===0?'background:#E6F7F0;color:#0F6E56':'background:#EEF0F2;color:#6b7785'};border-radius:5px;padding:2px 8px;flex-shrink:0">${i===0?'📍 Ici':'Passé'}</span>
            <div style="flex:1;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;min-width:220px">
              ${chip(rFrom,v.fromLieu,'#B96A0A')}
              <span style="color:var(--text-mut);font-weight:700">→</span>
              ${chip(rTo,v.lieu,'#2D7DD2')}
            </div>
            <div style="font-weight:700;font-size:.8rem;flex-shrink:0">${v.qte||entrees} ${esc(m.unite||'u')}</div>
            <div class="muted" style="font-size:.7rem;flex-shrink:0">${new Date(v.date).toLocaleDateString('fr-FR')}</div>
            ${v.notes?`<div class="muted" style="font-size:.68rem;width:100%;padding-left:3.2rem">${esc(v.notes)}</div>`:''}
          </div>`;
        });
      }
    } else if(m.typeStock==='commande'){
      const cmds=mvts.filter(v=>v.materielId===m.id&&v.sens==='commande').sort((a,b)=>(b.date||0)-(a.date||0));
      h+=`<div style="padding:.6rem 1.1rem;background:#f8faf5;border-bottom:1px solid var(--border-grey)"><span style="font-size:.78rem;font-weight:700;color:var(--text-mut)">${cmds.length} commande${cmds.length>1?'s':''}</span></div>`;
      if(!cmds.length)h+=`<div class="empty" style="padding:1rem"><div class="big" style="font-size:1.5rem">🛒</div>Aucune commande.</div>`;
      else cmds.slice(0,10).forEach(v=>{
        const r=v.dossierId?recById(v.dossierId):null;
        h+=`<div style="display:flex;align-items:center;gap:.8rem;padding:.55rem 1.1rem;border-bottom:1px solid var(--border-soft)">
          <span style="font-size:.7rem;font-weight:700;${v.recu?'background:#E6F7F0;color:#0F6E56':'background:#FFF4E5;color:#B96A0A'};border-radius:5px;padding:1px 7px;flex-shrink:0">${v.recu?'✅ Reçue':'⏳ En attente'}</span>
          ${r?`<span class="dossier-tag" style="cursor:pointer;flex-shrink:0" onclick="openDossier('${r.id}')">${esc(r.dossier||'—')}</span><div style="flex:1;font-weight:700;font-size:.83rem">${esc(clientNameOf(r))}</div>`:`<div style="flex:1" class="muted">—</div>`}
          ${v.fournisseurNom?`<span style="font-size:.7rem;font-weight:700;color:var(--purple);background:#EFE9FC;border-radius:5px;padding:1px 7px;flex-shrink:0">${esc(v.fournisseurNom)}</span>`:''}
          <div class="muted" style="font-size:.7rem;flex-shrink:0">${new Date(v.date).toLocaleDateString('fr-FR')}</div>
          <div style="font-weight:700;font-size:.82rem;flex-shrink:0">${v.qte||1} ${esc(m.unite||'u')} · ${eur(v.totalHT||0)} HT</div>
          ${!v.recu?`<button class="btn btn-ghost btn-sm" onclick="marquerCommandeRecue('${v.id}')">✅ Reçue</button>`:''}
        </div>`;
      });
    }
    h+=`</div></div>`;
  });
  h+=`<div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:.5rem">
    <button class="btn btn-ghost btn-sm" onclick="STOCK_TAB='catalogue';renderStock()">⚙️ Gérer le catalogue</button>
    <button class="btn btn-navy btn-sm" onclick="exportStockCSV()">📤 Exporter</button>
  </div>`;
  document.getElementById('stockBody').innerHTML=h;
  restoreStockFocus();
}
function toggleStockDetail(id){const el=document.getElementById(id);if(el)el.style.display=el.style.display==='none'?'block':'none';}
async function marquerCommandeRecue(mvtId){
  const mvts=getMvts();const v=mvts.find(x=>x.id===mvtId);if(!v)return;
  v.recu=true;save('egncrm_stock_mvt',mergeSeg(getAllMvts(),mvts));renderStock();toast('Commande marquée comme reçue ✓','ok');
}

/* ---- MOUVEMENTS ---- */
function renderStockMouvements(){
  const mats=getMats();const mvts=getMvts().slice().reverse();
  const eur=n=>(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
  const sensLabels={entree:'📥 Entrée',sortie:'📤 Sortie',commande:'🛒 Commande',reception:'✅ Réception',localisation:'📍 Localisation'};
  const sensBg={entree:'background:#E6F7F0;color:#0F6E56',sortie:'background:#FFF4E5;color:#B96A0A',commande:'background:#E8F0FE;color:#1A5FD4',reception:'background:#EFF7E8;color:#3D7A1E',localisation:'background:#EFE9FC;color:#5B3AAA'};
  let h=`<div style="display:flex;justify-content:flex-end;margin-bottom:.7rem">
    ${can('stock_edit')?`<button class="btn btn-pri btn-sm" onclick="openMvtModal()">+ Nouveau mouvement</button>`:''}
  </div>`;
  if(!mvts.length){h+=`<div class="empty"><div class="big">📋</div>Aucun mouvement enregistré.</div>`;document.getElementById('stockBody').innerHTML=h;return;}
  h+=stockFilterBar('mvt');
  const F=STOCK_FILTERS.mvt;
  const mvtsF=mvts.filter(v=>{
    const mat=mats.find(m=>m.id===v.materielId);
    const rec=v.dossierId?recById(v.dossierId):null;
    if(F.mat&&v.materielId!==F.mat)return false;
    if(F.sens&&v.sens!==F.sens)return false;
    if(F.fourn&&v.fournisseurNom!==F.fourn)return false;
    if(F.op&&(!mat||mat.operation!==F.op))return false;
    if(F.du&&v.date<new Date(F.du+'T00:00:00').getTime())return false;
    if(F.au&&v.date>new Date(F.au+'T23:59:59').getTime())return false;
    if(F.q){
      const q=F.q.toLowerCase();
      const hay=[mat?mat.nom:'',mat?mat.reference:'',v.notes,v.lieu,v.fournisseurNom,rec?rec.dossier:'',rec?clientNameOf(rec):''].join(' ').toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });
  if(stockFilterActive('mvt')){
    const totHT=mvtsF.reduce((s,v)=>s+(v.totalHT||0),0);
    const totTva=mvtsF.reduce((s,v)=>s+(v.tvaRecup||0),0);
    h+=`<div style="display:flex;gap:1.2rem;flex-wrap:wrap;align-items:center;background:var(--bg-soft);border-radius:9px;padding:.5rem .9rem;margin-bottom:.7rem;font-size:.78rem">
      <span><b>${mvtsF.length}</b> mouvement${mvtsF.length>1?'s':''} sur ${mvts.length}</span>
      <span>Total HT : <b>${eur(totHT)}</b></span>
      <span>TVA récupérable : <b style="color:var(--green-deep)">${eur(totTva)}</b></span>
    </div>`;
  }
  const masques=mvts.length-mvtsF.length;
  if(masques>0)h+=`<div style="background:#FFF4E5;border:1.5px solid #F0C486;border-radius:9px;padding:.5rem .9rem;margin-bottom:.7rem;font-size:.8rem;display:flex;align-items:center;gap:.6rem">
    <span>🔍</span><span style="flex:1"><b>${masques}</b> mouvement${masques>1?'s':''} masqué${masques>1?'s':''} par les filtres</span>
    <button class="btn btn-ghost btn-sm" style="font-size:.72rem" onclick="resetStockFilter('mvt')">✕ Tout afficher</button>
  </div>`;
  if(!mvtsF.length){h+=`<div class="empty"><div class="big">🔍</div>Aucun mouvement ne correspond aux filtres.</div>`;document.getElementById('stockBody').innerHTML=h;restoreStockFocus();return;}
  h+=`<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Date</th><th>Matériel</th><th>Type</th><th>Fournisseur</th><th class="r">Qté</th><th class="r">Total HT</th><th class="r">TVA récup.</th><th>Dossier</th><th>Notes</th><th>Facture</th><th></th></tr></thead><tbody>`;
  mvtsF.forEach(v=>{
    const mat=mats.find(m=>m.id===v.materielId);
    const r=v.dossierId?recById(v.dossierId):null;
    h+=`<tr>
      <td class="muted">${new Date(v.date).toLocaleDateString('fr-FR')}</td>
      <td><div style="font-weight:700;font-size:.83rem">${mat?esc(mat.nom):'—'}</div></td>
      <td><span style="border-radius:6px;padding:2px 8px;font-size:.7rem;font-weight:700;${sensBg[v.sens]||''}">${sensLabels[v.sens]||v.sens}</span></td>
      <td>${v.fournisseurNom?`<span style="font-size:.75rem;font-weight:700;color:var(--purple)">${esc(v.fournisseurNom)}</span>`:'<span class="muted">—</span>'}</td>
      <td style="text-align:right;font-weight:700">${v.qte||'—'} ${mat?esc(mat.unite||''):''}</td>
      <td style="text-align:right">${v.totalHT?eur(v.totalHT)+(v.remise?`<div style="font-size:.65rem;color:var(--coral)">-${eur(v.remise)} remise</div>`:'')+(v.totalFraisHT?`<div class="muted" style="font-size:.65rem">dont ${eur(v.totalFraisHT)} frais</div>`:'')+`<div class="muted" style="font-size:.65rem">${eur(v.prixUnitaireHT||0)}/u</div>`:'<span class="muted">—</span>'}</td>
      <td style="text-align:right;font-weight:700;color:var(--green-deep)">${v.tvaRecup?eur(v.tvaRecup):'<span class="muted">—</span>'}</td>
      <td>${r?`<span class="dossier-tag" style="cursor:pointer" onclick="ouvrirLigne(event,'${r.id}',true)">${esc(r.dossier||'—')}</span><div class="muted" style="font-size:.7rem">${esc(clientNameOf(r))}</div>`:`<span class="muted">${esc(v.lieu||'—')}</span>`}</td>
      <td class="muted" style="font-size:.75rem">${esc(v.notes||'')}</td>
      <td>${v.factureUrl?`${attachLink(v.facturePath,v.factureNom||'Facture',v.factureUrl)}`:'<span class="muted" style="font-size:.72rem">—</span>'}</td>
      <td><div style="display:flex;gap:.3rem"><button class="iconbtn" onclick="editMvt('${v.id}')" title="Modifier">✏️</button><button class="iconbtn del" onclick="supprimerMvt('${v.id}')">🗑️</button></div></td>
    </tr>`;
  });
  h+=`</tbody></table></div>`;
  document.getElementById('stockBody').innerHTML=h;
  restoreStockFocus();
}

/* ---- CATALOGUE ---- */
function renderStockCatalogue(){
  const mats=getMats();
  let h=`<div style="display:flex;justify-content:flex-end;margin-bottom:.7rem">${can('stock_edit')?`<button class="btn btn-pri btn-sm" onclick="openMatModal()">+ Nouveau matériel</button>`:''}</div>`;
  if(!mats.length){h+=`<div class="empty"><div class="big">📦</div>Aucun matériel. Cliquez sur "+ Nouveau matériel".</div>`;document.getElementById('stockBody').innerHTML=h;return;}
  h+=stockFilterBar('cat');
  const matsF=filterMats(mats,'cat');
  if(stockFilterActive('cat'))h+=`<p class="muted" style="font-size:.75rem;margin-bottom:.6rem">${matsF.length} matériel${matsF.length>1?'s':''} sur ${mats.length}</p>`;
  if(!matsF.length){h+=`<div class="empty"><div class="big">🔍</div>Aucun matériel ne correspond aux filtres.</div>`;document.getElementById('stockBody').innerHTML=h;restoreStockFocus();return;}
  h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Matériel</th><th>Type</th><th>Opération</th><th>Champ(s) lu(s)</th><th>Statut(s) déclencheur</th><th>Fournisseurs</th><th>Unité</th><th>Seuil</th><th class="r">Actions</th>
  </tr></thead><tbody>`;
  matsF.forEach(m=>{
    const stype=STOCK_TYPES[m.typeStock||'stock_fixe'];
    const op=getAllProducts().find(p=>p.id===m.operationId||p.name===m.operation);
    const champs=[].concat(m.champsDossier||m.champDossier||[]).filter(Boolean);
    const champLabels=champs.map(cid=>{const f=op?(op.fields||[]).find(x=>x.id===cid):null;return f?esc(f.label||f.key||cid):cid;});
    const trigStatIds=[].concat(m.statutsDeclencheur||m.statutDeclencheur||[]).filter(Boolean);
    const trigStats=trigStatIds.map(id=>getAllStatuses().find(s=>s.id===id)).filter(Boolean);
    const fourns=(m.fournisseurs||[]);
    h+=`<tr>
      <td><div style="font-weight:700">${esc(m.nom)}</div><div class="muted" style="font-size:.7rem">${esc(m.reference||'')}</div></td>
      <td><span style="font-size:.75rem">${stype.icon} ${stype.label}</span></td>
      <td class="muted">${esc(m.operation||'Toutes')}</td>
      <td>${champLabels.map(l=>`<span style="font-size:.7rem;background:#E8F0FE;color:#1A5FD4;border-radius:5px;padding:1px 6px;margin-right:2px">${l}</span>`).join('')||'<span class="muted">—</span>'}</td>
      <td>${trigStats.map(s=>`<span style="font-size:.7rem;font-weight:700;background:${s.color||'#ddd'}22;color:${s.color||'#666'};border-radius:5px;padding:1px 7px;margin-right:2px">${esc(s.name)}</span>`).join('')||'<span class="muted">—</span>'}</td>
      <td>${fourns.length?fourns.map(f=>`<div style="font-size:.72rem"><span style="font-weight:700;color:var(--purple)">${esc(f.nom)}</span> <span class="muted">${f.prix?f.prix.toLocaleString('fr-FR',{maximumFractionDigits:2})+' €/u':''}</span></div>`).join(''):'<span class="muted">—</span>'}</td>
      <td class="muted">${esc(m.unite||'unités')}</td>
      <td style="text-align:center;color:var(--text-mut)">${m.seuilAlerte||'—'}</td>
      <td style="text-align:right"><div style="display:flex;gap:.3rem;justify-content:flex-end"><button class="iconbtn" onclick="openMatModal('${m.id}')">✏️</button><button class="iconbtn del" onclick="supprimerMat('${m.id}')">🗑️</button></div></td>
    </tr>`;
  });
  h+=`</tbody></table></div>`;
  document.getElementById('stockBody').innerHTML=h;
  restoreStockFocus();
}

/* ---- CATALOGUE MODAL ---- */
function openMatModal(id){
  const mats=getMats();const o=id?mats.find(m=>m.id===id)||{}:{};
  const selectedOp=getAllProducts().find(p=>p.id===o.operationId||p.name===o.operation);
  const opsOpts=getProducts().map(p=>`<option value="${p.id}" ${o.operationId===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
  const typeOpts=Object.entries(STOCK_TYPES).map(([k,v])=>`<option value="${k}" ${(o.typeStock||'stock_fixe')===k?'selected':''}>${v.icon} ${v.label}</option>`).join('');
  const savedStats=[].concat(o.statutsDeclencheur||o.statutDeclencheur||[]).filter(Boolean);
  const statOpts=getStatuses().map(s=>`<option value="${s.id}" ${savedStats.includes(s.id)?'selected':''}>${esc(s.name)}</option>`).join('');
  const fourns=o.fournisseurs||[];
  const fournHtml=fourns.map((f,i)=>fourn_row_html(i,f.nom,f.contact,f.prix)).join('')+'<div id="fourn-rows-end"></div>';
  STOCK_DRAFT=id?{...o}:{id:uid()};
  const body=`<div class="fgrid">
    <div class="fld"><label>Nom du matériel *</label><input id="mat_nom" value="${esc(o.nom||'')}" placeholder="Ex : Kit LED 150W"></div>
    <div class="fld"><label>Référence</label><input id="mat_ref" value="${esc(o.reference||'')}" placeholder="SKU / Ref"></div>
    <div class="fld"><label>Type de gestion</label><select id="mat_type" onchange="updateMatTypeDesc(this.value)">${typeOpts}</select></div>
    <div class="fld"><label>Unité</label><input id="mat_unite" value="${esc(o.unite||'unités')}" placeholder="unités, m²…"></div>
    <div class="fld"><label>Seuil alerte stock bas</label><input id="mat_seuil" type="number" value="${o.seuilAlerte||''}"></div>
    <div class="fld"><label>Notes</label><input id="mat_notes" value="${esc(o.notes||'')}"></div>
    <div class="sectitle">Liaison automatique avec les dossiers</div>
    <div class="fld"><label>Opération liée</label><select id="mat_op_id" onchange="updateMatOpFields()">${opsOpts}</select></div>
    <div class="fld" style="grid-column:1/-1"><label>Champ(s) à lire <span class="muted" style="font-size:.62rem">(Ctrl+clic pour plusieurs)</span></label>
      <select id="mat_champ" multiple size="4" style="height:auto;min-height:80px"></select>
    </div>
    <div class="fld" style="grid-column:1/-1"><label>Statut(s) déclencheur <span class="muted" style="font-size:.62rem">(Ctrl+clic pour plusieurs)</span></label>
      <select id="mat_statut" multiple size="4" style="height:auto;min-height:80px">${statOpts}</select>
    </div>
    <div class="sectitle">Fournisseurs & tarifs</div>
    <div style="grid-column:1/-1" id="fourns_container">${fournHtml}</div>
    <div style="grid-column:1/-1"><button class="btn btn-ghost btn-sm" onclick="addFournRow()">+ Ajouter un fournisseur</button></div>
  </div>`;
  openModal(id?'Modifier — '+esc(o.nom||'matériel'):'Nouveau matériel',body,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveMat()">💾 Enregistrer</button>`,'wide');
  setTimeout(()=>{
    updateMatOpFields();
    const champSel=document.getElementById('mat_champ');
    const saved=[].concat(o.champsDossier||o.champDossier||[]).filter(Boolean);
    if(champSel)setTimeout(()=>[...champSel.options].forEach(opt=>{opt.selected=saved.includes(opt.value);}),80);
  },50);
}
function fourn_row_html(i,nom,contact,prix){
  return `<div class="fourn-row" style="display:flex;align-items:center;gap:.4rem;background:var(--bg-soft);border-radius:8px;padding:.45rem .7rem;margin-bottom:.35rem">
    <input placeholder="Fournisseur" value="${esc(nom||'')}" class="fourn-nom" style="flex:2;font-family:'Saira',sans-serif;font-size:.82rem;border:1px solid var(--border-grey);border-radius:7px;padding:.3rem .6rem">
    <input placeholder="Contact (email/tel)" value="${esc(contact||'')}" class="fourn-contact" style="flex:2;font-family:'Saira',sans-serif;font-size:.82rem;border:1px solid var(--border-grey);border-radius:7px;padding:.3rem .6rem">
    <input type="number" placeholder="Prix HT/u" value="${prix||''}" class="fourn-prix" style="width:90px;font-family:'Saira',sans-serif;font-size:.82rem;border:1px solid var(--border-grey);border-radius:7px;padding:.3rem .6rem">
    <span class="muted" style="font-size:.72rem;white-space:nowrap">€ HT/u</span>
    <button onclick="this.closest('.fourn-row').remove()" style="background:none;border:none;cursor:pointer;color:var(--coral);font-size:1rem;padding:.2rem">✕</button>
  </div>`;
}
function addFournRow(){
  const end=document.getElementById('fourn-rows-end');
  if(!end)return;
  const div=document.createElement('div');
  div.innerHTML=fourn_row_html(Date.now(),'','','');
  end.before(div.firstChild);
}
function updateMatTypeDesc(val){
  const d=document.getElementById('mat_type_desc');
  if(d&&STOCK_TYPES[val])d.innerHTML=`<p class="muted" style="font-size:.78rem">${STOCK_TYPES[val].desc}</p>`;
}
function updateMatOpFields(){
  const opId=(document.getElementById('mat_op_id')||{}).value;
  const op=getAllProducts().find(p=>p.id===opId);
  const fields=(op?op.fields||[]:[]);
  const sel=document.getElementById('mat_champ');if(!sel)return;
  sel.innerHTML=fields.length
    ?fields.map(f=>`<option value="${esc(f.id)}">${esc(f.label||f.key||f.id)}</option>`).join('')
    :`<option value="">— Aucun champ disponible —</option>`;
}
function saveMat(){
  const id=STOCK_DRAFT.id;
  const opId=(document.getElementById('mat_op_id')||{}).value||'';
  const op=getAllProducts().find(p=>p.id===opId);
  const champSel=document.getElementById('mat_champ');
  const statSel=document.getElementById('mat_statut');
  const champsDossier=[...(champSel?champSel.selectedOptions:[])].map(o=>o.value).filter(Boolean);
  const statutsDeclencheur=[...(statSel?statSel.selectedOptions:[])].map(o=>o.value).filter(Boolean);
  // Collecter les fournisseurs
  const fournisseurs=[...document.querySelectorAll('.fourn-row')].map(row=>({
    nom:(row.querySelector('.fourn-nom')||{}).value||'',
    contact:(row.querySelector('.fourn-contact')||{}).value||'',
    prix:parseFloat((row.querySelector('.fourn-prix')||{}).value||0)||0
  })).filter(f=>f.nom);
  const mat={...STOCK_DRAFT,
    nom:(document.getElementById('mat_nom')||{}).value||'',
    reference:(document.getElementById('mat_ref')||{}).value||'',
    operationId:opId,operation:op?op.name:'',
    champsDossier,statutsDeclencheur,
    typeStock:(document.getElementById('mat_type')||{}).value||'stock_fixe',
    unite:(document.getElementById('mat_unite')||{}).value||'unités',
    seuilAlerte:parseInt((document.getElementById('mat_seuil')||{}).value||0)||null,
    notes:(document.getElementById('mat_notes')||{}).value||'',
    fournisseurs,
    prixUnitaire:fournisseurs.length?fournisseurs[0].prix:0
  };
  if(!mat.nom){toast('Saisissez un nom','err');return;}
  mat.segment=mat.segment||SEGMENT;
  const mats=getAllMats().filter(m=>m.id!==id);
  mats.push(mat);save('egncrm_materiels',mats);
  closeModal();renderStock();toast('Matériel enregistré ✓','ok');
}
function supprimerMat(id){
  modalConfirm('Supprimer ce matériel ?','Les mouvements associés ne seront pas supprimés.',async()=>{
    save('egncrm_materiels',getAllMats().filter(m=>m.id!==id));
    await deleteRemoteRow('egncrm_materiels',id);
    closeModal();renderStock();toast('Matériel supprimé ✓','ok');
  });
}

/* ---- MOUVEMENT MODAL ---- */
function openMvtModal(dossierId,preMatId){
  const mats=getMats();
  if(!mats.length){toast('Ajoutez d\'abord des matériels dans le catalogue','err');return;}
  const r=dossierId?recById(dossierId):null;
  const matOpts=mats.map(m=>`<option value="${m.id}" ${preMatId===m.id?'selected':''}>${STOCK_TYPES[m.typeStock]?.icon||''} ${esc(m.nom)}</option>`).join('');
  const firstMat=preMatId?mats.find(m=>m.id===preMatId):mats[0];
  const fournOpts=(firstMat?firstMat.fournisseurs||[]:[] ).map(f=>`<option value="${esc(f.nom)}" data-prix="${f.prix||0}">${esc(f.nom)} — ${(f.prix||0).toLocaleString('fr-FR',{maximumFractionDigits:2})} €/u</option>`).join('');
  const body=`<div class="fgrid">
    <div class="fld"><label>Matériel</label><select id="mvt_mat" onchange="updateMvtSens();updateMvtFourns()">${matOpts}</select></div>
    <div class="fld"><label>Type de mouvement</label><select id="mvt_sens" onchange="updateMvtSensFields()">
      <option value="entree">📥 Entrée (achat)</option>
      <option value="sortie">📤 Sortie manuelle</option>
      <option value="commande">🛒 Commande passée</option>
      <option value="reception">✅ Commande reçue</option>
      <option value="localisation">📍 Localisation</option>
    </select></div>
    <div id="mvt_fourn_block" class="fld" style="grid-column:1/-1"><label>Fournisseur</label>
      <select id="mvt_fourn" onchange="updateMvtPrixFromFourn()" style="font-family:'Saira',sans-serif;font-size:.85rem;border:1.5px solid var(--border-grey);border-radius:9px;padding:.5rem .8rem">
        <option value="">— Choisir —</option>${fournOpts}
      </select>
    </div>
    <div id="mvt_prix_block" class="fld"><label>Prix unitaire HT (€)</label><input id="mvt_prix_u" type="number" step="any" placeholder="0" oninput="updateMvtCalc()"></div>
    <div class="fld"><label>Quantité</label><input id="mvt_qte" type="number" min="1" value="1" oninput="updateMvtCalc()"></div>
    <div id="mvt_remise_block" class="fld"><label>Remise (€ HT) <span class="muted" style="font-size:.62rem">facultatif</span></label><input id="mvt_remise" type="number" step="any" placeholder="0" oninput="updateMvtCalc()"></div>
    <div id="mvt_tot_block" class="fld"><label>Total HT marchandise (après remise)</label><div id="mvt_tot" style="font-size:1rem;font-weight:800;padding:.5rem .8rem;background:var(--bg-soft);border-radius:9px">—</div></div>
    <div id="mvt_tva_block" class="fld" style="display:none"></div>
    <div id="mvt_frais_block" style="grid-column:1/-1;display:none">
      <div class="sectitle" style="margin-top:.3rem">Frais externes (transport, livraison, manutention…)</div>
      <div id="mvt_frais_list"></div>
      <button class="btn btn-ghost btn-sm" style="margin-top:.3rem" onclick="addFraisRow()">+ Ajouter un frais</button>
      <div style="display:flex;gap:.8rem;margin-top:.6rem;padding:.5rem .8rem;background:var(--bg-soft);border-radius:9px">
        <div style="flex:1"><span class="muted" style="font-size:.72rem">Total frais HT</span><div id="mvt_frais_tot" style="font-weight:800">—</div></div>
        <div style="flex:1"><span class="muted" style="font-size:.72rem">Total HT (marchandise + frais)</span><div id="mvt_total_global" style="font-weight:800;font-size:1.05rem;color:var(--green-deep)">—</div></div>
        <div style="flex:1"><span class="muted" style="font-size:.72rem">TVA récupérable sur le total (${tvaRate()}%)</span><div id="mvt_tva" style="font-weight:800;color:var(--blue)">—</div></div>
      </div>
    </div>
    <div class="fld"><label>Dossier lié</label><input id="mvt_dossier" value="${r?esc(r.dossier||''):''}"></div>
    <div id="mvt_lieu_block" class="fld" style="display:none"><label>Localisation / Lieu</label><input id="mvt_lieu" placeholder="Chez quel client ou dépôt ?"></div>
    <div class="fld" style="grid-column:1/-1"><label>Notes</label><input id="mvt_notes"></div>
    <div id="mvt_facture_block" class="fld" style="grid-column:1/-1"><label>📄 Facture fournisseur (PDF / image)</label>
      <div id="mvt_facture_preview" style="font-size:.82rem;color:var(--text-mut);padding:.3rem 0">Aucune facture jointe — sera uploadée après enregistrement</div>
      <input type="file" id="mvt_facture_file" accept=".pdf,image/*" style="margin-top:.3rem;font-size:.8rem">
    </div>
  </div>`;
  openModal('Nouveau mouvement de stock',body,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveMvt()">💾 Enregistrer</button>`,'wide');
  setTimeout(()=>{updateMvtSens();updateMvtCalc();},50);
}
function updateMvtFourns(){
  const matId=(document.getElementById('mvt_mat')||{}).value;
  const mat=getMats().find(m=>m.id===matId);
  const sel=document.getElementById('mvt_fourn');if(!sel)return;
  const fourns=mat?mat.fournisseurs||[]:[];
  sel.innerHTML=`<option value="">— Choisir —</option>`+fourns.map(f=>`<option value="${esc(f.nom)}" data-prix="${f.prix||0}">${esc(f.nom)} — ${(f.prix||0).toLocaleString('fr-FR',{maximumFractionDigits:2})} €/u</option>`).join('');
}
function updateMvtPrixFromFourn(){
  const sel=document.getElementById('mvt_fourn');if(!sel)return;
  const opt=sel.selectedOptions[0];
  const prix=opt?parseFloat(opt.dataset.prix)||0:0;
  const inp=document.getElementById('mvt_prix_u');if(inp&&prix)inp.value=prix;
  updateMvtCalc();
}
function updateMvtSens(){
  const matId=(document.getElementById('mvt_mat')||{}).value;
  const mat=getMats().find(m=>m.id===matId);
  if(!mat)return;
  updateMvtFourns();
  const sensEl=document.getElementById('mvt_sens');if(!sensEl)return;
  const opts={stock_fixe:['entree','sortie'],commande:['commande','reception'],circulant:['entree','localisation']};
  const allowed=opts[mat.typeStock||'stock_fixe']||['entree','sortie'];
  [...sensEl.options].forEach(o=>o.style.display=allowed.includes(o.value)?'':'none');
  if(!allowed.includes(sensEl.value))sensEl.value=allowed[0];
  updateMvtSensFields();
}
function updateMvtSensFields(){
  const sens=(document.getElementById('mvt_sens')||{}).value;
  const isEntree=['entree','reception','commande'].includes(sens);
  const isLoc=sens==='localisation';
  ['mvt_fourn_block','mvt_prix_block','mvt_remise_block','mvt_tot_block','mvt_tva_block','mvt_frais_block','mvt_facture_block'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=isEntree?'':'none'});
  const lieu=document.getElementById('mvt_lieu_block');if(lieu)lieu.style.display=isLoc?'':'none';
}
function addFraisRow(){
  const list=document.getElementById('mvt_frais_list');if(!list)return;
  const row=document.createElement('div');
  row.style.cssText='display:flex;gap:.4rem;align-items:center;margin-bottom:.35rem';
  row.innerHTML=`<input placeholder="Nature (ex: Transport)" class="frais-label" style="flex:2;font-family:'Saira',sans-serif;font-size:.82rem;border:1px solid var(--border-grey);border-radius:7px;padding:.3rem .6rem">
    <input type="number" placeholder="Montant HT (€)" class="frais-ht" step="any" oninput="updateMvtCalc()" style="width:120px;font-family:'Saira',sans-serif;font-size:.82rem;border:1px solid var(--border-grey);border-radius:7px;padding:.3rem .6rem">
    <span class="muted" style="font-size:.72rem;white-space:nowrap">€ HT</span>
    <button onclick="this.parentElement.remove();updateMvtCalc()" style="background:none;border:none;cursor:pointer;color:var(--coral);font-size:1rem">✕</button>`;
  list.appendChild(row);
}
function updateMvtCalc(){
  const qte=parseInt((document.getElementById('mvt_qte')||{}).value||1)||1;
  const pu=parseFloat((document.getElementById('mvt_prix_u')||{}).value||0)||0;
  const remise=parseFloat((document.getElementById('mvt_remise')||{}).value||0)||0;
  const tot=Math.max(0,qte*pu-remise);
  const eur=n=>n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  const totEl=document.getElementById('mvt_tot');
  if(totEl)totEl.innerHTML=pu?eur(tot)+(remise>0?` <span style="font-size:.7rem;color:var(--coral)">(-${eur(remise)} remise)</span>`:''):'—';
  // Frais externes
  const fraisRows=[...document.querySelectorAll('.frais-ht')];
  const totalFraisHT=fraisRows.reduce((s,el)=>s+(parseFloat(el.value)||0),0);
  const totalGlobal=tot+totalFraisHT;
  const tvaGlobal=totalGlobal*(tvaRate()/100);
  const fraisTotEl=document.getElementById('mvt_frais_tot');if(fraisTotEl)fraisTotEl.textContent=totalFraisHT>0?eur(totalFraisHT):'—';
  const tvaEl=document.getElementById('mvt_tva');if(tvaEl)tvaEl.textContent=totalGlobal>0?eur(tvaGlobal):'—';
  const globalEl=document.getElementById('mvt_total_global');if(globalEl)globalEl.textContent=totalGlobal>0?eur(totalGlobal):'—';
}
async function saveMvt(){
  const matId=(document.getElementById('mvt_mat')||{}).value;
  const sens=(document.getElementById('mvt_sens')||{}).value;
  const qte=parseInt((document.getElementById('mvt_qte')||{}).value||1)||1;
  const prixU=parseFloat((document.getElementById('mvt_prix_u')||{}).value||0)||0;
  const remise=parseFloat((document.getElementById('mvt_remise')||{}).value||0)||0;
  const fourn=(document.getElementById('mvt_fourn')||{}).value||'';
  const totalHT=Math.max(0,qte*prixU-remise);
  // Frais externes
  const fraisRows=[...document.querySelectorAll('.frais-ht')];
  const fraisLabels=[...document.querySelectorAll('.frais-label')];
  const frais=fraisRows.map((el,i)=>({label:(fraisLabels[i]||{}).value||'Frais',ht:parseFloat(el.value)||0})).filter(f=>f.ht>0);
  const totalFraisHT=frais.reduce((s,f)=>s+f.ht,0);
  const totalHTGlobal=totalHT+totalFraisHT;
  const tvaRecup=['entree','reception'].includes(sens)?totalHTGlobal*(tvaRate()/100):0;
  const dossierNum=((document.getElementById('mvt_dossier')||{}).value||'').trim();
  const lieu=((document.getElementById('mvt_lieu')||{}).value||'').trim();
  const notes=((document.getElementById('mvt_notes')||{}).value||'').trim();
  const r=dossierNum?getRecs().find(x=>x.dossier===dossierNum):null;
  const editId=((document.getElementById('mvt_edit_id')||{}).value||'').trim();
  const mvtId=editId||uid();
  const mvts=getMvts();
  const newMvt={id:mvtId,materielId:matId,sens,qte,date:editId?(mvts.find(x=>x.id===editId)?.date||Date.now()):Date.now(),
    fournisseurNom:fourn,prixUnitaireHT:prixU,remise,totalHT:totalHTGlobal,tvaRecup,
    frais,totalFraisHT,
    dossierId:r?r.id:null,lieu,notes,user:ME.prenom};
  // Conserver factureUrl existante si pas de nouveau fichier
  if(editId){const old=mvts.find(x=>x.id===editId);if(old){newMvt.factureUrl=old.factureUrl;newMvt.facturePath=old.facturePath;newMvt.factureNom=old.factureNom;}}
  const idx=mvts.findIndex(x=>x.id===mvtId);
  if(idx>=0)mvts[idx]=newMvt;else mvts.push(newMvt);
  save('egncrm_stock_mvt',mergeSeg(getAllMvts(),mvts));
  // Upload facture si présente
  const fileInput=document.getElementById('mvt_facture_file');
  if(fileInput&&fileInput.files[0]){
    closeModal();toast('Enregistrement + upload de la facture…','ok');
    try{
      const file=fileInput.files[0];
      const ext=file.name.split('.').pop();
      const path=`stock_factures/${mvtId}.${ext}`;
      const{error}=await SUPA.storage.from('attachments').upload(path,file,{cacheControl:'3600',upsert:false});
      if(error)throw error;
      const pub={publicUrl:''}; // bucket prive : l'URL est signee a l'ouverture
      const idx=getMvts().findIndex(v=>v.id===mvtId);
      if(idx>=0){const mvts2=getMvts();mvts2[idx].factureUrl=pub.publicUrl;mvts2[idx].facturePath=path;mvts2[idx].factureNom=file.name;save('egncrm_stock_mvt',mvts2);}
      toast('Facture jointe ✓','ok');
    }catch(e){toast('Mouvement enregistré mais facture non uploadée : '+(e.message||e),'err');}
  } else {
    closeModal();toast('Mouvement enregistré ✓','ok');
  }
  if(!editId)resetStockFilter('mvt'); // un nouveau mouvement doit rester visible
  renderStock();
}
function editMvt(id){
  const v=getMvts().find(x=>x.id===id);if(!v)return;
  // Ouvrir le modal de mouvement pré-rempli
  const mats=getMats();
  if(!mats.length){toast('Aucun matériel dans le catalogue','err');return;}
  const matOpts=mats.map(m=>`<option value="${m.id}" ${v.materielId===m.id?'selected':''}>${STOCK_TYPES[m.typeStock]?.icon||''} ${esc(m.nom)}</option>`).join('');
  const mat=mats.find(m=>m.id===v.materielId);
  const fournOpts=(mat?mat.fournisseurs||[]:[] ).map(f=>`<option value="${esc(f.nom)}" data-prix="${f.prix||0}" ${v.fournisseurNom===f.nom?'selected':''}>${esc(f.nom)} — ${(f.prix||0).toLocaleString('fr-FR',{maximumFractionDigits:2})} €/u</option>`).join('');
  const fraisHtml=(v.frais||[]).map(f=>`<div style="display:flex;gap:.4rem;align-items:center;margin-bottom:.35rem"><input placeholder="Nature" class="frais-label" value="${esc(f.label||'')}" style="flex:2;font-family:'Saira',sans-serif;font-size:.82rem;border:1px solid var(--border-grey);border-radius:7px;padding:.3rem .6rem"><input type="number" placeholder="Montant HT" class="frais-ht" value="${f.ht||''}" step="any" oninput="updateMvtCalc()" style="width:120px;font-family:'Saira',sans-serif;font-size:.82rem;border:1px solid var(--border-grey);border-radius:7px;padding:.3rem .6rem"><span class="muted" style="font-size:.72rem;white-space:nowrap">€ HT</span><button onclick="this.parentElement.remove();updateMvtCalc()" style="background:none;border:none;cursor:pointer;color:var(--coral);font-size:1rem">✕</button></div>`).join('');
  const r=v.dossierId?recById(v.dossierId):null;
  const isEntree=['entree','reception','commande'].includes(v.sens);
  const body=`<input type="hidden" id="mvt_edit_id" value="${v.id}">
  <div class="fgrid">
    <div class="fld"><label>Matériel</label><select id="mvt_mat" onchange="updateMvtSens();updateMvtFourns()">${matOpts}</select></div>
    <div class="fld"><label>Type de mouvement</label><select id="mvt_sens" onchange="updateMvtSensFields()">
      <option value="entree" ${v.sens==='entree'?'selected':''}>📥 Entrée (achat)</option>
      <option value="sortie" ${v.sens==='sortie'?'selected':''}>📤 Sortie manuelle</option>
      <option value="commande" ${v.sens==='commande'?'selected':''}>🛒 Commande passée</option>
      <option value="reception" ${v.sens==='reception'?'selected':''}>✅ Commande reçue</option>
      <option value="localisation" ${v.sens==='localisation'?'selected':''}>📍 Localisation</option>
    </select></div>
    <div id="mvt_fourn_block" class="fld" style="grid-column:1/-1;${isEntree?'':'display:none'}"><label>Fournisseur</label>
      <select id="mvt_fourn" onchange="updateMvtPrixFromFourn()" style="font-family:'Saira',sans-serif;font-size:.85rem;border:1.5px solid var(--border-grey);border-radius:9px;padding:.5rem .8rem">
        <option value="">— Choisir —</option>${fournOpts}
      </select>
    </div>
    <div id="mvt_prix_block" class="fld" style="${isEntree?'':'display:none'}"><label>Prix unitaire HT (€)</label><input id="mvt_prix_u" type="number" step="any" value="${v.prixUnitaireHT||''}" oninput="updateMvtCalc()"></div>
    <div class="fld"><label>Quantité</label><input id="mvt_qte" type="number" min="1" value="${v.qte||1}" oninput="updateMvtCalc()"></div>
    <div id="mvt_remise_block" class="fld" style="${isEntree?'':'display:none'}"><label>Remise (€ HT)</label><input id="mvt_remise" type="number" step="any" value="${v.remise||''}" placeholder="0" oninput="updateMvtCalc()"></div>
    <div id="mvt_tot_block" class="fld" style="${isEntree?'':'display:none'}"><label>Total HT (après remise)</label><div id="mvt_tot" style="font-size:1rem;font-weight:800;padding:.5rem .8rem;background:var(--bg-soft);border-radius:9px">—</div></div>
    <div id="mvt_tva_block" class="fld" style="display:none"></div>
    <div id="mvt_frais_block" style="grid-column:1/-1;${isEntree?'':'display:none'}">
      <div class="sectitle" style="margin-top:.3rem">Frais externes</div>
      <div id="mvt_frais_list">${fraisHtml}</div>
      <button class="btn btn-ghost btn-sm" style="margin-top:.3rem" onclick="addFraisRow()">+ Ajouter un frais</button>
      <div style="display:flex;gap:.8rem;margin-top:.6rem;padding:.5rem .8rem;background:var(--bg-soft);border-radius:9px">
        <div style="flex:1"><span class="muted" style="font-size:.72rem">Total frais HT</span><div id="mvt_frais_tot" style="font-weight:800">—</div></div>
        <div style="flex:1"><span class="muted" style="font-size:.72rem">Total HT global</span><div id="mvt_total_global" style="font-weight:800;font-size:1.05rem;color:var(--green-deep)">—</div></div>
        <div style="flex:1"><span class="muted" style="font-size:.72rem">TVA récupérable (${tvaRate()}%)</span><div id="mvt_tva" style="font-weight:800;color:var(--blue)">—</div></div>
      </div>
    </div>
    <div class="fld"><label>Dossier lié</label><input id="mvt_dossier" value="${r?esc(r.dossier||''):''}"></div>
    <div id="mvt_lieu_block" class="fld" style="${v.sens==='localisation'?'':'display:none'}"><label>Localisation / Lieu</label><input id="mvt_lieu" value="${esc(v.lieu||'')}"></div>
    <div class="fld" style="grid-column:1/-1"><label>Notes</label><input id="mvt_notes" value="${esc(v.notes||'')}"></div>
    <div id="mvt_facture_block" class="fld" style="grid-column:1/-1;${isEntree?'':'display:none'}"><label>📄 Facture fournisseur</label>
      <div style="font-size:.82rem;margin-bottom:.3rem">${v.factureUrl?`${attachLink(v.facturePath,v.factureNom||'Voir la facture',v.factureUrl)} <span class="muted">— remplacer :</span>`:'Aucune facture jointe'}</div>
      <input type="file" id="mvt_facture_file" accept=".pdf,image/*" style="font-size:.8rem">
    </div>
  </div>`;
  openModal('Modifier le mouvement',body,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveMvt()">💾 Enregistrer</button>`,'wide');
  setTimeout(()=>updateMvtCalc(),100);
}
async function supprimerMvt(id){
  const mvt=getMvts().find(v=>v.id===id);
  save('egncrm_stock_mvt',getAllMvts().filter(v=>v.id!==id));
  await deleteRemoteRow('egncrm_stock_mvt',id);
  // Supprimer aussi la facture jointe du stockage
  if(mvt&&mvt.facturePath){try{await SUPA.storage.from('attachments').remove([mvt.facturePath]);}catch(e){}}
  renderStock();toast('Mouvement supprimé ✓','ok');
}

/* ---- LOCALISATION RAPIDE (circulant) ---- */
function openLocModal(matId){
  const mat=getMats().find(m=>m.id===matId);if(!mat)return;
  const mvts=getMvts();
  const locaux=mvts.filter(v=>v.materielId===matId&&v.sens==='localisation').sort((a,b)=>(b.date||0)-(a.date||0));
  const curLoc=locaux[0];
  const stockTotal=mvts.filter(v=>v.materielId===matId&&v.sens==='entree').reduce((s,v)=>s+(v.qte||0),0);
  // Dossiers proposables : ceux du segment, filtrés sur l'opération du matériel si elle est définie
  const dossiers=segRecs()
    .filter(r=>!mat.operationId||r.productId===mat.operationId)
    .sort((a,b)=>(b.updated||b.created||0)-(a.updated||a.created||0));
  const optsFor=(selId)=>dossiers.map(r=>{
    const st=statById(r.statusId);
    return `<option value="${r.id}" ${selId===r.id?'selected':''}>${esc(r.dossier||'—')} — ${esc(clientNameOf(r))}${r.ville?' ('+esc(r.ville)+')':''}${st?' · '+esc(st.name):''}</option>`;
  }).join('');
  // Provenance par défaut : là où le matériel se trouve actuellement
  const vientDuClient=!!(curLoc&&curLoc.dossierId);
  const inpSty="font-family:'Saira',sans-serif;font-size:.82rem;border:1.5px solid var(--border-grey);border-radius:9px;padding:.42rem .7rem;outline:none";
  const body=`<div style="background:${curLoc?'#EFF7E8':'#EEF1F4'};border-radius:9px;padding:.7rem 1rem;margin-bottom:.9rem;font-size:.82rem">
    📍 <b>Position actuelle :</b> ${curLoc?esc(curLoc.lieu||'—')+' <span style="color:#6b7785">depuis le '+new Date(curLoc.date).toLocaleDateString('fr-FR')+'</span>':'<span style="color:#6b7785">Non localisé — au dépôt</span>'}
  </div>
  <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:.8rem;align-items:start">
    <!-- PROVENANCE -->
    <div style="background:#FFF7ED;border:1.5px solid #F0C486;border-radius:11px;padding:.8rem">
      <div style="font-size:.68rem;font-weight:800;color:#B96A0A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.5rem">📤 Provenance</div>
      <select id="loc_from_type" onchange="toggleLocSide('from')" style="${inpSty};width:100%;margin-bottom:.4rem">
        <option value="depot" ${!vientDuClient?'selected':''}>🏬 Mon stock / dépôt</option>
        <option value="dossier" ${vientDuClient?'selected':''}>🏠 Repris chez un client</option>
      </select>
      <div id="loc_from_dossier_wrap" style="display:${vientDuClient?'':'none'}">
        <input type="text" placeholder="🔍 Filtrer…" oninput="filterLocList('loc_from_dossier',this.value)" style="${inpSty};width:100%;margin-bottom:.3rem">
        <select id="loc_from_dossier" size="5" style="${inpSty};width:100%;height:auto">${optsFor(curLoc?curLoc.dossierId:null)}</select>
      </div>
      <div id="loc_from_depot_wrap" style="display:${vientDuClient?'none':''}">
        <input id="loc_from_lieu" placeholder="Dépôt, atelier…" value="Dépôt" style="${inpSty};width:100%">
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:var(--text-mut);padding-top:2.2rem">→</div>
    <!-- DESTINATION -->
    <div style="background:#F0F7FF;border:1.5px solid #9BC4F0;border-radius:11px;padding:.8rem">
      <div style="font-size:.68rem;font-weight:800;color:#1A5FD4;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.5rem">📥 Destination</div>
      <select id="loc_to_type" onchange="toggleLocSide('to')" style="${inpSty};width:100%;margin-bottom:.4rem">
        <option value="dossier" selected>🏠 Installé chez un client</option>
        <option value="depot">🏬 Retour au stock / dépôt</option>
      </select>
      <div id="loc_to_dossier_wrap">
        <input type="text" placeholder="🔍 Filtrer…" oninput="filterLocList('loc_to_dossier',this.value)" style="${inpSty};width:100%;margin-bottom:.3rem">
        <select id="loc_to_dossier" size="5" style="${inpSty};width:100%;height:auto">${optsFor(null)}</select>
      </div>
      <div id="loc_to_depot_wrap" style="display:none">
        <input id="loc_to_lieu" placeholder="Dépôt, atelier…" value="Dépôt" style="${inpSty};width:100%">
      </div>
    </div>
  </div>
  <div class="fgrid" style="margin-top:.8rem">
    <div class="fld"><label>Quantité déplacée</label><input id="loc_qte" type="number" min="1" value="${stockTotal||1}"></div>
    <div class="fld"><label>Date du déplacement</label><input id="loc_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="fld" style="grid-column:1/-1"><label>Notes</label><input id="loc_notes" placeholder="Ex : chantier terminé, matériel récupéré en bon état…"></div>
  </div>
  <p class="muted" style="font-size:.72rem;margin-top:.5rem">${dossiers.length} dossier${dossiers.length>1?'s':''} disponible${dossiers.length>1?'s':''}${mat.operationId?' pour '+esc(mat.operation||''):''}.</p>`;
  openModal('🔄 Déplacer — '+esc(mat.nom),body,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveLoc('${matId}')">🔄 Enregistrer le transfert</button>`,'wide');
}
function toggleLocSide(side){
  const t=(document.getElementById('loc_'+side+'_type')||{}).value;
  const d=document.getElementById('loc_'+side+'_dossier_wrap'),p=document.getElementById('loc_'+side+'_depot_wrap');
  if(d)d.style.display=t==='dossier'?'':'none';
  if(p)p.style.display=t==='depot'?'':'none';
}
function filterLocList(selId,q){
  const sel=document.getElementById(selId);if(!sel)return;
  const s=(q||'').toLowerCase();
  [...sel.options].forEach(o=>{o.style.display=!s||o.textContent.toLowerCase().includes(s)?'':'none';});
}
function saveLoc(matId){
  const lire=side=>{
    const t=(document.getElementById('loc_'+side+'_type')||{}).value||'depot';
    if(t==='dossier'){
      const id=(document.getElementById('loc_'+side+'_dossier')||{}).value;
      const r=id?recById(id):null;
      return r?{recId:r.id,label:clientNameOf(r)+' ('+(r.dossier||'')+')'}:null;
    }
    const l=((document.getElementById('loc_'+side+'_lieu')||{}).value||'').trim();
    return l?{recId:null,label:l}:null;
  };
  const from=lire('from'),to=lire('to');
  if(!from){toast('Précisez la provenance','err');return;}
  if(!to){toast('Précisez la destination','err');return;}
  if(from.recId&&to.recId&&from.recId===to.recId){toast('Provenance et destination identiques','err');return;}
  const qte=parseInt((document.getElementById('loc_qte')||{}).value||1)||1;
  const notes=((document.getElementById('loc_notes')||{}).value||'').trim();
  const dateStr=(document.getElementById('loc_date')||{}).value;
  const ts=dateStr?new Date(dateStr+'T12:00:00').getTime():Date.now();
  const mvts=getMvts();
  mvts.push({id:uid(),materielId:matId,sens:'localisation',qte,date:ts,
    fromId:from.recId,fromLieu:from.label,
    dossierId:to.recId,lieu:to.label,notes,user:ME.prenom});
  save('egncrm_stock_mvt',mergeSeg(getAllMvts(),mvts));
  resetStockFilter('mvt'); // sinon un filtre actif masquerait le transfert
  closeModal();renderStock();toast(`🔄 ${from.label} → ${to.label}`,'ok');
}

function exportStockCSV(){
  const mats=getMats();const mvts=getMvts();
  let csv='Matériel;Type;Opération;Entrées;Sorties auto;Stock restant;Valeur HT;Fournisseurs\n';
  mats.forEach(m=>{
    const e=mvts.filter(v=>v.materielId===m.id&&v.sens==='entree').reduce((s,v)=>s+(v.qte||0),0);
    const sa=calcSortiesAuto(m);const sm=mvts.filter(v=>v.materielId===m.id&&v.sens==='sortie').reduce((s,v)=>s+(v.qte||0),0);
    const stock=e-sa-sm;
    csv+=`${m.nom};${STOCK_TYPES[m.typeStock]?.label||''};${m.operation||''};${e};${sa};${stock};${(Math.max(0,stock)*(m.prixUnitaire||0)).toFixed(2)};${(m.fournisseurs||[]).map(f=>f.nom).join(', ')}\n`;
  });
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download='stock_egn.csv';a.click();URL.revokeObjectURL(url);
}

function renderSettings(){
  const tabs=[
    ['statuts','Statuts','settings_statuts'],
    ['operations','Opérations','settings_operations'],
    ['delegataires','Délégataires','settings_delegataires'],
    ['sources','Sources / Régies','settings_partenaires'],
    ['vt','Visite technique','settings_partenaires'],
    ['poseurs','Poseur','settings_partenaires'],
    ['auditeurs','Auditeur','settings_partenaires'],
    ['equipes','Équipes','settings_partenaires'],
    ['documents','Types de docs','settings_operations'],
    ['mails','Modèles e-mail','settings_operations'],
    ['coefsu','Coefficients U','settings_operations'],
    ['pac','Solutions PAC','settings_operations'],
    ['societe','Société','settings_societe']
  ].filter(t=>can(t[2]));
  if(!tabs.length){document.getElementById('content').innerHTML=`<div class="empty"><div class="big">🔒</div>Aucun onglet de paramètres ne vous est accessible.</div>`;document.getElementById('pageActions').innerHTML='';return;}
  if(!tabs.some(t=>t[0]===SETTAB))SETTAB=tabs[0][0];
  let h=`<div class="tabs">`+tabs.map(t=>`<button class="tab ${SETTAB===t[0]?'act':''}" onclick="SETTAB='${t[0]}';renderSettings()">${t[1]}</button>`).join('')+`</div><div id="setBody"></div>`;
  document.getElementById('content').innerHTML=h;
  document.getElementById('pageActions').innerHTML='';
  if(SETTAB==='statuts')setStatuts();
  else if(SETTAB==='operations')setOperations();
  else if(SETTAB==='delegataires')setDelegataires();
  else if(SETTAB==='mails')setMailTpl();
  else if(SETTAB==='societe')setSociete();
  else setSimple(SETTAB);
}
function setDelegataires(){
  const ds=getDelegataires();
  let h=`<div class="panel"><div class="panel-h"><h3>Délégataires CEE & valorisations</h3><div class="sp"><button class="btn btn-pri btn-sm" onclick="openDelegataire()">+ Nouveau délégataire</button></div></div><div class="panel-b"><p class="muted" style="margin-bottom:.9rem">Renseignez vos délégataires et la <b>valorisation</b> négociée (en €/MWh cumac) pour le <b>Classique</b> et le <b>Précaire</b>. Ces valeurs servent au calcul automatique de la prime dans l'onglet Deal des dossiers.</p><div class="cfg-list">`;
  if(!ds.length)h+=`<div class="muted">Aucun délégataire.</div>`;
  else h+=ds.map(d=>`<div class="cfg-item"><div style="flex:1"><div class="nm">${esc(d.name)}</div><div class="muted" style="font-size:.72rem;margin-top:.15rem">Classique : <b>${(parseFloat(d.valoClassique)||0).toString().replace('.',',')}</b> €/MWhc · Précaire : <b>${(parseFloat(d.valoPrecaire)||0).toString().replace('.',',')}</b> €/MWhc</div></div><span class="sp"><button class="iconbtn" onclick="openDelegataire('${d.id}')">✏️</button><button class="iconbtn del" onclick="delDelegataire('${d.id}')">🗑️</button></span></div>`).join('');
  h+=`</div></div></div>`;
  document.getElementById('setBody').innerHTML=h;
}
function openDelegataire(id){
  const d=id?getDelegataires().find(x=>x.id===id):null;const e=d||{};
  const body=`<input type="hidden" id="dg_id" value="${id||''}">
    <div class="fld"><label>Nom du délégataire</label><input id="dg_name" value="${esc(e.name||'')}" placeholder="ex : ACE ÉNERGIE"></div>
    <div class="sectitle" style="margin-top:.9rem">Prime client <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">— versée au client, sans TVA</span></div>
    <div class="fgrid">
      <div class="fld"><label>Classique (€/MWh cumac)</label><input type="number" step="any" id="dg_classique" value="${e.valoClassique!=null?e.valoClassique:''}" placeholder="ex : 3.6"></div>
      <div class="fld"><label>Précaire (€/MWh cumac)</label><input type="number" step="any" id="dg_precaire" value="${e.valoPrecaire!=null?e.valoPrecaire:''}" placeholder="ex : 3.6"></div>
    </div>
    <div class="sectitle" style="margin-top:.9rem">Commission installateur <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">— votre rémunération, soumise à TVA</span></div>
    <div class="fgrid">
      <div class="fld"><label>Classique (€/MWh cumac)</label><input type="number" step="any" id="dg_com_classique" value="${e.valoComClassique!=null?e.valoComClassique:''}" placeholder="ex : 3.6"></div>
      <div class="fld"><label>Précaire (€/MWh cumac)</label><input type="number" step="any" id="dg_com_precaire" value="${e.valoComPrecaire!=null?e.valoComPrecaire:''}" placeholder="ex : 3.6"></div>
    </div>
    <p class="muted" style="margin-top:.7rem;font-size:.74rem">Les deux lignes sont calculées sur le <b>cumac total</b> du dossier. Décimales au point ou à la virgule.</p>`;
  openModal(id?'Modifier le délégataire':'Nouveau délégataire',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveDelegataire()">💾 Enregistrer</button>`);
}
function saveDelegataire(){
  const id=val('dg_id');const name=val('dg_name');
  if(!name){toast('Nom requis','err');return;}
  const num=v=>parseFloat(String(v||'').replace(',','.'))||0;
  const vc=num(val('dg_classique')),vp=num(val('dg_precaire'));
  const cc=num(val('dg_com_classique')),cp=num(val('dg_com_precaire'));
  const ds=getDelegataires();
  if(id){const d=ds.find(x=>x.id===id);if(d){d.name=name;d.valoClassique=vc;d.valoPrecaire=vp;d.valoComClassique=cc;d.valoComPrecaire=cp;}}
  else ds.push({id:uid(),name,valoClassique:vc,valoPrecaire:vp,valoComClassique:cc,valoComPrecaire:cp});
  save('egncrm_delegataires',ds);closeModal();renderSettings();toast('Délégataire enregistré ✓','ok');
}
function delDelegataire(id){
  modalConfirm('Supprimer ce délégataire ?','',()=>{save('egncrm_delegataires',getDelegataires().filter(x=>x.id!==id));deleteRemoteRow('egncrm_delegataires',id);closeModal();renderSettings();toast('Délégataire supprimé','ok');});
}
