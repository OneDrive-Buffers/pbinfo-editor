/**
 * generators.js
 * Two Blockly code generators:
 *   window.pseudoGen  → Romanian pseudocode text
 *   window.cppGen     → C++ source code
 *
 * Also exports:
 *   highlightCpp(code)       → HTML with syntax highlight spans
 *   highlightPseudo(code)    → HTML with pseudo highlight spans
 */

// ────────────────────────────────────────────────────────────────
// Helper – indent a block of code
// ────────────────────────────────────────────────────────────────
function indent(code, n = 4) {
  if (!code) return '';
  const pad = ' '.repeat(n);
  return code.split('\n').map(l => l ? pad + l : l).join('\n');
}

// ────────────────────────────────────────────────────────────────
// ============  PSEUDOCODE GENERATOR  ============================
// ────────────────────────────────────────────────────────────────
// Blockly 10 renamed Generator → CodeGenerator; support both
const _GenClass = Blockly.Generator || Blockly.CodeGenerator;
window.pseudoGen = new _GenClass('Pseudocode');

// In Blockly 10, ORDER_ constants are not pre-defined; set them manually
pseudoGen.ORDER_ATOMIC = 0;
pseudoGen.ORDER_NONE   = 99;

pseudoGen.INDENT = '   ';

pseudoGen.scrub_ = function(block, code, opt_thisOnly) {
  const next = block.nextConnection && block.nextConnection.targetBlock();
  if (next && !opt_thisOnly) {
    return code + '\n' + pseudoGen.blockToCode(next);
  }
  return code;
};

// Prevent treating unknown blocks as errors
pseudoGen.init = function(workspace) {};
pseudoGen.finish = function(code) { return code; };

// Built-in: math_number
pseudoGen.forBlock['math_number'] = (b) => [b.getFieldValue('NUM'), pseudoGen.ORDER_ATOMIC];

// Built-in: variables_get
pseudoGen.forBlock['variables_get'] = (b) =>
  [b.getField('VAR').getText(), pseudoGen.ORDER_ATOMIC];

// Built-in: variables_set
pseudoGen.forBlock['variables_set'] = (b, gen) => {
  const name = b.getField('VAR').getText();
  const val = gen.valueToCode(b, 'VALUE', gen.ORDER_NONE) || '0';
  return `${name} ← ${val}\n`;
};

// Built-in: math_arithmetic
pseudoGen.forBlock['math_arithmetic'] = (b, gen) => {
  const opMap = { ADD:'+', MINUS:'-', MULTIPLY:'×', DIVIDE:'÷', POWER:'^' };
  const op = opMap[b.getFieldValue('OP')];
  const a = gen.valueToCode(b, 'A', gen.ORDER_NONE) || '0';
  const B = gen.valueToCode(b, 'B', gen.ORDER_NONE) || '0';
  return [`(${a} ${op} ${B})`, pseudoGen.ORDER_ATOMIC];
};

// Built-in: logic_compare
pseudoGen.forBlock['logic_compare'] = (b, gen) => {
  const opMap = { EQ:'=', NEQ:'≠', LT:'<', LTE:'≤', GT:'>', GTE:'≥' };
  const op = opMap[b.getFieldValue('OP')] || b.getFieldValue('OP');
  const a = gen.valueToCode(b, 'A', gen.ORDER_NONE) || '0';
  const B = gen.valueToCode(b, 'B', gen.ORDER_NONE) || '0';
  return [`${a} ${op} ${B}`, pseudoGen.ORDER_ATOMIC];
};

// Built-in: logic_operation
pseudoGen.forBlock['logic_operation'] = (b, gen) => {
  const op = b.getFieldValue('OP') === 'AND' ? 'și' : 'sau';
  const a = gen.valueToCode(b, 'A', gen.ORDER_NONE) || 'fals';
  const B = gen.valueToCode(b, 'B', gen.ORDER_NONE) || 'fals';
  return [`(${a} ${op} ${B})`, pseudoGen.ORDER_ATOMIC];
};

// Built-in: logic_negate
pseudoGen.forBlock['logic_negate'] = (b, gen) => {
  const val = gen.valueToCode(b, 'BOOL', gen.ORDER_NONE) || 'fals';
  return [`negat(${val})`, pseudoGen.ORDER_ATOMIC];
};

// Built-in: logic_boolean
pseudoGen.forBlock['logic_boolean'] = (b) =>
  [b.getFieldValue('BOOL') === 'TRUE' ? 'adevarat' : 'fals', pseudoGen.ORDER_ATOMIC];

