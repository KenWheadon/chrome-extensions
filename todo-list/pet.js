/* VaporPet creature engine: swappable parts, mutations and SVG rendering. */
(function (global) {
  'use strict';

  const EXP_PER_LEVEL = 5;
  const OUT = '#1a0630';

  const PALETTES = [
    { name: 'Miami',  main: '#ff71ce', shade: '#c2449b', accent: '#01cdfe', eye: '#2a0a3a' },
    { name: 'Aqua',   main: '#01cdfe', shade: '#0583a6', accent: '#ff71ce', eye: '#1a0630' },
    { name: 'Mint',   main: '#05ffa1', shade: '#06a873', accent: '#b967ff', eye: '#1a0630' },
    { name: 'Lilac',  main: '#b967ff', shade: '#7b36c4', accent: '#fffb96', eye: '#1a0630' },
    { name: 'Peach',  main: '#ffb38a', shade: '#e0705a', accent: '#01cdfe', eye: '#2a0a3a' },
    { name: 'Chrome', main: '#e4e4fa', shade: '#9a9acb', accent: '#ff71ce', eye: '#1a0630' },
    { name: 'Lemon',  main: '#fffb96', shade: '#cfc35a', accent: '#b967ff', eye: '#2a0a3a' },
    { name: 'Void',   main: '#4b3484', shade: '#24174a', accent: '#05ffa1', eye: '#fffb96' }
  ];

  // Each slot unlocks at a stage; every level-up mutates one or more unlocked slots.
  const SLOTS = [
    { key: 'palette', label: 'Colour',    unlock: 1, variants: PALETTES.map(p => p.name) },
    { key: 'body',    label: 'Body',      unlock: 2, variants: ['blob', 'orb', 'cube', 'drop', 'ghost', 'bean', 'star', 'cloud'] },
    { key: 'eyes',    label: 'Eyes',      unlock: 2, variants: ['dot', 'anime', 'visor', 'cyclops', 'tri', 'sparkle', 'droopy', 'heart'] },
    { key: 'mouth',   label: 'Mouth',     unlock: 2, variants: ['smile', 'cat', 'open', 'fang', 'flat', 'tongue', 'o'] },
    { key: 'pattern', label: 'Pattern',   unlock: 3, variants: ['stripes', 'spots', 'grid', 'heart', 'glitch', 'none'] },
    { key: 'head',    label: 'Head',      unlock: 4, variants: ['cat ears', 'antenna', 'horns', 'bunny ears', 'halo', 'spikes', 'sprout', 'crown'] },
    { key: 'arms',    label: 'Arms',      unlock: 5, variants: ['nubs', 'wings', 'tentacles', 'robo', 'fins'] },
    { key: 'legs',    label: 'Legs',      unlock: 6, variants: ['stubs', 'long', 'hover', 'wheels', 'claws'] },
    { key: 'tail',    label: 'Tail',      unlock: 7, variants: ['fox', 'bolt', 'ribbon', 'devil'] },
    { key: 'acc',     label: 'Accessory', unlock: 8, variants: ['shades', 'bowtie', 'headphones', 'flower', 'monocle', 'scarf'] },
    { key: 'aura',    label: 'Aura',      unlock: 9, variants: ['rings', 'sparkles', 'cubes', 'hearts'] }
  ];

  const STAGES = [
    { name: 'Data Egg',          blurb: 'Something is loading…' },
    { name: 'Glitchling',        blurb: 'Hatched: body, eyes, mouth' },
    { name: 'Pixel Pup',         blurb: 'Unlocked patterns' },
    { name: 'Neon Sprite',       blurb: 'Unlocked head parts' },
    { name: 'Chrome Kid',        blurb: 'Unlocked arms' },
    { name: 'Synth Beast',       blurb: 'Unlocked legs' },
    { name: 'Mall Walker',       blurb: 'Unlocked tails' },
    { name: 'Dream Daemon',      blurb: 'Unlocked accessories' },
    { name: 'Hologram',          blurb: 'Unlocked auras' },
    { name: 'Cyber Seraph',      blurb: 'Started to glow' },
    { name: 'Astral Mainframe',  blurb: 'Began to levitate' },
    { name: 'ＡＥＳＴＨＥＴＩＣ', blurb: 'Final form, but it never stops mutating' }
  ];

  const TOP  = { blob: 1, orb: 1, cube: 1, drop: 1.35, ghost: 1, bean: 1.2, star: 1.1, cloud: 0.95 };
  const SIDE = { blob: 1, orb: 1, cube: 1, drop: 1, ghost: 1, bean: 0.85, star: 0.9, cloud: 1 };

  const levelOf = exp => Math.floor((exp || 0) / EXP_PER_LEVEL) + 1;
  const stageOf = exp => Math.min(12, levelOf(exp));
  const rand = a => a[Math.floor(Math.random() * a.length)];
  const slotOf = k => SLOTS.find(s => s.key === k);
  const paletteOf = name => PALETTES.find(p => p.name === name) || PALETTES[0];
  const f = n => Math.round(n * 10) / 10;

  function newPet(name) {
    return {
      name: name || 'PIXEL',
      exp: 0,
      dna: { palette: rand(SLOTS[0].variants) },
      log: [{ lv: 1, at: Date.now(), text: 'A data egg appeared.' }],
      born: Date.now(),
      lastDone: null
    };
  }

  function pickNew(slot, current) {
    const opts = slot.variants.filter(v => v !== current && !(current == null && v === 'none'));
    return rand(opts.length ? opts : slot.variants);
  }

  // Fill any missing/invalid unlocked parts (e.g. after importing an old pet).
  function ensureDna(pet) {
    const st = stageOf(pet.exp);
    pet.dna = pet.dna || {};
    for (const s of SLOTS) {
      if (s.unlock <= st && !s.variants.includes(pet.dna[s.key])) pet.dna[s.key] = pickNew(s, null);
    }
    pet.log = Array.isArray(pet.log) ? pet.log : [];
    return pet;
  }

  // Call right after exp reaches a multiple of EXP_PER_LEVEL.
  function levelUp(pet) {
    const lv = levelOf(pet.exp);
    const st = stageOf(pet.exp);
    const changes = [];
    const fresh = new Set();
    if (lv <= 12) {
      for (const s of SLOTS) {
        if (s.unlock === st && pet.dna[s.key] == null) {
          pet.dna[s.key] = pickNew(s, null);
          fresh.add(s.key);
          changes.push(`grew ${s.label.toLowerCase()}: ${pet.dna[s.key]}`);
        }
      }
    }
    const pool = SLOTS.filter(s => s.unlock <= st && !fresh.has(s.key));
    let n = Math.random() < 0.4 ? 2 : 1;
    if (lv === 2) n = 0;                       // hatching is change enough
    if (lv > 12) n = Math.random() < 0.5 ? 3 : 2; // post-final remixes
    for (let i = 0; i < n && pool.length; i++) {
      const s = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const old = pet.dna[s.key];
      pet.dna[s.key] = pickNew(s, old);
      changes.push(`${s.label.toLowerCase()}: ${old} → ${pet.dna[s.key]}`);
    }
    if (lv === 2) changes.unshift('hatched!');
    if (lv >= 10 && lv <= 12) changes.push(STAGES[st - 1].blurb.toLowerCase());
    const evolved = lv <= 12;
    const text = (evolved ? `Evolved into ${STAGES[st - 1].name}. ` : 'Mutated. ') + changes.join('; ');
    pet.log.push({ lv, at: Date.now(), text });
    if (pet.log.length > 300) pet.log = pet.log.slice(-300);
    return { lv, st, evolved, stageName: STAGES[st - 1].name, changes };
  }

  function moodOf(pet, now) {
    now = now || Date.now();
    if (!pet.lastDone) return { key: 'chill', label: 'chill ~' };
    const h = (now - pet.lastDone) / 3.6e6;
    if (h < 0.25) return { key: 'hyped', label: 'hyped ✦' };
    if (h < 6) return { key: 'happy', label: 'happy ♥' };
    if (h < 24) return { key: 'chill', label: 'chill ~' };
    if (h < 48) return { key: 'bored', label: 'bored …' };
    return { key: 'sleepy', label: 'sleepy zZ' };
  }

  /* ---------- SVG helpers ---------- */
  function heartPath(x, y, s) {
    return `M${f(x)} ${f(y + s * 0.9)} C${f(x - s * 1.4)} ${f(y - s * 0.1)} ${f(x - s * 0.6)} ${f(y - s * 1.2)} ${f(x)} ${f(y - s * 0.4)} C${f(x + s * 0.6)} ${f(y - s * 1.2)} ${f(x + s * 1.4)} ${f(y - s * 0.1)} ${f(x)} ${f(y + s * 0.9)}Z`;
  }
  function sparklePath(x, y, s) {
    return `M${f(x)} ${f(y - s)} Q${f(x)} ${f(y)} ${f(x + s)} ${f(y)} Q${f(x)} ${f(y)} ${f(x)} ${f(y + s)} Q${f(x)} ${f(y)} ${f(x - s)} ${f(y)} Q${f(x)} ${f(y)} ${f(x)} ${f(y - s)}Z`;
  }

  function bodyPath(type, cx, cy, r) {
    switch (type) {
      case 'orb':
        return `M${f(cx - r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 1 ${f(cx + r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 1 ${f(cx - r)} ${f(cy)}Z`;
      case 'cube': {
        const k = r * 0.32;
        return `M${f(cx - r + k)} ${f(cy - r)} H${f(cx + r - k)} Q${f(cx + r)} ${f(cy - r)} ${f(cx + r)} ${f(cy - r + k)} V${f(cy + r - k)} Q${f(cx + r)} ${f(cy + r)} ${f(cx + r - k)} ${f(cy + r)} H${f(cx - r + k)} Q${f(cx - r)} ${f(cy + r)} ${f(cx - r)} ${f(cy + r - k)} V${f(cy - r + k)} Q${f(cx - r)} ${f(cy - r)} ${f(cx - r + k)} ${f(cy - r)}Z`;
      }
      case 'drop':
        return `M${f(cx)} ${f(cy - r * 1.35)} C${f(cx + r * 0.35)} ${f(cy - r * 0.8)} ${f(cx + r)} ${f(cy - r * 0.4)} ${f(cx + r)} ${f(cy)} A${f(r)} ${f(r)} 0 0 1 ${f(cx - r)} ${f(cy)} C${f(cx - r)} ${f(cy - r * 0.4)} ${f(cx - r * 0.35)} ${f(cy - r * 0.8)} ${f(cx)} ${f(cy - r * 1.35)}Z`;
      case 'ghost':
        return `M${f(cx - r)} ${f(cy + r)} L${f(cx - r)} ${f(cy)} A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${f(cy)} L${f(cx + r)} ${f(cy + r)} Q${f(cx + r * 0.66)} ${f(cy + r * 0.7)} ${f(cx + r * 0.33)} ${f(cy + r)} Q${f(cx)} ${f(cy + r * 0.7)} ${f(cx - r * 0.33)} ${f(cy + r)} Q${f(cx - r * 0.66)} ${f(cy + r * 0.7)} ${f(cx - r)} ${f(cy + r)}Z`;
      case 'bean': {
        const rx = r * 0.85, ry = r * 1.1, c = cy - r * 0.1;
        return `M${f(cx - rx)} ${f(c)} A${f(rx)} ${f(ry)} 0 1 1 ${f(cx + rx)} ${f(c)} A${f(rx)} ${f(ry)} 0 1 1 ${f(cx - rx)} ${f(c)}Z`;
      }
      case 'star': {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 5;
          const rr = i % 2 ? r * 0.72 : r * 1.12;
          pts.push(`${f(cx + Math.cos(a) * rr)} ${f(cy + 0.08 * r + Math.sin(a) * rr)}`);
        }
        return 'M' + pts.join(' L') + 'Z';
      }
      case 'cloud':
        return `M${f(cx - r)} ${f(cy + r * 0.6)} A${f(r * 0.45)} ${f(r * 0.45)} 0 0 1 ${f(cx - r * 0.6)} ${f(cy - r * 0.1)} A${f(r * 0.5)} ${f(r * 0.5)} 0 0 1 ${f(cx)} ${f(cy - r * 0.7)} A${f(r * 0.5)} ${f(r * 0.5)} 0 0 1 ${f(cx + r * 0.6)} ${f(cy - r * 0.1)} A${f(r * 0.45)} ${f(r * 0.45)} 0 0 1 ${f(cx + r)} ${f(cy + r * 0.6)} Q${f(cx + r)} ${f(cy + r)} ${f(cx + r * 0.6)} ${f(cy + r)} L${f(cx - r * 0.6)} ${f(cy + r)} Q${f(cx - r)} ${f(cy + r)} ${f(cx - r)} ${f(cy + r * 0.6)}Z`;
      case 'blob':
      default:
        return `M${f(cx - r)} ${f(cy + r * 0.45)} C${f(cx - r * 1.05)} ${f(cy - r * 0.6)} ${f(cx - r * 0.55)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} C${f(cx + r * 0.6)} ${f(cy - r)} ${f(cx + r * 1.05)} ${f(cy - r * 0.55)} ${f(cx + r)} ${f(cy + r * 0.45)} C${f(cx + r * 0.95)} ${f(cy + r)} ${f(cx + r * 0.5)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} C${f(cx - r * 0.5)} ${f(cy + r)} ${f(cx - r * 0.95)} ${f(cy + r)} ${f(cx - r)} ${f(cy + r * 0.45)}Z`;
    }
  }

  /* ---------- Scene ---------- */
  function scene(id) {
    const stars = [[18, 14], [40, 30], [70, 10], [130, 18], [160, 34], [184, 12], [12, 52], [188, 60], [100, 8], [150, 6]]
      .map(([x, y], i) => `<circle class="twinkle" style="animation-delay:${i * 0.37}s" cx="${x}" cy="${y}" r="${i % 3 ? 0.7 : 1.1}" fill="#fff"/>`).join('');
    const stripes = [0, 1, 2, 3, 4].map(i => `<rect x="0" y="${84 + i * 6}" width="200" height="${f(0.8 + i * 0.9)}" fill="#000"/>`).join('');
    let grid = '';
    for (let i = -7; i <= 7; i++) grid += `<line x1="${100 + i * 6}" y1="112" x2="${100 + i * 34}" y2="150"/>`;
    let hz = '';
    for (let k = 1; k <= 6; k++) hz += `<line x1="0" y1="${f(112 + k * k * 1.05)}" x2="200" y2="${f(112 + k * k * 1.05)}"/>`;
    return `
      <defs>
        <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120430"/><stop offset=".6" stop-color="#46136e"/><stop offset="1" stop-color="#ff5fc0"/></linearGradient>
        <linearGradient id="${id}sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffb96"/><stop offset=".55" stop-color="#ff9a6a"/><stop offset="1" stop-color="#ff3fa4"/></linearGradient>
        <linearGradient id="${id}floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b0b4f"/><stop offset="1" stop-color="#0d0322"/></linearGradient>
        <mask id="${id}sunm"><rect width="200" height="150" fill="#fff"/>${stripes}</mask>
      </defs>
      <rect width="200" height="150" fill="url(#${id}sky)"/>
      ${stars}
      <circle cx="100" cy="92" r="38" fill="url(#${id}sun)" mask="url(#${id}sunm)" opacity=".95"/>
      <rect y="112" width="200" height="38" fill="url(#${id}floor)"/>
      <g stroke="#ff71ce" stroke-width=".6" opacity=".55">${grid}</g>
      <g class="gridscroll" stroke="#01cdfe" stroke-width=".6" opacity=".5">${hz}</g>
      <line x1="0" y1="112" x2="200" y2="112" stroke="#ff9ad5" stroke-width="1"/>`;
  }

  /* ---------- Egg ---------- */
  function egg(pet, P, id, mood) {
    const p = (pet.exp || 0) % EXP_PER_LEVEL;
    const cracks = [
      'M92 100 l4 4 l-3 4 l5 3',
      'M108 96 l-3 5 l4 3 l-2 5',
      'M84 116 l5 -2 l2 4 l5 -3',
      'M112 114 l-4 3 l3 4 l-5 2'
    ].slice(0, p).map(d => `<path d="${d}" stroke="${OUT}" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    const sleepy = mood.key === 'sleepy' ? `<text class="zz" x="120" y="92" fill="#fff" font-size="9" font-family="monospace">z Z</text>` : '';
    return `
      <defs><linearGradient id="${id}egg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.main}"/><stop offset="1" stop-color="${P.shade}"/></linearGradient>
      <clipPath id="${id}eggc"><path d="M100 86 C116 86 121 110 121 120 C121 130 111 135 100 135 C89 135 79 130 79 120 C79 110 84 86 100 86Z"/></clipPath></defs>
      <ellipse cx="100" cy="136" rx="20" ry="3" fill="#000" opacity=".35"/>
      <g class="wobble" style="transform-origin:100px 134px">
        <path d="M100 86 C116 86 121 110 121 120 C121 130 111 135 100 135 C89 135 79 130 79 120 C79 110 84 86 100 86Z" fill="url(#${id}egg)" stroke="${OUT}" stroke-width="2"/>
        <g clip-path="url(#${id}eggc)">
          <polyline points="76,114 84,108 92,114 100,108 108,114 116,108 124,114" fill="none" stroke="${P.accent}" stroke-width="4"/>
          <circle cx="90" cy="125" r="3" fill="${P.accent}" opacity=".6"/><circle cx="111" cy="98" r="2.5" fill="#fff" opacity=".5"/>
          <ellipse cx="92" cy="96" rx="4" ry="7" fill="#fff" opacity=".3" transform="rotate(20 92 96)"/>
        </g>
        ${cracks}
      </g>${sleepy}`;
  }

  /* ---------- Creature ---------- */
  function creature(pet, mood, id) {
    const d = pet.dna;
    const P = paletteOf(d.palette);
    const st = stageOf(pet.exp);
    if (st === 1) return egg(pet, P, id, mood);

    const r = 17 + st * 1.7;
    const cx = 100;
    const ground = 134;
    const legs = st >= 6 ? d.legs : null;
    const legH = !legs ? 0 : legs === 'long' ? r * 0.45 : legs === 'hover' ? r * 0.4 : legs === 'wheels' ? r * 0.28 : r * 0.2;
    const cy = ground - legH - r;
    const body = d.body || 'blob';
    const ty = cy - r * (TOP[body] || 1);
    const side = SIDE[body] || 1;
    const bp = bodyPath(body, cx, cy, r);
    const stroke = `stroke="${OUT}" stroke-width="2" stroke-linejoin="round"`;

    const back = [];
    const front = [];

    /* aura */
    if (st >= 9 && d.aura) {
      if (d.aura === 'rings') {
        back.push(`<g class="spin" style="transform-origin:${cx}px ${f(cy)}px"><ellipse cx="${cx}" cy="${f(cy)}" rx="${f(r * 1.6)}" ry="${f(r * 0.42)}" fill="none" stroke="${P.accent}" stroke-width="1.3" opacity=".7" transform="rotate(-14 ${cx} ${f(cy)})"/><ellipse cx="${cx}" cy="${f(cy)}" rx="${f(r * 1.45)}" ry="${f(r * 0.35)}" fill="none" stroke="#fffb96" stroke-width="1" opacity=".5" transform="rotate(18 ${cx} ${f(cy)})"/></g>`);
      } else if (d.aura === 'sparkles') {
        const pos = [[-1.4, -0.9], [1.35, -1.1], [-1.6, 0.4], [1.55, 0.3], [-0.6, -1.6], [0.8, -1.55]];
        back.push(pos.map(([x, y], i) => `<path class="twinkle" style="animation-delay:${i * 0.3}s" d="${sparklePath(cx + x * r, cy + y * r, r * 0.13)}" fill="#fffb96"/>`).join(''));
      } else if (d.aura === 'cubes') {
        let cubes = '';
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2;
          const x = cx + Math.cos(a) * r * 1.5, y = cy + Math.sin(a) * r * 1.5;
          cubes += `<rect x="${f(x - 3)}" y="${f(y - 3)}" width="6" height="6" fill="none" stroke="${P.accent}" stroke-width="1.2" transform="rotate(45 ${f(x)} ${f(y)})"/>`;
        }
        back.push(`<g class="spin slow" style="transform-origin:${cx}px ${f(cy)}px">${cubes}</g>`);
      } else if (d.aura === 'hearts') {
        const xs = [-1.3, 1.2, -0.9, 1.5, 0.2];
        back.push(xs.map((x, i) => `<path class="rise" style="animation-delay:${i * 0.7}s" d="${heartPath(cx + x * r, cy + r * 0.3, r * 0.11)}" fill="#ff71ce"/>`).join(''));
      }
    }

    /* tail */
    if (st >= 7 && d.tail) {
      const tx = cx + r * 0.8 * side, tyy = cy + r * 0.45;
      let t = '';
      if (d.tail === 'fox') {
        t = `<path d="M${f(tx - r * 0.15)} ${f(tyy)} Q${f(tx + r * 0.7)} ${f(tyy + r * 0.15)} ${f(tx + r * 0.62)} ${f(tyy - r * 0.7)} Q${f(tx + r * 0.95)} ${f(tyy - r * 0.2)} ${f(tx + r * 0.78)} ${f(tyy + r * 0.18)} Q${f(tx + r * 0.4)} ${f(tyy + r * 0.48)} ${f(tx - r * 0.15)} ${f(tyy + r * 0.32)}Z" fill="${P.main}" ${stroke}/><circle cx="${f(tx + r * 0.66)}" cy="${f(tyy - r * 0.55)}" r="${f(r * 0.13)}" fill="#fff" stroke="${OUT}" stroke-width="1.2"/>`;
      } else if (d.tail === 'bolt') {
        const pts = [[-0.1, 0.1], [0.45, -0.12], [0.3, -0.32], [0.8, -0.62], [0.55, -0.25], [0.7, -0.28], [0.1, 0.25]];
        t = `<polygon points="${pts.map(([x, y]) => `${f(tx + x * r)},${f(tyy + y * r)}`).join(' ')}" fill="#fffb96" ${stroke}/>`;
      } else if (d.tail === 'ribbon') {
        t = `<path d="M${f(tx - r * 0.1)} ${f(tyy)} C${f(tx + r * 0.5)} ${f(tyy - r * 0.35)} ${f(tx + r * 0.3)} ${f(tyy + r * 0.45)} ${f(tx + r * 0.85)} ${f(tyy + r * 0.05)}" fill="none" stroke="${OUT}" stroke-width="${f(r * 0.16)}" stroke-linecap="round"/><path d="M${f(tx - r * 0.1)} ${f(tyy)} C${f(tx + r * 0.5)} ${f(tyy - r * 0.35)} ${f(tx + r * 0.3)} ${f(tyy + r * 0.45)} ${f(tx + r * 0.85)} ${f(tyy + r * 0.05)}" fill="none" stroke="${P.accent}" stroke-width="${f(r * 0.1)}" stroke-linecap="round"/>`;
      } else if (d.tail === 'devil') {
        const ex = tx + r * 0.62, ey = tyy - r * 0.4;
        t = `<path d="M${f(tx - r * 0.1)} ${f(tyy)} Q${f(tx + r * 0.65)} ${f(tyy + r * 0.3)} ${f(ex)} ${f(ey)}" fill="none" stroke="${OUT}" stroke-width="2.2"/><path d="M${f(ex)} ${f(ey - r * 0.25)} L${f(ex + r * 0.17)} ${f(ey + r * 0.05)} L${f(ex)} ${f(ey)} L${f(ex - r * 0.17)} ${f(ey + r * 0.05)}Z" fill="${P.accent}" ${stroke}/>`;
      }
      back.push(`<g class="wag" style="transform-origin:${f(tx)}px ${f(tyy)}px">${t}</g>`);
    }

    /* head parts that sit behind the body */
    const head = st >= 4 ? d.head : null;
    if (head === 'cat ears') {
      for (const s of [-1, 1]) {
        back.push(`<polygon points="${f(cx + s * r * 0.8)},${f(ty + r * 0.5)} ${f(cx + s * r * 0.58)},${f(ty - r * 0.35)} ${f(cx + s * r * 0.12)},${f(ty + r * 0.22)}" fill="${P.main}" ${stroke}/><polygon points="${f(cx + s * r * 0.66)},${f(ty + r * 0.3)} ${f(cx + s * r * 0.56)},${f(ty - r * 0.12)} ${f(cx + s * r * 0.32)},${f(ty + r * 0.2)}" fill="${P.accent}"/>`);
      }
    } else if (head === 'bunny ears') {
      for (const s of [-1, 1]) {
        const ex = cx + s * r * 0.36, ey = ty - r * 0.3;
        back.push(`<g transform="rotate(${s * 14} ${f(ex)} ${f(ey + r * 0.5)})"><ellipse cx="${f(ex)}" cy="${f(ey)}" rx="${f(r * 0.19)}" ry="${f(r * 0.58)}" fill="${P.main}" ${stroke}/><ellipse cx="${f(ex)}" cy="${f(ey)}" rx="${f(r * 0.08)}" ry="${f(r * 0.4)}" fill="${P.accent}"/></g>`);
      }
    } else if (head === 'spikes') {
      [[-0.42, 0.75], [0, 1], [0.42, 0.75]].forEach(([x, h]) => {
        const sx = cx + x * r;
        back.push(`<polygon points="${f(sx - r * 0.2)},${f(ty + r * 0.35)} ${f(sx)},${f(ty - r * 0.42 * h)} ${f(sx + r * 0.2)},${f(ty + r * 0.35)}" fill="${P.accent}" ${stroke}/>`);
      });
    }

    /* arms (behind body) */
    const arms = st >= 5 ? d.arms : null;
    if (arms) {
      const ay = cy + r * 0.12;
      for (const s of [-1, 1]) {
        const ax = cx + s * r * 0.92 * side;
        let a = '';
        if (arms === 'nubs') {
          a = `<ellipse cx="${f(ax + s * r * 0.12)}" cy="${f(ay + r * 0.1)}" rx="${f(r * 0.24)}" ry="${f(r * 0.15)}" transform="rotate(${s * 25} ${f(ax + s * r * 0.12)} ${f(ay + r * 0.1)})" fill="${P.main}" ${stroke}/>`;
        } else if (arms === 'wings') {
          a = `<path d="M${f(ax - s * r * 0.1)} ${f(ay - r * 0.25)} Q${f(ax + s * r * 0.9)} ${f(ay - r * 1.05)} ${f(ax + s * r * 1.05)} ${f(ay - r * 0.3)} Q${f(ax + s * r * 0.72)} ${f(ay - r * 0.22)} ${f(ax + s * r * 0.78)} ${f(ay + r * 0.08)} Q${f(ax + s * r * 0.45)} ${f(ay)} ${f(ax + s * r * 0.4)} ${f(ay + r * 0.28)} Q${f(ax + s * r * 0.15)} ${f(ay + r * 0.1)} ${f(ax - s * r * 0.1)} ${f(ay + r * 0.2)}Z" fill="${P.accent}" fill-opacity=".8" ${stroke}/>`;
          a = `<g class="flap" style="--s:${s};transform-origin:${f(ax)}px ${f(ay)}px">${a}</g>`;
        } else if (arms === 'tentacles') {
          const dd = `M${f(ax - s * r * 0.1)} ${f(ay)} Q${f(ax + s * r * 0.55)} ${f(ay + r * 0.05)} ${f(ax + s * r * 0.45)} ${f(ay + r * 0.45)} T${f(ax + s * r * 0.8)} ${f(ay + r * 0.8)}`;
          a = `<path d="${dd}" fill="none" stroke="${OUT}" stroke-width="${f(r * 0.24)}" stroke-linecap="round"/><path d="${dd}" fill="none" stroke="${P.main}" stroke-width="${f(r * 0.16)}" stroke-linecap="round"/>`;
          a = `<g class="flap slow" style="--s:${s};transform-origin:${f(ax)}px ${f(ay)}px">${a}</g>`;
        } else if (arms === 'robo') {
          const ex = ax + s * r * 0.5, ey = ay + r * 0.3;
          a = `<line x1="${f(ax - s * r * 0.1)}" y1="${f(ay)}" x2="${f(ex)}" y2="${f(ey)}" stroke="${OUT}" stroke-width="${f(r * 0.2)}" stroke-linecap="round"/><line x1="${f(ax - s * r * 0.1)}" y1="${f(ay)}" x2="${f(ex)}" y2="${f(ey)}" stroke="#c9c9e8" stroke-width="${f(r * 0.12)}" stroke-linecap="round"/><path d="M${f(ex + s * r * 0.05)} ${f(ey - r * 0.14)} A${f(r * 0.14)} ${f(r * 0.14)} 0 1 ${s > 0 ? 1 : 0} ${f(ex + s * r * 0.05)} ${f(ey + r * 0.14)}" fill="none" stroke="${OUT}" stroke-width="2"/>`;
        } else if (arms === 'fins') {
          a = `<polygon points="${f(ax - s * r * 0.1)},${f(ay - r * 0.22)} ${f(ax + s * r * 0.58)},${f(ay + r * 0.06)} ${f(ax - s * r * 0.1)},${f(ay + r * 0.32)}" fill="${P.accent}" ${stroke}/>`;
        }
        back.push(a);
      }
    }

    /* legs (behind body) */
    if (legs) {
      const top = cy + r * 0.6;
      for (const s of [-1, 1]) {
        const lx = cx + s * r * 0.42;
        if (legs === 'stubs' || legs === 'claws') {
          back.push(`<rect x="${f(lx - r * 0.15)}" y="${f(top)}" width="${f(r * 0.3)}" height="${f(ground - top)}" rx="${f(r * 0.12)}" fill="${P.shade}" ${stroke}/>`);
          if (legs === 'claws') back.push([-1, 0, 1].map(k => `<circle cx="${f(lx + k * r * 0.11)}" cy="${f(ground)}" r="${f(r * 0.06)}" fill="#fff" stroke="${OUT}" stroke-width="1"/>`).join(''));
        } else if (legs === 'long') {
          back.push(`<line x1="${f(lx * 0.95 + cx * 0.05)}" y1="${f(top)}" x2="${f(lx)}" y2="${f(ground - 1)}" stroke="${OUT}" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="${f(lx + s * r * 0.05)}" cy="${f(ground - 1)}" rx="${f(r * 0.15)}" ry="${f(r * 0.07)}" fill="${P.accent}" stroke="${OUT}" stroke-width="1.4"/>`);
        } else if (legs === 'wheels') {
          const wy = ground - r * 0.16;
          back.push(`<line x1="${f(lx)}" y1="${f(top)}" x2="${f(lx)}" y2="${f(wy)}" stroke="${OUT}" stroke-width="2.4"/><g class="spin fast" style="transform-origin:${f(lx)}px ${f(wy)}px"><circle cx="${f(lx)}" cy="${f(wy)}" r="${f(r * 0.16)}" fill="${OUT}"/><line x1="${f(lx - r * 0.1)}" y1="${f(wy)}" x2="${f(lx + r * 0.1)}" y2="${f(wy)}" stroke="${P.accent}" stroke-width="1.5"/></g>`);
        }
      }
      if (legs === 'hover') {
        back.push(`<g class="pulse"><ellipse cx="${cx}" cy="${f(ground - 2)}" rx="${f(r * 0.65)}" ry="3" fill="${P.accent}" opacity=".55"/><polygon points="${f(cx - r * 0.3)},${f(cy + r * 0.85)} ${f(cx - r * 0.15)},${f(ground - 4)} ${f(cx)},${f(cy + r * 0.85)}" fill="#fffb96" opacity=".8"/><polygon points="${f(cx)},${f(cy + r * 0.85)} ${f(cx + r * 0.15)},${f(ground - 4)} ${f(cx + r * 0.3)},${f(cy + r * 0.85)}" fill="#fffb96" opacity=".8"/></g>`);
      }
    }

    /* pattern + shine, clipped to the body */
    const clipId = `${id}body`;
    let pat = '';
    const pattern = st >= 3 ? d.pattern : null;
    if (pattern === 'stripes') {
      for (let i = -3; i <= 3; i++) pat += `<rect x="${f(cx - r * 1.5)}" y="${f(cy + i * r * 0.36)}" width="${f(r * 3)}" height="${f(r * 0.13)}" fill="${P.shade}" opacity=".6"/>`;
    } else if (pattern === 'spots') {
      pat = [[-0.55, -0.45, 0.15], [0.5, -0.15, 0.12], [-0.25, 0.5, 0.18], [0.6, 0.55, 0.1], [0.1, -0.75, 0.1], [-0.8, 0.15, 0.1]]
        .map(([x, y, s]) => `<circle cx="${f(cx + x * r)}" cy="${f(cy + y * r)}" r="${f(s * r)}" fill="${P.accent}" opacity=".5"/>`).join('');
    } else if (pattern === 'grid') {
      for (let i = -4; i <= 4; i++) {
        pat += `<line x1="${f(cx + i * r * 0.3)}" y1="${f(cy - r * 1.5)}" x2="${f(cx + i * r * 0.3)}" y2="${f(cy + r * 1.5)}"/><line x1="${f(cx - r * 1.5)}" y1="${f(cy + i * r * 0.3)}" x2="${f(cx + r * 1.5)}" y2="${f(cy + i * r * 0.3)}"/>`;
      }
      pat = `<g stroke="${P.accent}" stroke-width=".8" opacity=".4">${pat}</g>`;
    } else if (pattern === 'heart') {
      pat = `<path d="${heartPath(cx, cy + r * 0.62, r * 0.2)}" fill="${P.accent}" opacity=".75"/>`;
    } else if (pattern === 'glitch') {
      pat = `<g class="glitch">${[[-1.2, -0.35, 1.4, 0.09, '#01cdfe'], [-0.2, 0.18, 1.5, 0.07, '#ff71ce'], [-0.9, 0.6, 1.1, 0.08, '#fffb96']]
        .map(([x, y, w, h, c]) => `<rect x="${f(cx + x * r)}" y="${f(cy + y * r)}" width="${f(w * r)}" height="${f(h * r)}" fill="${c}" opacity=".75"/>`).join('')}</g>`;
    }
    let scarf = '';
    const acc = st >= 8 ? d.acc : null;
    if (acc === 'scarf') {
      scarf = `<rect x="${f(cx - r * 1.3)}" y="${f(cy + r * 0.42)}" width="${f(r * 2.6)}" height="${f(r * 0.24)}" fill="${P.accent}" stroke="${OUT}" stroke-width="1.5"/><g stroke="#fff" stroke-width="1.2" opacity=".6">${[-0.6, -0.2, 0.2, 0.6].map(x => `<line x1="${f(cx + x * r)}" y1="${f(cy + r * 0.44)}" x2="${f(cx + x * r)}" y2="${f(cy + r * 0.64)}"/>`).join('')}</g>`;
    }
    const shine = `<ellipse cx="${f(cx - r * 0.4)}" cy="${f(cy - r * 0.5)}" rx="${f(r * 0.24)}" ry="${f(r * 0.13)}" fill="#fff" opacity=".28" transform="rotate(-32 ${f(cx - r * 0.4)} ${f(cy - r * 0.5)})"/>`;

    const bodySvg = `
      <defs>
        <linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.main}"/><stop offset="1" stop-color="${P.shade}"/></linearGradient>
        <clipPath id="${clipId}"><path d="${bp}"/></clipPath>
      </defs>
      <path d="${bp}" fill="url(#${id}bg)"/>
      <g clip-path="url(#${clipId})">${pat}${scarf}${shine}</g>
      <path d="${bp}" fill="none" ${stroke}/>`;

    /* front head parts */
    if (head === 'antenna') {
      front.push(`<path d="M${cx} ${f(ty + 2)} Q${f(cx + r * 0.05)} ${f(ty - r * 0.3)} ${f(cx + r * 0.2)} ${f(ty - r * 0.52)}" fill="none" stroke="${OUT}" stroke-width="2"/><circle class="pulse" cx="${f(cx + r * 0.2)}" cy="${f(ty - r * 0.55)}" r="${f(r * 0.13)}" fill="${P.accent}" stroke="${OUT}" stroke-width="1.5"/>`);
    } else if (head === 'horns') {
      for (const s of [-1, 1]) {
        front.push(`<path d="M${f(cx + s * r * 0.42)} ${f(ty + r * 0.22)} Q${f(cx + s * r * 0.55)} ${f(ty - r * 0.35)} ${f(cx + s * r * 0.88)} ${f(ty - r * 0.45)} Q${f(cx + s * r * 0.6)} ${f(ty - r * 0.08)} ${f(cx + s * r * 0.68)} ${f(ty + r * 0.32)}Z" fill="#fff6e0" ${stroke}/>`);
      }
    } else if (head === 'halo') {
      front.push(`<ellipse class="pulse" cx="${cx}" cy="${f(ty - r * 0.32)}" rx="${f(r * 0.55)}" ry="${f(r * 0.14)}" fill="none" stroke="#fffb96" stroke-width="3" style="filter:drop-shadow(0 0 3px #fffb96)"/>`);
    } else if (head === 'sprout') {
      front.push(`<path d="M${cx} ${f(ty + 2)} L${cx} ${f(ty - r * 0.35)}" stroke="${OUT}" stroke-width="2"/><ellipse cx="${f(cx - r * 0.18)}" cy="${f(ty - r * 0.4)}" rx="${f(r * 0.2)}" ry="${f(r * 0.1)}" transform="rotate(-30 ${f(cx - r * 0.18)} ${f(ty - r * 0.4)})" fill="#05ffa1" stroke="${OUT}" stroke-width="1.5"/><ellipse cx="${f(cx + r * 0.18)}" cy="${f(ty - r * 0.42)}" rx="${f(r * 0.2)}" ry="${f(r * 0.1)}" transform="rotate(30 ${f(cx + r * 0.18)} ${f(ty - r * 0.42)})" fill="#05ffa1" stroke="${OUT}" stroke-width="1.5"/>`);
    } else if (head === 'crown') {
      const y0 = ty + r * 0.12;
      front.push(`<polygon points="${f(cx - r * 0.45)},${f(y0)} ${f(cx - r * 0.45)},${f(y0 - r * 0.42)} ${f(cx - r * 0.22)},${f(y0 - r * 0.2)} ${cx},${f(y0 - r * 0.52)} ${f(cx + r * 0.22)},${f(y0 - r * 0.2)} ${f(cx + r * 0.45)},${f(y0 - r * 0.42)} ${f(cx + r * 0.45)},${f(y0)}" fill="#ffd84d" ${stroke}/><circle cx="${cx}" cy="${f(y0 - r * 0.15)}" r="${f(r * 0.08)}" fill="${P.accent}"/>`);
    }

    /* eyes */
    const ey = cy - r * 0.12, dx = r * 0.36, e = r * 0.15;
    let eyes = '';
    const pupil = (x, y, s) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="${P.eye}"/><circle cx="${f(x + s * 0.35)}" cy="${f(y - s * 0.35)}" r="${f(s * 0.35)}" fill="#fff"/>`;
    if (mood.key === 'sleepy') {
      eyes = [-1, 1].map(s => `<path d="M${f(cx + s * dx - e)} ${f(ey)} Q${f(cx + s * dx)} ${f(ey + e * 0.9)} ${f(cx + s * dx + e)} ${f(ey)}" fill="none" stroke="${OUT}" stroke-width="2" stroke-linecap="round"/>`).join('');
    } else if (mood.key === 'hyped') {
      eyes = [-1, 1].map(s => `<path d="M${f(cx + s * dx - e)} ${f(ey + e * 0.45)} L${f(cx + s * dx)} ${f(ey - e * 0.45)} L${f(cx + s * dx + e)} ${f(ey + e * 0.45)}" fill="none" stroke="${OUT}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    } else {
      switch (d.eyes) {
        case 'anime':
          eyes = [-1, 1].map(s => { const x = cx + s * dx; return `<ellipse cx="${f(x)}" cy="${f(ey)}" rx="${f(e * 0.85)}" ry="${f(e * 1.25)}" fill="${P.eye}"/><ellipse cx="${f(x)}" cy="${f(ey + e * 0.45)}" rx="${f(e * 0.55)}" ry="${f(e * 0.5)}" fill="${P.accent}" opacity=".85"/><circle cx="${f(x - e * 0.25)}" cy="${f(ey - e * 0.45)}" r="${f(e * 0.35)}" fill="#fff"/><circle cx="${f(x + e * 0.3)}" cy="${f(ey + e * 0.1)}" r="${f(e * 0.15)}" fill="#fff"/>`; }).join('');
          break;
        case 'visor':
          eyes = `<rect x="${f(cx - r * 0.66)}" y="${f(ey - e * 0.95)}" width="${f(r * 1.32)}" height="${f(e * 1.9)}" rx="${f(e * 0.95)}" fill="${OUT}" stroke="${OUT}" stroke-width="1.5"/><rect class="scan" x="${f(cx - r * 0.58)}" y="${f(ey - e * 0.2)}" width="${f(r * 1.16)}" height="${f(e * 0.4)}" fill="${P.accent}" opacity=".35"/>` +
            [-1, 1].map(s => `<ellipse cx="${f(cx + s * dx)}" cy="${f(ey)}" rx="${f(e * 0.5)}" ry="${f(e * 0.35)}" fill="${P.accent}" style="filter:drop-shadow(0 0 2px ${P.accent})"/>`).join('');
          break;
        case 'cyclops':
          eyes = `<circle cx="${cx}" cy="${f(ey)}" r="${f(e * 1.75)}" fill="#fff" stroke="${OUT}" stroke-width="1.8"/><circle cx="${cx}" cy="${f(ey)}" r="${f(e * 1.05)}" fill="${P.accent}"/>${pupil(cx, ey, e * 0.55)}`;
          break;
        case 'tri':
          eyes = pupil(cx - dx, ey, e * 0.7) + pupil(cx + dx, ey, e * 0.7) + pupil(cx, ey - e * 1.7, e * 0.55);
          break;
        case 'sparkle':
          eyes = [-1, 1].map(s => `<path d="${sparklePath(cx + s * dx, ey, e * 1.3)}" fill="#fff" stroke="${P.eye}" stroke-width="1.4" stroke-linejoin="round"/>`).join('');
          break;
        case 'droopy':
          eyes = [-1, 1].map(s => { const x = cx + s * dx; return `<circle cx="${f(x)}" cy="${f(ey)}" r="${f(e * 0.85)}" fill="${P.eye}"/><path d="M${f(x - e * 0.95)} ${f(ey + 0.5)} A${f(e * 0.95)} ${f(e * 0.95)} 0 0 1 ${f(x + e * 0.95)} ${f(ey + 0.5)}Z" fill="${P.main}"/><line x1="${f(x - e)}" y1="${f(ey + 0.5)}" x2="${f(x + e)}" y2="${f(ey + 0.5)}" stroke="${OUT}" stroke-width="1.6" stroke-linecap="round"/>`; }).join('');
          break;
        case 'heart':
          eyes = [-1, 1].map(s => `<path d="${heartPath(cx + s * dx, ey, e * 0.95)}" fill="#ff3f8e" stroke="${OUT}" stroke-width="1"/>`).join('');
          break;
        case 'dot':
        default:
          eyes = pupil(cx - dx, ey, e * 0.75) + pupil(cx + dx, ey, e * 0.75);
      }
    }
    front.push(`<g class="blink" style="transform-origin:${cx}px ${f(ey)}px">${eyes}</g>`);

    /* mouth */
    const my = cy + r * 0.28, w = r * 0.22;
    let mouth = d.mouth;
    if (mood.key === 'bored') mouth = 'flat';
    if (mood.key === 'sleepy') mouth = 'o';
    if (mood.key === 'hyped') mouth = 'open';
    const ms = `fill="none" stroke="${OUT}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
    const smile = `<path d="M${f(cx - w)} ${f(my)} Q${cx} ${f(my + w * 0.9)} ${f(cx + w)} ${f(my)}" ${ms}/>`;
    switch (mouth) {
      case 'cat': front.push(`<path d="M${f(cx - w)} ${f(my)} Q${f(cx - w / 2)} ${f(my + w * 0.7)} ${cx} ${f(my)} Q${f(cx + w / 2)} ${f(my + w * 0.7)} ${f(cx + w)} ${f(my)}" ${ms}/>`); break;
      case 'open': front.push(`<path d="M${f(cx - w)} ${f(my)} Q${cx} ${f(my + w * 1.7)} ${f(cx + w)} ${f(my)}Z" fill="#3a0d3e" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/><ellipse cx="${cx}" cy="${f(my + w * 0.55)}" rx="${f(w * 0.42)}" ry="${f(w * 0.22)}" fill="#ff6b9a"/>`); break;
      case 'fang': front.push(smile + `<polygon points="${f(cx + w * 0.25)},${f(my + w * 0.38)} ${f(cx + w * 0.6)},${f(my + w * 0.22)} ${f(cx + w * 0.48)},${f(my + w * 0.75)}" fill="#fff" stroke="${OUT}" stroke-width=".8"/>`); break;
      case 'flat': front.push(`<line x1="${f(cx - w * 0.7)}" y1="${f(my + w * 0.25)}" x2="${f(cx + w * 0.7)}" y2="${f(my + w * 0.25)}" ${ms}/>`); break;
      case 'tongue': front.push(`<path d="M${f(cx + w * 0.05)} ${f(my + w * 0.42)} Q${f(cx + w * 0.3)} ${f(my + w * 1.25)} ${f(cx + w * 0.55)} ${f(my + w * 0.3)}" fill="#ff6b9a" stroke="${OUT}" stroke-width="1.2"/>` + smile); break;
      case 'o': front.push(`<ellipse cx="${cx}" cy="${f(my + w * 0.3)}" rx="${f(w * 0.3)}" ry="${f(w * 0.4)}" fill="#3a0d3e" stroke="${OUT}" stroke-width="1.4"/>`); break;
      case 'smile':
      default: front.push(smile);
    }

    /* accessories */
    if (acc === 'shades') {
      const lens = (s) => `<rect x="${f(cx + s * dx - e * 1.35)}" y="${f(ey - e * 0.9)}" width="${f(e * 2.7)}" height="${f(e * 1.7)}" rx="${f(e * 0.45)}" fill="url(#${id}lens)" stroke="${OUT}" stroke-width="1.6"/>`;
      front.push(`<defs><linearGradient id="${id}lens" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff71ce"/><stop offset="1" stop-color="#01cdfe"/></linearGradient></defs>${lens(-1)}${lens(1)}<line x1="${f(cx - dx + e * 1.35)}" y1="${f(ey - e * 0.3)}" x2="${f(cx + dx - e * 1.35)}" y2="${f(ey - e * 0.3)}" stroke="${OUT}" stroke-width="1.6"/>`);
    } else if (acc === 'bowtie') {
      const by = my + r * 0.48;
      front.push(`<polygon points="${cx},${f(by)} ${f(cx - r * 0.28)},${f(by - r * 0.15)} ${f(cx - r * 0.28)},${f(by + r * 0.15)}" fill="${P.accent}" ${stroke}/><polygon points="${cx},${f(by)} ${f(cx + r * 0.28)},${f(by - r * 0.15)} ${f(cx + r * 0.28)},${f(by + r * 0.15)}" fill="${P.accent}" ${stroke}/><circle cx="${cx}" cy="${f(by)}" r="${f(r * 0.07)}" fill="#fffb96" stroke="${OUT}" stroke-width="1.2"/>`);
    } else if (acc === 'headphones') {
      const hx = r * 0.98 * side;
      front.push(`<path d="M${f(cx - hx)} ${f(cy - r * 0.05)} Q${cx} ${f(ty - r * 0.75)} ${f(cx + hx)} ${f(cy - r * 0.05)}" fill="none" stroke="${OUT}" stroke-width="3.5"/><path d="M${f(cx - hx)} ${f(cy - r * 0.05)} Q${cx} ${f(ty - r * 0.75)} ${f(cx + hx)} ${f(cy - r * 0.05)}" fill="none" stroke="${P.accent}" stroke-width="1.5"/>` +
        [-1, 1].map(s => `<rect x="${f(cx + s * hx - r * 0.14)}" y="${f(cy - r * 0.3)}" width="${f(r * 0.28)}" height="${f(r * 0.5)}" rx="${f(r * 0.1)}" fill="${P.accent}" ${stroke}/>`).join(''));
    } else if (acc === 'flower') {
      const fx = cx + r * 0.55, fy = ty + r * 0.28;
      let petals = '';
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        petals += `<circle cx="${f(fx + Math.cos(a) * r * 0.13)}" cy="${f(fy + Math.sin(a) * r * 0.13)}" r="${f(r * 0.11)}" fill="#ff9ad5" stroke="${OUT}" stroke-width="1"/>`;
      }
      front.push(petals + `<circle cx="${f(fx)}" cy="${f(fy)}" r="${f(r * 0.08)}" fill="#fffb96" stroke="${OUT}" stroke-width="1"/>`);
    } else if (acc === 'monocle') {
      front.push(`<circle cx="${f(cx + dx)}" cy="${f(ey)}" r="${f(e * 1.55)}" fill="#fff" fill-opacity=".15" stroke="#ffd84d" stroke-width="1.8"/><path d="M${f(cx + dx + e * 1.1)} ${f(ey + e * 1.1)} Q${f(cx + r * 0.75)} ${f(cy + r * 0.3)} ${f(cx + r * 0.62)} ${f(cy + r * 0.62)}" fill="none" stroke="#ffd84d" stroke-width="1" stroke-dasharray="2 1.5"/>`);
    } else if (acc === 'scarf') {
      front.push(`<rect x="${f(cx + r * 0.3)}" y="${f(cy + r * 0.55)}" width="${f(r * 0.22)}" height="${f(r * 0.48)}" fill="${P.accent}" stroke="${OUT}" stroke-width="1.5" transform="rotate(-10 ${f(cx + r * 0.4)} ${f(cy + r * 0.55)})"/>`);
    }

    /* mood extras */
    if (mood.key === 'happy' || mood.key === 'hyped') {
      front.push([-1, 1].map(s => `<ellipse cx="${f(cx + s * r * 0.58)}" cy="${f(my - r * 0.05)}" rx="${f(r * 0.13)}" ry="${f(r * 0.07)}" fill="#ff3f8e" opacity=".5"/>`).join(''));
    }
    let extra = '';
    if (mood.key === 'sleepy') extra = `<text class="zz" x="${f(cx + r * 0.8)}" y="${f(ty)}" fill="#fff" font-size="10" font-family="monospace" font-weight="bold">z Z</text>`;
    if (mood.key === 'bored') extra = `<g fill="#fff" opacity=".85">${[0, 1, 2].map(i => `<circle class="twinkle" style="animation-delay:${i * 0.3}s" cx="${f(cx + r * 0.85 + i * 5)}" cy="${f(ty - 2)}" r="1.6"/>`).join('')}</g>`;

    const fx = [];
    if (st >= 10) fx.push(`filter:drop-shadow(0 0 ${st >= 11 ? 6 : 4}px ${P.accent})`);
    const cls = ['bob'];
    if (st >= 11) cls.push('float');
    if (st >= 12) cls.push('holo');

    return `
      <ellipse cx="${cx}" cy="${ground + 1}" rx="${f(r * 0.85)}" ry="3" fill="#000" opacity=".35"/>
      <g class="${cls.join(' ')}" style="${fx.join(';')}">
        ${back.join('')}
        ${bodySvg}
        ${front.join('')}
      </g>
      ${extra}`;
  }

  let renderCount = 0;
  function render(pet, opts) {
    opts = opts || {};
    const id = 'vp' + (++renderCount) + '_';
    const mood = opts.mood || moodOf(pet);
    return `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${pet.name}, ${STAGES[stageOf(pet.exp) - 1].name}">${scene(id)}${creature(pet, mood, id)}</svg>`;
  }

  global.VaporPet = {
    EXP_PER_LEVEL, PALETTES, SLOTS, STAGES,
    levelOf, stageOf, newPet, ensureDna, levelUp, moodOf, render, slotOf
  };
})(window);
