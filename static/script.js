/* ==========================================================================
   LawEase — case file behaviour
   No animation library. The one orchestrated moment lives in CSS.
   ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
    const node = document.createElement('div');
    node.appendChild(document.createTextNode(value == null ? '' : String(value)));
    return node.innerHTML;
}

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

/* ===== Lamp switch ===================================================== */

(function lamp() {
    const root = document.documentElement;
    const button = $('#lamp');
    if (!button) return;

    const label = $('.lamp__label', button);

    function apply(dark, remember) {
        root.dataset.theme = dark ? 'dark' : 'light';
        button.setAttribute('aria-pressed', String(dark));
        // The label names what pressing it gives you, not the state you're in
        label.textContent = dark ? 'Light' : 'Dark';
        if (remember) {
            try { localStorage.setItem('lawease-theme', dark ? 'dark' : 'light'); } catch { /* private mode */ }
        }
    }

    apply(root.dataset.theme === 'dark', false);
    button.addEventListener('click', () => apply(root.dataset.theme !== 'dark', true));
})();

/* ===== Index tabs follow the reader ==================================== */

(function trackTabs() {
    const tabs = $$('.tab');
    if (!tabs.length) return;

    const byId = new Map(tabs.map(tab => [tab.dataset.tab, tab]));
    const parts = $$('.part');
    if (!parts.length || !('IntersectionObserver' in window)) return;

    const seen = new Set();
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) seen.add(entry.target.id);
            else seen.delete(entry.target.id);
        });
        const current = parts.map(p => p.id).find(id => seen.has(id));
        byId.forEach((tab, id) => tab.classList.toggle('is-here', id === current));
    }, { rootMargin: '-25% 0px -60% 0px' });

    parts.forEach(part => observer.observe(part));
})();

/* ===== Switches (case tools, agreement types) ========================== */

function wireSwitch(scope) {
    const group = $('.switch', scope);
    if (!group) return;
    const buttons = $$('.switch__btn', group);

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            buttons.forEach(other => {
                const on = other === button;
                other.classList.toggle('is-on', on);
                other.setAttribute('aria-selected', String(on));
                const pane = document.getElementById(other.getAttribute('aria-controls'));
                if (pane) {
                    pane.hidden = !on;
                    pane.classList.toggle('is-on', on);
                }
            });
        });
    });
}

$$('.part').forEach(wireSwitch);

/* ===== Shared result helpers =========================================== */

function working(box, label) {
    box.hidden = false;
    box.innerHTML = `<p class="working">${esc(label)}</p>`;
}

function problem(box, message) {
    box.hidden = false;
    box.innerHTML = `<p class="note"><strong>Didn&rsquo;t work.</strong> ${esc(message)}</p>`;
}

function busy(button, label) {
    button.dataset.idle = button.textContent;
    button.textContent = label;
    button.disabled = true;
}

function idle(button) {
    if (button.dataset.idle) button.textContent = button.dataset.idle;
    button.disabled = false;
}

async function readJSON(response) {
    const data = await response.json().catch(() => ({}));
    if (data.error) throw new Error(data.error);
    if (!response.ok) throw new Error('The server did not answer properly.');
    return data;
}

/* ===== Tab A — Contract X-Ray ========================================== */

const LEAN_LABEL = {
    yours: 'Favours you',
    neutral: 'Even-handed',
    theirs: 'Favours them',
    redflag: 'Red flag'
};

const SAMPLE_NDA = `MUTUAL NON-DISCLOSURE AGREEMENT

This Agreement is made on 12 March 2026 between Kestrel Labs Private Limited, a company incorporated under the Companies Act, 2013, having its registered office at 4th Floor, Ashirwad Complex, Indiranagar, Bengaluru 560038 ("the Disclosing Party"), and Ananya Rao, resident of 22 Nandi Durga Road, Bengaluru 560046 ("the Receiving Party").

1. PURPOSE. The Disclosing Party wishes to share certain information with the Receiving Party for the sole purpose of evaluating a possible engagement as a contract engineer (the "Purpose").

2. CONFIDENTIAL INFORMATION. "Confidential Information" means all information disclosed in any form, whether or not marked confidential, including but not limited to source code, designs, customer lists, pricing, business plans, and any information disclosed orally in meetings or calls.

3. OBLIGATIONS. The Receiving Party shall hold all Confidential Information in strict confidence, shall not disclose it to any third party, and shall use it solely for the Purpose. The Receiving Party shall be liable for any disclosure by its employees, agents or advisers.

4. INDEMNITY. The Receiving Party shall indemnify, defend and hold harmless the Disclosing Party from and against any and all claims, losses, liabilities, damages, costs and expenses (including reasonable attorneys' fees) arising out of any breach of this Agreement, without limitation as to amount or duration.

5. RETURN OF MATERIALS. Upon written request the Receiving Party shall promptly return or destroy all Confidential Information in its possession and shall certify such destruction in writing within seven (7) days.

6. NO LICENCE. Nothing in this Agreement grants the Receiving Party any licence, right, title or interest in any intellectual property of the Disclosing Party.

7. TERM. The obligations in this Agreement shall continue for a period of five (5) years following termination or expiry of this Agreement.

8. REMEDIES. The Receiving Party acknowledges that damages alone would be an inadequate remedy and agrees that the Disclosing Party shall be entitled to injunctive relief without the requirement to post bond or prove actual damage.

9. GOVERNING LAW. This Agreement shall be governed by the laws of India, and the parties submit to the exclusive jurisdiction of the courts at Bengaluru.

10. ENTIRE AGREEMENT. This Agreement supersedes all prior discussions and may be amended only in writing signed by both parties.`;

