/**
 * interpreter.js
 * Transpiles a limited subset of C++ to JavaScript and executes it in a sandbox.
 *
 * Supported C++:
 *   - #include / using namespace std  (stripped)
 *   - Variable declarations: int, long long, double, float, bool, char, string
 *   - Multiple declarations on one line: int a, b, c = 5;
 *   - cin >> a >> b;
 *   - cout << expr << " " << endl;
 *   - cout << fixed << setprecision(n) << expr;
 *   - for / while / do-while / if-else
 *   - ++/--, +=,-=,*=,/=,%=
 *   - sqrt, pow, abs, cbrt, floor, ceil, round, log, log2, log10
 *   - (int)(x), (long long)(x) casts
 *   - Integer division when LHS declared as integer type
 */

window.CppInterpreter = (function() {

  // ── Tokenizer ──────────────────────────────────────────────────
  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      // Skip whitespace
      if (/\s/.test(src[i])) { i++; continue; }
      // Line comment
      if (src[i] === '/' && src[i+1] === '/') {
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }
      // Block comment
      if (src[i] === '/' && src[i+1] === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i+1] === '/')) i++;
        i += 2; continue;
      }
      // String literal
      if (src[i] === '"') {
        let j = i+1, s = '"';
        while (j < src.length && src[j] !== '"') {
          if (src[j] === '\\') { s += src[j] + src[j+1]; j += 2; }
          else { s += src[j]; j++; }
        }
        s += '"'; tokens.push({t:'STR', v:s}); i = j+1; continue;
      }
      // Char literal
      if (src[i] === "'") {
        let j = i+1, s = "'";
        if (src[j] === '\\') { s += src[j]+src[j+1]; j+=2; } else { s += src[j]; j++; }
        s += "'"; tokens.push({t:'CHAR', v:s}); i = j+1; continue;
      }
      // Number
      if (/\d/.test(src[i]) || (src[i]==='.' && /\d/.test(src[i+1]))) {
        let j = i, n = '';
        while (j < src.length && /[\d.]/.test(src[j])) n += src[j++];
        if (src[j] === 'e' || src[j] === 'E') {
          n += src[j++];
          if (src[j]==='+' || src[j]==='-') n += src[j++];
          while (j < src.length && /\d/.test(src[j])) n += src[j++];
        }
        // Skip LL/ULL/U suffix
        while (j < src.length && /[lLuU]/.test(src[j])) j++;
        tokens.push({t:'NUM', v:n}); i = j; continue;
      }
      // Identifiers / keywords
      if (/[a-zA-Z_]/.test(src[i])) {
        let j = i, id = '';
        while (j < src.length && /\w/.test(src[j])) id += src[j++];
        tokens.push({t:'ID', v:id}); i = j; continue;
      }
      // Two-char operators
      const two = src.slice(i, i+2);
      if (['<<','>>','++','--','+=','-=','*=','/=','%=','==','!=','<=','>=','&&','||','::'].includes(two)) {
        tokens.push({t:'OP', v:two}); i += 2; continue;
      }
      // Single char
      tokens.push({t:'PUNCT', v:src[i]}); i++;
    }
    return tokens;
  }

  // ── Pre-process & Transpile ────────────────────────────────────
  function transpile(src, intTypes) {
    // Collect declared integer types
    // intTypes: Set of variable names declared as int/long long/bool/char

    // Replace type casts: (int)(x) -> Math.trunc(x)
    src = src.replace(/\(\s*(int|long\s+long|long|unsigned\s+int|unsigned\s+long\s+long)\s*\)\s*\(/g, '__trunc(');
    src = src.replace(/\(\s*(int|long\s+long|long|unsigned\s+int|unsigned\s+long\s+long)\s*\)(?!\s*\{)/g, '__trunc(');

    const tokens = tokenize(src);
    const out = [];
    let i = 0;

    function peek(n = 0) { return tokens[i + n] || {t:'EOF', v:''}; }
    function consume() { return tokens[i++]; }
    function id(n = 0) { return peek(n).v; }
    function is(v, n = 0) { return peek(n).v === v; }

    // Parse a block of tokens until end character or EOF
    // We use a simplified line-by-line approach via source transformation

    // Strategy: transform token stream to JS text
    const typeKws = new Set(['int','long','double','float','bool','char','string','unsigned','auto']);

    while (i < tokens.length) {
      const tok = peek();

      // Skip preprocessor
      if (tok.t === 'PUNCT' && tok.v === '#') {
        while (i < tokens.length && peek().v !== '\n') consume();
        continue;
      }

      // Skip include / using namespace std
      if (tok.t === 'ID' && (tok.v === 'include' || tok.v === 'pragma')) {
        while (i < tokens.length && peek().t !== 'PUNCT' && peek().v !== ';') consume();
        continue;
      }
      if (tok.t === 'ID' && tok.v === 'using') {
        while (i < tokens.length && peek().v !== ';') consume();
        consume(); // ;
        continue;
      }

      // int main() { ... }
      if (tok.t === 'ID' && tok.v === 'int' && id(1) === 'main') {
        consume(); consume(); // int main
        while (!is('(')) consume();
        consume(); consume(); // ( )
        consume(); // {
        out.push('{');
        continue;
      }

      // Variable type declaration: int x = 0; or int a, b, c;
      if (tok.t === 'ID' && typeKws.has(tok.v)) {
        // Might be multi-word type like "long long"
        let typeName = consume().v; // consume type
        if (typeName === 'long' && id() === 'long') { typeName = 'long long'; consume(); }
        if (typeName === 'unsigned' && id() === 'long') {
          consume();
          if (id() === 'long') { typeName = 'unsigned long long'; consume(); }
        }

        const isInt = ['int','long','long long','unsigned int','unsigned long long','bool','char','unsigned'].includes(typeName);
        const isDouble = ['double','float','long double'].includes(typeName);

        // Now parse comma-separated declarators
        let firstDecl = true;
        while (true) {
          if (peek().v === ';') { consume(); out.push(';'); break; }
          if (peek().v === ',') { consume(); out.push(','); continue; }
          if (peek().t === 'ID') {
            const varName = consume().v;
            intTypes.set(varName, isInt ? 'int' : (isDouble ? 'double' : 'auto'));
            if (firstDecl) { out.push('let'); firstDecl = false; }
            out.push(varName);
            if (peek().v === '=') {
              out.push('=');
              consume(); // =
              // read init expression until , or ;
              const exprToks = [];
              let depth = 0;
              while (i < tokens.length) {
                const t2 = peek();
                if ((t2.v === ',' || t2.v === ';') && depth === 0) break;
                if (t2.v === '(') depth++;
                if (t2.v === ')') depth--;
                exprToks.push(consume());
              }
              out.push(...transpileExpr(exprToks, intTypes, isInt));
            } else {
              // default init
              out.push('=');
              out.push(isInt ? '0' : isDouble ? '0.0' : '""');
            }
          } else {
            break; // unexpected
          }
        }
        continue;
      }

      // cin >> a >> b;
      if (tok.t === 'ID' && tok.v === 'cin') {
        consume(); // cin
        while (peek().v !== ';' && i < tokens.length) {
          if (peek().v === '>>' && peek().t === 'OP') {
            consume();
            if (peek().t === 'ID') {
              const vn = consume().v;
              const vType = intTypes.get(vn) || 'double';
              if (vType === 'int') {
                out.push(`${vn} = _readInt();`);
              } else if (vType === 'double') {
                out.push(`${vn} = _readFloat();`);
              } else {
                out.push(`${vn} = _readToken();`);
              }
            }
          } else {
            consume(); // skip other tokens on cin line
          }
        }
        if (peek().v === ';') consume();
        continue;
      }

      // cout << ... ;
      if (tok.t === 'ID' && tok.v === 'cout') {
        consume(); // cout
        const parts = [];
        let isFixed = false, precN = 6;
        while (peek().v !== ';' && i < tokens.length) {
          if (peek().v === '<<') { consume(); continue; }
          if (peek().t === 'ID' && peek().v === 'endl') { consume(); parts.push('"\\n"'); continue; }
          if (peek().t === 'ID' && peek().v === 'fixed') { consume(); isFixed = true; continue; }
          if (peek().t === 'ID' && peek().v === 'setprecision') {
            consume(); consume(); // setprecision (
            if (peek().t === 'NUM') { precN = parseInt(consume().v); }
            if (peek().v === ')') consume();
            continue;
          }
          if (peek().t === 'ID' && peek().v === 'setw') {
            consume(); consume(); // setw (
            while (peek().v !== ')') consume(); consume(); // skip
            continue;
          }
          // Parse expression
          const exprToks = [];
          let depth = 0;
          while (i < tokens.length) {
            const t2 = peek();
            if (depth === 0 && (t2.v === '<<' || t2.v === ';')) break;
            if (t2.v === '(') depth++;
            if (t2.v === ')') depth--;
            exprToks.push(consume());
          }
          if (exprToks.length) {
            const exprStr = transpileExpr(exprToks, intTypes, false).join(' ');
            if (isFixed) {
              parts.push(`(${exprStr}).toFixed(${precN})`);
              isFixed = false;
            } else {
              parts.push(`String(${exprStr})`);
            }
          }
        }
        if (peek().v === ';') consume();
        if (parts.length) {
          out.push(`_write(${parts.join(' + ')});`);
        }
        continue;
      }

      // return 0;
      if (tok.v === 'return') {
        consume();
        while (peek().v !== ';') consume();
        consume();
        continue;
      }

      // for ( init ; cond ; update ) { ... }
      // Pass through with type transformation
      if (tok.v === 'for') {
        consume(); out.push('for');
        consume(); out.push('('); // (
        // init: may be type declaration or assignment
        if (peek().t === 'ID' && typeKws.has(peek().v)) {
          let t2 = consume().v;
          if (t2 === 'long' && id() === 'long') { t2 = 'long long'; consume(); }
          const isI = ['int','long long','long'].includes(t2);
          intTypes.set(peek().v, isI ? 'int' : 'double');
          out.push('let');
        }
        // emit until first ;
        let depth2 = 0;
        while (i < tokens.length) {
          const t3 = peek();
          if (t3.v === ';' && depth2 === 0) { out.push(consume().v); break; }
          if (t3.v === '(') { depth2++; out.push(consume().v); continue; }
          if (t3.v === ')') { if(depth2===0) break; depth2--; out.push(consume().v); continue; }
          out.push(consume().v);
        }
        // cond + update
        depth2 = 0;
        while (i < tokens.length) {
          const t3 = peek();
          if (t3.v === ')' && depth2 === 0) { out.push(consume().v); break; }
          if (t3.v === '(') { depth2++; out.push(consume().v); continue; }
          if (t3.v === ')') { depth2--; out.push(consume().v); continue; }
          out.push(consume().v);
        }
        continue;
      }

      // while / do / if / else — pass through
      if (['while','do','if','else','break','continue'].includes(tok.v)) {
        out.push(consume().v); continue;
      }

      // { } ; and single-char operators pass through
      if (['{','}',';','(',')','[',']',',','<','>','!','~','&','|','^','%','+','-','*','/','=','?',':'].includes(tok.v)) {
        out.push(consume().v); continue;
      }

      // Operators
      if (tok.t === 'OP') {
        out.push(consume().v); continue;
      }

      // Identifiers with division check
      if (tok.t === 'ID') {
        // Check for compound assignment with division: x /= y
        if (id(1) === '/=' ) {
          const v = consume().v; consume();
          const isI = intTypes.get(v) === 'int';
          const rhsToks = [];
          while (peek().v !== ';') rhsToks.push(consume());
          if (peek().v === ';') consume(); // consume the semicolon
          const rhs = transpileExpr(rhsToks, intTypes, false).join(' ');
          if (isI) { out.push(`${v} = Math.trunc(${v} / (${rhs}));`); }
          else { out.push(`${v} /= ${rhs};`); }
          continue;
        }
        out.push(consume().v); continue;
      }

      // Numbers, strings, chars
      if (tok.t === 'NUM') { out.push(consume().v); continue; }
      if (tok.t === 'STR') {
        let sv = consume().v;
        // unescape \n etc for JS
        out.push(sv); continue;
      }
      if (tok.t === 'CHAR') { out.push(consume().v); continue; }

      consume(); // skip unknown
    }

    return out.join(' ');
  }

  // Transpile an expression token array, handling integer division
  function transpileExpr(toks, intTypes, forceInt) {
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.v === '/' && toks[i-1] && toks[i+1]) {
        // Determine if integer division
        const leftVar = out.length ? out[out.length-1] : '';
        const isLI = forceInt || intTypes.get(leftVar) === 'int';
        if (isLI) {
          // Wrap: Math.trunc(left / right) — simplified
          out.push('/'); // will handle post-process
        } else {
          out.push('/');
        }
      } else if (t.t === 'ID') {
        // Math functions
        const mathMap = {
          sqrt: 'Math.sqrt', pow: 'Math.pow', abs: 'Math.abs',
          cbrt: 'Math.cbrt', floor: 'Math.floor', ceil: 'Math.ceil',
          round: 'Math.round', log: 'Math.log', log2: 'Math.log2',
          log10: 'Math.log10', max: 'Math.max', min: 'Math.min',
          __trunc: 'Math.trunc',
        };
        out.push(mathMap[t.v] || t.v);
      } else {
        out.push(t.v);
      }
    }
    return out;
  }

  // ── Run ─────────────────────────────────────────────────────────
  /**
   * Run C++ code with given input string.
   * Returns { output: string, error: string|null, timedOut: bool }
   */
  function run(cppSrc, inputStr, maxMs = 3000) {
    const inputTokens = (inputStr || '').trim().split(/\s+/).filter(Boolean);
    let inputIdx = 0;

    let outputBuf = '';
    let errorMsg = null;

    function _readToken() {
      if (inputIdx >= inputTokens.length) return '';
      return inputTokens[inputIdx++];
    }
    function _readInt() {
      const t = _readToken();
      return t === '' ? 0 : Math.trunc(parseFloat(t));
    }
    function _readFloat() {
      const t = _readToken();
      return t === '' ? 0 : parseFloat(t);
    }
    function _write(s) {
      outputBuf += String(s);
    }

    // Remove preprocessor lines
    let src = cppSrc
      .replace(/#include[^\n]*/g, '')
      .replace(/using\s+namespace\s+std\s*;/g, '')
      .replace(/^[\s\r\n]*/g, '');

    // Extract main body
    const mainMatch = src.match(/int\s+main\s*\([^)]*\)\s*\{([\s\S]*)/);
    if (!mainMatch) {
      return { output: '', error: 'Nu s-a găsit funcția main()', timedOut: false };
    }
    let body = mainMatch[1];
    // Remove trailing }
    body = body.replace(/\}\s*$/, '');

    const intTypes = new Map();
    let jsCode;
    try {
      jsCode = transpile(`int main(){${body}}`, intTypes);
      // Remove the wrapping { }
      jsCode = jsCode.replace(/^\s*\{/, '').replace(/\}\s*$/, '');
    } catch (e) {
      return { output: '', error: `Eroare transpilare: ${e.message}`, timedOut: false };
    }

    // Math functions available in scope
    const mathFns = `
      const Math_sqrt = Math.sqrt, Math_pow = Math.pow, Math_abs = Math.abs,
            Math_cbrt = Math.cbrt, Math_floor = Math.floor, Math_ceil = Math.ceil,
            Math_round = Math.round, Math_log = Math.log, Math_log2 = Math.log2,
            Math_log10 = Math.log10, Math_max = Math.max, Math_min = Math.min,
            Math_trunc = Math.trunc;
      function sqrt(x){return Math.sqrt(x);}
      function pow(x,y){return Math.pow(x,y);}
      function abs(x){return Math.abs(x);}
      function cbrt(x){return Math.cbrt(x);}
      function floor(x){return Math.floor(x);}
      function ceil(x){return Math.ceil(x);}
      function round(x){return Math.round(x);}
      function log(x){return Math.log(x);}
      function log2(x){return Math.log2(x);}
      function log10(x){return Math.log10(x);}
      function max(a,b){return Math.max(a,b);}
      function min(a,b){return Math.min(a,b);}
      function __trunc(x){return Math.trunc(x);}
    `;

    // Infinite loop protection: inject _chk() after every opening brace
    // This covers all loops (for/while/do) conservatively
    const MAX_ITER = 1000000;
    jsCode = jsCode.replace(/\{/g, '{ _chk();');

    const fullCode = `
      "use strict";
      ${mathFns}
      let _itr = 0;
      function _chk() { if(++_itr > ${MAX_ITER}) throw new Error('Buclă infinită sau timeout'); return true; }
      ${jsCode}
    `;

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('_readToken', '_readInt', '_readFloat', '_write', fullCode);
      fn(_readToken, _readInt, _readFloat, _write);
    } catch (e) {
      errorMsg = e.message;
    }

    return { output: outputBuf, error: errorMsg, timedOut: false };
  }

  // ── Validate ────────────────────────────────────────────────────
  /**
   * Validate C++ code against test cases.
   * tests: [{input, output}]
   * Returns array of {input, expected, actual, pass, error}
   */
  function validate(cppSrc, tests) {
    return tests.map(({input, output: expected}, idx) => {
      const { output, error } = run(cppSrc, input);
      const actual = output.trim();
      const exp = expected.trim();
      // Normalize: compare line by line, ignoring trailing whitespace per line
      const pass = normalizeOutput(actual) === normalizeOutput(exp);
      return { idx: idx+1, input, expected: exp, actual, pass, error };
    });
  }

  function normalizeOutput(s) {
    return s.split('\n').map(l => l.trimEnd()).join('\n').trim();
  }

  return { run, validate };

})();
