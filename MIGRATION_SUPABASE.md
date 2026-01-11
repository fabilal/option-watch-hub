# 🔄 Migration vers votre Supabase Personnel

## ✅ Changements Effectués

Votre application a été migrée du Supabase par défaut (Lovable) vers votre Supabase personnel.

### Informations du Nouveau Projet

- **Project ID** : `iflnsckduohrcafafcpj`
- **URL** : `https://iflnsckduohrcafafcpj.supabase.co`
- **Clés disponibles** :
  - Legacy anon key (fonctionne)
  - Publishable key (moderne, recommandé)

### Fichiers Mis à Jour

1. ✅ `supabase/config.toml` - Project ID mis à jour
2. ✅ `.env.example` - Nouvelles valeurs par défaut
3. ✅ `CONFIGURATION_LOCALE.md` - Documentation mise à jour

---

## 🚀 Prochaines Étapes

### 1. Mettre à Jour votre Fichier `.env`

Si vous avez déjà un fichier `.env`, mettez-le à jour :

```env
VITE_SUPABASE_URL=https://iflnsckduohrcafafcpj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=votre_cle_publique_ici
```

**Pour obtenir votre clé :**
1. Allez sur [Supabase Dashboard](https://app.supabase.com)
2. Sélectionnez votre projet
3. **Settings** → **API**
4. Copiez soit :
   - **anon key** (legacy) : `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **publishable key** (moderne) : `sb_publishable_...`

### 2. Déployer les Edge Functions

Les Edge Functions doivent être déployées sur votre nouveau projet Supabase.

**Option A : Via Supabase CLI (Recommandé)**

```bash
# Se connecter à Supabase
supabase login

# Lier le projet local au projet Supabase
supabase link --project-ref iflnsckduohrcafafcpj

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

**Option B : Via Dashboard Supabase**

1. Allez sur [Supabase Dashboard](https://app.supabase.com)
2. **Edge Functions** → **Create Function**
3. Pour chaque fonction :
   - Nom : `scrape-barchart-options` (etc.)
   - Copiez le code depuis `supabase/functions/scrape-barchart-options/index.ts`
   - Déployez

### 3. Configurer les Secrets (Firecrawl API Key)

Les Edge Functions ont besoin de `FIRECRAWL_API_KEY` pour fonctionner.

**Via Dashboard :**
1. **Edge Functions** → **Settings** → **Secrets**
2. Ajoutez : `FIRECRAWL_API_KEY` = `votre_cle_firecrawl`

**Via CLI :**
```bash
supabase secrets set FIRECRAWL_API_KEY=votre_cle_firecrawl
```

### 4. Vérifier la Configuration

**Tester une fonction :**
```bash
curl -X POST https://iflnsckduohrcafafcpj.supabase.co/functions/v1/scrape-barchart-symbols \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_CLE_PUBLIQUE" \
  -d '{"category": "energies"}'
```

**Vérifier dans le navigateur :**
1. Redémarrez votre serveur de dev : `npm run dev`
2. Ouvrez l'application
3. Vérifiez la console pour les erreurs de connexion

---

## 🔍 Vérifications

### ✅ Checklist

- [ ] Fichier `.env` mis à jour avec la nouvelle URL
- [ ] Fichier `.env` mis à jour avec la nouvelle clé publique
- [ ] Edge Functions déployées sur le nouveau projet
- [ ] `FIRECRAWL_API_KEY` configurée dans les secrets Supabase
- [ ] Serveur redémarré (`npm run dev`)
- [ ] Application testée dans le navigateur

### 🐛 Dépannage

**Erreur : "Variables d'environnement Supabase manquantes"**
- Vérifiez que `.env` existe et contient les bonnes valeurs
- Redémarrez le serveur après modification de `.env`

**Erreur : "Function not found"**
- Les Edge Functions ne sont pas encore déployées
- Déployez-les via CLI ou Dashboard

**Erreur : "Firecrawl connector not configured"**
- `FIRECRAWL_API_KEY` n'est pas configurée dans Supabase
- Ajoutez-la dans Settings → Secrets

**Erreur : "Invalid API key"**
- La clé dans `.env` est incorrecte
- Vérifiez dans Supabase Dashboard → Settings → API

---

## 📝 Notes Importantes

### Ancien vs Nouveau Projet

- **Ancien** : `eugvjubeuyukhgcwfncr` (Lovable par défaut)
- **Nouveau** : `iflnsckduohrcafafcpj` (Votre projet personnel)

### Données

- Les données de l'ancien projet ne sont **pas** migrées automatiquement
- Le cache des Edge Functions est **vide** au début (normal)
- Les premières requêtes seront un peu plus lentes (pas de cache)

### Sécurité

- Ne commitez **JAMAIS** le fichier `.env`
- Ne partagez **JAMAIS** vos clés API publiquement
- Les clés `anon`/`publishable` sont publiques mais limitées par RLS

---

## 🎉 Une Fois Terminé

Votre application devrait maintenant fonctionner avec votre Supabase personnel !

Si vous rencontrez des problèmes, vérifiez :
1. Les logs Supabase Dashboard → Edge Functions → Logs
2. La console du navigateur (F12)
3. Les variables d'environnement

