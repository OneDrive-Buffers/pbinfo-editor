/**
 * app.js – Main application logic
 *
 * Responsibilities:
 *  - Load problems from PROBLEMS_JSON (data/problems-raw.js)
 *  - Navigate between problems
 *  - Mode switching: Blockly ↔ Pseudocode ↔ C++
 *  - Three-way sync (Blockly→Code, Code→Blockly)
 *  - Flowchart rendering with Mermaid
 *  - Validation against test cases
 */

(function() {
'use strict';

// ────────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────────
let problems = [];
let currentIdx = 0;
let currentMode = 'blockly'; // 'blockly' | 'pseudo' | 'cpp'
let workspace = null;        // main Blockly workspace
let previewWorkspace = null; // small read-only preview in right panel
let syncDebounce = null;
let cppParseDebounce = null;
let isSyncing = false;       // prevent feedback loops

// ────────────────────────────────────────────────────────────────
// DOM references
// ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = {
  loading:       $('loading-overlay'),
  toast:         $('toast'),
  prevBtn:       $('prev-btn'),
  nextBtn:       $('next-btn'),
  problemSelect: $('problem-select'),
  progressText:  $('progress-text'),
  modeBtns:      document.querySelectorAll('.mode-btn'),
  // Problem panel
  titleText:     $('problem-title-text'),
  idBadge:       $('problem-id-badge'),
  statement:     $('problem-statement'),
  flowchartRender: $('flowchart-render'),
  // Editor views
  blocklyView:   $('blockly-view'),
  pseudoView:    $('pseudo-view'),
  cppView:       $('cpp-view'),
  blocklyWs:     $('blockly-workspace'),
  pseudoEditor:  $('pseudo-editor'),
  cppEditor:     $('cpp-editor'),
  // Toolbar
  undoBtn:       $('undo-btn'),
  redoBtn:       $('redo-btn'),
  syncStatus:    $('sync-status'),
  runSmallBtn:   $('run-small-btn'),
  // Right panel
  livePseudoContent: $('live-pseudo-content'),
  liveCppContent:    $('live-cpp-content'),
  blocklyPreview:    $('blockly-preview'),
  // Validation
  runBtn:        $('run-btn'),
  scoreBadge:    $('score-badge'),
  testResults:   $('test-results'),
  detailHeader:  $('test-detail-header'),
  detailInput:   $('detail-input'),
  detailExpected:$('detail-expected'),
  detailActual:  $('detail-actual'),
  // Misc
  showSolutionBtn: $('show-solution-btn'),
  resetBtn:        $('reset-btn'),
};

// ────────────────────────────────────────────────────────────────
// Init
// ────────────────────────────────────────────────────────────────
async function init() {
  // Initialize Mermaid
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    flowchart: { curve: 'basis', useMaxWidth: true },
    themeVariables: { fontSize: '13px' }
  });

  // Load problems
  problems = PROBLEMS_JSON;
  populateProblemSelect();

  // Initialize Blockly workspace
  initBlockly();

  // Initialize preview workspace
  initBlocklyPreview();

  // Load first problem
  loadProblem(0);

  // Wire up events
  wireEvents();

  // Hide loading
  setTimeout(() => el.loading.classList.add('hidden'), 500);
}

// ────────────────────────────────────────────────────────────────
// Problem navigation
// ────────────────────────────────────────────────────────────────
function populateProblemSelect() {
  el.problemSelect.innerHTML = '';
  problems.forEach((p, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `${idx+1}. ${p.title} (${p.id})`;
    el.problemSelect.appendChild(opt);
  });
}

function loadProblem(idx) {
  currentIdx = Math.max(0, Math.min(idx, problems.length - 1));
  const p = problems[currentIdx];
  const sol = getSolution(p.id);

  // Update navigation UI
  el.problemSelect.value = currentIdx;
  el.progressText.textContent = `${currentIdx+1} / ${problems.length}`;
  el.prevBtn.disabled = currentIdx === 0;
  el.nextBtn.disabled = currentIdx === problems.length - 1;

  // Update problem panel
  el.titleText.textContent = p.title;
  el.idBadge.textContent = `#${p.id}`;
  el.statement.textContent = p.statement;

  // Render flowchart
  renderFlowchart(sol.flowchart);

  // Reset editor
  clearEditor();

  // Reset validation UI
  resetValidation();
}

