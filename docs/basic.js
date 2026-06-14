/* basic.js — shared GW-BASIC syntax tokenizer for the listing pages
   (source.html and explained.html). Returns an array of [class, text] tokens
   per physical line; classes: ws ln com str num kw fn op id pn.
   migration.html keeps its own reduced tokenizer (it classifies a smaller
   keyword set and coexists with a separate JS tokenizer). */
'use strict';

/* ---------- GW-BASIC token classification ---------- */
const KW = new Set(('REM DEFINT DEFSNG DEFDBL DEFSTR SCREEN WIDTH CLS RANDOMIZE DEF SEG ' +
  'POKE DIM LOCATE PRINT USING LPRINT FOR TO STEP NEXT IF THEN ELSE GOTO GOSUB RETURN ' +
  'ON WHILE WEND SOUND PLAY BEEP END STOP DATA READ RESTORE LET INPUT LINE GET PUT OPEN ' +
  'CLOSE CALL RUN COLOR PSET PRESET CIRCLE PAINT DRAW OUT WAIT SWAP ERASE CLEAR OPTION BASE').split(' '));
const FN = new Set(('CHR$ STR$ STRING$ SPACE$ LEFT$ RIGHT$ MID$ HEX$ OCT$ INKEY$ INPUT$ ASC LEN ' +
  'INSTR INT FIX ABS SGN SQR SIN COS TAN ATN LOG EXP RND VAL PEEK TIMER POS CSRLIN VARPTR ' +
  'FRE SPC TAB').split(' '));
const OPWORD = new Set('AND OR NOT XOR EQV IMP MOD'.split(' '));

const isWordStart = c => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
const isWord      = c => isWordStart(c) || (c >= '0' && c <= '9');
const isDigit     = c => c >= '0' && c <= '9';
const isHex       = c => isDigit(c) || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');

/* scan a run of code (no leading line number) into [class, text] tokens */
function scanCode(s, out){
  let i = 0; const n = s.length;
  while(i < n){
    const c = s[i];
    if(c === ' ' || c === '\t'){ let j = i; while(j < n && (s[j] === ' ' || s[j] === '\t')) j++; out.push(['ws', s.slice(i, j)]); i = j; continue; }
    if(c === "'"){ out.push(['com', s.slice(i)]); break; }                       // apostrophe comment → rest of line
    if(c === '"'){ let j = i + 1; while(j < n && s[j] !== '"') j++; if(j < n) j++; out.push(['str', s.slice(i, j)]); i = j; continue; }
    if(c === '&' && (s[i+1] === 'H' || s[i+1] === 'h')){ let j = i + 2; while(j < n && isHex(s[j])) j++; out.push(['num', s.slice(i, j)]); i = j; continue; }
    if(isDigit(c) || (c === '.' && isDigit(s[i+1] || ''))){ let j = i; while(j < n && (isDigit(s[j]) || s[j] === '.')) j++; out.push(['num', s.slice(i, j)]); i = j; continue; }
    if(isWordStart(c)){
      let j = i; while(j < n && isWord(s[j])) j++;
      if(s[j] === '$') j++;                                                       // CHR$, A$, INKEY$ …
      const w = s.slice(i, j), up = w.toUpperCase();
      if(up === 'REM'){ out.push(['kw', w]); out.push(['com', s.slice(j)]); break; }
      out.push([KW.has(up) ? 'kw' : FN.has(up) ? 'fn' : OPWORD.has(up) ? 'op' : 'id', w]);
      i = j; continue;
    }
    if('=+-*/\\^<>'.includes(c)){
      const two = s.substr(i, 2);
      if(two === '<=' || two === '>=' || two === '<>' || two === '><'){ out.push(['op', two]); i += 2; continue; }
      out.push(['op', c]); i++; continue;
    }
    out.push(['pn', c]); i++;                                                     // : ; , ( ) etc.
  }
}

/* one physical line → tokens (split off the leading BASIC line number first) */
function tokenizeBasicLine(line){
  const out = [];
  const m = /^(\s*)(\d+)(?=\D|$)/.exec(line);
  if(m){
    if(m[1]) out.push(['ws', m[1]]);
    out.push(['ln', m[2]]);
    scanCode(line.slice(m[0].length), out);
  } else {
    scanCode(line, out);                                                          // header ' comments + blank lines
  }
  return out;
}
