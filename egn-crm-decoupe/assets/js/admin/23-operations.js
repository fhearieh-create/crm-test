/* ============================================================
   EGN CRM — admin/23-operations.js
   Opérations CEE et champs personnalisés
   ============================================================ */
/* ====================================================================
   OPÉRATIONS (fiches CEE) & CHAMPS PERSONNALISÉS
   ==================================================================== */
let LF_OPVALS={},LF_REC=null,OPDRAFT=null,OPFIELD_IDX=null,US_ASSIGN=[];
const FIELD_TYPES={text:'Texte',number:'Nombre',tel:'Téléphone',email:'Email',date:'Date',textarea:'Texte long',select:'Liste déroulante',bool:'Oui / Non',siret:'SIRET (remplissage auto)'};

/* -- rendu d'un champ personnalisé dans la fiche lead -- */
function fieldInput(f,v){
  v=v||'';const id='opf_'+f.id;
  if(f.type==='siret')return `<div class="flex"><input id="${id}" value="${esc(v)}" placeholder="14 chiffres" style="flex:1"><button class="btn btn-navy btn-sm" type="button" onclick="lookupSiret('${f.id}')" title="Remplir via le SIRET">🔎 Auto</button></div>`;
  if(f.key==='adresse_siege'||f.key==='adresse_travaux'){const scope=f.key==='adresse_travaux'?'travaux':'siege';return `<div class="addr-wrap"><input type="text" id="${id}" value="${esc(v)}" autocomplete="off" placeholder="Saisir puis choisir l'adresse validée…" oninput="addrAC('${id}','${scope}',this.value)" onfocus="addrAC('${id}','${scope}',this.value)" onblur="addrBlur('${id}')"><div class="addr-sug" id="sug_${id}"></div></div>`;}
  if(f.type==='textarea')return `<textarea id="${id}">${esc(v)}</textarea>`;
  if(f.type==='select')return `<select id="${id}"><option value="">—</option>${(f.options||[]).map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
  if(f.type==='bool')return `<select id="${id}"><option value="">—</option><option ${v==='Oui'?'selected':''}>Oui</option><option ${v==='Non'?'selected':''}>Non</option></select>`;
  const t=f.type==='number'?'number':f.type==='date'?'date':f.type==='tel'?'tel':f.type==='email'?'email':'text';
  return `<input type="${t}" id="${id}" value="${esc(v)}">`;
}
function renderOpFields(){
  const wrap=document.getElementById('lf_opfields_wrap');if(!wrap)return;
  const opId=(document.getElementById('lf_op')||{}).value||'';
  const op=getAllProducts().find(p=>p.id===opId);
  const fields=(op&&op.fields)||[];
  if(!fields.length){wrap.innerHTML=opId?`<div class="muted" style="font-size:.78rem">Aucun champ pour cette opération. Ajoutez-en dans <b>Paramètres ▸ Opérations</b>.</div>`:`<div class="muted" style="font-size:.82rem">Sélectionnez une opération pour afficher le formulaire à remplir.</div>`;return;}
  const valueFor=f=>{let v=LF_OPVALS[f.id];if((v==null||v==='')&&f.key&&LF_REC)v=canonByKey(LF_REC,f.key);return v||'';};
  let h=`<div class="sectitle" style="margin-top:0">Informations — ${esc(op.name)}</div><div class="fgrid">`;
  fields.forEach(f=>{
    const full=(f.type==='textarea')?' full':'';
    let cls='',dc='';
    if(f.showIf){const ctrl=fields.find(x=>x.key===f.showIf);cls=' op-cond';dc=` data-ctrl="${ctrl?ctrl.id:''}"`;}
    h+=`<div class="fld${full}${cls}"${dc}><label>${esc(f.label)}${f.required?' <span style="color:var(--coral)">*</span>':''}</label>${fieldInput(f,valueFor(f))}</div>`;
  });
  h+=`</div>`;wrap.innerHTML=h;
  // brancher les contrôleurs de conditions
  fields.forEach(f=>{if(fields.some(x=>x.showIf===f.key)){const el=document.getElementById('opf_'+f.id);if(el)el.addEventListener('change',applyOpConditionals);}});
  applyOpConditionals();
}
/* -- autocomplétion d'adresse via la Base Adresse Nationale (gratuit, sans clé) -- */
let ADDR_SUG={},ADDR_T={};
function addrAC(inputId,scope,q){clearTimeout(ADDR_T[inputId]);ADDR_T[inputId]=setTimeout(()=>addrACgo(inputId,scope,q),250);}
async function addrACgo(inputId,scope,q){
  const box=document.getElementById('sug_'+inputId);if(!box)return;
  if(!q||q.trim().length<3){box.innerHTML='';box.style.display='none';return;}
  try{
    const res=await fetch('https://api-adresse.data.gouv.fr/search/?limit=6&autocomplete=1&q='+encodeURIComponent(q));
    const j=await res.json();const feats=(j&&j.features)||[];
    ADDR_SUG[inputId]=feats.map(f=>({name:f.properties.name||f.properties.label||'',cp:f.properties.postcode||'',ville:f.properties.city||'',label:f.properties.label||''}));
    if(!feats.length){box.innerHTML=`<div class="addr-empty">Aucune adresse trouvée</div>`;box.style.display='block';return;}
    box.innerHTML=ADDR_SUG[inputId].map((s,i)=>`<div class="addr-item" onmousedown="addrPick('${inputId}','${scope}',${i})"><b>${esc(s.name)}</b><span class="muted"> · ${esc(s.cp)} ${esc(s.ville)}</span></div>`).join('');
    box.style.display='block';
  }catch(e){box.style.display='none';}
}
function addrSiblings(scope){
  const op=getAllProducts().find(p=>p.id===(document.getElementById('lf_op')||{}).value);
  const fields=(op&&op.fields)||[];
  const cpf=fields.find(f=>f.key==='cp_'+scope);const vlf=fields.find(f=>f.key==='ville_'+scope);
  return {cp:cpf?('opf_'+cpf.id):null,ville:vlf?('opf_'+vlf.id):null};
}
function addrPick(inputId,scope,i){
  const s=(ADDR_SUG[inputId]||[])[i];if(!s)return;
  const inp=document.getElementById(inputId);if(inp)inp.value=s.name;
  const sib=addrSiblings(scope);
  if(sib.cp){const e=document.getElementById(sib.cp);if(e)e.value=s.cp;}
  if(sib.ville){const e=document.getElementById(sib.ville);if(e)e.value=s.ville;}
  addrClose(inputId);
}
function addrClose(inputId){const b=document.getElementById('sug_'+inputId);if(b)b.style.display='none';}
function addrBlur(inputId){setTimeout(()=>addrClose(inputId),200);}

/* -- onglet Paramètres ▸ Opérations -- */
function setOperations(){
  const ops=getProducts();
  let h=`<div class="panel"><div class="panel-h"><h3>Opérations (fiches CEE) <span style="font-size:.72rem;font-weight:700;background:rgba(45,125,210,.12);color:var(--blue);border-radius:6px;padding:1px 8px;margin-left:.3rem">${SEGMENTS[SEGMENT].ic} ${SEGMENTS[SEGMENT].short}</span></h3><div class="sp"><button class="btn btn-pri btn-sm" onclick="openOperation()">+ Nouvelle opération</button></div></div><div class="panel-b"><p class="muted" style="margin-bottom:.9rem">Définissez chaque fiche CEE et les <b>champs personnalisés</b> à remplir lors de la création d'un lead. Vous gérez tout : libellés, types, listes de choix, obligatoire ou non. Ces champs s'affichent automatiquement quand l'opération est sélectionnée sur un lead.</p><div class="cfg-list">`;
  if(!ops.length)h+=`<div class="empty"><div class="big">📋</div>Aucune opération. Créez votre première fiche CEE.</div>`;
  ops.forEach(o=>{const nf=(o.fields||[]).length;h+=`<div class="cfg-item"><span class="nm">${esc(o.name)}</span><span class="tag" style="background:rgba(45,125,210,.12);color:#2D7DD2">${nf} champ${nf>1?'s':''}</span><span class="sp"><button class="iconbtn" title="Configurer" onclick="openOperation('${o.id}')">✏️</button><button class="iconbtn del" onclick="delOperation('${o.id}')">🗑️</button></span></div>`;});
  h+=`</div></div></div>`;document.getElementById('setBody').innerHTML=h;
}
function delOperation(id){const used=getRecs().some(r=>r.productId===id);modalConfirm('Supprimer cette opération ?',used?'⚠️ Des dossiers utilisent cette opération — leur opération deviendra vide.':'Cette fiche CEE et ses champs seront supprimés.',()=>{save(K.prod,getAllProducts().filter(o=>o.id!==id));deleteRemoteRow(K.prod,id);closeModal();renderSettings();buildNav();toast('Opération supprimée','ok');});}