function clearEditor() {
  if (workspace) workspace.clear();
  el.pseudoEditor.value = '';
  el.cppEditor.value = '';
  el.livePseudoContent.innerHTML = '';
  el.liveCppContent.innerHTML = '';
  el.syncStatus.textContent = '';
}

// ────────────────────────────────────────────────────────────────
// Flowchart rendering
// ────────────────────────────────────────────────────────────────
async function renderFlowchart(definition) {
  const container = el.flowchartRender;
  container.innerHTML = definition || getDefaultFlowchart();
  container.removeAttribute('data-processed');
  container.className = 'mermaid';

  try {
    const { svg } = await mermaid.render('flowchart-' + Date.now(), definition || getDefaultFlowchart());
    container.innerHTML = svg;
    container.className = '';
  } catch (e) {
    container.innerHTML = `<div style="color:#f0a04b;font-size:11px;padding:8px">
      Diagramă nedisponibilă pentru această problemă.
    </div>`;
  }
}

function getDefaultFlowchart() {
  return `flowchart TD
    A([Start]) --> B[/"Citeste date"/]
    B --> C["Procesare"]
    C --> D[/"Afiseaza rezultat"/]
    D --> E([Stop])`;
}

// ────────────────────────────────────────────────────────────────
// Blockly workspace init
// ────────────────────────────────────────────────────────────────
function initBlockly() {
  const toolboxXml = document.getElementById('toolbox');
  workspace = Blockly.inject('blockly-workspace', {
    toolbox: toolboxXml,
    trashcan: true,
    undo: true,
    zoom: { controls: true, wheel: true, startScale: 0.95 },
    grid: { spacing: 20, length: 3, colour: '#dde', snap: true },
    theme: Blockly.Themes.Classic,
    renderer: 'zelos',
  });

  workspace.addChangeListener(onBlocklyChange);
}

function initBlocklyPreview() {
  previewWorkspace = Blockly.inject('blockly-preview', {
    readOnly: true,
    scrollbars: true,
    zoom: { controls: false, wheel: false, startScale: 0.75 },
    renderer: 'zelos',
  });
}

function updateBlocklyPreview() {
  if (!previewWorkspace) return;
  try {
    const xml = Blockly.Xml.workspaceToDom(workspace);
    Blockly.Xml.clearWorkspaceAndLoadFromXml(xml, previewWorkspace);
  } catch (e) {}
}

// ────────────────────────────────────────────────────────────────
// Blockly → Code sync
// ────────────────────────────────────────────────────────────────
function onBlocklyChange(event) {
  if (isSyncing) return;
  if (event.type === Blockly.Events.UI) return;
  if (event.type === Blockly.Events.VIEWPORT_CHANGE) return;

  clearTimeout(syncDebounce);
  syncDebounce = setTimeout(() => {
    syncFromBlockly();
    updateBlocklyPreview();
  }, 200);
}

function syncFromBlockly() {
  if (isSyncing) return;
  const pseudo = generatePseudo(workspace);
  const cpp = generateCpp(workspace);

  // Update live panels
  el.livePseudoContent.innerHTML = highlightPseudo(pseudo) || '<span style="color:var(--text-muted)">Adaugă blocuri în workspace…</span>';
  el.liveCppContent.innerHTML = highlightCpp(cpp) || '<span style="color:var(--text-muted)">Adaugă blocuri pentru a genera C++…</span>';

  // If code panels are active (not Blockly mode), also update their editors
  if (currentMode === 'pseudo' && !isSyncing) {
    isSyncing = true;
    el.pseudoEditor.value = pseudo;
    isSyncing = false;
  }
  if (currentMode === 'cpp' && !isSyncing) {
    isSyncing = true;
    el.cppEditor.value = cpp;
    isSyncing = false;
  }
  setSyncStatus('✓ sincronizat');
}

// ────────────────────────────────────────────────────────────────
// C++ → Blockly sync
// ────────────────────────────────────────────────────────────────
function onCppEditorInput() {
  if (isSyncing) return;
  setSyncStatus('⟳ sincronizare…', true);

  clearTimeout(cppParseDebounce);
  cppParseDebounce = setTimeout(() => {
    syncFromCpp();
  }, 800);

  // Also update pseudo live view
  const cpp = el.cppEditor.value;
  el.liveCppContent.innerHTML = highlightCpp(cpp);
}