// Built-in: controls_if
pseudoGen.forBlock['controls_if'] = (b, gen) => {
  let i = 0, code = '';
  const cond0 = gen.valueToCode(b, 'IF0', gen.ORDER_NONE) || 'conditie';
  const body0 = gen.statementToCode(b, 'DO0') || '';
  code += `dacă ${cond0} atunci\n${indent(body0, 3)}`;
  for (i = 1; b.getInput('IF' + i); i++) {
    const c = gen.valueToCode(b, 'IF' + i, gen.ORDER_NONE) || 'conditie';
    const bd = gen.statementToCode(b, 'DO' + i) || '';
    code += `altfel dacă ${c} atunci\n${indent(bd, 3)}`;
  }
  if (b.getInput('ELSE')) {
    code += `altfel\n${indent(gen.statementToCode(b, 'ELSE') || '', 3)}`;
  }
  code += 'sfârșit dacă\n';
  return code;
};

// ── Custom blocks ────────────────────────────────────────────────

pseudoGen.forBlock['cpp_input'] = (b) => {
  const vars = b.getFieldValue('VARS').trim();
  return `citeste ${vars}\n`;
};

pseudoGen.forBlock['cpp_output'] = (b, gen) => {
  const val = gen.valueToCode(b, 'VALUE', gen.ORDER_NONE) || '""';
  const nl = b.getFieldValue('NL');
  const sep = nl === 'NL' ? '' : nl === 'SPACE' ? '   ← cu spațiu' : '';
  return `scrie ${val}${sep}\n`;
};

pseudoGen.forBlock['cpp_output_text'] = (b) => {
  const txt = b.getFieldValue('TEXT');
  return `scrie "${txt}"\n`;
};

pseudoGen.forBlock['cpp_declare'] = (b, gen) => {
  const name = b.getFieldValue('VAR');
  const val = gen.valueToCode(b, 'VALUE', gen.ORDER_NONE) || '0';
  return `${name} ← ${val}\n`;
};

pseudoGen.forBlock['cpp_for_to'] = (b, gen) => {
  const v = b.getFieldValue('VAR');
  const dir = b.getFieldValue('DIR');
  const from = gen.valueToCode(b, 'FROM', gen.ORDER_NONE) || '1';
  const to = gen.valueToCode(b, 'TO', gen.ORDER_NONE) || 'n';
  const step = gen.valueToCode(b, 'STEP', gen.ORDER_NONE) || '1';
  const body = gen.statementToCode(b, 'BODY') || '';
  if (dir === 'up') {
    return `pentru ${v} = ${from}, ${to} executa\n${indent(body, 3)}sfârșit pentru\n`;
  } else if (dir === 'down') {
    return `pentru ${v} = ${from}, ${to} descrescător executa\n${indent(body, 3)}sfârșit pentru\n`;
  } else {
    return `pentru ${v} = ${from}, ${to}, pas=${step} executa\n${indent(body, 3)}sfârșit pentru\n`;
  }
};

pseudoGen.forBlock['cpp_while'] = (b, gen) => {
  const cond = gen.valueToCode(b, 'COND', gen.ORDER_NONE) || 'conditie';
  const body = gen.statementToCode(b, 'BODY') || '';
  return `cât timp ${cond} executa\n${indent(body, 3)}sfârșit cât timp\n`;
};

pseudoGen.forBlock['cpp_do_while'] = (b, gen) => {
  const cond = gen.valueToCode(b, 'COND', gen.ORDER_NONE) || 'conditie';
  const body = gen.statementToCode(b, 'BODY') || '';
  return `repetă\n${indent(body, 3)}până când ${cond}\n`;
};

pseudoGen.forBlock['cpp_increment'] = (b) => {
  const v = b.getFieldValue('VAR');
  const op = b.getFieldValue('OP');
  return `${v} ← ${v} ${op === '++' ? '+ 1' : '- 1'}\n`;
};

pseudoGen.forBlock['cpp_assign_op'] = (b, gen) => {
  const v = b.getFieldValue('VAR');
  const op = b.getFieldValue('OP');
  const val = gen.valueToCode(b, 'VALUE', gen.ORDER_NONE) || '0';
  const symMap = { '+=':'+', '-=':'-', '*=':'×', '/=':'÷', '%=':'%' };
  return `${v} ← ${v} ${symMap[op] || op} ${val}\n`;
};

