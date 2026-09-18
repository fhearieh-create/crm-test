# EGN CRM — version découpée

Même application que le fichier unique, organisée en fichiers séparés.
Le comportement est **strictement identique** : le code est découpé aux
frontières des sections, sans modification, et chargé dans le même ordre.

## Arborescence

```
crm/
├── index.html                  Squelette de la page (login, menu, barre du haut, modales)
├── manifest.webmanifest        Installation en application (PWA)
├── sw.js                       Service worker — réseau d'abord, cache de secours hors ligne
├── icon-192.png / icon-512.png / apple-touch-icon.png / favicon-32.png
├── README.md
└── assets/
    ├── css/
    │   └── crm.css             Toute la feuille de style
    └── js/
        ├── core/               Socle — chargé en premier, ne pas réordonner
        │   ├── 01-moteur.js        Clés de stockage, synchronisation Supabase, permissions,
        │   │                       segments BtoB/BtoC, TVA, session, comptabilité et deal isolés
        │   ├── 02-navigation.js    Menu, pages, routeur, recherche globale, notifications, journal
        │   ├── 03-fichiers.js      Pièces jointes signées, WhatsApp, mentions, commentaires
        │   └── 99-demarrage.js     Lancement de l'application — chargé en dernier
        ├── modules/            Fonctionnel — un fichier par écran
        │   ├── 10-dashboard.js     Tableau de bord, Dashboard Coco
        │   ├── 11-dossiers.js      Leads, clients, fiche dossier, comptabilité du dossier
        │   ├── 12-compta.js        Résumé global, détails CA / charges / marge, appels à facturation
        │   ├── 13-paiements.js     Suivi des paiements, suivi des encaissements
        │   ├── 14-tva.js           TVA mensualisée
        │   ├── 15-scanner.js       Scanner de documents (caméra)
        │   ├── 16-prime-deal.js    Calcul de la prime CEE, panneau Deal, formulaire de fiche
        │   ├── 17-planning.js      Modales, planning, carte, rendez-vous
        │   ├── 18-sav.js           SAV
        │   ├── 19-import.js        Import Excel / CSV
        │   ├── 21-stock.js         Stock : état, mouvements, catalogue, transferts
        │   └── 24-calculatrice.js  Calculatrice de prime flottante
        └── admin/              Administration
            ├── 20-utilisateurs.js  Utilisateurs et accès
            ├── 22-documents.js     Modèles e-mail, documents HTML et PDF, documents admin,
            │                       paramètres, diagnostic de synchronisation
            └── 23-operations.js    Opérations CEE et champs personnalisés
```

## Règle essentielle

Tous les fichiers partagent la même portée globale. Une fonction définie
dans `core/01-moteur.js` est utilisable partout ; une fonction d'un module
est utilisable par les modules chargés après lui.

**L'ordre des balises `<script>` dans `index.html` est donc contraignant.**
Pour ajouter un fichier, insérer sa balise au bon endroit : après ce dont
il dépend, avant ce qui dépend de lui.

## Déploiement

Sur Vercel, remplacer le contenu du dépôt par ce dossier. Aucun réglage
supplémentaire : `index.html` reste à la racine, les chemins sont relatifs.

Pour un serveur classique (Apache, Nginx, OVH mutualisé), déposer le dossier
tel quel. Servir en HTTPS, indispensable pour la PWA et le scanner.

## Ce que ce découpage apporte — et ce qu'il n'apporte pas

**Il apporte** une base de code lisible, où chaque écran est isolé dans son
fichier. Corriger la comptabilité ne demande plus de parcourir 9 000 lignes.
Les fichiers se mettent en cache séparément : une modification du stock ne
force pas le rechargement de tout le code.

**Il n'apporte aucune sécurité.** Tout le code part dans le navigateur, comme
avant. Un utilisateur peut lire `modules/12-compta.js` même sans droit
d'accès à la comptabilité — il y verra la logique, jamais les données.
La protection des données repose sur les politiques RLS de Supabase, mises
en place et vérifiées par les scripts `30` à `36c` du dossier `securisation`.

## Retour au fichier unique

Concaténer les fichiers JS dans l'ordre d'`index.html`, puis les replacer
dans une balise `<script>` unique avec le CSS dans une balise `<style>`.
