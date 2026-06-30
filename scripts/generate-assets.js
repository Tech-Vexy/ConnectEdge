#!/usr/bin/env node
// scripts/generate-assets.js
// Generates all required native assets:
//   assets/icon.png                — 1024×1024 app icon
//   assets/notification-icon.png  — 96×96 Android notification icon (white on transparent)
//   assets/adaptive-icon.png      — 1024×1024 adaptive icon foreground
//   assets/splash.png             — 1284×2778 splash screen
//
// Run: node scripts/generate-assets.js
// Requires: npm install sharp --save-dev

const sharp = require('sharp')
const path  = require('path')
const fs    = require('fs')

const ASSETS = path.join(__dirname, '../assets')
fs.mkdirSync(ASSETS, { recursive: true })

// Theme colours
const BG      = '#0D0D0F'
const ACCENT  = '#E8593C'
const WHITE   = '#F0EFE8'

// SVG for the app icon — "⊕" radar glyph on dark background
function appIconSvg(size) {
  const r  = size / 2
  const cr = r * 0.55
  const cr2 = r * 0.35
  const cr3 = r * 0.18
  return `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>
  <!-- Radar rings -->
  <circle cx="${r}" cy="${r}" r="${cr}"  fill="none" stroke="${ACCENT}" stroke-width="${size * 0.012}" opacity="0.25"/>
  <circle cx="${r}" cy="${r}" r="${cr2}" fill="none" stroke="${ACCENT}" stroke-width="${size * 0.014}" opacity="0.45"/>
  <circle cx="${r}" cy="${r}" r="${cr3}" fill="none" stroke="${ACCENT}" stroke-width="${size * 0.018}" opacity="0.7"/>
  <!-- Cross hairs -->
  <line x1="${r * 0.2}" y1="${r}" x2="${r * 1.8}" y2="${r}" stroke="${WHITE}" stroke-width="${size * 0.006}" opacity="0.12"/>
  <line x1="${r}" y1="${r * 0.2}" x2="${r}" y2="${r * 1.8}" stroke="${WHITE}" stroke-width="${size * 0.006}" opacity="0.12"/>
  <!-- Sweep line -->
  <line x1="${r}" y1="${r}" x2="${r + cr * 0.9}" y2="${r - cr * 0.2}"
        stroke="${ACCENT}" stroke-width="${size * 0.016}" stroke-linecap="round" opacity="0.9"/>
  <!-- Centre dot -->
  <circle cx="${r}" cy="${r}" r="${size * 0.038}" fill="${WHITE}"/>
  <!-- Match ping dot -->
  <circle cx="${r + cr2 * 0.7}" cy="${r - cr2 * 0.55}" r="${size * 0.032}" fill="${ACCENT}"/>
</svg>`
}

// Notification icon — simple white radar on transparent background
function notifIconSvg(size) {
  const r = size / 2
  const cr = r * 0.72
  return `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${r}" cy="${r}" r="${cr}"  fill="none" stroke="white" stroke-width="${size * 0.055}" opacity="0.4"/>
  <circle cx="${r}" cy="${r}" r="${cr * 0.6}" fill="none" stroke="white" stroke-width="${size * 0.065}" opacity="0.65"/>
  <line x1="${r}" y1="${r}" x2="${r + cr * 0.85}" y2="${r - cr * 0.22}"
        stroke="white" stroke-width="${size * 0.07}" stroke-linecap="round"/>
  <circle cx="${r}" cy="${r}" r="${size * 0.07}" fill="white"/>
</svg>`
}

// Splash — full-bleed dark with centred logo
function splashSvg(w, h) {
  const cx = w / 2
  const cy = h / 2
  const r  = Math.min(w, h) * 0.14
  return `
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 1.7}" fill="none" stroke="${ACCENT}" stroke-width="1.5" opacity="0.15"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 1.1}" fill="none" stroke="${ACCENT}" stroke-width="1.8" opacity="0.3"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.6}" fill="none" stroke="${ACCENT}" stroke-width="2.2" opacity="0.55"/>
  <line x1="${cx}" y1="${cy}" x2="${cx + r * 1.5}" y2="${cy - r * 0.38}"
        stroke="${ACCENT}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.11}" fill="${WHITE}"/>
  <text x="${cx}" y="${cy + r * 1.7}" font-family="System" font-weight="300"
        font-size="${r * 0.6}" fill="${WHITE}" text-anchor="middle" opacity="0.55">proxim</text>
</svg>`
}

async function generate() {
  console.log('Generating Proxim assets…')

  await sharp(Buffer.from(appIconSvg(1024)))
    .png().toFile(path.join(ASSETS, 'icon.png'))
  console.log('✓ icon.png')

  await sharp(Buffer.from(appIconSvg(1024)))
    .png().toFile(path.join(ASSETS, 'adaptive-icon.png'))
  console.log('✓ adaptive-icon.png')

  await sharp(Buffer.from(notifIconSvg(96)))
    .png().toFile(path.join(ASSETS, 'notification-icon.png'))
  console.log('✓ notification-icon.png (96×96, white on transparent)')

  await sharp(Buffer.from(splashSvg(1284, 2778)))
    .png().toFile(path.join(ASSETS, 'splash.png'))
  console.log('✓ splash.png')

  console.log('\nAll assets written to ./assets/')
  console.log('Run: npx expo prebuild --clean  to apply to native projects')
}

generate().catch(e => { console.error(e); process.exit(1) })