function syncFromCpp() {
  const cpp = el.cppEditor.value;
  if (!cpp.trim()) return;

  // Try to parse C++ into Blockly XML
  try {
    const xml = CppToBlockly.parse(cpp);
    if (xml) {
      isSyncing = true;
      workspace.clear();
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), workspace);
      // Arrange blocks
      workspace.cleanUp();
      isSyncing = false;
      updateBlocklyPreview();

      // Generate pseudo from the blocks
      const pseudo = generatePseudo(workspace);
      el.livePseudoContent.innerHTML = highlightPseudo(pseudo);
      if (currentMode === 'pseudo') el.pseudoEditor.value = pseudo;
    }
  } catch (e) {
    console.warn('C++ parse failed:', e);
  }
  setSyncStatus('✓ sincronizat');
}

// ────────────────────────────────────────────────────────────────
// Pseudocode → Blockly sync (simplified)
// ────────────────────────────────────────────────────────────────
function onPseudoEditorInput() {
  if (isSyncing) return;
  setSyncStatus('⟳ sincronizare…', true);

  clearTimeout(cppParseDebounce);
  cppParseDebounce = setTimeout(() => {
    syncFromPseudo();
  }, 800);

  const pseudo = el.pseudoEditor.value;
  el.livePseudoContent.innerHTML = highlightPseudo(pseudo);
}

function syncFromPseudo() {
  // Convert pseudocode to C++, then C++ to Blockly
  const pseudo = el.pseudoEditor.value.trim();
  if (!pseudo) return;

  const cpp = pseudoToCpp(pseudo);
  el.liveCppContent.innerHTML = highlightCpp(cpp);

  // Sync to Blockly via C++ path
  try {
    const xml = CppToBlockly.parse(cpp);
    if (xml) {
      isSyncing = true;
      workspace.clear();
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), workspace);
      workspace.cleanUp();
      isSyncing = false;
      updateBlocklyPreview();
    }
  } catch (e) {}
  setSyncStatus('✓ sincronizat');
}

/**
 * Translate Romanian pseudocode to C++ (simplified)
 */
function pseudoToCpp(pseudo) {
  const lines = pseudo.split('\n');
  const cppLines = ['#include <bits/stdc++.h>', 'using namespace std;', '', 'int main() {'];
  const indentStack = [0];

  for (let raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) { cppLines.push(''); continue; }

    const depth = Math.min(line.search(/\S/), 20);
    const pad = '    '.repeat(Math.max(0, Math.floor(depth / 3) + 1));

    // citeste a b c → cin >> a >> b >> c;
    if (/^citeste\s+/i.test(trimmed)) {
      const vars = trimmed.replace(/^citeste\s+/i, '').trim().split(/[\s,]+/);
      // Declare vars as int if not already declared
      const decls = vars.filter(v => !/^\d/.test(v)).map(v => `int ${v} = 0;`);
      cppLines.push(...decls.map(d => pad + d));
      cppLines.push(pad + 'cin >> ' + vars.join(' >> ') + ';');
      continue;
    }

    // scrie expr → cout << expr << endl;
    if (/^scrie\s+/i.test(trimmed)) {
      let expr = trimmed.replace(/^scrie\s+/i, '').replace(/\s*←\s*cu\s*spațiu\s*$/i, '');
      expr = convertPseudoExpr(expr);
      const withSpace = /cu\s*spa/i.test(trimmed);
      if (withSpace) cppLines.push(pad + `cout << ${expr} << " ";`);
      else cppLines.push(pad + `cout << ${expr} << endl;`);
      continue;
    }

    // var ← expr  (assignment)
    const assignMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*←\s*(.+)$/);
    if (assignMatch) {
      const varN = assignMatch[1];
      const expr = convertPseudoExpr(assignMatch[2].trim());
      cppLines.push(pad + `${varN} = ${expr};`);
      continue;
    }

    // pentru i = start, end executa
    const forMatch = trimmed.match(/^pentru\s+([a-zA-Z_]\w*)\s*=\s*(.+?),\s*(.+?)\s*(descrescător)?\s*executa/i);
    if (forMatch) {
      const v = forMatch[1];
      const from = convertPseudoExpr(forMatch[2].trim());
      const to = convertPseudoExpr(forMatch[3].trim());
      const down = !!forMatch[4];
      if (down) cppLines.push(pad + `for (int ${v} = ${from}; ${v} >= ${to}; ${v}--) {`);
      else cppLines.push(pad + `for (int ${v} = ${from}; ${v} <= ${to}; ${v}++) {`);
      continue;
    }

    // cât timp cond executa
    const whileMatch = trimmed.match(/^c[aâ]t\s+timp\s+(.+?)\s*executa/i);
    if (whileMatch) {
      const cond = convertPseudoExpr(whileMatch[1].trim());
      cppLines.push(pad + `while (${cond}) {`);
      continue;
    }

    // repetă
    if (/^repet[aă]/i.test(trimmed)) {
      cppLines.push(pad + 'do {');
      continue;
    }

    // până când cond
    const untilMatch = trimmed.match(/^p[aâ]n[aă]\s+c[aâ]nd\s+(.+)$/i);
    if (untilMatch) {
      const cond = convertPseudoExpr(untilMatch[1].trim());
      // Close do body and add while
      cppLines.push(pad + `} while (!(${cond}));`);
      continue;
    }

    // dacă cond atunci
    const ifMatch = trimmed.match(/^dac[aă]\s+(.+?)\s+atunci/i);
    if (ifMatch) {
      const cond = convertPseudoExpr(ifMatch[1].trim());
      cppLines.push(pad + `if (${cond}) {`);
      continue;
    }

    // altfel dacă cond atunci
    const elseifMatch = trimmed.match(/^altfel\s+dac[aă]\s+(.+?)\s+atunci/i);
    if (elseifMatch) {
      const cond = convertPseudoExpr(elseifMatch[1].trim());
      cppLines.push((pad.slice(4) || '') + `} else if (${cond}) {`);
      continue;
    }

    // altfel
    if (/^altfel$/i.test(trimmed)) {
      cppLines.push((pad.slice(4) || '') + '} else {');
      continue;
    }

    // sfârșit X → closing brace
    if (/^sf[aâ]r[sș]it/i.test(trimmed)) {
      cppLines.push((pad.slice(4) || '') + '}');
      continue;
    }

    // Unknown — emit as comment
    cppLines.push(pad + `// ${trimmed}`);
  }

  cppLines.push('    return 0;', '}');
  return cppLines.join('\n');
}

