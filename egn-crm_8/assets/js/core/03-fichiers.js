/* ============================================================
   EGN CRM — core/03-fichiers.js
   Pieces jointes signees, WhatsApp, mentions, commentaires
   ============================================================ */
/* ============================================================
   PIECES JOINTES — bucket prive, URLs signees a la demande
   Une URL signee expire : on la genere au moment du clic plutot
   que de la stocker, ce qui evite tout lien permanent en clair.
   ============================================================ */
async function signedUrl(path,secondes){
  if(!path)return '';
  try{
    const{data,error}=await SUPA.storage.from(ATTACH_BUCKET).createSignedUrl(path,secondes||3600);
    if(error)throw error;
    return data.signedUrl;
  }catch(e){console.error('[signedUrl]',path,e);return '';}
}
/* Ouvre une piece jointe dans un nouvel onglet */
async function openAttachment(path,fallbackUrl){
  if(!path&&fallbackUrl){window.open(fallbackUrl,'_blank');return;}
  const w=window.open('','_blank'); // ouvert immediatement, sinon le navigateur bloque
  if(w)w.document.write('<p style="font-family:sans-serif;padding:2rem">Ouverture du document…</p>');
  const url=await signedUrl(path);
  if(!url){
    if(w)w.close();
    toast('Document introuvable ou acces refuse','err');
    return;
  }
  if(w)w.location.href=url;else window.open(url,'_blank');
}
/* Lien cliquable vers une piece jointe */
function attachLink(path,libelle,url){
  const txt=esc(libelle||'Voir');
  if(!path&&!url)return '<span class="muted" style="font-size:.72rem">—</span>';
  return `<a href="javascript:void(0)" onclick="openAttachment('${esc(path||'')}','${esc(url||'')}')" style="font-size:.72rem;color:var(--blue);font-weight:600;text-decoration:none">📎 ${txt}</a>`;
}

/* ============================================================
   NOTIFICATIONS WHATSAPP
   Le jeton d'API reste côté Supabase : le CRM appelle une Edge
   Function, jamais l'API Meta directement.
   ============================================================ */
/* Met un numéro au format international sans espaces ni séparateurs */
function normWaNumber(v){
  let s=String(v||'').replace(/[^\d+]/g,'');
  if(!s)return '';
  if(s.startsWith('00'))s='+'+s.slice(2);
  if(!s.startsWith('+')){
    // 06… / 07… français -> +336… / +337…
    if(s.startsWith('0')&&s.length===10)s='+33'+s.slice(1);
    else s='+'+s;
  }
  return s;
}
function waEnabled(){const s=getSettings();return !!(s.waEnabled);}
/* Envoi unitaire — n'interrompt jamais le flux du CRM en cas d'échec */
async function sendWhatsApp(numero,texte,contexte){
  const to=normWaNumber(numero);
  if(!waEnabled()||!to)return{ok:false,skip:true};
  try{
    const{data,error}=await SUPA.functions.invoke('send-whatsapp',{body:{to,message:texte,contexte:contexte||''}});
    if(error)throw error;
    if(data&&data.error)throw new Error(data.error);
    return{ok:true};
  }catch(e){
    console.error('[whatsapp]',e);
    return{ok:false,error:e.message||String(e)};
  }
}
/* Envoi à un utilisateur du CRM */
async function sendWhatsAppToUser(userId,texte,contexte){
  const u=getUsers().find(x=>x.id===userId);
  if(!u||!u.whatsapp)return{ok:false,skip:true};
  return sendWhatsApp(u.whatsapp,texte,contexte);
}
/* Lien direct vers la fiche, utilisable dans les messages */
function lienDossier(r){
  try{return location.origin+location.pathname+'#dossier='+r.id;}catch(e){return '';}
}

