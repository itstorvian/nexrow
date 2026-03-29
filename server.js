require('dotenv').config();

const FEE_PERCENT     = 2;
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || '0x0000000000000000000000000000000000000000';

const axios   = require('axios');
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

// ─── DB Helpers ───────────────────────────────────────────────────────────────
function loadJSON(file) {
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const DB_ESCROWS  = path.join(__dirname, 'data', 'escrows.json');
const DB_CREATORS = path.join(__dirname, 'data', 'creators.json');
const DB_LISTINGS = path.join(__dirname, 'data', 'listings.json');

if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

let escrowDB  = loadJSON(DB_ESCROWS);
let creatorDB = loadJSON(DB_CREATORS);
let listingDB = loadJSON(DB_LISTINGS);

if (!escrowDB.escrows)   escrowDB  = { escrows: {}, nextId: 1 };
if (!creatorDB.creators) creatorDB = { creators: {}, nextId: 1 };
if (!listingDB.listings) listingDB = { listings: {}, nextId: 1 };

// ─── Categories ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  'Micro Creator', 'Content Creator', 'KOL', 'Thread Writer',
  'Developer', 'Artist & Designer', 'Educator', 'Gaming',
  'Meme & Community', 'DeFi Analyst', 'NFT Curator',
  'Podcast & Video', 'Instagram Creator', 'TikTok Creator',
  'YouTube Creator', 'Other'
];

const PLATFORMS = ['Twitter/X', 'Instagram', 'TikTok', 'YouTube', 'Other'];