function convertPseudoExpr(expr) {
  return expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/≠/g, '!=')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/\bmod\b/g, '%')
    .replace(/\bsau\b/g, '||')
    .replace(/\bși\b/g, '&&')
    .replace(/\badevarat\b/g, 'true')
    .replace(/\bfals\b/g, 'false')
    .replace(/\bnegat\b/g, '!')
    .replace(/√\((.+)\)/, (_, x) => `sqrt(${x})`)
    .replace(/\|(.+?)\|/, (_, x) => `abs(${x})`)
    .replace(/⌊(.+?)⌋/, (_, x) => `(int)(${x})`)
    .replace(/\^/g, ', ')
    .replace(/←/g, '=');
}

// ────────────────────────────────────────────────────────────────
// Mode switching
// ────────────────────────────────────────────────────────────────
function setMode(mode) {
  if (mode === currentMode) return;

  // When leaving current mode: capture current content
  if (currentMode === 'cpp') {
    syncFromCpp();
  } else if (currentMode === 'pseudo') {
    syncFromPseudo();
  }

  currentMode = mode;

  // Update mode buttons
  el.modeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Show/hide editor views
  document.querySelectorAll('.editor-view').forEach(v => v.classList.remove('active'));
  const viewMap = { blockly: 'blockly-view', pseudo: 'pseudo-view', cpp: 'cpp-view' };
  $(viewMap[mode]).classList.add('active');

  // When entering a mode: populate its editor
  if (mode === 'pseudo') {
    if (!el.pseudoEditor.value.trim()) {
      const pseudo = generatePseudo(workspace);
      el.pseudoEditor.value = pseudo;
    }
    el.pseudoEditor.focus();
    // Re-sync blockly
    setTimeout(() => syncFromBlockly(), 100);
  }
  if (mode === 'cpp') {
    if (!el.cppEditor.value.trim()) {
      const cpp = generateCpp(workspace);
      el.cppEditor.value = cpp;
    }
    el.cppEditor.focus();
    el.liveCppContent.innerHTML = highlightCpp(el.cppEditor.value);
    // Re-sync blockly
    setTimeout(() => syncFromBlockly(), 100);
  }
  if (mode === 'blockly') {
    setTimeout(() => Blockly.svgResize(workspace), 100);
  }
}

