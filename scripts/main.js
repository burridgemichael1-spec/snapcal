import { BrowserMultiFormatReader } from 'https://unpkg.com/@zxing/browser@latest?module';

const $ = (q) => document.querySelector(q);
const logList = $("#logList");
const goalLabel = $("#goalLabel");
const consumedLabel = $("#consumedLabel");
const remainingLabel = $("#remainingLabel");
const datePicker = $("#datePicker");
const pieCanvas = $("#pie");

const reviewModal = $("#reviewModal");
const reviewItemsEl = $("#reviewItems");
const reviewTotalEl = $("#reviewTotal");
const confirmConsumeBtn = $("#confirmConsume");
const confirmLeaveBtn = $("#confirmLeave");
const closeReviewBtn = $("#closeReview");

const settingsModal = $("#settingsModal");
const openSettingsBtn = $("#openSettings");
const closeSettingsBtn = $("#closeSettings");
const dailyGoalInput = $("#dailyGoal");
const saveSettingsBtn = $("#saveSettings");
const resetTodayBtn = $("#resetToday");

const manualModal = $("#manualModal");
const manualName = $("#manualName");
const manualCalories = $("#manualCalories");
const manualAddBtn = $("#manualAdd");
const manualCancelBtn = $("#manualCancel");

const viewer = $("#viewer");
const video = $("#video");
const canvas = $("#canvas");
const btnSnap = $("#btnSnap");
const btnScan = $("#btnScan");
const btnManual = $("#btnManual");
const btnCapture = $("#btnCapture");
const btnStop = $("#btnStop");

let mediaStream = null;
let scanner = null;
let scanningBarcode = false;
let pieChart = null;
let pendingItems = []; // items awaiting review {name, calories, source, id}

function todayISO(d=new Date()) {
  const tzoffset = d.getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzoffset).toISOString().slice(0,10);
}

function getState() {
  const raw = localStorage.getItem('snapcal-state');
  if (!raw) return { goal: 2000, logs: {} };
  try { return JSON.parse(raw); } catch { return { goal: 2000, logs: {} }; }
}
function setState(s) { localStorage.setItem('snapcal-state', JSON.stringify(s)); }

function getLogs(date) {
  const s = getState();
  return s.logs[date] || [];
}
function setLogs(date, arr) {
  const s = getState();
  s.logs[date] = arr;
  setState(s);
}

function addLog(date, item) {
  const arr = getLogs(date);
  arr.push(item);
  setLogs(date, arr);
}

function uid() { return Math.random().toString(36).slice(2,9); }

