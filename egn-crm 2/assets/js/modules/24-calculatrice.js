/* ============================================================
   EGN CRM — modules/24-calculatrice.js
   Calculatrice de prime flottante
   ============================================================ */
/* ============================================================
   CALCULATRICE DE PRIME (bulle flottante)
   ============================================================ */
let CALC_STATE={opId:'',fields:{},cumac:'',delegId:'',type:'classique'};
function toggleCalcPrime(){
  const p=document.getElementById('calcPanel'),f=document.getElementById('calcFab');
  if(!p||!f)return;
  const open=p.classList.toggle('open');
  f.style.display=open?'none':'flex';
  if(open)renderCalcPrime();
}
function resetCalcPrime(){CALC_STATE={opId:'',fields:{},cumac:'',delegId:'',type:'classique'};renderCalcPrime();}
function setCalcOp(v){CALC_STATE.opId=v;CALC_STATE.fields={};CALC_STATE.cumac='';renderCalcPrime();}
function setCalcDeleg(v){CALC_STATE.delegId=v;updateCalcResult();}
function setCalcType(v){CALC_STATE.type=v;updateCalcResult();}
function setCalcCumac(el){CALC_STATE.cumac=el.value;updateCalcResult();}
function setCalcField(fid,el){
  CALC_STATE.fields[fid]=el.value;
  // Recalcule le cumac et l'injecte dans le champ (sans re-rendre le panneau)
  const op=getAllProducts().find(p=>p.id===CALC_STATE.opId);
  const c=op?computeCumac({productId:op.id,opFields:CALC_STATE.fields}):null;
  CALC_STATE.cumac=(c!=null)?String(c):'';
  const ci=document.getElementById('calc_cumac');
  if(ci&&document.activeElement!==ci)ci.value=CALC_STATE.cumac;
  updateCalcResult();
}
/* Détermine les champs nécessaires au calcul cumac d'une opération */
function calcFieldsNeeded(op){
  const out=[];const seen={};
  const lbl=id=>{const f=(op.fields||[]).find(x=>x.id===id);return f?(f.label||f.key||id):id;};
  const push=o=>{if(o.id&&!seen[o.id]){seen[o.id]=1;out.push(o);}};
  const c=op.cumac;if(!c)return out;
  if(c.mode==='coef'){
    if(c.byField)push({id:c.byField,label:lbl(c.byField),kind:'select',options:Object.keys(c.coefs||{})});
    if(c.field)push({id:c.field,label:lbl(c.field),kind:'number'});
  } else if(c.mode==='multi'){
    (c.factors||[]).forEach(f=>{
      if(f.type==='field')push({id:f.field,label:lbl(f.field),kind:'number'});
      else if(f.type==='table1d')push({id:f.field,label:lbl(f.field),kind:'select',options:Object.keys(f.table||{})});
      else if(f.type==='table2d'){
        const keys=Object.keys(f.table||{});
        push({id:f.field1,label:lbl(f.field1),kind:'select',options:[...new Set(keys.map(k=>k.split('|')[0]))]});
        push({id:f.field2,label:lbl(f.field2),kind:'select',options:[...new Set(keys.map(k=>k.split('|')[1]))]});
      }
    });
  }
  return out;
}
function renderCalcPrime(){
  const body=document.getElementById('calcBody');if(!body)return;
  const prods=getProducts().filter(p=>p.cumac);
  const delegs=getDelegataires();
  const S=CALC_STATE;
  let h=`<div class="cfld"><label>Opération <span style="text-transform:none;font-weight:500">(facultatif)</span></label>
    <select onchange="setCalcOp(this.value)"><option value="">— Saisie directe du cumac —</option>${prods.map(p=>`<option value="${p.id}" ${S.opId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>`;
  const op=prods.find(p=>p.id===S.opId);
  if(op){
    const needed=calcFieldsNeeded(op);
    if(!needed.length)h+=`<p style="font-size:.74rem;color:var(--text-mut);margin-bottom:.5rem">Aucun champ de calcul configuré — saisissez le cumac directement.</p>`;
    needed.forEach(f=>{
      const val=S.fields[f.id]||'';
      if(f.kind==='select'){
        h+=`<div class="cfld"><label>${esc(f.label)}</label><select onchange="setCalcField('${f.id}',this)"><option value="">— Choisir —</option>${f.options.map(o=>`<option value="${esc(o)}" ${val===o?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
      } else {
        h+=`<div class="cfld"><label>${esc(f.label)}</label><input type="text" inputmode="decimal" value="${esc(val)}" placeholder="0" oninput="setCalcField('${f.id}',this)"></div>`;
      }
    });
  }
  h+=`<div class="cfld"><label>Cumac (kWhc)</label>
    <input id="calc_cumac" type="text" inputmode="numeric" value="${esc(S.cumac)}" placeholder="ex : 250000" oninput="setCalcCumac(this)" style="font-weight:700"></div>`;
  h+=`<div class="cfld"><label>Délégataire</label>
    <select onchange="setCalcDeleg(this.value)"><option value="">— Choisir —</option>${delegs.map(d=>`<option value="${d.id}" ${S.delegId===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select></div>`;
  h+=`<div class="cfld"><label>Type de prime</label>
    <select onchange="setCalcType(this.value)">
      <option value="classique" ${S.type==='classique'?'selected':''}>Classique</option>
      <option value="precaire" ${S.type==='precaire'?'selected':''}>Précaire</option>
    </select></div>`;
  h+=`<div id="calcResult" style="border-top:1px solid var(--border-grey);margin-top:.4rem;padding-top:.7rem"></div>`;
  body.innerHTML=h;
  updateCalcResult();
}
function updateCalcResult(){
  const box=document.getElementById('calcResult');if(!box)return;
  const S=CALC_STATE;
  const eur=n=>(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  const cumac=parseFloat(String(S.cumac).replace(',','.'))||0;
  const k=calcPrimeCEE(S.delegId,S.type,cumac);
  const pret=cumac&&k.d&&(k.valoClient||k.valoCom);
  const lg=(lib,montant,coul,gras)=>`<div style="display:flex;justify-content:space-between;align-items:baseline;padding:.18rem 0">
    <span style="font-size:.74rem;${gras?'font-weight:700':'color:var(--text-mut)'}">${lib}</span>
    <span style="font-weight:${gras?800:700};font-size:.8rem;${coul?'color:'+coul:''}">${montant}</span></div>`;
  let h=lg('Cumac',cumac?cumac.toLocaleString('fr-FR')+' kWhc':'—');
  if(pret){
    h+=lg('Prime client',eur(k.primeClientBrut));
    h+=lg('dont HT comptabilisé',eur(k.primeClient));
    h+=lg('Commission HT',eur(k.comHT));
  }
  h+=`<div style="background:${pret?'#EFF7E8':'var(--bg-soft)'};border-radius:11px;padding:.65rem .85rem;text-align:center;margin-top:.45rem">
    <div style="font-size:.64rem;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.5px">Prime CEE TTC</div>
    <div style="font-size:1.4rem;font-weight:800;color:${pret?'var(--green-deep)':'var(--text-mut)'};line-height:1.25">${pret?eur(k.primeCEE):'—'}</div>
    ${pret?`<div style="font-size:.66rem;color:var(--text-mut)">dont ${eur(k.primeHT)} comptabilisé HT</div>`
          :`<div style="font-size:.66rem;color:var(--text-mut)">Cumac + délégataire requis</div>`}
  </div>`;
  box.innerHTML=h;
}

function computePrimeAuto(r){
  const op=getAllProducts().find(p=>p.id===r.productId);
  if(!op)return null;
  const cumac=computeCumac(r);if(cumac==null)return null;
  const deal=dealOf(r);
  const deleg=getDelegataires().find(d=>d.id===deal.delegataireId);
  if(!deleg)return null;
  const prime=op.prime||{mode:'standard'};
  // Coefficient multiplicateur eventuel propre a l'operation
  let product=1;
  if(prime.mode==='multi'){
    for(const f of (prime.factors||[])){
      const v=parseFloat((r.opFields&&r.opFields[f.field])||'')||0;
      if(!v)return null;
      product*=v;
    }
  }
  const k=calcPrimeCEE(deal.delegataireId,deal.type,cumac*product);
  if(!k.valoClient&&!k.valoCom)return null;
  return k.primeCEE;
}
function cumacEditorHtml(){
  const o=OPDRAFT;const c=o.cumac||{mode:'manuel'};
  const numFields=o.fields.filter(f=>f.type==='number'&&f.label&&f.label.trim());
  // La zone climatique est un critere disponible sans avoir a creer de champ :
  // elle est deduite du code postal du dossier.
  const ZONE_CRITERE={id:'__zone__',label:'🌡️ Zone climatique (H1 / H2 / H3)',type:'select',options:['H1','H2','H3']};
  const choiceFields=[ZONE_CRITERE].concat(o.fields.filter(f=>(f.type==='select'||f.type==='bool')&&f.label&&f.label.trim()));
  let h=`<div class="sectitle">Calcul automatique du cumac <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(optionnel — alimente le bouton « Calculer le cumac » de l'onglet Deal)</span></div>
  <div class="fld"><label>Mode de calcul</label><select id="cum_mode" onchange="opCumacMode(this.value)">
    <option value="manuel" ${(c.mode!=='coef'&&c.mode!=='multi')?'selected':''}>Aucun — saisie manuelle du cumac</option>
    <option value="coef" ${c.mode==='coef'?'selected':''}>Coefficient × champ numérique (simple)</option>
    <option value="multi" ${c.mode==='multi'?'selected':''}>Facteurs multiples en cascade (avancé — surface × zone × secteur…)</option>
  </select></div>`;
  if(c.mode==='coef'){
    if(!numFields.length)h+=`<p class="muted" style="margin-top:.5rem;color:var(--coral)">Ajoutez d'abord un champ de type « Nombre » (ex : puissance en kW) à utiliser dans le calcul.</p>`;
    h+=`<div class="fgrid" style="margin-top:.5rem">
      <div class="fld"><label>Champ numérique à multiplier</label><select id="cum_field" onchange="opCumacField('field',this.value)"><option value="">— Choisir —</option>${numFields.map(f=>`<option value="${f.id}" ${c.field===f.id?'selected':''}>${esc(f.label)}</option>`).join('')}</select></div>
      <div class="fld"><label>Le coefficient dépend d'un champ ?</label><select id="cum_byfield" onchange="opCumacField('byField',this.value)"><option value="">Non — coefficient fixe</option>${choiceFields.map(f=>`<option value="${f.id}" ${c.byField===f.id?'selected':''}>${esc(f.label)}</option>`).join('')}</select></div>
    </div>`;
    if(c.byField){
      const bf=c.byField==='__zone__'?ZONE_CRITERE:o.fields.find(f=>f.id===c.byField);
      const opts=bf?(bf.type==='bool'?['Oui','Non']:(bf.options||[])):[];
      h+=`<div class="fgrid" style="margin-top:.5rem">`+(opts.length?opts.map(op=>`<div class="fld"><label>Coefficient pour « ${esc(op)} » (kWhc / unité)</label><input type="number" step="any" data-opt="${esc(op)}" value="${(c.coefs&&c.coefs[op]!=null&&c.coefs[op]!==0)?c.coefs[op]:''}" onchange="opCumacCoef(this.dataset.opt,this.value)" placeholder="coef. fiche"></div>`).join(''):`<p class="muted">Ce champ « choix » n'a pas encore d'options.</p>`)+`</div>`;
    } else {
      h+=`<div class="fld" style="margin-top:.5rem"><label>Coefficient fixe (kWhc / unité)</label><input type="number" step="any" value="${c.coef?c.coef:''}" onchange="opCumacCoef('',this.value)" placeholder="ex : 156"></div>`;
    }
    h+=`<p class="muted" style="margin-top:.45rem;font-size:.74rem"><b>Formule :</b> cumac = coefficient × valeur du champ. Ex. BAT-TH-142 : coefficient (Convectif / Radiatif, à saisir d'après la fiche) × puissance (kW).</p>`;
  }
  if(c.mode==='multi'){
    const factors=c.factors||[];
    h+=`<p class="muted" style="margin-top:.5rem;font-size:.78rem">Le cumac est le <b>produit</b> de tous les facteurs ci-dessous (multipliés entre eux). Chaque facteur peut être une valeur fixe, un champ numérique, ou une table de correspondance selon 1 ou 2 critères (croisés). Si le champ nécessaire n'existe pas encore sur la fiche, il est <b>créé automatiquement</b> quand tu l'ajoutes ici.</p>`;
    h+=`<div class="cfg-list" style="margin-top:.6rem">`;
    if(!factors.length)h+=`<div class="muted" style="font-size:.82rem;padding:.4rem 0">Aucun facteur. Ajoutez le premier ci-dessous (ex : coefficient de base selon zone climatique).</div>`;
    else factors.forEach((f,i)=>{
      const typeLbl={fixed:'Valeur fixe',field:'Champ numérique',table1d:'Table (1 critère)',table2d:'Table (2 critères croisés)'}[f.type]||f.type;
      h+=`<div class="cfg-item"><span class="nm">${i+1}. ${esc(f.label||'(sans nom)')}</span><span class="tag" style="background:#eef0f2;color:#6b7785">${typeLbl}</span><span class="sp"><button class="iconbtn" onclick="opEditFactor(${i})">✏️</button><button class="iconbtn del" onclick="opDelFactor(${i})">🗑️</button></span></div>`;
    });
    h+=`</div><button class="btn btn-ghost btn-sm" style="margin-top:.6rem" onclick="opAddFactor()">+ Ajouter un facteur</button>
    <p class="muted" style="margin-top:.5rem;font-size:.74rem"><b>Formule :</b> cumac = ${factors.length?factors.map(f=>esc(f.label||'?')).join(' × '):'facteur 1 × facteur 2 × …'}</p>`;
  }
  return h;
}
function opEnsureCumac(){OPDRAFT.cumac=OPDRAFT.cumac||{mode:'manuel',field:'',byField:'',coef:0,coefs:{},factors:[]};if(!OPDRAFT.cumac.factors)OPDRAFT.cumac.factors=[];return OPDRAFT.cumac;}
function opCumacMode(m){opCaptureName();opEnsureCumac().mode=m;renderOpEditor();}
function opCumacField(k,v){opCaptureName();const c=opEnsureCumac();c[k]=v;if(k==='byField')c.coefs=c.coefs||{};renderOpEditor();}
function opCumacCoef(opt,v){const c=opEnsureCumac();const num=parseFloat(String(v||'').replace(',','.'))||0;if(!opt)c.coef=num;else{c.coefs=c.coefs||{};c.coefs[opt]=num;}}
let CUMFACTOR_IDX=null;
function opAddFactor(){opCaptureName();const c=opEnsureCumac();CUMFACTOR_IDX=c.factors.length;c.factors.push({id:uid(),type:'fixed',label:'',value:1});renderFactorEditor();}
function opEditFactor(i){opCaptureName();CUMFACTOR_IDX=i;renderFactorEditor();}
function opDelFactor(i){opCaptureName();opEnsureCumac().factors.splice(i,1);renderOpEditor();}
function fieldPickerHtml(idPrefix,kind,selectedId){
  const ZONE_CRITERE={id:'__zone__',label:'🌡️ Zone climatique (H1 / H2 / H3)'};
  const base=kind==='number'
    ?OPDRAFT.fields.filter(x=>x.type==='number'&&x.label&&x.label.trim())
    :OPDRAFT.fields.filter(x=>(x.type==='select'||x.type==='bool')&&x.label&&x.label.trim());
  const fields=kind==='choice'?[ZONE_CRITERE].concat(base):base;
  return `<div class="fld"><label>Champ existant</label><select id="${idPrefix}_sel"><option value="">— Aucun (créer un nouveau champ ci-dessous) —</option>${fields.map(x=>`<option value="${x.id}" ${selectedId===x.id?'selected':''}>${esc(x.label)}</option>`).join('')}</select></div>
  <div class="fld"><label>Ou créer un nouveau champ ${kind==='choice'?'(liste déroulante)':'(nombre)'}</label><input id="${idPrefix}_new" placeholder="${kind==='choice'?'Ex : Zone climatique':'Ex : Surface totale chauffée (m²)'}"></div>
  ${kind==='choice'?`<div class="fld"><label>Options du nouveau champ — une par ligne <span class="muted" style="font-size:.66rem">(ignoré si tu choisis un champ existant)</span></label><textarea id="${idPrefix}_newopts" rows="3" placeholder="H1&#10;H2&#10;H3"></textarea></div>`:''}`;
}
function resolveOrCreateField(idPrefix,kind){
  const newEl=document.getElementById(idPrefix+'_new');
  const newName=newEl?newEl.value.trim():'';
  if(newName){
    let opts=[];
    if(kind==='choice'){
      const oEl=document.getElementById(idPrefix+'_newopts');
      opts=oEl?oEl.value.split('\n').map(s=>s.trim()).filter(Boolean):[];
      if(!opts.length){toast('Ajoutez au moins une option pour ce nouveau champ','err');return '';}
    }
    const nf={id:uid(),label:newName,type:kind==='choice'?'select':'number',options:opts,required:false};
    OPDRAFT.fields.push(nf);
    return nf.id;
  }
  const selEl=document.getElementById(idPrefix+'_sel');
  return selEl?selEl.value:'';
}
function renderFactorTypeBody(f){
  if(f.type==='fixed')return `<div class="fld" style="margin-top:.5rem"><label>Valeur</label><input type="number" step="any" id="cf_fixed_val" value="${f.value!=null?f.value:''}" placeholder="ex : 1"></div>`;
  if(f.type==='field')return `<div style="margin-top:.5rem">${fieldPickerHtml('cf_field','number',f.field)}</div>`;
  if(f.type==='table1d'){
    let h=`<div style="margin-top:.5rem">${fieldPickerHtml('cf_t1','choice',f.field)}</div>
    <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="cfGenerateTable1d()">→ Générer la grille de valeurs</button>`;
    if(f.field){
      const bf=f.field==='__zone__'?{type:'select',options:['H1','H2','H3']}:OPDRAFT.fields.find(x=>x.id===f.field);
      const opts=bf?(bf.type==='bool'?['Oui','Non']:(bf.options||[])):[];
      if(opts.length)h+=`<div class="fgrid" style="margin-top:.6rem">`+opts.map(o=>`<div class="fld"><label>${esc(o)}</label><input type="number" step="any" data-opt="${esc(o)}" class="cf-t1-val" value="${f.table&&f.table[o]!=null?f.table[o]:''}" placeholder="0"></div>`).join('')+`</div>`;
    }
    return h;
  }
  if(f.type==='table2d'){
    let h=`<div style="margin-top:.5rem">${fieldPickerHtml('cf_t2a','choice',f.field1)}</div>
    <div style="margin-top:.5rem">${fieldPickerHtml('cf_t2b','choice',f.field2)}</div>
    <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="cfGenerateTable2d()">→ Générer la grille croisée</button>`;
    if(f.field1&&f.field2){
      const zc={id:'__zone__',label:'Zone climatique',type:'select',options:['H1','H2','H3']};
      const bf1=f.field1==='__zone__'?zc:OPDRAFT.fields.find(x=>x.id===f.field1),
            bf2=f.field2==='__zone__'?zc:OPDRAFT.fields.find(x=>x.id===f.field2);
      const opts1=bf1?(bf1.type==='bool'?['Oui','Non']:(bf1.options||[])):[];
      const opts2=bf2?(bf2.type==='bool'?['Oui','Non']:(bf2.options||[])):[];
      if(opts1.length&&opts2.length)h+=`<div class="tbl-wrap" style="margin-top:.6rem;overflow-x:auto"><table class="tbl"><thead><tr><th>${esc(bf1.label)} \\ ${esc(bf2.label)}</th>${opts2.map(o2=>`<th>${esc(o2)}</th>`).join('')}</tr></thead><tbody>${opts1.map(o1=>`<tr><td style="font-weight:700">${esc(o1)}</td>${opts2.map(o2=>{const k=o1+'|'+o2;return `<td><input type="number" step="any" class="cf-t2-val" data-key="${esc(k)}" value="${f.table&&f.table[k]!=null?f.table[k]:''}" style="width:80px" placeholder="0"></td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    return h;
  }
  return '';
}
function renderFactorEditor(){
  const c=opEnsureCumac();const f=c.factors[CUMFACTOR_IDX];if(!f)return;
  let body=`<div class="fld"><label>Nom du facteur</label><input id="cf_label" value="${esc(f.label)}" placeholder="Ex : Coefficient de base, Surface totale, Facteur secteur…"></div>
  <div class="fld" style="margin-top:.5rem"><label>Type de facteur</label><select id="cf_type" onchange="cfTypeChange(this.value)">
    <option value="fixed" ${f.type==='fixed'?'selected':''}>Valeur fixe</option>
    <option value="field" ${f.type==='field'?'selected':''}>Champ numérique de la fiche (ex : Surface)</option>
    <option value="table1d" ${f.type==='table1d'?'selected':''}>Table selon 1 critère (ex : Secteur → facteur)</option>
    <option value="table2d" ${f.type==='table2d'?'selected':''}>Table selon 2 critères croisés (ex : Etas × Zone climatique)</option>
  </select></div>
  <div id="cf_body">${renderFactorTypeBody(f)}</div>`;
  openModal('Facteur : '+(f.label||'nouveau'),body,`<button class="btn btn-ghost" onclick="renderOpEditor()">← Retour</button><button class="btn btn-pri" onclick="factorSave()">✓ Valider le facteur</button>`,'wide');
}
function cfTypeChange(t){
  const c=opEnsureCumac();const f=c.factors[CUMFACTOR_IDX];
  const lab=document.getElementById('cf_label');if(lab)f.label=lab.value.trim();
  f.type=t;
  renderFactorEditor();
}
function cfGenerateTable1d(){
  const c=opEnsureCumac();const f=c.factors[CUMFACTOR_IDX];
  const lab=document.getElementById('cf_label');if(lab)f.label=lab.value.trim();
  const fid=resolveOrCreateField('cf_t1','choice');
  if(!fid){toast('Choisissez ou créez un champ','err');return;}
  f.field=fid;f.table=f.table||{};
  renderFactorEditor();
}
function cfGenerateTable2d(){
  const c=opEnsureCumac();const f=c.factors[CUMFACTOR_IDX];
  const lab=document.getElementById('cf_label');if(lab)f.label=lab.value.trim();
  const fid1=resolveOrCreateField('cf_t2a','choice');
  const fid2=resolveOrCreateField('cf_t2b','choice');
  if(!fid1||!fid2){toast('Choisissez ou créez les deux champs','err');return;}
  f.field1=fid1;f.field2=fid2;f.table=f.table||{};
  renderFactorEditor();
}
function factorSave(){
  const c=opEnsureCumac();const f=c.factors[CUMFACTOR_IDX];
  const label=(document.getElementById('cf_label')||{value:''}).value.trim();
  if(!label){toast('Nom du facteur requis','err');return;}
  f.label=label;
  if(f.type==='fixed'){
    f.value=parseFloat(String((document.getElementById('cf_fixed_val')||{value:''}).value||'').replace(',','.'))||0;
  }else if(f.type==='field'){
    const fid=resolveOrCreateField('cf_field','number');
    if(!fid){toast('Choisissez ou créez un champ numérique','err');return;}
    f.field=fid;
  }else if(f.type==='table1d'){
    if(!f.field){toast('Cliquez sur « Générer la grille » avant de valider','err');return;}
    f.table=f.table||{};
    document.querySelectorAll('.cf-t1-val').forEach(inp=>{f.table[inp.dataset.opt]=parseFloat(String(inp.value||'').replace(',','.'))||0;});
  }else if(f.type==='table2d'){
    if(!f.field1||!f.field2){toast('Cliquez sur « Générer la grille croisée » avant de valider','err');return;}
    f.table=f.table||{};
    document.querySelectorAll('.cf-t2-val').forEach(inp=>{f.table[inp.dataset.key]=parseFloat(String(inp.value||'').replace(',','.'))||0;});
  }
  renderOpEditor();
}
function opCaptureName(){const e=document.getElementById('op_name');if(e)OPDRAFT.name=e.value.trim();}
function opAddField(){opCaptureName();OPFIELD_IDX=OPDRAFT.fields.length;OPDRAFT.fields.push({id:uid(),label:'',type:'text',options:[],required:false});renderFieldEditor();}
function opEditField(i){opCaptureName();OPFIELD_IDX=i;renderFieldEditor();}
function opDelField(i){opCaptureName();OPDRAFT.fields.splice(i,1);renderOpEditor();}
function opMoveField(i,dir){opCaptureName();const j=i+dir;if(j<0||j>=OPDRAFT.fields.length)return;const t=OPDRAFT.fields[i];OPDRAFT.fields[i]=OPDRAFT.fields[j];OPDRAFT.fields[j]=t;renderOpEditor();}
function renderFieldEditor(){
  const f=OPDRAFT.fields[OPFIELD_IDX];
  const typeOpts=Object.entries(FIELD_TYPES).map(([k,v])=>`<option value="${k}" ${f.type===k?'selected':''}>${v}</option>`).join('');
  let body=`<div class="fgrid">
    <div class="fld full"><label>Libellé de la question</label><input id="fld_label" value="${esc(f.label)}" placeholder="Ex : Type de chaudière actuelle"></div>
    <div class="fld"><label>Type de champ</label><select id="fld_type" onchange="fieldTypeChange(this.value)">${typeOpts}</select></div>
    <div class="fld"><label>Obligatoire ?</label><select id="fld_req"><option value="no" ${!f.required?'selected':''}>Non</option><option value="yes" ${f.required?'selected':''}>Oui</option></select></div>
    <div class="fld full" id="fld_opts_wrap" style="${f.type==='select'?'':'display:none'}"><label>Options de la liste — une par ligne</label><textarea id="fld_opts" rows="4" placeholder="Maison individuelle&#10;Appartement">${esc((f.options||[]).join('\n'))}</textarea></div>
  </div>
  <p class="muted" style="margin-top:.4rem">Astuce : « Liste déroulante » pour des choix fixes, « Oui / Non » pour une case à cocher, « Texte long » pour un commentaire.</p>`;
  openModal('Champ : '+(f.label||'nouveau'),body,`<button class="btn btn-ghost" onclick="renderOpEditor()">← Retour</button><button class="btn btn-pri" onclick="fieldSave()">✓ Valider le champ</button>`,'wide');
}
function fieldTypeChange(t){const w=document.getElementById('fld_opts_wrap');if(w)w.style.display=t==='select'?'':'none';}
function fieldSave(){
  const f=OPDRAFT.fields[OPFIELD_IDX];
  const label=val('fld_label');
  if(!label){toast('Libellé requis','err');return;}
  f.label=label;f.type=val('fld_type');f.required=val('fld_req')==='yes';
  f.options=f.type==='select'?document.getElementById('fld_opts').value.split('\n').map(s=>s.trim()).filter(Boolean):[];
  renderOpEditor();
}
function saveOperation(){
  opCaptureName();primeCapture();
  if(!OPDRAFT.name){toast("Nom de l'opération requis",'err');return;}
  OPDRAFT.fields=OPDRAFT.fields.filter(f=>f.label&&f.label.trim());
  OPDRAFT.etudeType=val('op_etudetype')||'';
  OPDRAFT.segment=OPDRAFT.segment||SEGMENT;
  const ops=getAllProducts();const idx=ops.findIndex(o=>o.id===OPDRAFT.id);
  if(idx>=0)ops[idx]=OPDRAFT;else ops.push(OPDRAFT);
  save(K.prod,ops);OPDRAFT=null;closeModal();renderSettings();buildNav();toast('Opération enregistrée ✓','ok');
}