// ────────────────────────────────────────────────────────────────
// Live panel tabs
// ────────────────────────────────────────────────────────────────
function initCodePanelTabs() {
  document.querySelectorAll('.code-panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.code-panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.code-panel-view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      $(tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'live-blockly') {
        updateBlocklyPreview();
        setTimeout(() => Blockly.svgResize(previewWorkspace), 50);
      }
    });
  });
}

// ────────────────────────────────────────────────────────────────
// Copy buttons
// ────────────────────────────────────────────────────────────────
function initCopyButtons() {
  document.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const which = btn.dataset.copy;
      const text = which === 'pseudo'
        ? el.livePseudoContent.textContent
        : el.liveCppContent.textContent;
      navigator.clipboard.writeText(text).then(() => showToast('📋 Copiat!', 'success'));
    });
  });
}

// ────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────
function runValidation() {
  const p = problems[currentIdx];
  const sol = getSolution(p.id);
  const tests = sol.tests || [];

  if (!tests.length) {
    el.testResults.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Nu există teste predefinite pentru această problemă. Încearcă să verifici manual.</span>';
    return;
  }

  // Get the C++ code to validate
  let cppCode;
  if (currentMode === 'cpp') {
    cppCode = el.cppEditor.value;
  } else {
    cppCode = generateCpp(workspace);
    if (!cppCode || !cppCode.includes('main')) {
      // Fallback to cpp editor
      cppCode = el.cppEditor.value;
    }
  }

  if (!cppCode || !cppCode.trim()) {
    showToast('⚠ Nu există cod de validat!', 'error');
    return;
  }

  el.runBtn.textContent = '⟳ Se rulează…';
  el.runBtn.classList.add('running');

  // Run asynchronously to not block UI
  setTimeout(() => {
    // Convert test format from [input, expected] pairs
    const testCases = tests.map(t => ({ input: t[0], output: t[1] }));
    const results = CppInterpreter.validate(cppCode, testCases);
    renderTestResults(results);
    el.runBtn.textContent = '▶ Rulează Toate Testele';
    el.runBtn.classList.remove('running');
  }, 50);
}

function renderTestResults(results) {
  const pass = results.filter(r => r.pass).length;
  const total = results.length;

  // Score badge
  el.scoreBadge.style.display = 'inline-block';
  el.scoreBadge.textContent = `${pass}/${total}`;
  if (pass === total) { el.scoreBadge.className = 'pass'; showToast(`🎉 Toate ${total} teste trecute!`, 'success'); }
  else if (pass === 0) { el.scoreBadge.className = 'fail'; showToast(`❌ 0 din ${total} teste trecute.`, 'error'); }
  else { el.scoreBadge.className = 'partial'; showToast(`⚠ ${pass} din ${total} teste trecute.`, ''); }

  // Render chips
  el.testResults.innerHTML = '';
  results.forEach(r => {
    const chip = document.createElement('div');
    chip.className = `test-chip ${r.pass ? 'pass' : r.error ? 'error' : 'fail'}`;
    chip.innerHTML = `<div class="dot"></div> Test ${r.idx}`;
    chip.addEventListener('click', () => showTestDetail(r));
    el.testResults.appendChild(chip);
  });

  // Auto-show first failed test
  const firstFail = results.find(r => !r.pass);
  if (firstFail) showTestDetail(firstFail);
  else if (results.length) showTestDetail(results[0]);
}

function showTestDetail(r) {
  el.detailHeader.textContent = `Test ${r.idx} – ${r.pass ? '✅ CORECT' : r.error ? '⚠ EROARE' : '❌ INCORECT'}`;
  el.detailInput.textContent = r.input || '(gol)';
  el.detailExpected.textContent = r.expected;
  el.detailActual.textContent = r.error ? `Eroare: ${r.error}` : (r.actual || '(gol)');
  el.detailActual.className = `test-io-content actual ${r.pass ? 'pass' : 'fail'}`;
}

function resetValidation() {
  el.testResults.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Apasă "Rulează Toate Testele" pentru a verifica soluția ta.</span>';
  el.scoreBadge.style.display = 'none';
  el.detailHeader.textContent = 'Selectează un test pentru detalii';
  el.detailInput.textContent = '—';
  el.detailExpected.textContent = '—';
  el.detailActual.textContent = '—';
}

