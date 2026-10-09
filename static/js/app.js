/**
 * MilkShield AI - Client Application Logic
 * Manages interactive controls, real-time prediction calls, preset loaders,
 * and live ESP32 hardware telemetry streaming.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State & DOM Elements ---
    const sliderTemp = document.getElementById('slider-temp');
    const sliderPh = document.getElementById('slider-ph');
    const sliderColor = document.getElementById('slider-color');
    const toggleFat = document.getElementById('toggle-fat');
    const toggleTurb = document.getElementById('toggle-turb');

    const tempBadge = document.getElementById('temp-badge');
    const phBadge = document.getElementById('ph-badge');
    const colorBadge = document.getElementById('color-badge');
    const colorSwatch = document.getElementById('color-swatch');
    const fatSubtext = document.getElementById('fat-subtext');
    const turbSubtext = document.getElementById('turb-subtext');

    const btnPredict = document.getElementById('btn-predict-now');
    const btnReset = document.getElementById('btn-reset-inputs');

    const gradeBanner = document.getElementById('grade-banner');
    const gradeIcon = document.getElementById('grade-icon');
    const gradeText = document.getElementById('grade-text');
    const gradeSubtext = document.getElementById('grade-subtext');
    const adulterantTag = document.getElementById('adulterant-tag');
    const diagnosisContainer = document.getElementById('diagnosis-container');

    const barHigh = document.getElementById('bar-high');
    const barMedium = document.getElementById('bar-medium');
    const barLow = document.getElementById('bar-low');
    const pctHigh = document.getElementById('pct-high');
    const pctMedium = document.getElementById('pct-medium');
    const pctLow = document.getElementById('pct-low');

    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const presetsGrid = document.getElementById('presets-grid');
    const telemetryTbody = document.getElementById('telemetry-tbody');
    const esp32StatusDot = document.getElementById('esp32-status-dot');
    const esp32StatusText = document.getElementById('esp32-status-text');

    let debounceTimer = null;

    // --- 1. Tab Navigation ---
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPane = document.getElementById(targetTab);
            if (targetPane) targetPane.classList.add('active');
        });
    });

    // --- 2. Slider & Input Listeners ---
    function updateControlUI() {
        const tempVal = parseFloat(sliderTemp.value).toFixed(1);
        const phVal = parseFloat(sliderPh.value).toFixed(2);
        const colorVal = parseInt(sliderColor.value, 10);
        const fatVal = toggleFat.checked;
        const turbVal = toggleTurb.checked;

        tempBadge.textContent = `${tempVal} °C`;
        phBadge.textContent = `${phVal} pH`;
        colorBadge.textContent = `${colorVal}`;

        // Color Swatch intensity: 240 is off-white (#e4e4e7), 255 is pure milk white (#ffffff)
        const intensity = Math.round(220 + ((colorVal - 240) / 15) * 35);
        colorSwatch.style.backgroundColor = `rgb(${intensity}, ${intensity}, ${intensity})`;

        fatSubtext.textContent = fatVal ? 'Optimal Fat Present (1)' : 'Depleted / Skimmed (0)';
        turbSubtext.textContent = turbVal ? 'Optimal Opacity (1)' : 'Diluted / Clear (0)';

        // Auto-trigger prediction with debounce
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            requestPrediction();
        }, 250);
    }

    sliderTemp.addEventListener('input', updateControlUI);
    sliderPh.addEventListener('input', updateControlUI);
    sliderColor.addEventListener('input', updateControlUI);
    toggleFat.addEventListener('change', updateControlUI);
    toggleTurb.addEventListener('change', updateControlUI);

    // --- 3. Reset Button ---
    btnReset.addEventListener('click', () => {
        sliderTemp.value = 36.0;
        sliderPh.value = 6.60;
        sliderColor.value = 254;
        toggleFat.checked = true;
        toggleTurb.checked = true;
        updateControlUI();
    });

    btnPredict.addEventListener('click', () => {
        requestPrediction();
    });

    // --- 4. Prediction API Call ---
    async function requestPrediction() {
        const payload = {
            temperature: parseFloat(sliderTemp.value),
            fat: toggleFat.checked ? 1 : 0,
            turbidity: toggleTurb.checked ? 1 : 0,
            color: parseInt(sliderColor.value, 10),
            ph: parseFloat(sliderPh.value)
        };

        try {
            const res = await fetch('/api/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Prediction API responded with error');
            const data = await res.json();
            renderPredictionResults(data);
        } catch (err) {
            console.error('[PREDICT ERROR]', err);
        }
    }

    function renderPredictionResults(data) {
        const grade = data.grade;
        const conf = data.confidence || {};
        const warnings = data.warnings || [];

        // Update Grade Banner
        if (grade === 'Medium') {
            gradeBanner.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05))';
            gradeBanner.style.borderColor = '#f59e0b';
            gradeBanner.style.boxShadow = '0 4px 20px rgba(245, 158, 11, 0.25)';
            gradeText.textContent = 'MEDIUM QUALITY (MILD ADULTERATION)';
            gradeText.style.color = '#f59e0b';
            gradeIcon.innerHTML = '<span>🟡</span>';
            gradeSubtext.textContent = 'Mild adulteration / standard whole milk: Managed physical bounds with intact colloidal structure.';
        } else {
            gradeBanner.style.background = 'linear-gradient(135deg, rgba(244, 63, 94, 0.15), rgba(244, 63, 94, 0.05))';
            gradeBanner.style.borderColor = '#f43f5e';
            gradeBanner.style.boxShadow = '0 4px 20px rgba(244, 63, 94, 0.25)';
            gradeText.textContent = 'LOW QUALITY (SEVERE ADULTERATION)';
            gradeText.style.color = '#f43f5e';
            gradeIcon.innerHTML = '<span>🔴</span>';
            gradeSubtext.textContent = 'Critical violation: Significant chemical neutralizer, severe water dilution, or bacterial spoilage detected!';
        }

        // Update Probabilities Progress Bars
        if (pctMedium && barMedium && conf.medium !== undefined) {
            pctMedium.textContent = `${conf.medium}%`;
            barMedium.style.width = `${conf.medium}%`;
        }
        if (pctLow && barLow && conf.low !== undefined) {
            pctLow.textContent = `${conf.low}%`;
            barLow.style.width = `${conf.low}%`;
        }

        // Update Adulterant Tag
        adulterantTag.textContent = data.adulterant_type || 'None';
        if (data.severity === 'danger') {
            adulterantTag.style.color = '#fb7185';
        } else if (data.severity === 'warning') {
            adulterantTag.style.color = '#fbbf24';
        } else {
            adulterantTag.style.color = '#34d399';
        }

        // Update Diagnosis Bullet Items
        diagnosisContainer.innerHTML = '';
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
            diagnosisContainer.appendChild(item);
        });
    }

    // --- 5. Presets Loader ---
    async function loadPresets() {
        try {
            const res = await fetch('/api/presets');
            const presets = await res.json();
            presetsGrid.innerHTML = '';

            presets.forEach(p => {
                const card = document.createElement('div');
                card.className = 'preset-card';
                const badgeClass = p.expected.toLowerCase().includes('high') ? 'high' : (p.expected.toLowerCase().includes('low') ? 'low' : 'medium');
                
                card.innerHTML = `
                    <div class="preset-header">
                        <div class="preset-title">${p.title}</div>
                        <span class="preset-badge ${badgeClass}">${p.expected}</span>
                    </div>
                    <p class="preset-desc">${p.description}</p>
                    <div class="preset-chips">
                        <span class="chip">Temp: ${p.values.temperature}°C</span>
                        <span class="chip">pH: ${p.values.ph}</span>
                        <span class="chip">Fat: ${p.values.fat}</span>
                        <span class="chip">Turbidity: ${p.values.turbidity}</span>
                        <span class="chip">Color: ${p.values.color}</span>
                    </div>
                `;

                card.addEventListener('click', () => {
                    // Populate sliders
                    sliderTemp.value = p.values.temperature;
                    sliderPh.value = p.values.ph;
                    sliderColor.value = p.values.color;
                    toggleFat.checked = p.values.fat === 1;
                    toggleTurb.checked = p.values.turbidity === 1;

                    // Switch back to analyzer tab
                    tabButtons[0].click();
                    updateControlUI();
                });

                presetsGrid.appendChild(card);
            });
        } catch (err) {
            console.error('[PRESETS ERROR]', err);
        }
    }

    // --- 6. Live ESP32 Telemetry Polling ---
    async function pollLiveTelemetry() {
        try {
            const res = await fetch('/api/esp32/live');
            const data = await res.json();

            if (data.connected && data.stream && data.stream.length > 0) {
                esp32StatusDot.className = 'pill-dot green';
                esp32StatusText.textContent = 'Hardware Connected';

                telemetryTbody.innerHTML = '';
                data.stream.slice(0, 15).forEach(row => {
                    const tr = document.createElement('tr');
                    const gradeColor = row.grade === 'Medium' ? '#f59e0b' : '#f43f5e';
                    tr.innerHTML = `
                        <td>${row.timestamp}</td>
                        <td><code>${row.device_id}</code></td>
                        <td>${row.temperature.toFixed(1)}</td>
                        <td>${row.ph.toFixed(2)}</td>
                        <td>${row.fat}</td>
                        <td>${row.turbidity}</td>
                        <td>${row.color}</td>
                        <td style="font-weight:700; color:${gradeColor};">${row.grade}</td>
                        <td>${row.adulterant_type}</td>
                    `;
                    telemetryTbody.appendChild(tr);
                });
            } else {
                esp32StatusDot.className = 'pill-dot blue';
                esp32StatusText.textContent = 'Listening (Port 5000)';
            }
        } catch (err) {
            // Server offline or polling error
        }
    }

    // Initial Execution
    updateControlUI();
    loadPresets();
    setInterval(pollLiveTelemetry, 3000);
});
