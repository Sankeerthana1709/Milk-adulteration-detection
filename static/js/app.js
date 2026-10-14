/**
 * MilkShield AI - Quantum Dairy Tech Client Application
 * Handles real-time interactive predictions, SVG speedometer gauge animations,
 * SQLite sample history viewing & forensic inspection, presets, and ESP32 telemetry.
 */

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // DOM ELEMENTS
    // =========================================================================

    // Navigation
    const tabButtons = document.querySelectorAll('.nav-tab-btn');
    const tabViews = document.querySelectorAll('.tab-view');
    const btnQuickHistory = document.getElementById('btn-quick-history');
    const btnEmptyGotoBench = document.getElementById('btn-empty-goto-bench');
    const headerSampleCount = document.getElementById('header-sample-count');
    const tabHistoryCount = document.getElementById('tab-history-count');

    // Workbench Inputs
    const inputSampleName = document.getElementById('input-sample-name');
    const btnGenerateName = document.getElementById('btn-generate-name');
    const inputSampleNotes = document.getElementById('input-sample-notes');
    const sliderTemp = document.getElementById('slider-temp');
    const sliderPh = document.getElementById('slider-ph');
    const sliderColor = document.getElementById('slider-color');
    const checkFat = document.getElementById('check-fat');
    const checkTurb = document.getElementById('check-turb');

    // Readouts
    const displayTemp = document.getElementById('display-temp');
    const displayPh = document.getElementById('display-ph');
    const displayColor = document.getElementById('display-color');
    const colorSwatchCircle = document.getElementById('color-swatch-circle');
    const statusFat = document.getElementById('status-fat');
    const statusTurb = document.getElementById('status-turb');
    const tempZoneLabel = document.getElementById('temp-zone-label');
    const phZoneLabel = document.getElementById('ph-zone-label');
    const colorZoneLabel = document.getElementById('color-zone-label');

    // Bench Action Buttons
    const btnResetBench = document.getElementById('btn-reset-bench');
    const btnSaveTest = document.getElementById('btn-save-test');

    // Diagnostic Results
    const gaugeScoreValue = document.getElementById('gauge-score-value');
    const gaugeArcFill = document.getElementById('gauge-arc-fill');
    const gaugeNeedleGroup = document.getElementById('gauge-needle-group');
    const verdictBanner = document.getElementById('verdict-banner');
    const verdictIcon = document.getElementById('verdict-icon');
    const verdictTitle = document.getElementById('verdict-title');
    const verdictDesc = document.getElementById('verdict-desc');
    const probMediumVal = document.getElementById('prob-medium-val');
    const probMediumBar = document.getElementById('prob-medium-bar');
    const probLowVal = document.getElementById('prob-low-val');
    const probLowBar = document.getElementById('prob-low-bar');
    const adulterantVerdictBadge = document.getElementById('adulterant-verdict-badge');
    const diagnosisChecklist = document.getElementById('diagnosis-checklist');

    // History View
    const kpiTotalTested = document.getElementById('kpi-total-tested');
    const kpiMediumCount = document.getElementById('kpi-medium-count');
    const kpiLowCount = document.getElementById('kpi-low-count');
    const kpiAdulterationRate = document.getElementById('kpi-adulteration-rate');
    const kpiAvgMetrics = document.getElementById('kpi-avg-metrics');
    const historySearchInput = document.getElementById('history-search-input');
    const filterPills = document.querySelectorAll('.filter-pill');
    const historyTableTbody = document.getElementById('history-table-tbody');
    const historyEmptyState = document.getElementById('history-empty-state');
    const btnClearHistory = document.getElementById('btn-clear-history');
    const btnRefreshHistory = document.getElementById('btn-refresh-history');

    // Presets & Telemetry
    const presetsModernGrid = document.getElementById('presets-modern-grid');
    const btnSimulateEsp32 = document.getElementById('btn-simulate-esp32');
    const telemetryTableBody = document.getElementById('telemetry-table-body');
    const esp32Dot = document.getElementById('esp32-dot');
    const esp32Text = document.getElementById('esp32-text');

    // Modal
    const sampleModal = document.getElementById('sample-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnModalCloseOk = document.getElementById('btn-modal-close-ok');
    const btnModalLoad = document.getElementById('btn-modal-load');
    const modalSampleTitle = document.getElementById('modal-sample-title');
    const modalSampleSubtitle = document.getElementById('modal-sample-subtitle');
    const modalSampleBody = document.getElementById('modal-sample-body');

    // Toast Container
    const toastContainer = document.getElementById('toast-container');

    // State Variables
    let currentActiveGradeFilter = 'all';
    let currentModalSampleData = null;
    let liveDebounceTimer = null;
    let sampleCounter = 107;

    // =========================================================================
    // 1. TAB NAVIGATION
    // =========================================================================
    function switchTab(targetTabId) {
        tabButtons.forEach(btn => {
            if (btn.getAttribute('data-tab') === targetTabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        tabViews.forEach(view => {
            if (view.id === targetTabId) {
                view.classList.add('active');
            } else {
                view.classList.remove('active');
            }
        });

        if (targetTabId === 'tab-history') {
            loadSampleHistory();
            loadHistoryStats();
        } else if (targetTabId === 'tab-presets') {
            loadPresets();
        }
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');
            switchTab(targetId);
        });
    });

    if (btnQuickHistory) {
        btnQuickHistory.addEventListener('click', () => switchTab('tab-history'));
    }

    if (btnEmptyGotoBench) {
        btnEmptyGotoBench.addEventListener('click', () => switchTab('tab-analyzer'));
    }

    // =========================================================================
    // 2. WORKBENCH SLIDERS & LIVE PREDICTION
    // =========================================================================
    function updateBenchUI(triggerPrediction = true) {
        const temp = parseFloat(sliderTemp.value).toFixed(1);
        const ph = parseFloat(sliderPh.value).toFixed(2);
        const color = parseInt(sliderColor.value, 10);
        const fat = checkFat.checked;
        const turb = checkTurb.checked;

        // Numeric Readouts
        displayTemp.textContent = `${temp} °C`;
        displayPh.textContent = `${ph} pH`;
        displayColor.textContent = `${color}`;

        // Color Swatch Circle (240 is off-white, 255 pure milk white)
        const intensity = Math.round(220 + ((color - 240) / 15) * 35);
        colorSwatchCircle.style.backgroundColor = `rgb(${intensity}, ${intensity}, ${intensity})`;

        // Binary status text
        statusFat.textContent = fat ? 'Intact Natural Fat (1)' : 'Depleted / Skimmed (0)';
        statusTurb.textContent = turb ? 'Intact Opacity / Dense (1)' : 'Watery / Diluted (0)';

        // Zone labels
        if (temp < 35.0) tempZoneLabel.textContent = 'Chilled Holding (<35°C)';
        else if (temp <= 38.0) tempZoneLabel.textContent = 'Ideal Fresh Milk (35°C - 38°C)';
        else if (temp <= 62.0) tempZoneLabel.textContent = 'Danger Warm Spoilage (39°C - 62°C)';
        else tempZoneLabel.textContent = 'Pasteurization / Boiled (>63°C)';

        if (ph < 6.0) phZoneLabel.textContent = 'Acidic Spoilage / Souring (<6.0 pH)';
        else if (ph <= 6.9) phZoneLabel.textContent = 'Normal Fresh Whole Milk (6.5 - 6.8 pH)';
        else if (ph <= 7.8) phZoneLabel.textContent = 'Mild Alkaline Buffer (7.0 - 7.8 pH)';
        else phZoneLabel.textContent = 'Strong Caustic Soda / Detergent (>7.8 pH)';

        if (color < 246) colorZoneLabel.textContent = 'Reduced Opacity (Watery Dilution)';
        else colorZoneLabel.textContent = 'Pure Optical Milk Reflectance';

        if (triggerPrediction) {
            clearTimeout(liveDebounceTimer);
            liveDebounceTimer = setTimeout(() => {
                runPrediction(false);
            }, 180);
        }
    }

    sliderTemp.addEventListener('input', () => updateBenchUI(true));
    sliderPh.addEventListener('input', () => updateBenchUI(true));
    sliderColor.addEventListener('input', () => updateBenchUI(true));
    checkFat.addEventListener('change', () => updateBenchUI(true));
    checkTurb.addEventListener('change', () => updateBenchUI(true));

    // Reset Defaults
    btnResetBench.addEventListener('click', () => {
        sliderTemp.value = 36.5;
        sliderPh.value = 6.70;
        sliderColor.value = 255;
        checkFat.checked = true;
        checkTurb.checked = true;
        inputSampleName.value = `Sample #${sampleCounter}`;
        inputSampleNotes.value = 'Fresh whole milk baseline';
        updateBenchUI(true);
        showToast('Reset testing bench to clean whole milk standards.');
    });

    // Auto-generate sample name
    btnGenerateName.addEventListener('click', () => {
        sampleCounter += 1;
        const prefixes = ['Cow Milk Batch', 'Chilled Delivery', 'Dairy Tanker', 'Retail Sample', 'Farm Fresh Batch'];
        const p = prefixes[Math.floor(Math.random() * prefixes.length)];
        inputSampleName.value = `${p} #${sampleCounter}`;
    });

    // =========================================================================
    // 3. PREDICTION ENGINE & GAUGE ANIMATION
    // =========================================================================
    async function runPrediction(saveToHistory = false) {
        const payload = {
            temperature: parseFloat(sliderTemp.value),
            fat: checkFat.checked ? 1 : 0,
            turbidity: checkTurb.checked ? 1 : 0,
            color: parseInt(sliderColor.value, 10),
            ph: parseFloat(sliderPh.value),
            sample_name: inputSampleName.value.trim() || `Sample #${sampleCounter}`,
            notes: inputSampleNotes.value.trim() || '',
            source: 'Interactive Lab Test',
            save_sample: saveToHistory
        };

        try {
            const res = await fetch('/api/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('API request failed');
            const data = await res.json();
            renderPredictionResults(data, saveToHistory);

            if (saveToHistory) {
                showToast(`Recorded "${payload.sample_name}" into Lab History!`);
                sampleCounter += 1;
                inputSampleName.value = `Cow Milk Sample #${sampleCounter}`;
                loadHistoryStats();
                loadSampleHistory();
            }
        } catch (err) {
            console.error('[PREDICT ERROR]', err);
        }
    }

    function renderPredictionResults(data, wasSaved) {
        const grade = data.grade;
        const conf = data.confidence || { medium: 50, low: 50 };
        const medPct = conf.medium || 0;
        const lowPct = conf.low || 0;
        const warnings = data.warnings || [];
        const adulterant = data.adulterant_type || 'None';

        // 1. Gauge Needle & Score Animation
        // Scale needle from -90deg (Low/Adulterated) to +90deg (Medium/Clean)
        // Quality Score index: 0% to 100%
        let qualityScore = medPct;
        if (grade === 'Low') {
            qualityScore = Math.max(5, Math.round(100 - lowPct));
        } else {
            qualityScore = Math.min(99, Math.round(medPct));
        }

        gaugeScoreValue.textContent = `${qualityScore}%`;
        
        // Needle angle: score 0 => -90 deg, score 100 => +90 deg
        const needleAngle = -90 + (qualityScore / 100) * 180;
        gaugeNeedleGroup.style.transform = `rotate(${needleAngle}deg)`;

        // Arc dashoffset: 251.2 is empty, 0 is full
        const arcOffset = 251.2 - (qualityScore / 100) * 251.2;
        gaugeArcFill.style.strokeDashoffset = arcOffset;

        if (grade === 'Medium') {
            gaugeArcFill.style.stroke = qualityScore > 75 ? '#34d399' : '#f59e0b';
        } else {
            gaugeArcFill.style.stroke = '#f43f5e';
        }

        // 2. Verdict Banner
        verdictBanner.className = `verdict-banner ${grade === 'Medium' ? 'grade-medium' : 'grade-low'}`;
        if (grade === 'Medium') {
            verdictIcon.innerHTML = '<span>🛡️</span>';
            verdictTitle.textContent = 'MEDIUM QUALITY (MILD / ACCEPTABLE)';
            verdictDesc.textContent = 'Natural fat globules, colloidal turbidity, and pH are within manageable dairy bounds.';
        } else {
            verdictIcon.innerHTML = '<span>⚠️</span>';
            verdictTitle.textContent = 'LOW QUALITY (SEVERE ADULTERATION / SPOILAGE)';
            verdictDesc.textContent = 'Critical violation: Chemical neutralizer, extreme dilution, or bacterial spoilage detected!';
        }

        // 3. Dual Probability Bars
        probMediumVal.textContent = `${medPct.toFixed(1)}%`;
        probMediumBar.style.width = `${medPct}%`;

        probLowVal.textContent = `${lowPct.toFixed(1)}%`;
        probLowBar.style.width = `${lowPct}%`;

        // 4. Adulterant Badge
        adulterantVerdictBadge.textContent = adulterant;
        adulterantVerdictBadge.className = 'adulterant-pill-badge';
        if (data.severity === 'danger') {
            adulterantVerdictBadge.classList.add('danger');
        } else if (data.severity === 'warning') {
            adulterantVerdictBadge.classList.add('warning');
        }

        // 5. Sensor Checklist
        diagnosisChecklist.innerHTML = '';
        warnings.forEach(w => {
            const item = document.createElement('div');
            item.className = `diag-item ${w.level || 'normal'}`;
            const bullet = w.level === 'danger' ? '⚠️' : (w.level === 'warning' ? '⚡' : '✓');
            item.innerHTML = `
                <span class="diag-bullet">${bullet}</span>
                <div>
                    <div class="diag-title">${w.type}</div>
                    <div class="diag-text">${w.desc}</div>
                </div>
            `;
            diagnosisChecklist.appendChild(item);
        });
    }

    // Save Button
    btnSaveTest.addEventListener('click', () => {
        runPrediction(true);
    });

    // =========================================================================
    // 4. TESTED SAMPLES HISTORY ENGINE
    // =========================================================================
    async function loadHistoryStats() {
        try {
            const res = await fetch('/api/history/stats');
            const stats = await res.json();

            kpiTotalTested.textContent = stats.total_tested;
            kpiMediumCount.textContent = `${stats.medium_count} (${stats.medium_pct}%)`;
            kpiLowCount.textContent = `${stats.low_count} (${stats.low_pct}%)`;
            kpiAdulterationRate.textContent = `${stats.adulteration_rate_pct}%`;
            kpiAvgMetrics.textContent = `${stats.avg_ph} pH • ${stats.avg_temp}°C`;

            headerSampleCount.textContent = `${stats.total_tested} Records`;
            tabHistoryCount.textContent = stats.total_tested;
        } catch (err) {
            console.error('[STATS ERROR]', err);
        }
    }

    async function loadSampleHistory() {
        const query = historySearchInput ? historySearchInput.value.trim() : '';
        const url = `/api/history?grade=${currentActiveGradeFilter}&search=${encodeURIComponent(query)}&limit=150`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            const samples = data.samples || [];

            historyTableTbody.innerHTML = '';

            if (samples.length === 0) {
                historyEmptyState.classList.remove('hidden');
                return;
            } else {
                historyEmptyState.classList.add('hidden');
            }

            samples.forEach(s => {
                const tr = document.createElement('tr');
                const isMedium = s.grade.toLowerCase() === 'medium';
                const gradeClass = isMedium ? 'medium' : 'low';
                const gradeSymbol = isMedium ? '🟢' : '🔴';

                tr.innerHTML = `
                    <td style="font-family: var(--font-mono); font-weight:700; color: var(--text-muted);">#${s.id}</td>
                    <td>
                        <div class="sample-name-cell">
                            <span class="sample-name-title">${escapeHtml(s.sample_name)}</span>
                            <span class="sample-name-sub">${escapeHtml(s.notes || 'No notes')}</span>
                        </div>
                    </td>
                    <td style="font-size: 0.76rem; color: var(--text-secondary);">${escapeHtml(s.timestamp)}</td>
                    <td>
                        <div class="sensor-chips-group">
                            <span class="mini-chip" title="Temperature">🌡️ ${s.temperature.toFixed(1)}°C</span>
                            <span class="mini-chip" title="pH Level">🧪 ${s.ph.toFixed(2)}</span>
                            <span class="mini-chip" title="Fat Globules">🧈 ${s.fat === 1 ? 'Fat' : 'No Fat'}</span>
                            <span class="mini-chip" title="Turbidity">🥛 ${s.turbidity === 1 ? 'SNF' : 'Watery'}</span>
                            <span class="mini-chip" title="Color">🎨 ${s.color}</span>
                        </div>
                    </td>
                    <td>
                        <span class="grade-badge-table ${gradeClass}">
                            <span>${gradeSymbol}</span>
                            <span>${s.grade}</span>
                        </span>
                    </td>
                    <td>
                        <div style="font-family: var(--font-mono); font-size: 0.75rem; font-weight: 700;">
                            ${isMedium ? s.conf_medium : s.conf_low}%
                        </div>
                    </td>
                    <td>
                        <div style="font-size: 0.78rem; font-weight: 600; color: ${s.severity === 'danger' ? '#fb7185' : (s.severity === 'warning' ? '#fbbf24' : '#34d399')};">
                            ${escapeHtml(s.adulterant_type)}
                        </div>
                    </td>
                    <td>
                        <span class="mini-chip" style="background: rgba(56, 189, 248, 0.1); border-color: rgba(56, 189, 248, 0.25); color: #38bdf8;">
                            ${escapeHtml(s.source)}
                        </span>
                    </td>
                    <td>
                        <div class="table-row-actions">
                            <button class="btn-table-action" data-action="inspect" data-id="${s.id}" title="Inspect full forensic breakdown">🔍</button>
                            <button class="btn-table-action" data-action="load" data-id="${s.id}" title="Load values into Testing Bench">🧪</button>
                            <button class="btn-table-action delete" data-action="delete" data-id="${s.id}" title="Delete record">🗑️</button>
                        </div>
                    </td>
                `;

                // Add Row Action Listeners
                tr.querySelector('[data-action="inspect"]').addEventListener('click', () => openInspectModal(s));
                tr.querySelector('[data-action="load"]').addEventListener('click', () => loadSampleIntoBench(s));
                tr.querySelector('[data-action="delete"]').addEventListener('click', () => deleteSampleRecord(s.id, tr));

                historyTableTbody.appendChild(tr);
            });
        } catch (err) {
            console.error('[LOAD HISTORY ERROR]', err);
        }
    }

    // Filter pills
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentActiveGradeFilter = pill.getAttribute('data-filter');
            loadSampleHistory();
        });
    });

    // Search filter
    if (historySearchInput) {
        historySearchInput.addEventListener('input', () => {
            clearTimeout(liveDebounceTimer);
            liveDebounceTimer = setTimeout(loadSampleHistory, 200);
        });
    }

    if (btnRefreshHistory) {
        btnRefreshHistory.addEventListener('click', () => {
            loadSampleHistory();
            loadHistoryStats();
            showToast('Refreshed lab history records.');
        });
    }

    // Delete Record
    async function deleteSampleRecord(id, rowElement) {
        if (!confirm(`Are you sure you want to delete Sample #${id}?`)) return;

        try {
            const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
            if (res.ok) {
                rowElement.style.opacity = '0';
                setTimeout(() => {
                    rowElement.remove();
                    loadHistoryStats();
                }, 200);
                showToast(`Deleted Sample #${id} from database.`);
            }
        } catch (err) {
            console.error('[DELETE ERROR]', err);
        }
    }

    // Clear History
    if (btnClearHistory) {
        btnClearHistory.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to delete ALL sample history records? This cannot be undone.')) return;

            try {
                const res = await fetch('/api/history/clear', { method: 'POST' });
                if (res.ok) {
                    showToast('All tested samples cleared.');
                    loadSampleHistory();
                    loadHistoryStats();
                }
            } catch (err) {
                console.error('[CLEAR HISTORY ERROR]', err);
            }
        });
    }

    // Load sample back into bench
    function loadSampleIntoBench(sample) {
        sliderTemp.value = sample.temperature;
        sliderPh.value = sample.ph;
        sliderColor.value = sample.color;
        checkFat.checked = sample.fat === 1;
        checkTurb.checked = sample.turbidity === 1;
        inputSampleName.value = `${sample.sample_name} (Re-test)`;
        inputSampleNotes.value = `Loaded from #${sample.id}`;

        switchTab('tab-analyzer');
        updateBenchUI(true);
        showToast(`Loaded ${sample.sample_name} into testing bench.`);
    }

    // =========================================================================
    // 5. INSPECTION MODAL
    // =========================================================================
    function openInspectModal(sample) {
        currentModalSampleData = sample;
        modalSampleTitle.textContent = sample.sample_name;
        modalSampleSubtitle.textContent = `Record #${sample.id} • ${sample.timestamp} • ${sample.source}`;

        const isMedium = sample.grade.toLowerCase() === 'medium';
        const gradeBadgeColor = isMedium ? '#f59e0b' : '#f43f5e';

        modalSampleBody.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem; border-radius:12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle);">
                <div>
                    <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Verified AI Quality Grade</div>
                    <div style="font-family:var(--font-heading); font-size:1.2rem; font-weight:800; color:${gradeBadgeColor};">${sample.grade} QUALITY</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.75rem; color:var(--text-muted);">Confidence</div>
                    <div style="font-family:var(--font-mono); font-size:1.1rem; font-weight:700; color:var(--text-primary);">
                        ${isMedium ? sample.conf_medium : sample.conf_low}%
                    </div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:0.75rem;">
                <div style="background:rgba(10,16,30,0.6); padding:0.85rem; border-radius:8px; border:1px solid var(--border-subtle);">
                    <div style="font-size:0.7rem; color:var(--text-muted);">Temperature</div>
                    <div style="font-family:var(--font-mono); font-size:1rem; font-weight:700; color:#38bdf8;">${sample.temperature}°C</div>
                </div>
                <div style="background:rgba(10,16,30,0.6); padding:0.85rem; border-radius:8px; border:1px solid var(--border-subtle);">
                    <div style="font-size:0.7rem; color:var(--text-muted);">pH Acidity</div>
                    <div style="font-family:var(--font-mono); font-size:1rem; font-weight:700; color:#34d399;">${sample.ph} pH</div>
                </div>
                <div style="background:rgba(10,16,30,0.6); padding:0.85rem; border-radius:8px; border:1px solid var(--border-subtle);">
                    <div style="font-size:0.7rem; color:var(--text-muted);">Fat Content</div>
                    <div style="font-family:var(--font-mono); font-size:1rem; font-weight:700; color:var(--text-primary);">${sample.fat === 1 ? 'Present (1)' : 'Depleted (0)'}</div>
                </div>
                <div style="background:rgba(10,16,30,0.6); padding:0.85rem; border-radius:8px; border:1px solid var(--border-subtle);">
                    <div style="font-size:0.7rem; color:var(--text-muted);">Turbidity Opacity</div>
                    <div style="font-family:var(--font-mono); font-size:1rem; font-weight:700; color:var(--text-primary);">${sample.turbidity === 1 ? 'Normal SNF (1)' : 'Diluted (0)'}</div>
                </div>
                <div style="background:rgba(10,16,30,0.6); padding:0.85rem; border-radius:8px; border:1px solid var(--border-subtle);">
                    <div style="font-size:0.7rem; color:var(--text-muted);">Optical Color</div>
                    <div style="font-family:var(--font-mono); font-size:1rem; font-weight:700; color:var(--text-primary);">${sample.color}</div>
                </div>
            </div>

            <div style="background:rgba(10,16,30,0.6); padding:1rem; border-radius:10px; border:1px solid var(--border-subtle);">
                <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700; margin-bottom:0.25rem;">Adulterant Classification</div>
                <div style="font-weight:700; color:${sample.severity === 'danger' ? '#fb7185' : (sample.severity === 'warning' ? '#fbbf24' : '#34d399')}; font-size:0.95rem;">
                    ${sample.adulterant_type}
                </div>
                <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:0.35rem;">
                    Inspection Notes: ${escapeHtml(sample.notes || 'No additional laboratory observations recorded.')}
                </div>
            </div>
        `;

        sampleModal.classList.remove('hidden');
    }

    function closeModal() {
        sampleModal.classList.add('hidden');
    }

    btnCloseModal.addEventListener('click', closeModal);
    btnModalCloseOk.addEventListener('click', closeModal);
    btnModalLoad.addEventListener('click', () => {
        if (currentModalSampleData) {
            loadSampleIntoBench(currentModalSampleData);
            closeModal();
        }
    });

    sampleModal.addEventListener('click', (e) => {
        if (e.target === sampleModal) closeModal();
    });

    // =========================================================================
    // 6. PRESETS LOADER
    // =========================================================================
    async function loadPresets() {
        try {
            const res = await fetch('/api/presets');
            const presets = await res.json();
            presetsModernGrid.innerHTML = '';

            presets.forEach(p => {
                const card = document.createElement('div');
                card.className = 'preset-modern-card';
                const isMedium = p.expected.toLowerCase().includes('medium');
                const badgeStyle = isMedium ? 'background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.4); color:#fbbf24;' : 'background:rgba(244,63,94,0.15); border:1px solid rgba(244,63,94,0.4); color:#fb7185;';

                card.innerHTML = `
                    <div>
                        <div class="preset-card-top">
                            <span class="preset-title-text">${escapeHtml(p.title)}</span>
                            <span class="preset-badge-tag" style="${badgeStyle}">${p.expected}</span>
                        </div>
                        <p class="preset-desc-text">${escapeHtml(p.description)}</p>
                        <div class="preset-sensor-pills">
                            <span class="mini-chip">Temp: ${p.values.temperature}°C</span>
                            <span class="mini-chip">pH: ${p.values.ph}</span>
                            <span class="mini-chip">Fat: ${p.values.fat}</span>
                            <span class="mini-chip">Turbidity: ${p.values.turbidity}</span>
                            <span class="mini-chip">Color: ${p.values.color}</span>
                        </div>
                    </div>
                    <button class="preset-btn-test">
                        <span>🧪 Load & Test This Scenario</span>
                    </button>
                `;

                card.querySelector('.preset-btn-test').addEventListener('click', (e) => {
                    e.stopPropagation();
                    sliderTemp.value = p.values.temperature;
                    sliderPh.value = p.values.ph;
                    sliderColor.value = p.values.color;
                    checkFat.checked = p.values.fat === 1;
                    checkTurb.checked = p.values.turbidity === 1;
                    inputSampleName.value = p.title;
                    inputSampleNotes.value = p.description;

                    switchTab('tab-analyzer');
                    updateBenchUI(true);
                    runPrediction(true);
                });

                presetsModernGrid.appendChild(card);
            });
        } catch (err) {
            console.error('[PRESETS ERROR]', err);
        }
    }

    // =========================================================================
    // 7. LIVE ESP32 HARDWARE STREAM POLLING & SIMULATION
    // =========================================================================
    async function pollLiveTelemetry() {
        try {
            const res = await fetch('/api/esp32/live');
            const data = await res.json();

            if (data.connected && data.stream && data.stream.length > 0) {
                esp32Dot.className = 'indicator-dot emerald';
                esp32Text.textContent = 'Hardware Connected';

                telemetryTableBody.innerHTML = '';
                data.stream.slice(0, 15).forEach(row => {
                    const tr = document.createElement('tr');
                    const isMed = row.grade === 'Medium';
                    const gradeColor = isMed ? '#fbbf24' : '#fb7185';
                    tr.innerHTML = `
                        <td>${escapeHtml(row.timestamp)}</td>
                        <td><code>${escapeHtml(row.device_id)}</code></td>
                        <td>${row.temperature.toFixed(1)}</td>
                        <td>${row.ph.toFixed(2)}</td>
                        <td>${row.fat}</td>
                        <td>${row.turbidity}</td>
                        <td>${row.color}</td>
                        <td style="font-weight:700; color:${gradeColor};">${row.grade}</td>
                        <td>${escapeHtml(row.adulterant_type)}</td>
                    `;
                    telemetryTableBody.appendChild(tr);
                });
            } else {
                esp32Dot.className = 'indicator-dot cyan';
                esp32Text.textContent = 'Listening (:5000)';
            }
        } catch (err) {
            // Ignore background polling errors
        }
    }

    // Simulate ESP32 Packet
    btnSimulateEsp32.addEventListener('click', async () => {
        const simSamples = [
            { temp: 37.5, fat: 1, turb: 1, color: 255, ph: 6.75, id: 'ESP32_Node_FarmA' },
            { temp: 42.0, fat: 0, turb: 0, color: 245, ph: 8.80, id: 'ESP32_Node_DairyPlant' },
            { temp: 46.5, fat: 1, turb: 0, color: 249, ph: 4.55, id: 'ESP32_Node_Chiller3' }
        ];
        const s = simSamples[Math.floor(Math.random() * simSamples.length)];

        try {
            const res = await fetch('/api/esp32/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: s.id,
                    temperature: s.temp,
                    fat: s.fat,
                    turbidity: s.turb,
                    color: s.color,
                    ph: s.ph
                })
            });

            if (res.ok) {
                showToast(`Transmitted IoT telemetry from ${s.id}!`);
                pollLiveTelemetry();
                loadHistoryStats();
            }
        } catch (err) {
            console.error('[SIMULATION ERROR]', err);
        }
    });

    // =========================================================================
    // 8. NOTIFICATION TOAST UTILITY
    // =========================================================================
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <span>🥛</span>
            <span>${escapeHtml(message)}</span>
        `;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 250);
        }, 3200);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    updateBenchUI(true);
    loadHistoryStats();
    loadPresets();
    setInterval(pollLiveTelemetry, 3000);
});
