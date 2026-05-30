// Generates Play Store listing graphics from the KickFix logo.
// Outputs:
//   - store-assets/icon-512.png        (Play Store high-res icon)
//   - store-assets/feature-1024x500.png (Play Store feature graphic)
// Run: node scripts/generate-store-assets.cjs

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.resolve(__dirname, '..', 'assets', 'Images', 'Logo1024x1024nontransparent.png');
const OUT = path.resolve(__dirname, '..', 'store-assets');
fs.mkdirSync(OUT, { recursive: true });

const BG = '#000000';
const RED = '#E53935';

async function makeIcon() {
  // 512x512 with logo centered on solid black background
  const logo = await sharp(SRC).resize(420, 420, { fit: 'contain' }).toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT, 'icon-512.png'));
  console.log('wrote icon-512.png');
}

async function makeFeatureGraphic() {
  // 1024 x 500 feature banner.
  // Layout: logo LEFT (centered vertically), text RIGHT with conservative widths
  // because system font fallback is much wider than Montserrat.
  const W = 1024, H = 500;

  const logoSize = 360;
  const logoLeft = 50;
  const logo = await sharp(SRC).resize(logoSize, logoSize, { fit: 'contain' }).toBuffer();

  // Text area starts at x=450, ends at x=1000 (safe right margin)
  // Use sans-serif at sizes that fit even in fallback fonts.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <g font-family="Impact, 'Arial Black', sans-serif" font-weight="900" text-anchor="start">
        <text x="450" y="230" font-size="90" letter-spacing="2" fill="#ffffff">KICK<tspan fill="${RED}">FIX</tspan></text>
      </g>
      <g font-family="Arial, sans-serif" font-weight="700" text-anchor="start" letter-spacing="1">
        <text x="450" y="290" font-size="22" fill="#ffffff">AI COACH FOR MARTIAL ARTS KICKS</text>
        <text x="450" y="335" font-size="22" fill="#c9c9c9">KICK . SCORE . IMPROVE . REPEAT</text>
      </g>
      <rect x="450" y="360" width="140" height="4" fill="${RED}"/>
    </svg>
  `;

  await sharp({
    create: { width: W, height: H, channels: 4, background: BG },
  })
    .composite([
      { input: logo, top: Math.round((H - logoSize) / 2), left: logoLeft },
      { input: Buffer.from(svg), top: 0, left: 0 },
    ])
    .png()
    .toFile(path.join(OUT, 'feature-1024x500.png'));
  console.log('wrote feature-1024x500.png');
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error('Source logo missing:', SRC);
    process.exit(1);
  }
  await makeIcon();
  await makeFeatureGraphic();
  console.log('\nDone. Files in:', OUT);
})();
