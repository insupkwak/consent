const map = L.map('map', {
  zoomSnap: 0.25,
  worldCopyJump: false
}).setView([22, 48], 3.5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const form = document.getElementById('vesselForm');
const vesselList = document.getElementById('vesselList');
const resetBtn = document.getElementById('resetBtn');
const mapWrap = document.getElementById('mapWrap');
const labelLayer = document.getElementById('labelLayer');
const consentFileInput = document.getElementById('consentFileInput');
const reportViewBtn = document.getElementById('reportViewBtn');
const positionUpdateBtn = document.getElementById('positionUpdateBtn');
const positionExcelInput = document.getElementById('positionExcelInput');

const toggleAllLabelsBtn = document.getElementById('toggleAllLabelsBtn');
const filterAllBtn = document.getElementById('filterAllBtn');
const filterCrewConfirmedBtn = document.getElementById('filterCrewConfirmedBtn');
const filterCrewPendingBtn = document.getElementById('filterCrewPendingBtn');
const filterNoConsentBtn = document.getElementById('filterNoConsentBtn');
const filterFujairahBtn = document.getElementById('filterFujairahBtn');
const filterYanbuBtn = document.getElementById('filterYanbuBtn');
const filterBothBtn = document.getElementById('filterBothBtn');

const shipSearchInput = document.getElementById('shipSearchInput');
const shipSearchDropdown = document.getElementById('shipSearchDropdown');

const countAll = document.getElementById('countAll');
const countCrewConfirmed = document.getElementById('countCrewConfirmed');
const countCrewPending = document.getElementById('countCrewPending');
const countNoConsent = document.getElementById('countNoConsent');
const countFujairah = document.getElementById('countFujairah');
const countYanbu = document.getElementById('countYanbu');
const countBoth = document.getElementById('countBoth');

let vessels = [];
let markers = [];
let nameMarkers = [];
let editIndex = null;
let labelObjects = [];

let labelMode = 'none';
let activeLabelIndex = null;
let currentFilter = 'all';
let uploadTargetIndex = null;
let isLoading = false;

const shipSvg = (color) => `
  <div class="ship-icon">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M32 6 L40 18 L40 30 L50 34 L55 46 L32 58 L9 46 L14 34 L24 30 L24 18 Z"
            fill="${color}"
            stroke="#0f172a"
            stroke-width="3"
            stroke-linejoin="round"/>
      <path d="M28 14 H36 V28 H28 Z" fill="#ffffff" opacity="0.95"/>
      <path d="M19 43 Q32 50 45 43" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
    </svg>
  </div>
`;

function shipNameHtml(name) {
  return `<div class="ship-name-text">${escapeHtml(name)}</div>`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeConsent(value) {
  return String(value || '').trim();
}

function normalizeCrewPlanStatus(value) {
  const v = String(value || '').trim();
  if (v === '확정' || v === '미정' || v === '불요') return v;
  return '불요';
}

function hasText(value) {
  return String(value ?? '').trim() !== '';
}

function makeOptionalLine(label, value, className = 'map-value-normal') {
  if (!hasText(value)) return '';
  return `<div class="line"><span class="label-name">${label}:</span> <span class="${className}">${escapeHtml(value)}</span></div>`;
}

function getVesselColor(vessel) {
  if (normalizeConsent(vessel.consentLetter) === '미확보') {
    return 'red';
  }

  if (vessel.crewPlanStatus === '확정') {
    return 'yellow';
  }

  if (vessel.crewPlanStatus === '미정') {
    return 'red';
  }

  return 'green';
}

function getShipIcon(vessel) {
  const type = getVesselColor(vessel);
  const fill = type === 'red'
    ? '#ef4444'
    : type === 'yellow'
      ? '#eab308'
      : '#22c55e';

  return L.divIcon({
    className: 'ship-icon-wrap',
    html: shipSvg(fill),
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

function getNameIcon(name) {
  return L.divIcon({
    className: 'ship-name-icon',
    html: shipNameHtml(name),
    iconSize: [120, 16],
    iconAnchor: [60, -2]
  });
}

function highlightValue(value) {
  if (value === '동의' || value === '확보' || value === '불요') {
    return `<span class="map-value-green">${escapeHtml(value)}</span>`;
  }
  if (value === '확인중' || value === '진행중' || value === '확정') {
    return `<span class="map-value-yellow">${escapeHtml(value)}</span>`;
  }
  if (value === '미동의' || value === '미확보' || value === '미정') {
    return `<span class="map-value-red">${escapeHtml(value)}</span>`;
  }
  return `<span class="map-value-normal">${escapeHtml(value || '-')}</span>`;
}

function highlightListValue(value) {
  if (value === '동의' || value === '확보' || value === '불요') {
    return `<span class="list-value-green">${escapeHtml(value)}</span>`;
  }
  if (value === '확인중' || value === '진행중' || value === '확정') {
    return `<span class="list-value-yellow">${escapeHtml(value)}</span>`;
  }
  if (value === '미동의' || value === '미확보' || value === '미정') {
    return `<span class="list-value-red">${escapeHtml(value)}</span>`;
  }
  return `<span class="list-value-normal">${escapeHtml(value || '-')}</span>`;
}

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `$${num.toLocaleString('en-US')}`;
}

function isBothPossible(vessel) {
  return normalizeConsent(vessel.fujairahConsent) === '동의'
    && normalizeConsent(vessel.yanbuConsent) === '동의';
}

function getFilteredVessels() {
  if (currentFilter === 'crewConfirmed') {
    return vessels.filter(v => normalizeCrewPlanStatus(v.crewPlanStatus) === '확정');
  }

  if (currentFilter === 'crewPending') {
    return vessels.filter(v => normalizeCrewPlanStatus(v.crewPlanStatus) === '미정');
  }

  if (currentFilter === 'fujairah') {
    return vessels.filter(v => normalizeConsent(v.fujairahConsent) === '동의');
  }

  if (currentFilter === 'yanbu') {
    return vessels.filter(v => normalizeConsent(v.yanbuConsent) === '동의');
  }

  if (currentFilter === 'both') {
    return vessels.filter(v => isBothPossible(v));
  }

  if (currentFilter === 'noConsent') {
    return vessels.filter(v => normalizeConsent(v.consentLetter) === '미확보');
  }

  return vessels;
}

function getConsentViewUrl(vessel) {
  return vessel.consentFile ? `/uploads/consent_letters/${encodeURIComponent(vessel.consentFile)}?_=${Date.now()}` : '';
}

function makeConsentButtons(index, vessel) {
  const hasFile = !!vessel.consentFile;

  return `
    <button type="button" class="map-mini-btn view" onclick="viewConsentFile(${index})" ${hasFile ? '' : 'disabled'}>동의서</button>
    <button type="button" class="map-mini-btn upload" onclick="openConsentUpload(${index})">업로드</button>
  `;
}

function makeBonusBlock(vessel) {
  const lines = [];

  if (hasText(vessel.bonusCount)) {
    lines.push(`<div class="line"><span class="label-name">보너스횟수:</span> <span class="map-value-normal">${escapeHtml(vessel.bonusCount)}회</span></div>`);
  }

  if (hasText(vessel.bonusAmount)) {
    lines.push(`<div class="line"><span class="label-name">보너스총액:</span> <span class="map-value-normal">${escapeHtml(formatMoney(vessel.bonusAmount))}</span></div>`);
  }

  return lines.join('');
}

function makeCrewPlanBlock(vessel) {
  const crewPlanStatus = normalizeCrewPlanStatus(vessel.crewPlanStatus);

  if (crewPlanStatus === '불요') {
    return `
      <div class="line"><span class="label-name">선원교대 계획:</span> ${highlightValue(crewPlanStatus)}</div>
    `;
  }

  return `
    <div class="line"><span class="label-name">선원교대 계획:</span> ${highlightValue(crewPlanStatus)}</div>
    ${makeOptionalLine('선원교대 인원', hasText(vessel.crewCount) ? `${vessel.crewCount}명` : '')}
    ${makeOptionalLine('선원교대 날짜', vessel.crewDate)}
    ${makeOptionalLine('선원교대 항구', vessel.crewPort)}
    ${makeOptionalLine('선원교대 상세', vessel.crewPlanDetail)}
  `;
}

function makeLabelHtml(vessel, index) {
  const cls = getVesselColor(vessel);

  return `
    <div class="map-label ${cls}" data-index="${index}">
      <div class="title">${escapeHtml(vessel.name)}</div>
      <div class="line"><span class="label-name">푸자이라:</span> ${highlightValue(vessel.fujairahConsent)}</div>
      <div class="line"><span class="label-name">얀부:</span> ${highlightValue(vessel.yanbuConsent)}</div>
      <div class="line"><span class="label-name">동의서:</span> ${highlightValue(vessel.consentLetter)}</div>
      ${makeOptionalLine('항차계획', vessel.voyagePlan)}
      ${makeCrewPlanBlock(vessel)}
      ${makeBonusBlock(vessel)}
      <div class="map-label-actions">
        <button type="button" class="map-mini-btn edit" onclick="editVessel(${index})">수정</button>
        ${makeConsentButtons(index, vessel)}
      </div>
    </div>
  `;
}

function updateToolbarButtons() {
  const buttonMap = {
    all: filterAllBtn,
    crewConfirmed: filterCrewConfirmedBtn,
    crewPending: filterCrewPendingBtn,
    noConsent: filterNoConsentBtn,
    fujairah: filterFujairahBtn,
    yanbu: filterYanbuBtn,
    both: filterBothBtn
  };

  Object.values(buttonMap).forEach(btn => {
    if (btn) btn.classList.remove('active');
  });

  if (buttonMap[currentFilter]) {
    buttonMap[currentFilter].classList.add('active');
  }
}

function updateStatusBoard() {
  if (countAll) {
    countAll.textContent = `${vessels.length}척`;
  }

  if (countCrewConfirmed) {
    countCrewConfirmed.textContent = `${vessels.filter(v => normalizeCrewPlanStatus(v.crewPlanStatus) === '확정').length}척`;
  }

  if (countCrewPending) {
    countCrewPending.textContent = `${vessels.filter(v => normalizeCrewPlanStatus(v.crewPlanStatus) === '미정').length}척`;
  }

  if (countNoConsent) {
    countNoConsent.textContent = `${vessels.filter(v => normalizeConsent(v.consentLetter) === '미확보').length}척`;
  }

  if (countFujairah) {
    countFujairah.textContent = `${vessels.filter(v => normalizeConsent(v.fujairahConsent) === '동의').length}척`;
  }

  if (countYanbu) {
    countYanbu.textContent = `${vessels.filter(v => normalizeConsent(v.yanbuConsent) === '동의').length}척`;
  }

  if (countBoth) {
    countBoth.textContent = `${vessels.filter(v => isBothPossible(v)).length}척`;
  }

  updateToolbarButtons();
}

async function loadData(options = {}) {
  const {
    preserveSelection = true,
    silent = false,
    fitBounds = false
  } = options;

  if (isLoading) return;

  isLoading = true;

  const previousEditName = preserveSelection && editIndex !== null && vessels[editIndex]
    ? String(vessels[editIndex].name || '').trim().toLowerCase()
    : '';

  const previousActiveName = preserveSelection && activeLabelIndex !== null && vessels[activeLabelIndex]
    ? String(vessels[activeLabelIndex].name || '').trim().toLowerCase()
    : '';

  try {
    const response = await fetch(`/api/vessels?_=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`데이터 불러오기 실패: ${response.status}`);
    }

    vessels = await response.json();

    if (!Array.isArray(vessels)) {
      vessels = [];
    }

    vessels = vessels.map(v => ({
      ...v,
      crewPlanStatus: normalizeCrewPlanStatus(v.crewPlanStatus),
      crewDate: v.crewDate || '',
      voyagePlan: v.voyagePlan || ''
    }));

    if (previousEditName) {
      const newEditIndex = vessels.findIndex(v => String(v.name || '').trim().toLowerCase() === previousEditName);
      editIndex = newEditIndex >= 0 ? newEditIndex : null;
    }

    if (previousActiveName) {
      const newActiveIndex = vessels.findIndex(v => String(v.name || '').trim().toLowerCase() === previousActiveName);
      activeLabelIndex = newActiveIndex >= 0 ? newActiveIndex : null;
      if (newActiveIndex < 0 && labelMode === 'one') {
        labelMode = 'none';
      }
    }

    updateStatusBoard();
    renderList();
    renderMap(fitBounds);
    renderSearchSuggestions('');

    if (!silent) {
      console.log('최신 데이터 동기화 완료');
    }
  } catch (error) {
    console.error('데이터 불러오기 실패:', error);
    vessels = [];
    editIndex = null;
    activeLabelIndex = null;
    labelMode = 'none';
    updateStatusBoard();
    renderList();
    renderMap(fitBounds);
    renderSearchSuggestions('');
  } finally {
    isLoading = false;
  }
}

async function saveSingleVessel(vesselData) {
  try {
    const response = await fetch(`/api/vessel?_=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      body: JSON.stringify(vesselData)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      alert(result.message || '저장 중 오류가 발생했습니다.');
      return false;
    }

    return true;
  } catch (error) {
    console.error('데이터 저장 실패:', error);
    alert('서버 저장에 실패했습니다.');
    return false;
  }
}

async function deleteSingleVesselByName(vesselName) {
  try {
    const response = await fetch(`/api/vessel/${encodeURIComponent(vesselName)}?_=${Date.now()}`, {
      method: 'DELETE',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      alert(result.message || '삭제 중 오류가 발생했습니다.');
      return false;
    }

    return true;
  } catch (error) {
    console.error('데이터 삭제 실패:', error);
    alert('서버 삭제에 실패했습니다.');
    return false;
  }
}

async function uploadConsentFile(index, file) {
  const vessel = vessels[index];
  const formData = new FormData();
  formData.append('vesselName', vessel.name);
  formData.append('file', file);

  try {
    const response = await fetch(`/api/upload-consent?_=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      body: formData,
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      alert(result.message || '동의서 업로드에 실패했습니다.');
      return;
    }

    await loadData({ preserveSelection: true, fitBounds: false });
    renderSearchSuggestions(shipSearchInput.value.trim());
    alert('동의서가 업로드되었습니다. 기존 파일은 덮어쓰기 되었습니다.');
  } catch (error) {
    console.error(error);
    alert('동의서 업로드 중 오류가 발생했습니다.');
  }
}

async function uploadPositionExcel(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`/api/upload-positions?_=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      body: formData,
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      alert(result.message || '위치 업데이트에 실패했습니다.');
      return;
    }

    await loadData({ preserveSelection: true, fitBounds: false });
    renderSearchSuggestions(shipSearchInput.value.trim());

    alert(
      `위치 업데이트 완료\n` +
      `- 전체 행: ${result.totalRows}건\n` +
      `- 업데이트: ${result.updatedCount}척\n` +
      `- 미일치: ${result.notFoundCount}척\n` +
      `- 좌표오류: ${result.invalidCount}건`
    );
  } catch (error) {
    console.error('위치 업데이트 실패:', error);
    alert('위치 업데이트 중 오류가 발생했습니다.');
  }
}

function clearMarkers() {
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];
}

function clearNameMarkers() {
  nameMarkers.forEach(marker => map.removeLayer(marker));
  nameMarkers = [];
}

function clearLabels() {
  labelLayer.innerHTML = '';
  labelObjects = [];
}

function fitToVisibleMarkers(visibleMarkers) {
  if (!visibleMarkers.length) return;
  const group = L.featureGroup(visibleMarkers);
  map.fitBounds(group.getBounds().pad(0.55), { maxZoom: 5.5 });
}

function handleShipClick(globalIndex) {
  if (labelMode === 'one' && activeLabelIndex === globalIndex) {
    labelMode = 'none';
    activeLabelIndex = null;
  } else {
    labelMode = 'one';
    activeLabelIndex = globalIndex;
  }

  renderExternalLabels();
}

function renderMap(fitBounds = false) {
  clearMarkers();
  clearNameMarkers();

  const filtered = getFilteredVessels();
  const visibleMarkers = [];

  filtered.forEach((vessel) => {
    const globalIndex = vessels.findIndex(v => v === vessel);

    const marker = L.marker([vessel.latitude, vessel.longitude], {
      icon: getShipIcon(vessel)
    }).addTo(map);

    marker.on('click', () => {
      fillFormByVessel(globalIndex);
      handleShipClick(globalIndex);
    });

    markers.push(marker);
    visibleMarkers.push(marker);

    const nameMarker = L.marker([vessel.latitude, vessel.longitude], {
      icon: getNameIcon(vessel.name),
      interactive: false,
      keyboard: false
    }).addTo(map);

    nameMarkers.push(nameMarker);
  });

  if (fitBounds && visibleMarkers.length) {
    fitToVisibleMarkers(visibleMarkers);
  }

  setTimeout(renderExternalLabels, 120);
}

function distributeVerticalSlots(count, totalHeight, boxH, gap, topPad = 16, bottomPad = 90) {
  if (count === 0) return [];

  const usableHeight = totalHeight - topPad - bottomPad;
  const totalNeed = count * boxH + (count - 1) * gap;

  let startY = topPad;
  if (totalNeed < usableHeight) {
    startY = topPad + (usableHeight - totalNeed) / 2;
  }

  const slots = [];
  for (let i = 0; i < count; i++) {
    slots.push(startY + i * (boxH + gap));
  }
  return slots;
}

function distributeHorizontalSlots(count, totalWidth, boxW, gap, leftPad = 16, rightPad = 16) {
  if (count === 0) return [];

  const usableWidth = totalWidth - leftPad - rightPad;
  const totalNeed = count * boxW + (count - 1) * gap;

  let startX = leftPad;
  if (totalNeed < usableWidth) {
    startX = leftPad + (usableWidth - totalNeed) / 2;
  }

  const slots = [];
  for (let i = 0; i < count; i++) {
    slots.push(startX + i * (boxW + gap));
  }
  return slots;
}

function drawLeader(line, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  line.style.width = `${length}px`;
  line.style.left = `${x1}px`;
  line.style.top = `${y1}px`;
  line.style.transform = `rotate(${angle}deg)`;
}

function createEdgeLabel(item, left, top, width, height, side) {
  const box = document.createElement('div');
  box.innerHTML = makeLabelHtml(item.vessel, item.index);

  const label = box.firstElementChild;
  label.style.left = `${left}px`;
  label.style.top = `${top}px`;
  label.style.width = `${width}px`;
  labelLayer.appendChild(label);

  const line = document.createElement('div');
  line.className = 'leader-line';
  labelLayer.appendChild(line);

  const fromX = item.point.x;
  const fromY = item.point.y;

  let toX = left + width / 2;
  let toY = top + height / 2;

  if (side === 'left') {
    toX = left + width;
    toY = top + height / 2;
  } else if (side === 'right') {
    toX = left;
    toY = top + height / 2;
  } else if (side === 'top') {
    toX = left + width / 2;
    toY = top + height;
  } else if (side === 'bottom') {
    toX = left + width / 2;
    toY = top;
  }

  drawLeader(line, fromX, fromY, toX, toY);

  labelObjects.push({
    label,
    line,
    item,
    side
  });
}

function getCurrentlyVisibleTargetVessels() {
  const bounds = map.getBounds();
  return getFilteredVessels().filter(vessel => bounds.contains([vessel.latitude, vessel.longitude]));
}

function renderExternalLabels() {
  clearLabels();

  if (labelMode === 'none') return;

  const wrapWidth = mapWrap.clientWidth;
  const wrapHeight = mapWrap.clientHeight;

  let renderTargets = [];

  if (labelMode === 'one' && activeLabelIndex !== null) {
    const vessel = vessels[activeLabelIndex];
    if (vessel && getFilteredVessels().includes(vessel)) {
      renderTargets = [{ vessel, index: activeLabelIndex }];
    }
  } else {
    const currentlyVisible = getCurrentlyVisibleTargetVessels();
    renderTargets = currentlyVisible.map(vessel => ({
      vessel,
      index: vessels.findIndex(v => v === vessel)
    }));
  }

  if (!renderTargets.length) return;

  const topItems = [];
  const bottomItems = [];
  const leftItems = [];
  const rightItems = [];

  const centerX = wrapWidth / 2;
  const centerY = wrapHeight / 2;

  renderTargets.forEach(({ vessel, index }) => {
    const point = map.latLngToContainerPoint([vessel.latitude, vessel.longitude]);
    const item = { vessel, index, point };

    const dx = point.x - centerX;
    const dy = point.y - centerY;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        leftItems.push(item);
      } else {
        rightItems.push(item);
      }
    } else {
      if (dy < 0) {
        topItems.push(item);
      } else {
        bottomItems.push(item);
      }
    }
  });

  topItems.sort((a, b) => a.point.x - b.point.x);
  bottomItems.sort((a, b) => a.point.x - b.point.x);
  leftItems.sort((a, b) => a.point.y - b.point.y);
  rightItems.sort((a, b) => a.point.y - b.point.y);

  const boxW = 250;
  const boxH = 250;
  const gap = 10;

  const topY = 70;
  const bottomY = wrapHeight - boxH - 0;
  const leftX = 16;
  const rightX = wrapWidth - boxW - 16;

  const topSlots = distributeHorizontalSlots(topItems.length, wrapWidth, boxW, gap, 16, 16);
  const bottomSlots = distributeHorizontalSlots(bottomItems.length, wrapWidth, boxW, gap, 16, 16);
  const leftSlots = distributeVerticalSlots(leftItems.length, wrapHeight, boxH, gap, 16, 90);
  const rightSlots = distributeVerticalSlots(rightItems.length, wrapHeight, boxH, gap, 16, 90);

  topItems.forEach((item, i) => createEdgeLabel(item, topSlots[i], topY, boxW, boxH, 'top'));
  bottomItems.forEach((item, i) => createEdgeLabel(item, bottomSlots[i], bottomY, boxW, boxH, 'bottom'));
  leftItems.forEach((item, i) => createEdgeLabel(item, leftX, leftSlots[i], boxW, boxH, 'left'));
  rightItems.forEach((item, i) => createEdgeLabel(item, rightX, rightSlots[i], boxW, boxH, 'right'));
}

function updateLeaderLines() {
  labelObjects.forEach(obj => {
    const point = map.latLngToContainerPoint([obj.item.vessel.latitude, obj.item.vessel.longitude]);
    const rect = obj.label.getBoundingClientRect();
    const wrapRect = mapWrap.getBoundingClientRect();

    const left = rect.left - wrapRect.left;
    const top = rect.top - wrapRect.top;
    const width = rect.width;
    const height = rect.height;

    let toX = left + width / 2;
    let toY = top + height / 2;

    if (obj.side === 'left') {
      toX = left + width;
      toY = top + height / 2;
    } else if (obj.side === 'right') {
      toX = left;
      toY = top + height / 2;
    } else if (obj.side === 'top') {
      toX = left + width / 2;
      toY = top + height;
    } else if (obj.side === 'bottom') {
      toX = left + width / 2;
      toY = top;
    }

    drawLeader(obj.line, point.x, point.y, toX, toY);
  });
}

function renderList() {
  vesselList.innerHTML = '';

  const filtered = getFilteredVessels();

  if (filtered.length === 0) {
    vesselList.innerHTML = '<div class="vessel-item"><small>표시할 선박이 없습니다.</small></div>';
    return;
  }

  filtered.forEach((vessel) => {
    const index = vessels.findIndex(v => v === vessel);
    const colorType = getVesselColor(vessel);
    const status = colorType === 'red' ? '빨간색' : colorType === 'yellow' ? '노란색' : '녹색';
    const hasConsentFile = !!vessel.consentFile;

    const item = document.createElement('div');
    item.className = 'vessel-item';
    item.innerHTML = `
      <strong>${escapeHtml(vessel.name)}</strong>
      <small>푸자이라항: ${highlightListValue(vessel.fujairahConsent)}</small>
      <small>얀부항: ${highlightListValue(vessel.yanbuConsent)}</small>
      <small>동의서: ${highlightListValue(vessel.consentLetter)}</small>
      ${hasText(vessel.voyagePlan) ? `<small>항차계획: ${escapeHtml(vessel.voyagePlan)}</small>` : ''}
      <small>선원교대 계획: ${highlightListValue(normalizeCrewPlanStatus(vessel.crewPlanStatus))}</small>
      ${hasText(vessel.crewCount) ? `<small>선원교대 인원: ${escapeHtml(vessel.crewCount)}명</small>` : ''}
      ${hasText(vessel.crewDate) ? `<small>선원교대 날짜: ${escapeHtml(vessel.crewDate)}</small>` : ''}
      ${hasText(vessel.crewPort) ? `<small>선원교대 항구: ${escapeHtml(vessel.crewPort)}</small>` : ''}
      ${hasText(vessel.crewPlanDetail) ? `<small>선원교대 상세: ${escapeHtml(vessel.crewPlanDetail)}</small>` : ''}
      ${hasText(vessel.bonusCount) ? `<small>보너스 횟수: ${escapeHtml(vessel.bonusCount)}회</small>` : ''}
      ${hasText(vessel.bonusAmount) ? `<small>보너스 총액: ${escapeHtml(formatMoney(vessel.bonusAmount))}</small>` : ''}
      <small>표시색: ${status}</small>
      <div class="actions">
        <button onclick="editVessel(${index})">수정</button>
        <button class="delete-btn" onclick="deleteVessel(${index})">삭제</button>
        <button class="view-btn" onclick="viewConsentFile(${index})" ${hasConsentFile ? '' : 'disabled'}>동의서</button>
        <button class="upload-btn" onclick="openConsentUpload(${index})">업로드</button>
      </div>
    `;
    vesselList.appendChild(item);
  });
}

function resetForm() {
  form.reset();
  document.getElementById('crewPlanStatus').value = '불요';
  editIndex = null;
}

function setFilter(filterName) {
  currentFilter = filterName;
  labelMode = 'none';
  activeLabelIndex = null;
  updateToolbarButtons();
  renderList();
  renderMap(true);
}

function focusVesselFromSearch(index) {
  const vessel = vessels[index];
  if (!vessel) return;

  currentFilter = 'all';
  updateToolbarButtons();
  renderList();
  renderMap(false);

  map.setView([vessel.latitude, vessel.longitude], 5.5);
  labelMode = 'one';
  activeLabelIndex = index;

  setTimeout(() => {
    renderExternalLabels();
    updateLeaderLines();
  }, 150);
}

function renderSearchSuggestions(keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  shipSearchDropdown.innerHTML = '';

  if (!q) {
    shipSearchDropdown.classList.remove('show');
    return;
  }

  const matched = vessels.filter(v => String(v.name || '').toLowerCase().includes(q)).slice(0, 20);

  if (!matched.length) {
    const empty = document.createElement('div');
    empty.className = 'search-item';
    empty.textContent = '검색 결과 없음';
    shipSearchDropdown.appendChild(empty);
    shipSearchDropdown.classList.add('show');
    return;
  }

  matched.forEach(vessel => {
    const index = vessels.findIndex(v => v === vessel);
    const item = document.createElement('div');
    item.className = 'search-item';
    item.textContent = vessel.name;
    item.addEventListener('click', () => {
      shipSearchInput.value = vessel.name;
      shipSearchDropdown.classList.remove('show');
      focusVesselFromSearch(index);
    });
    shipSearchDropdown.appendChild(item);
  });

  shipSearchDropdown.classList.add('show');
}

toggleAllLabelsBtn.addEventListener('click', () => {
  if (labelMode === 'all') {
    labelMode = 'none';
  } else {
    labelMode = 'all';
    activeLabelIndex = null;
  }
  renderExternalLabels();
});

filterAllBtn.addEventListener('click', () => setFilter('all'));
filterCrewConfirmedBtn.addEventListener('click', () => setFilter('crewConfirmed'));
filterCrewPendingBtn.addEventListener('click', () => setFilter('crewPending'));
filterNoConsentBtn.addEventListener('click', () => setFilter('noConsent'));
filterFujairahBtn.addEventListener('click', () => setFilter('fujairah'));
filterYanbuBtn.addEventListener('click', () => setFilter('yanbu'));
filterBothBtn.addEventListener('click', () => setFilter('both'));

shipSearchInput.addEventListener('input', (e) => {
  renderSearchSuggestions(e.target.value);
});

shipSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();

    const keyword = shipSearchInput.value.trim().toLowerCase();
    if (!keyword) return;

    const foundIndex = vessels.findIndex(v => String(v.name || '').toLowerCase().includes(keyword));
    if (foundIndex >= 0) {
      shipSearchDropdown.classList.remove('show');
      focusVesselFromSearch(foundIndex);
    }
  }
});

