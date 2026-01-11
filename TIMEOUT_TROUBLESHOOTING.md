# ⏱️ Résolution des Problèmes de Timeout

## Problème : "Scrape timed out"

Si vous voyez l'erreur `Scrape timed out` ou `Scrape failed: Scrape timed out`, cela signifie que **Firecrawl** n'a pas pu terminer le scraping dans le temps imparti.

---

## 🔍 Causes Possibles

### 1. **Page Barchart.com trop lente à charger**
- Les pages de volatilité-greeks peuvent être lourdes
- JavaScript complexe à exécuter
- Réseau lent

### 2. **Limite de timeout Firecrawl**
- Firecrawl a des limites de temps par requête
- Le `waitFor: 3000` (3 secondes) peut ne pas suffire

### 3. **Charge serveur Firecrawl**
- Si Firecrawl est surchargé, les requêtes peuvent timeout

---

## ✅ Solutions

### Solution 1 : Réessayer (Recommandé)

**Le timeout est souvent temporaire.** Réessayez simplement :

1. Cliquez sur le bouton **"Actualiser"** dans l'interface
2. Ou changez de maturité puis revenez

### Solution 2 : Essayer une autre maturité

Certaines maturités peuvent avoir plus de données et prendre plus de temps. Essayez :
- Une maturité plus proche (moins de données)
- Une maturité différente

### Solution 3 : Vérifier votre connexion

Un réseau lent peut causer des timeouts :
- Vérifiez votre connexion internet
- Essayez avec un autre réseau (mobile, etc.)

### Solution 4 : Augmenter le timeout (Côté Backend)

Si le problème persiste, vous pouvez augmenter le `waitFor` dans les Edge Functions :

**Fichier:** `supabase/functions/scrape-barchart-options/index.ts`

```typescript
// Ligne ~183, augmenter waitFor de 3000 à 5000 ou 8000
waitFor: 5000,  // Au lieu de 3000
```

**⚠️ Attention:** Augmenter le timeout peut aussi augmenter les coûts Firecrawl.

---

## 🛠️ Améliorations Apportées

### Messages d'erreur améliorés

Les erreurs de timeout affichent maintenant un message plus clair :
```
Le scraping a pris trop de temps. Cela peut arriver si la page est lente à charger. 
Veuillez réessayer dans quelques instants ou essayer une autre maturité.
```

### Gestion cohérente

Toutes les fonctions API (`fetchOptionsData`, `fetchAvailableMaturities`, `fetchFuturesPrices`) gèrent maintenant les timeouts de manière cohérente.

---

## 📊 Monitoring

### Vérifier les logs Supabase

1. Allez sur [Supabase Dashboard](https://app.supabase.com)
2. **Edge Functions** → Sélectionnez `scrape-barchart-options`
3. **Logs** → Voir les erreurs détaillées

### Vérifier les logs Firecrawl

Si vous avez accès au dashboard Firecrawl, vérifiez :
- Le temps de réponse moyen
- Le taux de succès
- Les erreurs de timeout

---

## 🔄 Retry Automatique (Futur)

Une amélioration possible serait d'ajouter un retry automatique côté client :

```typescript
// Exemple de retry avec exponential backoff
async function fetchWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.message.includes('timeout') && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
}
```

---

## 💡 Conseils

1. **Patience** : Les timeouts sont souvent temporaires
2. **Cache** : Les données sont mises en cache 15 minutes, donc les requêtes suivantes seront plus rapides
3. **Heures creuses** : Essayez à des heures où Firecrawl est moins chargé
4. **Symboles populaires** : Les symboles très actifs (CL, GC, etc.) peuvent être plus lents

---

## 🆘 Si le problème persiste

1. **Vérifiez votre quota Firecrawl** : Peut-être que vous avez atteint la limite
2. **Contactez le support Firecrawl** : Si les timeouts sont systématiques
3. **Vérifiez les logs Supabase** : Pour voir les erreurs détaillées
4. **Essayez un autre symbole** : Pour isoler le problème

---

## 📝 Notes Techniques

- **Timeout Firecrawl par défaut** : ~30-60 secondes (selon le plan)
- **Timeout Edge Function** : 60 secondes (Supabase)
- **waitFor actuel** : 3000ms (3 secondes) - temps d'attente avant extraction

