# 🔧 Configuration pour Développement Local

## Problème : Les données ne se récupèrent pas en local

Si les données ne se chargent pas quand vous lancez l'app en local, c'est probablement dû à des **variables d'environnement manquantes**.

---

## ✅ Solution : Configuration des Variables d'Environnement

### Étape 1 : Créer le fichier `.env`

À la racine du projet `option-watch-hub/`, créez un fichier nommé `.env` :

```bash
# Dans le dossier option-watch-hub/
touch .env
```

### Étape 2 : Récupérer vos identifiants Supabase

1. Allez sur [https://app.supabase.com](https://app.supabase.com)
2. Connectez-vous à votre projet (ID: `iflnsckduohrcafafcpj` selon `config.toml`)
3. Allez dans **Settings** → **API**
4. Copiez :
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon/public key** ou **publishable key** → `VITE_SUPABASE_PUBLISHABLE_KEY`

### Étape 3 : Remplir le fichier `.env`

Ouvrez `.env` et ajoutez :

```env
VITE_SUPABASE_URL=https://iflnsckduohrcafafcpj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=votre_cle_publique_ici
```

**Note :** Vous pouvez utiliser soit la clé `anon` (legacy) soit la clé `publishable` (moderne). Les deux fonctionnent.

**⚠️ Important :**
- Remplacez `votre_cle_anonyme_ici` par la vraie clé depuis Supabase
- Ne commitez **JAMAIS** le fichier `.env` (il est dans `.gitignore`)

### Étape 4 : Redémarrer le serveur de développement

```bash
# Arrêtez le serveur (Ctrl+C)
# Puis relancez :
npm run dev
```

---

## 🔍 Vérification

### Vérifier que les variables sont chargées

Ouvrez la console du navigateur (F12) et tapez :

```javascript
console.log(import.meta.env.VITE_SUPABASE_URL)
```

Vous devriez voir votre URL Supabase, pas `undefined`.

### Vérifier la connexion Supabase

Dans la console du navigateur, vérifiez s'il y a des erreurs :
- ❌ `Variables d'environnement Supabase manquantes!` → Le `.env` n'est pas chargé
- ❌ `Failed to fetch` → Problème de connexion réseau ou URL incorrecte
- ❌ `Invalid API key` → La clé est incorrecte

---

## 🚨 Autres Problèmes Possibles

### 1. Les Edge Functions ne sont pas déployées

Les fonctions Supabase doivent être déployées pour fonctionner.

**Vérification :**
```bash
# Dans le dossier option-watch-hub/
supabase functions list
```

**Déploiement :**
```bash
# Déployer toutes les fonctions
supabase functions deploy scrape-barchart-options
supabase functions deploy scrape-barchart-symbols
supabase functions deploy scrape-barchart-futures
supabase functions deploy scrape-barchart-maturities
supabase functions deploy scrape-tradingview-symbols
supabase functions deploy scrape-tradingview-futures
supabase functions deploy scrape-tradingview-options
supabase functions deploy scrape-forex-symbols
supabase functions deploy scrape-forex-futures
supabase functions deploy scrape-forex-options
```

### 2. Firecrawl API Key non configurée

Les Edge Functions ont besoin de `FIRECRAWL_API_KEY` pour fonctionner.

**Configuration :**
1. Allez sur [https://firecrawl.dev](https://firecrawl.dev)
2. Créez un compte et récupérez votre API key
3. Dans Supabase Dashboard → **Edge Functions** → **Settings** → **Secrets**
4. Ajoutez : `FIRECRAWL_API_KEY` = `votre_cle_firecrawl`

### 3. Problème de CORS

Si vous voyez des erreurs CORS dans la console :
- Vérifiez que les Edge Functions ont `verify_jwt = false` dans `config.toml` ✅ (déjà fait)
- Vérifiez que les headers CORS sont corrects dans les fonctions ✅ (déjà fait)

### 4. Port déjà utilisé

Si le port 8080 est occupé :

```bash
# Modifier vite.config.ts pour changer le port
# Ou tuer le processus qui utilise le port
```

---

## 📝 Checklist de Démarrage

- [ ] Fichier `.env` créé à la racine
- [ ] `VITE_SUPABASE_URL` rempli avec l'URL de votre projet
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY` rempli avec la clé anonyme
- [ ] Serveur redémarré (`npm run dev`)
- [ ] Variables vérifiées dans la console navigateur
- [ ] Edge Functions déployées sur Supabase
- [ ] `FIRECRAWL_API_KEY` configurée dans Supabase

---

## 🆘 Dépannage Avancé

### Voir les erreurs détaillées

Ouvrez la console du navigateur (F12) → **Console** et regardez les erreurs.

### Tester une fonction directement

```bash
# Tester une Edge Function
curl -X POST https://iflnsckduohrcafafcpj.supabase.co/functions/v1/scrape-barchart-symbols \
  -H "Content-Type: application/json" \
  -d '{"category": "energies"}'
```

### Vérifier les logs Supabase

1. Allez sur Supabase Dashboard
2. **Edge Functions** → Sélectionnez une fonction
3. **Logs** → Voir les erreurs en temps réel

---

## 💡 Note Importante

**Les Edge Functions doivent être déployées sur Supabase pour fonctionner.** Elles ne peuvent pas tourner en local sans configuration Supabase CLI complète.

Si vous voulez tester en local les Edge Functions, vous devez :
1. Installer Supabase CLI
2. Lancer `supabase start` (nécessite Docker)
3. Configurer les secrets localement

Pour un développement simple, **déployez les fonctions sur Supabase** et utilisez-les depuis votre frontend local.

