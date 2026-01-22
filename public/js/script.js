Chart.defaults.color = 'var(--text-secondary)';
Chart.defaults.borderColor = 'var(--border-color)';
Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
Chart.defaults.font.size = 11;

const app = (() => {
    // --- GANTI URL DI BAWAH INI DENGAN URL DEPLOYMENT BARU ANDA ---
    const API_URL = 'https://script.google.com/macros/s/AKfycbz1nJ6Uqa3CWnGtIY5aK0kgcSe3x0XstvsIbLGaFsN3v-s8WqVZ2i7X1SMp0e87-6Q0xA/exec';
    
    // API KEY untuk AI (Jangan dihapus)
    const k_head = "AIzaSyDHe6hnE2k6L"; 
    const k_tail = "pNeGQR13rKLOSwvW96p0m0"; 
    const apiKey = k_head + k_tail; 

    let state = {
        rawData: [],
        viewMode: 'SALES', // 'SALES' or 'DISTRIBUTION'
        sector: 'SUBSIDI', // 'SUBSIDI' or 'RETAIL'     
        activeProduct: 'UREA',  
        selectedYear: new Date().getFullYear(),
        sidebarOpen: true,
        isAdmin: false,
        theme: localStorage.getItem('theme') || 'dark',
        lastDataHash: localStorage.getItem('last_data_hash') || '',
        lastUpdateDate: localStorage.getItem('last_update_date') || 'Overview Performa'
    };

    let chartNasional = null;
    let chartProvinsi = null;
    let statsGlobal = null; 

    // --- UTILS ---
    const parseIndoNumber = (str) => {
        if (typeof str === 'number') return str;
        if (!str) return 0;
        let s = str.toString();
        if (s.includes(';')) { s = s.replace(/\./g, '').replace(';', '.'); } 
        else { s = s.replace(/\./g, '').replace(',', '.'); }
        return parseFloat(s) || 0;
    };
    const formatNumber = (num) => new Intl.NumberFormat('id-ID').format(num);
    const hexToRgbA = (hex, alpha) => {
        let c; if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){ c= hex.substring(1).split(''); if(c.length== 3){ c= [c[0], c[0], c[1], c[1], c[2], c[2]]; } c= '0x'+c.join(''); return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')'; } return hex;
    }

    const init = () => { 
        applyTheme(state.theme);
        if(state.lastUpdateDate) {
            const headerText = document.getElementById('header-update-text');
            if(headerText) headerText.innerText = state.lastUpdateDate;
        }
        fetchData(); 
        checkScreenSize(); 
        updateUIHeader();
    };

    // --- LOGIC TEMA ---
    const toggleTheme = () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', state.theme);
        applyTheme(state.theme);
        Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--text-secondary');
        Chart.defaults.borderColor = getComputedStyle(document.body).getPropertyValue('--border-color');
        updateDashboard();
    };
    const applyTheme = (themeName) => {
        document.documentElement.setAttribute('data-theme', themeName);
        const icon = document.getElementById('theme-icon');
        if(icon) icon.className = themeName === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    };

    // --- FETCH DATA ---
    const fetchData = async () => {
        document.getElementById('loader').style.display = 'flex';
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error("Format data salah");
            
            const currentHash = JSON.stringify(data).length + "_" + data.length;
            if (currentHash !== state.lastDataHash) {
                const now = new Date();
                const formattedDate = `Update: ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
                state.lastUpdateDate = formattedDate; state.lastDataHash = currentHash;
                localStorage.setItem('last_update_date', formattedDate); localStorage.setItem('last_data_hash', currentHash);
                const headerText = document.getElementById('header-update-text');
                if(headerText) headerText.innerText = formattedDate;
            }
            processData(data);
        } catch (err) {
            console.error(err); alert("Gagal mengambil data. Pastikan URL Script benar.");
        } finally {
            if(document.getElementById('loader')) document.getElementById('loader').style.display = 'none';
        }
    };

    const processData = (data) => {
        state.rawData = data.map(row => ({
            TAHUN: parseInt(row.TAHUN) || 0,
            BULAN: normalizeMonth(row.BULAN),
            SEKTOR: String(row.SEKTOR || '').toUpperCase(),
            PRODUK: String(row.PRODUK || '').toUpperCase(),
            JENIS: String(row.JENIS || '').toUpperCase(),
            PROVINSI: toTitleCase(String(row.PROVINSI || '')),
            KATEGORI: String(row.KATEGORI || '').toUpperCase(), // MODA di Distribusi
            MATERIAL: String(row.MATERIAL || '').toUpperCase(), // KEMASAN di Distribusi
            TONASE: parseIndoNumber(row.TONASE)
        }));

        // POPULATE YEAR FILTER
        const years = [...new Set(state.rawData.map(r => r.TAHUN))].sort((a,b) => b-a);
        const yearSel = document.getElementById('year-select');
        if (yearSel) {
            yearSel.innerHTML = '';
            years.forEach(y => {
                let opt = document.createElement('option'); opt.value = y; opt.text = y;
                if(y === state.selectedYear) opt.selected = true;
                yearSel.appendChild(opt);
            });
            if(!years.includes(state.selectedYear) && years.length > 0) state.selectedYear = years[0];
        }
        updateDashboard(); 
    };

    // --- NAVIGATION & UI ---
    const navigate = (mode, sector) => {
        state.viewMode = mode;
        state.sector = sector;
        
        // Update Sidebar Active State
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const menuId = `menu-${mode === 'SALES' ? 'sales' : 'dist'}-${sector.toLowerCase()}`;
        const activeEl = document.getElementById(menuId);
        if(activeEl) activeEl.classList.add('active');

        updateDashboard();
        if(window.innerWidth <= 768) { state.sidebarOpen = false; renderSidebar(); }
    };

    const updateUIHeader = () => {
        const titleMode = state.viewMode === 'SALES' ? 'Penjualan' : 'Distribusi';
        const titleSector = state.sector === 'SUBSIDI' ? 'Subsidi' : 'Retail';
        document.getElementById('page-title-text').innerText = `${titleMode} - ${titleSector}`;
        document.getElementById('lbl-urea-title').innerText = state.viewMode === 'SALES' ? 'Realisasi Urea' : 'Vol. Distribusi Urea';
        document.getElementById('lbl-npk-title').innerText = state.viewMode === 'SALES' ? 'Realisasi NPK' : 'Vol. Distribusi NPK';
    };

    const populateProvDropdown = (provKeys) => {
        const s = document.getElementById('dropdown-provinsi'); if(!s) return;
        const prevVal = s.value; s.innerHTML = '';
        const validKeys = provKeys.filter(p => p && p !== 'LAINNYA').sort();
        if(validKeys.length > 0) {
            validKeys.forEach(prov => { let opt = document.createElement('option'); opt.value = prov; opt.innerText = prov; s.appendChild(opt); });
            s.value = (prevVal && validKeys.includes(prevVal)) ? prevVal : validKeys[0];
        } else {
            let opt = document.createElement('option'); opt.value = ""; opt.innerText = "Tidak ada data"; s.appendChild(opt);
        }
    };

    const updateDashboard = () => {
        updateUIHeader();
        const { rawData, selectedYear, sector, activeProduct, viewMode } = state;
        
        let stats = {
            curr: { UREA: {real:0, target:0}, NPK: {real:0, target:0} },
            prev: { UREA: {real:0}, NPK: {real:0} },
            nasional: { UREA: {real:Array(12).fill(0), target:Array(12).fill(0), stock:Array(12).fill(0)}, NPK: {real:Array(12).fill(0), target:Array(12).fill(0), stock:Array(12).fill(0)} },
            provinsi: {} 
        };

        const dropdownProvs = new Set();

        rawData.forEach(r => {
            // Filter Sektor
            let isSectorMatch = (sector === 'SUBSIDI') ? r.SEKTOR.includes('SUBSIDI') : r.SEKTOR.includes('RETAIL'); 
            if (!isSectorMatch) return;

            // Filter Sales vs Distribusi
            let isDistData = r.JENIS.includes('DISTRIBUSI');
            if (viewMode === 'DISTRIBUTION') { if (!isDistData) return; } else { if (isDistData) return; }

            // Filter Produk
            let prodKey = '';
            if (r.PRODUK.includes('UREA') || r.PRODUK.includes('NITREA')) prodKey = 'UREA';
            else if (r.PRODUK.includes('NPK') || r.PRODUK.includes('PHONSKA')) prodKey = 'NPK';
            if (!prodKey) return;

            if(r.TAHUN === selectedYear && prodKey === state.activeProduct) {
                 if(r.PROVINSI && r.PROVINSI !== 'LAINNYA') dropdownProvs.add(r.PROVINSI);
            }

            // Klasifikasi Angka
            let isReal = r.JENIS.includes('REALISASI') || r.JENIS.includes('PENJUALAN') || (viewMode === 'DISTRIBUTION' && !r.JENIS.includes('TARGET'));
            let isTarget = r.JENIS.includes('RKAP') || r.JENIS.includes('TARGET') || r.JENIS.includes('RKO');
            let isStock = r.JENIS.includes('STOK') || r.JENIS.includes('STOCK');

            if (r.TAHUN === selectedYear) {
                if (isReal) {
                    stats.curr[prodKey].real += r.TONASE;
                    if(r.BULAN >= 0) stats.nasional[prodKey].real[r.BULAN] += r.TONASE;
                    if (prodKey === state.activeProduct) {
                         if (!stats.provinsi[r.PROVINSI]) stats.provinsi[r.PROVINSI] = { real: 0, target: 0 };
                         stats.provinsi[r.PROVINSI].real += r.TONASE;
                    }
                } 
                else if (isTarget) {
                    stats.curr[prodKey].target += r.TONASE;
                    if(r.BULAN >= 0) stats.nasional[prodKey].target[r.BULAN] += r.TONASE;
                    if (prodKey === state.activeProduct) {
                        if (!stats.provinsi[r.PROVINSI]) stats.provinsi[r.PROVINSI] = { real: 0, target: 0 };
                        stats.provinsi[r.PROVINSI].target += r.TONASE;
                    }
                }
                else if (isStock && viewMode === 'SALES') {
                    if(r.BULAN >= 0) stats.nasional[prodKey].stock[r.BULAN] += r.TONASE;
                }
            }
            if (r.TAHUN === (selectedYear - 1) && isReal) stats.prev[prodKey].real += r.TONASE;
        });

        populateProvDropdown([...dropdownProvs]);
        statsGlobal = stats;
        renderKPI(stats);
        renderRankings(stats.provinsi);
        renderNasionalChart(stats.nasional);
        renderProvChart(); 
    };

    const renderKPI = (stats) => {
        const fmt = (n) => formatNumber(n);
        const updateCard = (key, data) => {
            const real = data.curr[key].real;
            const target = data.curr[key].target;
            const prev = data.prev[key].real;
            const keyL = key.toLowerCase();
            
            document.getElementById(`val-${keyL}-real`).innerText = fmt(real);
            
            const elPct = document.getElementById(`val-${keyL}-pct`);
            const elProg = document.getElementById(`prog-${keyL}`);
            const elTargetLabel = document.getElementById(`val-${keyL}-target`).parentElement;
            const elRowSisa = document.getElementById(`row-${keyL}-sisa`);
            const lblTargetWrapper = document.getElementById(`lbl-${keyL}-target-wrapper`);

            if (state.viewMode === 'SALES') {
                const pct = target > 0 ? (real / target * 100) : 0;
                if(elPct) elPct.innerText = pct.toFixed(0) + '%'; 
                if(elProg) elProg.style.width = Math.min(pct, 100) + '%';
                if(lblTargetWrapper) lblTargetWrapper.innerHTML = `Target: <span id="val-${keyL}-target">${fmt(target)}</span>`;
                if(elRowSisa) {
                    const sisa = target - real;
                    if (sisa <= 0) { elRowSisa.innerHTML = '<i class="fas fa-check-circle"></i> Tercapai'; elRowSisa.style.color = 'var(--color-success)'; } 
                    else { elRowSisa.innerHTML = `Sisa Target: <span id="val-${keyL}-sisa">${fmt(sisa)}</span>`; elRowSisa.style.color = 'var(--color-danger)'; }
                }
            } else {
                // DISTRIBUTION MODE
                let growthYoY = 0;
                if(prev > 0) growthYoY = ((real - prev) / prev) * 100;
                if(elPct) {
                    const sign = growthYoY > 0 ? '+' : '';
                    elPct.innerText = sign + growthYoY.toFixed(1) + '% (YoY)';
                    elPct.style.fontSize = '11px';
                }
                if(elProg) elProg.style.width = '0%';
                
                // Calculate Breakdown from RawData
                let truck=0, ship=0, bag=0, curah=0;
                state.rawData.forEach(r => {
                    if (r.TAHUN === state.selectedYear && r.PRODUK.includes(key) && r.JENIS.includes('DISTRIBUSI') && ((state.sector==='SUBSIDI' && r.SEKTOR.includes('SUBSIDI')) || (state.sector==='RETAIL' && r.SEKTOR.includes('RETAIL')))) {
                        if (r.KATEGORI && r.KATEGORI.includes('TRUCK')) truck += r.TONASE;
                        if (r.KATEGORI && r.KATEGORI.includes('KAPAL')) ship += r.TONASE;
                        if (r.MATERIAL && (r.MATERIAL.includes('BAG') || r.MATERIAL.includes('ZAK'))) bag += r.TONASE;
                        if (r.MATERIAL && r.MATERIAL.includes('CURAH')) curah += r.TONASE;
                    }
                });

                if(lblTargetWrapper) lblTargetWrapper.innerHTML = `<span style="font-size:10px; color:var(--text-secondary);"><i class="fas fa-truck"></i> ${fmt(truck)} &nbsp;|&nbsp; <i class="fas fa-ship"></i> ${fmt(ship)}</span>`;
                if(elRowSisa) {
                    if(curah > 0 || bag > 0) { elRowSisa.innerHTML = `Bag: ${fmt(bag)} | Curah: ${fmt(curah)}`; elRowSisa.style.color = 'var(--text-muted)'; }
                    else { elRowSisa.innerHTML = '-'; }
                }
            }

            // Growth
            let growth = 0; let isUp = true;
            if(prev > 0) { growth = ((real - prev) / prev) * 100; isUp = growth >= 0; } else if (real > 0) growth = 100;
            const elGrowthVal = document.getElementById(`growth-${keyL}-val`);
            if(elGrowthVal) {
                const sign = growth > 0 ? '+' : '';
                elGrowthVal.innerText = sign + growth.toFixed(1) + '%';
                elGrowthVal.style.color = isUp ? 'var(--color-success)' : 'var(--color-danger)';
            }
            document.getElementById(`year-curr-${keyL}`).innerText = state.selectedYear;
            document.getElementById(`year-prev-${keyL}`).innerText = state.selectedYear - 1;
            document.getElementById(`val-${keyL}-curr`).innerText = fmt(real);
            document.getElementById(`val-${keyL}-prev`).innerText = fmt(prev);
        };
        updateCard('UREA', stats); updateCard('NPK', stats);
    };

    const renderNasionalChart = (nasStats) => {
        const canvas = document.getElementById('chartNasional'); if(!canvas) return;
        const ctx = canvas.getContext('2d'); if(chartNasional) chartNasional.destroy();
        const isUrea = state.activeProduct === 'UREA';
        const data = isUrea ? nasStats.UREA : nasStats.NPK;
        const color = isUrea ? '#FFDE00' : '#38bdf8'; 
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, hexToRgbA(color, 0.4)); gradient.addColorStop(1, hexToRgbA(color, 0.0));
        
        let datasets = [{ label: state.viewMode === 'SALES' ? 'Realisasi' : 'Terkirim', data: data.real, borderColor: color, backgroundColor: gradient, fill: true, tension: 0.4, borderWidth: 3, pointRadius: 3 }];
        if(state.viewMode === 'SALES') {
            datasets.push({ label: 'Target', data: data.target, borderColor: 'var(--text-muted)', borderDash: [5, 5], borderWidth: 2, fill: false, tension: 0.4, pointRadius: 0 });
            datasets.push({ label: 'Stok', data: data.stock, type: 'bar', backgroundColor: '#616161', borderWidth: 0, barPercentage: 0.6, order: 3 });
        }
        chartNasional = new Chart(ctx, { type: 'line', data: { labels: ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'], datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: 'var(--text-secondary)' } } }, scales: { x: { grid: { display: false }, ticks: { color: 'var(--text-secondary)' } }, y: { grid: { color: 'var(--border-subtle)' }, ticks: { color: 'var(--text-secondary)', callback: (v) => v>=1000?(v/1000)+'k':v } } } });
    };

    const renderProvChart = () => {
        const provName = document.getElementById('dropdown-provinsi').value;
        const canvas = document.getElementById('chartProvinsi'); if(!canvas) return;
        const placeholder = document.getElementById('prov-placeholder');
        const ctx = canvas.getContext('2d');
        if (!provName) { if(placeholder) placeholder.style.display = 'flex'; if(chartProvinsi) chartProvinsi.clear(); return; }
        if(placeholder) placeholder.style.display = 'none';

        let mReal = Array(12).fill(0), mTarget = Array(12).fill(0);
        state.rawData.forEach(r => {
            if (r.TAHUN !== state.selectedYear || r.PROVINSI !== provName) return;
            let isSectorMatch = (state.sector === 'SUBSIDI') ? r.SEKTOR.includes('SUBSIDI') : r.SEKTOR.includes('RETAIL'); if (!isSectorMatch) return;
            let isDistData = r.JENIS.includes('DISTRIBUSI');
            if (state.viewMode === 'DISTRIBUTION') { if (!isDistData) return; } else { if (isDistData) return; }
            let prodKey = ''; if (r.PRODUK.includes('UREA') || r.PRODUK.includes('NITREA')) prodKey = 'UREA'; else if (r.PRODUK.includes('NPK') || r.PRODUK.includes('PHONSKA')) prodKey = 'NPK';
            if (prodKey !== state.activeProduct) return;

            if (r.BULAN >= 0) {
                if (r.JENIS.includes('RKAP') || r.JENIS.includes('TARGET')) mTarget[r.BULAN] += r.TONASE;
                else mReal[r.BULAN] += r.TONASE;
            }
        });

        if(chartProvinsi) chartProvinsi.destroy();
        const colorMain = state.activeProduct === 'UREA' ? '#FFDE00' : '#38bdf8';
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, hexToRgbA(colorMain, 0.4)); gradient.addColorStop(1, hexToRgbA(colorMain, 0.0));
        let datasets = [{ label: state.viewMode === 'SALES' ? 'Realisasi' : 'Terkirim', data: mReal, borderColor: colorMain, backgroundColor: gradient, fill: true, tension: 0.4, borderWidth: 3, pointRadius: 3 }];
        if(state.viewMode === 'SALES') { datasets.push({ label: 'Target', data: mTarget, borderColor: 'var(--text-muted)', borderDash: [5, 5], borderWidth: 2, fill: false, tension: 0.4, pointRadius: 0 }); }

        chartProvinsi = new Chart(ctx, { type: 'line', data: { labels: ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'], datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: 'var(--text-secondary)' } } }, scales: { x: { grid: { display: false }, ticks: { color: 'var(--text-secondary)' } }, y: { grid: { color: 'var(--border-subtle)' }, ticks: { color: 'var(--text-secondary)', callback: (v) => v>=1000?(v/1000)+'k':v } } } });
    };

    const renderRankings = (provData) => {
        let arr = Object.keys(provData).map(key => {
            const item = provData[key];
            let sortVal = 0, displayVal = '';
            if (state.sector === 'SUBSIDI' && state.viewMode === 'SALES') { sortVal = item.target > 0 ? (item.real / item.target) * 100 : 0; displayVal = sortVal.toFixed(1) + '%'; } 
            else { sortVal = item.real; displayVal = formatNumber(item.real); }
            return { name: key, val: sortVal, display: displayVal, rawReal: item.real };
        });
        let activeData = arr.filter(item => item.rawReal > 0).sort((a,b) => b.val - a.val);
        const listBest = document.getElementById('list-top5'), listWarn = document.getElementById('list-others');
        const renderRow = (item, i, isTop) => {
            let rankClass = isTop ? (i===0?'gold':i===1?'silver':'bronze') : 'warn';
            let numHtml = isTop && i<3 ? `<i class="fas fa-medal" style="color:var(--color-${rankClass})"></i>` : i+1;
            return `<div class="rank-item"><div class="rank-left"><div class="rank-num ${isTop?'medal-box':''}">${numHtml}</div><div class="rank-name ${isTop && i<3 ? rankClass : ''}">${item.name}</div></div><div class="rank-val ${isTop?'val-best':'val-warn'}">${item.display}</div></div>`;
        };
        if(listBest) listBest.innerHTML = activeData.slice(0, 5).map((x,i) => renderRow(x,i,true)).join('') || '<div style="padding:15px;text-align:center;color:grey;">Data Kosong</div>';
        if(listWarn) listWarn.innerHTML = activeData.slice(5).sort((a,b) => a.val - b.val).slice(0, 5).map((x,i) => renderRow(x,i,false)).join('') || '<div style="padding:15px;text-align:center;color:grey;">Data Kosong</div>';
    };

    const analyzeData = async (type) => {
        const flipInner = document.getElementById(`flip-${type}`); const content = document.getElementById(`ai-${type}-content`);
        flipInner.classList.add('flipped');
        content.innerHTML = '<div style="margin-top:60px; text-align:center; color:var(--text-secondary);"><i class="fas fa-circle-notch fa-spin fa-2x"></i><br><span style="font-size:12px; margin-top:10px; display:block;">Analisis AI berjalan...</span></div>';
        const prod = state.activeProduct; const sec = state.sector; const mode = state.viewMode === 'SALES' ? 'PENJUALAN' : 'DISTRIBUSI'; const year = state.selectedYear;
        let ctxData = "";
        if (type === 'nasional') {
            const d = prod === 'UREA' ? statsGlobal.nasional.UREA : statsGlobal.nasional.NPK;
            const totalReal = d.real.reduce((a,b)=>a+b,0);
            ctxData = `DATA: ${mode} Nasional, Produk ${prod}, Sektor ${sec}, Tahun ${year}. Realisasi Total: ${formatNumber(totalReal)} Ton.`;
        } else {
            const provName = document.getElementById('dropdown-provinsi').value;
            if(!statsGlobal.provinsi[provName]) { content.innerHTML = "<p>Data Tidak Ditemukan</p>"; return; }
            ctxData = `DATA: ${mode} Provinsi ${provName}, Produk ${prod}, Sektor ${sec}, Tahun ${year}. Realisasi: ${formatNumber(statsGlobal.provinsi[provName].real)} Ton.`;
        }
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: `Role: Data Analyst. Context: ${ctxData}. Task: Insight singkat 3 poin.` }] }] }) });
            const result = await response.json();
            let cleanText = result.candidates[0].content.parts[0].text.replace(/[*#]/g, '').trim();
            content.innerHTML = `<div style="animation: fadeIn 0.5s; font-size: 13px; line-height: 1.5;">${cleanText}</div>`;
        } catch (e) { content.innerHTML = `<p>Gagal memuat AI.</p>`; }
    };

    const normalizeMonth = (str) => { const map = {'JAN':0, 'JANUARI':0, 'FEB':1, 'FEBRUARI':1, 'MAR':2, 'MARET':2, 'APR':3, 'APRIL':3, 'MEI':4, 'MAY':4, 'JUN':5, 'JUNI':5, 'JUL':6, 'JULI':6, 'AGU':7, 'AGUSTUS':7, 'SEP':8, 'SEPTEMBER':8, 'OKT':9, 'OKTOBER':9, 'NOV':10, 'NOVEMBER':10, 'DES':11, 'DESEMBER':11}; return map[String(str).toUpperCase().trim()] ?? -1; };
    const toTitleCase = (str) => str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    const renderSidebar = () => { const sb = document.getElementById('sidebar'); const main = document.getElementById('main-content'); const overlay = document.getElementById('sidebar-overlay'); if (state.sidebarOpen) { sb.classList.remove('closed'); main.classList.remove('closed'); if(window.innerWidth <= 768) { overlay.classList.add('show'); sb.style.transform = 'translateX(0)'; } } else { sb.classList.add('closed'); main.classList.add('closed'); if(window.innerWidth <= 768) { overlay.classList.remove('show'); sb.style.transform = 'translateX(-100%)'; } } setTimeout(() => { if (chartNasional) chartNasional.resize(); if (chartProvinsi) chartProvinsi.resize(); }, 310); };

    return {
        init, toggleSidebar: () => { state.sidebarOpen = !state.sidebarOpen; renderSidebar(); },
        toggleTheme, navigate, changeYear: (val) => { state.selectedYear = parseInt(val); updateDashboard(); },
        setChartProduct: (prod) => { state.activeProduct = prod; document.getElementById('btn-nas-urea').classList.toggle('active', prod === 'UREA'); document.getElementById('btn-nas-npk').classList.toggle('active', prod === 'NPK'); updateDashboard(); },
        renderProvChart, showLoginModal: () => document.getElementById('loginModal').style.display = 'flex',
        closeLoginModal: () => document.getElementById('loginModal').style.display = 'none',
        login: () => { if(document.getElementById('adminPass').value === 'pso123') { state.isAdmin = true; alert('Login Berhasil'); document.getElementById('loginModal').style.display = 'none'; } else { alert('Password salah!'); } },
        analyzeData, flipCard: (type) => document.getElementById(`flip-${type}`).classList.remove('flipped')
    };
})();
window.onload = app.init;
window.onresize = () => { if(window.innerWidth > 768) app.toggleSidebar(); };
