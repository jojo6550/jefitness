#!/usr/bin/env node

/**
 * Subscription System Initialization Script
 * 
 * This script helps set up the Stripe subscription system
 * Run with: node scripts/init-subscriptions.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log('\n🎉 Stripe Subscription System Setup\n');
  console.log('This script will help you configure your subscription system.\n');

  // Read current .env
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  console.log('📝 Step 1: Stripe API Keys');
  console.log('Get these from: https://dashboard.stripe.com/developers/api\n');

  const secretKey = await question('Enter your STRIPE_SECRET_KEY (sk_test_...): ');
  const publishableKey = await question('Enter your STRIPE_PUBLIC_KEY (pk_test_...): ');

  console.log('\n📝 Step 2: Stripe Price IDs');
  console.log('Create products at: https://dashboard.stripe.com/test/products');
  console.log('Then copy the Price ID for each plan\n');

  const price1m = await question('STRIPE_PRICE_1_MONTH (price_...): ');
  const price3m = await question('STRIPE_PRICE_3_MONTH (price_...): ');
  const price6m = await question('STRIPE_PRICE_6_MONTH (price_...): ');
  const price12m = await question('STRIPE_PRICE_12_MONTH (price_...): ');

  console.log('\n📝 Step 3: Webhook Secret (Optional)');
  console.log('Skip for now, set up after creating webhook endpoint\n');

  const webhookSecret = await question('STRIPE_WEBHOOK_SECRET (whsec_...): ');

  // Update .env content
  let updatedEnv = envContent;

  if (!envContent.includes('STRIPE_SECRET_KEY')) {
    updatedEnv += `\n\n# ========================================\n# STRIPE CONFIGURATION\n# ========================================\n`;
  }

  updatedEnv = updateEnvVar(updatedEnv, 'STRIPE_SECRET_KEY', secretKey);
  updatedEnv = updateEnvVar(updatedEnv, 'STRIPE_PUBLIC_KEY', publishableKey);
  updatedEnv = updateEnvVar(updatedEnv, 'STRIPE_PRICE_1_MONTH', price1m);
  updatedEnv = updateEnvVar(updatedEnv, 'STRIPE_PRICE_3_MONTH', price3m);
  updatedEnv = updateEnvVar(updatedEnv, 'STRIPE_PRICE_6_MONTH', price6m);
  updatedEnv = updateEnvVar(updatedEnv, 'STRIPE_PRICE_12_MONTH', price12m);

  if (webhookSecret) {
    updatedEnv = updateEnvVar(updatedEnv, 'STRIPE_WEBHOOK_SECRET', webhookSecret);
  }

  // Write updated .env
  fs.writeFileSync(envPath, updatedEnv);

  console.log('\n✅ .env file updated successfully!\n');

  // Update frontend JS
  const jsPath = path.join(__dirname, '..', 'public', 'js', 'subscriptions.js');
  if (fs.existsSync(jsPath)) {
    let jsContent = fs.readFileSync(jsPath, 'utf-8');
    jsContent = jsContent.replace(
      /const STRIPE_PUBLIC_KEY = '[^']*'/,
      `const STRIPE_PUBLIC_KEY = '${publishableKey}'`
    );
    fs.writeFileSync(jsPath, jsContent);
    console.log('✅ Frontend Stripe key updated!\n');
  }

  console.log('📋 Next Steps:\n');
  console.log('1. Restart your server: npm run dev');
  console.log('2. Visit: http://localhost:10000/subscriptions.html');
  console.log('3. Test with card: 4242 4242 4242 4242\n');

  console.log('📚 Documentation:\n');
  console.log('- Quick Setup: STRIPE_QUICK_SETUP.md');
  console.log('- Full Guide: STRIPE_IMPLEMENTATION_GUIDE.md');
  console.log('- Testing: SUBSCRIPTION_TESTING.md\n');

  rl.close();
}

function updateEnvVar(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  } else {
    return content.endsWith('\n') 
      ? `${content}${key}=${value}\n`
      : `${content}\n${key}=${value}\n`;
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
