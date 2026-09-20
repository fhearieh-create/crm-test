/* ============================================================
   EGN CRM — core/04-chargeur.js
   Chargement des modules proteges

   Le code des fonctions reservees (comptabilite, deals, stock,
   administration...) n'est PAS publie avec le site. Il est range
   dans le stockage prive Supabase "modules".

   Apres la connexion :
   1. on demande a la base la liste des modules de CE compte.
      La base ne renvoie que ceux auxquels il a droit : un compte
      sans droit recoit une liste vide et ne connait aucun nom ;
   2. on telecharge chacun d'eux, dans l'ordre, avec le jeton de
      session. Le stockage refuse tout module non autorise, meme
      si l'on devine son chemin ;
   3. on l'execute en memoire. Rien n'est ecrit sur le poste :
      ni cache du navigateur, ni cache du service worker. La
      deconnexion recharge la page, ce qui efface ce code.
   ============================================================ */
let MODULES_CHARGES=new Set();
let MODULES_COMPTE=null;   // compte pour lequel les modules ont ete charges

async function chargerModules(){
  if(!ME)return;
  // Securite : un autre compte ne doit jamais heriter du code deja
  // charge. Le cas ne se produit pas en usage normal (la deconnexion
  // recharge la page), mais on ne suppose rien.
  if(MODULES_COMPTE&&MODULES_COMPTE!==ME.id){location.reload();return;}
  MODULES_COMPTE=ME.id;

  const{data:liste,error}=await SUPA.from('app_modules').select('nom,chemin').order('ordre');
  if(error){console.error('[modules] liste',error);return;}
  if(!liste||!liste.length)return;

  const{data:{session}}=await SUPA.auth.getSession();
  if(!session)return;

  let echecs=0;
  for(const m of liste){
    if(MODULES_CHARGES.has(m.nom))continue;
    try{
      const code=await telechargerModule(m.chemin,session.access_token);
      await executerModule(code,m.nom);
      MODULES_CHARGES.add(m.nom);
    }catch(e){
      echecs++;
      console.error('[modules] '+m.nom,e);
    }
  }
  if(echecs)toast(echecs===1?'Une partie du CRM n\'a pas pu être chargée — rechargez la page':echecs+' parties du CRM n\'ont pas pu être chargées — rechargez la page','err');
}

async function telechargerModule(chemin,jeton){
  const url=SUPA_URL+'/storage/v1/object/authenticated/modules/'
    +String(chemin).split('/').map(encodeURIComponent).join('/');
  const r=await fetch(url,{
    headers:{Authorization:'Bearer '+jeton,apikey:SUPA_ANON},
    cache:'no-store'           // jamais conserve dans le cache du navigateur
  });
  if(!r.ok)throw new Error('HTTP '+r.status);
  return await r.text();
}

function executerModule(code,nom){
  return new Promise((ok,ko)=>{
    const url=URL.createObjectURL(new Blob([code+'\n//# sourceURL=egn-'+nom+'.js'],{type:'text/javascript'}));
    const s=document.createElement('script');
    s.src=url;
    s.onload=()=>{URL.revokeObjectURL(url);ok();};
    s.onerror=()=>{URL.revokeObjectURL(url);ko(new Error('execution'));};
    document.head.appendChild(s);
  });
}
