// Generates all Android launcher icon assets from a single 1024x1024 source.
// Outputs: legacy + round mipmaps, adaptive foreground PNGs, adaptive XML wrappers,
// and ic_launcher_background color.
// Run: node scripts/generate-android-icons.cjs
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.resolve(__dirname, '..', 'assets', 'Images', 'Logo1024x1024nontransparent.png');
const RES = path.resolve(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const BG_COLOR = '#000000';

// Legacy icon sizes (square + round). Round uses same pixels, system masks it.
const LEGACY = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// Adaptive foreground sizes (108dp canvas, logo occupies inner 72dp safe zone).
// Foreground PNG is 108/108 of base size; logo content is centered at 66%.
const ADAPTIVE_FG = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

async function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function writeLegacy() {
  for (const [folder, size] of Object.entries(LEGACY)) {
    const dir = path.join(RES, folder);
    await ensureDir(dir);
    // Legacy icon: full bleed logo on solid background, then resize to target.
    const buf = await sharp({
      create: { width: 1024, height: 1024, channels: 4, background: BG_COLOR },
    })
      .composite([
        {
          input: await sharp(SRC).resize(820, 820, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer(),
          gravity: 'center',
        },
      ])
      .png()
      .toBuffer();
    const resized = await sharp(buf).resize(size, size).png().toBuffer();
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), resized);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), resized);
    console.log(`legacy ${folder}: ${size}x${size}`);
  }
}

async function writeAdaptiveForeground() {
  // Foreground is transparent; logo occupies center 66% (safe zone is inner 66dp of 108dp).
  for (const [folder, size] of Object.entries(ADAPTIVE_FG)) {
    const dir = path.join(RES, folder);
    await ensureDir(dir);
    const inner = Math.round(size * 0.6); // 60% of canvas for safety across all mask shapes
    const fg = await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: await sharp(SRC).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer(),
          gravity: 'center',
        },
      ])
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fg);
    console.log(`adaptive fg ${folder}: ${size}x${size}`);
  }
}

function writeAdaptiveXml() {
  const v26 = path.join(RES, 'mipmap-anydpi-v26');
  ensureDir(v26);
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  fs.writeFileSync(path.join(v26, 'ic_launcher.xml'), xml);
  fs.writeFileSync(path.join(v26, 'ic_launcher_round.xml'), xml);

  const valuesDir = path.join(RES, 'values');
  ensureDir(valuesDir);
  const colorXmlPath = path.join(valuesDir, 'ic_launcher_background.xml');
  fs.writeFileSync(
    colorXmlPath,
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG_COLOR}</color>
</resources>
`,
  );
  console.log('wrote adaptive XML + background color');
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error('Source logo not found:', SRC);
    process.exit(1);
  }
  await writeLegacy();
  await writeAdaptiveForeground();
  writeAdaptiveXml();
  console.log('\nDone. Rebuild the app to see the new icon.');
})();
