/* ============================================================
   EGN CRM — modules/15-scanner.js
   Scanner de documents par la caméra
   ============================================================ */
/* ============================================================
   SCANNER DE DOCUMENT — caméra dans le navigateur, multi-photos → PDF
   ============================================================ */
let SCANNER_STREAM=null;
let SCAN_PAGES=[]; // tableau de dataURL JPEG
function openScanner(recId){
  SCAN_PAGES=[];
  const dts=getDocTypes();
  const body=`
    <div style="margin-bottom:.6rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
      <div class="fld" style="flex:1;min-width:160px;margin:0"><select id="scan_type">${dts.length?dts.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join(''):'<option value="">— Document —</option>'}</select></div>
      <div class="fld" style="flex:1;min-width:140px;margin:0"><input id="scan_name" placeholder="Nom du fichier (optionnel)"></div>
    </div>
    <div style="position:relative;background:#000;border-radius:10px;overflow:hidden;min-height:260px;display:flex;align-items:center;justify-content:center">
      <video id="scan_video" autoplay playsinline muted style="width:100%;max-height:380px;display:block;border-radius:10px"></video>
      <canvas id="scan_canvas" style="display:none"></canvas>
      <div id="scan_preview" style="display:none;position:absolute;inset:0;background:#000;border-radius:10px;flex-direction:column;align-items:center;justify-content:center">
        <img id="scan_img" style="max-width:100%;max-height:320px;object-fit:contain;border-radius:8px;border:2px solid #7CC242">
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-ghost btn-sm" style="background:rgba(0,0,0,.6);color:#fff;border-color:rgba(255,255,255,.4)" onclick="scanRetake()">🔄 Reprendre</button>
          <button class="btn btn-pri btn-sm" onclick="scanAddPage('${recId}')">➕ Ajouter cette page</button>
        </div>
      </div>
      <div id="scan_loading" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,.7);border-radius:10px;align-items:center;justify-content:center;color:#fff;font-size:.9rem">⏳ Génération du PDF…</div>
    </div>
    <div style="text-align:center;margin-top:10px">
      <button class="btn btn-pri" onclick="scanCapture()" style="font-size:1rem;padding:9px 24px">📷 Prendre la photo</button>
    </div>
    <div id="scan_pages_bar" style="margin-top:10px;display:none">
      <div style="font-size:.78rem;font-weight:700;color:var(--text-mut);margin-bottom:6px">Pages capturées :</div>
      <div id="scan_thumbs" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      <div style="margin-top:10px;display:flex;gap:8px;justify-content:center">
        <button class="btn btn-ghost btn-sm" onclick="scanCapture();document.getElementById('scan_preview').style.display='none'">📷 Ajouter une autre page</button>
        <button class="btn btn-pri" id="scan_finalize_btn" onclick="scanFinalize('${recId}')">✅ Finaliser le PDF</button>
      </div>
    </div>
    <p class="muted" style="text-align:center;font-size:.72rem;margin-top:.5rem">Toutes les pages seront assemblées en un seul PDF.</p>`;
  openModal('📷 Scanner un document',body,`<button class="btn btn-ghost" onclick="closeScanner()">Fermer</button>`,'wide');
  setTimeout(()=>startScanner(),200);
}
async function startScanner(){
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}}});
    SCANNER_STREAM=stream;
    const v=document.getElementById('scan_video');if(v)v.srcObject=stream;
  }catch(e){toast('Impossible d\'accéder à la caméra — vérifiez les permissions','err');console.error('[scanner]',e);}
}
function scanCapture(){
  const v=document.getElementById('scan_video');const c=document.getElementById('scan_canvas');
  const img=document.getElementById('scan_img');const preview=document.getElementById('scan_preview');
  if(!v||!c)return;
  c.width=v.videoWidth||1280;c.height=v.videoHeight||720;
  c.getContext('2d').drawImage(v,0,0,c.width,c.height);
  const dataUrl=c.toDataURL('image/jpeg',0.92);
  if(img)img.src=dataUrl;
  if(preview){preview.style.display='flex';}
}
function scanRetake(){
  const preview=document.getElementById('scan_preview');
  if(preview)preview.style.display='none';
}
function scanAddPage(){
  const c=document.getElementById('scan_canvas');if(!c)return;
  const dataUrl=c.toDataURL('image/jpeg',0.92);
  SCAN_PAGES.push(dataUrl);
  const preview=document.getElementById('scan_preview');if(preview)preview.style.display='none';
  const bar=document.getElementById('scan_pages_bar');if(bar)bar.style.display='block';
  const thumbs=document.getElementById('scan_thumbs');
  if(thumbs){
    const idx=SCAN_PAGES.length-1;
    const thumb=document.createElement('div');
    thumb.style.cssText='position:relative;display:inline-flex;flex-direction:column;align-items:center;gap:3px';
    thumb.innerHTML=`<img src="${dataUrl}" style="height:72px;width:54px;object-fit:cover;border-radius:5px;border:1.5px solid var(--border-grey)"><span style="font-size:.62rem;color:var(--text-mut)">p.${SCAN_PAGES.length}</span><button onclick="scanDeletePage(${idx})" style="position:absolute;top:-5px;right:-5px;background:#E63946;color:#fff;border:none;border-radius:50%;width:16px;height:16px;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>`;
    thumbs.appendChild(thumb);
  }
  const btn=document.getElementById('scan_finalize_btn');
  if(btn)btn.textContent=`✅ Finaliser le PDF (${SCAN_PAGES.length} page${SCAN_PAGES.length>1?'s':''})`;
  toast(`Page ${SCAN_PAGES.length} ajoutée ✓`,'ok');
}
function scanDeletePage(idx){
  SCAN_PAGES.splice(idx,1);
  const thumbs=document.getElementById('scan_thumbs');
  if(thumbs){thumbs.innerHTML='';SCAN_PAGES.forEach((url,i)=>{const t=document.createElement('div');t.style.cssText='position:relative;display:inline-flex;flex-direction:column;align-items:center;gap:3px';t.innerHTML=`<img src="${url}" style="height:72px;width:54px;object-fit:cover;border-radius:5px;border:1.5px solid var(--border-grey)"><span style="font-size:.62rem;color:var(--text-mut)">p.${i+1}</span><button onclick="scanDeletePage(${i})" style="position:absolute;top:-5px;right:-5px;background:#E63946;color:#fff;border:none;border-radius:50%;width:16px;height:16px;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>`;thumbs.appendChild(t);});}
  const btn=document.getElementById('scan_finalize_btn');if(btn)btn.textContent=`✅ Finaliser le PDF (${SCAN_PAGES.length} page${SCAN_PAGES.length>1?'s':''})`;
}
async function scanFinalize(recId){
  if(!SCAN_PAGES.length){toast('Ajoutez au moins une page avant de finaliser','err');return;}
  const loading=document.getElementById('scan_loading');if(loading)loading.style.display='flex';
  try{
    const r=recById(recId);if(!r)throw new Error('Dossier introuvable');
    const typeEl=document.getElementById('scan_type');const nameEl=document.getElementById('scan_name');
    const typeId=typeEl?typeEl.value:'';const dts=getDocTypes();const dt=dts.find(x=>x.id===typeId);
    const rawName=nameEl&&nameEl.value.trim()?nameEl.value.trim():(dt?dt.name:'scan');
    const filename=rawName.replace(/[^a-zA-Z0-9\-_. àâäéèêëîïôùûüç]/g,'_')+'.pdf';
    // Construire un PDF minimal en pur JS (sans librairie externe)
    const pdfBytes=await buildScanPdf(SCAN_PAGES);
    const blob=new Blob([pdfBytes],{type:'application/pdf'});
    const fid=uid();const path=`${recId}/${fid}-${filename}`;
    const{error}=await SUPA.storage.from(ATTACH_BUCKET).upload(path,blob,{contentType:'application/pdf'});
    if(error)throw error;
    const recs=getRecs();const rec=recs.find(x=>x.id===recId);if(!rec)throw new Error('Dossier introuvable');
    rec.docs=rec.docs||[];
    rec.docs.push({id:fid,typeId,typeName:dt?dt.name:'Document scanné',filename,path,mime:'application/pdf',size:blob.size,date:Date.now(),user:(ME.prenom+' '+ME.nom).trim()||ME.code});
    save(K.recs,recs);
    logActivity('action',`📷 Document scanné (${SCAN_PAGES.length} p.) : ${filename} sur ${rec.dossier||recId}`,recId);
    closeScanner();openDossier(recId);toast(`PDF créé (${SCAN_PAGES.length} page${SCAN_PAGES.length>1?'s':''}) et joint ✓`,'ok');
  }catch(e){console.error('[scanFinalize]',e);toast('Échec : '+(e.message||e),'err');if(loading)loading.style.display='none';}
}
async function buildScanPdf(dataUrls){
  const A4_W=595,A4_H=842;
  const enc=s=>new TextEncoder().encode(s);
  // Lire les données JPEG de chaque image
  const imgs=dataUrls.map(url=>{
    const base64=url.split(',')[1];
    const raw=atob(base64);
    const bytes=new Uint8Array(raw.length);
    for(let j=0;j<raw.length;j++)bytes[j]=raw.charCodeAt(j);
    let iw=A4_W,ih=A4_H;
    for(let p=0;p<bytes.length-8;p++){if(bytes[p]===0xFF&&bytes[p+1]>=0xC0&&bytes[p+1]<=0xC3){ih=bytes[p+5]*256+bytes[p+6];iw=bytes[p+7]*256+bytes[p+8];break;}}
    return{bytes,iw,ih};
  });
  const n=imgs.length;
  // Plan des objets : 1=catalog, 2=pages, puis par page : imgObj, contentObj, pageObj (3 objets par page)
  // obj 1: catalog, obj 2: pages, obj 3+3i: image XObject, obj 4+3i: content stream, obj 5+3i: page
  const catalogId=1,pagesId=2;
  const imgId=i=>3+3*i;
  const contentId=i=>4+3*i;
  const pageId=i=>5+3*i;
  const totalObjs=2+3*n;
  // Construire les objets dans l'ordre et tracer les offsets
  const offsets=new Array(totalObjs+1).fill(0);
  const chunks=[];let off=0;
  const push=s=>{const b=enc(s);chunks.push(b);off+=b.length;};
  const pushRaw=b=>{chunks.push(b);off+=b.length;};
  push('%PDF-1.4\n%\xFF\xFF\n');
  // Catalog
  offsets[catalogId]=off;
  push(`${catalogId} 0 obj\n<</Type/Catalog/Pages ${pagesId} 0 R>>\nendobj\n`);
  // Pages
  offsets[pagesId]=off;
  const kids=Array.from({length:n},(_,i)=>`${pageId(i)} 0 R`).join(' ');
  push(`${pagesId} 0 obj\n<</Type/Pages/Kids[${kids}]/Count ${n}>>\nendobj\n`);
  // Pour chaque image : image XObject, content stream, page
  for(let i=0;i<n;i++){
    const{bytes,iw,ih}=imgs[i];
    const scale=Math.min(A4_W/iw,A4_H/ih);
    const sw=Math.round(iw*scale),sh=Math.round(ih*scale);
    const dx=Math.round((A4_W-sw)/2),dy=Math.round((A4_H-sh)/2);
    const imgName=`Im${i}`;
    // Image XObject
    offsets[imgId(i)]=off;
    push(`${imgId(i)} 0 obj\n<</Type/XObject/Subtype/Image/Width ${iw}/Height ${ih}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${bytes.length}>>\nstream\n`);
    pushRaw(bytes);
    push('\nendstream\nendobj\n');
    // Content stream
    const cs=`q ${sw} 0 0 ${sh} ${dx} ${dy} cm /${imgName} Do Q`;
    const csBytes=enc(cs);
    offsets[contentId(i)]=off;
    push(`${contentId(i)} 0 obj\n<</Length ${csBytes.length}>>\nstream\n`);
    pushRaw(csBytes);
    push('\nendstream\nendobj\n');
    // Page
    offsets[pageId(i)]=off;
    push(`${pageId(i)} 0 obj\n<</Type/Page/Parent ${pagesId} 0 R/MediaBox[0 0 ${A4_W} ${A4_H}]/Resources<</XObject<</${imgName} ${imgId(i)} 0 R>>>>/Contents ${contentId(i)} 0 R>>\nendobj\n`);
  }
  // xref
  const xrefOff=off;
  push(`xref\n0 ${totalObjs+1}\n`);
  push('0000000000 65535 f \n');
  for(let i=1;i<=totalObjs;i++)push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  push(`trailer\n<</Size ${totalObjs+1}/Root ${catalogId} 0 R>>\nstartxref\n${xrefOff}\n%%EOF\n`);
  // Assembler
  const total=chunks.reduce((s,c)=>s+c.length,0);
  const out=new Uint8Array(total);let pos=0;
  for(const c of chunks){out.set(c,pos);pos+=c.length;}
  return out;
}
function closeScanner(){
  if(SCANNER_STREAM){SCANNER_STREAM.getTracks().forEach(t=>t.stop());SCANNER_STREAM=null;}
  SCAN_PAGES=[];closeModal();
}
async function attachDoc(id){
  const fileEl=document.getElementById('doc_file');const typeEl=document.getElementById('doc_type');
  const file=fileEl&&fileEl.files&&fileEl.files[0];
  if(!file){toast('Sélectionnez un fichier','err');return;}
  if(!getDocTypes().length){toast('Créez d\'abord des types dans Paramètres ▸ Types de docs','err');return;}
  if(file.size>15*1048576){toast('Fichier trop volumineux (max 15 Mo)','err');return;}
  const typeId=typeEl?typeEl.value:'';const typeName=(getDocTypes().find(t=>t.id===typeId)||{}).name||'Document';
  const fid=uid();
  const path=`${id}/${fid}-${file.name}`.replace(/[^a-zA-Z0-9/_.\-]/g,'_');
  try{
    const{error}=await SUPA.storage.from(ATTACH_BUCKET).upload(path,file,{contentType:file.type||undefined});
    if(error)throw error;
    const recs=getRecs();const r=recs.find(x=>x.id===id);if(!r)return;
    r.docs=r.docs||[];
    r.docs.push({id:fid,path,typeId,typeName,filename:file.name,size:file.size,mime:file.type,date:Date.now(),user:(ME.prenom+' '+ME.nom).trim()||ME.code});
    save(K.recs,recs);openDossier(id);toast('Pièce jointe ajoutée ✓ (partagée avec les accès autorisés)','ok');
  }catch(e){console.error('[attachDoc]',e);toast('Échec de l\'envoi du fichier : '+(e.message||e),'err');}
}
async function viewDoc(fid,recId){
  try{
    const r=recId?recById(recId):null;
    const doc=r?(r.docs||[]).find(d=>d.id===fid):null;
    if(doc&&doc.path){
      const url=await signedUrl(doc.path);
      if(!url){toast('Accès au document refusé','err');return;}
      window.open(url,'_blank');
      return;
    }
    // secours : ancien fichier stocké localement avant l'étape 4 -> on l'ouvre et on le migre vers Supabase au passage
    const blob=await idbGet(fid);
    if(!blob){toast('Fichier introuvable','err');return;}
    const url=URL.createObjectURL(blob);
    window.open(url,'_blank');
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    if(r&&doc){
      const path=`${r.id}/${fid}-${doc.filename||'fichier'}`.replace(/[^a-zA-Z0-9/_.\-]/g,'_');
      SUPA.storage.from(ATTACH_BUCKET).upload(path,blob,{contentType:doc.mime||undefined}).then(({error})=>{
        if(!error){doc.path=path;const recs=getRecs();const rr=recs.find(x=>x.id===r.id);if(rr){rr.docs=(rr.docs||[]).map(d=>d.id===fid?doc:d);save(K.recs,recs);}idbDel(fid);}
      });
    }
  }catch(e){console.error('[viewDoc]',e);toast('Lecture impossible : '+(e.message||e),'err');}
}
function delDoc(recId,fid){
  modalConfirm('Supprimer cette pièce jointe ?','',async()=>{
    const recs=getRecs();const r=recs.find(x=>x.id===recId);
    const doc=r?(r.docs||[]).find(d=>d.id===fid):null;
    try{if(doc&&doc.path)await SUPA.storage.from(ATTACH_BUCKET).remove([doc.path]);}catch(e){console.error('[delDoc]',e);}
    try{await idbDel(fid);}catch(e){}
    if(r){r.docs=(r.docs||[]).filter(d=>d.id!==fid);save(K.recs,recs);}
    closeModal();if(DOSSIER_OPEN===recId)openDossier(recId);toast('Pièce jointe supprimée','ok');
  });
}
/* ---- DEAL / délégataires ---- */
const getDelegataires=()=>load('egncrm_delegataires',[]);
/* Valeur d'un critere de calcul.
   __zone__ est un pseudo-champ : la zone climatique H1/H2/H3 deduite du code postal. */
