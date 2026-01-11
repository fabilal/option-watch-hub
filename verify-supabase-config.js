#!/usr/bin/env node

/**
 * Script de vérification de la configuration Supabase
 * Usage: node verify-supabase-config.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXPECTED_PROJECT_ID = 'iflnsckduohrcafafcpj';
const EXPECTED_URL = 'https://iflnsckduohrcafafcpj.supabase.co';

console.log('🔍 Vérification de la configuration Supabase...\n');

let allOk = true;

// 1. Vérifier config.toml
try {
  const configPath = join(__dirname, 'supabase', 'config.toml');
  const configContent = readFileSync(configPath, 'utf-8');
  const projectIdMatch = configContent.match(/project_id\s*=\s*"([^"]+)"/);
  
  if (projectIdMatch) {
    const projectId = projectIdMatch[1];
    if (projectId === EXPECTED_PROJECT_ID) {
      console.log(`✅ config.toml : Project ID correct (${projectId})`);
    } else {
      console.log(`❌ config.toml : Project ID incorrect (${projectId}, attendu: ${EXPECTED_PROJECT_ID})`);
      allOk = false;
    }
  } else {
    console.log('❌ config.toml : Project ID non trouvé');
    allOk = false;
  }
} catch (err) {
  console.log('❌ config.toml : Fichier non trouvé');
  allOk = false;
}

// 2. Vérifier .env
try {
  const envPath = join(__dirname, '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  
  const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
  const keyMatch = envContent.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.+)/);
  
  if (urlMatch) {
    const url = urlMatch[1].trim();
    if (url === EXPECTED_URL) {
      console.log(`✅ .env : URL correcte (${url})`);
    } else {
      console.log(`⚠️  .env : URL différente (${url})`);
      console.log(`   Attendu: ${EXPECTED_URL}`);
    }
  } else {
    console.log('❌ .env : VITE_SUPABASE_URL non trouvé');
    allOk = false;
  }
  
  if (keyMatch) {
    const key = keyMatch[1].trim();
    if (key && key !== 'votre_cle_publique_ici' && key.length > 10) {
      console.log(`✅ .env : Clé publique configurée (${key.substring(0, 20)}...)`);
    } else {
      console.log('❌ .env : Clé publique manquante ou invalide');
      allOk = false;
    }
  } else {
    console.log('❌ .env : VITE_SUPABASE_PUBLISHABLE_KEY non trouvé');
    allOk = false;
  }
} catch (err) {
  console.log('⚠️  .env : Fichier non trouvé (normal si pas encore créé)');
  console.log('   Créez-le avec les valeurs de .env.example');
}

// 3. Vérifier client.ts
try {
  const clientPath = join(__dirname, 'src', 'integrations', 'supabase', 'client.ts');
  const clientContent = readFileSync(clientPath, 'utf-8');
  
  if (clientContent.includes('VITE_SUPABASE_URL') && clientContent.includes('VITE_SUPABASE_PUBLISHABLE_KEY')) {
    console.log('✅ client.ts : Configuration correcte');
  } else {
    console.log('❌ client.ts : Configuration incorrecte');
    allOk = false;
  }
} catch (err) {
  console.log('❌ client.ts : Fichier non trouvé');
  allOk = false;
}

console.log('\n' + '='.repeat(50));

if (allOk) {
  console.log('✅ Configuration Supabase correcte!');
  console.log('\n📝 Prochaines étapes:');
  console.log('1. Déployez les Edge Functions sur votre projet Supabase');
  console.log('2. Configurez FIRECRAWL_API_KEY dans Supabase Secrets');
  console.log('3. Testez l\'application avec: npm run dev');
  process.exit(0);
} else {
  console.log('❌ Certains problèmes de configuration détectés.');
  console.log('\n📝 Actions à faire:');
  console.log('1. Vérifiez config.toml');
  console.log('2. Créez/mettez à jour .env avec les bonnes valeurs');
  console.log('3. Consultez MIGRATION_SUPABASE.md pour plus de détails');
  process.exit(1);
}

