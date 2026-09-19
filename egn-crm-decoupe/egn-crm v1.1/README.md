# EGN CRM — version déployable

Application découpée en fichiers. Comportement strictement identique
au fichier unique : le code est réparti aux frontières de ses sections,
sans réécriture, et chargé dans le même ordre.

## Arborescence

```
index.html                   Squelette : login, menu, barre du haut, modales
manifest.webmanifest         Installation en application (PWA)
sw.js                        Service worker — réseau d'abord
icon-*.png / favicon-32.png / apple-touch-icon.png
assets/
├── css/crm.css              Feuille de style
└── js/
    ├── core/                Socle — chargé en premier
    │   ├── 01-moteur.js         Stockage, synchronisation Supabase, permissions,
    │   │                        purge des postes partagés, segments BtoB/BtoC,
    │   │                        TVA, session, comptabilité isolée, étude technique
    │   ├── 02-navigation.js     Menu, pages, routeur, recherche, notifications
    │   ├── 03-fichiers.js       Pièces jointes signées, WhatsApp, commentaires
    │   └── 99-demarrage.js      Lancement — chargé en dernier
    ├── modules/
    │   ├── 10-dashboard.js      Tableau de bord, Dashboard Coco, documents admin
    │   ├── 11-dossiers.js       Leads, clients, fiche dossier, compta du dossier
    │   ├── 13-paiements.js      Suivi des paiements et des encaissements
    │   ├── 14-tva.js            TVA mensualisée
    │   ├── 15-scanner.js        Scanner par la caméra
    │   ├── 16-prime-deal.js     Prime CEE, panneau Deal, fiche lead
    │   ├── 17-planning.js       Modales, planning, carte, RDV, SAV, import
    │   ├── 21-stock.js          Paramètres et module stock
    │   └── 24-calculatrice.js   Calculatrice de prime
    └── admin/
        ├── 20-utilisateurs.js   Utilisateurs et accès
        ├── 22-documents.js      Modèles e-mail, documents HTML et PDF, diagnostic
        └── 23-operations.js     Opérations CEE et champs personnalisés
```

## Déploiement

Déposer le **contenu** de ce dossier à la racine du dépôt — `index.html`
ne doit pas être dans un sous-dossier. Vercel redéploie automatiquement
à chaque commit. Aucun réglage de build : c'est un site statique.

Après mise en ligne, recharger avec Ctrl+Shift+R. Si l'ancienne version
persiste, désinscrire le service worker : F12 → Application →
Service Workers → Unregister.

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

**Il apporte** un code lisible : chaque écran dans son fichier, une
correction de TVA ne demande plus de parcourir 9 000 lignes. Les fichiers
se mettent en cache séparément.

**Il n'apporte aucune sécurité.** Tout part dans le navigateur, comme
avant. Un utilisateur peut lire le code de la comptabilité sans y avoir
droit — il y verra la logique, jamais les données. La protection repose
sur les politiques RLS de Supabase (scripts 30 à 36c) et sur la purge
du stockage local au changement de compte.
