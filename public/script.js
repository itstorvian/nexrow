// ─── Tema Toggle ──────────────────────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  document.getElementById('theme-btn').innerText = next === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('nexrow-theme', next);
}

function initTheme() {
  const saved = localStorage.getItem('nexrow-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerText = saved === 'dark' ? '🌙' : '☀️';
}

initTheme();

const USDC_CONTRACT   = '0x3600000000000000000000000000000000000000';
const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)'
];
const ARC_CHAIN_ID    = '0x4CE832';
const API             = window.location.origin === 'http://127.0.0.1:5500' || window.location.origin === 'http://localhost:5500'
  ? 'http://localhost:3001'
  : window.location.origin;
const PLATFORM_WALLET = '0xec0B6d183c4d09cf40d192c0eB801A32DDcdC114';

let currentAddress  = null;
let creatorFilter   = 'all';
const escrowCache   = {};

// ─── Tab Navigation ───────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.getAttribute('onclick') === `switchTab('${tab}')`) b.classList.add('active');
  });
  if (tab === 'home')     loadHome();
  if (tab === 'escrow')   loadEscrows();
  if (tab === 'creators') loadCreators();
  if (tab === 'board')    loadListings();
}

function updateConditionHint() {
  const platform  = document.getElementById('escrow-platform')?.value;
  const hint      = document.getElementById('condition-hint');
  const condition = document.getElementById('condition');
  if (!hint || !condition) return;
  if (platform === 'twitter') {
    hint.innerText        = 'Twitter/X: likes > 100, followers >= 500, views < 10000';
    condition.placeholder = 'likes > 100';
    condition.value       = '';
  } else {
    hint.innerText        = 'Instagram / TikTok / YouTube: type "manual"';
    condition.placeholder = 'manual';
    condition.value       = 'manual';
  }
}

function updateFeePreview() {
  const amount  = parseFloat(document.getElementById('amount')?.value || 0);
  const preview = document.getElementById('fee-preview');
  if (!preview) return;
  if (!amount || amount <= 0) { preview.innerText = ''; return; }
  const fee   = parseFloat((amount * 0.02).toFixed(6));
  const total = parseFloat((amount + fee).toFixed(6));
  preview.innerHTML = `Creator receives: <b>${amount} USDC</b> &nbsp;|&nbsp; Platform fee: <b>${fee} USDC</b> (2%) &nbsp;|&nbsp; You pay: <b>${total} USDC</b>`;
}

// ─── Wallet ───────────────────────────────────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) return alert('Please install MetaMask!');
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (chainId !== ARC_CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_CHAIN_ID }],
      });
    } catch {
      alert('Please switch to ARC Testnet in MetaMask.');
      return;
    }
  }
  const accounts = await window.ethereum.request({ method: 'eth_accounts' });
  await setConnected(accounts[0]);
  return accounts[0];
}

async function setConnected(address) {
  currentAddress = address;
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  document.getElementById('wallet-address').innerText = short;
  document.getElementById('wallet-btn').innerText     = '✅ Connected';
  document.getElementById('disconnect-btn').style.display = 'inline-block';
  await updateBalance(address);
  loadHome();
}

function disconnectWallet() {
  currentAddress = null;
  document.getElementById('wallet-btn').innerText         = 'Connect';
  document.getElementById('wallet-address').innerText     = '';
  document.getElementById('wallet-balance').innerText     = '';
  document.getElementById('disconnect-btn').style.display = 'none';
}

async function updateBalance(address) {
  try {
    const provider  = new ethers.BrowserProvider(window.ethereum);
    const usdc      = new ethers.Contract(USDC_CONTRACT, USDC_ABI, provider);
    const bal       = await usdc.balanceOf(address);
    const formatted = parseFloat(ethers.formatUnits(bal, 6)).toFixed(2);
    document.getElementById('wallet-balance').innerText = `${formatted} USDC`;
  } catch {
    document.getElementById('wallet-balance').innerText = '';
  }
}

window.addEventListener('load', async () => {
  if (window.ethereum) {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accounts.length > 0) await setConnected(accounts[0]);
    window.ethereum.on('accountsChanged', async (accounts) => {
      if (accounts.length === 0) disconnectWallet();
      else await setConnected(accounts[0]);
    });
    window.ethereum.on('chainChanged', () => window.location.reload());
  }
  loadHome();
});

// ─── HOME ─────────────────────────────────────────────────────────────────────
async function loadHome() {
  loadHomeStats();
}

