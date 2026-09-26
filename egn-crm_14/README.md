# EGN CRM — version déployable

## Contenu

```
index.html                   Le CRM — squelette, le code est dans assets/
form.html                    Formulaire public pour les apporteurs d'affaires
manifest.webmanifest / sw.js / icônes
assets/css/crm.css
assets/js/core/              Socle : moteur, navigation, fichiers, démarrage
assets/js/modules/           Un fichier par écran
assets/js/admin/             Utilisateurs, documents, opérations
```

## Déploiement

Déposer le **contenu** de ce dossier dans le dépôt. Si les fichiers sont
dans un sous-dossier du dépôt, renseigner ce nom dans Vercel :
Settings → Build and Deployment → Root Directory.

Vercel redéploie seul à chaque commit. Aucun réglage de build.

Après mise en ligne : Ctrl+Shift+R. Si l'ancienne version persiste,
désinscrire le service worker (F12 → Application → Service Workers →
Unregister).

## Règle à respecter pour toute évolution

Les fichiers partagent la même portée globale, mais **un fichier ne voit
que ce que les précédents ont défini**. Le routeur référence donc ses
pages de façon tardive :

```js
dash:{t:'Tableau de bord', r:()=>renderDash()}   // correct
dash:{t:'Tableau de bord', r:renderDash}         // casse
```

## Sécurité

Le découpage n'apporte aucune sécurité : tout part dans le navigateur. La
protection des données repose sur les politiques RLS de Supabase et sur la
purge du stockage local au changement de compte.