pseudoGen.forBlock['math_mod'] = (b, gen) => {
  const a = gen.valueToCode(b, 'A', gen.ORDER_NONE) || '0';
  const B = gen.valueToCode(b, 'B', gen.ORDER_NONE) || '1';
  return [`(${a} mod ${B})`, pseudoGen.ORDER_ATOMIC];
};

pseudoGen.forBlock['math_sqrt'] = (b, gen) => {
  const x = gen.valueToCode(b, 'X', gen.ORDER_NONE) || '0';
  return [`√(${x})`, pseudoGen.ORDER_ATOMIC];
};

pseudoGen.forBlock['math_pow'] = (b, gen) => {
  const base = gen.valueToCode(b, 'BASE', gen.ORDER_NONE) || '0';
  const exp = gen.valueToCode(b, 'EXP', gen.ORDER_NONE) || '0';
  return [`(${base}^${exp})`, pseudoGen.ORDER_ATOMIC];
};

pseudoGen.forBlock['math_abs'] = (b, gen) => {
  const x = gen.valueToCode(b, 'X', gen.ORDER_NONE) || '0';
  return [`|${x}|`, pseudoGen.ORDER_ATOMIC];
};

pseudoGen.forBlock['math_cast_int'] = (b, gen) => {
  const x = gen.valueToCode(b, 'X', gen.ORDER_NONE) || '0';
  return [`⌊${x}⌋`, pseudoGen.ORDER_ATOMIC];
};

// ────────────────────────────────────────────────────────────────
// ============  C++ GENERATOR  ===================================
// ────────────────────────────────────────────────────────────────
window.cppGen = new _GenClass('CppCode');

// In Blockly 10, ORDER_ constants are not pre-defined; set them manually
cppGen.ORDER_ATOMIC = 0;
cppGen.ORDER_NONE   = 99;

cppGen.INDENT = '    ';

cppGen.scrub_ = function(block, code, opt_thisOnly) {
  const next = block.nextConnection && block.nextConnection.targetBlock();
  if (next && !opt_thisOnly) {
    return code + '\n' + cppGen.blockToCode(next);
  }
  return code;
};

cppGen.init = function() {};
cppGen.finish = function(code) {
  const body = indent(code, 4).replace(/\n{3,}/g, '\n\n');
  return `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n${body}\n    return 0;\n}`;
};

// Built-in: math_number
cppGen.forBlock['math_number'] = (b) => [b.getFieldValue('NUM'), cppGen.ORDER_ATOMIC];

// Built-in: variables_get
cppGen.forBlock['variables_get'] = (b) =>
  [b.getField('VAR').getText(), cppGen.ORDER_ATOMIC];

// Built-in: variables_set
cppGen.forBlock['variables_set'] = (b, gen) => {
  const name = b.getField('VAR').getText();
  const val = gen.valueToCode(b, 'VALUE', gen.ORDER_NONE) || '0';
  return `${name} = ${val};\n`;
};

// Built-in: math_arithmetic
cppGen.forBlock['math_arithmetic'] = (b, gen) => {
  const opMap = { ADD:'+', MINUS:'-', MULTIPLY:'*', DIVIDE:'/', POWER:'_pow' };
  const op = opMap[b.getFieldValue('OP')];
  const a = gen.valueToCode(b, 'A', gen.ORDER_NONE) || '0';
  const B = gen.valueToCode(b, 'B', gen.ORDER_NONE) || '0';
  if (op === '_pow') return [`pow(${a}, ${B})`, cppGen.ORDER_ATOMIC];
  return [`(${a} ${op} ${B})`, cppGen.ORDER_ATOMIC];
};

// Built-in: logic_compare
cppGen.forBlock['logic_compare'] = (b, gen) => {
  const opMap = { EQ:'==', NEQ:'!=', LT:'<', LTE:'<=', GT:'>', GTE:'>=' };
  const op = opMap[b.getFieldValue('OP')] || '==';
  const a = gen.valueToCode(b, 'A', gen.ORDER_NONE) || '0';
  const B = gen.valueToCode(b, 'B', gen.ORDER_NONE) || '0';
  return [`(${a} ${op} ${B})`, cppGen.ORDER_ATOMIC];
};

// Built-in: logic_operation
cppGen.forBlock['logic_operation'] = (b, gen) => {
  const op = b.getFieldValue('OP') === 'AND' ? '&&' : '||';
  const a = gen.valueToCode(b, 'A', gen.ORDER_NONE) || 'false';
  const B = gen.valueToCode(b, 'B', gen.ORDER_NONE) || 'false';
  return [`(${a} ${op} ${B})`, cppGen.ORDER_ATOMIC];
};

