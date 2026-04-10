/* ============================================
   LAWEASE — JavaScript v2
   Three.js Constellation + GSAP + Service Panels
   ============================================ */

// ===== THREE.JS CONSTELLATION PARTICLE BACKGROUND =====
(function initWebGL() {
    const canvas = document.getElementById('webgl-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 35;

    // Particles
    const particleCount = 800;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = [];

    const palette = [
        new THREE.Color(0x7c6cff),
        new THREE.Color(0xe040fb),
        new THREE.Color(0x00e5ff),
        new THREE.Color(0x9e92ff),
    ];

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] = (Math.random() - 0.5) * 70;
        positions[i3 + 1] = (Math.random() - 0.5) * 70;
        positions[i3 + 2] = (Math.random() - 0.5) * 40;

        const c = palette[Math.floor(Math.random() * palette.length)];
        colors[i3] = c.r;
        colors[i3 + 1] = c.g;
        colors[i3 + 2] = c.b;

        velocities.push({
            x: (Math.random() - 0.5) * 0.01,
            y: (Math.random() - 0.5) * 0.01,
            z: (Math.random() - 0.5) * 0.005
        });
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pMat = new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
    });

    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // Constellation lines
    const lineGeo = new THREE.BufferGeometry();
    const linePositions = new Float32Array(particleCount * 6);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

    const lineMat = new THREE.LineBasicMaterial({
        color: 0x7c6cff,
        transparent: true,
        opacity: 0.06,
        blending: THREE.AdditiveBlending,
    });

    const lines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lines);

    let mouseX = 0, mouseY = 0, tmx = 0, tmy = 0;
    document.addEventListener('mousemove', e => {
        tmx = (e.clientX / window.innerWidth - 0.5) * 2;
        tmy = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    });

    const clock = new THREE.Clock();
    const connectionDist = 8;

    function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        mouseX += (tmx - mouseX) * 0.04;
        mouseY += (tmy - mouseY) * 0.04;

        particles.rotation.x = t * 0.02 + mouseY * 0.15;
        particles.rotation.y = t * 0.03 + mouseX * 0.15;

        const pos = particles.geometry.attributes.position.array;
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            pos[i3] += velocities[i].x;
            pos[i3 + 1] += velocities[i].y + Math.sin(t + i * 0.1) * 0.003;
            pos[i3 + 2] += velocities[i].z;

            // Boundary wrap
            if (Math.abs(pos[i3]) > 35) velocities[i].x *= -1;
            if (Math.abs(pos[i3 + 1]) > 35) velocities[i].y *= -1;
            if (Math.abs(pos[i3 + 2]) > 20) velocities[i].z *= -1;
        }
        particles.geometry.attributes.position.needsUpdate = true;

        // Draw connections (limited for performance)
        let lIdx = 0;
        const lPos = lines.geometry.attributes.position.array;
        const maxLines = 200;
        let lCount = 0;

        for (let i = 0; i < particleCount && lCount < maxLines; i++) {
            for (let j = i + 1; j < particleCount && lCount < maxLines; j++) {
                const dx = pos[i * 3] - pos[j * 3];
                const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
                const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (dist < connectionDist) {
                    lPos[lIdx++] = pos[i * 3];
                    lPos[lIdx++] = pos[i * 3 + 1];
                    lPos[lIdx++] = pos[i * 3 + 2];
                    lPos[lIdx++] = pos[j * 3];
                    lPos[lIdx++] = pos[j * 3 + 1];
                    lPos[lIdx++] = pos[j * 3 + 2];
                    lCount++;
                }
            }
        }

        for (let k = lIdx; k < lPos.length; k++) lPos[k] = 0;
        lines.geometry.attributes.position.needsUpdate = true;
        lines.geometry.setDrawRange(0, lCount * 2);

        renderer.render(scene, camera);
    }

    animate();
})();


// ===== CURSOR GLOW =====
(function initCursorGlow() {
    const glow = document.getElementById('cursor-glow');
    if (!glow) return;

    let cx = 0, cy = 0;
    document.addEventListener('mousemove', e => {
        cx = e.clientX;
        cy = e.clientY;
    });

    function updateGlow() {
        glow.style.left = cx + 'px';
        glow.style.top = cy + 'px';
        requestAnimationFrame(updateGlow);
    }
    updateGlow();
})();


// ===== LOADING SCREEN =====
window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    if (!loader) return;

    gsap.to(loader, {
        opacity: 0,
        duration: 0.5,
        delay: 1.8,
        ease: 'power2.inOut',
        onComplete: () => {
            loader.style.display = 'none';
            initAnimations();
        }
    });
});