document.addEventListener('click', (e) => {
  if (!shipSearchInput.contains(e.target) && !shipSearchDropdown.contains(e.target)) {
    shipSearchDropdown.classList.remove('show');
  }
});

consentFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || uploadTargetIndex === null) return;

  await uploadConsentFile(uploadTargetIndex, file);

  consentFileInput.value = '';
  uploadTargetIndex = null;
});

if (positionUpdateBtn) {
  positionUpdateBtn.addEventListener('click', () => {
    positionExcelInput.click();
  });
}

if (positionExcelInput) {
  positionExcelInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    await uploadPositionExcel(file);
    positionExcelInput.value = '';
  });
}

form.addEventListener('submit', async function (e) {
  e.preventDefault();

  const originalName = editIndex !== null ? (vessels[editIndex]?.name || '') : '';

  const vessel = {
    name: document.getElementById('vesselName').value.trim(),
    fujairahConsent: document.getElementById('fujairahConsent').value,
    yanbuConsent: document.getElementById('yanbuConsent').value,
    consentLetter: document.getElementById('consentLetter').value,
    voyagePlan: document.getElementById('voyagePlan').value.trim(),
    crewPlanStatus: document.getElementById('crewPlanStatus').value,
    crewCount: document.getElementById('crewCount').value.trim(),
    crewDate: document.getElementById('crewDate').value.trim(),
    crewPort: document.getElementById('crewPort').value.trim(),
    crewPlanDetail: document.getElementById('crewPlanDetail').value.trim(),
    bonusCount: document.getElementById('bonusCount').value.trim(),
    bonusAmount: document.getElementById('bonusAmount').value.trim(),
    latitude: parseFloat(document.getElementById('latitude').value),
    longitude: parseFloat(document.getElementById('longitude').value),
    _originalName: originalName
  };

  if (!vessel.name || Number.isNaN(vessel.latitude) || Number.isNaN(vessel.longitude)) {
    alert('선박명, 위도, 경도는 반드시 입력해야 합니다.');
    return;
  }

  const ok = await saveSingleVessel(vessel);
  if (!ok) return;

  await loadData({ preserveSelection: true, fitBounds: false });

  const newIndex = vessels.findIndex(v => (v.name || '').trim().toLowerCase() === vessel.name.toLowerCase());
  if (newIndex >= 0) {
    editIndex = newIndex;
    activeLabelIndex = newIndex;
    labelMode = 'one';
    fillFormByVessel(newIndex);
  } else {
    editIndex = null;
  }

  renderSearchSuggestions(shipSearchInput.value.trim());
});

