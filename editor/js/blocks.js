/**
 * blocks.js – Custom Blockly block definitions
 * Blocks: cpp_input, cpp_output, cpp_output_text, cpp_declare,
 *         cpp_for_to, cpp_while, cpp_do_while,
 *         cpp_increment, cpp_assign_op,
 *         math_mod, math_sqrt, math_pow, math_abs, math_cast_int
 */

// ────────────────────────────────────────────────────────────────
// COLOUR PALETTE
// ────────────────────────────────────────────────────────────────
const C = {
  IO:    210,
  VAR:   260,
  LOOP:  120,
  COND:  180,
  MATH:   60,
  INCR:  290,
};

// ────────────────────────────────────────────────────────────────
// 1. cpp_input  –  citeste / cin >>
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['cpp_input'] = {
  init() {
    this.appendDummyInput()
      .appendField('📥 citeste')
      .appendField(new Blockly.FieldTextInput('n'), 'VARS');
    this.setColour(C.IO);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setTooltip('Citește una sau mai multe variabile (separate prin spațiu).\nEx: "n" sau "a b c"');
    this.setHelpUrl('');
  }
};

// ────────────────────────────────────────────────────────────────
// 2. cpp_output  –  scrie / cout <<
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['cpp_output'] = {
  init() {
    const nlOpts = [['cu spațiu', 'SPACE'], ['linie nouă', 'NL'], ['fără separator', 'NONE']];
    this.appendValueInput('VALUE')
      .setCheck(null)
      .appendField('📤 scrie');
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(nlOpts), 'NL');
    this.setInputsInline(true);
    this.setColour(C.IO);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setTooltip('Afișează o valoare. Alege separatorul după valoare.');
  }
};

// ────────────────────────────────────────────────────────────────
// 3. cpp_output_text  –  scrie text fix / cout << "..."
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['cpp_output_text'] = {
  init() {
    this.appendDummyInput()
      .appendField('📤 scrie text')
      .appendField(new Blockly.FieldTextInput(' '), 'TEXT');
    this.setColour(C.IO);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setTooltip('Afișează un text fix (sau un singur spațiu, newline etc.)');
  }
};

// ────────────────────────────────────────────────────────────────
// 4. cpp_declare  –  int / double / long long VAR = expr
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['cpp_declare'] = {
  init() {
    const types = [
      ['int', 'int'], ['double', 'double'], ['long long', 'long long'],
      ['float', 'float'], ['bool', 'bool'], ['char', 'char']
    ];
    this.appendValueInput('VALUE')
      .setCheck(null)
      .appendField('📦 declară')
      .appendField(new Blockly.FieldDropdown(types), 'TYPE')
      .appendField(new Blockly.FieldTextInput('n'), 'VAR')
      .appendField('=');
    this.setColour(C.VAR);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setTooltip('Declară o variabilă de un tip dat și îi atribuie o valoare inițială.');
  }
};

// ────────────────────────────────────────────────────────────────
// 5. cpp_for_to  –  pentru i = start, end executa (up / down)
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['cpp_for_to'] = {
  init() {
    const dirs = [['crescător (i++)', 'up'], ['descrescător (i--)', 'down'], ['cu pas (i+=pas)', 'step']];
    this.appendValueInput('FROM')
      .setCheck('Number')
      .appendField('🔄 pentru')
      .appendField(new Blockly.FieldTextInput('i'), 'VAR')
      .appendField('de la');
    this.appendValueInput('TO')
      .setCheck('Number')
      .appendField('până la');
    this.appendValueInput('STEP')
      .setCheck('Number')
      .appendField('pas')
      .setVisible(false);
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(dirs, (v) => {
        this.getInput('STEP').setVisible(v === 'step');
        if (this.rendered) this.render();
        return v;
      }), 'DIR');
    this.appendStatementInput('BODY')
      .appendField('executa');
    this.setColour(C.LOOP);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setTooltip('Buclă FOR cu contor. Alege direcția (crescător / descrescător / pas personalizat).');
  }
};