// ===== GSAP ANIMATIONS =====
function initAnimations() {
    gsap.registerPlugin(ScrollTrigger);

    const heroTL = gsap.timeline({ defaults: { ease: 'power3.out' } });
    heroTL
        .to('#hero-badge', { opacity: 1, y: 0, duration: 0.6 }, 0.1)
        .to('.hero-line', { opacity: 1, y: 0, duration: 0.9, stagger: 0.15 }, 0.3)
        .to('#hero-subtitle', { opacity: 1, y: 0, duration: 0.7 }, 0.8)
        .to('#hero-cta', { opacity: 1, y: 0, duration: 0.6 }, 1.0)
        .to('#hero-stats', { opacity: 1, y: 0, duration: 0.6 }, 1.2);

    // Stat counters
    document.querySelectorAll('.stat-number').forEach(stat => {
        const target = parseInt(stat.dataset.target);
        gsap.to(stat, {
            textContent: target, duration: 2, delay: 2.2, ease: 'power2.out',
            snap: { textContent: 1 },
            onUpdate: function () { stat.textContent = Math.round(this.targets()[0].textContent); }
        });
    });

    // About
    gsap.to('#about-label', { opacity: 1, y: 0, duration: 0.5, scrollTrigger: { trigger: '#about', start: 'top 80%' } });
    gsap.to('#about-title', { opacity: 1, y: 0, duration: 0.6, scrollTrigger: { trigger: '#about', start: 'top 75%' } });
    gsap.utils.toArray('.about-card').forEach((card, i) => {
        gsap.to(card, { opacity: 1, y: 0, duration: 0.6, delay: i * 0.1, scrollTrigger: { trigger: card, start: 'top 85%' } });
    });

    // Services
    gsap.to('#services-label', { opacity: 1, y: 0, duration: 0.5, scrollTrigger: { trigger: '#services', start: 'top 80%' } });
    gsap.to('#services-title', { opacity: 1, y: 0, duration: 0.6, scrollTrigger: { trigger: '#services', start: 'top 75%' } });
    gsap.utils.toArray('.service-card').forEach((card, i) => {
        gsap.to(card, { opacity: 1, y: 0, duration: 0.7, delay: i * 0.15, scrollTrigger: { trigger: card, start: 'top 85%' } });
    });
}


// ===== NAVIGATION =====
const header = document.getElementById('main-header');
window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 50);
});

const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');
if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('active');
            navLinks.classList.remove('open');
        });
    });
}

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});


// ===== SERVICE PANELS =====
function openPanel(type) {
    const panel = document.getElementById('panel-' + type);
    if (!panel) return;

    panel.classList.add('open');
    document.body.style.overflow = 'hidden';

    gsap.to(panel, { opacity: 1, duration: 0.3 });
    gsap.to(panel.querySelector('.panel-content'), {
        x: 0, duration: 0.5, ease: 'power3.out'
    });
}

function closePanel(type) {
    const panel = document.getElementById('panel-' + type);
    if (!panel) return;

    gsap.to(panel.querySelector('.panel-content'), {
        x: '100%', duration: 0.4, ease: 'power3.in'
    });
    gsap.to(panel, {
        opacity: 0, duration: 0.3, delay: 0.2,
        onComplete: () => {
            panel.classList.remove('open');
            document.body.style.overflow = '';
        }
    });
}