function renderLogs() {
  const d = datePicker.value;
  const logs = getLogs(d);
  logList.innerHTML = '';
  logs.forEach((it) => {
    const li = document.createElement('li');
    li.className = 'p-3 hover:bg-gray-800 cursor-pointer grid grid-cols-[1fr_auto] gap-2';
    li.innerHTML = \`
      <div>
        <div class="font-medium">\${it.name}</div>
        <div class="text-xs text-gray-400">\${it.source} • \${new Date(it.ts).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</div>
      </div>
      <div class="text-right font-semibold">\${it.calories} kcal</div>
    \`;
    li.addEventListener('click', () => editLog(it.id));
    logList.appendChild(li);
  });
}

function consumedTotal(date) {
  return getLogs(date).reduce((a,b)=>a + Number(b.calories||0), 0);
}

function updateChart() {
  const s = getState();
  const d = datePicker.value;
  const consumed = consumedTotal(d);
  const remaining = Math.max(0, s.goal - consumed);
  const over = Math.max(0, consumed - s.goal);
  goalLabel.textContent = s.goal;
  consumedLabel.textContent = \`\${consumed} kcal\`;
  remainingLabel.textContent = over ? \`-\${over} kcal (over)\` : \`\${remaining} kcal\`;

  const data = over ? [s.goal, 0] : [consumed, s.goal - consumed];
  const labels = over ? ['Consumed (over)', 'Remaining'] : ['Consumed', 'Remaining'];

  if (!pieChart) {
    pieChart = new Chart(pieCanvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data }]
      },
      options: {
        responsive: true,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#e5e7eb' } },
          title: { display: false }
        }
      }
    });
  } else {
    pieChart.data.labels = labels;
    pieChart.data.datasets[0].data = data;
    pieChart.update();
  }
}

function openModal(m) { m.classList.remove('hidden'); }
function closeModal(m) { m.classList.add('hidden'); }
closeReviewBtn.addEventListener('click', ()=>closeModal(reviewModal));
confirmLeaveBtn.addEventListener('click', ()=>{ pendingItems=[]; closeModal(reviewModal); });

function openSettings() {
  dailyGoalInput.value = getState().goal;
  openModal(settingsModal);
}
openSettingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', ()=>closeModal(settingsModal));
saveSettingsBtn.addEventListener('click', () => {
  const s = getState();
  s.goal = Math.max(200, Number(dailyGoalInput.value||2000));
  setState(s);
  updateChart();
  closeModal(settingsModal);
});

resetTodayBtn.addEventListener('click', () => {
  if (!confirm('Clear today\'s log?')) return;
  setLogs(datePicker.value, []);
  renderLogs();
  updateChart();
});

// Manual add flow
btnManual.addEventListener('click', ()=>{
  manualName.value = '';
  manualCalories.value = '';
  openModal(manualModal);
});
manualCancelBtn.addEventListener('click', ()=>closeModal(manualModal));
manualAddBtn.addEventListener('click', ()=>{
  const name = manualName.value.trim() || 'Food item';
  const calories = Math.max(0, Number(manualCalories.value||0));
  addLog(datePicker.value, { id: uid(), name, calories, source: 'manual', ts: Date.now() });
  closeModal(manualModal);
  renderLogs();
  updateChart();
});

// Edit existing log item
function editLog(id) {
  const d = datePicker.value;
  const arr = getLogs(d);
  const idx = arr.findIndex(x=>x.id===id);
  if (idx < 0) return;
  const it = arr[idx];
  manualName.value = it.name;
  manualCalories.value = it.calories;
  openModal(manualModal);
  manualAddBtn.onclick = () => {
    it.name = manualName.value.trim() || it.name;
    it.calories = Math.max(0, Number(manualCalories.value||0));
    arr[idx] = it;
    setLogs(d, arr);
    closeModal(manualModal);
    renderLogs();
    updateChart();
  };
  manualCancelBtn.onclick = () => {
    if (confirm('Delete this entry?')) {
      arr.splice(idx,1);
      setLogs(d, arr);
      renderLogs();
      updateChart();
      closeModal(manualModal);
    } else {
      closeModal(manualModal);
    }
  };
}

// Camera & photo flow
async function startCamera() {
  stopScanner();
  if (mediaStream) return;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = mediaStream;
    await video.play();
    viewer.classList.remove('hidden');
    btnCapture.classList.remove('hidden');
    btnStop.classList.remove('hidden');
  } catch (e) {
    alert('Camera access failed. You can still add manually or scan barcodes.');
  }
}
function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t=>t.stop());
    mediaStream = null;
  }
  viewer.classList.add('hidden');
  btnCapture.classList.add('hidden');
  btnStop.classList.add('hidden');
}

btnSnap.addEventListener('click', startCamera);
btnStop.addEventListener('click', ()=>{ stopCamera(); stopScanner(); });

btnCapture.addEventListener('click', async ()=>{
  if (!mediaStream) return;
  const w = video.videoWidth, h = video.videoHeight;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  // Call Netlify function (AI)
  try {
    const res = await fetch('/.netlify/functions/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    });
    if (!res.ok) throw new Error('Vision API failed');
    const out = await res.json();
    pendingItems = out.items?.map(x=>({ ...x, id: uid(), source: 'vision' })) || [];
    if (!pendingItems.length) {
      alert('I could not recognize the food. Please edit manually.');
      return;
    }
    openReview();
  } catch (e) {
    alert('Photo analysis is not configured. Add OPENAI_API_KEY on Netlify or add manually.');
  }
});

// Review modal helpers
function openReview() {
  reviewItemsEl.innerHTML = '';
  let total = 0;
  pendingItems.forEach((it, i) => {
    total += Number(it.calories||0);
    const row = document.createElement('div');
    row.className = 'grid grid-cols-[1fr_auto] gap-2 items-center bg-gray-800/40 rounded-xl p-2';
    row.innerHTML = \`
      <div>
        <input data-i="\${i}" data-k="name" class="input w-full" value="\${it.name || ''}"/>
        <div class="text-[10px] text-gray-400 mt-1">Confidence: \${Math.round((it.confidence||0)*100)}%</div>
      </div>
      <div class="grid grid-cols-[auto_auto] gap-2 items-center">
        <input data-i="\${i}" data-k="calories" type="number" min="0" class="input w-24 text-right" value="\${it.calories || 0}"/>
        <div class="text-sm font-semibold">kcal</div>
      </div>
    \`;
    reviewItemsEl.appendChild(row);
  });
  reviewTotalEl.textContent = \`\${Math.round(total)} kcal\`;
  openModal(reviewModal);
}

reviewItemsEl.addEventListener('input', (e)=>{
  const t = e.target;
  const i = Number(t.getAttribute('data-i'));
  const k = t.getAttribute('data-k');
  if (k==='name') pendingItems[i].name = t.value;
  if (k==='calories') pendingItems[i].calories = Number(t.value||0);
  const total = pendingItems.reduce((a,b)=>a+Number(b.calories||0),0);
  reviewTotalEl.textContent = \`\${Math.round(total)} kcal\`;
});

confirmConsumeBtn.addEventListener('click', ()=>{
  const d = datePicker.value;
  pendingItems.forEach(it => addLog(d, { id: uid(), name: it.name, calories: Math.round(Number(it.calories||0)), source: it.source||'vision', ts: Date.now() }));
  pendingItems = [];
  closeModal(reviewModal);
  renderLogs(); updateChart();
});

// Barcode scanning
async function startScanner() {
  if (scanner) return;
  try {
    stopCamera();
    scanner = new BrowserMultiFormatReader();
    scanningBarcode = true;
    viewer.classList.remove('hidden');
    btnStop.classList.remove('hidden');
    const controls = await scanner.decodeFromVideoDevice(null, video, async (result, err, controls) => {
      if (result) {
        scanningBarcode = false;
        controls.stop();
        await onBarcode(result.getText());
      }
    });
  } catch (e) {
    alert('Could not start barcode scanner. You can enter manually instead.');
    stopScanner();
  }
}
function stopScanner() {
  try { scanner && scanner.reset(); } catch {}
  scanningBarcode = false;
  scanner = null;
  viewer.classList.add('hidden');
  btnStop.classList.add('hidden');
}

btnScan.addEventListener('click', startScanner);

async function onBarcode(code) {
  try {
    const u = new URL('/.netlify/functions/barcode', window.location.origin);
    u.searchParams.set('code', code);
    const res = await fetch(u);
    if (!res.ok) throw new Error('Barcode lookup failed');
    const out = await res.json();
    if (!out || !out.name) throw new Error('No product info');
    const calories = Math.round(out.calories || 0);
    pendingItems = [{ id: uid(), name: out.name, calories, source: 'barcode', confidence: 1 }];
    openReview();
  } catch (e) {
    alert('Barcode not found. You can add it manually.');
  }
}

// Init
function init() {
  datePicker.value = todayISO();
  renderLogs();
  updateChart();
}
datePicker.addEventListener('change', ()=>{ renderLogs(); updateChart(); });

init();