/* ---- mentions @utilisateur dans les commentaires ---- */
let MENTION_TA=null,MENTION_IDX=0,MENTION_LIST=[];
const nrm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const rxEsc=s=>(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function mentionCandidates(){return getUsers().filter(u=>u.active!==false);}
/* Détecte les utilisateurs cités dans un texte, à la saisie ou collés à la main */
function extractMentions(txt){
  const t=nrm(txt);const out=[];
  mentionCandidates().forEach(u=>{
    const full=nrm((u.prenom||'')+' '+(u.nom||'')).trim();
    const first=nrm(u.prenom||'');
    if(full&&t.includes('@'+full))out.push(u.id);
    else if(first&&new RegExp('@'+rxEsc(first)+'(?![a-z0-9])').test(t))out.push(u.id);
  });
  return [...new Set(out)];
}
function mentionToken(ta){
  const pos=ta.selectionStart||0;
  const before=ta.value.slice(0,pos);
  const m=before.match(/@([\p{L}\-]*(?: [\p{L}\-]*)?)$/u);
  return m?{q:m[1],start:pos-m[0].length,end:pos}:null;
}
function mentionInput(ta){
  MENTION_TA=ta;
  const box=document.getElementById('mentionBox');if(!box)return;
  const tok=mentionToken(ta);
  if(!tok){box.style.display='none';return;}
  const q=nrm(tok.q);
  MENTION_LIST=mentionCandidates().filter(u=>nrm((u.prenom||'')+' '+(u.nom||'')).includes(q)).slice(0,6);
  if(!MENTION_LIST.length){box.style.display='none';return;}
  MENTION_IDX=0;
  const r=ta.getBoundingClientRect();
  box.style.left=r.left+'px';
  box.style.width=Math.min(Math.max(r.width,220),320)+'px';
  const below=window.innerHeight-r.bottom;
  if(below<200&&r.top>200){box.style.top='';box.style.bottom=(window.innerHeight-r.top+4)+'px';}
  else{box.style.bottom='';box.style.top=(r.bottom+4)+'px';}
  renderMentionBox();
  box.style.display='block';
}
function renderMentionBox(){
  const box=document.getElementById('mentionBox');if(!box)return;
  box.innerHTML=MENTION_LIST.map((u,i)=>`<div class="mention-item ${i===MENTION_IDX?'act':''}" onmousedown="event.preventDefault();pickMention('${u.id}')">
    <span class="mi-av">${esc(((u.prenom||'')[0]||'')+((u.nom||'')[0]||''))}</span>
    <span><b>${esc((u.prenom||'')+' '+(u.nom||''))}</b><span class="muted" style="font-size:.66rem;display:block">${esc(ROLES[u.role]||u.role||'')}</span></span>
  </div>`).join('');
}
function mentionKeydown(ta,e){
  const box=document.getElementById('mentionBox');
  if(!box||box.style.display==='none'||!MENTION_LIST.length)return;
  if(e.key==='ArrowDown'){e.preventDefault();MENTION_IDX=(MENTION_IDX+1)%MENTION_LIST.length;renderMentionBox();}
  else if(e.key==='ArrowUp'){e.preventDefault();MENTION_IDX=(MENTION_IDX-1+MENTION_LIST.length)%MENTION_LIST.length;renderMentionBox();}
  else if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();pickMention(MENTION_LIST[MENTION_IDX].id);}
  else if(e.key==='Escape'){box.style.display='none';}
}
function pickMention(uid){
  const u=getUsers().find(x=>x.id===uid);const ta=MENTION_TA;
  const box=document.getElementById('mentionBox');
  if(!u||!ta){if(box)box.style.display='none';return;}
  const tok=mentionToken(ta);if(!tok){box.style.display='none';return;}
  const ins='@'+(u.prenom||'')+' '+(u.nom||'')+' ';
  ta.value=ta.value.slice(0,tok.start)+ins+ta.value.slice(tok.end);
  const np=tok.start+ins.length;
  ta.focus();ta.setSelectionRange(np,np);
  box.style.display='none';
}
function hideMentionBox(){setTimeout(()=>{const b=document.getElementById('mentionBox');if(b)b.style.display='none';},120);}
/* Rend le texte d'un commentaire avec les mentions surlignées */
function renderCommentText(txt,mentions){
  const users=getUsers();const toks=[];
  (mentions||[]).forEach(uid=>{
    const u=users.find(x=>x.id===uid);if(!u)return;
    toks.push('@'+(u.prenom||'')+' '+(u.nom||''));
    if(u.prenom)toks.push('@'+u.prenom);
  });
  toks.sort((a,b)=>b.length-a.length);
  let s=txt||'';const map={};let i=0;
  toks.forEach(t=>{
    if(!t||!s.includes(t))return;
    const ph='\u0001M'+(i++)+'\u0001';map[ph]=t;s=s.split(t).join(ph);
  });
  let h=esc(s).replace(/\n/g,'<br>');
  Object.keys(map).forEach(ph=>{h=h.split(ph).join(`<span class="mention-tag">${esc(map[ph])}</span>`);});
  return h;
}
/* Envoie une notification à chaque personne citée */
async function notifyMentions(mentions,r,txt){
  const who=((ME.prenom||'')+' '+(ME.nom||'')).trim()||ME.code;
  const label=r.dossier||recName(r);
  const extrait=txt.length>70?txt.slice(0,70)+'…':txt;
  const client=clientNameOf(r);
  let envoyes=0;
  for(const uid of (mentions||[])){
    if(uid===ME.id)continue;
    await createNotification(uid,'mention',`💬 ${who} vous a mentionné sur ${label} : « ${extrait} »`,r.id);
    // Notification WhatsApp — le texte complet, pas l'extrait
    const msg=`💬 *${who}* vous a mentionné\n\n`
      +`📁 Dossier ${label}\n`
      +`👤 ${client}\n\n`
      +`"${txt}"\n\n`
      +`${lienDossier(r)}`;
    const res=await sendWhatsAppToUser(uid,msg,'mention');
    if(res.ok)envoyes++;
  }
  if(envoyes)toast(`📱 ${envoyes} notification${envoyes>1?'s':''} WhatsApp envoyée${envoyes>1?'s':''}`,'ok');
}