/* -- onglet Paramètres ▸ Produits (prix d'achat, rattachés à une fiche CEE) -- */
const ITEM_MODES={piece:'À la pièce',m2:'Au m²'};
function setProduits(){
  const ops=getProducts();const items=getItems();
  let h=`<div class="panel"><div class="panel-h"><h3>Produits & prix d'achat</h3><div class="sp"><button class="btn btn-pri btn-sm" onclick="openProduit()" ${!ops.length?'disabled':''}>+ Nouveau produit</button></div></div><div class="panel-b">`;
  h+=`<p class="muted" style="margin-bottom:.9rem">Créez un ou plusieurs <b>produits</b> pour chaque fiche CEE (ex : « PAC Daikin 8kW » à la pièce, « Laine de verre 300mm » au m²). Leur <b>prix d'achat</b> sert au calcul de rentabilité dans l'onglet Comptabilité des dossiers.</p>`;
  if(!ops.length)h+=`<div class="empty"><div class="big">📋</div>Créez d'abord une opération dans l'onglet « Opérations ».</div>`;
  else if(!items.length)h+=`<div class="empty"><div class="big">📦</div>Aucun produit. Créez-en un pour une opération.</div>`;
  else{
    h+=`<div class="cfg-list">`;
    ops.forEach(op=>{
      const opItems=items.filter(i=>i.opId===op.id);if(!opItems.length)return;
      h+=`<div class="muted" style="font-weight:700;font-size:.76rem;margin:.7rem 0 .3rem;text-transform:uppercase;letter-spacing:.03em">${esc(op.name)}</div>`;
      opItems.forEach(i=>{h+=`<div class="cfg-item"><span class="nm">${esc(i.name)}</span><span class="tag" style="background:#eef0f2;color:#6b7785">${ITEM_MODES[i.mode]||i.mode}</span><span class="tag" style="background:rgba(45,125,210,.12);color:#2D7DD2">${(i.price||0).toLocaleString('fr-FR')} €${i.mode==='m2'?'/m²':''}</span><span class="sp"><button class="iconbtn" onclick="openProduit('${i.id}')">✏️</button><button class="iconbtn del" onclick="delProduit('${i.id}')">🗑️</button></span></div>`;});
    });
    const orphans=items.filter(i=>!ops.some(op=>op.id===i.opId));
    if(orphans.length){h+=`<div class="muted" style="font-weight:700;font-size:.76rem;margin:.7rem 0 .3rem;text-transform:uppercase;letter-spacing:.03em">Opération supprimée</div>`;orphans.forEach(i=>{h+=`<div class="cfg-item"><span class="nm">${esc(i.name)}</span><span class="sp"><button class="iconbtn" onclick="openProduit('${i.id}')">✏️</button><button class="iconbtn del" onclick="delProduit('${i.id}')">🗑️</button></span></div>`;});}
    h+=`</div>`;
  }
  h+=`</div></div>`;document.getElementById('setBody').innerHTML=h;
}
function openProduit(id){
  const items=getItems();const x=id?items.find(i=>i.id===id):null;
  const ops=getProducts();
  const d=x||{name:'',opId:ops[0]?ops[0].id:'',mode:'piece',price:0};
  let body=`<input type="hidden" id="it_id" value="${id||''}">
    <div class="fld"><label>Nom du produit</label><input id="it_name" value="${esc(d.name)}" placeholder="Ex : PAC Daikin 8kW, Laine de verre 300mm…"></div>
    <div class="fgrid c3" style="margin-top:.6rem">
      <div class="fld"><label>Fiche CEE (opération)</label><select id="it_op">${ops.map(o=>`<option value="${o.id}" ${o.id===d.opId?'selected':''}>${esc(o.name)}</option>`).join('')}</select></div>
      <div class="fld"><label>Mode de tarification</label><select id="it_mode">${Object.entries(ITEM_MODES).map(([k,l])=>`<option value="${k}" ${d.mode===k?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="fld"><label>Prix d'achat (€)</label><input type="number" step="any" id="it_price" value="${d.price||''}" placeholder="0"></div>
    </div>`;
  openModal(id?'Modifier le produit':'Nouveau produit',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveProduit()">💾 Enregistrer</button>`,'wide');
}
function saveProduit(){
  const id=val('it_id');const name=val('it_name');const opId=val('it_op');const mode=val('it_mode');
  const price=parseFloat(String(val('it_price')||'').replace(',','.'))||0;
  if(!name){toast('Nom requis','err');return;}
  if(!opId){toast('Opération requise','err');return;}
  const items=getItems();let x=id?items.find(i=>i.id===id):null;
  if(!x){x={id:uid()};items.push(x);}
  Object.assign(x,{name,opId,mode,price});
  save(K.items,items);closeModal();renderSettings();toast('Produit enregistré ✓','ok');
}
function delProduit(id){modalConfirm('Supprimer ce produit ?','',()=>{save(K.items,getItems().filter(i=>i.id!==id));deleteRemoteRow(K.items,id);closeModal();renderSettings();toast('Produit supprimé','ok');});}

