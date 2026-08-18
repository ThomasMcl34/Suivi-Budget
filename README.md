# Suivi Budget — déploiement

Appli React (Vite) + Supabase + Vercel, sans authentification (URL à garder secrète).

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com) → **New project**.
2. Choisis un nom (ex. `suivi-budget`), un mot de passe de base de données, une région proche de toi.
3. Une fois le projet créé, va dans **SQL Editor** → **New query**.
4. Colle le contenu du fichier `supabase/schema.sql` de ce projet, puis **Run**. Ça crée toutes les tables.
5. Va dans **Project Settings → API**. Note deux valeurs :
   - **Project URL** (ex. `https://abcxyz.supabase.co`)
   - **anon public key** (une longue chaîne commençant par `eyJ...`)

## 2. Tester en local (optionnel mais conseillé)

```bash
npm install
cp .env.example .env
# édite .env avec ton URL et ta clé Supabase
npm run dev
```

Ouvre `http://localhost:5173` — vérifie que tu peux ajouter une dépense et qu'elle apparaît bien dans Supabase (**Table Editor → expenses**).

## 3. Créer le repo GitHub

```bash
git init
git add .
git commit -m "Initial commit — suivi budget"
git branch -M main
git remote add origin https://github.com/TON-PSEUDO/suivi-budget.git
git push -u origin main
```

(Crée d'abord le repo vide sur GitHub si ce n'est pas déjà fait, sans README ni .gitignore pour éviter les conflits.)

## 4. Déployer sur Vercel

1. Va sur [vercel.com](https://vercel.com) → **Add New → Project**.
2. Importe ton repo GitHub `suivi-budget`.
3. Vercel détecte Vite automatiquement (build command `vite build`, output `dist`) — ne change rien.
4. Avant de cliquer sur Deploy, ouvre **Environment Variables** et ajoute :
   - `VITE_SUPABASE_URL` → ton URL Supabase
   - `VITE_SUPABASE_ANON_KEY` → ta clé anon
5. Clique sur **Deploy**.

## 5. Récupérer ton URL

Vercel te donne un lien du type `suivi-budget-xxxx.vercel.app`. C'est ton URL "secrète" — ne la partage à personne. Tu peux la personnaliser légèrement dans **Project Settings → Domains** (ex. `suivi-budget-a8f3k2.vercel.app`) pour la rendre moins devinable.

## 6. Mises à jour futures

Comme pour Sport & Bouffe : tout changement poussé sur la branche `main` de GitHub redéploie automatiquement sur Vercel.

```bash
git add .
git commit -m "description du changement"
git push
```

## Rappel sécurité

Ce projet n'a **aucune authentification** — c'est un choix assumé pour rester simple. Concrètement :
- N'importe qui avec le lien Vercel peut ouvrir et utiliser l'appli.
- La clé Supabase `anon` est visible dans le code livré au navigateur : quelqu'un de déterminé pourrait interroger directement la base sans même passer par le site.
- Les tables n'ont pas de RLS (Row Level Security) activée.

Si tu changes d'avis plus tard, le plus simple sera d'ajouter Supabase Auth (email + mot de passe) et d'activer RLS avec une policy `auth.uid() is not null` sur chaque table — demande-moi et je l'ajoute.
