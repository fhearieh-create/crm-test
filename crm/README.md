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

Déposer le **contenu** de ce dossier à la racine du dépôt — `index.html`
ne doit pas se retrouver dans un sous-dossier. Vercel redéploie seul à
chaque commit. Aucun réglage de build : site statique.

Après mise en ligne : Ctrl+Shift+R. Si l'ancienne version persiste,
désinscrire le service worker (F12 → Application → Service Workers →
Unregister).

## Formulaire apporteurs

`form.html` est autonome et ne contient **aucune clé d'API**. Il appelle
la fonction Supabase `submit-lead`, qui vérifie le jeton avant d'écrire.

Les liens se créent dans **Paramètres ▸ Liens apporteurs**. Chaque lien
porte un jeton unique, se copie d'un clic, se désactive à tout moment,
et compte les dossiers reçus.

## Règle à respecter pour toute évolution

Les fichiers partagent la même portée globale, mais **un fichier ne voit
que ce que les précédents ont défini**. Contrairement au fichier unique,
les fonctions ne sont pas utilisables avant leur chargement.

Le routeur référence donc ses pages de façon tardive :

```js
dash:{t:'Tableau de bord', r:()=>renderDash()}   // correct
dash:{t:'Tableau de bord', r:renderDash}         // casse
```

## Ce que le découpage apporte — et ce qu'il n'apporte pas

**Il apporte** un code lisible : chaque écran dans son fichier.

**Il n'apporte aucune sécurité.** Tout part dans le navigateur. La
protection des données repose sur les politiques RLS de Supabase
(scripts 30 à 36c) et sur la purge du stockage local au changement
de compte.
