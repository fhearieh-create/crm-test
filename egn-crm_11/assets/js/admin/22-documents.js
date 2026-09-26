/* ============================================================
   EGN CRM — admin/22-documents.js
   Modeles e-mail, documents HTML et PDF, parametres, diagnostic
   ============================================================ */
/* ====================================================================
   MODÈLES D'E-MAIL & ENVOI (via Gmail Workspace)
   ==================================================================== */
const MAIL_VARS=[
 ['raison_sociale','Raison sociale'],['signataire','Signataire (prénom nom)'],['nom','Nom'],['prenom','Prénom'],['fonction','Fonction'],
 ['tel','Téléphone'],['email','Email'],['nom_site','Nom du site'],
 ['adresse','Adresse siège'],['cp','Code postal'],['ville','Ville'],['adresse_travaux','Adresse des travaux'],
 ['dossier','N° dossier'],['operation','Opération'],['zone','Zone climatique'],
 ['delegataire','Délégataire'],['type_prime','Type de prime'],['cumac','Cumac'],['prime','Prime €'],
 ['date_rdv','Date du RDV'],['heure_rdv','Heure du RDV'],['type_rdv','Type du RDV'],['intervenant_rdv','Intervenant du RDV'],
 ['moi','Mon nom'],['ma_societe','Ma société'],['mon_email','Mon email'],['date_jour','Date du jour']
];
/* ============================================================
   MODÈLES DE DOCUMENTS (onglet Administration ▸ Documents)
   Réservé Super Admin. Éditeur type Word avec pages + placeholders {{...}}.
   ============================================================ */
const getDocTemplates=()=>load('egncrm_doctemplates',[]);
/* ============================================================
   MODELES PDF
   On depose un PDF existant, puis on place dessus les champs de
   la fiche. A la generation, les valeurs sont ecrites sur le PDF
   d'origine, qui reste intact.
   ============================================================ */
let PDFDRAFT=null, PDF_PAGE=0, PDF_DOC=null, PDF_ECHELLE=1, PDF_CHAMP=null;
/* Champs proposables, tires des variables deja gerees par les modeles */
function pdfChampsDisponibles(){
  const groupes=[
    {g:'Client',items:[['raison_sociale','Raison sociale'],['signataire','Nom complet'],['nom','Nom'],['prenom','Prénom'],
      ['fonction','Fonction'],['tel','Téléphone mobile'],['tel_fixe','Téléphone fixe'],['email','Email'],['nom_site','Nom du site'],['siret','SIRET']]},
    {g:'Adresses',items:[['adresse','Adresse'],['cp','Code postal'],['ville','Ville'],['adresse_travaux','Adresse des travaux']]},
    {g:'Dossier',items:[['dossier','N° de dossier'],['operation','Opération'],['zone','Zone'],['date_installation',"Date d'installation"],['date_jour',"Date du jour"]]},
    {g:'Prime',items:[['delegataire','Délégataire'],['type_prime','Type de prime'],['cumac','Cumac'],['prime','Prime CEE TTC']]},
    {g:'Rendez-vous',items:[['date_rdv','Date du RDV'],['heure_rdv','Heure'],['type_rdv','Type'],['intervenant_rdv','Intervenant']]},
    {g:'Société',items:[['ma_societe','Ma société'],['mon_email','Mon email'],['moi','Mon nom']]}
  ];
  return groupes;
}
function pdfLibelleChamp(cle){
  for(const g of pdfChampsDisponibles()){
    const t=g.items.find(i=>i[0]===cle);
    if(t)return t[1];
  }
  return cle;
}
function getPdfTemplates(){return load('egncrm_pdf_templates',[]);}
function savePdfTemplates(v){save('egncrm_pdf_templates',v);}