resetBtn.addEventListener('click', resetForm);

if (reportViewBtn) {
  reportViewBtn.addEventListener('click', () => {
    window.open(`/report?_=${Date.now()}`, '_blank');
  });
}

function fillFormByVessel(index) {
  const vessel = vessels[index];
  if (!vessel) return;

  document.getElementById('vesselName').value = vessel.name || '';
  document.getElementById('fujairahConsent').value = vessel.fujairahConsent || '동의';
  document.getElementById('yanbuConsent').value = vessel.yanbuConsent || '동의';
  document.getElementById('consentLetter').value = vessel.consentLetter || '확보';
  document.getElementById('voyagePlan').value = vessel.voyagePlan || '';
  document.getElementById('crewPlanStatus').value = normalizeCrewPlanStatus(vessel.crewPlanStatus);
  document.getElementById('crewCount').value = vessel.crewCount || '';
  document.getElementById('crewDate').value = vessel.crewDate || '';
  document.getElementById('crewPort').value = vessel.crewPort || '';
  document.getElementById('crewPlanDetail').value = vessel.crewPlanDetail || '';
  document.getElementById('bonusCount').value = vessel.bonusCount || '';
  document.getElementById('bonusAmount').value = vessel.bonusAmount || '';
  document.getElementById('latitude').value = vessel.latitude ?? '';
  document.getElementById('longitude').value = vessel.longitude ?? '';

  editIndex = index;
}