// Built-in: logic_negate
cppGen.forBlock['logic_negate'] = (b, gen) => {
  const val = gen.valueToCode(b, 'BOOL', gen.ORDER_NONE) || 'false';
  return [`!(${val})`, cppGen.ORDER_ATOMIC];
};

// Built-in: logic_boolean
cppGen.forBlock['logic_boolean'] = (b) =>
  [b.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false', cppGen.ORDER_ATOMIC];

// Built-in: controls_if
cppGen.forBlock['controls_if'] = (b, gen) => {
  let i = 0, code = '';
  const cond0 = gen.valueToCode(b, 'IF0', gen.ORDER_NONE) || 'true';
  const body0 = gen.statementToCode(b, 'DO0') || '';
  code += `if (${cond0}) {\n${indent(body0, 4)}}`;
  for (i = 1; b.getInput('IF' + i); i++) {
    const c = gen.valueToCode(b, 'IF' + i, gen.ORDER_NONE) || 'true';
    const bd = gen.statementToCode(b, 'DO' + i) || '';
    code += ` else if (${c}) {\n${indent(bd, 4)}}`;
  }
  if (b.getInput('ELSE')) {
    code += ` else {\n${indent(gen.statementToCode(b, 'ELSE') || '', 4)}}`;
  }
  code += '\n';
  return code;
};

// ── Custom blocks ────────────────────────────────────────────────

cppGen.forBlock['cpp_input'] = (b) => {
  const vars = b.getFieldValue('VARS').trim().split(/\s+/).join(' >> ');
  return `cin >> ${vars};\n`;
};

cppGen.forBlock['cpp_output'] = (b, gen) => {
  const val = gen.valueToCode(b, 'VALUE', gen.ORDER_NONE) || '""';
  const nl = b.getFieldValue('NL');
  if (nl === 'NL') return `cout << ${val} << endl;\n`;
  if (nl === 'SPACE') return `cout << ${val} << " ";\n`;
  return `cout << ${val};\n`;
};

cppGen.forBlock['cpp_output_text'] = (b) => {
  const txt = b.getFieldValue('TEXT');
  if (txt === '\n' || txt === '\\n') return 'cout << endl;\n';
  return `cout << "${txt.replace(/"/g, '\\"')}";\n`;
};

cppGen.forBlock['cpp_declare'] = (b, gen) => {
  const type = b.getFieldValue('TYPE');
  const name = b.getFieldValue('VAR');
  const val = gen.valueToCode(b, 'VALUE', gen.ORDER_NONE) || '0';
  return `${type} ${name} = ${val};\n`;
};

cppGen.forBlock['cpp_for_to'] = (b, gen) => {
  const v = b.getFieldValue('VAR');
  const dir = b.getFieldValue('DIR');
  const from = gen.valueToCode(b, 'FROM', gen.ORDER_NONE) || '1';
  const to = gen.valueToCode(b, 'TO', gen.ORDER_NONE) || 'n';
  const step = gen.valueToCode(b, 'STEP', gen.ORDER_NONE) || '1';
  const body = gen.statementToCode(b, 'BODY') || '';
  let init, cond, upd;
  if (dir === 'up') {
    init = `int ${v} = ${from}`; cond = `${v} <= ${to}`; upd = `${v}++`;
  } else if (dir === 'down') {
    init = `int ${v} = ${from}`; cond = `${v} >= ${to}`; upd = `${v}--`;
  } else {
    init = `int ${v} = ${from}`; cond = `${v} <= ${to}`; upd = `${v} += ${step}`;
  }
  return `for (${init}; ${cond}; ${upd}) {\n${indent(body, 4)}}\n`;
};

cppGen.forBlock['cpp_while'] = (b, gen) => {
  const cond = gen.valueToCode(b, 'COND', gen.ORDER_NONE) || 'true';
  const body = gen.statementToCode(b, 'BODY') || '';
  return `while (${cond}) {\n${indent(body, 4)}}\n`;
};

cppGen.forBlock['cpp_do_while'] = (b, gen) => {
  const cond = gen.valueToCode(b, 'COND', gen.ORDER_NONE) || 'true';
  const body = gen.statementToCode(b, 'BODY') || '';
  return `do {\n${indent(body, 4)}} while (${cond});\n`;
};

cppGen.forBlock['cpp_increment'] = (b) => {
  const v = b.getFieldValue('VAR');
  const op = b.getFieldValue('OP');
  return `${v}${op};\n`;
};

cppGen.forBlock['cpp_assign_op'] = (b, gen) => {
  const v = b.getFieldValue('VAR');
  const op = b.getFieldValue('OP');
  const val = gen.valueToCode(b, 'VALUE', gen.ORDER_NONE) || '0';
  return `${v} ${op} ${val};\n`;
};

cppGen.forBlock['math_mod'] = (b, gen) => {
  const a = gen.valueToCode(b, 'A', gen.ORDER_NONE) || '0';
  const B = gen.valueToCode(b, 'B', gen.ORDER_NONE) || '1';
  return [`(${a} % ${B})`, cppGen.ORDER_ATOMIC];
};

cppGen.forBlock['math_sqrt'] = (b, gen) => {
  const x = gen.valueToCode(b, 'X', gen.ORDER_NONE) || '0';
  return [`sqrt(${x})`, cppGen.ORDER_ATOMIC];
};

cppGen.forBlock['math_pow'] = (b, gen) => {
  const base = gen.valueToCode(b, 'BASE', gen.ORDER_NONE) || '0';
  const exp = gen.valueToCode(b, 'EXP', gen.ORDER_NONE) || '0';
  return [`pow(${base}, ${exp})`, cppGen.ORDER_ATOMIC];
};

cppGen.forBlock['math_abs'] = (b, gen) => {
  const x = gen.valueToCode(b, 'X', gen.ORDER_NONE) || '0';
  return [`abs(${x})`, cppGen.ORDER_ATOMIC];
};

cppGen.forBlock['math_cast_int'] = (b, gen) => {
  const x = gen.valueToCode(b, 'X', gen.ORDER_NONE) || '0';
  return [`(int)(${x})`, cppGen.ORDER_ATOMIC];
};

// ────────────────────────────────────────────────────────────────
// Generate code from workspace
// ────────────────────────────────────────────────────────────────
window.generatePseudo = function(workspace) {
  try {
    const blocks = workspace.getTopBlocks(true);
    if (!blocks.length) return '';
    let code = '';
    for (const b of blocks) {
      code += pseudoGen.blockToCode(b) || '';
    }
    return code.trim();
  } catch (e) { return ''; }
};

window.generateCpp = function(workspace) {
  try {
    const blocks = workspace.getTopBlocks(true);
    if (!blocks.length) return '';
    let bodyCode = '';
    for (const b of blocks) {
      bodyCode += cppGen.blockToCode(b) || '';
    }
    const body = indent(bodyCode.trim(), 4);
    return `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n${body}\n    return 0;\n}`;
  } catch (e) { return ''; }
};

// ────────────────────────────────────────────────────────────────
// Syntax highlighting helpers
// ────────────────────────────────────────────────────────────────
const CPP_KEYWORDS = /\b(int|long|double|float|bool|char|string|void|if|else|for|while|do|return|break|continue|cin|cout|endl|true|false|using|namespace|std|include|auto|const)\b/g;
const CPP_TYPES    = /\b(int|long|double|float|bool|char|string|void)\b/g;

window.highlightCpp = function(code) {
  if (!code) return '';
  return escHtml(code)
    .replace(/\/\/.*/g, m => `<span class="cmt">${m}</span>`)
    .replace(/"([^"\\]|\\.)*"/g, m => `<span class="str">${m}</span>`)
    .replace(/'[^'\\]'/g, m => `<span class="str">${m}</span>`)
    .replace(/\b(if|else|for|while|do|return|break|continue|using|namespace)\b/g, m => `<span class="kw">${m}</span>`)
    .replace(/\b(int|long|double|float|bool|char|string|void|auto|const)\b/g, m => `<span class="type">${m}</span>`)
    .replace(/\b(cin|cout|endl|sqrt|pow|abs|cbrt|floor|ceil|round|fixed|setprecision)\b/g, m => `<span class="fn">${m}</span>`)
    .replace(/\b(\d+(\.\d+)?)\b/g, m => `<span class="num">${m}</span>`)
    .replace(/(&lt;&lt;|&gt;&gt;|==|!=|&lt;=|&gt;=)/g, m => `<span class="op">${m}</span>`);
};

window.highlightPseudo = function(code) {
  if (!code) return '';
  return escHtml(code)
    .replace(/^(dacă|altfel|pentru|cât timp|repetă|până când|citeste|scrie|executa|sfârșit[^\n]*)\b/gm,
      m => `<span class="pc-kw">${m}</span>`)
    .replace(/\b(\d+(\.\d+)?)\b/g, m => `<span class="pc-num">${m}</span>`);
};

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
