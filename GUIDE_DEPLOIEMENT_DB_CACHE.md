# 🚀 Guide de Déploiement - Cache DB Persistant

**Date:** $(date)

---

## ✅ IMPLÉMENTATION TERMINÉE

L'implémentation est complète. Les fichiers suivants ont été modifiés/créés:

### Fichiers Créés
- ✅ `supabase/functions/_shared/db-cache.ts` - Helper functions pour DB cache

### Fichiers Modifiés
- ✅ `supabase/functions/scrape-barchart-symbols/index.ts` - Utilise maintenant DB cache
- ✅ `supabase/functions/scrape-barchart-maturities/index.ts` - Utilise maintenant DB cache

---

## 🔧 CONFIGURATION REQUISE

### 1. Configurer le Service Role Key dans Supabase

**Étape 1:** Aller dans Supabase Dashboard
- URL: https://supabase.com/dashboard/project/iflnsckduohrcafafcpj

**Étape 2:** Récupérer le Service Role Key
- Project Settings → API
- Copier la **Service Role Key** (secret, ne jamais exposer)

**Étape 3:** Configurer le Secret dans Edge Functions
- Project Settings → Edge Functions → Secrets
- Ajouter un nouveau secret:
  - **Nom:** `SUPABASE_SERVICE_ROLE_KEY`
  - **Valeur:** Coller le Service Role Key

**Alternative:** Si vous utilisez Supabase CLI, vous pouvez aussi configurer via:
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

---

## 📦 DÉPLOIEMENT

### Option 1: Via Supabase CLI (Recommandé)

```bash
# Depuis le répertoire du projet
cd "C:\Users\bilal\Desktop\Stage\all data\option-watch-hub"

# Déployer les fonctions modifiées
supabase functions deploy scrape-barchart-symbols
supabase functions deploy scrape-barchart-maturities
```

**Note:** Le fichier `_shared/db-cache.ts` sera automatiquement inclus lors du déploiement.

### Option 2: Via Supabase Dashboard

1. Aller dans Edge Functions
2. Pour chaque fonction (`scrape-barchart-symbols`, `scrape-barchart-maturities`):
   - Cliquer sur "Edit"
   - Copier le code modifié
   - Sauvegarder

---

## 🧪 TEST

### Test 1: Premier Appel (Scraping + Sauvegarde DB)

```bash
# Test symbols
curl -X POST https://iflnsckduohrcafafcpj.supabase.co/functions/v1/scrape-barchart-symbols \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"category": "energies"}'
```

**Résultat attendu:**
- Scraping effectué (3-5 secondes)
- Données retournées
- Données sauvegardées en DB (vérifier dans Dashboard)

### Test 2: Deuxième Appel (Cache DB)

```bash
# Même requête
curl -X POST https://iflnsckduohrcafafcpj.supabase.co/functions/v1/scrape-barchart-symbols \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"category": "energies"}'
```

**Résultat attendu:**
- Réponse immédiate (< 50ms)
- Pas de scraping
- `fromDBCache: true` dans la réponse

### Test 3: Vérification DB

Dans Supabase Dashboard → Table Editor:

```sql
-- Vérifier symbols
SELECT * FROM scraped_symbols WHERE category = 'energies';

-- Vérifier maturities
SELECT * FROM scraped_maturities WHERE symbol = 'CL';
```

**Résultat attendu:**
- Données présentes dans les tables
- `expires_at` dans le futur

---

## 📊 MONITORING

### Vérifier les Logs

Dans Supabase Dashboard → Edge Functions → Logs:

**Messages attendus:**
- `DB cache hit for symbols: energies (X symbols)` - Cache DB utilisé ✅
- `No cache found for energies, will scrape...` - Scraping nécessaire
- `Saved X symbols for category energies to DB` - Sauvegarde réussie ✅

### Métriques à Surveiller

1. **Cache Hit Rate:**
   - Devrait être > 90% après le premier appel
   - Vérifier dans les logs

2. **Temps de Réponse:**
   - Premier appel: 3-5s (scraping)
   - Appels suivants: < 50ms (DB)

3. **Requêtes Firecrawl:**
   - Devrait diminuer drastiquement
   - Avant: 100+ requêtes/jour
   - Après: 1-5 requêtes/jour

---

## ⚠️ DÉPANNAGE

### Problème 1: Erreur "Supabase error: 401"

**Cause:** Service Role Key non configuré ou incorrect

**Solution:**
1. Vérifier que `SUPABASE_SERVICE_ROLE_KEY` est configuré dans Secrets
2. Vérifier que la clé est correcte (copier depuis Project Settings → API)

### Problème 2: Erreur "Supabase error: 403"

**Cause:** RLS bloque l'accès

**Solution:**
- Le Service Role Key devrait bypasser RLS
- Vérifier que RLS est bien configuré (lecture publique, écriture service role)

### Problème 3: Données non sauvegardées

**Cause:** Erreur silencieuse dans la sauvegarde async

**Solution:**
- Vérifier les logs Edge Functions
- La sauvegarde est non-bloquante (ne bloque pas la réponse)
- Si erreur, elle est loggée mais la réponse est quand même retournée

### Problème 4: Import "_shared/db-cache.ts" échoue

**Cause:** Chemin incorrect ou fichier non déployé

**Solution:**
- Vérifier que le fichier existe: `supabase/functions/_shared/db-cache.ts`
- Supabase CLI inclut automatiquement les fichiers `_shared/`
- Si problème, vérifier la structure des dossiers

---

## 📈 RÉSULTATS ATTENDUS

### Avant Implémentation
- **Requêtes symbols/jour:** 100+
- **Requêtes maturities/jour:** 50+
- **Temps de réponse moyen:** 3-5s
- **Coût Firecrawl/mois:** ~$50-100

### Après Implémentation
- **Requêtes symbols/jour:** 1-5 (seulement si cache expiré)
- **Requêtes maturities/jour:** 1-2 par symbole (seulement si cache expiré)
- **Temps de réponse moyen:** < 50ms (cache DB)
- **Coût Firecrawl/mois:** ~$5-10
- **Économie:** ~$40-90/mois

---

## ✅ CHECKLIST DE DÉPLOIEMENT

- [ ] Service Role Key configuré dans Supabase Secrets
- [ ] Fonctions déployées (`scrape-barchart-symbols`, `scrape-barchart-maturities`)
- [ ] Premier appel testé (scraping + sauvegarde)
- [ ] Deuxième appel testé (cache DB)
- [ ] Données vérifiées dans Supabase Dashboard
- [ ] Logs vérifiés (pas d'erreurs)
- [ ] Performance vérifiée (temps de réponse < 50ms)

---

## 🎯 PROCHAINES ÉTAPES (Optionnel)

1. **Cron Job pour Nettoyage:**
   - Configurer un cron job pour exécuter `cleanup_expired_scraped_data()` quotidiennement

2. **Monitoring Avancé:**
   - Ajouter des métriques de cache hit rate
   - Dashboard de monitoring

3. **Optimisation Supplémentaire:**
   - Augmenter TTL si nécessaire (symbols: 7 jours → 30 jours)
   - Préchargement des symboles populaires

---

**Statut:** ✅ Prêt pour déploiement et test

