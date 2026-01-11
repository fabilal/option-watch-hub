/**
 * Système de cache localStorage avec TTL
 * Utilisé pour stocker les données qui changent rarement (symbols, maturities)
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live en millisecondes
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures par défaut

/**
 * Récupère une entrée du cache localStorage
 * @param key Clé du cache
 * @returns Les données si valides, null sinon
 */
export function getFromLocalCache<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;

    const entry: CacheEntry<T> = JSON.parse(item);
    const now = Date.now();
    const age = now - entry.timestamp;

    // Vérifier si le cache est encore valide
    if (age > entry.ttl) {
      // Cache expiré, le supprimer
      localStorage.removeItem(key);
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error(`Error reading from localStorage cache (${key}):`, error);
    // En cas d'erreur, supprimer l'entrée corrompue
    localStorage.removeItem(key);
    return null;
  }
}

/**
 * Sauvegarde une entrée dans le cache localStorage
 * @param key Clé du cache
 * @param data Données à sauvegarder
 * @param ttl Time to live en millisecondes (défaut: 24h)
 */
export function setLocalCache<T>(key: string, data: T, ttl: number = DEFAULT_TTL_MS): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.error(`Error writing to localStorage cache (${key}):`, error);
    // Si localStorage est plein, essayer de nettoyer les anciennes entrées
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      clearExpiredCache();
      // Réessayer une fois après nettoyage
      try {
        localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now(), ttl }));
      } catch (retryError) {
        console.error('Failed to save to cache after cleanup:', retryError);
      }
    }
  }
}

/**
 * Supprime une entrée du cache
 * @param key Clé du cache (optionnel, si non fourni, supprime toutes les entrées du cache de l'app)
 */
export function clearLocalCache(key?: string): void {
  if (key) {
    localStorage.removeItem(key);
  } else {
    // Supprimer toutes les clés de cache de l'application
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('barchart_') || key.startsWith('tradingview_') || key.startsWith('forex_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
}

/**
 * Nettoie les entrées expirées du cache
 */
function clearExpiredCache(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || (!key.startsWith('barchart_') && !key.startsWith('tradingview_') && !key.startsWith('forex_'))) {
      continue;
    }

    try {
      const item = localStorage.getItem(key);
      if (!item) continue;

      const entry: CacheEntry<unknown> = JSON.parse(item);
      const now = Date.now();
      if (now - entry.timestamp > entry.ttl) {
        keysToRemove.push(key);
      }
    } catch {
      // Entrée corrompue, la supprimer
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}

/**
 * Vérifie si une clé existe dans le cache et est valide
 * @param key Clé du cache
 * @returns true si le cache existe et est valide
 */
export function isCacheValid(key: string): boolean {
  return getFromLocalCache(key) !== null;
}

/**
 * Obtient l'âge du cache en secondes
 * @param key Clé du cache
 * @returns Âge en secondes, ou null si le cache n'existe pas ou est expiré
 */
export function getCacheAge(key: string): number | null {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;

    const entry: CacheEntry<unknown> = JSON.parse(item);
    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > entry.ttl) {
      localStorage.removeItem(key);
      return null;
    }

    return Math.floor(age / 1000); // Retourner en secondes
  } catch {
    return null;
  }
}

// Nettoyer automatiquement les caches expirés au chargement
if (typeof window !== 'undefined') {
  clearExpiredCache();
}