async function loadHomeStats() {
  try {
    const res  = await fetch(`${API}/stats`);
    const data = await res.json();
    const el   = document.getElementById('home-stats');
    if (!el) return;
    el.innerHTML = `
      <div class="stat-card">
        <span class="stat-value">${data.total}</span>
        <span class="stat-label">Total Escrows</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${data.volumeUSDC}</span>
        <span class="stat-label">USDC Volume</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${data.paid}</span>
        <span class="stat-label">Paid Out</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${data.creators}</span>
        <span class="stat-label">Creators</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${data.trusted || 0}</span>
        <span class="stat-label">🛡️ Trusted</span>
      </div>
    `;
  } catch {}
}

// ─── ESCROW ───────────────────────────────────────────────────────────────────
async function deposit() {
  const creator       = document.getElementById('creator').value.trim();
  const condition     = document.getElementById('condition').value.trim();
  const creatorWallet = document.getElementById('creator-wallet').value.trim();
  const amount        = document.getElementById('amount').value.trim();

  if (!creator || !condition || !creatorWallet || !amount)
    return showToast('Please fill in all fields', 'error');
  if (!ethers.isAddress(creatorWallet))
    return showToast('Invalid creator wallet address', 'error');
  if (parseFloat(amount) <= 0)
    return showToast('Amount must be greater than 0', 'error');
  if (!currentAddress) {
    const addr = await connectWallet();
    if (!addr) return;
  }

  const baseAmount = parseFloat(amount);
  const fee        = parseFloat((baseAmount * 0.02).toFixed(6));
  const total      = parseFloat((baseAmount + fee).toFixed(6));

  const confirmed = window.confirm(
    `Deposit summary:\n\nCreator receives: ${baseAmount} USDC\nPlatform fee (2%): ${fee} USDC\nTotal you pay: ${total} USDC\n\nThis will send 2 transactions.`
  );
  if (!confirmed) return;

  setLoading('deposit-btn', true, 'Sending...');
  try {
    const provider     = new ethers.BrowserProvider(window.ethereum);
    const signer       = await provider.getSigner();
    const usdc         = new ethers.Contract(USDC_CONTRACT, USDC_ABI, signer);

    showToast('TX 1/2: Sending to creator...', 'info');
    const tx1 = await usdc.transfer(creatorWallet, ethers.parseUnits(baseAmount.toString(), 6));
    await tx1.wait();

    showToast('TX 2/2: Sending platform fee...', 'info');
    const tx2 = await usdc.transfer(PLATFORM_WALLET, ethers.parseUnits(fee.toString(), 6));
    await tx2.wait();

    const res  = await fetch(`${API}/deposit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creator, condition, amount: baseAmount, txHash: tx1.hash, creatorWallet, payerWallet: currentAddress }),
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'Server error', 'error');

    showToast(`✅ Escrow #${data.escrow.id} created!`, 'success');
    clearForm(['creator', 'condition', 'creator-wallet', 'amount']);
    const fp = document.getElementById('fee-preview');
    if (fp) fp.innerText = '';
    await updateBalance(currentAddress);
    loadEscrows();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('deposit-btn', false, '💰 Deposit');
  }
}

async function checkCondition(id) {
  const btn = document.getElementById(`check-btn-${id}`);
  if (btn) { btn.disabled = true; btn.innerText = 'Checking...'; }
  try {
    const res  = await fetch(`${API}/check/${id}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'Error', 'error');
    if (data.result === 'condition_met') {
      showToast('✅ Condition met! Click Release to send payment.', 'success');
    } else {
      const s = data.stats;
      showToast(`❌ Not met — 👍 ${s.likes} | 👥 ${s.followers} | 👁 ${s.views}${s.source === 'mock' ? ' (mock)' : ''}`, 'info');
    }
    loadEscrows();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '🔍 Check'; }
  }
}

async function approveManual(id) {
  if (!currentAddress) return showToast('Connect wallet to approve', 'error');
  if (!window.confirm('Manually approve this escrow?')) return;
  try {
    const res  = await fetch(`${API}/approve/${id}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'Error', 'error');
    showToast('✅ Approved! Click Release to send payment.', 'success');
    loadEscrows();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function releaseFromCache(id) {
  const e = escrowCache[id];
  if (!e) return showToast('Refresh the page and try again', 'error');
  if (!window.confirm(`Confirm release of escrow #${id}?\nCreator already received ${e.amount} USDC at deposit.`)) return;
  try {
    await fetch(`${API}/release/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ releaseTxHash: e.txHash }),
    });
    showToast(`✅ Escrow #${id} marked as paid!`, 'success');
    loadEscrows();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function refund(id) {
  if (!currentAddress) return showToast('Connect wallet to refund', 'error');
  const res    = await fetch(`${API}/escrows/${id}`);
  const escrow = await res.json();
  if (escrow.payerWallet?.toLowerCase() !== currentAddress.toLowerCase())
    return showToast('Only the payer can request a refund', 'error');
  if (!window.confirm(`Request refund of ${escrow.amount} USDC?`)) return;
  try {
    const r    = await fetch(`${API}/refund/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundTxHash: null }),
    });
    const data = await r.json();
    if (!r.ok) return showToast(data.error, 'error');
    showToast('↩️ Refund requested.', 'info');
    loadEscrows();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadEscrows() {
  const el = document.getElementById('escrow-list');
  if (!el) return;
  el.innerHTML = '<p class="loading">Loading...</p>';
  try {
    const url  = currentAddress ? `${API}/escrows?wallet=${currentAddress}` : `${API}/escrows`;
    const res  = await fetch(url);
    const list = await res.json();
    loadEscrowStats();
    if (!list.length) { el.innerHTML = '<p class="empty">No escrows yet.</p>'; return; }
    el.innerHTML = list.map(e => renderEscrow(e)).join('');
  } catch (err) {
    el.innerHTML = `<p class="empty">Failed to load: ${err.message}</p>`;
  }
}

async function loadEscrowStats() {
  try {
    const res  = await fetch(`${API}/stats`);
    const data = await res.json();
    const el   = document.getElementById('escrow-stats');
    if (el) el.innerHTML = `
      <span>📦 ${data.total} escrows</span>
      <span>⏳ ${data.pending} pending</span>
      <span>💰 ${data.volumeUSDC} USDC volume</span>
      <span>🏦 ${data.feesUSDC} USDC fees</span>
    `;
  } catch {}
}

function renderEscrow(e) {
  escrowCache[e.id] = e;
  const statusLabel = {
    pending: '⏳ Pending', condition_met: '✅ Condition Met',
    paid: '💰 Paid', refunded: '↩️ Refunded'
  }[e.status] || e.status;

  const shortHash   = h => h ? `${h.slice(0, 10)}...${h.slice(-6)}` : '—';
  const explorerUrl = h => `https://testnet.arcscan.net/tx/${h}`;
  const isManual    = e.conditionType === 'manual';
  const isPayer     = currentAddress && e.payerWallet?.toLowerCase() === currentAddress.toLowerCase();

  return `
    <div class="escrow-item status-border-${e.status}">
      <div class="escrow-header">
        <span class="escrow-creator">${e.creator}${isManual ? '<span class="badge-manual">Manual</span>' : ''}</span>
        <span class="badge badge-${e.status}">${statusLabel}</span>
      </div>
      <div class="escrow-details">
        <div class="detail-row"><span class="label">Creator gets</span><span class="value">${e.amount} USDC</span></div>
        <div class="detail-row"><span class="label">Platform fee</span><span class="value">${e.fee} USDC (paid by project)</span></div>
        <div class="detail-row"><span class="label">Condition</span><code>${e.condition}</code></div>
        ${e.creatorWallet ? `<div class="detail-row"><span class="label">Creator wallet</span><span class="value mono">${e.creatorWallet.slice(0,6)}...${e.creatorWallet.slice(-4)}</span></div>` : ''}
        ${e.txHash ? `<div class="detail-row"><span class="label">Deposit TX</span><a href="${explorerUrl(e.txHash)}" target="_blank" class="tx-link">${shortHash(e.txHash)}</a></div>` : ''}
        ${e.releaseTxHash ? `<div class="detail-row"><span class="label">Release TX</span><a href="${explorerUrl(e.releaseTxHash)}" target="_blank" class="tx-link">${shortHash(e.releaseTxHash)}</a></div>` : ''}
        ${e.lastStats ? `<div class="detail-row"><span class="label">Last check</span><span class="value">👍 ${e.lastStats.likes} 👥 ${e.lastStats.followers} 👁 ${e.lastStats.views}${e.lastStats.source === 'mock' ? ' <em>(mock)</em>' : ''}</span></div>` : ''}
        <div class="detail-row"><span class="label">Created</span><span class="value">${new Date(e.createdAt).toLocaleString()}</span></div>
      </div>
      ${e.status === 'pending' ? `
        <div class="escrow-actions">
          ${isManual
            ? (isPayer ? `<button onclick="approveManual('${e.id}')">✅ Approve</button>` : '')
            : `<button id="check-btn-${e.id}" onclick="checkCondition('${e.id}')">🔍 Check</button>`
          }
          <button class="btn-danger" onclick="refund('${e.id}')">↩️ Refund</button>
        </div>` : ''}
      ${e.status === 'condition_met' ? `
        <div class="escrow-actions">
          <button onclick="releaseFromCache('${e.id}')">✅ Mark as Paid</button>
          <button class="btn-danger" onclick="refund('${e.id}')">↩️ Refund</button>
        </div>` : ''}
    </div>
  `;
}

// ─── CREATORS ─────────────────────────────────────────────────────────────────
function getStars(completedEscrows) {
  if (completedEscrows === 0) return '<span style="color:var(--muted);font-size:12px;">No escrows yet</span>';
  const stars = Math.min(5, Math.floor(completedEscrows / 2) + 1);
  return '⭐'.repeat(stars) + `<span style="font-size:11px;color:var(--muted);margin-left:4px;">(${completedEscrows} completed)</span>`;
}

function setCreatorFilter(filter) {
  creatorFilter = filter;
  document.getElementById('filter-all')?.classList.toggle('active-filter', filter === 'all');
  document.getElementById('filter-trusted')?.classList.toggle('active-filter', filter === 'trusted');
  loadCreators();
}

async function registerCreator() {
  if (!currentAddress) {
    const addr = await connectWallet();
    if (!addr) return;
  }

  const twitter       = document.getElementById('reg-twitter').value.trim();
  const category      = document.getElementById('reg-category').value;
  const platform      = document.getElementById('reg-platform').value;
  const pricing       = document.getElementById('reg-pricing').value.trim();
  const bio           = document.getElementById('reg-bio').value.trim();
  const followerRange = document.getElementById('reg-follower-range').value;

  if (!twitter || !category) return showToast('Handle and category are required', 'error');

  setLoading('register-btn', true, 'Registering...');
  try {
    const res  = await fetch(`${API}/creators/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: currentAddress, twitter, category, platform, pricing, bio, followerRange }),
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'Error', 'error');
    showToast('✅ Registered as creator!', 'success');
    clearForm(['reg-twitter', 'reg-pricing', 'reg-bio']);
    document.getElementById('reg-category').value       = '';
    document.getElementById('reg-platform').value       = 'Twitter/X';
    document.getElementById('reg-follower-range').value = '';
    loadCreators();
    loadHome();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('register-btn', false, '🌟 Register as Creator');
  }
}

async function loadCreators() {
  const el = document.getElementById('creator-list');
  if (!el) return;

  document.getElementById('filter-all')?.classList.toggle('active-filter', creatorFilter === 'all');
  document.getElementById('filter-trusted')?.classList.toggle('active-filter', creatorFilter === 'trusted');

  el.innerHTML = '<p class="loading">Loading...</p>';
  try {
    const category = document.getElementById('creator-category-filter')?.value || '';
    const platform = document.getElementById('creator-platform-filter')?.value || '';
    const params   = [];
    if (category) params.push(`category=${encodeURIComponent(category)}`);
    if (platform) params.push(`platform=${encodeURIComponent(platform)}`);
    if (creatorFilter === 'trusted') params.push('trusted=true');
    const url = `${API}/creators${params.length ? '?' + params.join('&') : ''}`;

    const res  = await fetch(url);
    const list = await res.json();

    if (!list.length) {
      el.innerHTML = creatorFilter === 'trusted'
        ? '<p class="empty">No trusted creators yet. Complete escrows to earn trust!</p>'
        : '<p class="empty">No creators yet. Be the first!</p>';
      return;
    }

    el.innerHTML = list.map((c, i) => `
      <div class="creator-card">
        <div class="creator-rank">#${i + 1}</div>
        <div class="creator-info">
          <div class="creator-top">
            <b class="creator-handle">${c.twitter}</b>
            <span class="category-tag">${c.category}</span>
            <span class="platform-tag">${c.platform || 'Twitter/X'}</span>
            ${c.followerRange ? `<span class="category-tag">${c.followerRange}</span>` : ''}
            ${c.trusted ? '<span class="trusted-badge">🛡️ Trusted</span>' : ''}
          </div>
          <div style="margin:6px 0 8px;">${getStars(c.completedEscrows)}</div>
          ${c.bio ? `<p class="creator-bio">${c.bio}</p>` : ''}
          ${c.pricing ? `<p class="creator-pricing">💰 ${c.pricing}</p>` : ''}
          <div class="creator-stats">
            <span>💵 ${c.totalEarned} USDC earned</span>
            <span>📅 Since ${new Date(c.registeredAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = `<p class="empty">Failed to load: ${err.message}</p>`;
  }
}

// ─── BOARD ────────────────────────────────────────────────────────────────────
async function postListing() {
  if (!currentAddress) {
    const addr = await connectWallet();
    if (!addr) return;
  }

  const type        = document.getElementById('listing-type').value;
  const category    = document.getElementById('listing-category').value;
  const platform    = document.getElementById('listing-platform').value;
  const title       = document.getElementById('listing-title').value.trim();
  const description = document.getElementById('listing-desc').value.trim();
  const budget      = document.getElementById('listing-budget').value.trim();
  const twitter     = document.getElementById('listing-twitter').value.trim();

  if (!title || !budget || !category) return showToast('Title, budget and category are required', 'error');

  setLoading('listing-btn', true, 'Posting...');
  try {
    const res  = await fetch(`${API}/listings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: currentAddress, type, title, description, budget, category, platform, twitter }),
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'Error', 'error');
    showToast('✅ Listing posted!', 'success');
    clearForm(['listing-title', 'listing-desc', 'listing-budget', 'listing-twitter']);
    loadListings();
    loadHome();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('listing-btn', false, '📋 Post Listing');
  }
}

async function loadListings() {
  const el = document.getElementById('listing-list');
  if (!el) return;
  el.innerHTML = '<p class="loading">Loading...</p>';
  try {
    const type     = document.getElementById('board-type-filter')?.value     || '';
    const category = document.getElementById('board-category-filter')?.value || '';
    const platform = document.getElementById('board-platform-filter')?.value || '';
    const params   = [];
    if (type)     params.push(`type=${type}`);
    if (category) params.push(`category=${encodeURIComponent(category)}`);
    if (platform) params.push(`platform=${encodeURIComponent(platform)}`);
    const url = `${API}/listings${params.length ? '?' + params.join('&') : ''}`;

    const res  = await fetch(url);
    const list = await res.json();
    if (!list.length) { el.innerHTML = '<p class="empty">No listings yet. Post the first one!</p>'; return; }

    el.innerHTML = list.map(l => `
      <div class="listing-card listing-${l.type}">
        <div class="listing-header">
          <div class="listing-meta">
            <span class="listing-type-badge ${l.type}">${l.type === 'project' ? '🏢 Project' : '🌟 Creator'}</span>
            <span class="category-tag">${l.category}</span>
            ${l.platform ? `<span class="platform-tag">${l.platform}</span>` : ''}
          </div>
          <span class="budget-badge">${l.budget} USDC</span>
        </div>
        <h4 class="listing-title">${l.title}</h4>
        ${l.description ? `<p class="listing-desc">${l.description}</p>` : ''}
        <div class="listing-footer">
          ${l.twitter ? `<span class="listing-twitter">@${l.twitter.replace('@','')}</span>` : ''}
          <span class="listing-date">${new Date(l.createdAt).toLocaleDateString()}</span>
          ${currentAddress && l.wallet === currentAddress.toLowerCase() ? `
            <button class="btn-sm btn-close" onclick="closeListing('${l.id}')">Close</button>
          ` : `
            <button class="btn-sm" onclick="contactListing('${l.twitter || ''}')">Contact</button>
          `}
        </div>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = `<p class="empty">Failed to load: ${err.message}</p>`;
  }
}

async function closeListing(id) {
  if (!window.confirm('Close this listing?')) return;
  await fetch(`${API}/listings/${id}/close`, { method: 'POST' });
  showToast('Listing closed.', 'info');
  loadListings();
}

function contactListing(twitter) {
  if (!twitter) return showToast('No handle provided', 'info');
  window.open(`https://twitter.com/${twitter.replace('@', '')}`, '_blank');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clearForm(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function setLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled  = loading;
  btn.innerText = label;
}

let toastTimer;
function showToast(msg, type = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast toast-${type}`;
  el.innerText = msg;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

loadHome();