/* ---- commentaires ---- */
function delHistoryEntry(recId,idx){
  if(!ME||ME.role!=='superadmin'){toast('Seul le Super Admin peut supprimer une entrée de l\'historique','err');return;}
  const recs=getRecs();const r=recs.find(x=>x.id===recId);if(!r||!r.history)return;
  r.history.splice(idx,1);
  save(K.recs,recs);
  if(DOSSIER_OPEN===recId)openDossier(recId);
  toast('Entrée supprimée','ok');
}
async function addComment(id){
  const el=document.getElementById('cmt_input');const txt=el?el.value.trim():'';
  if(!txt){toast('Commentaire vide','err');return;}
  const recs=getRecs();const r=recs.find(x=>x.id===id);if(!r)return;
  const mentions=extractMentions(txt);
  r.comments=r.comments||[];
  r.comments.push({id:uid(),text:txt,user:(ME.prenom+' '+ME.nom).trim()||ME.code,date:Date.now(),mentions});
  save(K.recs,recs);openDossier(id);
  const nb=mentions.filter(u=>u!==ME.id).length;
  toast(nb?`Commentaire ajouté ✓ · ${nb} personne${nb>1?'s':''} notifiée${nb>1?'s':''}`:'Commentaire ajouté ✓','ok');
  logActivity('action',`💬 Commentaire ajouté sur ${r.dossier||id} : « ${txt.slice(0,80)}${txt.length>80?'…':''} »`,id);
  notifyMentions(mentions,r,txt);
}
function delComment(recId,cid){
  if(!ME||ME.role!=='superadmin'){toast('Seul le Super Admin peut supprimer un commentaire','err');return;}
  const recs=getRecs();const r=recs.find(x=>x.id===recId);if(!r)return;
  r.comments=(r.comments||[]).filter(c=>c.id!==cid);save(K.recs,recs);
  if(DOSSIER_OPEN===recId)openDossier(recId);else refreshCommentsModal(recId);
  toast('Commentaire supprimé','ok');
}
function openCommentsPreview(recId){
  const r=recById(recId);if(!r)return;
  refreshCommentsModalContent(r);
}
function refreshCommentsModal(recId){const r=recById(recId);if(r&&document.getElementById('cmtModalBody'))refreshCommentsModalContent(r);}
function refreshCommentsModalContent(r){
  const cmts=(r.comments||[]).slice().sort((a,b)=>(b.date||0)-(a.date||0));
  let b=`<div id="cmtModalBody"><textarea id="cmt_input2" placeholder="Ajouter un commentaire…  Tapez @ pour mentionner un collègue" oninput="mentionInput(this)" onkeydown="mentionKeydown(this,event)" onblur="hideMentionBox()" style="width:100%;border:1.5px solid var(--border-grey);border-radius:9px;padding:.55rem .7rem;font-size:.86rem;min-height:60px;font-family:'Saira',sans-serif"></textarea>
    <button class="btn btn-pri btn-sm" style="margin-top:.45rem" onclick="addCommentFromModal('${r.id}')">+ Ajouter</button>
    <div style="margin-top:.9rem;display:flex;flex-direction:column;gap:.5rem;max-height:340px;overflow:auto">`;
  if(!cmts.length)b+=`<div class="muted">Aucun commentaire.</div>`;
  else cmts.forEach(c=>{b+=`<div class="cmt"><div class="cmt-txt">${renderCommentText(c.text,c.mentions)}</div><div class="cmt-meta"><span>${esc(c.user||'')} · ${new Date(c.date).toLocaleString('fr-FR')}</span>${ME&&ME.role==='superadmin'?`<button class="iconbtn del" style="width:24px;height:24px;font-size:.7rem" onclick="delComment('${r.id}','${c.id}')">🗑️</button>`:''}</div></div>`;});
  b+=`</div></div>`;
  openModal(`Commentaires — ${esc(recName(r))}`,b,`<button class="btn btn-ghost" onclick="closeModal()">Fermer</button>${can('leads_view')?`<button class="btn btn-pri" onclick="openDossier('${r.id}');closeModal()">Ouvrir le dossier</button>`:''}`);
}
async function addCommentFromModal(id){
  const el=document.getElementById('cmt_input2');const txt=el?el.value.trim():'';
  if(!txt){toast('Commentaire vide','err');return;}
  const recs=getRecs();const r=recs.find(x=>x.id===id);if(!r)return;
  const mentions=extractMentions(txt);
  r.comments=r.comments||[];
  r.comments.push({id:uid(),text:txt,user:(ME.prenom+' '+ME.nom).trim()||ME.code,date:Date.now(),mentions});
  save(K.recs,recs);refreshCommentsModalContent(r);
  const nb=mentions.filter(u=>u!==ME.id).length;
  toast(nb?`Commentaire ajouté ✓ · ${nb} personne${nb>1?'s':''} notifiée${nb>1?'s':''}`:'Commentaire ajouté ✓','ok');
  notifyMentions(mentions,r,txt);
}

/* ---- pièces jointes (Supabase Storage — partagées entre tous les accès autorisés) ---- */
const getDocTypes=()=>load('egncrm_doctypes',[]);
function fmtSize(b){if(!b)return '';if(b<1024)return b+' o';if(b<1048576)return (b/1024).toFixed(0)+' Ko';return (b/1048576).toFixed(1)+' Mo';}
const ATTACH_BUCKET='attachments';
// ---- ancien stockage local (IndexedDB), conservé en secours pour migrer les fichiers déjà uploadés avant l'étape 4 ----
function idbOpen(){return new Promise((res,rej)=>{const rq=indexedDB.open('egncrm_files',1);rq.onupgradeneeded=()=>{rq.result.createObjectStore('files');};rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error);});}
async function idbGet(key){try{const db=await idbOpen();return new Promise((res,rej)=>{const tx=db.transaction('files','readonly');const rq=tx.objectStore('files').get(key);rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error);});}catch(e){return null;}}
async function idbDel(key){try{const db=await idbOpen();return new Promise((res,rej)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').delete(key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}catch(e){}}
