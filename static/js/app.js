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
const filterAgBtn = document.getElementById('filterAgBtn');
const filterBothAreaBtn = document.getElementById('filterBothAreaBtn');
const filterOtherBtn = document.getElementById('filterOtherBtn');
const filterUnder15Btn = document.getElementById('filterUnder15Btn');
const filterDryDock6mBtn = document.getElementById('filterDryDock6mBtn');
const countDryDock6m = document.getElementById('countDryDock6m');

const filterFujairahBtn = document.getElementById('filterFujairahBtn');
const filterYanbuBtn = document.getElementById('filterYanbuBtn');
const filterCrewConfirmedBtn = document.getElementById('filterCrewConfirmedBtn');
const filterCrewPendingBtn = document.getElementById('filterCrewPendingBtn');

const shipSearchInput = document.getElementById('shipSearchInput');
const shipSearchDropdown = document.getElementById('shipSearchDropdown');

const countAll = document.getElementById('countAll');
const countAg = document.getElementById('countAg');
const countBothArea = document.getElementById('countBothArea');
const countOther = document.getElementById('countOther');
const countUnder15 = document.getElementById('countUnder15');
const countFujairah = document.getElementById('countFujairah');
const countYanbu = document.getElementById('countYanbu');
const countCrewConfirmed = document.getElementById('countCrewConfirmed');
const countCrewPending = document.getElementById('countCrewPending');

const allViewStateText = document.getElementById('allViewStateText');

let vessels = [];
let markers = [];
let nameMarkers = [];
let editIndex = null;
let editingOriginalName = '';
let labelObjects = [];

let labelMode = 'none';
let activeLabelIndex = null;
let currentFilter = 'all';
let uploadTargetIndex = null;
let isLoading = false;
let isSaving = false;
let hiddenLabelIndices = new Set();

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

const positionResultModal = document.getElementById('positionResultModal');
const closePositionResultBtn = document.getElementById('closePositionResultBtn');
const positionResultSummary = document.getElementById('positionResultSummary');
const positionResultFailedList = document.getElementById('positionResultFailedList');

function openPositionResultModal(successCount, failedList) {
  const failedCount = failedList.length;

  positionResultSummary.textContent =
    `업데이트 완료 : ${successCount}척\n업데이트 실패 : ${failedCount}척`;

  if (failedCount === 0) {
    positionResultFailedList.textContent = '없음';
  } else {
    positionResultFailedList.innerHTML = failedList
      .map(name => `<div class="position-result-list-item">${escapeHtml(name.replace(/^\s*-\s*/, ''))}</div>`)
      .join('');
  }

  positionResultModal.hidden = false;
}

function closePositionResultModal() {
  positionResultModal.hidden = true;
}

if (closePositionResultBtn) {
  closePositionResultBtn.addEventListener('click', closePositionResultModal);
}

if (positionResultModal) {
  const backdrop = positionResultModal.querySelector('.position-result-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', closePositionResultModal);
  }
}

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

function normalizeCategory(value) {
  const v = String(value || '').trim();
  if (v === 'AG 내' || v === '얀부, 푸자이라' || v === '그외 지역') return v;
  return 'AG 내';
}

function normalizeCrewPlanStatus(value) {
  const v = String(value || '').trim();
  if (v === '불요' || v === '확정' || v === '미정') return v;
  return '불요';
}

function getCategoryDisplayMask(category) {
  const c = normalizeCategory(category);

  if (c === 'AG 내') {
    return {
      fujairahConsent: false,
      yanbuConsent: false,
      consentLetter: true,
      voyagePlan: true,
      agSupplyPlan: true,
      crewPlanStatus: true,
      crewCount: true,
      crewDate: true,
      crewPort: true,
      crewPlanDetail: true
    };
  }

  if (c === '얀부, 푸자이라') {
    return {
      fujairahConsent: true,
      yanbuConsent: true,
      consentLetter: true,
      voyagePlan: true,
      agSupplyPlan: false,
      crewPlanStatus: true,
      crewCount: true,
      crewDate: true,
      crewPort: true,
      crewPlanDetail: true
    };
  }

  return {
    fujairahConsent: false,
    yanbuConsent: false,
    consentLetter: false,
    voyagePlan: true,
    agSupplyPlan: false,
    crewPlanStatus: true,
    crewCount: true,
    crewDate: true,
    crewPort: true,
    crewPlanDetail: true
  };
}