const sampleButton = $('#xray-sample');
if (sampleButton) {
    sampleButton.addEventListener('click', () => {
        const box = $('#xray-text');
        box.value = SAMPLE_NDA;
        $('#xray-party').value = 'the Receiving Party';
        box.focus();
        box.setSelectionRange(0, 0);
        box.scrollTop = 0;
    });
}

const fileInput = $('#xray-file');
if (fileInput) {
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        const label = $('#xray-file-label');
        label.textContent = file ? file.name : 'Choose a PDF or text file';
        fileInput.closest('.file-pick').classList.toggle('is-loaded', Boolean(file));
    });
}

function renderXray(box, data) {
    const clauses = data.clauses || [];
    const gaps = data.missing || [];
    const tally = data.tally || {};

    const chips = ['redflag', 'theirs', 'neutral', 'yours']
        .filter(lean => tally[lean])
        .map(lean => `<span class="flag flag--${lean}">${tally[lean]} ${esc(LEAN_LABEL[lean])}</span>`)
        .join('');

    const clauseRows = clauses.map(clause => `
        <div class="clause${clause.lean === 'redflag' ? ' is-redflag' : ''}">
            <p class="clause__ref">${esc(clause.ref || '—')}</p>
            <div class="clause__head">
                <h4 class="clause__name">${esc(clause.heading)}</h4>
                <span class="flag flag--${clause.lean}">${esc(LEAN_LABEL[clause.lean] || 'Even-handed')}</span>
            </div>
            <p class="clause__plain">${esc(clause.plain)}</p>
            ${clause.why ? `<p class="clause__why">${esc(clause.why)}</p>` : ''}
            ${clause.quote ? `<p class="clause__quote">&ldquo;${esc(clause.quote)}&rdquo;</p>` : ''}
        </div>`).join('');

    const gapRows = gaps.map(gap => `
        <div class="gap">
            <p class="gap__item">${esc(gap.item)}</p>
            ${gap.why ? `<p class="gap__why">${esc(gap.why)}</p>` : ''}
        </div>`).join('');

    box.hidden = false;
    box.innerHTML = `
        <div class="out__head">
            <h3 class="out__title">${esc(data.document_type)}</h3>
            <p class="out__meta">${clauses.length} clause${clauses.length === 1 ? '' : 's'} read</p>
        </div>
        ${data.summary ? `<p class="note">${esc(data.summary)}</p>` : ''}
        ${data.parties.length ? `<p class="out__sub">Between ${esc(data.parties.join(' and '))}</p>` : ''}
        ${data.truncated ? '<p class="note">This contract was long, so only the first part was read. Paste the rest separately.</p>' : ''}
        ${chips ? `<div class="tally">${chips}</div>` : ''}
        ${clauseRows}
        ${gapRows ? `
            <p class="out__sub">Protections this contract leaves out</p>
            <div class="gaps">
                <span class="gaps__stamp">Not in this document</span>
                ${gapRows}
            </div>` : ''}`;
}

const btnXray = $('#btn-xray');
if (btnXray) {
    btnXray.addEventListener('click', async () => {
        const box = $('#xray-out');
        const text = val('xray-text');
        const party = val('xray-party');
        const file = fileInput && fileInput.files[0];

        if (!file && text.length < 200) {
            problem(box, 'Paste at least a few clauses, or upload the file.');
            return;
        }

        busy(btnXray, 'Reading…');
        working(box, 'Reading the contract');

        try {
            let response;
            if (file) {
                const body = new FormData();
                body.append('file', file);
                body.append('party', party);
                response = await fetch('/api/xray', { method: 'POST', body });
            } else {
                response = await fetch('/api/xray', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, party })
                });
            }
            renderXray(box, await readJSON(response));
        } catch (err) {
            problem(box, err.message || 'Something went wrong on the way to the server.');
        } finally {
            idle(btnXray);
        }
    });
}

