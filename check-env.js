#!/usr/bin/env node

/**
 * Script de vérification des variables d'environnement
 * Usage: node check-env.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const requiredVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY'
];

console.log('🔍 Vérification des variables d\'environnement...\n');

// Charger .env si existe
let envVars = {};
try {
  const envPath = join(__dirname, '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
  console.log('✅ Fichier .env trouvé\n');
} catch (err) {
  console.log('❌ Fichier .env non trouvé\n');
}

// Vérifier chaque variable
let allOk = true;
requiredVars.forEach(varName => {
  const value = envVars[varName] || process.env[varName];
  if (value) {
    // Masquer la valeur pour la sécurité
    const displayValue = varName.includes('KEY') 
      ? value.substring(0, 10) + '...' 
      : value;
    console.log(`✅ ${varName}: ${displayValue}`);
  } else {
    console.log(`❌ ${varName}: MANQUANTE`);
    allOk = false;
  }
});

console.log('\n' + '='.repeat(50));

if (allOk) {
  console.log('✅ Toutes les variables sont configurées!');
  process.exit(0);
} else {
  console.log('❌ Certaines variables sont manquantes.');
  console.log('\n📝 Pour configurer:');
  console.log('1. Créez un fichier .env à la racine du projet');
  console.log('2. Ajoutez les variables depuis .env.example');
  console.log('3. Récupérez les valeurs depuis Supabase Dashboard');
  process.exit(1);
}