// ─── Twitter Stats ────────────────────────────────────────────────────────────
async function fetchStats(creator) {
  try {
    const clean = creator.replace('@', '');
    const res = await axios.get(
      `https://api.twitter.com/2/users/by/username/${clean}`,
      {
        params: { 'user.fields': 'public_metrics' },
        headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER}` }
      }
    );
    const m = res.data.data.public_metrics;
    return { followers: m.followers_count, likes: m.like_count, views: m.tweet_count, source: 'twitter' };
  } catch {
    return {
      followers: Math.floor(Math.random() * 5000),
      likes:     Math.floor(Math.random() * 300),
      views:     Math.floor(Math.random() * 10000),
      source:    'mock'
    };
  }
}

// ─── Safe Condition Evaluator ─────────────────────────────────────────────────
const CONDITION_REGEX = /^(likes|followers|views)\s*(>=|<=|>|<|===|==|!=)\s*\d+(\s*(&&|\|\|)\s*(likes|followers|views)\s*(>=|<=|>|<|===|==|!=)\s*\d+)*$/;

function evaluateCondition(condition, stats) {
  const trimmed = condition.trim();
  if (trimmed === 'manual') return false;
  if (!CONDITION_REGEX.test(trimmed)) return false;
  const { likes = 0, followers = 0, views = 0 } = stats;
  try {
    return new Function('likes', 'followers', 'views', `return !!(${trimmed})`)(likes, followers, views);
  } catch { return false; }
}

// ─── Score & Trusted ─────────────────────────────────────────────────────────
function calculateScore(creator) {
  const escrowScore  = (creator.completedEscrows || 0) * 10;
  const earningScore = Math.min((creator.totalEarned || 0) / 10, 50);
  return Math.round(escrowScore + earningScore);
}

function isTrusted(creator) {
  return (creator.completedEscrows || 0) >= 1 && calculateScore(creator) >= 10;
}

// ─── ESCROW ROUTES ────────────────────────────────────────────────────────────

app.post('/deposit', (req, res) => {
  const { creator, condition, amount, txHash, creatorWallet, payerWallet } = req.body;
  if (!creator || !condition || !amount)
    return res.status(400).json({ error: 'Missing required fields' });
  if (condition.trim() !== 'manual' && !CONDITION_REGEX.test(condition.trim()))
    return res.status(400).json({ error: 'Invalid condition. Use: likes > 100 or "manual"' });

  const baseAmount = parseFloat(amount);
  // Fee projeden alınır — creator tam miktarı alır
  const fee           = parseFloat((baseAmount * (FEE_PERCENT / 100)).toFixed(6));
  const totalFromProject = parseFloat((baseAmount + fee).toFixed(6));

  const id = String(escrowDB.nextId++);
  escrowDB.escrows[id] = {
    id, creator,
    condition:        condition.trim(),
    amount:           baseAmount,       // creator'ın alacağı miktar
    fee:              fee,              // platform fee (proje öder)
    totalFromProject: totalFromProject, // proje toplam ödeyecek
    status:           'pending',
    conditionType:    condition.trim() === 'manual' ? 'manual' : 'auto',
    createdAt:        new Date().toISOString(),
    updatedAt:        null,
    creatorWallet:    creatorWallet || null,
    payerWallet:      payerWallet   || null,
    txHash:           txHash        || null,
    releaseTxHash:    null,
    lastStats:        null,
  };
  saveJSON(DB_ESCROWS, escrowDB);
  console.log(`📦 Escrow #${id}: ${creator} | ${condition} | ${baseAmount} USDC (+ ${fee} fee = ${totalFromProject} total)`);
  res.json({ success: true, escrow: escrowDB.escrows[id] });
});

app.get('/escrows', (req, res) => {
  let list = Object.values(escrowDB.escrows);
  if (req.query.status) list = list.filter(e => e.status === req.query.status);
  if (req.query.wallet) {
    const w = req.query.wallet.toLowerCase();
    list = list.filter(e =>
      e.payerWallet?.toLowerCase() === w || e.creatorWallet?.toLowerCase() === w
    );
  }
  res.json(list.reverse());
});

app.get('/escrows/:id', (req, res) => {
  const escrow = escrowDB.escrows[req.params.id];
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
  res.json(escrow);
});

app.post('/check/:id', async (req, res) => {
  const escrow = escrowDB.escrows[req.params.id];
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
  if (escrow.status !== 'pending')
    return res.status(400).json({ error: `Escrow already ${escrow.status}` });
  if (escrow.conditionType === 'manual')
    return res.status(400).json({ error: 'Use /approve/:id for manual escrows' });

  const stats = await fetchStats(escrow.creator);
  const met   = evaluateCondition(escrow.condition, stats);
  escrow.lastStats = stats;

  if (met) {
    escrow.status    = 'condition_met';
    escrow.updatedAt = new Date().toISOString();
    saveJSON(DB_ESCROWS, escrowDB);
    res.json({
      result:         'condition_met',
      stats,
      escrow,
      fee:            escrow.fee,
      creatorAmount:  escrow.amount,  // creator tam miktarı alır
      platformWallet: PLATFORM_WALLET
    });
  } else {
    saveJSON(DB_ESCROWS, escrowDB);
    res.json({ result: 'not_met', stats, escrow });
  }
});

app.post('/approve/:id', (req, res) => {
  const escrow = escrowDB.escrows[req.params.id];
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
  if (escrow.status !== 'pending')
    return res.status(400).json({ error: `Escrow already ${escrow.status}` });

  escrow.status    = 'condition_met';
  escrow.updatedAt = new Date().toISOString();

  saveJSON(DB_ESCROWS, escrowDB);
  res.json({
    result:         'condition_met',
    escrow,
    fee:            escrow.fee,
    creatorAmount:  escrow.amount,  // creator tam miktarı alır
    platformWallet: PLATFORM_WALLET
  });
});

app.post('/release/:id', (req, res) => {
  const { releaseTxHash } = req.body;
  const escrow = escrowDB.escrows[req.params.id];
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
  if (escrow.status !== 'condition_met')
    return res.status(400).json({ error: 'Escrow not in condition_met state' });

  escrow.status        = 'paid';
  escrow.releaseTxHash = releaseTxHash || null;
  escrow.updatedAt     = new Date().toISOString();

  const key = escrow.creatorWallet?.toLowerCase();
  if (key && creatorDB.creators[key]) {
    const c = creatorDB.creators[key];
    c.completedEscrows = (c.completedEscrows || 0) + 1;
    c.totalEarned      = parseFloat(((c.totalEarned || 0) + escrow.amount).toFixed(6));
    c.score            = calculateScore(c);
    c.trusted          = isTrusted(c);
    saveJSON(DB_CREATORS, creatorDB);
  }

  saveJSON(DB_ESCROWS, escrowDB);
  res.json({ success: true, escrow });
});

app.post('/refund/:id', (req, res) => {
  const { refundTxHash } = req.body;
  const escrow = escrowDB.escrows[req.params.id];
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
  if (escrow.status !== 'pending')
    return res.status(400).json({ error: `Cannot refund: escrow is ${escrow.status}` });

  escrow.status       = 'refunded';
  escrow.refundTxHash = refundTxHash || null;
  escrow.updatedAt    = new Date().toISOString();
  saveJSON(DB_ESCROWS, escrowDB);
  res.json({ success: true, escrow });
});

app.get('/stats', (req, res) => {
  const all = Object.values(escrowDB.escrows);
  res.json({
    total:         all.length,
    pending:       all.filter(e => e.status === 'pending').length,
    paid:          all.filter(e => e.status === 'paid').length,
    refunded:      all.filter(e => e.status === 'refunded').length,
    condition_met: all.filter(e => e.status === 'condition_met').length,
    volumeUSDC:    all.reduce((s, e) => s + e.amount, 0).toFixed(2),
    feesUSDC:      all.filter(e => e.fee).reduce((s, e) => s + e.fee, 0).toFixed(6),
    creators:      Object.keys(creatorDB.creators).length,
    trusted:       Object.values(creatorDB.creators).filter(c => c.trusted).length,
    listings:      Object.values(listingDB.listings).filter(l => l.status === 'active').length,
  });
});

// ─── CREATOR ROUTES ───────────────────────────────────────────────────────────

app.post('/creators/register', (req, res) => {
  const { wallet, twitter, category, bio, pricing, followerRange, platform } = req.body;
  if (!wallet || !twitter || !category)
    return res.status(400).json({ error: 'Missing: wallet, twitter, category' });
  if (!CATEGORIES.includes(category))
    return res.status(400).json({ error: 'Invalid category' });

  const key = wallet.toLowerCase();
  if (creatorDB.creators[key])
    return res.status(400).json({ error: 'Wallet already registered' });

  creatorDB.creators[key] = {
    id:               String(creatorDB.nextId++),
    wallet:           key,
    twitter,
    category,
    platform:         platform      || 'Twitter/X',
    followerRange:    followerRange  || '',
    bio:              bio            || '',
    pricing:          pricing        || '',
    status:           'approved',
    trusted:          false,
    completedEscrows: 0,
    totalEarned:      0,
    score:            0,
    registeredAt:     new Date().toISOString(),
  };

  saveJSON(DB_CREATORS, creatorDB);
  res.json({ success: true, creator: creatorDB.creators[key] });
});

app.get('/creators', (req, res) => {
  let list = Object.values(creatorDB.creators);
  if (req.query.category) list = list.filter(c => c.category === req.query.category);
  if (req.query.platform) list = list.filter(c => c.platform === req.query.platform);
  if (req.query.trusted === 'true') list = list.filter(c => c.trusted);
  list.sort((a, b) => b.score - a.score);
  res.json(list);
});

app.get('/creators/trusted', (req, res) => {
  const list = Object.values(creatorDB.creators)
    .filter(c => c.trusted)
    .sort((a, b) => b.score - a.score);
  res.json(list);
});

app.get('/creators/:wallet', (req, res) => {
  const creator = creatorDB.creators[req.params.wallet.toLowerCase()];
  if (!creator) return res.status(404).json({ error: 'Creator not found' });
  const escrows = Object.values(escrowDB.escrows)
    .filter(e => e.creatorWallet?.toLowerCase() === req.params.wallet.toLowerCase())
    .reverse();
  res.json({ ...creator, escrows });
});

app.get('/categories', (req, res) => res.json(CATEGORIES));
app.get('/platforms',  (req, res) => res.json(PLATFORMS));

// ─── LISTING ROUTES ───────────────────────────────────────────────────────────

app.post('/listings', (req, res) => {
  const { wallet, type, title, description, budget, category, twitter, platform } = req.body;
  if (!wallet || !type || !title || !budget || !category)
    return res.status(400).json({ error: 'Missing fields' });
  if (!['creator', 'project'].includes(type))
    return res.status(400).json({ error: 'type must be creator or project' });

  const id = String(listingDB.nextId++);
  listingDB.listings[id] = {
    id, wallet: wallet.toLowerCase(), type, title,
    description: description || '',
    budget:      parseFloat(budget),
    category,
    platform:    platform || '',
    twitter:     twitter  || '',
    status:      'active',
    createdAt:   new Date().toISOString(),
  };

  saveJSON(DB_LISTINGS, listingDB);
  res.json({ success: true, listing: listingDB.listings[id] });
});

app.get('/listings', (req, res) => {
  let list = Object.values(listingDB.listings).filter(l => l.status === 'active');
  if (req.query.type)     list = list.filter(l => l.type === req.query.type);
  if (req.query.category) list = list.filter(l => l.category === req.query.category);
  if (req.query.platform) list = list.filter(l => l.platform === req.query.platform);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

app.get('/listings/spotlight', (req, res) => {
  const all      = Object.values(listingDB.listings).filter(l => l.status === 'active');
  const projects = all.filter(l => l.type === 'project').slice(0, 3);
  const creators = all.filter(l => l.type === 'creator').slice(0, 3);
  const trusted  = Object.values(creatorDB.creators)
    .filter(c => c.trusted)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const topCreators = trusted.length
    ? trusted
    : Object.values(creatorDB.creators).sort((a, b) => b.score - a.score).slice(0, 3);
  res.json({ creators, projects, topCreators });
});

app.post('/listings/:id/close', (req, res) => {
  const listing = listingDB.listings[req.params.id];
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  listing.status = 'closed';
  saveJSON(DB_LISTINGS, listingDB);
  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`⚡ Nexrow server on http://localhost:${PORT}`);
  console.log(`📁 Data: ${path.join(__dirname, 'data')}`);
  console.log(`💳 Platform wallet: ${PLATFORM_WALLET}`);
});