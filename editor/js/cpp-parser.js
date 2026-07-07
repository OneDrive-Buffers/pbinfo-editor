/**
 * cpp-parser.js
 * Parses a limited subset of C++ into a Blockly workspace XML string.
 * Enables the C++ → Blockly bidirectional sync.
 *
 * Supported constructs:
 *   - Variable declarations: int/double/long long x = expr;
 *   - cin >> x >> y;
 *   - cout << expr << ... ;
 *   - for (int i = a; i <= b; i++) / (i >= b; i--)
 *   - while (cond) { }
 *   - do { } while (cond);
 *   - if/else if/else
 *   - compound assignments: x += y; x++;
 *   - variable assignment: x = expr;
 */

window.CppToBlockly = (function() {

  // ── Tokenizer ──────────────────────────────────────────────────
  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      if (/\s/.test(src[i])) { i++; continue; }
      if (src[i]==='/'&&src[i+1]==='/') { while(i<src.length&&src[i]!=='\n')i++; continue; }
      if (src[i]==='/'&&src[i+1]==='*') { i+=2; while(i<src.length&&!(src[i]==='*'&&src[i+1]=='/'))i++; i+=2; continue; }
      if (src[i]==='#') { while(i<src.length&&src[i]!=='\n')i++; continue; }
      if (src[i]==='"') {
        let j=i+1,s='"';
        while(j<src.length&&src[j]!=='"'){if(src[j]==='\\'){s+=src[j]+src[j+1];j+=2;}else{s+=src[j];j++;}}
        s+='"'; tokens.push({t:'STR',v:s}); i=j+1; continue;
      }
      if (src[i]==="'") {
        let s="'"; const j=i+1;
        if(src[j]==='\\'){s+=src[j]+src[j+1];i=j+3;}else{s+=src[j];i=j+2;}
        s+="'"; tokens.push({t:'CHAR',v:s}); continue;
      }
      if (/\d/.test(src[i])||(src[i]==='.'&&/\d/.test(src[i+1]))) {
        let j=i,n='';
        while(j<src.length&&/[\d.]/.test(src[j]))n+=src[j++];
        if(src[j]==='e'||src[j]==='E'){n+=src[j++];if(src[j]==='-'||src[j]==='+')n+=src[j++];while(/\d/.test(src[j]))n+=src[j++];}
        while(j<src.length&&/[lLuU]/.test(src[j]))j++;
        tokens.push({t:'NUM',v:n}); i=j; continue;
      }
      if (/[a-zA-Z_]/.test(src[i])) {
        let j=i,id='';
        while(j<src.length&&/\w/.test(src[j]))id+=src[j++];
        tokens.push({t:'ID',v:id}); i=j; continue;
      }
      const two=src.slice(i,i+2);
      if(['<<','>>','++','--','+=','-=','*=','/=','%=','==','!=','<=','>=','&&','||'].includes(two)){
        tokens.push({t:'OP',v:two}); i+=2; continue;
      }
      tokens.push({t:'PUNCT',v:src[i]}); i++;
    }
    return tokens;
  }

  // ── XML helpers ─────────────────────────────────────────────────
  let _id = 1;
  function newId() { return 'B' + (_id++); }

  function xmlBlock(type, fields={}, values={}, stmts={}, next=null) {
    let xml = `<block type="${type}" id="${newId()}">`;
    for (const [k,v] of Object.entries(fields)) xml += `<field name="${k}">${escXml(String(v))}</field>`;
    for (const [k,v] of Object.entries(values)) xml += `<value name="${k}">${v}</value>`;
    for (const [k,v] of Object.entries(stmts)) xml += `<statement name="${k}">${v}</statement>`;
    if (next) xml += `<next>${next}</next>`;
    xml += '</block>';
    return xml;
  }

  function numBlock(n) {
    return `<block type="math_number" id="${newId()}"><field name="NUM">${escXml(String(n))}</field></block>`;
  }
  function varBlock(name) {
    return `<block type="variables_get" id="${newId()}"><field name="VAR" id="${newId()}" variabletype="">${escXml(name)}</field></block>`;
  }

  function escXml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }

  // ── Expression Parser → XML block ──────────────────────────────
  function parseExpr(tokens) {
    // Returns an XML string representing the expression
    // Handles: number, identifier, arithmetic, comparison, logic
    const toks = tokens.filter(t => t.v !== ' ');
    if (!toks.length) return numBlock(0);

    // Simple cases
    if (toks.length === 1) {
      const t = toks[0];
      if (t.t === 'NUM') return numBlock(t.v);
      if (t.t === 'ID') return varBlock(t.v);
      if (t.t === 'STR') {
        const sv = t.v.slice(1,-1); // strip quotes
        return `<block type="text" id="${newId()}"><field name="TEXT">${escXml(sv)}</field></block>`;
      }
      return numBlock(0);
    }

    // Remove outer parentheses
    if (toks[0].v === '(' && toks[toks.length-1].v === ')') {
      let depth = 0, isOuter = true;
      for (let i = 0; i < toks.length - 1; i++) {
        if (toks[i].v === '(') depth++;
        if (toks[i].v === ')') depth--;
        if (depth === 0 && i < toks.length - 1) { isOuter = false; break; }
      }
      if (isOuter) return parseExpr(toks.slice(1, -1));
    }

    // Find lowest-precedence operator (right to left for right-assoc, left to right otherwise)
    // Priority: || < && < == != < < <= > >= < + - < * / %
    const prec = {'||':1,'&&':2,'==':3,'!=':3,'<':4,'<=':4,'>':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6};

    let minPrec = Infinity, minIdx = -1;
    let depth2 = 0;
    for (let i = toks.length - 1; i >= 0; i--) {
      const t = toks[i];
      if (t.v === ')' || t.v === ']') depth2++;
      if (t.v === '(' || t.v === '[') depth2--;
      if (depth2 === 0 && prec[t.v] !== undefined && prec[t.v] <= minPrec) {
        minPrec = prec[t.v];
        minIdx = i;
      }
    }

    if (minIdx > 0) {
      const op = toks[minIdx].v;
      const left = parseExpr(toks.slice(0, minIdx));
      const right = parseExpr(toks.slice(minIdx + 1));

      // Arithmetic
      const arithMap = {'+':'ADD','-':'MINUS','*':'MULTIPLY','/':'DIVIDE'};
      if (arithMap[op]) {
        return xmlBlock('math_arithmetic', {OP: arithMap[op]}, {A: left, B: right});
      }
      if (op === '%') {
        return xmlBlock('math_mod', {}, {A: left, B: right});
      }
      // Logic compare
      const cmpMap = {'==':'EQ','!=':'NEQ','<':'LT','<=':'LTE','>':'GT','>=':'GTE'};
      if (cmpMap[op]) {
        return xmlBlock('logic_compare', {OP: cmpMap[op]}, {A: left, B: right});
      }
      // Logic op
      if (op === '&&') return xmlBlock('logic_operation', {OP:'AND'}, {A: left, B: right});
      if (op === '||') return xmlBlock('logic_operation', {OP:'OR'}, {A: left, B: right});
    }

    // Function calls: sqrt(x), pow(x,y), abs(x), etc.
    if (toks.length >= 4 && toks[0].t === 'ID' && toks[1].v === '(') {
      const fname = toks[0].v;
      // Find matching )
      let depth3 = 0, endIdx = -1;
      for (let i = 1; i < toks.length; i++) {
        if (toks[i].v === '(') depth3++;
        if (toks[i].v === ')') { depth3--; if (depth3 === 0) { endIdx = i; break; } }
      }
      if (endIdx !== -1) {
        const argToks = toks.slice(2, endIdx);
        // Split by comma at depth 0
        const args = splitByComma(argToks);
        if (fname === 'sqrt' && args.length === 1) return xmlBlock('math_sqrt', {}, {X: parseExpr(args[0])});
        if (fname === 'abs' && args.length === 1) return xmlBlock('math_abs', {}, {X: parseExpr(args[0])});
        if (fname === 'pow' && args.length === 2) return xmlBlock('math_pow', {}, {BASE: parseExpr(args[0]), EXP: parseExpr(args[1])});
        if ((fname === 'cbrt') && args.length === 1) return xmlBlock('math_sqrt', {}, {X: parseExpr(args[0])}); // approx
      }
    }

    // Negation: !expr
    if (toks[0].v === '!') {
      return xmlBlock('logic_negate', {}, {BOOL: parseExpr(toks.slice(1))});
    }

    // Unary minus: -x
    if (toks[0].v === '-' && toks.length === 2) {
      const inner = parseExpr(toks.slice(1));
      return xmlBlock('math_arithmetic', {OP:'MINUS'}, {
        A: numBlock(0),
        B: inner
      });
    }

    // Fallback: return first token as-is
    return parseExpr([toks[0]]);
  }

  function splitByComma(toks) {
    const parts = [], cur = [];
    let depth = 0;
    for (const t of toks) {
      if (t.v === '(' || t.v === '[') depth++;
      if (t.v === ')' || t.v === ']') depth--;
      if (t.v === ',' && depth === 0) { parts.push(cur.splice(0)); }
      else cur.push(t);
    }
    if (cur.length) parts.push(cur);
    return parts;
  }

  // ── Statement Parser ────────────────────────────────────────────
  function parseStatements(tokens) {
    let i = 0;
    const blocks = [];

    function peek(n=0) { return tokens[i+n] || {t:'EOF',v:''}; }
    function consume() { return tokens[i++]; }

    function readUntilSemi() {
      const toks = [];
      while (i < tokens.length && peek().v !== ';') toks.push(consume());
      if (peek().v === ';') consume();
      return toks;
    }

    function readBlock() {
      // reads { stmts }
      if (peek().v !== '{') {
        // single statement
        return parseSingleStmt();
      }
      consume(); // {
      const inner = [];
      let depth = 1;
      const blockToks = [];
      while (i < tokens.length) {
        if (peek().v === '{') depth++;
        if (peek().v === '}') { depth--; if (depth === 0) { consume(); break; } }
        blockToks.push(consume());
      }
      return parseStatements(blockToks);
    }

    function readExprUntil(...stopValues) {
      const toks = [];
      let depth = 0;
      while (i < tokens.length) {
        const v = peek().v;
        if (v === '(' || v === '[') depth++;
        if (v === ')' || v === ']') { if(depth===0) break; depth--; }
        if (depth === 0 && stopValues.includes(v)) break;
        toks.push(consume());
      }
      return toks;
    }

    function parseSingleStmt() {
      return parseStatements([...readUntilSemi()]);
    }

    function chainBlocks(blockArr) {
      if (!blockArr.length) return '';
      let xml = '';
      for (let j = blockArr.length - 1; j >= 0; j--) {
        if (j === blockArr.length - 1) xml = blockArr[j];
        else {
          // Wrap previous in <next>
          const b = blockArr[j];
          // Find last </block> before any <next> already there
          const insertBefore = b.lastIndexOf('</block>');
          if (insertBefore !== -1) {
            xml = b.slice(0, insertBefore) + `<next>${xml}</next></block>` + b.slice(insertBefore + 8);
          } else {
            xml = b + xml;
          }
        }
      }
      return xml;
    }

    const typeKws = new Set(['int','long','double','float','bool','char','string','unsigned','auto']);

    while (i < tokens.length) {
      const tok = peek();

      if (tok.v === '}' || tok.t === 'EOF') break;
      if (tok.v === ';') { consume(); continue; }

      // using / #include — skip
      if (tok.v === 'using') { while(peek().v!==';')consume(); consume(); continue; }

      // Variable declaration
      if (tok.t === 'ID' && typeKws.has(tok.v)) {
        let typeName = consume().v;
        if (typeName === 'long' && peek().v === 'long') { typeName='long long'; consume(); }
        // parse one or more declarators
        while (true) {
          if (peek().t !== 'ID') break;
          const varName = consume().v;
          let initXml = numBlock(0);
          if (peek().v === '=') {
            consume(); // =
            const exprToks = [];
            let depth = 0;
            while (i < tokens.length) {
              const t2 = peek();
              if ((t2.v === ',' || t2.v === ';') && depth === 0) break;
              if (t2.v === '(') depth++;
              if (t2.v === ')') depth--;
              exprToks.push(consume());
            }
            initXml = parseExpr(exprToks);
          }
          blocks.push(xmlBlock('cpp_declare', {TYPE: typeName, VAR: varName}, {VALUE: initXml}));
          if (peek().v === ',') { consume(); continue; }
          break;
        }
        if (peek().v === ';') consume();
        continue;
      }

      // cin >> a >> b;
      if (tok.v === 'cin') {
        consume();
        const vars = [];
        while (peek().v === '>>') { consume(); if(peek().t==='ID') vars.push(consume().v); }
        if (peek().v === ';') consume();
        blocks.push(xmlBlock('cpp_input', {VARS: vars.join(' ')}));
        continue;
      }

      // cout << ...;
      if (tok.v === 'cout') {
        consume();
        // collect all output parts
        const parts = [];
        while (peek().v !== ';' && peek().t !== 'EOF') {
          if (peek().v === '<<') { consume(); continue; }
          const v = peek().v;
          if (v === 'endl') { consume(); parts.push({type:'nl'}); continue; }
          if (v === 'fixed' || v === 'setw' || v === 'setprecision' || v === 'left' || v === 'right') {
            consume();
            if (peek().v === '(') { consume(); while(peek().v!==')')consume(); consume(); }
            continue;
          }
          // expression
          const exprToks = readExprUntil('<<', ';');
          if (exprToks.length) parts.push({type:'val', toks: exprToks});
        }
        if (peek().v === ';') consume();

        // Create output blocks
        for (let pi = 0; pi < parts.length; pi++) {
          const p = parts[pi];
          if (p.type === 'nl') {
            // Check if last value block — add NL to it
            if (blocks.length && blocks[blocks.length-1].includes('type="cpp_output"')) {
              blocks[blocks.length-1] = blocks[blocks.length-1].replace(
                /<field name="NL">[^<]*<\/field>/,
                '<field name="NL">NL</field>'
              );
            } else {
              // Standalone newline block
              const nlXml = parseExpr([{t:'STR',v:'""'}]);
              blocks.push(xmlBlock('cpp_output', {NL:'NL'}, {VALUE: numBlock(0)}));
            }
          } else {
            // Check if next is endl (or this is last)
            const nextIsNl = parts[pi+1] && parts[pi+1].type === 'nl';
            const isStr = p.toks.length === 1 && p.toks[0].t === 'STR';
            if (isStr) {
              const sv = p.toks[0].v.slice(1,-1);
              if (sv === ' ') {
                // Trailing space — mark previous as SPACE
                if (blocks.length && blocks[blocks.length-1].includes('type="cpp_output"')) {
                  blocks[blocks.length-1] = blocks[blocks.length-1].replace(
                    /<field name="NL">[^<]*<\/field>/,
                    '<field name="NL">SPACE</field>'
                  );
                }
                continue;
              }
              blocks.push(xmlBlock('cpp_output_text', {TEXT: sv}));
            } else {
              const valXml = parseExpr(p.toks);
              const nl = nextIsNl ? 'NL' : 'NONE';
              blocks.push(xmlBlock('cpp_output', {NL: nl}, {VALUE: valXml}));
              if (nextIsNl) pi++; // skip endl
            }
          }
        }
        continue;
      }

      // for (init; cond; update) { body }
      if (tok.v === 'for') {
        consume(); consume(); // for (
        // Parse init
        let forVar = 'i', fromXml = numBlock(1), toXml = numBlock('n'), dir = 'up', stepXml = numBlock(1);
        // init: int i = expr;
        if (peek().t === 'ID' && typeKws.has(peek().v)) {
          consume(); // type
          if (peek().v === 'long') consume(); // long long
        }
        if (peek().t === 'ID') { forVar = consume().v; }
        if (peek().v === '=') { consume(); fromXml = parseExpr(readExprUntil(';')); }
        if (peek().v === ';') consume();
        // cond: i <= n or i >= n
        const condToks = readExprUntil(';');
        // Detect direction from condition
        if (condToks.length >= 3) {
          const opTok = condToks.find(t => ['<=','<','>=','>'].includes(t.v));
          if (opTok) {
            dir = (opTok.v === '<=' || opTok.v === '<') ? 'up' : 'down';
            const rhsToks = condToks.slice(condToks.indexOf(opTok) + 1);
            toXml = parseExpr(rhsToks);
          }
        }
        if (peek().v === ';') consume();
        // update: i++, i--, i+=step
        const updToks = readExprUntil(')');
        if (updToks.some(t => t.v === '+=')) {
          const stepToks = updToks.slice(updToks.findIndex(t=>t.v==='+=')+1);
          stepXml = parseExpr(stepToks);
          if (stepXml !== numBlock(1)) dir = 'step';
        }
        if (peek().v === ')') consume();
        const bodyXml = readBlock();
        const block = xmlBlock('cpp_for_to',
          {VAR: forVar, DIR: dir},
          {FROM: fromXml, TO: toXml, STEP: stepXml},
          {BODY: bodyXml}
        );
        blocks.push(block);
        continue;
      }

      // while (cond) { body }
      if (tok.v === 'while') {
        // Check if preceded by do
        consume(); consume(); // while (
        const condToks = readExprUntil(')');
        if (peek().v === ')') consume();
        const condXml = parseExpr(condToks);
        // Check for do-while: body then while
        if (blocks.length > 0 && blocks[blocks.length-1].startsWith('<do_while_sentinel>')) {
          // Replace sentinel
          const bodyXml = blocks.pop().replace('<do_while_sentinel>', '').replace('</do_while_sentinel>', '');
          if (peek().v === ';') consume();
          blocks.push(xmlBlock('cpp_do_while', {}, {COND: condXml}, {BODY: bodyXml}));
        } else {
          const bodyXml = readBlock();
          blocks.push(xmlBlock('cpp_while', {}, {COND: condXml}, {BODY: bodyXml}));
        }
        continue;
      }

      // do { body }
      if (tok.v === 'do') {
        consume();
        const bodyToks = [];
        consume(); // {
        let depth = 1;
        while (i < tokens.length) {
          if (peek().v === '{') depth++;
          if (peek().v === '}') { depth--; if(depth===0){consume();break;} }
          bodyToks.push(consume());
        }
        const bodyXml = parseStatements(bodyToks);
        // Next must be while (cond);
        if (peek().v === 'while') {
          consume(); consume(); // while (
          const condToks = readExprUntil(')');
          if (peek().v === ')') consume();
          if (peek().v === ';') consume();
          const condXml = parseExpr(condToks);
          blocks.push(xmlBlock('cpp_do_while', {}, {COND: condXml}, {BODY: bodyXml}));
        }
        continue;
      }

      // if / else if / else
      if (tok.v === 'if') {
        consume(); consume(); // if (
        const condToks = readExprUntil(')');
        if (peek().v === ')') consume();
        const condXml = parseExpr(condToks);
        const thenXml = readBlock();
        // Check for else
        let elseifConds = [], elseifBodies = [], elseBody = null;
        while (peek().v === 'else') {
          consume(); // else
          if (peek().v === 'if') {
            consume(); consume(); // if (
            const eiCond = readExprUntil(')');
            if (peek().v === ')') consume();
            elseifConds.push(parseExpr(eiCond));
            elseifBodies.push(readBlock());
          } else {
            elseBody = readBlock();
            break;
          }
        }
        // Build controls_if mutation
        const numElseIf = elseifConds.length;
        const hasElse = elseBody !== null;
        let mutAttr = '';
        if (numElseIf > 0 || hasElse) {
          mutAttr = `<mutation elseif="${numElseIf}" else="${hasElse ? 1 : 0}"></mutation>`;
        }
        let values = {IF0: condXml};
        let stmts = {DO0: thenXml};
        for (let ei = 0; ei < numElseIf; ei++) {
          values[`IF${ei+1}`] = elseifConds[ei];
          stmts[`DO${ei+1}`] = elseifBodies[ei];
        }
        if (hasElse) stmts['ELSE'] = elseBody;
        let ifXml = `<block type="controls_if" id="${newId()}">${mutAttr}`;
        for (const [k,v] of Object.entries(values)) ifXml += `<value name="${k}">${v}</value>`;
        for (const [k,v] of Object.entries(stmts)) ifXml += `<statement name="${k}">${v}</statement>`;
        ifXml += '</block>';
        blocks.push(ifXml);
        continue;
      }

      // x++; x--; x += y; x -= y; x *= y; x = expr;
      if (tok.t === 'ID') {
        const varName = consume().v;
        const nextOp = peek().v;

        if (nextOp === '++' || nextOp === '--') {
          consume(); if(peek().v===';') consume();
          blocks.push(xmlBlock('cpp_increment', {VAR: varName, OP: nextOp}));
          continue;
        }
        if (['+=','-=','*=','/=','%='].includes(nextOp)) {
          consume();
          const rhsToks = readExprUntil(';');
          if(peek().v===';') consume();
          const rhsXml = parseExpr(rhsToks);
          blocks.push(xmlBlock('cpp_assign_op', {VAR: varName, OP: nextOp}, {VALUE: rhsXml}));
          continue;
        }
        if (nextOp === '=') {
          consume();
          const rhsToks = readExprUntil(';');
          if(peek().v===';') consume();
          const rhsXml = parseExpr(rhsToks);
          blocks.push(xmlBlock('variables_set', {},
            {VALUE: rhsXml},
            {},
            null
          ).replace('<block type="variables_set"', `<block type="variables_set"`).replace(
            '<field name="VAR">',
            `<field name="VAR" id="${newId()}" variabletype="">${escXml(varName)}</field><value name="VALUE">`
          ).replace(/<value name="VALUE">.*<\/value>/, '') // patch
          );
          // Actually build it properly:
          blocks.pop();
          let setXml = `<block type="variables_set" id="${newId()}">`;
          setXml += `<field name="VAR" id="${newId()}" variabletype="">${escXml(varName)}</field>`;
          setXml += `<value name="VALUE">${rhsXml}</value>`;
          setXml += `</block>`;
          blocks.push(setXml);
          continue;
        }
        // Unknown — skip until semicolon
        readUntilSemi();
        continue;
      }

      // Skip unknown tokens
      consume();
    }

    // Chain blocks with <next>
    return chainBlocks(blocks);
  }

  // ── Main parse function ─────────────────────────────────────────
  function parse(cppSrc) {
    _id = 1;
    // Extract main body
    let src = cppSrc
      .replace(/#include[^\n]*/g, '')
      .replace(/using\s+namespace\s+std\s*;/g, '');

    const mainMatch = src.match(/int\s+main\s*\([^)]*\)\s*\{([\s\S]*)/);
    if (!mainMatch) return null;

    let body = mainMatch[1];
    // Remove trailing closing brace
    body = body.replace(/\}\s*$/, '');

    try {
      const tokens = tokenize(body);
      const stmtsXml = parseStatements(tokens);
      if (!stmtsXml) return null;
      return `<xml xmlns="https://developers.google.com/blockly/xml">${stmtsXml}</xml>`;
    } catch (e) {
      console.warn('CppToBlockly parse error:', e);
      return null;
    }
  }

  return { parse };

})();