function handleConsentByCategory() {
  const category = document.getElementById('category')?.value || '';
  const consent = document.getElementById('consentLetter');

  if (!consent) return;

  if (category === '그외 지역') {
    consent.value = '불요';
  } else {
    if (consent.value === '불요') {
      consent.value = '';
    }
  }
}

function toggleRow(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('hidden-by-category', !visible);
}

function applyCategoryVisibility(categoryValue) {
  const mask = getCategoryDisplayMask(categoryValue);

  toggleRow('row-fujairahConsent', mask.fujairahConsent);
  toggleRow('row-yanbuConsent', mask.yanbuConsent);
  toggleRow('row-consentLetter', mask.consentLetter);
  toggleRow('row-voyagePlan', mask.voyagePlan);
  toggleRow('row-agSupplyPlan', mask.agSupplyPlan);
  toggleRow('row-crewPlanStatus', mask.crewPlanStatus);
  toggleRow('row-crewCount', mask.crewCount);
  toggleRow('row-crewDate', mask.crewDate);
  toggleRow('row-crewPort', mask.crewPort);
  toggleRow('row-crewPlanDetail', mask.crewPlanDetail);

  const crewStatus = document.getElementById('crewPlanStatus')?.value || '불요';
  const showCrewDetail = mask.crewPlanStatus && normalizeCrewPlanStatus(crewStatus) !== '불요';

  toggleRow('row-crewCount', showCrewDetail && mask.crewCount);
  toggleRow('row-crewDate', showCrewDetail && mask.crewDate);
  toggleRow('row-crewPort', showCrewDetail && mask.crewPort);
  toggleRow('row-crewPlanDetail', showCrewDetail && mask.crewPlanDetail);
}

const categorySelect = document.getElementById('category');

if (categorySelect) {
  categorySelect.addEventListener('change', () => {
    applyCategoryVisibility(categorySelect.value);
    handleConsentByCategory();
    renderExternalLabels();
    renderList();
  });
}

const crewPlanStatusSelect = document.getElementById('crewPlanStatus');

if (crewPlanStatusSelect) {
  crewPlanStatusSelect.addEventListener('change', () => {
    const category = document.getElementById('category')?.value || 'AG 내';
    applyCategoryVisibility(category);
  });
}

function hasText(value) {
  return String(value ?? '').trim() !== '';
}

function makeOptionalLine(label, value, className = 'map-value-normal') {
  if (!hasText(value)) return '';
  return `<div class="line"><span class="label-name">${label}:</span> <span class="${className}">${escapeHtml(value)}</span></div>`;
}

function parseDateOnly(dateString) {
  const text = String(dateString || '').trim();
  if (!text) return null;

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);

  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }

  return dt;
}

function getVesselAgeYears(deliveryDate) {
  const dt = parseDateOnly(deliveryDate);
  if (!dt) return null;

  const now = new Date();
  const diffMs = now.getTime() - dt.getTime();
  if (diffMs < 0) return 0;

  const years = diffMs / (1000 * 60 * 60 * 24 * 365.2425);
  return years;
}

function formatVesselAge(deliveryDate) {
  const years = getVesselAgeYears(deliveryDate);
  if (years === null) return '';
  return `${years.toFixed(1)}년`;
}

function isUnder15Years(vessel) {
  const years = getVesselAgeYears(vessel.deliveryDate);
  if (years === null) return false;
  return years < 15;
}

function isDryDockWithin6MonthsOrOverdue(vessel) {
  const dt = parseDateOnly(vessel.nextDryDock);
  if (!dt) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sixMonthsLater = new Date(today);
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

  return dt <= sixMonthsLater;
}

