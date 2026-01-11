# 🚀 Guide de Déploiement des Edge Functions

## ✅ Toutes les Fonctions sont Déployées !

**10/10 fonctions déployées avec succès** ✅

### Barchart Functions (4/4)
1. ✅ **scrape-barchart-options** - ACTIVE (v1)
2. ✅ **scrape-barchart-symbols** - ACTIVE (v1)
3. ✅ **scrape-barchart-futures** - ACTIVE (v1)
4. ✅ **scrape-barchart-maturities** - ACTIVE (v1)

### TradingView Functions (3/3)
5. ✅ **scrape-tradingview-symbols** - ACTIVE (v1)
6. ✅ **scrape-tradingview-futures** - ACTIVE (v1)
7. ✅ **scrape-tradingview-options** - ACTIVE (v1)

### Forex Functions (3/3)
8. ✅ **scrape-forex-symbols** - ACTIVE (v1)
9. ✅ **scrape-forex-futures** - ACTIVE (v1)
10. ✅ **scrape-forex-options** - ACTIVE (v1)

---

## 📋 Instructions pour Déploiement Manuel (si nécessaire)

### Méthode Recommandée : Supabase Dashboard

1. Allez sur https://app.supabase.com
2. Sélectionnez votre projet (ID: `iflnsckduohrcafafcpj`)
3. **Edge Functions** → **Create Function**
4. Pour chaque fonction ci-dessous :
   - **Name** : Le nom de la fonction
   - **Code** : Copiez le contenu du fichier correspondant dans `supabase/functions/[nom-fonction]/index.ts`
   - **Verify JWT** : ❌ Désactivé
   - Cliquez sur **Deploy**

### Liste des Fonctions (Toutes déployées ✅)

#### Barchart (4 fonctions) ✅
- ✅ `scrape-barchart-options` → `supabase/functions/scrape-barchart-options/index.ts`
- ✅ `scrape-barchart-symbols` → `supabase/functions/scrape-barchart-symbols/index.ts`
- ✅ `scrape-barchart-futures` → `supabase/functions/scrape-barchart-futures/index.ts`
- ✅ `scrape-barchart-maturities` → `supabase/functions/scrape-barchart-maturities/index.ts`

#### TradingView (3 fonctions) ✅
- ✅ `scrape-tradingview-symbols` → `supabase/functions/scrape-tradingview-symbols/index.ts`
- ✅ `scrape-tradingview-futures` → `supabase/functions/scrape-tradingview-futures/index.ts`
- ✅ `scrape-tradingview-options` → `supabase/functions/scrape-tradingview-options/index.ts`

#### Forex (3 fonctions) ✅
- ✅ `scrape-forex-symbols` → `supabase/functions/scrape-forex-symbols/index.ts`
- ✅ `scrape-forex-futures` → `supabase/functions/scrape-forex-futures/index.ts`
- ✅ `scrape-forex-options` → `supabase/functions/scrape-forex-options/index.ts`

---

## ⚙️ Configuration Requise : Secret FIRECRAWL_API_KEY

**CRITIQUE** : Toutes les fonctions nécessitent la clé API Firecrawl.

### Étapes :

1. **Edge Functions** → **Settings** → **Secrets**
2. Cliquez sur **Add Secret**
3. Remplissez :
   - **Name** : `FIRECRAWL_API_KEY`
   - **Value** : Votre clé API Firecrawl (commence par `sk-`)
4. Cliquez sur **Save**

**Sans cette clé, toutes les fonctions retourneront une erreur "Firecrawl connector not configured".**

---

## ✅ Vérification du Déploiement

Testez une fonction déployée :

```bash
curl -X POST https://iflnsckduohrcafafcpj.supabase.co/functions/v1/scrape-barchart-symbols \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_CLE_PUBLIQUE_SUPABASE" \
  -d '{"category": "energies"}'
```

Vous devriez recevoir une réponse JSON avec les symboles ou une erreur si `FIRECRAWL_API_KEY` n'est pas configurée.

---

## 🔄 Alternative : Supabase CLI

Si vous avez Supabase CLI installé :

```bash
# Lier le projet
supabase link --project-ref iflnsckduohrcafafcpj

# Déployer toutes les fonctions
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

---

## 📝 Notes

- Toutes les fonctions ont `verify_jwt: false` pour permettre l'accès depuis le frontend
- Les fonctions utilisent un système de cache pour optimiser les performances
- Les fonctions gèrent automatiquement les rate limits et les timeouts de Firecrawl