window.editVessel = function (index) {
  fillFormByVessel(index);
  labelMode = 'one';
  activeLabelIndex = index;
  renderExternalLabels();
};

window.deleteVessel = async function (index) {
  const vessel = vessels[index];
  if (!vessel) return;

  if (!confirm('이 선박 정보를 삭제하시겠습니까?')) return;

  const ok = await deleteSingleVesselByName(vessel.name);
  if (!ok) return;

  await loadData({ preserveSelection: false, fitBounds: false });

  if (activeLabelIndex === index) {
    activeLabelIndex = null;
    labelMode = 'none';
  } else {
    activeLabelIndex = null;
  }

  renderSearchSuggestions(shipSearchInput.value.trim());

  if (editIndex === index) {
    resetForm();
  } else {
    editIndex = null;
  }
};

window.openConsentUpload = function (index) {
  uploadTargetIndex = index;
  consentFileInput.click();
};

window.viewConsentFile = function (index) {
  const vessel = vessels[index];
  const url = getConsentViewUrl(vessel);

  if (!url) {
    alert('업로드된 동의서가 없습니다.');
    return;
  }

  window.open(url, '_blank');
};

map.on('zoomend moveend resize', () => {
  renderExternalLabels();
  setTimeout(updateLeaderLines, 30);
});

window.addEventListener('resize', () => {
  renderExternalLabels();
  setTimeout(updateLeaderLines, 30);
});

window.addEventListener('focus', () => {
  loadData({ preserveSelection: true, silent: true, fitBounds: false });
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadData({ preserveSelection: true, silent: true, fitBounds: false });
  }
});

setInterval(() => {
  if (document.visibilityState === 'visible') {
    loadData({ preserveSelection: true, silent: true, fitBounds: false });
  }
}, 600000);

loadData({ preserveSelection: true, fitBounds: true });