/* ===== Tab B — nearest decided cases =================================== */

function renderPrediction(box, data) {
    const cal = data.calibration || {};
    const cases = data.precedents || [];
    const tally = data.precedent_tally || {};
    const drivers = data.drivers || {};

    const caseRows = cases.map(c => `
        <div class="case">
            <p class="case__term">${esc(c.term)}</p>
            <p class="case__name"><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a></p>
            <p class="case__held">${esc(c.disposition || 'disposition not recorded')} &middot;
                ${c.petitioner_won ? 'first party won' : 'first party lost'}</p>
            <p class="case__sim">${esc(c.similarity)}%
                <span class="case__simbar" style="width:${Math.max(4, Math.round(c.similarity))}px"></span>
            </p>
        </div>`).join('');

    const termList = (list, side) => (list || []).map(t => `
        <div class="term">
            <span class="term__bar" style="width:${Math.max(4, Math.round(t.weight * 220))}px"></span>
            <span class="term__word">${esc(t.term)}</span>
        </div>`).join('') || `<p class="hint">No ${side} terms carried weight.</p>`;

    box.hidden = false;
    box.innerHTML = `
        <div class="out__head">
            <h3 class="out__title">${cases.length ? `${tally.petitioner} of ${cases.length} nearest cases went to the first party` : 'No close matches in the record'}</h3>
            <p class="out__meta">${esc(cal.n_cases)} cases searched</p>
        </div>

        ${caseRows ? `<div class="cases">${caseRows}</div>` : '<p class="note">Nothing in the record resembles these facts closely enough to be useful.</p>'}

        <p class="out__sub">What the model says</p>
        <div class="odds">
            <div class="odds__bar">
                <div class="odds__seg odds__seg--p" style="width:${data.petitioner}%">${data.petitioner}%</div>
                <div class="odds__seg odds__seg--r" style="width:${data.respondent}%">${data.respondent}%</div>
                <div class="odds__tick" style="left:${cal.base_rate}%"></div>
            </div>
            <div class="odds__tickmark">
                <span class="odds__ticklabel" style="left:${cal.base_rate}%">
                    ${cal.base_rate}% — the average case
                </span>
            </div>
            <div class="odds__legend">
                <span>First party</span>
                <span>Second party</span>
            </div>
        </div>
        <p class="note">
            <strong>Read the cases, not the percentage.</strong>
            This model scores ${cal.accuracy}% on held-out cases; always guessing &ldquo;first party wins&rdquo;
            scores ${cal.base_rate}%. It beats nothing. The red tick shows where a typical case sits, so you
            can see how far these facts move it &mdash; and how little that means.
        </p>

        <p class="out__sub">Words the model weighted</p>
        <div class="drivers">
            <div>
                <p class="driver__side">Toward the first party</p>
                ${termList(drivers.petitioner, 'first-party')}
            </div>
            <div>
                <p class="driver__side">Toward the second party</p>
                ${termList(drivers.respondent, 'second-party')}
            </div>
        </div>`;
}

const btnPredict = $('#btn-predict');
if (btnPredict) {
    btnPredict.addEventListener('click', async () => {
        const box = $('#predict-out');
        const first_party = val('pred-first-party');
        const second_party = val('pred-second-party');
        const facts = val('pred-facts');

        if (!first_party || !second_party) {
            problem(box, 'Name both parties.');
            return;
        }
        if (facts.length < 20) {
            problem(box, 'Describe the facts in at least 20 characters.');
            return;
        }

        busy(btnPredict, 'Searching…');
        working(box, 'Searching 3,303 decided cases');

        try {
            const response = await fetch('/api/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ first_party, second_party, facts })
            });
            renderPrediction(box, await readJSON(response));
        } catch (err) {
            problem(box, err.message || 'Something went wrong on the way to the server.');
        } finally {
            idle(btnPredict);
        }
    });
}

/* ===== Tab B — area of law ============================================= */