// Tab switching for prediction panel
function switchTab(tabName, btn) {
    document.querySelectorAll('#panel-prediction .tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelectorAll('#panel-prediction .panel-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    btn.classList.add('active');
}

// Tab switching for docgen panel
function switchDocTab(tabName, btn) {
    document.querySelectorAll('#panel-docgen .tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelectorAll('#panel-docgen .panel-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('docform-' + tabName).classList.add('active');
    btn.classList.add('active');
}


// ===== API CALLS =====

// Predict outcome
function predictOutcome() {
    const btn = document.getElementById('btn-predict');
    const firstParty = document.getElementById('pred-first-party').value.trim();
    const secondParty = document.getElementById('pred-second-party').value.trim();
    const facts = document.getElementById('pred-facts').value.trim();
    const resultBox = document.getElementById('prediction-result');

    if (!firstParty || !secondParty || !facts || facts.length < 20) {
        resultBox.classList.remove('hidden');
        resultBox.innerHTML = '<h4>⚠️ Validation Error</h4><p class="result-item">Please fill all fields. Case facts must be at least 20 characters.</p>';
        return;
    }

    btn.querySelector('span').textContent = 'Predicting...';
    btn.disabled = true;

    fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_party: firstParty, second_party: secondParty, facts })
    })
    .then(r => r.json())
    .then(data => {
        btn.querySelector('span').textContent = 'Predict Outcome';
        btn.disabled = false;

        if (data.error) {
            resultBox.classList.remove('hidden');
            resultBox.innerHTML = `<h4>⚠️ Error</h4><p class="result-item">${escapeHTML(data.error)}</p>`;
            return;
        }

        resultBox.classList.remove('hidden');
        resultBox.innerHTML = `
            <h4>📊 Prediction Result</h4>
            <div class="prob-bar-container">
                <div class="prob-bar-label"><strong>Petitioner</strong><span>${data.petitioner}%</span></div>
                <div class="prob-bar"><div class="prob-bar-fill petitioner" style="width: 0%"></div></div>
            </div>
            <div class="prob-bar-container">
                <div class="prob-bar-label"><strong>Respondent</strong><span>${data.respondent}%</span></div>
                <div class="prob-bar"><div class="prob-bar-fill respondent" style="width: 0%"></div></div>
            </div>
        `;

        // Animate bars
        setTimeout(() => {
            resultBox.querySelector('.petitioner').style.width = data.petitioner + '%';
            resultBox.querySelector('.respondent').style.width = data.respondent + '%';
        }, 100);
    })
    .catch(() => {
        btn.querySelector('span').textContent = 'Predict Outcome';
        btn.disabled = false;
        resultBox.classList.remove('hidden');
        resultBox.innerHTML = '<h4>⚠️ Error</h4><p class="result-item">Network error. Please try again.</p>';
    });
}

// Classify case
function classifyCase() {
    const btn = document.getElementById('btn-classify');
    const facts = document.getElementById('classify-facts').value.trim();
    const resultBox = document.getElementById('classify-result');

    if (!facts) {
        resultBox.classList.remove('hidden');
        resultBox.innerHTML = '<h4>⚠️ Validation Error</h4><p class="result-item">Please enter case details.</p>';
        return;
    }

    btn.querySelector('span').textContent = 'Classifying...';
    btn.disabled = true;

    fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts })
    })
    .then(r => r.json())
    .then(data => {
        btn.querySelector('span').textContent = 'Classify Case';
        btn.disabled = false;

        if (data.error) {
            resultBox.classList.remove('hidden');
            resultBox.innerHTML = `<h4>⚠️ Error</h4><p class="result-item">${escapeHTML(data.error)}</p>`;
            return;
        }

        let html = `<h4>🏛️ ${escapeHTML(data.category)}</h4>`;
        if (data.details.description) html += `<p class="result-item"><strong>Description:</strong> ${escapeHTML(data.details.description)}</p>`;
        if (data.details.documents && data.details.documents.length) {
            html += `<p class="result-item"><strong>Required Documents:</strong></p><ul style="margin: 4px 0 8px 20px; color: var(--text-secondary);">`;
            data.details.documents.forEach(d => { html += `<li>${escapeHTML(d)}</li>`; });
            html += '</ul>';
        }
        if (data.details.next_steps) html += `<p class="result-item"><strong>Next Steps:</strong> ${escapeHTML(data.details.next_steps)}</p>`;
        if (data.kanoon_link) html += `<a href="${data.kanoon_link}" target="_blank" class="result-link">📖 Read Similar Cases on Indian Kanoon</a>`;

        resultBox.classList.remove('hidden');
        resultBox.innerHTML = html;
    })
    .catch(() => {
        btn.querySelector('span').textContent = 'Classify Case';
        btn.disabled = false;
        resultBox.classList.remove('hidden');
        resultBox.innerHTML = '<h4>⚠️ Error</h4><p class="result-item">Network error. Please try again.</p>';
    });
}

