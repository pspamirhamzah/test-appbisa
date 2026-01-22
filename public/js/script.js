Chart.defaults.color = '#b3b3b3';
Chart.defaults.borderColor = '#424242';
Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
Chart.defaults.font.size = 11;

const app = (() => {
    const API_URL = 'https://script.google.com/macros/s/AKfycbzFanoakpPL3NaMh8CqbolDF5wo9iVb6ikIKQavQh15aGJYBCj7rGQdWyE3sMC911wxdA/exec';
    
    // --- API KEY CONFIGURATION ---
    // Pastikan ini sesuai dengan key Anda
    const k_head = "AIzaSyDHe6hnE2k6L"; 
    const k_tail = "pNeGQR13rKLOSwvW96p0m0"; 
    const apiKey = k_head + k_tail; 

    let state = {
        rawData: [],
        sector: 'SUBSIDI',      
        activeProduct: 'UREA',  
        selectedYear: new Date().getFullYear(),
        sidebarOpen: true,
        isAdmin: false,
        lastDataHash: localStorage.getItem('last_data_hash') || '',
        lastUpdateDate: localStorage.getItem('last_update_date') || 'Overview Performa Penjualan'
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

    const createDashedCircle = (color) => {
        const size = 12; const r = 4.5; const c = document.createElement('canvas');
        c.width = size; c.height = size; const ctx = c.getContext('2d');
        ctx.beginPath(); ctx.setLineDash([2, 2]); ctx.lineWidth = 1.5;
        ctx.strokeStyle = color; ctx.arc(size/2, size/2, r, 0, 2 * Math.PI); ctx.stroke();
        return c;
    };

    const init = () => { 
        if(state.lastUpdateDate) {
            const headerText = document.getElementById('header-update-text');
            if(headerText) headerText.innerText = state.lastUpdateDate;
        }
        fetchData(); 
        checkScreenSize(); 
    };

    const checkScreenSize = () => {
        if(window.innerWidth <= 768) { state.sidebarOpen = false; } 
        else { state.sidebarOpen = true; }
        renderSidebar();
    };

    const fetchData = async () => {
        document.getElementById('loader').style.display = 'flex';
        setTimeout(() => { if(document.getElementById('loader')) document.getElementById('loader').style.display = 'none'; }, 10000);

        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error("Format data salah");
            
            const currentHash = JSON.stringify(data).length + "_" + data.length;
            if (currentHash !== state.lastDataHash) {
                const now = new Date();
                const formattedDate = `Update: ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
                
                state.lastUpdateDate = formattedDate;
                state.lastDataHash = currentHash;
                
                localStorage.setItem('last_update_date', formattedDate);
                localStorage.setItem('last_data_hash', currentHash);
                
                const headerText = document.getElementById('header-update-text');
                if(headerText) headerText.innerText = formattedDate;
            } else {
                 const headerText = document.getElementById('header-update-text');
                 if(headerText) headerText.innerText = state.lastUpdateDate;
            }

            processData(data);
        } catch (err) {
            console.error("Fetch Error:", err);
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
            TONASE: parseIndoNumber(row.TONASE)
        }));

        const years = [...new Set(state.rawData.map(r => r.TAHUN))].sort((a,b) => b-a);
        const yearSel = document.getElementById('year-select');
        if (yearSel) {
            yearSel.innerHTML = '';
            years.forEach(y => {
                let opt = document.createElement('option');
                opt.value = y; opt.text = y;
                if(y === state.selectedYear) opt.selected = true;
                yearSel.appendChild(opt);
            });
            if(!years.includes(state.selectedYear) && years.length > 0) state.selectedYear = years[0];
        }

        updateDashboard(); 
    };

    const populateProvDropdown = (provKeys) => {
        const s = document.getElementById('dropdown-provinsi');
        if(!s) return;
        const prevVal = s.value; 
        s.innerHTML = '';

        const validKeys = provKeys.filter(p => p && p !== 'LAINNYA').sort();

        if(validKeys.length > 0) {
            validKeys.forEach(prov => {
                let opt = document.createElement('option');
                opt.value = prov; opt.innerText = prov;
                s.appendChild(opt);
            });
            if (prevVal && validKeys.includes(prevVal)) { s.value = prevVal; } 
            else { s.value = validKeys[0]; }
        } else {
            let opt = document.createElement('option');
            opt.value = ""; opt.innerText = "Tidak ada data"; s.appendChild(opt);
        }
    };

    const updateDashboard = () => {
        const { rawData, selectedYear, sector, activeProduct } = state;
        let stats = {
            curr: { UREA: {real:0, target:0}, NPK: {real:0, target:0} },
            prev: { UREA: {real:0}, NPK: {real:0} },
            nasional: { 
                UREA: {real:Array(12).fill(0), target:Array(12).fill(0), stock:Array(12).fill(0)}, 
                NPK: {real:Array(12).fill(0), target:Array(12).fill(0), stock:Array(12).fill(0)} 
            },
            provinsi: {} 
        };

        const dropdownProvs = new Set();

        rawData.forEach(r => {
            let isSectorMatch = (sector === 'SUBSIDI') ? 
                (r.SEKTOR.includes('SUBSIDI')) : (r.SEKTOR.includes('RETAIL')); 
            if (!isSectorMatch) return;

            let prodKey = '';
            if (r.PRODUK.includes('UREA') || r.PRODUK.includes('NITREA')) prodKey = 'UREA';
            else if (r.PRODUK.includes('NPK') || r.PRODUK.includes('PHONSKA')) prodKey = 'NPK';
            if (!prodKey) return;

            if(r.TAHUN === selectedYear && prodKey === state.activeProduct) {
                 if(r.PROVINSI && r.PROVINSI !== 'LAINNYA') dropdownProvs.add(r.PROVINSI);
            }

            let isReal = r.JENIS.includes('REALISASI') || r.JENIS.includes('PENJUALAN');
            let isTarget = r.JENIS.includes('RKAP') || r.JENIS.includes('TARGET') || r.JENIS.includes('RKO');
            let isStock = r.JENIS.includes('STOK') || r.JENIS.includes('STOCK') || r.JENIS.includes('AKTUAL');

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
                else if (isStock) {
                    if(r.BULAN >= 0) stats.nasional[prodKey].stock[r.BULAN] += r.TONASE;
                }
            }
            if (r.TAHUN === (selectedYear - 1) && isReal) stats.prev[prodKey].real += r.TONASE;
        });

        populateProvDropdown([...dropdownProvs]);
        
        const titleEl = document.getElementById('prov-chart-title');
        if(titleEl) {
            titleEl.innerText = 'Realisasi Provinsi';
            titleEl.style.color = ''; 
        }

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
            
            const pct = target > 0 ? (real / target * 100) : 0;
            
            const elRealBig = document.getElementById(`val-${keyL}-real`);
            if(elRealBig) elRealBig.innerText = fmt(real);
            
            const elPct = document.getElementById(`val-${keyL}-pct`);
            if(elPct) elPct.innerText = pct.toFixed(0) + '%'; 

            const elProg = document.getElementById(`prog-${keyL}`);
            if(elProg) elProg.style.width = Math.min(pct, 100) + '%';
            
            const elTarget = document.getElementById(`val-${keyL}-target`);
            if(elTarget) elTarget.innerText = fmt(target);

            const elRowSisa = document.getElementById(`row-${keyL}-sisa`);
            if(elRowSisa) {
                const sisa = target - real;
                
                if (sisa <= 0) {
                    elRowSisa.innerHTML = '<i class="fas fa-check-circle"></i> Tercapai';
                    elRowSisa.style.color = 'var(--color-success)'; 
                } else {
                    elRowSisa.innerHTML = `Sisa Alokasi: <span id="val-${keyL}-sisa">${fmt(sisa)}</span>`;
                    elRowSisa.style.color = 'var(--color-danger)'; 
                }
            }

            let growth = 0; let isUp = true;
            if(prev > 0) { growth = ((real - prev) / prev) * 100; isUp = growth >= 0; } 
            else if (real > 0) { growth = 100; }

            const elGrowthVal = document.getElementById(`growth-${keyL}-val`);
            if(elGrowthVal) {
                const sign = growth > 0 ? '+' : '';
                elGrowthVal.innerText = sign + growth.toFixed(1) + '%';
                elGrowthVal.style.color = isUp ? 'var(--color-success)' : 'var(--color-danger)';
            }
        };
        updateCard('UREA', stats);
        updateCard('NPK', stats);
    };

    // --- FITUR AI: SINGKAT, PADAT, RAPI, BERSIH ---
    const analyzeData = async (type) => {
        const flipInner = document.getElementById(`flip-${type}`);
        const content = document.getElementById(`ai-${type}-content`);
        
        // 1. Animasi Loading
        flipInner.classList.add('flipped');
        content.innerHTML = '<div style="margin-top:60px; text-align:center; color:var(--text-secondary);"><i class="fas fa-circle-notch fa-spin fa-2x"></i><br><span style="font-size:12px; margin-top:10px; display:block;">Menyiapkan insight data...</span></div>';

        // 2. Siapkan Data Konteks
        let ctxData = "";
        const prod = state.activeProduct; 
        const sec = state.sector;         
        const year = state.selectedYear;
        
        if (type === 'nasional') {
            const d = prod === 'UREA' ? statsGlobal.nasional.UREA : statsGlobal.nasional.NPK;
            const totalReal = d.real.reduce((a,b)=>a+b,0);
            const totalTarget = d.target.reduce((a,b)=>a+b,0);
            const pct = totalTarget > 0 ? (totalReal/totalTarget*100).toFixed(1) : 0;
            ctxData = `DATA: Nasional, Produk ${prod}, Sektor ${sec}, Tahun ${year}. Realisasi: ${formatNumber(totalReal)} Ton. Alokasi: ${formatNumber(totalTarget)} Ton. Capaian: ${pct}%.`;
        } else {
            const provName = document.getElementById('dropdown-provinsi').value;
            if(!statsGlobal.provinsi[provName]) {
                 content.innerHTML = "<h4>Data Tidak Ditemukan</h4><p>Silakan pilih provinsi yang memiliki data terlebih dahulu.</p>";
                 return;
            }
            const pData = statsGlobal.provinsi[provName];
            const pct = pData.target > 0 ? (pData.real/pData.target*100).toFixed(1) : 0;
            ctxData = `DATA: Provinsi ${provName}, Produk ${prod}, Sektor ${sec}, Tahun ${year}. Realisasi: ${formatNumber(pData.real)} Ton. Alokasi: ${formatNumber(pData.target)} Ton. Capaian: ${pct}%.`;
        }

        // 3. Prompt (Diubah agar SINGKAT & PADAT)
        const promptText = `
            Peran: Senior Data Analyst PT Pupuk Indonesia.
            Konteks: ${ctxData}
            
            Tugas: Berikan Executive Summary super ringkas.
            Aturan Main:
            1. JANGAN gunakan kalimat pembuka basa-basi.
            2. Maksimal 20 kata per poin.
            3. Gunakan bahasa bisnis yang taktis.
            
            Format Output (HTML Murni):
            <h4 style="margin-bottom:8px;"><i class="fas fa-chart-line"></i> Status Kinerja</h4>
            <ul style="padding-left:20px; margin-bottom:12px;">
                <li>[Sebutkan Status Capaian & Sisa Gap secara singkat]</li>
            </ul>
            <h4 style="margin-bottom:8px;"><i class="fas fa-lightbulb"></i> Rekomendasi</h4>
            <ul style="padding-left:20px; margin-bottom:0;">
                <li>[Kaitkan dengan Musim Tanam/Cuaca saat ini]</li>
                <li>[Satu langkah aksi konkret]</li>
            </ul>
        `;

        try {
            // Request ke API (v1beta & gemini-2.5-flash)
            const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: promptText }] }]
                })
            });
            
            const result = await response.json();
            
            if (result.error) throw new Error(result.error.message);

            let rawText = result.candidates[0].content.parts[0].text;
            
            // --- PEMBERSIH TEKS (Hapus Markdown Bintang & Kode) ---
            let cleanText = rawText
                .replace(/```html/g, '')  
                .replace(/```/g, '')      
                .replace(/\*\*/g, '')     // Hapus Bintang Bold
                .replace(/\*/g, '')       // Hapus Bintang Biasa
                .trim();
            
            content.innerHTML = `<div style="animation: fadeIn 0.5s; font-size: 13px; line-height: 1.5;">${cleanText}</div>`;
            
        } catch (e) {
            console.error(e);
            content.innerHTML = `<h4 style="color:var(--color-danger)">Gagal Memuat</h4><p style="font-size:11px">Error: ${e.message}</p>`;
        }
    };

    const flipCard = (type) => {
        document.getElementById(`flip-${type}`).classList.remove('flipped');
    };

    const renderNasionalChart = (nasStats) => {
        const canvas = document.getElementById('chartNasional');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        if(chartNasional) chartNasional.destroy();

        const isUrea = state.activeProduct === 'UREA';
        const data = isUrea ? nasStats.UREA : nasStats.NPK;
        const color = isUrea ? '#FFDE00' : '#38bdf8'; 
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, hexToRgbA(color, 0.4));
        gradient.addColorStop(1, hexToRgbA(color, 0.0));
        
        const targetIcon = createDashedCircle('#999'); 

        chartNasional = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'],
                datasets: [
                    {
                        label: 'Realisasi', data: data.real, borderColor: color, backgroundColor: gradient,
                        fill: true, tension: 0.4, borderWidth: 3, 
                        pointRadius: 4, pointHoverRadius: 6, 
                        pointStyle: 'circle', order: 1
                    },
                    {
                        label: 'Alokasi', data: data.target, borderColor: '#666', borderDash: [6, 6],
                        borderWidth: 2, fill: false, tension: 0.4, 
                        pointRadius: 0, pointStyle: targetIcon, order: 2 
                    },
                    {
                        label: 'Stok', data: data.stock, type: 'bar', backgroundColor: '#616161', borderColor: '#616161',
                        borderWidth: 0, barPercentage: 0.8, pointStyle: 'rect', order: 3
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { 
                    legend: { display: true, labels: { usePointStyle: true, boxWidth: 6, boxHeight: 6, 
                        generateLabels: (chart) => Chart.defaults.plugins.legend.labels.generateLabels(chart).map(l => { 
                            l.pointStyle = 'rect'; return l; 
                        }) 
                    }},
                    tooltip: { backgroundColor: 'rgba(33, 33, 33, 0.95)', titleColor: '#ececec', bodyColor: '#b3b3b3', borderColor: '#424242', borderWidth: 1, displayColors: false, callbacks: { label: (c) => c.dataset.label + ': ' + formatNumber(c.raw) } }
                },
                scales: { x: { grid: { display: false } }, y: { grid: { color: '#333' }, beginAtZero: true, ticks: { maxTicksLimit: 5, callback: (v) => v===0?null:(v>=1000?(v/1000)+' rb':v) } } }
            }
        });
    };

    const renderProvChart = () => {
        const provName = document.getElementById('dropdown-provinsi').value;
        const placeholder = document.getElementById('prov-placeholder');
        const canvas = document.getElementById('chartProvinsi');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        
        if (!provName) {
            if(placeholder) placeholder.style.display = 'flex';
            if(chartProvinsi) chartProvinsi.clear();
            return;
        }
        if(placeholder) placeholder.style.display = 'none';

        let mReal = Array(12).fill(0);
        let mTarget = Array(12).fill(0);
        let mStock = Array(12).fill(0);

        state.rawData.forEach(r => {
            if (r.TAHUN !== state.selectedYear || r.PROVINSI !== provName) return;
            let isSectorMatch = (state.sector === 'SUBSIDI') ? r.SEKTOR.includes('SUBSIDI') : r.SEKTOR.includes('RETAIL');
            if (!isSectorMatch) return;

            let prodKey = '';
            if (r.PRODUK.includes('UREA') || r.PRODUK.includes('NITREA')) prodKey = 'UREA';
            else if (r.PRODUK.includes('NPK') || r.PRODUK.includes('PHONSKA')) prodKey = 'NPK';
            
            if (prodKey !== state.activeProduct) return;

            if (r.BULAN >= 0) {
                if (r.JENIS.includes('REALISASI') || r.JENIS.includes('PENJUALAN')) mReal[r.BULAN] += r.TONASE;
                else if (r.JENIS.includes('RKAP') || r.JENIS.includes('TARGET') || r.JENIS.includes('RKO')) mTarget[r.BULAN] += r.TONASE;
                else if (r.JENIS.includes('STOK') || r.JENIS.includes('STOCK') || r.JENIS.includes('AKTUAL')) mStock[r.BULAN] += r.TONASE;
            }
        });

        if(chartProvinsi) chartProvinsi.destroy();
        const colorMain = state.activeProduct === 'UREA' ? '#FFDE00' : '#38bdf8';
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, hexToRgbA(colorMain, 0.4));
        gradient.addColorStop(1, hexToRgbA(colorMain, 0.0));

        const targetIcon = createDashedCircle('#999');

        chartProvinsi = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'],
                datasets: [
                    {
                        label: 'Realisasi', data: mReal, borderColor: colorMain, backgroundColor: gradient,
                        fill: true, tension: 0.4, borderWidth: 3, 
                        pointRadius: 4, pointHoverRadius: 6, pointStyle: 'circle',
                        order: 1
                    },
                    {
                        label: 'Alokasi', data: mTarget, borderColor: '#666', borderDash: [6, 6], 
                        borderWidth: 2, fill: false, tension: 0.4, 
                        pointRadius: 0, pointStyle: targetIcon, order: 2
                    },
                    {
                        label: 'Stok', data: mStock, type: 'bar', backgroundColor: '#616161', borderColor: '#616161', 
                        borderWidth: 0, barPercentage: 0.8, pointStyle: 'rect', order: 3
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { 
                    legend: { display: true, labels: { usePointStyle: true, boxWidth: 6, boxHeight: 6, 
                        generateLabels: (chart) => Chart.defaults.plugins.legend.labels.generateLabels(chart).map(l => { 
                            l.pointStyle = 'rect'; return l; 
                        }) 
                    }},
                    tooltip: { backgroundColor: 'rgba(33, 33, 33, 0.95)', titleColor: '#ececec', bodyColor: '#b3b3b3', borderColor: '#424242', borderWidth: 1, displayColors: false, callbacks: { label: (c) => c.dataset.label + ': ' + formatNumber(c.raw) } }
                },
                scales: { x: { grid: { display: false } }, y: { grid: { color: '#333' }, beginAtZero: true, ticks: { maxTicksLimit: 5, callback: (v) => v===0?null:(v>=1000?(v/1000)+' rb':v) } } }
            }
        });
    };

    const renderRankings = (provData) => {
        let arr = Object.keys(provData).map(key => {
            const item = provData[key];
            let sortVal = 0, displayVal = '';
            if (state.sector === 'SUBSIDI') {
                sortVal = item.target > 0 ? (item.real / item.target) * 100 : 0;
                displayVal = sortVal.toFixed(1) + '%';
            } else {
                sortVal = item.real;
                displayVal = formatNumber(item.real);
            }
            return { name: key, val: sortVal, display: displayVal, rawReal: item.real };
        });

        let activeData = arr.filter(item => item.rawReal > 0);
        activeData.sort((a,b) => b.val - a.val);

        const listBest = document.getElementById('list-top5');
        if(listBest) {
            const top5 = activeData.slice(0, 5);
            if(top5.length === 0) listBest.innerHTML = '<div style="padding:15px;text-align:center;color:grey;font-size:12px;">Data Kosong</div>';
            else listBest.innerHTML = top5.map((item, i) => {
                let colorClass = ''; let medalIcon = '';
                if(i===0) { colorClass='gold'; medalIcon='<i class="fas fa-medal" style="color:var(--color-gold); font-size:14px;"></i>'; }
                else if(i===1) { colorClass='silver'; medalIcon='<i class="fas fa-medal" style="color:var(--color-silver); font-size:14px;"></i>'; }
                else if(i===2) { colorClass='bronze'; medalIcon='<i class="fas fa-medal" style="color:var(--color-bronze); font-size:14px;"></i>'; }
                
                let numberHtml = medalIcon ? 
                    `<div class="rank-num medal-box">${medalIcon}</div>` : 
                    `<div class="rank-num best">${i+1}</div>`;

                return `
                <div class="rank-item">
                    <div class="rank-left">
                        ${numberHtml}
                        <div class="rank-name ${colorClass}">${item.name}</div>
                    </div>
                    <div class="rank-val val-best">${item.display}</div>
                </div>`;
            }).join('');
        }

        const listWarn = document.getElementById('list-others');
        if(listWarn) {
            const others = activeData.slice(5).sort((a,b) => a.val - b.val).slice(0, 5);
            
            if(others.length === 0) listWarn.innerHTML = '<div style="padding:15px;text-align:center;color:grey;font-size:12px;">Data Kosong</div>';
            else listWarn.innerHTML = others.map((item, i) => `
                <div class="rank-item">
                    <div class="rank-left">
                        <div class="rank-num warn">${i+1}</div>
                        <div class="rank-name">${item.name}</div>
                    </div>
                    <div class="rank-val val-warn">${item.display}</div>
                </div>
            `).join('');
        }
    };

    const normalizeMonth = (str) => { const map = {'JAN':0, 'JANUARI':0, 'FEB':1, 'FEBRUARI':1, 'MAR':2, 'MARET':2, 'APR':3, 'APRIL':3, 'MEI':4, 'MAY':4, 'JUN':5, 'JUNI':5, 'JUL':6, 'JULI':6, 'AGU':7, 'AGUSTUS':7, 'SEP':8, 'SEPTEMBER':8, 'OKT':9, 'OKTOBER':9, 'NOV':10, 'NOVEMBER':10, 'DES':11, 'DESEMBER':11}; return map[String(str).toUpperCase().trim()] ?? -1; };
    const toTitleCase = (str) => str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    
    const renderSidebar = () => {
        const sb = document.getElementById('sidebar');
        const main = document.getElementById('main-content');
        const overlay = document.getElementById('sidebar-overlay');
        if (state.sidebarOpen) {
            sb.classList.remove('closed'); main.classList.remove('closed');
            if(window.innerWidth <= 768) { overlay.classList.add('show'); sb.style.transform = 'translateX(0)'; }
        } else {
            sb.classList.add('closed'); main.classList.add('closed');
            if(window.innerWidth <= 768) { overlay.classList.remove('show'); sb.style.transform = 'translateX(-100%)'; }
        }
        setTimeout(() => { if (chartNasional) chartNasional.resize(); if (chartProvinsi) chartProvinsi.resize(); }, 310);
    };

    return {
        init,
        toggleSidebar: () => { state.sidebarOpen = !state.sidebarOpen; renderSidebar(); },
        setSector: (sec) => {
            state.sector = sec;
            document.getElementById('nav-subsidi').classList.toggle('active', sec === 'SUBSIDI');
            document.getElementById('nav-retail').classList.toggle('active', sec === 'RETAIL');
            document.getElementById('page-title-text').innerText = sec === 'SUBSIDI' ? 'Subsidi' : 'Retail';
            updateDashboard();
            if(window.innerWidth <= 768) { state.sidebarOpen = false; renderSidebar(); }
        },
        changeYear: (val) => { state.selectedYear = parseInt(val); updateDashboard(); },
        setChartProduct: (prod) => {
            state.activeProduct = prod;
            document.getElementById('btn-nas-urea').classList.toggle('active', prod === 'UREA');
            document.getElementById('btn-nas-npk').classList.toggle('active', prod === 'NPK');
            
            // Update Tombol Provinsi
            const btnProvUrea = document.getElementById('btn-prov-urea');
            const btnProvNpk = document.getElementById('btn-prov-npk');
            
            if(btnProvUrea) btnProvUrea.classList.toggle('active', prod === 'UREA');
            if(btnProvNpk) btnProvNpk.classList.toggle('active', prod === 'NPK');

            updateDashboard();
        },
        renderProvChart,
        showLoginModal: () => document.getElementById('loginModal').style.display = 'flex',
        closeLoginModal: () => document.getElementById('loginModal').style.display = 'none',
        login: () => {
            const p = document.getElementById('adminPass').value;
            if(p === 'pso123') {
                state.isAdmin = true;
                document.getElementById('admin-menu').style.display = 'block';
                document.getElementById('admin-banner').style.display = 'block';
                document.getElementById('login-btn-container').style.display = 'none';
                document.getElementById('loginModal').style.display = 'none';
            } else { alert('Password salah!'); }
        },
        logout: () => {
            state.isAdmin = false;
            document.getElementById('admin-menu').style.display = 'none';
            document.getElementById('admin-banner').style.display = 'none';
            document.getElementById('login-btn-container').style.display = 'block';
        },
        analyzeData, // Ekspor fungsi ini
        flipCard // Ekspor fungsi ini
    };
})();
window.onload = app.init;