/* -- éditeur d'opération (avec constructeur de champs) -- */
function openOperation(id){
  const o=id?getAllProducts().find(x=>x.id===id):null;
  OPDRAFT=o?JSON.parse(JSON.stringify(o)):{id:uid(),name:'',fields:commonFieldDefs()};
  if(!OPDRAFT.fields)OPDRAFT.fields=[];
  renderOpEditor();
}
const ETUDE_TYPES={'':'Aucune — pas de module Étude pour cette opération','pac':'PAC — Déperditions & solution PAC (type BAT-TH-163 / BAT-TH-179)','thermitube':'Thermitube — Serre bioclimatique (AGRI-EQ-108)'};
function renderOpEditor(){
  const o=OPDRAFT;
  let fl;
  if(!o.fields.length)fl=`<div class="muted" style="font-size:.82rem;padding:.5rem 0">Aucun champ pour l'instant. Ajoutez les questions à poser pour cette opération.</div>`;
  else fl='<div class="cfg-list">'+o.fields.map((f,i)=>`<div class="cfg-item"><span class="nm">${esc(f.label||'(sans libellé)')}</span><span class="tag" style="background:#eef0f2;color:#6b7785">${FIELD_TYPES[f.type]||f.type}</span>${f.required?'<span class="tag" style="background:rgba(230,57,70,.12);color:#E63946">obligatoire</span>':''}${f.showIf?'<span class="tag" style="background:rgba(45,125,210,.12);color:#2D7DD2">conditionnel</span>':''}<span class="sp"><button class="iconbtn" onclick="opMoveField(${i},-1)" style="${i===0?'opacity:.3;pointer-events:none':''}">↑</button><button class="iconbtn" onclick="opMoveField(${i},1)" style="${i===o.fields.length-1?'opacity:.3;pointer-events:none':''}">↓</button><button class="iconbtn" onclick="opEditField(${i})">✏️</button><button class="iconbtn del" onclick="opDelField(${i})">🗑️</button></span></div>`).join('')+'</div>';
  let body=`<div class="fld"><label>Nom de l'opération / fiche CEE</label><input id="op_name" value="${esc(o.name)}" placeholder="Ex : BAR-TH-104 — Chaudière biomasse"></div>
  <div class="sectitle">Champs du formulaire <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(affichés sur le lead quand cette opération est choisie)</span></div>
  ${fl}
  <button class="btn btn-ghost btn-sm" style="margin-top:.7rem" onclick="opAddField()">+ Ajouter un champ</button>
  ${cumacEditorHtml()}
  ${primeEditorHtml()}
  <div class="sectitle" style="margin-top:1.1rem">Module Étude technique <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(bouton « 📐 Étude technique & PDF » dans la fiche dossier — Admin/Super Admin)</span></div>
  <div class="fld"><label>Type d'étude</label><select id="op_etudetype">${Object.entries(ETUDE_TYPES).map(([k,l])=>`<option value="${k}" ${(o.etudeType||'')===k?'selected':''}>${l}</option>`).join('')}</select></div>
  <p class="muted" style="margin-top:.4rem;font-size:.74rem">💡 Le module Étude actuel (déperditions NF EN 12831 + solution PAC + Facteur R) n'est prévu que pour les fiches PAC. D'autres types d'étude pourront être ajoutés ici plus tard pour les autres familles de fiches.</p>`;
  openModal(o.name?'Opération — '+esc(o.name):'Nouvelle opération',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveOperation()">💾 Enregistrer l'opération</button>`,'wide');
}
function primeEditorHtml(){
  const o=OPDRAFT;
  const p=o.prime||{mode:'standard',factors:[]};
  const numFields=o.fields.filter(f=>f.type==='number'&&f.label&&f.label.trim());
  const factors=p.factors||[];
  let factorsHtml='';
  if(p.mode==='multi'){
    factorsHtml=`<div class="muted" style="font-size:.78rem;margin:.4rem 0 .6rem">
      Formule : <b>cumac × ${factors.map(f=>`<span style="color:var(--green-deep)">${esc(f.label||f.field||'?')}</span>`).join(' × ')} × valo ÷ 1000</b>
    </div>
    <div class="cfg-list" id="prime_factors_list">
    ${factors.map((f,i)=>`<div class="cfg-item">
      <select onchange="primeUpdateFactor(${i},'field',this.value)" style="flex:2">
        <option value="">— Choisir un champ numérique —</option>
        ${numFields.map(nf=>`<option value="${nf.id}" ${f.field===nf.id?'selected':''}>${esc(nf.label)}</option>`).join('')}
      </select>
      <input placeholder="Libellé (ex: Surface m²)" value="${esc(f.label||'')}" style="flex:1" oninput="primeUpdateFactor(${i},'label',this.value)">
      <button class="iconbtn del" onclick="primeDelFactor(${i})">🗑️</button>
    </div>`).join('')}
    </div>
    <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="primeAddFactor()">+ Ajouter un champ multiplicateur</button>`;
  }
  return `<div class="sectitle" style="margin-top:1.1rem">Calcul automatique de la prime <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(alimente le bouton « ⚡ Calculer le cumac » du Deal — prime = cumac × champs × valo)</span></div>
  <div class="fld"><label>Mode de calcul de la prime</label>
    <select id="prime_mode" onchange="opPrimeMode(this.value)">
      <option value="standard" ${(p.mode||'standard')==='standard'?'selected':''}>Standard — cumac × valorisation ÷ 1000 (mode actuel)</option>
      <option value="multi" ${p.mode==='multi'?'selected':''}>Avancé — cumac × champs × valorisation ÷ 1000</option>
    </select>
  </div>
  ${factorsHtml}`;
}
function opPrimeMode(mode){
  opCaptureName();
  OPDRAFT.prime=OPDRAFT.prime||{mode:'standard',factors:[]};
  OPDRAFT.prime.mode=mode;
  renderOpEditor();
}
function primeCapture(){
  const mode=(document.getElementById('prime_mode')||{}).value||'standard';
  OPDRAFT.prime=OPDRAFT.prime||{};
  OPDRAFT.prime.mode=mode;
  if(!OPDRAFT.prime.factors)OPDRAFT.prime.factors=[];
}
function primeAddFactor(){
  opCaptureName();primeCapture();
  OPDRAFT.prime.factors.push({id:uid(),field:'',label:''});
  renderOpEditor();
}
function primeDelFactor(i){
  opCaptureName();primeCapture();
  OPDRAFT.prime.factors.splice(i,1);
  renderOpEditor();
}
function primeUpdateFactor(i,key,val){
  if(!OPDRAFT.prime||!OPDRAFT.prime.factors)return;
  OPDRAFT.prime.factors[i][key]=val;
}
/* ---- calcul automatique de la prime selon le mode configuré sur l'opération ---- */