const btnClassify = $('#btn-classify');
if (btnClassify) {
    btnClassify.addEventListener('click', async () => {
        const box = $('#classify-out');
        const facts = val('classify-facts');

        if (!facts) {
            problem(box, 'Describe what happened first.');
            return;
        }

        busy(btnClassify, 'Reading…');
        working(box, 'Matching against known areas');

        try {
            const response = await fetch('/api/classify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ facts })
            });
            const data = await readJSON(response);
            const d = data.details || {};

            box.hidden = false;
            box.innerHTML = `
                <div class="out__head">
                    <h3 class="out__title">${esc(data.category)}</h3>
                    <p class="out__meta">US category labels</p>
                </div>
                ${d.description ? `<p class="note">${esc(d.description)}</p>` : ''}
                ${d.documents && d.documents.length ? `
                    <p class="out__sub">Papers to gather</p>
                    ${d.documents.map(doc => `<div class="gap"><p class="gap__item">${esc(doc)}</p></div>`).join('')}` : ''}
                ${d.next_steps ? `
                    <p class="out__sub">What to do next</p>
                    <p class="clause__plain">${esc(d.next_steps)}</p>` : ''}
                ${data.kanoon_link ? `
                    <p class="out__sub">Read further</p>
                    <p class="clause__plain"><a href="${esc(data.kanoon_link)}" target="_blank" rel="noopener">Search this area on Indian Kanoon</a></p>` : ''}`;
        } catch (err) {
            problem(box, err.message || 'Something went wrong on the way to the server.');
        } finally {
            idle(btnClassify);
        }
    });
}

/* ===== Tab C — draft a document ======================================== */

const DOC_FIELDS = {
    partnership: {
        'Name 1': 'p-name1', 'Address1': 'p-addr1', 'Name 2': 'p-name2', 'Address 2': 'p-addr2',
        'Partnership Name': 'p-biz', 'Business Address': 'p-bizaddr', 'Nature of Business': 'p-nature',
        'Start Date': 'p-date', 'Amount 1': 'p-cap1', 'Amount 2': 'p-cap2',
        'Percentage1': 'p-pct1', 'Percentage2': 'p-pct2', 'Notice Period': 'p-notice', 'email': 'p-email'
    },
    nda: {
        'company_name': 'n-company', 'company_address': 'n-compaddr', 'customer_name': 'n-customer',
        'company_adress': 'n-custaddr', 'Transaction': 'n-transaction', 'date': 'n-date',
        'Termination_year': 'n-termyear', 'Expiry_year': 'n-expyear', 'email': 'n-email'
    },
    ip: {
        'date': 'i-date', 'name1': 'i-empname', 'address1': 'i-empaddr', 'name2': 'i-ername',
        'address2': 'i-eraddr', 'invention1': 'i-inv1', 'invention2': 'i-inv2', 'invention3': 'i-inv3',
        'date_of_beginning': 'i-start', 'end_date': 'i-end', 'law': 'i-law', 'email': 'i-email'
    }
};

$$('[data-doc]').forEach(button => {
    button.addEventListener('click', async () => {
        const type = button.dataset.doc;
        const box = $('#docgen-out');
        const data = {};
        Object.entries(DOC_FIELDS[type]).forEach(([key, id]) => { data[key] = val(id); });

        if (!data.email) {
            problem(box, 'Add the email address to send the PDF to.');
            return;
        }

        busy(button, 'Drafting…');
        working(box, 'Drafting and sending');

        try {
            const response = await fetch('/api/docgen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, data })
            });
            const result = await readJSON(response);
            box.hidden = false;
            box.innerHTML = `<p class="note"><strong>Sent.</strong> ${esc(result.message)}</p>`;
        } catch (err) {
            problem(box, err.message || 'Something went wrong on the way to the server.');
        } finally {
            idle(button);
        }
    });
});

/* ===== Counsel ========================================================== */

(function counsel() {
    const panel = $('#counsel');
    const opener = $('#counsel-open');
    const closer = $('#counsel-close');
    const form = $('#counsel-form');
    const input = $('#counsel-input');
    const log = $('#counsel-log');
    if (!panel || !opener || !form) return;

    function setOpen(open) {
        panel.hidden = !open;
        opener.hidden = open;
        opener.setAttribute('aria-expanded', String(open));
        if (open) input.focus();
        else opener.focus();
    }

    opener.addEventListener('click', () => setOpen(true));
    closer.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !panel.hidden) setOpen(false);
    });

    function addTurn(kind, text) {
        const turn = document.createElement('div');
        turn.className = `turn turn--${kind}`;
        const p = document.createElement('p');
        p.textContent = text;
        turn.appendChild(p);
        log.appendChild(turn);
        log.scrollTop = log.scrollHeight;
        return turn;
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const question = input.value.trim();
        if (!question) return;

        addTurn('you', question);
        input.value = '';
        const waiting = addTurn('bot turn--wait', 'Thinking');

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: question })
            });
            const data = await response.json();
            waiting.remove();
            addTurn('bot', data.response || 'No answer came back.');
        } catch {
            waiting.remove();
            addTurn('bot', 'The connection dropped. Ask again.');
        }
    });
})();
