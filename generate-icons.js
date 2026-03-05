// Run once: node generate-icons.js
// Requires: npm install canvas (or: brew install pkg-config cairo pango libpng)
// Generates icon-192.png and icon-512.png

const { createCanvas } = require('canvas');
const fs = require('fs');

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size * 0.22;

  // Background
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#13131a');
  bg.addColorStop(1, '#0a0a0f');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, size, size, size * 0.22);
  ctx.fill();

  // Gate bars — accent color
  ctx.strokeStyle = '#4ecca3';
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = 'round';

  const pad   = size * 0.18;
  const top   = size * 0.22;
  const bot   = size * 0.78;
  const bars  = [0.28, 0.42, 0.58, 0.72];

  bars.forEach(x => {
    ctx.beginPath();
    ctx.moveTo(size * x, top);
    ctx.lineTo(size * x, bot);
    ctx.stroke();
  });

  // Top rail
  ctx.beginPath();
  ctx.moveTo(pad, top);
  ctx.lineTo(size - pad, top);
  ctx.stroke();

  // Bottom rail
  ctx.beginPath();
  ctx.moveTo(pad, bot);
  ctx.lineTo(size - pad, bot);
  ctx.stroke();

  return canvas.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

fs.writeFileSync('icon-192.png', makeIcon(192));
fs.writeFileSync('icon-512.png', makeIcon(512));
console.log('Generated icon-192.png and icon-512.png');