function critereValue(r,fieldId){
  if(fieldId==='__zone__')return zoneClimatiqueOf(r)||'';
  return (r.opFields&&r.opFields[fieldId])||'';
}
function computeCumac(r){
  const op=getAllProducts().find(p=>p.id===r.productId);
  if(!op||!op.cumac)return null;
  if(op.cumac.mode==='coef'){
    const c=op.cumac;
    const fv=parseFloat((r.opFields&&r.opFields[c.field])||'')||0;
    if(!fv)return null;
    let coef=0;
    if(c.byField){const choice=critereValue(r,c.byField);coef=parseFloat((c.coefs&&c.coefs[choice])||0)||0;}
    else coef=parseFloat(c.coef||0)||0;
    if(!coef)return null;
    return Math.round(coef*fv);
  }
  if(op.cumac.mode==='multi'){
    const factors=op.cumac.factors||[];
    if(!factors.length)return null;
    let product=1;
    for(const f of factors){
      let v=0;
      if(f.type==='fixed')v=parseFloat(f.value)||0;
      else if(f.type==='field')v=parseFloat((r.opFields&&r.opFields[f.field])||'')||0;
      else if(f.type==='table1d'){const ch=critereValue(r,f.field);v=parseFloat((f.table&&f.table[ch])||0)||0;}
      else if(f.type==='table2d'){const c1=critereValue(r,f.field1);const c2=critereValue(r,f.field2);v=parseFloat((f.table&&f.table[c1+'|'+c2])||0)||0;}
      if(!v)return null;
      product*=v;
    }
    return Math.round(product);
  }
  return null;
}
