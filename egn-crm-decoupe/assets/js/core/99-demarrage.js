/* ============================================================
   EGN CRM — core/99-demarrage.js
   Démarrage de l application
   ============================================================ */
/* ====================================================================
   DÉMARRAGE
   ==================================================================== */
seed();
function injectLogos(){
  const f=`<img src="${LOGO_FULL}" alt="EGN Rénovation">`;
  const sb=document.getElementById('sbBrand');if(sb)sb.innerHTML=f;
  const ll=document.getElementById('loginLogo');if(ll)ll.innerHTML=f;
  const hb=document.getElementById('homeBtn');if(hb)hb.innerHTML=`<img src="${LOGO_EMBLEM}" alt="Accueil">`;
}
injectLogos();
(async function boot(){
  const{data:{session}}=await SUPA.auth.getSession();
  if(session){
    const{data:profile}=await SUPA.from('profiles').select('*').eq('id',session.user.id).single();
    if(profile&&profile.active){
      ME={id:profile.id,code:profile.code,prenom:profile.prenom,nom:profile.nom,email:profile.email,team:profile.team,role:profile.role,perms:normalizePerms(profile.perms,profile.role),active:profile.active,assignedUsers:profile.assigned_users||[],sourceId:profile.source_id||''};
      startApp();return;
    }
    await SUPA.auth.signOut();
  }
  const hint=document.getElementById('loginHint');
  hint.innerHTML="© 2026 EGN RÉNOVATION. Tous droits réservés.<br><span style='font-size:.66rem'>Ce logiciel est la propriété exclusive de EGN RÉNOVATION et est protégé par le droit d'auteur et les lois relatives à la propriété intellectuelle.</span>";
  setTimeout(()=>document.getElementById('loginCode').focus(),100);
})();
document.getElementById('loginCode').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('loginPwd').focus();});
document.getElementById('loginPwd').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(e=>console.error('[sw]',e));});}