async function ouvrirModelePdf(id){
  const ts=getPdfTemplates();
  PDFDRAFT=id?JSON.parse(JSON.stringify(ts.find(t=>t.id===id)||{})):{id:uid(),nom:'',operationIds:[],path:'',champs:[]};
  PDF_PAGE=0;PDF_DOC=null;PDF_CHAMP=null;
  openModal('📄 Modèle PDF',`<div id="pdfEditor"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="enregistrerModelePdf()">💾 Enregistrer</button>`,'wide');
  renderPdfEditor();
  if(PDFDRAFT.path)chargerApercuPdf();
}
function renderPdfEditor(){
  const box=document.getElementById('pdfEditor');if(!box)return;
  const d=PDFDRAFT;
  const ops=getProducts();
  let h=`<div class="fgrid">
    <div class="fld"><label>Nom du modèle</label><input id="pdf_nom" value="${esc(d.nom||'')}" placeholder="Ex : Attestation sur l'honneur" oninput="PDFDRAFT.nom=this.value"></div>
    <div class="fld"><label>Fichier PDF</label>
      ${d.path?`<div style="display:flex;align-items:center;gap:.4rem"><span style="font-size:.82rem;font-weight:700">📕 ${esc(d.fichierNom||'PDF chargé')}</span>
        <button class="btn btn-ghost btn-sm" style="font-size:.7rem" onclick="retirerPdfModele()">✕ Remplacer</button></div>`
      :`<label class="btn btn-navy btn-sm" style="cursor:pointer">⬆️ Choisir un PDF<input type="file" accept="application/pdf" style="display:none" onchange="deposerPdfModele(this)"></label>`}
    </div>
  </div>
  <div class="fld" style="margin-top:.5rem"><label>Opérations concernées <span class="muted" style="font-size:.62rem;text-transform:none;letter-spacing:0">— aucune cochée = toutes</span></label>
    <div style="display:flex;flex-wrap:wrap;gap:.3rem">${ops.map(o=>`<label style="display:flex;align-items:center;gap:.25rem;font-size:.78rem;background:var(--bg-soft);border-radius:7px;padding:.2rem .5rem;cursor:pointer">
      <input type="checkbox" ${(d.operationIds||[]).includes(o.id)?'checked':''} onchange="togglePdfOp('${o.id}',this.checked)">${esc(o.name)}</label>`).join('')}</div>
  </div>`;

  if(!d.path){
    h+=`<div class="empty" style="margin-top:1rem"><div class="big">📄</div>Choisissez un PDF pour commencer à y placer des champs.</div>`;
    box.innerHTML=h;return;
  }

  // Palette des champs
  h+=`<div class="sectitle" style="margin-top:1rem">Champ à placer</div>
  <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin-bottom:.6rem">
    <select id="pdf_champ" style="font-family:'Saira',sans-serif;font-size:.82rem;border:1.5px solid var(--border-grey);border-radius:8px;padding:.35rem .65rem;background:#fff;outline:none;font-weight:700">
      ${pdfChampsDisponibles().map(g=>`<optgroup label="${esc(g.g)}">${g.items.map(i=>`<option value="${i[0]}" ${PDF_CHAMP===i[0]?'selected':''}>${esc(i[1])}</option>`).join('')}</optgroup>`).join('')}
    </select>
    <span class="muted" style="font-size:.78rem">puis <b>cliquez sur le PDF</b> à l'endroit voulu</span>
  </div>`;

  // Apercu avec les champs deja places
  h+=`<div style="display:flex;gap:.4rem;align-items:center;margin-bottom:.4rem;flex-wrap:wrap">
    <button class="btn btn-ghost btn-sm" onclick="pdfPage(-1)">← Page précédente</button>
    <span id="pdf_pagelbl" style="font-size:.8rem;font-weight:700">Page ${PDF_PAGE+1}</span>
    <button class="btn btn-ghost btn-sm" onclick="pdfPage(1)">Page suivante →</button>
  </div>
  <div id="pdfScene" style="position:relative;display:inline-block;border:1.5px solid var(--border-grey);border-radius:8px;overflow:hidden;background:#fff">
    <canvas id="pdfCanvas" onclick="placerChampPdf(event)" style="display:block;cursor:crosshair;max-width:100%"></canvas>
    <div id="pdfOverlay" style="position:absolute;inset:0;pointer-events:none"></div>
  </div>`;

  // Liste des champs places
  const surPage=(d.champs||[]).filter(ch=>ch.page===PDF_PAGE);
  h+=`<div class="sectitle" style="margin-top:1rem">Champs placés — page ${PDF_PAGE+1} <span class="muted" style="font-weight:500;text-transform:none;letter-spacing:0">(${(d.champs||[]).length} au total)</span></div>`;
  if(!surPage.length)h+=`<p class="muted" style="font-size:.8rem">Aucun champ sur cette page.</p>`;
  else{
    const inp="font-family:'Saira',sans-serif;font-size:.76rem;border:1.5px solid var(--border-grey);border-radius:6px;padding:2px 5px";
    h+=`<div class="cfg-list">`+surPage.map(ch=>{
      const{rx,ry}=champRatio(ch);
      return `<div class="cfg-item" style="flex-wrap:wrap;gap:.45rem">
      <span class="nm" style="flex:1;min-width:150px">${esc(pdfLibelleChamp(ch.cle))}
        <span class="muted" style="font-weight:400;font-size:.7rem">— ${Math.round(rx*100)} % / ${Math.round(ry*100)} %</span></span>
      <label style="font-size:.72rem;display:flex;align-items:center;gap:.25rem">Largeur
        <input type="number" min="5" max="100" value="${Math.round((ch.largeur||0.30)*100)}" onchange="majChampPdf('${ch.id}','largeur',this.value/100)" style="width:58px;${inp}"> %</label>
      <label style="font-size:.72rem;display:flex;align-items:center;gap:.25rem">Taille
        <input type="number" min="5" max="40" value="${ch.taille||11}" onchange="majChampPdf('${ch.id}','taille',this.value)" style="width:52px;${inp}"></label>
      <select onchange="majChampPdf('${ch.id}','align',this.value)" style="${inp};font-weight:700">
        <option value="left" ${ch.align!=='center'&&ch.align!=='right'?'selected':''}>⬅ Gauche</option>
        <option value="center" ${ch.align==='center'?'selected':''}>↔ Centré</option>
        <option value="right" ${ch.align==='right'?'selected':''}>➡ Droite</option>
      </select>
      <label style="font-size:.72rem;display:flex;align-items:center;gap:.25rem;cursor:pointer" title="Passer à la ligne au lieu de réduire le texte">
        <input type="checkbox" ${ch.retour?'checked':''} onchange="majChampPdf('${ch.id}','retour',this.checked)"> Multi-lignes</label>
      <button class="iconbtn del" title="Retirer" onclick="retirerChampPdf('${ch.id}')">🗑️</button>
    </div>`;}).join('')+`</div>
    <p class="muted" style="font-size:.74rem;margin-top:.4rem">Le texte est réduit automatiquement pour tenir dans la largeur. Cochez <b>Multi-lignes</b> pour qu'il passe à la ligne à la place — utile pour une adresse.</p>`;
  }
  box.innerHTML=h;
  if(PDF_DOC)dessinerPagePdf();
}
function togglePdfOp(id,on){
  PDFDRAFT.operationIds=PDFDRAFT.operationIds||[];
  PDFDRAFT.operationIds=on?[...new Set([...PDFDRAFT.operationIds,id])]:PDFDRAFT.operationIds.filter(x=>x!==id);
}
async function deposerPdfModele(input){
  const file=(input.files||[])[0];if(!file)return;
  try{
    const path=`docs_admin/modeles/${PDFDRAFT.id}-${file.name}`.replace(/[^a-zA-Z0-9/_.\-]/g,'_');
    const{error}=await SUPA.storage.from(ATTACH_BUCKET).upload(path,file,{upsert:true});
    if(error)throw error;
    PDFDRAFT.path=path;PDFDRAFT.fichierNom=file.name;PDF_PAGE=0;PDF_DOC=null;
    renderPdfEditor();chargerApercuPdf();
    toast('PDF chargé ✓','ok');
  }catch(e){toast('Échec du chargement : '+(e.message||e),'err');}
}
function retirerPdfModele(){
  PDFDRAFT.path='';PDFDRAFT.fichierNom='';PDFDRAFT.champs=[];PDF_DOC=null;renderPdfEditor();
}
async function chargerApercuPdf(){
  try{
    const url=await signedUrl(PDFDRAFT.path);
    if(!url){toast('PDF introuvable','err');return;}
    const data=await (await fetch(url)).arrayBuffer();
    PDFDRAFT._bytes=data.slice(0);
    PDF_DOC=await pdfjsLib.getDocument({data}).promise;
    dessinerPagePdf();
  }catch(e){console.error('[pdf]',e);toast('Aperçu impossible : '+(e.message||e),'err');}
}
async function dessinerPagePdf(){
  if(!PDF_DOC)return;
  const cv=document.getElementById('pdfCanvas');if(!cv)return;
  const page=await PDF_DOC.getPage(PDF_PAGE+1);
  const vue=page.getViewport({scale:1});
  const largeurCible=Math.min(760,vue.width);
  PDF_ECHELLE=largeurCible/vue.width;
  const v=page.getViewport({scale:PDF_ECHELLE});
  cv.width=v.width;cv.height=v.height;
  await page.render({canvasContext:cv.getContext('2d'),viewport:v}).promise;
  dessinerChampsPdf();
  const lbl=document.getElementById('pdf_pagelbl');
  if(lbl)lbl.textContent=`Page ${PDF_PAGE+1} sur ${PDF_DOC.numPages}`;
}
function dessinerChampsPdf(){
  const ov=document.getElementById('pdfOverlay');if(!ov)return;
  const cv=document.getElementById('pdfCanvas');if(!cv)return;
  ov.innerHTML=(PDFDRAFT.champs||[]).filter(ch=>ch.page===PDF_PAGE).map(ch=>{
    const{rx,ry}=champRatio(ch);
    const larg=(ch.largeur||0.30)*cv.width;
    const aligne=ch.align==='center'?'center':(ch.align==='right'?'right':'left');
    return `<div style="position:absolute;left:${rx*cv.width}px;top:${ry*cv.height}px;width:${larg}px;
      transform:translateY(-100%);box-sizing:border-box;
      background:rgba(124,194,66,.15);border:1px dashed var(--green);border-radius:3px;padding:0 2px;
      font-size:${(ch.taille||11)*PDF_ECHELLE}px;font-weight:700;color:var(--green-deep);
      text-align:${aligne};overflow:hidden;${ch.retour?'':'white-space:nowrap'}">
      ${esc(pdfLibelleChamp(ch.cle))}</div>`;
  }).join('');
}
function pdfPage(d){
  if(!PDF_DOC)return;
  const n=PDF_PAGE+d;
  if(n<0||n>=PDF_DOC.numPages)return;
  PDF_PAGE=n;renderPdfEditor();
}
function placerChampPdf(ev){
  const cle=(document.getElementById('pdf_champ')||{}).value;
  if(!cle){toast('Choisissez un champ','err');return;}
  const cv=ev.currentTarget;
  const r=cv.getBoundingClientRect();
  // Proportions de la page (0 a 1) : independantes de l'echelle d'affichage
  const rx=Math.min(1,Math.max(0,(ev.clientX-r.left)/r.width));
  const ry=Math.min(1,Math.max(0,(ev.clientY-r.top)/r.height));
  PDFDRAFT.champs=PDFDRAFT.champs||[];
  PDFDRAFT.champs.push({id:uid(),cle,page:PDF_PAGE,rx,ry,largeur:0.30,taille:11,align:'left',retour:false});
  PDF_CHAMP=cle;
  renderPdfEditor();
}
/* Anciens champs enregistres en points : convertis a la volee */
function champRatio(ch){
  if(ch.rx!=null)return{rx:ch.rx,ry:ch.ry};
  const cv=document.getElementById('pdfCanvas');
  if(!cv||!cv.width)return{rx:0,ry:0};
  return{rx:(ch.x*PDF_ECHELLE)/cv.width,ry:(ch.y*PDF_ECHELLE)/cv.height};
}
function retirerChampPdf(id){
  PDFDRAFT.champs=(PDFDRAFT.champs||[]).filter(c=>c.id!==id);renderPdfEditor();
}
function majChampPdf(id,cle,val){
  const ch=(PDFDRAFT.champs||[]).find(c=>c.id===id);if(!ch)return;
  if(cle==='align')ch.align=val;
  else if(cle==='retour')ch.retour=!!val;
  else if(cle==='largeur')ch.largeur=Math.min(1,Math.max(0.05,parseFloat(val)||0.30));
  else ch.taille=Math.min(40,Math.max(5,parseFloat(val)||11));
  renderPdfEditor();
}
function enregistrerModelePdf(){
  if(!PDFDRAFT.nom||!PDFDRAFT.nom.trim()){toast('Donnez un nom au modèle','err');return;}
  if(!PDFDRAFT.path){toast('Chargez un PDF','err');return;}
  const copie={...PDFDRAFT};delete copie._bytes;
  const ts=getPdfTemplates().filter(t=>t.id!==copie.id);
  ts.push(copie);savePdfTemplates(ts);
  closeModal();renderDocsTab();toast('Modèle PDF enregistré ✓','ok');
}
function supprimerModelePdf(id){
  const t=getPdfTemplates().find(x=>x.id===id);if(!t)return;
  modalConfirm('Supprimer ce modèle PDF ?',esc(t.nom||''),async()=>{
    if(t.path){try{await SUPA.storage.from(ATTACH_BUCKET).remove([t.path]);}catch(e){}}
    savePdfTemplates(getPdfTemplates().filter(x=>x.id!==id));
    deleteRemoteRow('egncrm_pdf_templates',id);
    closeModal();renderDocsTab();toast('Modèle supprimé','ok');
  });
}
/* Generation : ecrit les valeurs du dossier sur le PDF d'origine */
async function genererPdfDepuisModele(tplId,recId){
  const t=getPdfTemplates().find(x=>x.id===tplId);
  const r=recById(recId);
  if(!t||!r){toast('Modèle ou dossier introuvable','err');return;}
  try{
    toast('Génération en cours…','ok');
    const url=await signedUrl(t.path);
    if(!url)throw new Error('PDF du modèle inaccessible');
    const bytes=await (await fetch(url)).arrayBuffer();
    const{PDFDocument,StandardFonts,rgb}=PDFLib;
    const pdf=await PDFDocument.load(bytes);
    const police=await pdf.embedFont(StandardFonts.Helvetica);
    const v=tplVars(r);
    const pages=pdf.getPages();
    (t.champs||[]).forEach(ch=>{
      const page=pages[ch.page];if(!page)return;
      const texte=String(v[ch.cle]??'').trim();
      if(!texte)return;
      const{width:pw,height:ph}=page.getSize();
      // Position en proportions de la page ; repli sur les anciens champs en points
      const rx=ch.rx!=null?ch.rx:(ch.x||0)/pw;
      const ry=ch.ry!=null?ch.ry:(ch.y||0)/ph;
      const x0=rx*pw, yHaut=ry*ph;
      const largeur=Math.max(10,(ch.largeur||0.30)*pw);
      let taille=ch.taille||11;
      const mesure=(s,t2)=>police.widthOfTextAtSize(s,t2);

      // Decoupe en lignes si le mode multi-lignes est actif
      let lignes=[texte];
      if(ch.retour){
        lignes=[];let courante='';
        texte.split(/\s+/).forEach(mot=>{
          const essai=courante?courante+' '+mot:mot;
          if(mesure(essai,taille)<=largeur||!courante)courante=essai;
          else{lignes.push(courante);courante=mot;}
        });
        if(courante)lignes.push(courante);
      }else{
        // Sinon on reduit la taille jusqu'a tenir dans la largeur
        while(taille>5&&mesure(texte,taille)>largeur)taille-=0.5;
      }

      const interligne=taille*1.18;
      lignes.forEach((ligne,i)=>{
        const l=mesure(ligne,taille);
        let x=x0;
        if(ch.align==='center')x=x0+(largeur-l)/2;
        else if(ch.align==='right')x=x0+largeur-l;
        // Le clic marque le bas du texte ; pdf-lib ecrit depuis le bas de page
        const y=ph-yHaut-(i*interligne);
        page.drawText(ligne,{x,y,size:taille,font:police,color:rgb(0,0,0)});
      });
    });
    const out=await pdf.save();
    const blob=new Blob([out],{type:'application/pdf'});
    const lien=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=lien;a.download=`${(t.nom||'document').replace(/[^\w\-]/g,'_')}_${r.dossier||''}.pdf`;a.click();
    URL.revokeObjectURL(lien);
    toast('Document généré ✓','ok');
  }catch(e){console.error('[pdf gen]',e);toast('Échec : '+(e.message||e),'err');}
}
const DOC_PLACEHOLDER_LABELS={
  raison_sociale:'Raison sociale',signataire:'Nom du signataire',nom:'Nom',prenom:'Prénom',fonction:'Fonction',
  tel:'Téléphone',email:'Email',nom_site:'Nom du site',
  adresse:'Adresse',cp:'Code postal',ville:'Ville',adresse_travaux:'Adresse des travaux',
  dossier:'N° Dossier',operation:'Opération',zone:'Zone climatique',
  delegataire:'Délégataire',type_prime:'Type de prime',cumac:'Cumac (kWhc)',prime:'Prime CEE TTC',
  date_rdv:'Date du prochain RDV',heure_rdv:'Heure du RDV',type_rdv:'Type de RDV',intervenant_rdv:'Intervenant RDV',
  moi:'Mon nom (utilisateur connecté)',ma_societe:'Nom de la société',mon_email:'Email de la société',date_jour:'Date du jour'
};
function renderDocsTab(){
  const ts=getDocTemplates();
  let h=`<div class="panel"><div class="panel-h"><h3>Modèles de documents</h3><div class="sp"><button class="btn btn-pri btn-sm" onclick="openDocTemplate()">+ Nouveau modèle</button></div></div><div class="panel-b">
    <p class="muted" style="margin-bottom:.9rem;font-size:.84rem">Crée des modèles de documents (attestations, courriers, contrats…) avec des variables comme <code>{{nom_client}}</code>, remplacées automatiquement par les infos du dossier. Générables ensuite depuis chaque fiche client.</p>
    <div class="cfg-list">`;
  if(!ts.length)h+=`<div class="empty"><div class="big">📄</div>Aucun modèle pour l'instant.</div>`;
  else h+=ts.map(t=>{
    const ops=(t.operationIds&&t.operationIds.length)?t.operationIds.map(id=>{const o=getAllProducts().find(x=>x.id===id);return o?o.name:null;}).filter(Boolean).join(', '):'Toutes opérations';
    return `<div class="cfg-item"><div style="flex:1;min-width:0"><div class="nm">${esc(t.name)}</div><div class="muted" style="font-size:.72rem;margin-top:.15rem">${esc(ops)} · ${(t.pages||[]).length} page${(t.pages||[]).length>1?'s':''}</div></div><span class="sp"><button class="iconbtn" onclick="openDocTemplate('${t.id}')">✏️</button><button class="iconbtn del" onclick="delDocTemplate('${t.id}')">🗑️</button></span></div>`;
  }).join('');
  h+=`</div></div></div>`;
  // ---- Modeles PDF ----
  const pts=getPdfTemplates();
  h+=`<div class="panel"><div class="panel-h"><h3>📕 Modèles PDF à remplir</h3><div class="sp"><button class="btn btn-pri btn-sm" onclick="ouvrirModelePdf()">+ Nouveau modèle PDF</button></div></div><div class="panel-b">
    <p class="muted" style="margin-bottom:.9rem;font-size:.84rem">Déposez un PDF existant — attestation, cadre de contribution, formulaire délégataire — puis placez dessus les champs de la fiche. À la génération, les valeurs du dossier sont écrites sur le document d'origine.</p>
    <div class="cfg-list">`;
  if(!pts.length)h+=`<div class="empty"><div class="big">📕</div>Aucun modèle PDF pour l'instant.</div>`;
  else h+=pts.map(t=>{
    const ops=(t.operationIds&&t.operationIds.length)?t.operationIds.map(id=>{const o=getAllProducts().find(x=>x.id===id);return o?o.name:null;}).filter(Boolean).join(', '):'Toutes les opérations';
    const nb=(t.champs||[]).length;
    return `<div class="cfg-item"><div style="flex:1;min-width:0">
      <div class="nm">${esc(t.nom||'—')}</div>
      <div class="muted" style="font-size:.72rem;margin-top:.1rem">${esc(t.fichierNom||'')} · ${nb} champ${nb>1?'s':''} placé${nb>1?'s':''} · ${esc(ops)}</div>
    </div>
    <button class="iconbtn" title="Modifier" onclick="ouvrirModelePdf('${t.id}')">✏️</button>
    <button class="iconbtn del" title="Supprimer" onclick="supprimerModelePdf('${t.id}')">🗑️</button></div>`;
  }).join('');
  h+=`</div></div></div>`;
  document.getElementById('content').innerHTML=h;
}
let DOCDRAFT=null,DOC_PAGE_IDX=0;
function openDocTemplate(id){
  const ts=getDocTemplates();const x=id?ts.find(t=>t.id===id):null;
  DOCDRAFT=x?JSON.parse(JSON.stringify(x)):{id:uid(),name:'',operationIds:[],pages:[{id:uid(),html:''}]};
  if(!DOCDRAFT.pages||!DOCDRAFT.pages.length)DOCDRAFT.pages=[{id:uid(),html:''}];
  DOC_PAGE_IDX=0;
  renderDocEditor();
}
function docCaptureName(){const e=document.getElementById('doc_name');if(e)DOCDRAFT.name=e.value.trim();const s=document.getElementById('doc_subtitle');if(s)DOCDRAFT.subtitle=s.value.trim();}
function docCapturePage(){const el=document.getElementById('doc_page_content');if(el&&DOCDRAFT.pages[DOC_PAGE_IDX])DOCDRAFT.pages[DOC_PAGE_IDX].html=el.innerHTML;}
function renderDocEditor(){
  const o=DOCDRAFT;const ops=getProducts();
  const opChips=(o.operationIds||[]).map(id=>{const op2=ops.find(x=>x.id===id);return op2?`<span class="tag" style="background:#EAF1F5;color:#0C447C;cursor:pointer" onclick="docRemoveOp('${id}')">${esc(op2.name)} ✕</span>`:'';}).join('');
  const opSelectRemaining=ops.filter(op2=>!(o.operationIds||[]).includes(op2.id));
  const page=o.pages[DOC_PAGE_IDX]||{html:''};
  let body=`<input type="hidden" id="doc_id" value="${o.id}">
    <div class="fld"><label>Nom du modèle</label><input id="doc_name" value="${esc(o.name)}" placeholder="Ex : Attestation de fin de travaux" oninput="docUpdateNameLive()"></div>
    <div class="fld" style="margin-top:.6rem"><label>Sous-titre <span class="muted" style="font-size:.62rem">(affiché en vert, sous le titre, dans l'en-tête)</span></label><input id="doc_subtitle" value="${esc(o.subtitle||'')}" placeholder="Ex : Fiche BAT-TH-163" oninput="docUpdateNameLive()"></div>
    <div class="fld" style="margin-top:.6rem"><label>Applicable aux opérations <span class="muted" style="font-size:.62rem">(laisser vide = toutes)</span></label>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;border:1px solid var(--border-grey);border-radius:9px;padding:.5rem .6rem;min-height:40px">
        ${opChips}
        ${opSelectRemaining.length?`<select onchange="docAddOp(this.value);this.value=''" style="border:none;background:transparent;font-size:.82rem;flex:1;min-width:140px"><option value="">+ Ajouter une opération…</option>${opSelectRemaining.map(op2=>`<option value="${op2.id}">${esc(op2.name)}</option>`).join('')}</select>`:''}
      </div>
    </div>
    <div class="sectitle" style="margin-top:.9rem">Contenu du document</div>
    <div style="display:flex;gap:6px;align-items:center;border:1px solid var(--border-grey);border-radius:8px 8px 0 0;padding:.5rem;background:#f7f9f5;flex-wrap:wrap">
      <button type="button" class="iconbtn" style="font-weight:800" onmousedown="event.preventDefault()" onclick="docExec('bold')">B</button>
      <button type="button" class="iconbtn" style="font-style:italic" onmousedown="event.preventDefault()" onclick="docExec('italic')">I</button>
      <button type="button" class="iconbtn" style="text-decoration:underline" onmousedown="event.preventDefault()" onclick="docExec('underline')">U</button>
      <span style="width:1px;height:18px;background:var(--border-grey)"></span>
      <select onmousedown="docSaveSelection()" onchange="docSetFontName(this.value)" style="border:1px solid var(--border-grey);border-radius:6px;padding:.3rem .4rem;font-size:.78rem;max-width:130px">
        <option value="">Police…</option>
        <option value="Arial">Arial</option>
        <option value="'Saira',sans-serif">Saira (CRM)</option>
        <option value="'Times New Roman',serif">Times New Roman</option>
        <option value="Georgia,serif">Georgia</option>
        <option value="Calibri,sans-serif">Calibri</option>
        <option value="Verdana,sans-serif">Verdana</option>
        <option value="'Courier New',monospace">Courier New</option>
      </select>
      <select onmousedown="docSaveSelection()" onchange="docSetFontSize(this.value)" style="border:1px solid var(--border-grey);border-radius:6px;padding:.3rem .4rem;font-size:.78rem;width:70px">
        <option value="">Taille…</option>
        <option value="8">8 pt</option>
        <option value="9">9 pt</option>
        <option value="10">10 pt</option>
        <option value="11">11 pt</option>
        <option value="12">12 pt</option>
        <option value="14">14 pt</option>
        <option value="16">16 pt</option>
        <option value="18">18 pt</option>
        <option value="20">20 pt</option>
        <option value="24">24 pt</option>
        <option value="28">28 pt</option>
        <option value="32">32 pt</option>
      </select>
      <button type="button" class="btn btn-ghost btn-sm" onmousedown="event.preventDefault()" onclick="docExec('formatBlock','H2')">Titre 1</button>
      <button type="button" class="btn btn-ghost btn-sm" onmousedown="event.preventDefault()" onclick="docExec('formatBlock','H3')">Titre 2</button>
      <button type="button" class="btn btn-ghost btn-sm" onmousedown="event.preventDefault()" onclick="docExec('formatBlock','P')">Paragraphe</button>
      <span style="width:1px;height:18px;background:var(--border-grey)"></span>
      <button type="button" class="btn btn-ghost btn-sm" onmousedown="event.preventDefault()" onclick="docExec('insertUnorderedList')">• Liste</button>
      <span style="width:1px;height:18px;background:var(--border-grey)"></span>
      <button type="button" class="iconbtn" title="Aligner à gauche" onmousedown="event.preventDefault()" onclick="docExec('justifyLeft')">⇤</button>
      <button type="button" class="iconbtn" title="Centrer" onmousedown="event.preventDefault()" onclick="docExec('justifyCenter')">↔</button>
      <button type="button" class="iconbtn" title="Aligner à droite" onmousedown="event.preventDefault()" onclick="docExec('justifyRight')">⇥</button>
      <button type="button" class="btn btn-ghost btn-sm" onmousedown="event.preventDefault()" onclick="docInsertTable()">▦ Tableau</button>
      <span class="sp"></span>
      <select id="doc_ph_select" onchange="docInsertPlaceholder(this.value);this.value=''" style="border:1px solid var(--border-grey);border-radius:6px;padding:.3rem .5rem;font-size:.78rem;background:#1A2B3D;color:#9BD651;font-weight:700">
        <option value="">+ Insérer une info ▾</option>
        ${Object.entries(DOC_PLACEHOLDER_LABELS).map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}
      </select>
    </div>
    <div style="background:#EEF1E8;border:1px solid var(--border-grey);border-top:none;border-radius:0 0 10px 10px;padding:20px;display:flex;justify-content:center">
      <div style="background:#fff;width:100%;max-width:480px;box-shadow:0 2px 10px rgba(0,0,0,.12)">
        <div id="doc_page_header" style="padding:24px 30px 0">${docPageHeaderHtml()}</div>
        <div id="doc_page_content" contenteditable="true" onmouseup="docSaveSelection()" onkeyup="docSaveSelection()" style="min-height:440px;padding:0 30px 24px;font-size:.86rem;line-height:1.75;outline:none">${page.html||''}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-top:.6rem;padding:.5rem;background:#f7f9f5;border-radius:8px">
      <button type="button" class="iconbtn" onclick="docGoPage(-1)" ${DOC_PAGE_IDX===0?'style="opacity:.3;pointer-events:none"':''}>◀</button>
      <span style="font-size:.82rem;font-weight:700">Page ${DOC_PAGE_IDX+1} sur ${o.pages.length}</span>
      <button type="button" class="iconbtn" onclick="docGoPage(1)" ${DOC_PAGE_IDX===o.pages.length-1?'style="opacity:.3;pointer-events:none"':''}>▶</button>
      <span style="width:1px;height:14px;background:var(--border-grey)"></span>
      <button type="button" class="btn btn-ghost btn-sm" onclick="docAddPage()">+ Ajouter une page</button>
      ${o.pages.length>1?`<button type="button" class="btn btn-ghost btn-sm" style="color:#E63946" onclick="docDelPage()">🗑️ Supprimer cette page</button>`:''}
    </div>
    <p class="muted" style="text-align:center;font-size:.72rem;margin-top:.4rem">Le logo EGN et le titre du document s'affichent automatiquement en haut de chaque page générée — ce n'est qu'un aperçu, pas de la zone éditable.</p>`;
  openModal(o.id&&getDocTemplates().find(t=>t.id===o.id)?'Modèle — '+esc(o.name||''):'Nouveau modèle de document',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveDocTemplate()">💾 Enregistrer le modèle</button>`,'wide');
  DOC_SAVED_RANGE=null;
}
function docPageHeaderHtml(){
  const s=getSettings()||{};
  return `<div style="display:flex;align-items:center;justify-content:space-between;background:#1A2B3D;padding:12px 18px;border-radius:8px;margin-bottom:20px">
    ${s.logo?`<img src="${s.logo}" style="height:26px;display:block">`:`<div style="font-weight:800;font-size:.8rem;color:#9BD651">${esc(s.company||'EGN')}</div>`}
    <div style="text-align:right">
      <div id="doc_page_title_preview" style="font-size:.72rem;font-weight:700;color:#fff">${esc(DOCDRAFT.name||'Titre du document')}</div>
      <div id="doc_page_subtitle_preview" style="font-size:.64rem;font-weight:600;color:#9BD651;margin-top:2px">${esc(DOCDRAFT.subtitle||'')}</div>
    </div>
  </div>`;
}
function docUpdateNameLive(){
  const e=document.getElementById('doc_name');if(e)DOCDRAFT.name=e.value.trim();
  const sub=document.getElementById('doc_subtitle');if(sub)DOCDRAFT.subtitle=sub.value.trim();
  const t=document.getElementById('doc_page_title_preview');if(t)t.textContent=DOCDRAFT.name||'Titre du document';
  const ts=document.getElementById('doc_page_subtitle_preview');if(ts)ts.textContent=DOCDRAFT.subtitle||'';
}
/* ---- gestion de la position du curseur dans la zone éditable (nécessaire car le menu "Insérer une info" est un <select>, qui vole le focus) ---- */
let DOC_SAVED_RANGE=null;
function docSaveSelection(){
  const el=document.getElementById('doc_page_content');
  const sel=window.getSelection();
  if(sel&&sel.rangeCount>0&&el&&el.contains(sel.anchorNode))DOC_SAVED_RANGE=sel.getRangeAt(0).cloneRange();
}
function docRestoreSelection(){
  const el=document.getElementById('doc_page_content');if(!el)return;
  el.focus();
  const sel=window.getSelection();
  sel.removeAllRanges();
  if(DOC_SAVED_RANGE&&el.contains(DOC_SAVED_RANGE.startContainer)){sel.addRange(DOC_SAVED_RANGE);}
  else{const range=document.createRange();range.selectNodeContents(el);range.collapse(false);sel.addRange(range);}
}
function docExec(cmd,val){document.getElementById('doc_page_content').focus();document.execCommand(cmd,false,val||null);}
function docInsertTable(){
  document.getElementById('doc_page_content').focus();
  const html='<table style="width:100%;border-collapse:collapse;margin:.5rem 0"><tr><td style="border:1px solid #ccc;padding:6px">Cellule</td><td style="border:1px solid #ccc;padding:6px">Cellule</td></tr><tr><td style="border:1px solid #ccc;padding:6px">Cellule</td><td style="border:1px solid #ccc;padding:6px">Cellule</td></tr></table><p><br></p>';
  document.execCommand('insertHTML',false,html);
}
function docSetFontName(name){
  if(!name)return;
  docRestoreSelection();
  document.execCommand('fontName',false,name);
  docSaveSelection();
}
function docSetFontSize(pt){
  if(!pt)return;
  docRestoreSelection();
  document.execCommand('fontSize',false,'7'); // valeur intermédiaire imposée par le navigateur, remplacée juste après
  const el=document.getElementById('doc_page_content');
  el.querySelectorAll('font[size="7"]').forEach(f=>{f.removeAttribute('size');f.style.fontSize=pt+'pt';});
  docSaveSelection();
}
function docInsertPlaceholder(key){
  if(!key)return;
  docRestoreSelection();
  document.execCommand('insertText',false,'{{'+key+'}}');
  docSaveSelection();
}
function docAddOp(id){if(!id)return;docCaptureName();docCapturePage();DOCDRAFT.operationIds=DOCDRAFT.operationIds||[];if(!DOCDRAFT.operationIds.includes(id))DOCDRAFT.operationIds.push(id);renderDocEditor();}
function docRemoveOp(id){docCaptureName();docCapturePage();DOCDRAFT.operationIds=(DOCDRAFT.operationIds||[]).filter(x=>x!==id);renderDocEditor();}
function docGoPage(delta){docCaptureName();docCapturePage();DOC_PAGE_IDX=Math.max(0,Math.min(DOCDRAFT.pages.length-1,DOC_PAGE_IDX+delta));renderDocEditor();}
function docAddPage(){docCaptureName();docCapturePage();DOCDRAFT.pages.push({id:uid(),html:''});DOC_PAGE_IDX=DOCDRAFT.pages.length-1;renderDocEditor();}
function docDelPage(){
  if(DOCDRAFT.pages.length<=1)return;
  docCaptureName();
  DOCDRAFT.pages.splice(DOC_PAGE_IDX,1);
  DOC_PAGE_IDX=Math.max(0,DOC_PAGE_IDX-1);
  renderDocEditor();
}
function saveDocTemplate(){
  docCaptureName();docCapturePage();
  if(!DOCDRAFT.name){toast('Nom du modèle requis','err');return;}
  const list=getDocTemplates();
  const idx=list.findIndex(t=>t.id===DOCDRAFT.id);
  if(idx>=0)list[idx]=DOCDRAFT;else list.push(DOCDRAFT);
  save('egncrm_doctemplates',list);
  logActivity('action',`📄 Modèle de document enregistré : ${DOCDRAFT.name}`);
  DOCDRAFT=null;closeModal();renderDocsTab();toast('Modèle enregistré ✓','ok');
}
function delDocTemplate(id){
  modalConfirm('Supprimer ce modèle de document ?','',()=>{
    save('egncrm_doctemplates',getDocTemplates().filter(t=>t.id!==id));
    deleteRemoteRow('egncrm_doctemplates',id);
    closeModal();renderDocsTab();toast('Modèle supprimé','ok');
  });
}
function tplVars(r){
  const op=getAllProducts().find(p=>p.id===r.productId);const rd=nextRdvOf(r);const wz=recWorkAddr(r);const deal=dealOf(r);
  const s=getSettings()||{};const me=ME?(ME.prenom+' '+ME.nom).trim():'';
  return {
    raison_sociale:r.raisonSociale||'',signataire:((r.prenom||'')+' '+(r.nom||'')).trim(),nom:r.nom||'',prenom:r.prenom||'',fonction:r.fonction||'',
    tel:r.tel||'',email:r.email||'',nom_site:r.nomSite||'',
    adresse:r.adresse||'',cp:r.cp||'',ville:r.ville||'',adresse_travaux:[wz.adresse,wz.cp,wz.ville].filter(Boolean).join(', '),
    dossier:r.dossier||'',operation:op?op.name:'',zone:zoneOf(wz.dept)||'',
    delegataire:deal.delegataireName||'',type_prime:deal.type==='precaire'?'Précaire':(deal.type?'Classique':''),cumac:deal.cumac?deal.cumac.toLocaleString('fr-FR'):'',prime:primeOf(r)?primeOf(r).toLocaleString('fr-FR')+' € TTC (soit '+htOf(deal.prime).toLocaleString('fr-FR',{maximumFractionDigits:2})+' € HT)':'',
    date_rdv:rd?fmtDateLong(rd.date):'',heure_rdv:rd?(rd.heure||''):'',type_rdv:rd?(rd.type||''):'',intervenant_rdv:rd?rdvWho(rd):'',
    moi:me,ma_societe:s.company||'EGN Rénovation',mon_email:s.email||'contact@egnrenovation.fr',date_jour:new Date().toLocaleDateString('fr-FR'),
    siret:r.siret||valeurParLibelle(r,op,/siret/i),tel_fixe:r.telFixe||valeurParLibelle(r,op,/t[eé]l[^a-z]*fixe/i),date_installation:dateInstallationFr(r)||'',
    // Tous les champs de l'operation portant une cle sont aussi disponibles,
    // pour qu'un champ ajoute plus tard fonctionne sans retoucher ce code
    ...champsOperationPourModele(r,op)
  };
}
/* Normalise un libelle en cle : « N° SIRET » -> siret, « Tél. fixe » -> tel_fixe */
function cleDepuisLibelle(lib){
  return String(lib||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/n°|no\b/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
/* Valeurs des champs de l'operation, exposees par cle technique ET par
   libelle normalise : un champ cree a la main sans cle reste utilisable. */
function champsOperationPourModele(r,op){
  const out={};
  (op&&op.fields||[]).forEach(f=>{
    const v=r.opFields?r.opFields[f.id]:undefined;
    if(v==null||v==='')return;
    const s=String(v);
    if(f.key)out[f.key]=s;
    const k=cleDepuisLibelle(f.label);
    if(k&&out[k]==null)out[k]=s;
  });
  return out;
}
/* Cherche une valeur dans les champs de l'operation dont le libelle correspond */
function valeurParLibelle(r,op,motif){
  const f=(op&&op.fields||[]).find(x=>motif.test(x.label||'')||motif.test(x.key||''));
  const v=f&&r.opFields?r.opFields[f.id]:'';
  return v==null?'':String(v);
}
function fillTemplate(txt,r){const v=tplVars(r);return String(txt||'').replace(/\{\{(\w+)\}\}/g,(m,k)=>v[k]!=null?v[k]:m);}
function genererDocFromTemplate(tplId,recId){
  const t=getDocTemplates().find(x=>x.id===tplId);const r=recById(recId);
  if(!t||!r)return;
  const s=getSettings()||{};
  const title=fillTemplate(t.name||'',r);
  const subtitle=fillTemplate(t.subtitle||'',r);
  const headerHtml=`<div style="display:flex;align-items:center;justify-content:space-between;background:#1A2B3D;padding:12px 18px;border-radius:8px;margin-bottom:20px">
    ${s.logo?`<img src="${s.logo}" style="height:26px;display:block">`:`<div style="font-weight:800;font-size:.8rem;color:#9BD651">${esc(s.company||'EGN')}</div>`}
    <div style="text-align:right">
      <div style="font-size:.72rem;font-weight:700;color:#fff">${esc(title||'Document')}</div>
      ${subtitle?`<div style="font-size:.64rem;font-weight:600;color:#9BD651;margin-top:2px">${esc(subtitle)}</div>`:''}
    </div>
  </div>`;
  const pagesHtml=(t.pages||[]).map(p=>`<div class="page">${headerHtml}<div class="page-body">${fillTemplate(p.html||'',r)}</div></div>`).join('');
  const doc=`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${esc(title)} — ${esc(recName(r))}</title>
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1A2B3D;margin:0;background:#e8ebe3}
    .page{width:210mm;min-height:297mm;background:#fff;margin:0 auto 16px;padding:14mm 14mm 18mm;box-sizing:border-box;page-break-after:always}
    .page:last-child{page-break-after:auto}
    .page-body{font-size:.86rem;line-height:1.75}
    .page-body table{border-collapse:collapse}
    @media print{body{background:#fff}.page{margin:0;box-shadow:none}.noprint{display:none}}
    .print-btn{margin:16px auto;display:block;padding:10px 18px;background:#7CC242;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer}
  </style></head><body>
  ${pagesHtml}
  <button class="print-btn noprint" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
  </body></html>`;
  const w=window.open('','_blank');
  if(!w){toast('Autorisez les fenêtres pop-up pour générer le document','err');return;}
  w.document.write(doc);w.document.close();
  logActivity('action',`📑 Document généré (${t.name}) pour ${r.dossier||recId}`,recId);
}
const getMailTpl=()=>load('egncrm_mailtpl',[]);
function setMailTpl(){
  const ts=getMailTpl();
  let h=`<div class="panel"><div class="panel-h"><h3>Modèles d'e-mail</h3><div class="sp"><button class="btn btn-pri btn-sm" onclick="openMailTpl()">+ Nouveau modèle</button></div></div><div class="panel-b"><p class="muted" style="margin-bottom:.9rem">Créez vos modèles. Insérez des variables entre accolades — ex. <code>{{signataire}}</code>, <code>{{dossier}}</code>, <code>{{prime}}</code> — remplacées par les infos du dossier à l'envoi.</p><div class="cfg-list">`;
  if(!ts.length)h+=`<div class="muted">Aucun modèle pour l'instant.</div>`;
  else h+=ts.map(t=>{
    const compta=t.profil==='compta';
    const noms=(t.docTypes||[]).map(id=>(getDocTypes().find(x=>x.id===id)||{}).name).filter(Boolean);
    return `<div class="cfg-item"><div style="flex:1;min-width:0">
      <div class="nm">${compta?'🧾':'👤'} ${esc(t.name)}</div>
      <div class="muted" style="font-size:.72rem;margin-top:.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.subject||'')}</div>
      <div class="muted" style="font-size:.7rem;margin-top:.1rem">${compta?'Comptabilité — APF joint automatiquement':(noms.length?'Pièces exigées : '+esc(noms.join(', ')):'Clients — aucune pièce exigée')}</div>
    </div>
    <button class="iconbtn" title="Modifier" onclick="openMailTpl('${t.id}')">✏️</button>
    <button class="iconbtn del" title="Supprimer" onclick="delMailTpl('${t.id}')">🗑️</button></div>`;
  }).join('');
  h+=`</div></div></div>`;
  document.getElementById('setBody').innerHTML=h;
}
function openMailTpl(id){
  const t=id?getMailTpl().find(x=>x.id===id):null;const e=t||{};
  const chips=MAIL_VARS.map(v=>`<button type="button" class="varchip" onclick="insertTplVar('${v[0]}')" title="${esc(v[1])}">{{${v[0]}}}</button>`).join('');
  const body=`<input type="hidden" id="mt_id" value="${id||''}">
    <div class="fgrid">
      <div class="fld"><label>Nom du modèle</label><input id="mt_name" value="${esc(e.name||'')}" placeholder="ex : Confirmation de visite technique"></div>
      <div class="fld"><label>Destinataire du modèle</label>
        <select id="mt_profil" onchange="majZoneDocsModele()">
          <option value="client" ${e.profil!=='compta'?'selected':''}>👤 Clients — envoi depuis une fiche</option>
          <option value="compta" ${e.profil==='compta'?'selected':''}>🧾 Comptabilité — APF et relances intervenants</option>
        </select>
      </div>
    </div>
    <div class="fld" style="margin-top:.6rem"><label>Objet</label><input id="mt_subject" value="${esc(e.subject||'')}" placeholder="ex : Votre projet {{operation}} — dossier {{dossier}}"></div>
    <div class="fld" style="margin-top:.6rem"><label>Corps du message</label><textarea id="mt_body" style="min-height:220px">${esc(e.body||'')}</textarea></div>
    <div id="mt_docs_zone" style="margin-top:.8rem"></div>
    <div style="margin-top:.6rem"><div class="muted" style="font-size:.74rem;margin-bottom:.35rem">Cliquez pour insérer une variable dans le corps :</div><div class="varbox">${chips}</div></div>`;
  MT_DOCTYPES=[...(e.docTypes||[])];
  setTimeout(majZoneDocsModele,0);
  openModal(id?'Modifier le modèle':"Nouveau modèle d'e-mail",body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveMailTpl()">💾 Enregistrer</button>`,'wide');
}
let MT_DOCTYPES=[];
function toggleDocTypeModele(id,on){
  MT_DOCTYPES=on?[...new Set([...MT_DOCTYPES,id])]:MT_DOCTYPES.filter(x=>x!==id);
}
/* Un modele client peut exiger des pieces jointes ; un modele compta
   part toujours avec l'APF, il n'y a donc rien a choisir. */
function majZoneDocsModele(){
  const z=document.getElementById('mt_docs_zone');if(!z)return;
  const profil=(document.getElementById('mt_profil')||{}).value||'client';
  if(profil==='compta'){
    z.innerHTML=`<div style="background:var(--bg-soft);border-radius:9px;padding:.6rem .9rem;font-size:.8rem">
      🧾 Ce modèle sert aux intervenants. <b>L'appel à facturation est joint automatiquement</b> — seuls l'objet et le corps du message sont utilisés.</div>`;
    return;
  }
  const types=getDocTypes();
  z.innerHTML=`<div class="sectitle" style="margin-top:0">Pièces jointes exigées</div>
    <p class="muted" style="font-size:.76rem;margin:0 0 .45rem">Cochez les types de documents qui doivent partir avec ce modèle. Ils sont pris dans la fiche du client. <b>Si l'un d'eux manque au dossier, l'envoi est bloqué.</b></p>
    ${types.length?`<div style="display:flex;flex-wrap:wrap;gap:.35rem">${types.map(t=>`
      <label style="display:flex;align-items:center;gap:.3rem;font-size:.8rem;background:var(--bg-soft);border-radius:8px;padding:.25rem .6rem;cursor:pointer">
        <input type="checkbox" ${MT_DOCTYPES.includes(t.id)?'checked':''} onchange="toggleDocTypeModele('${t.id}',this.checked)">${esc(t.name)}</label>`).join('')}</div>`
    :`<p class="muted" style="font-size:.8rem">Aucun type de document configuré — créez-les dans Paramètres ▸ Types de docs.</p>`}`;
}
function insertTplVar(v){const ta=document.getElementById('mt_body');if(!ta)return;const s=ta.selectionStart||0,e=ta.selectionEnd||0;const tok='{{'+v+'}}';ta.value=ta.value.slice(0,s)+tok+ta.value.slice(e);ta.focus();ta.selectionStart=ta.selectionEnd=s+tok.length;}
function saveMailTpl(){
  const id=val('mt_id');const name=val('mt_name');if(!name){toast('Nom requis','err');return;}
  const profil=(document.getElementById('mt_profil')||{}).value||'client';
  const ts=getMailTpl();const data={name,profil,
    docTypes:profil==='client'?[...MT_DOCTYPES]:[],
    subject:document.getElementById('mt_subject').value,body:document.getElementById('mt_body').value};
  if(id){const t=ts.find(x=>x.id===id);if(t)Object.assign(t,data);}else ts.push({id:uid(),...data});
  save('egncrm_mailtpl',ts);closeModal();renderSettings();toast('Modèle enregistré ✓','ok');
}
function delMailTpl(id){modalConfirm('Supprimer ce modèle ?','',()=>{save('egncrm_mailtpl',getMailTpl().filter(x=>x.id!==id));deleteRemoteRow('egncrm_mailtpl',id);closeModal();renderSettings();toast('Modèle supprimé','ok');});}
function openMailSend(recId){
  const r=recById(recId);if(!r)return;
  const ts=getMailTpl();
  const tplOpts=`<option value="">— Message vierge —</option>`
    +ts.filter(t=>t.profil!=='compta').map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');
  const docs=r.docs||[];
  const docsHtml=docs.length?docs.map(d=>`<label style="display:flex;align-items:center;gap:.5rem;padding:.3rem 0;cursor:pointer"><input type="checkbox" class="ms_doc_chk" value="${d.id}"> ${esc(d.typeName||'Document')} — ${esc(d.filename||'')}</label>`).join(''):`<p class="muted" style="font-size:.78rem">Aucun document sur ce dossier — ajoutez-en depuis le panneau Documents.</p>`;
  const body=`<input type="hidden" id="ms_rec" value="${recId}">
    <div class="fld"><label>Modèle</label><select id="ms_tpl" onchange="mailFillFromTpl()">${tplOpts}</select></div>
    <div class="fld" style="margin-top:.6rem"><label>Destinataire</label><input id="ms_to" value="${esc(r.email||'')}" placeholder="email@client.fr"></div>
    <div class="fld" style="margin-top:.6rem"><label>Objet</label><input id="ms_subject" value=""></div>
    <div class="fld" style="margin-top:.6rem"><label>Message</label><textarea id="ms_body" style="min-height:200px"></textarea></div>
    <div class="sectitle" style="margin-top:.8rem">Pièces jointes</div>
    <div id="ms_exigees"></div>
    <div style="border:1px solid var(--border-grey);border-radius:9px;padding:.5rem .8rem;max-height:150px;overflow:auto">${docsHtml}</div>
    <p class="muted" style="margin-top:.6rem;font-size:.74rem">💌 « Envoyer maintenant » envoie réellement l'e-mail depuis la boîte connectée au CRM. Les autres boutons restent disponibles en secours (ouvrir dans votre propre messagerie).</p>`;
  openModal(`Envoyer un e-mail — ${esc(recName(r))}`,body,`<button class="btn btn-ghost" onclick="closeModal()">Fermer</button><button class="btn btn-ghost" onclick="copyMail()">📋 Copier</button><button class="btn btn-navy" onclick="sendMailto('${recId}')">✉️ Messagerie</button><button class="btn btn-pri" onclick="sendRealEmail('${recId}')">🚀 Envoyer maintenant</button>`,'wide');
}
function mailFillFromTpl(){
  const r=recById(val('ms_rec'));if(!r)return;
  const t=getMailTpl().find(x=>x.id===document.getElementById('ms_tpl').value);
  document.getElementById('ms_subject').value=t?fillTemplate(t.subject,r):'';
  document.getElementById('ms_body').value=t?fillTemplate(t.body,r):'';
  majPiecesExigees();
}
/* Coche les pieces exigees par le modele et signale celles qui manquent au dossier */
function majPiecesExigees(){
  const zone=document.getElementById('ms_exigees');if(!zone)return;
  const r=recById(val('ms_rec'));
  const t=getMailTpl().find(x=>x.id===(document.getElementById('ms_tpl')||{}).value);
  const exiges=(t&&t.profil!=='compta')?(t.docTypes||[]):[];
  if(!r||!exiges.length){zone.innerHTML='';return;}
  const docs=r.docs||[];
  const presents=[],manquants=[];
  exiges.forEach(id=>{
    const nom=(getDocTypes().find(x=>x.id===id)||{}).name||'Document';
    const d=docs.find(x=>x.typeId===id);
    if(d){presents.push({nom,doc:d});}else{manquants.push(nom);}
  });
  // Cocher automatiquement les pieces trouvees
  const ids=presents.map(p=>p.doc.id);
  document.querySelectorAll('.ms_doc_chk').forEach(ch=>{if(ids.includes(ch.value))ch.checked=true;});
  zone.innerHTML=manquants.length
    ? `<div style="background:#FEE8E8;border:1.5px solid var(--coral);border-radius:9px;padding:.6rem .9rem;margin-bottom:.5rem;font-size:.82rem">
        <b>⛔ Envoi bloqué — ${manquants.length} pièce${manquants.length>1?'s':''} manquante${manquants.length>1?'s':''}</b>
        <div class="muted" style="font-size:.76rem;margin-top:.2rem">${esc(manquants.join(' · '))}</div>
        <div class="muted" style="font-size:.74rem;margin-top:.3rem">Joignez ces documents au dossier avant d'envoyer.</div>
      </div>`
    : `<div style="background:#EFF7E8;border:1.5px solid var(--green);border-radius:9px;padding:.5rem .9rem;margin-bottom:.5rem;font-size:.82rem">
        ✅ Pièces exigées présentes et cochées : ${esc(presents.map(p=>p.nom).join(' · '))}</div>`;
}
function mailLog(recId,to,subject){const recs=getRecs();const r=recs.find(x=>x.id===recId);if(!r)return;r.history=r.history||[];r.history.unshift({date:Date.now(),user:(ME.prenom+' '+ME.nom).trim()||ME.code,text:`E-mail préparé pour ${to||'—'} : « ${subject||''} »`});save(K.recs,recs);logActivity('action',`✉️ E-mail préparé sur ${r.dossier||recId} pour ${to||'—'} : « ${subject||''} »`,recId);}
function mailSentLog(recId,to,subject,nbAttach){const recs=getRecs();const r=recs.find(x=>x.id===recId);if(!r)return;r.history=r.history||[];r.history.unshift({date:Date.now(),user:(ME.prenom+' '+ME.nom).trim()||ME.code,text:`E-mail envoyé à ${to||'—'} : « ${subject||''} »${nbAttach?` (${nbAttach} pièce${nbAttach>1?'s':''} jointe${nbAttach>1?'s':''})`:''}`});save(K.recs,recs);logActivity('action',`🚀 E-mail envoyé sur ${r.dossier||recId} à ${to||'—'} : « ${subject||''} »`,recId);}
async function sendRealEmail(recId){
  const r=recById(recId);if(!r)return;
  const to=val('ms_to');const subject=document.getElementById('ms_subject').value;const bodyTxt=document.getElementById('ms_body').value;
  if(!to){toast('Destinataire requis','err');return;}
  // Un modèle peut exiger des pièces : sans elles, l'envoi n'a pas lieu
  const tplChoisi=getMailTpl().find(x=>x.id===(document.getElementById('ms_tpl')||{}).value);
  if(tplChoisi&&tplChoisi.profil!=='compta'&&(tplChoisi.docTypes||[]).length){
    const manquants=(tplChoisi.docTypes||[])
      .filter(id=>!(r.docs||[]).some(d=>d.typeId===id))
      .map(id=>(getDocTypes().find(x=>x.id===id)||{}).name||'Document');
    if(manquants.length){
      toast('Envoi bloqué — pièce(s) manquante(s) : '+manquants.join(', '),'err');
      majPiecesExigees();
      return;
    }
  }
  if(!subject){toast('Objet requis','err');return;}
  const btns=document.querySelectorAll('#modalBox .modal-f button');btns.forEach(b=>b.disabled=true);
  toast('Envoi en cours…','ok');
  try{
    const checked=[...document.querySelectorAll('.ms_doc_chk:checked')].map(c=>c.value);
    const docs=(r.docs||[]).filter(d=>checked.includes(d.id));
    const attachments=[];
    for(const d of docs){
      if(!d.path)continue;
      const{data,error}=await SUPA.storage.from(ATTACH_BUCKET).download(d.path);
      if(error){console.error('[sendRealEmail] download',d.path,error);continue;}
      attachments.push({filename:d.filename||'document',content:await blobToBase64(data),contentType:d.mime||'application/octet-stream'});
    }
    const html=esc(bodyTxt).replace(/\n/g,'<br>');
    await callSendEmail({to,subject,html,attachments,profil:'client'});
    mailSentLog(recId,to,subject,attachments.length);
    closeModal();toast('E-mail envoyé ✓','ok');
  }catch(e){console.error('[sendRealEmail]',e);toast('Échec de l\'envoi : '+(e.message||e),'err');}
  finally{btns.forEach(b=>b.disabled=false);}
}
function sendGmail(recId){
  const to=val('ms_to');const su=document.getElementById('ms_subject').value;const bo=document.getElementById('ms_body').value;
  const url='https://mail.google.com/mail/?view=cm&fs=1&tf=1&to='+encodeURIComponent(to)+'&su='+encodeURIComponent(su)+'&body='+encodeURIComponent(bo);
  window.open(url,'_blank');mailLog(recId,to,su);toast('Fenêtre Gmail ouverte ✓','ok');
}
function sendMailto(recId){
  const to=val('ms_to');const su=document.getElementById('ms_subject').value;const bo=document.getElementById('ms_body').value;
  window.location.href='mailto:'+to+'?subject='+encodeURIComponent(su)+'&body='+encodeURIComponent(bo);
  mailLog(recId,to,su);
}
function copyMail(){const su=document.getElementById('ms_subject').value;const bo=document.getElementById('ms_body').value;if(navigator.clipboard)navigator.clipboard.writeText('Objet : '+su+'\n\n'+bo).then(()=>toast('Copié ✓','ok'),()=>toast('Copie impossible','err'));}
/* ============================================================
   LIENS DE COLLECTE POUR APPORTEURS D'AFFAIRES
   Chaque apporteur recoit une adresse contenant un jeton. Le
   formulaire public appelle la fonction submit-lead, qui verifie
   le jeton avant d'enregistrer. Le jeton est revocable.
   ============================================================ */
let LIENS_CACHE=[];
function urlFormulaire(token){
  return location.origin+location.pathname.replace(/[^/]*$/,'')+'form.html?t='+token;
}
async function chargerLiens(){
  try{
    const{data,error}=await SUPA.from('form_tokens').select('*').order('created_at',{ascending:false});
    if(error)throw error;
    LIENS_CACHE=data||[];
  }catch(e){console.error('[liens]',e);toast('Chargement des liens impossible : '+(e.message||e),'err');}
}
async function setApporteurs(){
  await chargerLiens();
  const srcs=getSources(), ops=getProducts(), users=getUsers().filter(u=>u.active!==false);
  const inp="font-family:'Saira',sans-serif;font-size:.82rem;border:1.5px solid var(--border-grey);border-radius:9px;padding:.4rem .7rem;background:#fff;outline:none";
  let h=`<div class="panel"><div class="panel-h"><h3>🔗 Liens de collecte</h3></div><div class="panel-b">
    <p class="muted" style="font-size:.84rem;margin-bottom:.9rem">Créez un lien par apporteur. Les dossiers transmis arrivent dans le CRM rattachés à sa source, avec la mention de son nom. Un lien désactivé cesse immédiatement de fonctionner.</p>
    <div class="fgrid">
      <div class="fld"><label>Nom de l'apporteur</label><input id="ap_lib" placeholder="Ex : Cabinet Martin" style="${inp}"></div>
      <div class="fld"><label>Source rattachée</label><select id="ap_src" style="${inp}"><option value="">— Aucune —</option>${srcs.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="fld"><label>Opération proposée</label><select id="ap_op" style="${inp}"><option value="">— Choisir —</option>${ops.map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></div>
      <div class="fld"><label>Dossiers attribués à</label><select id="ap_user" style="${inp}"><option value="">— Personne —</option>${users.map(u=>`<option value="${u.id}" ${ME&&u.id===ME.id?'selected':''}>${esc(u.prenom+' '+u.nom)}</option>`).join('')}</select></div>
    </div>
    <button class="btn btn-pri btn-sm" style="margin-top:.6rem" onclick="creerLienApporteur()">+ Créer le lien</button>
  </div></div>`;

  h+=`<div class="panel"><div class="panel-h"><h3>Liens existants</h3><div class="sp"><span class="muted">${LIENS_CACHE.length} lien${LIENS_CACHE.length>1?'s':''}</span></div></div><div class="panel-b">`;
  if(!LIENS_CACHE.length)h+=`<div class="empty"><div class="big">🔗</div>Aucun lien pour l'instant.</div>`;
  else{
    h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Apporteur</th><th>Opération</th><th>Source</th><th class="r">Dossiers reçus</th><th>Dernier envoi</th><th>Statut</th><th class="r">Actions</th>
    </tr></thead><tbody>`;
    LIENS_CACHE.forEach(l=>{
      const op=getAllProducts().find(o=>o.id===l.operation_id);
      const src=getSources().find(s=>s.id===l.source_id);
      h+=`<tr style="${l.actif?'':'opacity:.55'}">
        <td style="font-weight:700">${esc(l.libelle||'—')}</td>
        <td class="muted">${op?esc(op.name):'—'}</td>
        <td class="muted">${src?esc(src.name):'—'}</td>
        <td style="text-align:right;font-weight:700">${l.nb_envois||0}</td>
        <td class="muted" style="font-size:.78rem">${l.dernier_envoi?new Date(l.dernier_envoi).toLocaleDateString('fr-FR'):'—'}</td>
        <td><span style="font-size:.72rem;font-weight:700;border-radius:5px;padding:2px 8px;${l.actif?'background:#E6F7F0;color:#0F6E56':'background:#FEE8E8;color:#A32D2D'}">${l.actif?'Actif':'Désactivé'}</span></td>
        <td style="text-align:right"><div class="row-act" style="justify-content:flex-end">
          <button class="iconbtn" title="Copier le lien" onclick="copierLienApporteur('${l.token}')">📋</button>
          <button class="iconbtn" title="Ouvrir le formulaire" onclick="window.open('${urlFormulaire(l.token)}','_blank')">👁️</button>
          <button class="iconbtn" title="${l.actif?'Désactiver':'Réactiver'}" onclick="basculerLienApporteur('${l.token}',${!l.actif})">${l.actif?'⏸️':'▶️'}</button>
          <button class="iconbtn del" title="Supprimer" onclick="supprimerLienApporteur('${l.token}')">🗑️</button>
        </div></td>
      </tr>`;
    });
    h+=`</tbody></table></div>`;
  }
  h+=`</div></div>`;
  document.getElementById('setBody').innerHTML=h;
}
async function creerLienApporteur(){
  const libelle=(document.getElementById('ap_lib')||{}).value||'';
  if(!libelle.trim()){toast("Indiquez le nom de l'apporteur",'err');return;}
  const operation_id=(document.getElementById('ap_op')||{}).value||'';
  if(!operation_id){toast("Choisissez l'opération proposée",'err');return;}
  // Jeton long et aleatoire : c'est lui qui tient lieu de cle d'acces
  const token=[...crypto.getRandomValues(new Uint8Array(18))].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,28);
  try{
    const{error}=await SUPA.from('form_tokens').insert({
      token,libelle:libelle.trim(),
      source_id:(document.getElementById('ap_src')||{}).value||null,
      operation_id,
      user_id:(document.getElementById('ap_user')||{}).value||null,
      created_by:ME?ME.id:null
    });
    if(error)throw error;
    await navigator.clipboard.writeText(urlFormulaire(token)).catch(()=>{});
    toast('Lien créé et copié ✓','ok');
    setApporteurs();
  }catch(e){toast('Création impossible : '+(e.message||e),'err');}
}
function copierLienApporteur(token){
  const url=urlFormulaire(token);
  navigator.clipboard.writeText(url)
    .then(()=>toast('Lien copié ✓','ok'))
    .catch(()=>prompt('Copiez ce lien :',url));
}
async function basculerLienApporteur(token,actif){
  try{
    const{error}=await SUPA.from('form_tokens').update({actif}).eq('token',token);
    if(error)throw error;
    toast(actif?'Lien réactivé ✓':'Lien désactivé — il ne fonctionne plus','ok');
    setApporteurs();
  }catch(e){toast('Échec : '+(e.message||e),'err');}
}
function supprimerLienApporteur(token){
  const l=LIENS_CACHE.find(x=>x.token===token);
  modalConfirm('Supprimer ce lien ?',
    `${esc(l?l.libelle:'')} — ${l&&l.nb_envois?l.nb_envois+' dossier(s) déjà reçu(s), ils sont conservés':'aucun dossier reçu'}.`,
    async()=>{
      try{
        const{error}=await SUPA.from('form_tokens').delete().eq('token',token);
        if(error)throw error;
        closeModal();toast('Lien supprimé','ok');setApporteurs();
      }catch(e){toast('Échec : '+(e.message||e),'err');}
    });
}
function setStatuts(){
  const sts=getStatuses();
  const subs=load('egncrm_sousstatuts',[]);
  let h=`<div class="panel"><div class="panel-h"><h3>Statuts du pipeline <span style="font-size:.72rem;font-weight:700;background:rgba(45,125,210,.12);color:var(--blue);border-radius:6px;padding:1px 8px;margin-left:.3rem">${SEGMENTS[SEGMENT].ic} ${SEGMENTS[SEGMENT].short}</span></h3><div class="sp"><button class="btn btn-pri btn-sm" onclick="openStatus()">+ Nouveau statut</button></div></div><div class="panel-b">
    <p class="muted" style="margin-bottom:.9rem">Créez et ordonnez vos propres statuts par <b>glisser-déposer</b>. La <b>phase</b> détermine si le dossier apparaît dans Leads ou Clients.</p>
    <div class="cfg-list" id="statuts_drag_list">`;
  sts.forEach((s,i)=>{
    h+=`<div class="cfg-item" draggable="true" data-stat-idx="${i}" ondragstart="statDragStart(event,${i})" ondragover="statDragOver(event)" ondrop="statDrop(event,${i})" style="cursor:grab">
      <span style="color:#9aa5b1;font-size:1rem;margin-right:.2rem">⠿</span>
      <span class="colordot" style="background:${s.color}"></span>
      <span class="nm">${esc(s.name)}</span>
      <span class="tag" style="background:${s.phase==='client'?'rgba(123,95,214,.15)':'rgba(124,194,66,.15)'};color:${s.phase==='client'?'#7B5FD6':'#5BA82E'}">${s.phase==='client'?'Client':'Lead'}</span>
      ${s.won?'<span class="tag" style="background:rgba(61,122,30,.15);color:#3D7A1E">Converti</span>':''}
      <span class="sp">
        <button class="iconbtn" onclick="openStatus('${s.id}')">✏️</button>
        <button class="iconbtn del" onclick="delStatus('${s.id}')">🗑️</button>
      </span></div>`;
  });
  h+=`</div></div></div>`;
  // Sous-statuts
  h+=`<div class="panel" style="margin-top:1.2rem"><div class="panel-h"><h3>Sous-statuts administratifs</h3><div class="sp"><button class="btn btn-pri btn-sm" onclick="openSousStatut()">+ Nouveau</button></div></div><div class="panel-b">
    <p class="muted" style="margin-bottom:.9rem">Les sous-statuts apparaissent dans le panneau <b>Suivi commercial</b> de chaque fiche dossier. L'accès est contrôlé par la permission <b>« Voir les sous-statuts »</b> dans la fiche utilisateur.</p>
    <div class="cfg-list" id="sousstatuts_drag_list">`;
  if(!subs.length)h+=`<div class="muted" style="font-size:.82rem;padding:.5rem 0">Aucun sous-statut pour l'instant.</div>`;
  subs.forEach((s,i)=>{
    h+=`<div class="cfg-item" draggable="true" data-sub-idx="${i}" ondragstart="subDragStart(event,${i})" ondragover="subDragOver(event)" ondrop="subDrop(event,${i})" style="cursor:grab">
      <span style="color:#9aa5b1;font-size:1rem;margin-right:.2rem">⠿</span>
      <span class="colordot" style="background:${s.color||'#7CC242'}"></span>
      <span class="nm">${esc(s.name)}</span>
      <span class="sp">
        <button class="iconbtn" onclick="openSousStatut('${s.id}')">✏️</button>
        <button class="iconbtn del" onclick="delSousStatut('${s.id}')">🗑️</button>
      </span></div>`;
  });
  h+=`</div></div></div>`;
  document.getElementById('setBody').innerHTML=h;
}
/* ---- drag & drop statuts ---- */
let STAT_DRAG_IDX=null;
function statDragStart(e,i){STAT_DRAG_IDX=i;e.dataTransfer.effectAllowed='move';}
function statDragOver(e){e.preventDefault();e.dataTransfer.dropEffect='move';}
function statDrop(e,i){
  e.preventDefault();if(STAT_DRAG_IDX===null||STAT_DRAG_IDX===i)return;
  const sts=getStatuses();const moved=sts.splice(STAT_DRAG_IDX,1)[0];sts.splice(i,0,moved);
  // Persister l'ordre dans chaque objet pour que Supabase le conserve
  sts.forEach((s,idx)=>s.order=idx);
  STAT_DRAG_IDX=null;save(K.stat,mergeSeg(getAllStatuses(),sts));setStatuts();toast('Ordre mis à jour ✓','ok');
}
/* ---- drag & drop sous-statuts ---- */
let SUB_DRAG_IDX=null;
function subDragStart(e,i){SUB_DRAG_IDX=i;e.dataTransfer.effectAllowed='move';}
function subDragOver(e){e.preventDefault();e.dataTransfer.dropEffect='move';}
function subDrop(e,i){
  e.preventDefault();if(SUB_DRAG_IDX===null||SUB_DRAG_IDX===i)return;
  const subs=load('egncrm_sousstatuts',[]);const moved=subs.splice(SUB_DRAG_IDX,1)[0];subs.splice(i,0,moved);
  subs.forEach((s,idx)=>s.order=idx);
  SUB_DRAG_IDX=null;save('egncrm_sousstatuts',subs);setStatuts();toast('Ordre mis à jour ✓','ok');
}
/* ---- CRUD sous-statuts ---- */
function openSousStatut(id){
  const subs=load('egncrm_sousstatuts',[]);const s=id?subs.find(x=>x.id===id):null;
  const d=s||{color:'#2D7DD2'};
  const body=`<input type="hidden" id="ss_id" value="${id||''}">
    <div class="fgrid">
      <div class="fld"><label>Nom du sous-statut</label><input id="ss_name" value="${esc(d.name||'')}" placeholder="Ex : Devis signé reçu"></div>
      <div class="fld"><label>Couleur</label><input type="color" id="ss_color" value="${d.color||'#2D7DD2'}" style="height:42px;padding:.2rem;cursor:pointer"></div>
    </div>`;
  openModal(id?'Modifier le sous-statut':'Nouveau sous-statut',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveSousStatut()">💾 Enregistrer</button>`);
}
function saveSousStatut(){
  const id=val('ss_id');const name=val('ss_name');if(!name){toast('Nom requis','err');return;}
  const subs=load('egncrm_sousstatuts',[]);let s=id?subs.find(x=>x.id===id):null;
  if(!s){s={id:uid()};subs.push(s);}
  s.name=name;s.color=val('ss_color')||'#2D7DD2';
  save('egncrm_sousstatuts',subs);closeModal();setStatuts();toast('Sous-statut enregistré ✓','ok');
}
function delSousStatut(id){
  modalConfirm('Supprimer ce sous-statut ?','',()=>{
    save('egncrm_sousstatuts',load('egncrm_sousstatuts',[]).filter(s=>s.id!==id));
    closeModal();setStatuts();toast('Sous-statut supprimé','ok');
  });
}
function openStatus(id){
  const s=id?statById(id):null;const d=s||{color:'#7CC242',phase:'lead',won:false};
  let body=`<input type="hidden" id="st_id" value="${id||''}"><div class="fgrid">
    <div class="fld"><label>Nom du statut</label><input id="st_name" value="${esc(d.name)}" placeholder="Ex : Devis envoyé"></div>
    <div class="fld"><label>Couleur</label><input type="color" id="st_color" value="${d.color}" style="height:42px;padding:.2rem;cursor:pointer"></div>
    <div class="fld"><label>Phase</label><select id="st_phase"><option value="lead" ${d.phase==='lead'?'selected':''}>Lead (prospect)</option><option value="client" ${d.phase==='client'?'selected':''}>Client (transmis / installé)</option></select></div>
    <div class="fld"><label>Compté comme converti ?</label><select id="st_won"><option value="no" ${!d.won?'selected':''}>Non</option><option value="yes" ${d.won?'selected':''}>Oui</option></select></div>
  </div>`;
  openModal(id?'Modifier le statut':'Nouveau statut',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveStatus()">💾 Enregistrer</button>`);
}
function saveStatus(){const id=val('st_id');const name=val('st_name');if(!name){toast('Nom requis','err');return;}const sts=getAllStatuses();let s=id?sts.find(x=>x.id===id):null;if(!s){s={id:uid(),segment:SEGMENT,order:getStatuses().length};sts.push(s);}s.segment=s.segment||SEGMENT;s.name=name;s.color=val('st_color');s.phase=val('st_phase');s.won=val('st_won')==='yes';save(K.stat,sts);closeModal();renderSettings();buildNav();toast('Statut enregistré ✓','ok');}
function delStatus(id){const used=getRecs().some(r=>r.statusId===id);modalConfirm('Supprimer ce statut ?',used?'⚠️ Des dossiers utilisent ce statut — ils n\'auront plus de statut valide.':'Ce statut sera retiré du pipeline.',()=>{save(K.stat,getAllStatuses().filter(s=>s.id!==id));deleteRemoteRow(K.stat,id);closeModal();renderSettings();buildNav();toast('Statut supprimé','ok');});}
function moveStatus(i,dir){const sts=getStatuses();const j=i+dir;if(j<0||j>=sts.length)return;const t=sts[i];sts[i]=sts[j];sts[j]=t;sts.forEach((s,idx)=>s.order=idx);save(K.stat,mergeSeg(getAllStatuses(),sts));setStatuts();}

const CFGMAP={sources:{key:K.src,label:'source / régie',title:'Sources & régies commerciales'},equipes:{key:K.team,label:'équipe',title:'Équipes'},documents:{key:'egncrm_doctypes',label:'type de document',title:'Types de documents (pièces jointes)'},vt:{key:'egncrm_vt',label:'société de visite technique',title:'Sociétés de visite technique (sous-traitants)'},poseurs:{key:'egncrm_poseurs',label:'famille de poseurs',title:'Familles de poseurs (tarification & accès CRM)'},auditeurs:{key:'egncrm_auditeurs',label:'auditeur',title:'Auditeurs (sous-traitants)'},coefsu:{key:'egncrm_coefsu',label:'coefficient U',title:'Coefficients U — étude thermique (Admin/Super Admin)'},pac:{key:'egncrm_pac',label:'solution PAC',title:'Catalogue de solutions PAC — étude (Admin/Super Admin)'}};
function setSimple(type){
  const cfg=CFGMAP[type];const list=load(cfg.key,[]);
  const isPoseur=type==='poseurs';
  const isSource=type==='sources';
  const isVt=type==='vt';
  const isAud=type==='auditeurs';
  const isCoefU=type==='coefsu';
  const isPac=type==='pac';
  const isPriced=isPoseur||isSource||isVt||isAud;
  let h=`<div class="panel"><div class="panel-h"><h3>${cfg.title}</h3><div class="sp"><button class="btn btn-pri btn-sm" onclick="${isPoseur?'openPoseur()':isSource?'openSource()':isVt?'openVt()':isAud?'openAuditeur()':isCoefU?'openCoefU()':isPac?'openPac()':`openCfg('${type}')`}">+ Ajouter</button></div></div><div class="panel-b">`;
  if(isPoseur)h+=`<p class="muted" style="margin-bottom:.9rem">Une <b>famille de poseurs</b> regroupe une tarification (% de la marge brute, prix fixe, ou tarif journalier — par opération) et un ou plusieurs <b>accès CRM</b> (comptes utilisateurs, rôle Poseur). Plusieurs poseurs peuvent partager la même famille.</p>`;
  if(isSource)h+=`<p class="muted" style="margin-bottom:.9rem">Chaque <b>source / régie</b> peut avoir sa propre tarification « call center » : prix fixe par RDV, au m² selon la surface habitable, ou % de la marge brute. Cette tarification alimente automatiquement la comptabilité et les appels à facturation des dossiers rattachés à cette source.</p>`;
  if(isVt)h+=`<p class="muted" style="margin-bottom:.9rem">Chaque société de visite technique peut avoir un <b>tarif fixe par opération</b>. Le coût s'ajoute automatiquement à la comptabilité du dossier dès que son statut atteint « VT terminé » (ou une étape ultérieure).</p>`;
  if(isAud)h+=`<p class="muted" style="margin-bottom:.9rem">Chaque auditeur peut avoir un <b>tarif fixe par opération</b>. Le coût s'ajoute automatiquement à la comptabilité du dossier dès que son statut atteint « Audit terminé » (ou une étape ultérieure).</p>`;
  if(isCoefU)h+=`<p class="muted" style="margin-bottom:.9rem">Coefficients de transmission thermique <b>U (W/m².K)</b> utilisés dans le calcul des déperditions (méthode NF EN 12831 simplifiée) des études. Crée une entrée par type de paroi que tes techniciens rencontrent sur le terrain (ex : « Mur béton plein 30cm non isolé », « Fenêtre bois double vitrage »…).</p>`;
  if(isPac)h+=`<p class="muted" style="margin-bottom:.9rem">Catalogue des solutions PAC proposables dans les études (marque, modèle, puissance, COP/SCOP, Etas). Sélectionnable ensuite depuis la fiche dossier lors de la rédaction de l'étude.</p>`;
  h+=`<div class="cfg-list">`;
  if(!list.length)h+=`<div class="empty"><div class="big">📋</div>Aucun élément.</div>`;
  list.forEach(x=>{
    const nbTag=isPriced?`<span class="tag" style="background:rgba(124,194,66,.15);color:#5BA82E">${(x.prices||[]).length} tarif${(x.prices||[]).length>1?'s':''}</span>`:isCoefU?`<span class="tag" style="background:#eef0f2;color:#6b7785">${CATEGORIES_U[x.categorie]||x.categorie||''} — U = ${x.uValue||0}</span>`:isPac?`<span class="tag" style="background:#eef0f2;color:#6b7785">${x.puissance||0} kW · SCOP ${x.scop||'—'}</span>`:'';
    const editFn=isPoseur?`openPoseur('${x.id}')`:isSource?`openSource('${x.id}')`:isVt?`openVt('${x.id}')`:isAud?`openAuditeur('${x.id}')`:isCoefU?`openCoefU('${x.id}')`:isPac?`openPac('${x.id}')`:`openCfg('${type}','${x.id}')`;
    h+=`<div class="cfg-item"><span class="nm">${esc(x.name)}</span>${nbTag}<span class="sp"><button class="iconbtn" onclick="${editFn}">✏️</button><button class="iconbtn del" onclick="delCfg('${type}','${x.id}')">🗑️</button></span></div>`;
  });
  h+=`</div></div></div>`;document.getElementById('setBody').innerHTML=h;
}
const CATEGORIES_U={mur:'Mur',fenetre:'Fenêtre',porte:'Porte',plancher_bas:'Plancher bas',plancher_haut:'Plancher haut / combles'};
/* -- éditeur Coefficient U (étude thermique) -- */
function openCoefU(id){
  const list=load(CFGMAP.coefsu.key,[]);const x=id?list.find(a=>a.id===id):{id:uid(),name:'',categorie:'mur',uValue:0};
  const d=x||{id:uid(),name:'',categorie:'mur',uValue:0};
  let body=`<input type="hidden" id="cu_id" value="${d.id}">
    <div class="fld"><label>Nom (ex : Mur béton plein 30cm non isolé)</label><input id="cu_name" value="${esc(d.name)}"></div>
    <div class="fld" style="margin-top:.6rem"><label>Catégorie</label><select id="cu_cat">${Object.entries(CATEGORIES_U).map(([k,l])=>`<option value="${k}" ${d.categorie===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="fld" style="margin-top:.6rem"><label>Coefficient U (W/m².K)</label><input type="number" step="any" id="cu_val" value="${d.uValue||''}" placeholder="ex : 0.8"></div>
    <p class="muted" style="margin-top:.6rem;font-size:.74rem">💡 Plus U est faible, meilleure est l'isolation. Repères courants : mur non isolé ≈ 2 à 2.5, isolé correctement ≈ 0.3 à 0.5. Fenêtre simple vitrage ≈ 5, double vitrage ≈ 1.5 à 2.8.</p>`;
  openModal(id?'Coefficient U — '+esc(d.name):'Nouveau coefficient U',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveCoefU()">💾 Enregistrer</button>`);
}
function saveCoefU(){
  const id=val('cu_id');const name=val('cu_name');const categorie=val('cu_cat');const uValue=parseFloat(String(val('cu_val')||'').replace(',','.'))||0;
  if(!name){toast('Nom requis','err');return;}
  const list=load(CFGMAP.coefsu.key,[]);
  let x=list.find(a=>a.id===id);if(!x){x={id};list.push(x);}
  Object.assign(x,{name,categorie,uValue});
  save(CFGMAP.coefsu.key,list);closeModal();renderSettings();toast('Coefficient enregistré ✓','ok');
}
/* -- éditeur catalogue Solution PAC -- */
function openPac(id){
  const list=load(CFGMAP.pac.key,[]);const d=id?list.find(a=>a.id===id):{id:uid(),name:'',marque:'',modele:'',puissance:0,cop:'',scop:'',etas:''};
  let body=`<input type="hidden" id="pa_id" value="${d.id}">
    <div class="fgrid">
      <div class="fld"><label>Nom affiché (ex : PAC Daikin Altherma 45 kW)</label><input id="pa_name" value="${esc(d.name)}"></div>
      <div class="fld"><label>Marque</label><input id="pa_marque" value="${esc(d.marque||'')}"></div>
      <div class="fld"><label>Modèle</label><input id="pa_modele" value="${esc(d.modele||'')}"></div>
      <div class="fld"><label>Puissance chauffage (kW)</label><input type="number" step="any" id="pa_puissance" value="${d.puissance||''}"></div>
      <div class="fld"><label>COP</label><input id="pa_cop" value="${esc(d.cop||'')}" placeholder="ex : 3,7"></div>
      <div class="fld"><label>SCOP</label><input id="pa_scop" value="${esc(d.scop||'')}" placeholder="ex : 3,4"></div>
      <div class="fld"><label>Etas (%)</label><input id="pa_etas" value="${esc(d.etas||'')}" placeholder="ex : 126"></div>
    </div>`;
  openModal(id?'Solution PAC — '+esc(d.name):'Nouvelle solution PAC',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="savePac()">💾 Enregistrer</button>`,'wide');
}
function savePac(){
  const id=val('pa_id');const name=val('pa_name');
  if(!name){toast('Nom requis','err');return;}
  const list=load(CFGMAP.pac.key,[]);
  let x=list.find(a=>a.id===id);if(!x){x={id};list.push(x);}
  Object.assign(x,{name,marque:val('pa_marque'),modele:val('pa_modele'),puissance:parseFloat(String(val('pa_puissance')||'').replace(',','.'))||0,cop:val('pa_cop'),scop:val('pa_scop'),etas:val('pa_etas')});
  save(CFGMAP.pac.key,list);closeModal();renderSettings();toast('Solution PAC enregistrée ✓','ok');
}
/* -- éditeur société de Visite Technique : tarif FIXE par opération -- */
let VTDRAFT=null;
function openVt(id){
  const list=load(CFGMAP.vt.key,[]);const x=id?list.find(a=>a.id===id):null;
  VTDRAFT=x?JSON.parse(JSON.stringify(x)):{id:uid(),name:'',email:'',prices:[]};
  if(!VTDRAFT.prices)VTDRAFT.prices=[];
  renderVtEditor();
}
function vtCaptureName(){const e=document.getElementById('vt_name');if(e)VTDRAFT.name=e.value.trim();const em=document.getElementById('vt_email');if(em)VTDRAFT.email=em.value.trim();const tv=document.querySelector('input[name="vt_tva"]:checked');if(tv)VTDRAFT.tvaMode=tv.value;}
function vtCaptureRows(){
  document.querySelectorAll('#vt_rows [data-vtrow]').forEach(row=>{
    const i=+row.dataset.vtrow;const p=VTDRAFT.prices[i];if(!p)return;
    const op=row.querySelector('.vt_op'),vl=row.querySelector('.vt_val');
    if(op)p.opId=op.value;if(vl)p.value=parseFloat(String(vl.value||'').replace(',','.'))||0;
  });
}
function renderVtEditor(){
  const o=VTDRAFT;const ops=getProducts();
  let rows=o.prices.length?o.prices.map((p,i)=>`
    <div class="cfg-item" data-vtrow="${i}" style="flex-wrap:wrap;gap:.5rem">
      <select class="vt_op" style="flex:2;min-width:200px" onchange="vtCaptureRows();renderVtEditor()">
        <option value="">— Toutes opérations —</option>
        ${ops.map(op2=>`<option value="${op2.id}" ${p.opId===op2.id?'selected':''}>${esc(op2.name)}</option>`).join('')}
      </select>
      <div class="flex" style="align-items:center;gap:.3rem">
        <input class="vt_val" type="number" step="any" value="${p.value||''}" style="width:100px" placeholder="0">
        <span class="muted" style="font-size:.78rem">€ fixe</span>
      </div>
      <button class="iconbtn del" title="Supprimer" onclick="vtCaptureRows();vtDelPrice(${i})">🗑️</button>
    </div>`).join(''):`<div class="muted" style="font-size:.82rem;padding:.5rem 0">Aucun tarif configuré. Ajoutez une ligne par opération.</div>`;
  let body=`<div class="fgrid">
    <div class="fld"><label>Nom de la société</label><input id="vt_name" value="${esc(o.name)}" placeholder="Ex : Bureau de contrôle XYZ"></div>
    <div class="fld"><label>Email de contact <span class="muted" style="font-size:.62rem">(pour l'envoi des appels à facturation)</span></label><input id="vt_email" value="${esc(o.email||'')}" placeholder="contact@bureau-controle.fr"></div>
  </div>
    <div class="fld" style="margin-top:.6rem"><label>Mode de paiement par défaut <span class="muted" style="font-size:.62rem">(modifiable dossier par dossier)</span></label>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.85rem"><input type="radio" name="vt_tva" value="ttc" ${(o.tvaMode||'ttc')==='ttc'?'checked':''}>Paiement TTC</label>
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.85rem"><input type="radio" name="vt_tva" value="ht" ${o.tvaMode==='ht'?'checked':''}>Paiement HT <span class="muted" style="font-size:.72rem">(TVA récupérable)</span></label>
      </div>
    </div>
    <div class="sectitle" style="margin-top:.8rem">Tarification <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(montant fixe par opération)</span></div>
    <div id="vt_rows">${rows}</div>
    <button class="btn btn-ghost btn-sm" style="margin-top:.7rem" onclick="vtCaptureRows();vtAddPrice()">+ Ajouter un tarif</button>
    <p class="muted" style="margin-top:.6rem;font-size:.74rem">💡 Laissez « Toutes opérations » pour un tarif général, ou choisissez une opération précise.</p>`;
  openModal(o.name?'VT — '+esc(o.name):'Nouvelle société de visite technique',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveVt()">💾 Enregistrer</button>`,'wide');
}
function vtAddPrice(){vtCaptureName();VTDRAFT.prices.push({id:uid(),opId:'',value:0});renderVtEditor();}
function vtDelPrice(i){vtCaptureName();VTDRAFT.prices.splice(i,1);renderVtEditor();}
function saveVt(){
  vtCaptureName();vtCaptureRows();
  if(!VTDRAFT.name){toast('Nom requis','err');return;}
  const list=load(CFGMAP.vt.key,[]);
  const idx=list.findIndex(a=>a.id===VTDRAFT.id);
  if(idx>=0)list[idx]=VTDRAFT;else list.push(VTDRAFT);
  save(CFGMAP.vt.key,list);VTDRAFT=null;closeModal();renderSettings();toast('Société VT enregistrée ✓','ok');
}
/* -- éditeur Auditeur : tarif FIXE par opération (même principe que VT) -- */
let AUDDRAFT=null;
function openAuditeur(id){
  const list=load(CFGMAP.auditeurs.key,[]);const x=id?list.find(a=>a.id===id):null;
  AUDDRAFT=x?JSON.parse(JSON.stringify(x)):{id:uid(),name:'',email:'',prices:[]};
  if(!AUDDRAFT.prices)AUDDRAFT.prices=[];
  renderAudEditor();
}
function audCaptureName(){const e=document.getElementById('aud_name');if(e)AUDDRAFT.name=e.value.trim();const em=document.getElementById('aud_email');if(em)AUDDRAFT.email=em.value.trim();const tv=document.querySelector('input[name="aud_tva"]:checked');if(tv)AUDDRAFT.tvaMode=tv.value;}
function audCaptureRows(){
  document.querySelectorAll('#aud_rows [data-audrow]').forEach(row=>{
    const i=+row.dataset.audrow;const p=AUDDRAFT.prices[i];if(!p)return;
    const op=row.querySelector('.aud_op'),vl=row.querySelector('.aud_val');
    if(op)p.opId=op.value;if(vl)p.value=parseFloat(String(vl.value||'').replace(',','.'))||0;
  });
}
function renderAudEditor(){
  const o=AUDDRAFT;const ops=getProducts();
  let rows=o.prices.length?o.prices.map((p,i)=>`
    <div class="cfg-item" data-audrow="${i}" style="flex-wrap:wrap;gap:.5rem">
      <select class="aud_op" style="flex:2;min-width:200px" onchange="audCaptureRows();renderAudEditor()">
        <option value="">— Toutes opérations —</option>
        ${ops.map(op2=>`<option value="${op2.id}" ${p.opId===op2.id?'selected':''}>${esc(op2.name)}</option>`).join('')}
      </select>
      <div class="flex" style="align-items:center;gap:.3rem">
        <input class="aud_val" type="number" step="any" value="${p.value||''}" style="width:100px" placeholder="0">
        <span class="muted" style="font-size:.78rem">€ fixe</span>
      </div>
      <button class="iconbtn del" title="Supprimer" onclick="audCaptureRows();audDelPrice(${i})">🗑️</button>
    </div>`).join(''):`<div class="muted" style="font-size:.82rem;padding:.5rem 0">Aucun tarif configuré. Ajoutez une ligne par opération.</div>`;
  let body=`<div class="fgrid">
    <div class="fld"><label>Nom de l'auditeur</label><input id="aud_name" value="${esc(o.name)}" placeholder="Ex : Jean Dupont Audit"></div>
    <div class="fld"><label>Email de contact <span class="muted" style="font-size:.62rem">(pour l'envoi des appels à facturation)</span></label><input id="aud_email" value="${esc(o.email||'')}" placeholder="jean.dupont@audit.fr"></div>
  </div>
    <div class="fld" style="margin-top:.6rem"><label>Mode de paiement par défaut <span class="muted" style="font-size:.62rem">(modifiable dossier par dossier)</span></label>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.85rem"><input type="radio" name="aud_tva" value="ttc" ${(o.tvaMode||'ttc')==='ttc'?'checked':''}>Paiement TTC</label>
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.85rem"><input type="radio" name="aud_tva" value="ht" ${o.tvaMode==='ht'?'checked':''}>Paiement HT <span class="muted" style="font-size:.72rem">(TVA récupérable)</span></label>
      </div>
    </div>
    <div class="sectitle" style="margin-top:.8rem">Tarification <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(montant fixe par opération)</span></div>
    <div id="aud_rows">${rows}</div>
    <button class="btn btn-ghost btn-sm" style="margin-top:.7rem" onclick="audCaptureRows();audAddPrice()">+ Ajouter un tarif</button>
    <p class="muted" style="margin-top:.6rem;font-size:.74rem">💡 Laissez « Toutes opérations » pour un tarif général, ou choisissez une opération précise.</p>`;
  openModal(o.name?'Auditeur — '+esc(o.name):'Nouvel auditeur',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveAuditeur()">💾 Enregistrer</button>`,'wide');
}
function audAddPrice(){audCaptureName();AUDDRAFT.prices.push({id:uid(),opId:'',value:0});renderAudEditor();}
function audDelPrice(i){audCaptureName();AUDDRAFT.prices.splice(i,1);renderAudEditor();}
function saveAuditeur(){
  audCaptureName();audCaptureRows();
  if(!AUDDRAFT.name){toast('Nom requis','err');return;}
  const list=load(CFGMAP.auditeurs.key,[]);
  const idx=list.findIndex(a=>a.id===AUDDRAFT.id);
  if(idx>=0)list[idx]=AUDDRAFT;else list.push(AUDDRAFT);
  save(CFGMAP.auditeurs.key,list);AUDDRAFT=null;closeModal();renderSettings();toast('Auditeur enregistré ✓','ok');
}
/* -- éditeur de source / régie : tarification call center (prix par RDV / au m² / % devis) -- */
let SRCDRAFT=null;
const SRC_MODES={rdv:'Prix fixe par RDV',m2:'Prix au m² (surface habitable)',pourcentage:'% de la marge brute'};
function openSource(id){
  const list=load(CFGMAP.sources.key,[]);const x=id?list.find(a=>a.id===id):null;
  SRCDRAFT=x?JSON.parse(JSON.stringify(x)):{id:uid(),name:'',email:'',prices:[]};
  if(!SRCDRAFT.prices)SRCDRAFT.prices=[];
  renderSourceEditor();
}
function srcCaptureTop(){const n=document.getElementById('src_name');if(n)SRCDRAFT.name=n.value.trim();const e=document.getElementById('src_email');if(e)SRCDRAFT.email=e.value.trim();const tv=document.querySelector('input[name="src_tva"]:checked');if(tv)SRCDRAFT.tvaMode=tv.value;}
function srcCaptureRows(){
  document.querySelectorAll('#src_rows [data-srcrow]').forEach(row=>{
    const i=+row.dataset.srcrow;const p=SRCDRAFT.prices[i];if(!p)return;
    const op=row.querySelector('.src_op'),md=row.querySelector('.src_mode'),vl=row.querySelector('.src_val');
    if(op)p.opId=op.value;if(md)p.mode=md.value;if(vl)p.value=parseFloat(String(vl.value||'').replace(',','.'))||0;
  });
}
function renderSourceEditor(){
  const o=SRCDRAFT;const ops=getProducts();
  let rows=o.prices.length?o.prices.map((p,i)=>`
    <div class="cfg-item" data-srcrow="${i}" style="flex-wrap:wrap;gap:.5rem">
      <select class="src_op" style="flex:2;min-width:180px" onchange="srcCaptureRows();renderSourceEditor()">
        <option value="">— Toutes opérations —</option>
        ${ops.map(op2=>`<option value="${op2.id}" ${p.opId===op2.id?'selected':''}>${esc(op2.name)}</option>`).join('')}
      </select>
      <select class="src_mode" style="flex:1;min-width:170px" onchange="srcCaptureRows();renderSourceEditor()">
        ${Object.entries(SRC_MODES).map(([k,l])=>`<option value="${k}" ${p.mode===k?'selected':''}>${l}</option>`).join('')}
      </select>
      <div class="flex" style="align-items:center;gap:.3rem">
        <input class="src_val" type="number" step="any" value="${p.value||''}" style="width:100px" placeholder="0">
        <span class="muted" style="font-size:.78rem">${p.mode==='m2'?'€/m²':p.mode==='pourcentage'?'%':'€/RDV'}</span>
      </div>
      <button class="iconbtn del" title="Supprimer" onclick="srcCaptureRows();srcDelPrice(${i})">🗑️</button>
    </div>`).join(''):`<div class="muted" style="font-size:.82rem;padding:.5rem 0">Aucun tarif configuré. Ajoutez une ligne par opération / mode de rémunération.</div>`;
  let body=`<div class="fgrid">
    <div class="fld"><label>Nom de la source / régie</label><input id="src_name" value="${esc(o.name)}" placeholder="Ex : Régie Web Partenaire, Call Center Interne…"></div>
    <div class="fld"><label>Email de contact <span class="muted" style="font-size:.62rem">(pour l'appel à facturation)</span></label><input id="src_email" value="${esc(o.email||'')}" placeholder="contact@regie.fr"></div>
  </div>
    <div class="fld" style="margin-top:.6rem"><label>Mode de paiement par défaut <span class="muted" style="font-size:.62rem">(modifiable dossier par dossier)</span></label>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.85rem"><input type="radio" name="src_tva" value="ttc" ${(o.tvaMode||'ttc')==='ttc'?'checked':''}>Paiement TTC</label>
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.85rem"><input type="radio" name="src_tva" value="ht" ${o.tvaMode==='ht'?'checked':''}>Paiement HT <span class="muted" style="font-size:.72rem">(TVA récupérable)</span></label>
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.85rem"><input type="radio" name="src_tva" value="sans_tva" ${o.tvaMode==='sans_tva'?'checked':''}>Sans TVA <span class="muted" style="font-size:.72rem">(autoentrepreneur)</span></label>
      </div>
    </div>
    <div class="sectitle" style="margin-top:.8rem">Tarification call center <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(par opération — prix fixe par RDV, au m² selon la surface habitable, ou % de la marge brute)</span></div>
    <div id="src_rows">${rows}</div>
    <button class="btn btn-ghost btn-sm" style="margin-top:.7rem" onclick="srcCaptureRows();srcAddPrice()">+ Ajouter un tarif</button>
    <p class="muted" style="margin-top:.6rem;font-size:.74rem">💡 Laissez « Toutes opérations » pour un tarif général, ou choisissez une opération précise. Le mode « au m² » utilise le champ standard <b>Surface (m²)</b> présent sur toutes les fiches. Le mode « % de la marge brute » se base sur la <b>marge brute du dossier</b> saisie dans sa Comptabilité. Le montant se calcule automatiquement sur les dossiers rattachés à cette source.</p>`;
  openModal(o.name?'Source — '+esc(o.name):'Nouvelle source / régie',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveSource()">💾 Enregistrer</button>`,'wide');
}
function srcAddPrice(){srcCaptureTop();SRCDRAFT.prices.push({id:uid(),opId:'',mode:'rdv',value:0});renderSourceEditor();}
function srcDelPrice(i){srcCaptureTop();SRCDRAFT.prices.splice(i,1);renderSourceEditor();}
function saveSource(){
  srcCaptureTop();srcCaptureRows();
  if(!SRCDRAFT.name){toast('Nom requis','err');return;}
  const list=load(CFGMAP.sources.key,[]);
  const idx=list.findIndex(a=>a.id===SRCDRAFT.id);
  if(idx>=0)list[idx]=SRCDRAFT;else list.push(SRCDRAFT);
  save(CFGMAP.sources.key,list);SRCDRAFT=null;closeModal();renderSettings();toast('Source enregistrée ✓','ok');
}
/* -- éditeur de famille de poseurs : tarification (% devis / prix fixe / journée) + accès CRM -- */
let PZDRAFT=null,PZ_ASSIGN=[];
const PZ_MODES={pourcentage:'% de la marge brute',fixe:'Prix fixe par installation',jour:'Tarif à la journée',m2:'Prix au m² (métrage du dossier)'};
function openPoseur(id){
  const list=load(CFGMAP.poseurs.key,[]);const x=id?list.find(a=>a.id===id):null;
  PZDRAFT=x?JSON.parse(JSON.stringify(x)):{id:uid(),name:'',prices:[]};
  if(!PZDRAFT.prices)PZDRAFT.prices=[];
  PZ_ASSIGN=(x&&x.userIds)?[...x.userIds]:[];
  renderPoseurEditor();
}
function poseurFamilyOf(userId){const list=load(CFGMAP.poseurs.key,[]);const f=list.find(x=>(x.userIds||[]).includes(userId));return f?f.name:'';}
function renderPzAssignChips(){
  const selfId=PZDRAFT?PZDRAFT.id:'';
  const cand=getUsers().filter(u=>u.role==='poseur');
  const chips=document.getElementById('pz_assign_chips');
  if(chips)chips.innerHTML=PZ_ASSIGN.length?PZ_ASSIGN.map(id=>{const u=userById(id);return `<span class="chip" style="display:inline-flex;align-items:center;gap:.4rem;padding:.2rem .6rem">${u?esc(u.prenom+' '+u.nom):'?'}<span style="cursor:pointer;font-weight:800;color:var(--coral)" onclick="removePzAssign('${id}')">✕</span></span>`;}).join(''):'<span class="muted" style="font-size:.78rem">Aucun accès CRM associé à cette famille.</span>';
  const pick=document.getElementById('pz_assign_pick');
  if(pick)pick.innerHTML='<option value="">+ Choisir un accès CRM (rôle Poseur)…</option>'+cand.filter(u=>!PZ_ASSIGN.includes(u.id)).map(u=>{const other=poseurFamilyOf(u.id);return `<option value="${u.id}">${esc(u.prenom+' '+u.nom)}${other&&other!==(PZDRAFT.name||'')?' — actuellement: '+esc(other):''}</option>`;}).join('');
}
function addPzAssign(id){if(!id)return;if(!PZ_ASSIGN.includes(id))PZ_ASSIGN.push(id);renderPzAssignChips();}
function removePzAssign(id){PZ_ASSIGN=PZ_ASSIGN.filter(x=>x!==id);renderPzAssignChips();}
function pzCaptureName(){const e=document.getElementById('pz_name');if(e)PZDRAFT.name=e.value.trim();const tv=document.querySelector('input[name="pz_tva"]:checked');if(tv)PZDRAFT.tvaMode=tv.value;}
function pzCaptureRows(){
  document.querySelectorAll('#pz_rows [data-pzrow]').forEach(row=>{
    const i=+row.dataset.pzrow;const p=PZDRAFT.prices[i];if(!p)return;
    const op=row.querySelector('.pz_op'),md=row.querySelector('.pz_mode'),vl=row.querySelector('.pz_val');
    if(op)p.opId=op.value;if(md)p.mode=md.value;if(vl)p.value=parseFloat(String(vl.value||'').replace(',','.'))||0;
  });
}
function renderPoseurEditor(){
  const o=PZDRAFT;const ops=getProducts();
  let rows=o.prices.length?o.prices.map((p,i)=>{
    return `
    <div class="cfg-item" data-pzrow="${i}" style="flex-wrap:wrap;gap:.5rem">
      <select class="pz_op" style="flex:2;min-width:180px" onchange="pzCaptureRows();renderPoseurEditor()">
        <option value="">— Toutes opérations —</option>
        ${ops.map(op2=>`<option value="${op2.id}" ${p.opId===op2.id?'selected':''}>${esc(op2.name)}</option>`).join('')}
      </select>
      <select class="pz_mode" style="flex:1;min-width:170px" onchange="pzCaptureRows();renderPoseurEditor()">
        ${Object.entries(PZ_MODES).map(([k,l])=>`<option value="${k}" ${p.mode===k?'selected':''}>${l}</option>`).join('')}
      </select>
      <div class="flex" style="align-items:center;gap:.3rem">
        <input class="pz_val" type="number" step="any" value="${p.value||''}" style="width:100px" placeholder="0">
        <span class="muted" style="font-size:.78rem">${p.mode==='pourcentage'?'%':p.mode==='m2'?'€/m²':'€'}</span>
      </div>
      <button class="iconbtn del" title="Supprimer" onclick="pzCaptureRows();pzDelPrice(${i})">🗑️</button>
    </div>`;}).join(''):`<div class="muted" style="font-size:.82rem;padding:.5rem 0">Aucun tarif configuré. Ajoutez une ligne par opération / mode de rémunération.</div>`;
  let body=`<div class="fld"><label>Nom de la famille</label><input id="pz_name" value="${esc(o.name)}" placeholder="Ex : Équipe Nord, Sté Dupont Isolation…"></div>
    <div class="fld" style="margin-top:.6rem"><label>Mode de paiement par défaut <span class="muted" style="font-size:.62rem">(modifiable dossier par dossier)</span></label>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.85rem"><input type="radio" name="pz_tva" id="pz_tva_ttc" value="ttc" ${(o.tvaMode||'ttc')==='ttc'?'checked':''}>Paiement TTC <span class="muted" style="font-size:.72rem">(TVA non récupérable)</span></label>
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.85rem"><input type="radio" name="pz_tva" id="pz_tva_ht" value="ht" ${o.tvaMode==='ht'?'checked':''}>Paiement HT <span class="muted" style="font-size:.72rem">(TVA récupérable)</span></label>
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.85rem"><input type="radio" name="pz_tva" value="sans_tva" ${o.tvaMode==='sans_tva'?'checked':''}>Sans TVA <span class="muted" style="font-size:.72rem">(autoentrepreneur — pas de TVA)</span></label>
      </div>
    </div>
    <div class="sectitle">Tarification <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(par opération — % de la marge, prix fixe, tarif journalier, ou au m²)</span></div>
    <div id="pz_rows">${rows}</div>
    <button class="btn btn-ghost btn-sm" style="margin-top:.7rem" onclick="pzCaptureRows();pzAddPrice()">+ Ajouter un tarif</button>
    <p class="muted" style="margin-top:.6rem;font-size:.74rem">💡 Laissez « Toutes opérations » pour un tarif général (journalier ou au m² sur toutes les fiches), ou choisissez une opération précise pour un tarif propre à cette prestation. Le mode « au m² » utilise le champ standard <b>Surface (m²)</b> présent sur toutes les fiches.</p>
    <div class="sectitle">Accès CRM associés <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-mut)">(comptes utilisateurs de rôle Poseur qui utilisent cette tarification)</span></div>
    <div class="fld"><label>Ajouter un accès</label><select id="pz_assign_pick" onchange="addPzAssign(this.value)"></select></div>
    <div id="pz_assign_chips" class="flex" style="flex-wrap:wrap;gap:.4rem;margin-top:.55rem"></div>
    <p class="muted" style="margin-top:.6rem;font-size:.74rem">💡 Un accès CRM appartient à une seule famille à la fois — l'associer ici le retire automatiquement d'une autre famille à l'enregistrement.</p>`;
  openModal(o.name?'Famille — '+esc(o.name):'Nouvelle famille de poseurs',body,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="savePoseur()">💾 Enregistrer</button>`,'wide');
  renderPzAssignChips();
}
function pzAddPrice(){pzCaptureName();PZDRAFT.prices.push({id:uid(),opId:'',mode:'pourcentage',value:0});renderPoseurEditor();}
function pzDelPrice(i){pzCaptureName();PZDRAFT.prices.splice(i,1);renderPoseurEditor();}
function savePoseur(){
  pzCaptureName();pzCaptureRows();
  if(!PZDRAFT.name){toast('Nom de la famille requis','err');return;}
  PZDRAFT.userIds=[...PZ_ASSIGN];
  const list=load(CFGMAP.poseurs.key,[]);
  // un accès CRM ne peut appartenir qu'à une seule famille : on le retire des autres
  list.forEach(f=>{if(f.id!==PZDRAFT.id&&f.userIds)f.userIds=f.userIds.filter(uid2=>!PZDRAFT.userIds.includes(uid2));});
  const idx=list.findIndex(a=>a.id===PZDRAFT.id);
  if(idx>=0)list[idx]=PZDRAFT;else list.push(PZDRAFT);
  save(CFGMAP.poseurs.key,list);PZDRAFT=null;closeModal();renderSettings();toast('Famille de poseurs enregistrée ✓','ok');
}
function openCfg(type,id){const cfg=CFGMAP[type];const list=load(cfg.key,[]);const x=id?list.find(a=>a.id===id):null;
  openModal((id?'Modifier ':'Nouveau ')+cfg.label,`<input type="hidden" id="cf_id" value="${id||''}"><input type="hidden" id="cf_type" value="${type}"><div class="fld"><label>Nom</label><input id="cf_name" value="${esc(x?x.name:'')}"></div>`,`<button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-pri" onclick="saveCfg()">💾 Enregistrer</button>`);}
function saveCfg(){const type=val('cf_type');const cfg=CFGMAP[type];const id=val('cf_id');const name=val('cf_name');if(!name){toast('Nom requis','err');return;}const list=load(cfg.key,[]);let x=id?list.find(a=>a.id===id):null;if(!x){x={id:uid()};list.push(x);}x.name=name;save(cfg.key,list);closeModal();renderSettings();toast('Enregistré ✓','ok');}
function delCfg(type,id){const cfg=CFGMAP[type];modalConfirm('Supprimer cet élément ?','',()=>{save(cfg.key,load(cfg.key,[]).filter(a=>a.id!==id));deleteRemoteRow(cfg.key,id);closeModal();renderSettings();toast('Supprimé','ok');});}
/* ---- Diagnostic de synchronisation Supabase ---- */
const SYNC_LABELS={
  records:'Dossiers / leads',rdvs:'Rendez-vous',cfg_statuses:'Statuts',cfg_sousstatuts:'Sous-statuts',
  cfg_operations:'Opérations',cfg_sources:'Sources / régies',cfg_equipes:'Équipes',cfg_doctypes:'Types de documents',
  cfg_vt:'Visites techniques',cfg_auditeurs:'Auditeurs',cfg_delegataires:'Délégataires',cfg_mailtpl:'Modèles e-mail',
  cfg_items:'Produits',sav_tickets:'Tickets SAV',cfg_poseurs:'Poseurs',cfg_uvalues:'Coefficients U',
  cfg_pac:'Solutions PAC',cfg_doc_templates:'Modèles de documents',cfg_materiels:'Catalogue matériels',
  stock_mouvements:'Mouvements de stock',apf_delegataires:'APF délégataires',cfg_societe:'Paramètres société'
};
const EXTRA_TABLES=[
  {table:'factures_agents',label:'APF / factures agents'},
  {table:'dossier_compta',label:'Comptabilité par dossier'},
  {table:'dossier_deal',label:'Deals / primes'},
  {table:'profiles',label:'Utilisateurs'}
];
async function runSyncDiag(){
  const body=document.getElementById('syncDiagBody');if(!body)return;
  body.innerHTML='<div class="empty"><div class="big">⏳</div>Vérification des tables Supabase…</div>';
  const checks=[
    ...SYNC_TABLES.map(c=>({table:c.table,label:SYNC_LABELS[c.table]||c.table,key:c.key,shape:c.shape})),
    ...EXTRA_TABLES.map(t=>({table:t.table,label:t.label,key:null}))
  ];
  const results=[];
  for(const c of checks){
    let remote=null,err=null;
    try{
      const{count,error}=await SUPA.from(c.table).select('*',{count:'exact',head:true});
      if(error)throw error;
      remote=count||0;
    }catch(e){err=e.message||String(e);}
    let local=null;
    if(c.key){
      const v=load(c.key,c.shape==='single'?null:[]);
      local=Array.isArray(v)?v.length:(v?1:0);
    }
    results.push({...c,remote,local,err});
  }
  const ko=results.filter(r=>r.err);
  const desync=results.filter(r=>!r.err&&r.local!=null&&r.local>r.remote);
  let h='';
  if(!ko.length&&!desync.length){
    h+=`<div style="background:#EFF7E8;border:1.5px solid var(--green);border-radius:10px;padding:.7rem 1rem;margin-bottom:.8rem;font-size:.84rem"><b>✅ Tout est synchronisé.</b> Chaque type de données est enregistré sur Supabase et visible par les utilisateurs autorisés.</div>`;
  } else {
    if(ko.length)h+=`<div style="background:#FEE8E8;border:1.5px solid var(--coral);border-radius:10px;padding:.7rem 1rem;margin-bottom:.6rem;font-size:.84rem"><b>⛔ ${ko.length} table${ko.length>1?'s':''} inaccessible${ko.length>1?'s':''}</b> — données conservées uniquement sur cet appareil. Lancez le SQL de mise en conformité dans Supabase.</div>`;
    if(desync.length)h+=`<div style="background:#FFF4E5;border:1.5px solid #F0C486;border-radius:10px;padding:.7rem 1rem;margin-bottom:.6rem;font-size:.84rem"><b>⚠️ ${desync.length} table${desync.length>1?'s':''} en retard</b> — des données locales n'ont pas été publiées. Utilisez « Republier » ci-dessous.</div>`;
  }
  h+=`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Donnée</th><th>Table Supabase</th><th class="r">En ligne</th><th class="r">Sur cet appareil</th><th>État</th><th class="r"></th></tr></thead><tbody>`;
  results.forEach(r=>{
    let badge,action='';
    if(r.err)badge=`<span style="background:#FEE8E8;color:#A32D2D;border-radius:6px;padding:2px 8px;font-size:.7rem;font-weight:700">⛔ Erreur</span><div class="muted" style="font-size:.65rem;margin-top:.15rem">${esc(r.err)}</div>`;
    else if(r.local!=null&&r.local>r.remote){
      badge=`<span style="background:#FFF4E5;color:#B96A0A;border-radius:6px;padding:2px 8px;font-size:.7rem;font-weight:700">⚠️ En retard</span>`;
      action=`<button class="btn btn-ghost btn-sm" style="font-size:.7rem" onclick="republishTable('${r.key}')">⇧ Republier</button>`;
    }
    else badge=`<span style="background:#E6F7F0;color:#0F6E56;border-radius:6px;padding:2px 8px;font-size:.7rem;font-weight:700">✅ En ligne</span>`;
    h+=`<tr>
      <td style="font-weight:700">${esc(r.label)}</td>
      <td class="muted" style="font-size:.75rem">${esc(r.table)}</td>
      <td style="text-align:right;font-weight:700">${r.remote!=null?r.remote:'—'}</td>
      <td style="text-align:right" class="muted">${r.local!=null?r.local:'—'}</td>
      <td>${badge}</td>
      <td style="text-align:right">${action}</td>
    </tr>`;
  });
  h+=`</tbody></table></div>`;
  h+=`<p class="muted" style="font-size:.72rem;margin-top:.6rem">« En ligne » = lignes réellement présentes sur Supabase. Un écart normal peut apparaître si vos droits limitent la lecture à vos propres dossiers.</p>`;
  body.innerHTML=h;
}
async function republishTable(key){
  const cfg=SYNC_TABLES.find(c=>c.key===key);if(!cfg)return;
  const v=load(key,cfg.shape==='single'?{}:[]);
  toast('Publication en cours…','ok');
  await pushTable(cfg,v);
  toast('Données republiées ✓','ok');
  runSyncDiag();
}

function setSociete(){
  const s=getSettings();
  const tarifs=s.tarifsEnergie||{};
  const energies=[['propane','Propane','€/L'],['fioul','Fioul domestique','€/L'],['gaz','Gaz naturel','€/kWh'],['electricite','Électricité','€/kWh'],['bois','Bois / granulés','€/kWh']];
  // ---- Expediteurs e-mail ----
  const pr=(s.emailProfils||{});
  const pc=pr.client||{}, pk=pr.compta||{};
  const ie="font-family:'Saira',sans-serif;font-size:.85rem;border:1.5px solid var(--border-grey);border-radius:9px;padding:.45rem .7rem;outline:none;width:100%";
  const blocProfil=(cle,titre,desc,v,exemple)=>`
    <div style="background:var(--bg-soft);border-radius:11px;padding:.9rem 1rem">
      <div style="font-size:.78rem;font-weight:800;color:var(--navy);margin-bottom:.15rem">${titre}</div>
      <div class="muted" style="font-size:.72rem;margin-bottom:.6rem">${desc}</div>
      <div class="fgrid">
        <div class="fld"><label>Nom affiché</label><input id="em_${cle}_nom" value="${esc(v.nom||'')}" placeholder="EGN Rénovation" style="${ie}"></div>
        <div class="fld"><label>Adresse d'expédition</label><input id="em_${cle}_adresse" value="${esc(v.adresse||'')}" placeholder="${exemple}" style="${ie}"></div>
        <div class="fld" style="grid-column:1/-1"><label>Répondre à <span class="muted" style="font-weight:500;text-transform:none;letter-spacing:0">— où arrivent les réponses</span></label><input id="em_${cle}_reply" value="${esc(v.replyTo||'')}" placeholder="votre boîte habituelle" style="${ie}"></div>
        <div class="fld" style="grid-column:1/-1"><label>Signature <span class="muted" style="font-weight:500;text-transform:none;letter-spacing:0">— ajoutée en bas des messages</span></label><input id="em_${cle}_sign" value="${esc(v.signature||'')}" placeholder="EGN Rénovation — 01 23 45 67 89" style="${ie}"></div>
      </div>
    </div>`;
  let h=`<div class="panel"><div class="panel-h"><h3>✉️ Expéditeurs e-mail</h3><div class="sp">
      <button class="btn btn-pri btn-sm" onclick="saveProfilsEmail()">💾 Enregistrer</button></div></div><div class="panel-b">
    <p class="muted" style="font-size:.8rem;margin-bottom:.9rem">Deux expéditeurs distincts selon le type d'envoi. Les adresses doivent appartenir au domaine vérifié chez votre fournisseur d'envoi.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:.8rem">
      ${blocProfil('client','👤 Clients','Devis, attestations, courriers envoyés aux clients.',pc,'contact@egnrenovation.fr')}
      ${blocProfil('compta','🧾 Comptabilité','Appels à facturation envoyés aux poseurs, sources, VT et auditeurs.',pk,'compta@egnrenovation.fr')}
    </div>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-end;margin-top:.9rem;padding-top:.8rem;border-top:1px solid var(--border-grey)">
      <div class="fld" style="flex:1;min-width:190px"><label>Adresse de test</label><input id="em_test" value="${esc(s.email||'')}" placeholder="vous@egnrenovation.fr" style="${ie}"></div>
      <select id="em_test_profil" style="${ie};width:auto;font-weight:700">
        <option value="client">👤 Profil Clients</option>
        <option value="compta">🧾 Profil Comptabilité</option>
      </select>
      <button class="btn btn-navy btn-sm" onclick="testerEmail()">📤 Envoyer un test</button>
    </div>
    <div id="em_test_res" style="margin-top:.6rem"></div>
  </div></div>`;
  h+=`<div class="panel"><div class="panel-h"><h3>📱 Notifications WhatsApp</h3><div class="sp">
    <label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;cursor:pointer;font-weight:700">
      <input type="checkbox" id="wa_enabled" ${s.waEnabled?'checked':''} onchange="toggleWaEnabled(this.checked)"> Activer
    </label></div></div><div class="panel-b">
    <p class="muted" style="font-size:.8rem;margin-bottom:.7rem">Les personnes mentionnées dans un commentaire et le passage d'un lead en client déclenchent un message WhatsApp. Le numéro de chaque destinataire se renseigne dans sa fiche utilisateur.</p>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-end">
      <div class="fld" style="flex:1;min-width:200px"><label>Numéro de test</label><input id="wa_test_num" placeholder="+33 6 12 34 56 78" value="${esc((ME&&ME.whatsapp)||'')}"></div>
      <button class="btn btn-navy btn-sm" onclick="testWhatsApp()">📤 Envoyer un message de test</button>
    </div>
    <div id="wa_test_res" style="margin-top:.6rem"></div>
    <div style="margin-top:.8rem;padding-top:.7rem;border-top:1px solid var(--border-grey)">
      <div style="font-size:.74rem;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.4px;margin-bottom:.4rem">Destinataires configurés</div>
      ${(function(){
        const us=getUsers().filter(u=>u.active!==false);
        const avec=us.filter(u=>u.whatsapp);
        if(!avec.length)return '<p class="muted" style="font-size:.8rem">Aucun utilisateur n\'a de numéro WhatsApp renseigné.</p>';
        return avec.map(u=>`<span style="display:inline-block;background:var(--bg-soft);border-radius:7px;padding:.2rem .6rem;margin:0 .3rem .3rem 0;font-size:.78rem"><b>${esc(u.prenom+' '+u.nom)}</b> <span class="muted">${esc(u.whatsapp)}</span></span>`).join('')
          +`<div class="muted" style="font-size:.74rem;margin-top:.3rem">${avec.length} sur ${us.length} utilisateur${us.length>1?'s':''} actif${us.length>1?'s':''}</div>`;
      })()}
    </div>
  </div></div>`;
  h+=`<div class="panel"><div class="panel-h"><h3>🔄 Diagnostic de synchronisation</h3><div class="sp"><button class="btn btn-navy btn-sm" onclick="runSyncDiag()">Lancer le diagnostic</button></div></div><div class="panel-b" id="syncDiagBody"><p class="muted" style="font-size:.8rem">Vérifie que chaque type de données est bien enregistré sur Supabase et visible par toute l'équipe, et non uniquement sur cet appareil.</p></div></div>`;
  h+=`<div class="panel"><div class="panel-h"><h3>Informations société</h3></div><div class="panel-b"><div class="fgrid">
    <div class="fld"><label>Nom de la société</label><input id="co_name" value="${esc(s.company)}"></div>
    <div class="fld"><label>Email de contact</label><input id="co_email" value="${esc(s.email)}"></div>
    <div class="fld"><label>Téléphone</label><input id="co_phone" value="${esc(s.phone)}"></div>
    <div class="fld"><label>Logo (PNG / JPG)</label><input type="file" accept="image/*" onchange="uploadLogo(this.files[0])"></div>
    <div class="fld full" style="margin-top:.3rem">${s.logo?`<img src="${s.logo}" style="max-height:70px;border-radius:8px;background:#1A2B3D;padding:.5rem">`:'<span class="muted">Aucun logo importé</span>'}</div>
  </div><button class="btn btn-pri" style="margin-top:1.1rem" onclick="saveSociete()">💾 Enregistrer</button></div></div>
  <div class="panel" style="margin-top:1.2rem"><div class="panel-h"><h3>TVA</h3></div><div class="panel-b">
    <p class="muted" style="margin-bottom:.8rem;font-size:.82rem">Tous les montants saisis dans le CRM (prime CEE, devis, tarifs poseur / call center / VT / auditeur, produits, faux frais…) sont réputés <b>TTC</b>. Le CRM déduit automatiquement la TVA au taux ci-dessous et affiche le <b>montant HT</b> et la <b>TVA</b> partout : fiches dossier, comptabilité, rapports, appels à facturation et études.</p>
    <div class="fgrid c3"><div class="fld"><label>Taux de TVA <span class="muted" style="font-size:.66rem">(%)</span></label><input type="number" step="any" id="co_tva" value="${s.tvaRate!=null&&s.tvaRate!==''?s.tvaRate:20}" placeholder="20"></div></div>
    <button class="btn btn-pri btn-sm" style="margin-top:.8rem" onclick="saveTvaRate()">💾 Enregistrer le taux</button>
  </div></div>
  <div class="panel" style="margin-top:1.2rem"><div class="panel-h"><h3>Tarifs énergie</h3></div><div class="panel-b">
    <p class="muted" style="margin-bottom:.8rem;font-size:.82rem">Prix unitaire moyen par énergie — utilisé pour estimer automatiquement le <b>coût annuel actuel</b> dans les études (consommation saisie × prix ci-dessous).</p>
    <div class="fgrid c3">
      ${energies.map(([k,l,u])=>`<div class="fld"><label>${esc(l)} <span class="muted" style="font-size:.66rem">(${u})</span></label><input type="number" step="any" id="tarif_${k}" value="${tarifs[k]||''}" placeholder="0"></div>`).join('')}
    </div>
    <button class="btn btn-pri btn-sm" style="margin-top:.8rem" onclick="saveTarifsEnergie()">💾 Enregistrer les tarifs</button>
  </div></div>
  <div class="panel" style="margin-top:1.2rem"><div class="panel-h"><h3>Tarif Thermitube</h3></div><div class="panel-b">
    <p class="muted" style="margin-bottom:.8rem;font-size:.82rem">Prix au mètre linéaire de gaine Thermitube — utilisé pour estimer automatiquement le devis dans les études AGRI-EQ-108.</p>
    <div class="fgrid c3"><div class="fld"><label>Prix Thermitube <span class="muted" style="font-size:.66rem">(€/ml)</span></label><input type="number" step="any" id="tarif_thermitube" value="${s.tarifThermitube||''}" placeholder="ex : 20"></div></div>
    <button class="btn btn-pri btn-sm" style="margin-top:.8rem" onclick="saveTarifThermitube()">💾 Enregistrer</button>
  </div></div>`;
  document.getElementById('setBody').innerHTML=h;
}
function saveTvaRate(){
  const s=getSettings();
  const t=parseFloat(String(val('co_tva')||'').replace(',','.'));
  s.tvaRate=isNaN(t)?20:t;
  save(K.set,s);toast('Taux de TVA enregistré ✓ ('+s.tvaRate+'%)','ok');
}
function saveTarifThermitube(){
  const s=getSettings();
  s.tarifThermitube=parseFloat(String(val('tarif_thermitube')||'').replace(',','.'))||0;
  save(K.set,s);toast('Tarif Thermitube enregistré ✓','ok');
}
function saveTarifsEnergie(){
  const s=getSettings();
  const energies=['propane','fioul','gaz','electricite','bois'];
  s.tarifsEnergie=s.tarifsEnergie||{};
  energies.forEach(k=>{s.tarifsEnergie[k]=parseFloat(String(val('tarif_'+k)||'').replace(',','.'))||0;});
  save(K.set,s);toast('Tarifs énergie enregistrés ✓','ok');
}
function uploadLogo(f){if(!f)return;const r=new FileReader();r.onload=e=>{const s=getSettings();s.logo=e.target.result;save(K.set,s);renderSettings();toast('Logo enregistré ✓','ok');};r.readAsDataURL(f);}
function saveSociete(){const s=getSettings();s.company=val('co_name');s.email=val('co_email');s.phone=val('co_phone');save(K.set,s);toast('Société enregistrée ✓','ok');}

