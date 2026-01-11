# 🚀 Déploiement des Edge Functions

## ✅ Fonctions Déployées

### 1. scrape-barchart-options ✅
- **Status**: ACTIVE
- **Version**: 1
- **ID**: e521fe96-366c-4ef0-b5f1-90596f9a9388

---

## 📋 Fonctions Restantes à Déployer

Les fonctions suivantes doivent être déployées via le Dashboard Supabase ou Supabase CLI :

### Barchart Functions
- [ ] `scrape-barchart-symbols`
- [ ] `scrape-barchart-futures`
- [ ] `scrape-barchart-maturities`

### TradingView Functions
- [ ] `scrape-tradingview-symbols`
- [ ] `scrape-tradingview-futures`
- [ ] `scrape-tradingview-options`

### Forex Functions
- [ ] `scrape-forex-symbols`
- [ ] `scrape-forex-futures`
- [ ] `scrape-forex-options`

---

## 🔧 Méthode de Déploiement

### Option 1 : Via Supabase Dashboard (Recommandé)

1. Allez sur [Supabase Dashboard](https://app.supabase.com)
2. Sélectionnez votre projet
3. **Edge Functions** → **Create Function**
4. Pour chaque fonction :
   - **Name** : `scrape-barchart-symbols` (etc.)
   - **Code** : Copiez le contenu de `supabase/functions/scrape-barchart-symbols/index.ts`
   - **Verify JWT** : Désactivé (comme dans `config.toml`)
   - Cliquez sur **Deploy**

### Option 2 : Via Supabase CLI

```bash
# Installer Supabase CLI si nécessaire
npm install -g supabase

# Se connecter
supabase login

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

## ⚙️ Configuration Requise

### Secrets Supabase

**IMPORTANT** : Configurez `FIRECRAWL_API_KEY` dans les secrets Supabase :

1. **Edge Functions** → **Settings** → **Secrets**
2. Ajoutez :
   - **Name** : `FIRECRAWL_API_KEY`
   - **Value** : Votre clé API Firecrawl

Sans cette clé, toutes les fonctions retourneront une erreur.

---

## ✅ Vérification

Après déploiement, testez une fonction :

```bash
curl -X POST https://iflnsckduohrcafafcpj.supabase.co/functions/v1/scrape-barchart-symbols \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_CLE_PUBLIQUE" \
  -d '{"category": "energies"}'
```

Vous devriez recevoir une réponse JSON avec les symboles.

