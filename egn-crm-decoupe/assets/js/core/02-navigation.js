/* ============================================================
   EGN CRM — core/02-navigation.js
   Toast, menu latéral, pages, routeur, recherche globale, notifications, journal d activité
   ============================================================ */
/* ---- toast ---- */
let toastT;
function toast(msg,type){const t=document.getElementById('toast');t.textContent=msg;t.className='toast on '+(type||'');clearTimeout(toastT);toastT=setTimeout(()=>t.className='toast '+(type||''),2600);}

/* ====================================================================
   NAVIGATION & ROUTEUR
   ==================================================================== */
const NAV=[
  {sec:'Principal'},
  {id:'dash',ic:'📊',label:'Tableau de bord',perm:'dashboard'},
  {id:'dashglobal',ic:'🌐',label:'Dashboard Coco',perm:'dash_global'},
  {id:'planning',ic:'📅',label:'Planning',perm:'planning_view'},
  {id:'rappels',ic:'⏰',label:'Rappels',perm:'rappels_view'},
  {id:'import',ic:'📥',label:'Import des leads',perm:'import_data'},
  {sec:'Leads & Clients'},
  {id:'leads',ic:'👥',label:'Leads',perm:'leads_view'},
  {id:'clients',ic:'🏠',label:'Clients',perm:'clients_view'},
  {id:'sav',ic:'🔧',label:'SAV',perm:'sav_view'},
  {sec:'Administration'},
  {id:'compta',ic:'💼',label:'Comptabilité',perm:'compta_global'},
  {id:'stock',ic:'📦',label:'Stock',perm:'stock_view'},
  {id:'docs',ic:'📄',label:'Documents',perm:'docs_manage'},
  {id:'docsadmin',ic:'🗂️',label:'Documents admin',perm:'docs_admin_view'},
  {id:'users',ic:'🔑',label:'Utilisateurs',perm:'users_manage'},
  {id:'settings',ic:'⚙️',label:'Paramètres',perm:'settings_access'}
];
const PAGES={
  dash:{t:'Tableau de bord',s:"Vue d'ensemble de l'activité",r:renderDash},
  planning:{t:'Planning',s:'Calendrier & carte des rendez-vous',r:renderPlanning},
  rappels:{t:'Rappels',s:'Tous vos rappels planifiés',r:renderRappels},
  import:{t:'Import des leads',s:'Importez votre base client Excel / CSV',r:renderImport},
  leads:{t:'Leads',s:'Tous vos prospects et dossiers',r:renderLeads},
  clients:{t:'Clients',s:'Dossiers transmis & installés',r:renderClients},
  docs:{t:'Documents',s:'Modèles de documents générables depuis les fiches client',r:renderDocsTab},
  rdvs:{t:'RDVs',s:'Liste des rendez-vous',r:renderRdvs},
  sav:{t:'SAV',s:'Service après-vente',r:renderSav},
  compta:{t:'Comptabilité',s:'Rentabilité globale & appels à facturation poseurs',r:renderComptaGlobal},
  dashglobal:{t:'Dashboard Coco',s:'Activité, comptabilité et stock en un coup d\'œil',r:renderDashGlobal},
  docsadmin:{t:'Documents admin',s:'Vos dossiers et fichiers administratifs',r:renderDocsAdmin},
  stock:{t:'Stock',s:'Gestion des matériels et mouvements de stock',r:renderStock},
  users:{t:'Utilisateurs',s:'Comptes, codes d\'accès & permissions',r:renderUsers},
  settings:{t:'Paramètres',s:'Statuts, produits, sources & société',r:renderSettings}
};
let CUR='dash';
function buildNav(){
  const recs=visibleRecs(),rdvs=getRdvs().filter(rdvVisible);
  const isClient=r=>{const s=statById(r.statusId);return !!(s&&s.phase==='client');};
  const counts={leads:recs.filter(r=>!isClient(r)).length,clients:recs.filter(isClient).length,
    rdvs:rdvs.length,users:getUsers().length,sav:load('egncrm_sav',[]).length};
  let h='';
  NAV.forEach(n=>{
    if(n.sec){h+=`<div class="sb-section">${n.sec}</div>`;return;}
    if(!can(n.perm))return;
    const bdg=counts[n.id]!=null&&counts[n.id]>0?`<span class="bdg">${counts[n.id]}</span>`:'';
    h+=`<div class="sb-link ${n.id===CUR?'act':''}" onclick="go('${n.id}')"><span class="ic">${n.ic}</span><span class="lbl">${n.label}</span>${bdg}</div>`;
  });
  document.getElementById('navMenu').innerHTML=h;
}
function go(id){
  if(!PAGES[id]||!can(NAV.find(n=>n.id===id).perm)){toast('Accès non autorisé','err');return;}
  DOSSIER_OPEN=null;CUR=id;
  document.getElementById('pageTitle').innerHTML=PAGES[id].t;
  document.getElementById('pageSub').textContent=PAGES[id].s;
  document.getElementById('pageActions').innerHTML='';
  buildNav();
  renderSegSwitch();
  PAGES[id].r();
  document.getElementById('app').classList.remove('sb-open');
}
async function startApp(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').classList.add('on');
  document.getElementById('calcFab').style.display='flex';
  try{if(localStorage.getItem('egncrm_sbcollapsed')==='1')document.getElementById('app').classList.add('collapsed');}catch(e){}
  document.getElementById('meAv').textContent=(ME.prenom[0]||'')+(ME.nom[0]||'');
  document.getElementById('meName').textContent=ME.prenom+' '+ME.nom;
  document.getElementById('meRole').textContent=ROLES[ME.role]||ME.role;
  document.getElementById('content').innerHTML='<div class="empty"><div class="big">⏳</div>Synchronisation des données…</div>';
  await syncPullAll();
  await logLoginEvent();
  await loadNotifications();
  startNotifPolling();
  if(ME.role==='superadmin'||ME.role==='admin')loadAllDeal();
  checkUpcomingRdvReminders();
  scheduleMidnightRefresh();
  // 1ère page autorisée
  let first=NAV.find(n=>n.id&&can(n.perm));
  go(first?first.id:'dash');
}
function scheduleMidnightRefresh(){
  // Calcule le nombre de ms jusqu'à minuit et relance renderDash automatiquement
  const now=new Date();
  const midnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,5);
  const msUntilMidnight=midnight-now;
  setTimeout(()=>{
    if(CUR==='dash')renderDash();
    scheduleMidnightRefresh(); // relance pour la nuit suivante
  },msUntilMidnight);
}
async function logLoginEvent(){
  if(!ME)return;
  try{const{error}=await SUPA.from('login_events').insert({user_id:ME.id,code:ME.code,user_agent:navigator.userAgent});if(error)throw error;}
  catch(e){console.error('[login_events]',e);}
}
function toggleSidebar(){
  const app=document.getElementById('app');
  if(window.matchMedia('(max-width: 860px)').matches){
    app.classList.toggle('sb-open');
    return;
  }
  app.classList.toggle('collapsed');try{localStorage.setItem('egncrm_sbcollapsed',app.classList.contains('collapsed')?'1':'0');}catch(e){}if(CUR==='planning')setTimeout(()=>{if(MAP)MAP.invalidateSize();},260);
}
/* ---- recherche globale ---- */
let GSEARCH_T=null;
function globalSearch(q){
  clearTimeout(GSEARCH_T);
  const box=document.getElementById('gsearchResults');
  if(!q||q.trim().length<2){box.style.display='none';return;}
  GSEARCH_T=setTimeout(()=>{
    const qq=q.trim().toLowerCase();
    const recs=allVisibleRecs().filter(r=>{
      const fields=[recName(r),r.tel||'',r.telFixe||'',r.ville||'',r.dossier||'',r.email||'',r.siret||'',r.crmDevis||'',
        (r.opFields&&r.opFields.nom_site)||r.nomSite||''];
      return fields.join(' ').toLowerCase().includes(qq);
    }).slice(0,12);
    if(!recs.length){box.innerHTML='<div class="notif-empty">Aucun résultat</div>';box.style.display='block';return;}
    box.innerHTML=recs.map(r=>{const op=getAllProducts().find(o=>o.id===r.productId);return `<div class="gsearch-item" onclick="closeGsearch();openDossier('${r.id}')">
      <span class="gs-name">${esc(recName(r))}</span>
      <span class="gs-meta">${SEGMENTS[segOf(r)].ic} ${SEGMENTS[segOf(r)].short} · ${esc(r.dossier||'')} ${op?'· '+esc(op.name):''} ${r.ville?'· '+esc(r.ville):''} ${r.tel?'· '+esc(r.tel):''}</span>
    </div>`;}).join('');
    box.style.display='block';
  },200);
}
function closeGsearch(){const box=document.getElementById('gsearchResults');if(box)box.style.display='none';const i=document.getElementById('gsearchInput');if(i)i.value='';}
document.addEventListener('click',e=>{
  const wrap=document.getElementById('gsearchInput');
  if(wrap&&!e.target.closest('.gsearch-wrap'))document.getElementById('gsearchResults').style.display='none';
  const notif=document.getElementById('notifPanel');
  if(notif&&!e.target.closest('.notif-wrap'))notif.style.display='none';
});
/* ---- notifications internes ---- */
let NOTIF_CACHE=[];
/* ---- journal d'activité (ce que chaque utilisateur fait pendant sa connexion) ---- */
async function logActivity(type,message,recordId){
  if(!ME)return;
  try{const{error}=await SUPA.from('activity_log').insert({user_id:ME.id,type,message,record_id:recordId||null});if(error)throw error;}
  catch(e){console.error('[activity_log]',e);}
}
async function createNotification(userId,type,message,recordId){
  if(!userId||!ME)return;
  try{await SUPA.from('notifications').insert({user_id:userId,type,message,record_id:recordId||null});}
  catch(e){console.error('[notif] création échouée',e);}
}
let NOTIF_TIMER=null;
function startNotifPolling(){
  if(NOTIF_TIMER)clearInterval(NOTIF_TIMER);
  NOTIF_TIMER=setInterval(async()=>{
    if(!ME||document.hidden)return;
    const avant=NOTIF_CACHE.filter(n=>!n.read).length;
    await loadNotifications();
    const apres=NOTIF_CACHE.filter(n=>!n.read).length;
    if(apres>avant){
      const nouvelles=apres-avant;
      toast(`🔔 ${nouvelles} nouvelle${nouvelles>1?'s':''} notification${nouvelles>1?'s':''}`,'ok');
      const panel=document.getElementById('notifPanel');
      if(panel&&panel.style.display==='block')renderNotifPanel();
    }
  },45000);
}
async function loadNotifications(){
  if(!ME)return;
  try{
    const{data,error}=await SUPA.from('notifications').select('*').eq('user_id',ME.id).order('created_at',{ascending:false}).limit(30);
    if(error)throw error;
    NOTIF_CACHE=data||[];
  }catch(e){console.error('[notif] chargement échoué',e);NOTIF_CACHE=[];}
  updateNotifDot();
}
function updateNotifDot(){
  const dot=document.getElementById('notifDot');if(!dot)return;
  const nb=NOTIF_CACHE.filter(n=>!n.read).length;
  dot.style.display=nb?'block':'none';
}
function toggleNotifPanel(){
  const panel=document.getElementById('notifPanel');if(!panel)return;
  const show=panel.style.display==='none'||!panel.style.display;
  if(show){renderNotifPanel();panel.style.display='block';}else panel.style.display='none';
}
function renderNotifPanel(){
  const panel=document.getElementById('notifPanel');if(!panel)return;
  let h=`<div class="notif-panel-h"><span>Notifications</span>${NOTIF_CACHE.some(n=>!n.read)?`<span style="cursor:pointer;color:var(--green-deep);text-transform:none;font-weight:600" onclick="markAllNotifRead()">Tout marquer comme lu</span>`:''}</div>`;
  if(!NOTIF_CACHE.length)h+=`<div class="notif-empty">Aucune notification</div>`;
  else h+=NOTIF_CACHE.map(n=>`<div class="notif-item ${n.read?'':'unread'}" onclick="clickNotif('${n.id}','${n.record_id||''}')"><div class="ni-msg">${esc(n.message)}</div><div class="ni-date">${new Date(n.created_at).toLocaleString('fr-FR')}</div></div>`).join('');
  panel.innerHTML=h;
}
async function clickNotif(id,recordId){
  const n=NOTIF_CACHE.find(x=>x.id===id);
  if(n&&!n.read){n.read=true;updateNotifDot();try{await SUPA.from('notifications').update({read:true}).eq('id',id);}catch(e){}}
  document.getElementById('notifPanel').style.display='none';
  if(recordId&&recById(recordId))openDossier(recordId);
}
async function markAllNotifRead(){
  const ids=NOTIF_CACHE.filter(n=>!n.read).map(n=>n.id);
  NOTIF_CACHE.forEach(n=>n.read=true);updateNotifDot();renderNotifPanel();
  if(ids.length){try{await SUPA.from('notifications').update({read:true}).in('id',ids);}catch(e){}}
}
/* ---- rappel RDV du jour (vérifié une fois par jour et par appareil) ---- */
async function checkUpcomingRdvReminders(){
  if(!ME)return;
  const todayStr=new Date().toISOString().slice(0,10);
  const flagKey='egncrm_rdvchecked_'+ME.id+'_'+todayStr;
  if(localStorage.getItem(flagKey))return;
  localStorage.setItem(flagKey,'1');
  const myRdvs=getRdvs().filter(r=>r.date===todayStr&&r.userId===ME.id);
  for(const rd of myRdvs){
    const rec=rd.recordId?recById(rd.recordId):null;
    const label=rec?recName(rec):(rd.client||'RDV');
    await createNotification(ME.id,'rdv_upcoming',`📅 RDV aujourd'hui avec ${label}${rd.heure?' à '+rd.heure:''}`,rd.recordId);
  }
  const myRappels=visibleRecs().filter(r=>r.rappelDate===todayStr&&r.userId===ME.id);
  for(const rec of myRappels){
    await createNotification(ME.id,'rappel',`⏰ Rappel aujourd'hui — ${recName(rec)}${rec.rappelHeure?' à '+rec.rappelHeure:''}${rec.rappelNote?' : '+rec.rappelNote:''}`,rec.id);
  }
  if(myRdvs.length||myRappels.length)await loadNotifications();
}
function saveRappel(id){
  const recs=getRecs();const r=recs.find(x=>x.id===id);if(!r)return;
  const d=val('rp_date');
  if(!d){toast('Date requise','err');return;}
  r.rappelDate=d;r.rappelHeure=val('rp_heure')||'';r.rappelNote=val('rp_note')||'';
  r.history=r.history||[];r.history.unshift({date:Date.now(),user:(ME.prenom+' '+ME.nom).trim()||ME.code,text:`Rappel fixé le ${fmtDateLong(d)}${r.rappelHeure?' à '+r.rappelHeure:''}`});
  save(K.recs,recs);
  logActivity('action',`⏰ Rappel fixé sur ${r.dossier||id} — ${fmtDateLong(d)}${r.rappelHeure?' à '+r.rappelHeure:''}`,id);
  openDossier(id);toast('Rappel fixé ✓','ok');
}
function delRappel(id){
  const recs=getRecs();const r=recs.find(x=>x.id===id);if(!r)return;
  r.rappelDate='';r.rappelHeure='';r.rappelNote='';
  save(K.recs,recs);openDossier(id);toast('Rappel annulé','ok');
}

/* ---- helpers UI ---- */
function badge(statusId){const s=statById(statusId);if(!s)return `<span class="badge" style="background:#eef0f2;color:#6b7785"><span class="bd" style="background:#9aa5b1"></span>—</span>`;
  return `<span class="badge" style="background:${s.color}22;color:${s.color}"><span class="bd" style="background:${s.color}"></span>${esc(s.name)}</span>`;}
function statusOptions(sel){return getStatuses().map(s=>`<option value="${s.id}" ${s.id===sel?'selected':''}>${esc(s.name)}</option>`).join('');}
function fullName(r){return ((r.prenom||'')+' '+(r.nom||'')).trim()||'(sans nom)';}
function actionBtn(html,fn,cls){return `<button class="btn ${cls||'btn-pri'} btn-sm" onclick="${fn}">${html}</button>`;}

