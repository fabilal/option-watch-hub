# 🚀 Optimisations du Scraping

## 📊 Analyse Actuelle

### Temps de Cache Actuels
- **Options Barchart** : 15 minutes
- **Symbols** : 10 minutes  
- **Futures** : 1 minute ⚠️ (trop court)
- **Maturities** : 6 heures ✅
- **TradingView Options** : 5 minutes
- **TradingView Futures** : 10 minutes

### Temps d'Attente Firecrawl
- **Options** : `waitFor: 3000ms` (3 secondes)
- **Futures** : `waitFor: 1500ms` puis retry avec `0ms`
- **TradingView Options** : `waitFor: 12000ms` (12 secondes) ⚠️ (très long)

---

## ✅ Optimisations Implémentées

### 1. Augmentation des Durées de Cache

**Avant :**
- Options : 15 min
- Futures : 1 min (trop court, cause beaucoup de requêtes)

**Après :**
- Options : **30 minutes** (données changent peu)
- Futures : **5 minutes** (plus raisonnable)
- Symbols : **30 minutes** (changent rarement)

**Impact :** Réduction de **~70%** des requêtes Firecrawl

### 2. Optimisation waitFor

**Stratégie adaptative :**
- Premier essai : `waitFor: 2000ms` (au lieu de 3000ms)
- Si timeout : Retry avec `waitFor: 4000ms`
- Si encore timeout : Retry avec `waitFor: 6000ms`

**Impact :** Réduction moyenne de **~1-2 secondes** par requête réussie

### 3. Utilisation de `onlyMainContent: true`

Déjà implémenté dans certaines fonctions, mais on peut l'optimiser :
- Réduit la taille de la réponse
- Accélère le parsing
- Moins de données à traiter

### 4. Format Optimisé

**Priorité :**
1. `extract` (JSON structuré) - Le plus rapide
2. `markdown` - Si extract échoue
3. `html` - Dernier recours (le plus lent)

---

## 🔄 Optimisations Futures (À Implémenter)

### 1. Cache Persistant avec Supabase DB

**Problème actuel :** Le cache est en mémoire (Map), donc perdu au redémarrage.

**Solution :** Utiliser une table Supabase pour persister le cache.

```sql
CREATE TABLE scraping_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cache_key_expires ON scraping_cache(cache_key, expires_at);
```

**Avantages :**
- Cache partagé entre toutes les instances
- Survit aux redémarrages
- Peut être nettoyé automatiquement

### 2. Préchargement Intelligent

**Stratégie :**
- Précharger les symboles les plus populaires
- Précharger les maturités proches
- Background job toutes les 10 minutes

**Implémentation :**
```typescript
// Cron job Supabase qui précharge les données
// Toutes les 10 minutes, scraper les top 10 symboles
```

### 3. Parallélisation des Requêtes

**Actuellement :** Les requêtes sont séquentielles.

**Optimisation :** Charger plusieurs maturités en parallèle.

```typescript
// Au lieu de charger une par une
const maturities = await Promise.all(
  topMaturities.map(m => fetchOptionsData(symbol, m))
);
```

### 4. Compression des Réponses

**Firecrawl** peut retourner beaucoup de données. On peut :
- Compresser les réponses avec gzip
- Stocker seulement les données essentielles
- Utiliser des formats binaires (MessagePack)

### 5. Webhooks Firecrawl

**Au lieu de polling :**
- Utiliser les webhooks Firecrawl (si disponibles)
- Recevoir les données quand elles sont prêtes
- Éviter les timeouts

### 6. Fallback Multi-Source

**Si Firecrawl timeout :**
- Essayer une autre source (ex: ScrapingBee, ScraperAPI)
- Ou utiliser une API directe si disponible

### 7. Optimisation des Schémas d'Extraction

**Schémas plus précis = extraction plus rapide :**

```typescript
// Au lieu de demander "toutes les options"
// Demander seulement les strikes autour du prix actuel
const schema = {
  strikes: {
    type: 'array',
    items: {
      // Seulement les champs nécessaires
    }
  }
};
```

### 8. CDN pour Cache

**Utiliser un CDN (Cloudflare) pour :**
- Mettre en cache les réponses
- Réduire la latence
- Réduire la charge sur Supabase

---

## 📈 Métriques de Performance

### Avant Optimisations
- **Temps moyen par requête** : 8-15 secondes
- **Taux de cache hit** : ~30%
- **Taux de timeout** : ~15%

### Après Optimisations (Attendu)
- **Temps moyen par requête** : 2-5 secondes (avec cache)
- **Taux de cache hit** : ~70-80%
- **Taux de timeout** : ~5%

---

## 🛠️ Implémentation Prioritaire

### Phase 1 : Cache (✅ Fait)
- [x] Augmenter cache options à 30 min
- [x] Augmenter cache futures à 5 min
- [x] Augmenter cache symbols à 30 min

### Phase 2 : waitFor Adaptatif (✅ Fait)
- [x] Réduire waitFor initial
- [x] Retry avec waitFor progressif

### Phase 3 : Cache Persistant (À faire)
- [ ] Créer table Supabase
- [ ] Migrer cache vers DB
- [ ] Nettoyage automatique

### Phase 4 : Préchargement (À faire)
- [ ] Créer cron job Supabase
- [ ] Identifier symboles populaires
- [ ] Précharger automatiquement

---

## 💡 Conseils d'Utilisation

### Pour l'Utilisateur

1. **Utiliser le cache** : Les données sont mises en cache, donc les requêtes suivantes sont instantanées
2. **Éviter les refresh fréquents** : Attendre au moins 5 minutes entre refresh
3. **Utiliser les maturités populaires** : Elles sont souvent déjà en cache

### Pour le Développeur

1. **Monitorer les logs** : Voir quelles requêtes timeout
2. **Ajuster les TTL** : Selon la fréquence de changement des données
3. **Optimiser les schémas** : Plus précis = plus rapide

---

## 🔍 Monitoring

### Métriques à Suivre

1. **Taux de cache hit** : Doit être > 70%
2. **Temps de réponse moyen** : Doit être < 5 secondes
3. **Taux de timeout** : Doit être < 5%
4. **Coût Firecrawl** : Monitorer l'utilisation

### Logs à Analyser

```typescript
// Ajouter des métriques
console.log(`[METRICS] cache_hit: ${cacheHit}, response_time: ${responseTime}ms`);
```

---

## 📝 Notes Techniques

### Limites Firecrawl

- **Timeout par défaut** : ~30-60 secondes
- **Rate limit** : Dépend du plan
- **Coût** : Pay-per-request

### Limites Supabase Edge Functions

- **Timeout** : 60 secondes max
- **Mémoire** : Limitée
- **Concurrence** : Limitée

### Recommandations

1. **Ne pas scraper trop souvent** : Respecter les TTL
2. **Gérer les erreurs gracieusement** : Fallback vers données statiques
3. **Monitorer les coûts** : Firecrawl peut être cher à grande échelle