// ────────────────────────────────────────────────────────────────
// Show solution
// ────────────────────────────────────────────────────────────────
function showSolution() {
  const p = problems[currentIdx];
  const sol = getSolution(p.id);
  if (!sol.solution_cpp) { showToast('Nu există soluție predefinită.', 'error'); return; }

  // Load the C++ solution
  isSyncing = true;
  el.cppEditor.value = sol.solution_cpp;
  isSyncing = false;

  // Switch to C++ mode and parse into Blockly
  setMode('cpp');
  setTimeout(() => {
    syncFromCpp();
    showToast('💡 Soluție corectă încărcată!', 'success');
  }, 300);
}

// ────────────────────────────────────────────────────────────────
// UI helpers
// ────────────────────────────────────────────────────────────────
function setSyncStatus(text, syncing = false) {
  el.syncStatus.textContent = text;
  el.syncStatus.style.color = syncing ? 'var(--accent-orange)' : 'var(--text-muted)';
}

function showToast(msg, type = '') {
  el.toast.textContent = msg;
  el.toast.className = `show ${type}`;
  clearTimeout(el.toast._timer);
  el.toast._timer = setTimeout(() => el.toast.classList.remove('show'), 3000);
}

// ────────────────────────────────────────────────────────────────
// Wire events
// ────────────────────────────────────────────────────────────────
function wireEvents() {
  // Navigation
  el.prevBtn.addEventListener('click', () => loadProblem(currentIdx - 1));
  el.nextBtn.addEventListener('click', () => loadProblem(currentIdx + 1));
  el.problemSelect.addEventListener('change', () => loadProblem(+el.problemSelect.value));

  // Mode buttons
  el.modeBtns.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));

  // Toolbar
  el.undoBtn.addEventListener('click', () => {
    if (currentMode === 'blockly') workspace.undo(false);
    else if (currentMode === 'cpp') document.execCommand('undo');
    else document.execCommand('undo');
  });
  el.redoBtn.addEventListener('click', () => {
    if (currentMode === 'blockly') workspace.undo(true);
    else document.execCommand('redo');
  });

  // C++ editor
  el.cppEditor.addEventListener('input', onCppEditorInput);
  el.cppEditor.addEventListener('keydown', handleTabKey);

  // Pseudocode editor
  el.pseudoEditor.addEventListener('input', onPseudoEditorInput);
  el.pseudoEditor.addEventListener('keydown', handleTabKey);

  // Validation
  el.runBtn.addEventListener('click', runValidation);
  el.runSmallBtn.addEventListener('click', () => {
    runValidation();
    // Scroll to validation panel
    $('validation-panel').scrollIntoView({ behavior: 'smooth' });
  });

  // Show solution
  el.showSolutionBtn.addEventListener('click', showSolution);

  // Reset
  el.resetBtn.addEventListener('click', () => {
    if (confirm('Ești sigur că vrei să resetezi editorul?')) clearEditor();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Enter') { runValidation(); e.preventDefault(); }
    if (e.ctrlKey && e.key === '1') { setMode('blockly'); e.preventDefault(); }
    if (e.ctrlKey && e.key === '2') { setMode('pseudo'); e.preventDefault(); }
    if (e.ctrlKey && e.key === '3') { setMode('cpp'); e.preventDefault(); }
    if (e.ctrlKey && e.key === 'ArrowRight') { loadProblem(currentIdx + 1); e.preventDefault(); }
    if (e.ctrlKey && e.key === 'ArrowLeft') { loadProblem(currentIdx - 1); e.preventDefault(); }
  });

  // Code panel tabs
  initCodePanelTabs();

  // Copy buttons
  initCopyButtons();

  // Window resize
  window.addEventListener('resize', () => {
    if (workspace) Blockly.svgResize(workspace);
    if (previewWorkspace) Blockly.svgResize(previewWorkspace);
  });
}

function handleTabKey(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const el2 = e.target;
    const start = el2.selectionStart, end = el2.selectionEnd;
    el2.value = el2.value.slice(0, start) + '    ' + el2.value.slice(end);
    el2.selectionStart = el2.selectionEnd = start + 4;
    el2.dispatchEvent(new Event('input'));
  }
}

// ────────────────────────────────────────────────────────────────
// Bootstrap
// ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

})();