function getVesselColor(vessel) {
  if (normalizeConsent(vessel.consentLetter) === '미확보') {
    return 'red';
  }

  if (normalizeConsent(vessel.consentLetter) === '진행중') {
    return 'orange';
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
    : type === 'orange'
      ? '#f97316'
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
  if (currentFilter === 'ag') {
    return vessels.filter(v => normalizeCategory(v.category) === 'AG 내');
  }

  if (currentFilter === 'bothArea') {
    return vessels.filter(v => normalizeCategory(v.category) === '얀부, 푸자이라');
  }

  if (currentFilter === 'other') {
    return vessels.filter(v => normalizeCategory(v.category) === '그외 지역');
  }

  if (currentFilter === 'under15') {
    return vessels.filter(v => isUnder15Years(v));
  }


  if (currentFilter === 'dryDock6m') {
    return vessels.filter(v => isDryDockWithin6MonthsOrOverdue(v));
  }

  
  if (currentFilter === 'fujairah') {
    return vessels.filter(v => normalizeConsent(v.fujairahConsent) === '동의');
  }

  if (currentFilter === 'yanbu') {
    return vessels.filter(v => normalizeConsent(v.yanbuConsent) === '동의');
  }

  if (currentFilter === 'crewConfirmed') {
    return vessels.filter(v => normalizeCrewPlanStatus(v.crewPlanStatus) === '확정');
  }

  if (currentFilter === 'crewPending') {
    return vessels.filter(v => normalizeCrewPlanStatus(v.crewPlanStatus) === '미정');
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

function makeCrewPlanBlock(vessel, mask) {
  const crewPlanStatus = normalizeCrewPlanStatus(vessel.crewPlanStatus);

  if (!mask.crewPlanStatus) {
    return '';
  }

  let html = `<div class="line"><span class="label-name">선원교대 계획:</span> ${highlightValue(crewPlanStatus)}</div>`;

  if (crewPlanStatus !== '불요') {
    if (mask.crewCount) {
      html += makeOptionalLine('선원교대 인원', hasText(vessel.crewCount) ? `${vessel.crewCount}명` : '');
    }
    if (mask.crewDate) {
      html += makeOptionalLine('선원교대 날짜', vessel.crewDate);
    }
    if (mask.crewPort) {
      html += makeOptionalLine('선원교대 항구', vessel.crewPort);
    }
    if (mask.crewPlanDetail) {
      html += makeOptionalLine('선원교대 상세', vessel.crewPlanDetail);
    }
  }

  return html;
}



function makeLabelHtml(vessel, index) {
  const cls = getVesselColor(vessel);
  const mask = getCategoryDisplayMask(vessel.category);
  const ageText = formatVesselAge(vessel.deliveryDate);

  const row = (label, value, extraClass = '') => {
    const text = String(value ?? '').trim();
    return `
      <div class="detail-row">
        <div class="detail-key">${escapeHtml(label)}</div>
        <div class="detail-val ${extraClass}">${text ? escapeHtml(text) : '-'}</div>
      </div>
    `;
  };

  const rowHtml = (label, html, extraClass = '') => `
    <div class="detail-row">
      <div class="detail-key">${escapeHtml(label)}</div>
      <div class="detail-val ${extraClass}">${html || '-'}</div>
    </div>
  `;

  const divider = `<div class="detail-divider"></div>`;

  let basicInfo = `
    ${row('관리사', vessel.managementCompany)}
    ${row('선령', ageText)}
    ${row('Builder', vessel.builder, 'multiline')}
    ${row('Delivery Date', vessel.deliveryDate)}
    ${row('Next Dry dock', vessel.nextDryDock)}
  `;

  let routeInfo = `
    ${row('분류', normalizeCategory(vessel.category))}
    ${mask.voyagePlan ? row('항차계획', vessel.voyagePlan, 'multiline') : ''}
    ${mask.agSupplyPlan && hasText(vessel.agSupplyPlan) ? row('윤활유 보급계획 등', vessel.agSupplyPlan, 'multiline') : ''}
  `;

  let consentInfo = '';
  if (mask.fujairahConsent) {
    consentInfo += rowHtml('푸자이라항 동의 여부', highlightValue(vessel.fujairahConsent));
  }
  if (mask.yanbuConsent) {
    consentInfo += rowHtml('얀부항 동의 여부', highlightValue(vessel.yanbuConsent));
  }
  if (mask.consentLetter) {
    consentInfo += rowHtml('동의서 확보', highlightValue(vessel.consentLetter));
  }
  if (!consentInfo.trim()) {
    consentInfo = row('해당 없음', '-');
  }

  const crewStatus = normalizeCrewPlanStatus(vessel.crewPlanStatus);
  let crewInfo = `
    ${rowHtml('선원교대 계획', highlightValue(crewStatus))}
  `;

  if (crewStatus !== '불요') {
    crewInfo += `
      ${row('선원교대 인원', hasText(vessel.crewCount) ? `${vessel.crewCount}명` : '')}
      ${row('선원교대 날짜', vessel.crewDate)}
      ${row('선원교대 항구', vessel.crewPort)}
      ${row('선원교대 상세', vessel.crewPlanDetail, 'multiline')}
    `;
  }

  let bonusInfo = `
    ${row('보너스 횟수', hasText(vessel.bonusCount) ? `${vessel.bonusCount}회` : '')}
    ${row('보너스 총액 ($)', hasText(vessel.bonusAmount) ? formatMoney(vessel.bonusAmount) : '')}
  `;

  return `
    <div class="map-label map-label-redesign ${cls}" data-index="${index}">
      <div class="detail-panel-header">
        <div class="detail-panel-title">${escapeHtml(vessel.name)}</div>
      </div>

      ${divider}

      <div class="detail-section-block">
        <div class="detail-section-title">기본정보</div>
        <div class="detail-section-body">
          ${basicInfo}
        </div>
      </div>

      ${divider}

      <div class="detail-section-block">
        <div class="detail-section-title">운항지침</div>
        <div class="detail-section-body">
          ${routeInfo}
        </div>
      </div>

      ${divider}

      <div class="detail-section-block">
        <div class="detail-section-title">동의서</div>
        <div class="detail-section-body">
          ${consentInfo}
        </div>
      </div>

      ${divider}

      <div class="detail-section-block">
        <div class="detail-section-title">선원교대</div>
        <div class="detail-section-body">
          ${crewInfo}
        </div>
      </div>

      ${divider}

      <div class="detail-section-block">
        <div class="detail-section-title">보너스</div>
        <div class="detail-section-body">
          ${bonusInfo}
        </div>
      </div>

      <div class="detail-panel-footer">
        <button type="button" class="map-mini-btn close" onclick="closeLabel(${index})">닫기</button>
        <button type="button" class="map-mini-btn view" onclick="viewConsentFile(${index})" ${vessel.consentFile ? '' : 'disabled'}>동의서</button>
        <button type="button" class="map-mini-btn upload" onclick="openConsentUpload(${index})">업로드</button>
      </div>
    </div>
  `;
}


function updateToolbarButtons() {
  const buttonMap = {
    all: filterAllBtn,
    ag: filterAgBtn,
    bothArea: filterBothAreaBtn,
    other: filterOtherBtn,
    under15: filterUnder15Btn,
    dryDock6m: filterDryDock6mBtn,
    fujairah: filterFujairahBtn,
    yanbu: filterYanbuBtn,
    crewConfirmed: filterCrewConfirmedBtn,
    crewPending: filterCrewPendingBtn
  };

  Object.values(buttonMap).forEach(btn => {
    if (btn) btn.classList.remove('active');
  });

  if (buttonMap[currentFilter]) {
    buttonMap[currentFilter].classList.add('active');
  }

  updateToggleAllLabelsButton();
}

function updateToggleAllLabelsButton() {
  if (!toggleAllLabelsBtn) return;

  const isAllLabels = labelMode === 'all';

  if (isAllLabels) {
    toggleAllLabelsBtn.classList.add('active');
  } else {
    toggleAllLabelsBtn.classList.remove('active');
  }

  if (allViewStateText) {
    allViewStateText.textContent = isAllLabels ? 'ON' : 'OFF';
  }
}

function updateStatusBoard() {
  if (countAll) {
    countAll.textContent = `${vessels.length}척`;
  }

  if (countAg) {
    countAg.textContent = `${vessels.filter(v => normalizeCategory(v.category) === 'AG 내').length}척`;
  }

  if (countBothArea) {
    countBothArea.textContent = `${vessels.filter(v => normalizeCategory(v.category) === '얀부, 푸자이라').length}척`;
  }

  if (countOther) {
    countOther.textContent = `${vessels.filter(v => normalizeCategory(v.category) === '그외 지역').length}척`;
  }

  if (countUnder15) {
    countUnder15.textContent = `${vessels.filter(v => isUnder15Years(v)).length}척`;
  }


  if (countDryDock6m) {
    countDryDock6m.textContent = `${vessels.filter(v => isDryDockWithin6MonthsOrOverdue(v)).length}척`;
  }

  if (countFujairah) {
    countFujairah.textContent = `${vessels.filter(v => normalizeConsent(v.fujairahConsent) === '동의').length}척`;
  }

  if (countYanbu) {
    countYanbu.textContent = `${vessels.filter(v => normalizeConsent(v.yanbuConsent) === '동의').length}척`;
  }

  if (countCrewConfirmed) {
    countCrewConfirmed.textContent = `${vessels.filter(v => normalizeCrewPlanStatus(v.crewPlanStatus) === '확정').length}척`;
  }

  if (countCrewPending) {
    countCrewPending.textContent = `${vessels.filter(v => normalizeCrewPlanStatus(v.crewPlanStatus) === '미정').length}척`;
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

  const previousEditName = preserveSelection && editingOriginalName
    ? String(editingOriginalName).trim().toLowerCase()
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
      category: normalizeCategory(v.category),
      crewPlanStatus: normalizeCrewPlanStatus(v.crewPlanStatus),
      crewDate: v.crewDate || '',
      voyagePlan: v.voyagePlan || '',
      agSupplyPlan: v.agSupplyPlan || '',
      builder: v.builder || '',
      deliveryDate: v.deliveryDate || '',
      nextDryDock: v.nextDryDock || ''
    }));

    if (previousEditName) {
      const newEditIndex = vessels.findIndex(
        v => String(v.name || '').trim().toLowerCase() === previousEditName
      );
      editIndex = newEditIndex >= 0 ? newEditIndex : null;
      editingOriginalName = newEditIndex >= 0
        ? String(vessels[newEditIndex].name || '').trim()
        : '';
    } else {
      editIndex = null;
      editingOriginalName = '';
    }

    if (previousActiveName) {
      const newActiveIndex = vessels.findIndex(
        v => String(v.name || '').trim().toLowerCase() === previousActiveName
      );
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
    editingOriginalName = '';
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

    const successCount = result.updatedCount || 0;
    const failedList = result.notUpdatedVessels || [];
    openPositionResultModal(successCount, failedList);

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
    clearFormAndSelection();
    return;
  }

  labelMode = 'one';
  activeLabelIndex = globalIndex;
  fillFormByVessel(globalIndex);
  renderExternalLabels();
}

function renderMap(fitBounds = false) {
  clearMarkers();
  clearNameMarkers();

  const filtered = getFilteredVessels();
  const visibleMarkers = [];

  filtered.forEach((vessel) => {
    const globalIndex = vessels.findIndex(
      v => String(v.name || '').trim().toLowerCase() === String(vessel.name || '').trim().toLowerCase()
    );

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
    renderTargets = currentlyVisible
      .map(vessel => ({
        vessel,
        index: vessels.findIndex(v => String(v.name || '').trim().toLowerCase() === String(vessel.name || '').trim().toLowerCase())
      }))
      .filter(item => !hiddenLabelIndices.has(item.index));
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

  const boxW = 320;
  const boxH = 560;
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
    const index = vessels.findIndex(
      v => String(v.name || '').trim().toLowerCase() === String(vessel.name || '').trim().toLowerCase()
    );
    const colorType = getVesselColor(vessel);
    const status = colorType === 'red' ? '빨간색' : colorType === 'yellow' ? '노란색' : colorType === 'orange' ? '주황색' : '녹색';
    const hasConsentFile = !!vessel.consentFile;
    const ageText = formatVesselAge(vessel.deliveryDate);

    const item = document.createElement('div');
    item.className = 'vessel-item';

    const mask = getCategoryDisplayMask(vessel.category);
    item.innerHTML = `
      <strong>${escapeHtml(vessel.name)}</strong>
      ${hasText(vessel.managementCompany) ? `<small>관리사: ${escapeHtml(vessel.managementCompany)}</small>` : ''}
      ${hasText(vessel.builder) ? `<small>Builder: ${escapeHtml(vessel.builder)}</small>` : ''}
      ${hasText(vessel.deliveryDate) ? `<small>Delivery Date: ${escapeHtml(vessel.deliveryDate)}</small>` : ''}
      ${hasText(ageText) ? `<small>선령: ${escapeHtml(ageText)}</small>` : ''}
      ${hasText(vessel.nextDryDock) ? `<small>Next Dry dock: ${escapeHtml(vessel.nextDryDock)}</small>` : ''}
      <small>분류: ${escapeHtml(normalizeCategory(vessel.category))}</small>
      ${mask.fujairahConsent ? `<small>푸자이라항: ${highlightListValue(vessel.fujairahConsent)}</small>` : ''}
      ${mask.yanbuConsent ? `<small>얀부항: ${highlightListValue(vessel.yanbuConsent)}</small>` : ''}
      ${mask.consentLetter ? `<small>동의서: ${highlightListValue(vessel.consentLetter)}</small>` : ''}
      ${mask.voyagePlan && hasText(vessel.voyagePlan) ? `<small>항차계획: ${escapeHtml(vessel.voyagePlan)}</small>` : ''}
      ${mask.agSupplyPlan && hasText(vessel.agSupplyPlan) ? `<small>윤활유 보급계획 등: ${escapeHtml(vessel.agSupplyPlan)}</small>` : ''}
      ${mask.crewPlanStatus ? `<small>선원교대 계획: ${highlightListValue(normalizeCrewPlanStatus(vessel.crewPlanStatus))}</small>` : ''}
      ${mask.crewCount && hasText(vessel.crewCount) ? `<small>선원교대 인원: ${escapeHtml(vessel.crewCount)}명</small>` : ''}
      ${mask.crewDate && hasText(vessel.crewDate) ? `<small>선원교대 날짜: ${escapeHtml(vessel.crewDate)}</small>` : ''}
      ${mask.crewPort && hasText(vessel.crewPort) ? `<small>선원교대 항구: ${escapeHtml(vessel.crewPort)}</small>` : ''}
      ${mask.crewPlanDetail && hasText(vessel.crewPlanDetail) ? `<small>선원교대 상세: ${escapeHtml(vessel.crewPlanDetail)}</small>` : ''}
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

  document.getElementById('fujairahConsent').value = '동의';
  document.getElementById('yanbuConsent').value = '동의';
  document.getElementById('consentLetter').value = '확보';
  document.getElementById('crewPlanStatus').value = '불요';
  document.getElementById('category').value = 'AG 내';

  document.getElementById('vesselName').value = '';
  document.getElementById('managementCompany').value = '';
  document.getElementById('builder').value = '';
  document.getElementById('deliveryDate').value = '';
  document.getElementById('nextDryDock').value = '';
  document.getElementById('voyagePlan').value = '';
  document.getElementById('agSupplyPlan').value = '';
  document.getElementById('crewCount').value = '';
  document.getElementById('crewDate').value = '';
  document.getElementById('crewPort').value = '';
  document.getElementById('crewPlanDetail').value = '';
  document.getElementById('bonusCount').value = '';
  document.getElementById('bonusAmount').value = '';
  document.getElementById('latitude').value = '';
  document.getElementById('longitude').value = '';

  applyCategoryVisibility('AG 내');
  editIndex = null;
  editingOriginalName = '';
}

function clearFormAndSelection() {
  resetForm();

  activeLabelIndex = null;
  labelMode = 'none';
  uploadTargetIndex = null;
  hiddenLabelIndices.clear();

  if (shipSearchInput) {
    shipSearchInput.value = '';
  }

  if (shipSearchDropdown) {
    shipSearchDropdown.innerHTML = '';
    shipSearchDropdown.classList.remove('show');
  }

  if (consentFileInput) {
    consentFileInput.value = '';
  }

  if (positionExcelInput) {
    positionExcelInput.value = '';
  }

  renderExternalLabels();
  updateToggleAllLabelsButton();
}

function setFilter(filterName) {
  currentFilter = filterName;
  labelMode = 'none';
  activeLabelIndex = null;
  hiddenLabelIndices.clear();
  updateToolbarButtons();
  renderList();
  renderMap(true);
}

function fillFormByVessel(index) {
  const vessel = vessels[index];
  if (!vessel) return;

  document.getElementById('vesselName').value = vessel.name || '';
  document.getElementById('managementCompany').value = vessel.managementCompany || '';
  document.getElementById('builder').value = vessel.builder || '';
  document.getElementById('deliveryDate').value = vessel.deliveryDate || '';
  document.getElementById('nextDryDock').value = vessel.nextDryDock || '';
  document.getElementById('category').value = normalizeCategory(vessel.category);
  document.getElementById('fujairahConsent').value = vessel.fujairahConsent || '동의';
  document.getElementById('yanbuConsent').value = vessel.yanbuConsent || '동의';
  document.getElementById('consentLetter').value = vessel.consentLetter || '확보';
  document.getElementById('voyagePlan').value = vessel.voyagePlan || '';
  document.getElementById('agSupplyPlan').value = vessel.agSupplyPlan || '';
  document.getElementById('crewPlanStatus').value = normalizeCrewPlanStatus(vessel.crewPlanStatus);
  document.getElementById('crewCount').value = vessel.crewCount || '';
  document.getElementById('crewDate').value = vessel.crewDate || '';
  document.getElementById('crewPort').value = vessel.crewPort || '';
  document.getElementById('crewPlanDetail').value = vessel.crewPlanDetail || '';
  document.getElementById('bonusCount').value = vessel.bonusCount || '';
  document.getElementById('bonusAmount').value = vessel.bonusAmount || '';
  document.getElementById('latitude').value = vessel.latitude ?? '';
  document.getElementById('longitude').value = vessel.longitude ?? '';

  applyCategoryVisibility(vessel.category);
  handleConsentByCategory();
  editIndex = index;
  editingOriginalName = String(vessel.name || '').trim();
}

function focusVesselFromSearch(index) {
  const vessel = vessels[index];
  if (!vessel) return;

  currentFilter = 'all';
  updateToolbarButtons();
  renderList();
  renderMap(false);

  fillFormByVessel(index);

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
    const index = vessels.findIndex(
      v => String(v.name || '').trim().toLowerCase() === String(vessel.name || '').trim().toLowerCase()
    );
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

if (toggleAllLabelsBtn) {
  toggleAllLabelsBtn.addEventListener('click', () => {
    if (labelMode === 'all') {
      clearFormAndSelection();
      return;
    } else {
      labelMode = 'all';
      activeLabelIndex = null;
      hiddenLabelIndices.clear();
      resetForm();
    }

    updateToggleAllLabelsButton();
    renderExternalLabels();
  });
}

if (filterAllBtn) {
  filterAllBtn.addEventListener('click', () => setFilter('all'));
}

if (filterAgBtn) {
  filterAgBtn.addEventListener('click', () => setFilter('ag'));
}

if (filterBothAreaBtn) {
  filterBothAreaBtn.addEventListener('click', () => setFilter('bothArea'));
}

if (filterOtherBtn) {
  filterOtherBtn.addEventListener('click', () => setFilter('other'));
}

if (filterUnder15Btn) {
  filterUnder15Btn.addEventListener('click', () => setFilter('under15'));
}

if (filterDryDock6mBtn) {
  filterDryDock6mBtn.addEventListener('click', () => setFilter('dryDock6m'));
}



if (filterFujairahBtn) {
  filterFujairahBtn.addEventListener('click', () => setFilter('fujairah'));
}

if (filterYanbuBtn) {
  filterYanbuBtn.addEventListener('click', () => setFilter('yanbu'));
}

if (filterCrewConfirmedBtn) {
  filterCrewConfirmedBtn.addEventListener('click', () => setFilter('crewConfirmed'));
}

if (filterCrewPendingBtn) {
  filterCrewPendingBtn.addEventListener('click', () => setFilter('crewPending'));
}

if (shipSearchInput) {
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
}

document.addEventListener('click', (e) => {
  if (
    shipSearchInput &&
    shipSearchDropdown &&
    !shipSearchInput.contains(e.target) &&
    !shipSearchDropdown.contains(e.target)
  ) {
    shipSearchDropdown.classList.remove('show');
  }
});

if (consentFileInput) {
  consentFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || uploadTargetIndex === null) return;

    await uploadConsentFile(uploadTargetIndex, file);

    consentFileInput.value = '';
    uploadTargetIndex = null;
  });
}

if (positionUpdateBtn) {
  positionUpdateBtn.addEventListener('click', () => {
    if (positionExcelInput) positionExcelInput.click();
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

  if (isSaving) {
    alert('저장 진행 중입니다. 잠시만 기다려 주세요.');
    return;
  }

  const currentName = document.getElementById('vesselName').value.trim();
  const originalName = editingOriginalName || '';

  const vessel = {
    name: currentName,
    managementCompany: document.getElementById('managementCompany').value.trim(),
    builder: document.getElementById('builder').value.trim(),
    deliveryDate: document.getElementById('deliveryDate').value.trim(),
    nextDryDock: document.getElementById('nextDryDock').value.trim(),
    category: document.getElementById('category').value,
    fujairahConsent: document.getElementById('fujairahConsent').value,
    yanbuConsent: document.getElementById('yanbuConsent').value,
    consentLetter: document.getElementById('consentLetter').value,
    voyagePlan: document.getElementById('voyagePlan').value.trim(),
    agSupplyPlan: document.getElementById('agSupplyPlan').value.trim(),
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

  isSaving = true;

  try {
    const ok = await saveSingleVessel(vessel);
    if (!ok) return;

    await loadData({ preserveSelection: false, fitBounds: false });

    const newIndex = vessels.findIndex(
      v => String(v.name || '').trim().toLowerCase() === vessel.name.toLowerCase()
    );

    if (newIndex >= 0) {
      editIndex = newIndex;
      activeLabelIndex = newIndex;
      labelMode = 'one';
      fillFormByVessel(newIndex);
    } else {
      editIndex = null;
      editingOriginalName = vessel.name;
    }

    renderSearchSuggestions(shipSearchInput ? shipSearchInput.value.trim() : '');
  } finally {
    isSaving = false;
  }
});

if (resetBtn) {
  resetBtn.addEventListener('click', clearFormAndSelection);
}

if (reportViewBtn) {
  reportViewBtn.addEventListener('click', () => {
    const params = new URLSearchParams({
      filter: currentFilter || 'all',
      _: Date.now()
    });
    window.open(`/report?${params.toString()}`, '_blank');
  });
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

  renderSearchSuggestions(shipSearchInput ? shipSearchInput.value.trim() : '');

  if (editIndex === index) {
    resetForm();
  } else {
    editIndex = null;
    editingOriginalName = '';
  }
};

window.openConsentUpload = function (index) {
  uploadTargetIndex = index;
  if (consentFileInput) consentFileInput.click();
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

window.closeLabel = function (index) {
  if (labelMode === 'one') {
    clearFormAndSelection();
    return;
  }

  hiddenLabelIndices.add(index);
  renderExternalLabels();
  setTimeout(updateLeaderLines, 30);
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

if (document.getElementById('category')) {
  applyCategoryVisibility(document.getElementById('category').value);
}

handleConsentByCategory();
loadData({ preserveSelection: true, fitBounds: true });