// Document Generation
function submitDoc(type) {
    const resultBox = document.getElementById('docgen-result');
    const formData = {};

    // Gather form fields based on type
    if (type === 'partnership') {
        formData['Name 1'] = document.getElementById('p-name1').value;
        formData['Address1'] = document.getElementById('p-addr1').value;
        formData['Name 2'] = document.getElementById('p-name2').value;
        formData['Address 2'] = document.getElementById('p-addr2').value;
        formData['Partnership Name'] = document.getElementById('p-biz').value;
        formData['Business Address'] = document.getElementById('p-bizaddr').value;
        formData['Nature of Business'] = document.getElementById('p-nature').value;
        formData['Start Date'] = document.getElementById('p-date').value;
        formData['Amount 1'] = document.getElementById('p-cap1').value;
        formData['Amount 2'] = document.getElementById('p-cap2').value;
        formData['Percentage1'] = document.getElementById('p-pct1').value;
        formData['Percentage2'] = document.getElementById('p-pct2').value;
        formData['Notice Period'] = document.getElementById('p-notice').value;
        formData['email'] = document.getElementById('p-email').value;
    } else if (type === 'nda') {
        formData['company_name'] = document.getElementById('n-company').value;
        formData['company_address'] = document.getElementById('n-compaddr').value;
        formData['customer_name'] = document.getElementById('n-customer').value;
        formData['company_adress'] = document.getElementById('n-custaddr').value;
        formData['Transaction'] = document.getElementById('n-transaction').value;
        formData['date'] = document.getElementById('n-date').value;
        formData['Termination_year'] = document.getElementById('n-termyear').value;
        formData['Expiry_year'] = document.getElementById('n-expyear').value;
        formData['email'] = document.getElementById('n-email').value;
    } else if (type === 'ip') {
        formData['date'] = document.getElementById('i-date').value;
        formData['name1'] = document.getElementById('i-empname').value;
        formData['address1'] = document.getElementById('i-empaddr').value;
        formData['name2'] = document.getElementById('i-ername').value;
        formData['address2'] = document.getElementById('i-eraddr').value;
        formData['invention1'] = document.getElementById('i-inv1').value;
        formData['invention2'] = document.getElementById('i-inv2').value;
        formData['invention3'] = document.getElementById('i-inv3').value;
        formData['date_of_beginning'] = document.getElementById('i-start').value;
        formData['end_date'] = document.getElementById('i-end').value;
        formData['law'] = document.getElementById('i-law').value;
        formData['email'] = document.getElementById('i-email').value;
    }

    fetch('/api/docgen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data: formData })
    })
    .then(r => r.json())
    .then(data => {
        resultBox.classList.remove('hidden');
        if (data.success) {
            resultBox.innerHTML = `<h4>✅ Document Prepared</h4><p class="result-item">${escapeHTML(data.message)}</p>`;
        } else {
            resultBox.innerHTML = `<h4>⚠️ Error</h4><p class="result-item">${escapeHTML(data.error || 'Unknown error')}</p>`;
        }
    })
    .catch(() => {
        resultBox.classList.remove('hidden');
        resultBox.innerHTML = '<h4>⚠️ Error</h4><p class="result-item">Network error. Please try again.</p>';
    });
}


// ===== CHATBOT =====
function toggleChat() {
    const chatContainer = document.getElementById('chat-container');
    const chatbotContainer = document.getElementById('chatbot-container');
    if (!chatContainer || !chatbotContainer) return;

    const isOpen = chatContainer.style.display === 'flex';

    if (isOpen) {
        gsap.to(chatContainer, {
            opacity: 0, y: 20, scale: 0.95, duration: 0.3, ease: 'power2.inOut',
            onComplete: () => {
                chatContainer.style.display = 'none';
                chatbotContainer.classList.remove('chat-open');
            }
        });
    } else {
        chatContainer.style.display = 'flex';
        chatbotContainer.classList.add('chat-open');
        gsap.fromTo(chatContainer,
            { opacity: 0, y: 20, scale: 0.95 },
            { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.5)' }
        );
        document.getElementById('user-input').focus();
    }
}

function sendMessage() {
    const inputField = document.getElementById('user-input');
    const message = inputField.value.trim();
    if (message === '') return;

    const chatMessages = document.getElementById('chat-messages');

    const userMsg = document.createElement('div');
    userMsg.classList.add('message', 'user-message');
    userMsg.innerHTML = `<strong>You:</strong> ${escapeHTML(message)}`;
    chatMessages.appendChild(userMsg);
    inputField.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    const botTyping = document.createElement('div');
    botTyping.classList.add('message', 'bot-message', 'typing');
    botTyping.innerHTML = '<span></span><span></span><span></span>';
    chatMessages.appendChild(botTyping);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
    })
    .then(r => r.json())
    .then(data => {
        chatMessages.removeChild(botTyping);
        const botMsg = document.createElement('div');
        botMsg.classList.add('message', 'bot-message');
        botMsg.innerHTML = `<strong>LawEase AI:</strong> ${escapeHTML(data.response)}`;
        chatMessages.appendChild(botMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    })
    .catch(() => {
        chatMessages.removeChild(botTyping);
        const errMsg = document.createElement('div');
        errMsg.classList.add('message', 'bot-message');
        errMsg.innerHTML = '<strong>LawEase AI:</strong> Sorry, something went wrong. Please try again.';
        chatMessages.appendChild(errMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function handleKeyPress(event) {
    if (event.key === 'Enter') sendMessage();
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}