// ────────────────────────────────────────────────────────────────
// 6. cpp_while  –  cât timp / while
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['cpp_while'] = {
  init() {
    this.appendValueInput('COND')
      .setCheck('Boolean')
      .appendField('🔁 cât timp');
    this.appendStatementInput('BODY')
      .appendField('executa');
    this.setColour(C.LOOP);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setTooltip('Buclă WHILE: execută blocul cât timp condiția este adevărată.');
  }
};

// ────────────────────────────────────────────────────────────────
// 7. cpp_do_while  –  repetă / do-while
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['cpp_do_while'] = {
  init() {
    this.appendStatementInput('BODY')
      .appendField('🔂 repetă');
    this.appendValueInput('COND')
      .setCheck('Boolean')
      .appendField('până când');
    this.setColour(C.LOOP);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setTooltip('Buclă DO-WHILE: execută blocul cel puțin o dată, până când condiția devine adevărată.');
  }
};

// ────────────────────────────────────────────────────────────────
// 8. cpp_increment  –  i++ / i-- (statement)
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['cpp_increment'] = {
  init() {
    const ops = [['++', '++'], ['--', '--']];
    this.appendDummyInput()
      .appendField(new Blockly.FieldTextInput('i'), 'VAR')
      .appendField(new Blockly.FieldDropdown(ops), 'OP');
    this.setColour(C.INCR);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setTooltip('Incrementează sau decrementează o variabilă.');
  }
};

// ────────────────────────────────────────────────────────────────
// 9. cpp_assign_op  –  x += y / x *= y etc. (statement)
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['cpp_assign_op'] = {
  init() {
    const ops = [['+=','+='], ['-=','-='], ['*=','*='], ['/=','/='], ['%=','%=']];
    this.appendValueInput('VALUE')
      .setCheck(null)
      .appendField(new Blockly.FieldTextInput('s'), 'VAR')
      .appendField(new Blockly.FieldDropdown(ops), 'OP');
    this.setColour(C.INCR);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setTooltip('Atribuire compusă: s += x  (sau -=, *=, /=, %=)');
  }
};

// ────────────────────────────────────────────────────────────────
// 10. math_mod  –  a % b
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['math_mod'] = {
  init() {
    this.appendValueInput('A').setCheck('Number').appendField('(');
    this.appendValueInput('B').setCheck('Number').appendField('%) restul împărțirii');
    this.setInputsInline(true);
    this.setOutput(true, 'Number');
    this.setColour(C.MATH);
    this.setTooltip('Restul împărțirii a % b');
  }
};

// ────────────────────────────────────────────────────────────────
// 11. math_sqrt  –  √x
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['math_sqrt'] = {
  init() {
    this.appendValueInput('X').setCheck('Number').appendField('√ radical din');
    this.setOutput(true, 'Number');
    this.setColour(C.MATH);
    this.setTooltip('Rădăcina pătrată: sqrt(x)');
  }
};

// ────────────────────────────────────────────────────────────────
// 12. math_pow  –  a^b
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['math_pow'] = {
  init() {
    this.appendValueInput('BASE').setCheck('Number').appendField('putere');
    this.appendValueInput('EXP').setCheck('Number').appendField('^');
    this.setInputsInline(true);
    this.setOutput(true, 'Number');
    this.setColour(C.MATH);
    this.setTooltip('Ridicare la putere: pow(base, exp)');
  }
};

// ────────────────────────────────────────────────────────────────
// 13. math_abs  –  |x|
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['math_abs'] = {
  init() {
    this.appendValueInput('X').setCheck('Number').appendField('|valoare absolută|');
    this.setOutput(true, 'Number');
    this.setColour(C.MATH);
    this.setTooltip('Valoarea absolută: abs(x)');
  }
};

// ────────────────────────────────────────────────────────────────
// 14. math_cast_int  –  (int) x
// ────────────────────────────────────────────────────────────────
Blockly.Blocks['math_cast_int'] = {
  init() {
    this.appendValueInput('X').setCheck('Number').appendField('⌊parte întreagă⌋');
    this.setOutput(true, 'Number');
    this.setColour(C.MATH);
    this.setTooltip('Conversia la întreg (trunchiere): (int)x');
  }
};

// ────────────────────────────────────────────────────────────────
// Override built-in controls_if labels with Romanian text
// ────────────────────────────────────────────────────────────────
// (Blockly Romanian messages are loaded from msg/ro.js)
