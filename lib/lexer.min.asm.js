// Build-time variant flag. The minimal build (lib/lexer.min.asm.in.js) rewrites
// this to `true`; terser then folds away the full-only getter reads (ip/ess/f/
// ms/attributes), matching the stripped LEXER_MIN wasm/asm exports.
const MINIMAL = true;

let asm, asmBuffer, allocSize = 2<<19, addr;

const copy = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? function (src, outBuf16) {
  const len = src.length;
  let i = 0;
  while (i < len)
    outBuf16[i] = src.charCodeAt(i++);
} : function (src, outBuf16) {
  const len = src.length;
  let i = 0;
  while (i < len) {
    const ch = src.charCodeAt(i);
    outBuf16[i++] = (ch & 0xff) << 8 | ch >>> 8;
  }
};

// Keyword dictionary, extracted from the fastcomp static memory image at build
// time (see chompfile.toml lib/lexer.asm.in.js) so it stays in sync with the
// keyword tables in lexer.c automatically.
const words = 'etaourceeferromsyncunctionlassvoyiedelecontininstantybreareturdebuggeawaithrwhileforifcatcfinallelsxportmport';

let source, name;
export function parse (_source, _name = '@') {
  source = _source;
  name = _name;
  // 2 bytes per string code point
  // + analysis space (2^17)
  // remaining space is EMCC stack space (2^17)
  const memBound = source.length * 2 + (2 << 18);
  if (memBound > allocSize || !asm) {
    while (memBound > allocSize) allocSize *= 2;
    asmBuffer = new ArrayBuffer(allocSize);
    copy(words, new Uint16Array(asmBuffer, 16, words.length));
    asm = asmInit(typeof globalThis !== 'undefined' ? globalThis : self, {}, asmBuffer);
    // lexer.c bulk allocates string space + analysis space
    addr = asm.su(allocSize - (2<<17), 1040);
  }
  const len = source.length + 1;
  asm.ses(addr);
  asm.sa(len - 1);

  copy(source, new Uint16Array(asmBuffer, addr, len));

  if (!asm.p()) {
    acornPos = asm.e();
    syntaxError();
  }

  const imports = [], exports = [];
  while (asm.ri()) {
    const s = asm.is(), e = asm.ie(), a = asm.ai(), d = asm.id(), ss = asm.ss(), se = asm.se(), t = asm.it();
    let n;
    if (asm.ip())
      n = readString(d === -1 ? s : s + 1, source.charCodeAt(d === -1 ? s - 1 : s));
    let at = null;
    // minimal build drops the parsed attribute list; es-module-shims reads the
    // assertion via source.slice(a, se - 1) instead
    if (!MINIMAL) {
      at = [];
      asm.rsa();
      while (asm.ra()) {
        const aks = asm.aks(), ake = asm.ake(), avs = asm.avs(), ave = asm.ave();
        at.push([decodeIfQuoted(aks, ake), decodeIfQuoted(avs, ave)]);
      }
      at = at.length > 0 ? at : null;
    }
    imports.push({ t, n, s, e, ss, se, d, a, at });
  }
  while (asm.re()) {
    const s = asm.es(), e = asm.ee(), ls = asm.els(), le = asm.ele();
    const ln = ls < 0 ? undefined : decodeIfQuoted(ls, le);
    const n = decodeIfQuoted(s, e);
    if (MINIMAL)
      exports.push({ s, e, ls, le, n, ln });
    else
      exports.push({ s, e, ls, le, ss: asm.ess(), n, ln });
  }

  return MINIMAL ? [imports, exports] : [imports, exports, !!asm.f(), !!asm.ms()];

  function decodeIfQuoted (pos, end) {
    const ch = source.charCodeAt(pos);
    if (ch === 34 || ch === 39)
      return readString(pos + 1, ch);
    return source.slice(pos, end);
  }
}

/*
 * Ported from Acorn
 *
 * MIT License

 * Copyright (C) 2012-2020 by various contributors (see AUTHORS)

 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
let acornPos;
function readString (start, quote) {
  acornPos = start;
  let out = '', chunkStart = acornPos;
  for (;;) {
    if (acornPos >= source.length) syntaxError();
    const ch = source.charCodeAt(acornPos);
    if (ch === quote) break;
    if (ch === 92) { // '\'
      out += source.slice(chunkStart, acornPos);
      out += readEscapedChar();
      chunkStart = acornPos;
    }
    else if (ch === 0x2028 || ch === 0x2029) {
      ++acornPos;
    }
    else {
      if (isBr(ch) && quote !== 96/*`*/) syntaxError();
      ++acornPos;
    }
  }
  out += source.slice(chunkStart, acornPos++);
  return out;
}

// Used to read escaped characters

function readEscapedChar () {
  let ch = source.charCodeAt(++acornPos);
  ++acornPos;
  switch (ch) {
    case 110: return '\n'; // 'n' -> '\n'
    case 114: return '\r'; // 'r' -> '\r'
    case 120: return String.fromCharCode(readHexChar(2)); // 'x'
    case 117: return readCodePointToString(); // 'u'
    case 116: return '\t'; // 't' -> '\t'
    case 98: return '\b'; // 'b' -> '\b'
    case 118: return '\u000b'; // 'v' -> '\u000b'
    case 102: return '\f'; // 'f' -> '\f'
    case 13: if (source.charCodeAt(acornPos) === 10) ++acornPos; // '\r\n'
    case 10: // ' \n'
      return '';
    case 56:
    case 57:
      syntaxError();
    default:
      if (ch >= 48 && ch <= 55) {
        let octalStr = source.substr(acornPos - 1, 3).match(/^[0-7]+/)[0];
        let octal = parseInt(octalStr, 8);
        if (octal > 255) {
          octalStr = octalStr.slice(0, -1);
          octal = parseInt(octalStr, 8);
        }
        acornPos += octalStr.length - 1;
        ch = source.charCodeAt(acornPos);
        if (octalStr !== '0' || ch === 56 || ch === 57)
          syntaxError();
        return String.fromCharCode(octal);
      }
      if (isBr(ch)) {
        // Unicode new line characters after \ get removed from output in both
        // template literals and strings
        return '';
      }
      return String.fromCharCode(ch);
  }
}

// Used to read character escape sequences ('\x', '\u', '\U').

function readHexChar (len) {
  const start = acornPos;
  let total = 0, lastCode = 0;
  for (let i = 0; i < len; ++i, ++acornPos) {
    let code = source.charCodeAt(acornPos), val;

    if (code === 95) {
      if (lastCode === 95 || i === 0) syntaxError();
      lastCode = code;
      continue;
    }

    if (code >= 97) val = code - 97 + 10; // a
    else if (code >= 65) val = code - 65 + 10; // A
    else if (code >= 48 && code <= 57) val = code - 48; // 0-9
    else break;
    if (val >= 16) break;
    lastCode = code;
    total = total * 16 + val;
  }

  if (lastCode === 95 || acornPos - start !== len) syntaxError();

  return total;
}

// Read a string value, interpreting backslash-escapes.

function readCodePointToString () {
  const ch = source.charCodeAt(acornPos);
  let code;
  if (ch === 123) { // '{'
    ++acornPos;
    code = readHexChar(source.indexOf('}', acornPos) - acornPos);
    ++acornPos;
    if (code > 0x10FFFF) syntaxError();
  } else {
    code = readHexChar(4);
  }
  // UTF-16 Decoding
  if (code <= 0xFFFF) return String.fromCharCode(code);
  code -= 0x10000;
  return String.fromCharCode((code >> 10) + 0xD800, (code & 1023) + 0xDC00);
}

function isBr (c) {
  return c === 13/*\r*/ || c === 10/*\n*/;
}

function syntaxError () {
  throw Object.assign(new Error(`Parse error ${name}:${source.slice(0, acornPos).split('\n').length}:${acornPos - source.lastIndexOf('\n', acornPos - 1)}`), { idx: acornPos });
}

// function asmInit () { ... } from lib/lexer.asm.js is concatenated at the end here
function asmInit(global,env,buffer) {
"use asm";var a=new global.Int8Array(buffer),b=new global.Int16Array(buffer),c=new global.Int32Array(buffer),d=new global.Uint8Array(buffer),e=new global.Uint16Array(buffer),v=1040;function z(d){d=d|0;var e=0,f=0,g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0;p=b[404]|0;e=c[74]|0;c[71]=e;o=e;l=p;j=e;n=0;a:while(1){f=c[75]|0;h=l<<16>>16==p<<16>>16;g=n&d;k=e;while(1){i=k+2|0;if(k>>>0>=f>>>0){e=0;m=98;break a}e=b[i>>1]|0;if(!(ma(e)|0)){if(h){switch(e<<16>>16){case 125:case 93:case 41:case 59:case 44:{m=98;break a}default:{}}if(g?Ca(e)|0:0){m=98;break a}}if(!(Ca(e)|0))break}k=i}c[74]=i;b:do switch(e<<16>>16){case 101:{if((l<<16>>16==0?oa(i)|0:0)?(V(k+4|0,214,10)|0)==0:0){D();m=87}else m=87;break}case 105:{if(oa(i)|0?(V(k+4|0,224,10)|0)==0:0){C();m=87}else m=87;break}case 99:{if((oa(i)|0?(V(k+4|0,68,8)|0)==0:0)?ya(b[k+12>>1]|0)|0:0){a[812]=1;m=87}else m=87;break}case 40:{k=c[72]|0;m=l&65535;c[k+(m<<3)>>2]=1;b[404]=l+1<<16>>16;c[k+(m<<3)+4>>2]=j;m=87;break}case 91:{k=c[72]|0;m=l&65535;c[k+(m<<3)>>2]=8;b[404]=l+1<<16>>16;c[k+(m<<3)+4>>2]=j;m=87;break}case 93:if(!(l<<16>>16)){xa();break b}else{b[404]=l+-1<<16>>16;m=87;break b}case 44:{f=b[403]|0;if((!(l<<16>>16==0|f<<16>>16==0)?(c[(c[72]|0)+((l&65535)+-1<<3)>>2]|0)==5:0)?(q=c[(c[73]|0)+((f&65535)+-1<<2)>>2]|0,(c[q+4>>2]|0)==0):0){c[q+4>>2]=o+2;c[74]=k+4;L(1)|0;m=c[74]|0;c[q+16>>2]=m;c[74]=m+-2;m=87}else m=87;break}case 41:{if(!(l<<16>>16)){xa();break b}m=l+-1<<16>>16;b[404]=m;f=b[403]|0;if(f<<16>>16!=0?(c[(c[72]|0)+((m&65535)<<3)>>2]|0)==5:0){g=c[(c[73]|0)+((f&65535)+-1<<2)>>2]|0;if(!(c[g+4>>2]|0))c[g+4>>2]=o+2;c[g+12>>2]=k+4;b[403]=f+-1<<16>>16;m=87}else m=87;break}case 123:{m=c[64]|0;do if((b[o>>1]|0)==41&(m|0)!=0?(c[m+12>>2]|0)==(o+2|0):0){f=c[65]|0;c[64]=f;if(!f){c[59]=0;break}else{c[f+32>>2]=0;break}}while(0);k=c[72]|0;m=l&65535;c[k+(m<<3)>>2]=(a[812]|0)==0?2:6;b[404]=l+1<<16>>16;c[k+(m<<3)+4>>2]=j;a[812]=0;m=87;break}case 125:{if(!(l<<16>>16)){xa();break b}k=c[72]|0;m=l+-1<<16>>16;b[404]=m;if((c[k+((m&65535)<<3)>>2]|0)==4){I();m=87}else m=87;break}case 34:case 39:{M(e);m=87;break}case 47:switch(b[k+4>>1]|0){case 47:{ga();break b}case 42:{U(1);break b}default:{g=b[o>>1]|0;c:do if(!(Y(g)|0)){if(!(g<<16>>16==41?la(c[(c[72]|0)+((l&65535)<<3)+4>>2]|0)|0:0))m=60}else switch(g<<16>>16){case 46:if(((b[o+-2>>1]|0)+-48&65535)<10){m=60;break c}else break c;case 43:if((b[o+-2>>1]|0)==43){m=60;break c}else break c;case 45:if((b[o+-2>>1]|0)==45){m=60;break c}else break c;default:break c}while(0);d:do if((m|0)==60){m=0;if(l<<16>>16!=0?(r=c[72]|0,s=(l&65535)+-1|0,g<<16>>16==102?(c[r+(s<<3)>>2]|0)==1:0):0){if(((b[o+-2>>1]|0)==111?N(o+-4|0)|0:0)?$(c[r+(s<<3)+4>>2]|0,178,3)|0:0)break}else m=65;if((m|0)==65?(0,g<<16>>16==125):0){h=c[72]|0;f=l&65535;if(T(c[h+(f<<3)+4>>2]|0)|0)break;if((c[h+(f<<3)>>2]|0)==6)break}if(!(F(o)|0)){switch(g<<16>>16){case 0:break d;case 47:{if(a[811]|0)break d;break}default:{}}m=c[66]|0;if((m|0?o>>>0>=(c[m>>2]|0)>>>0:0)?o>>>0<=(c[m+4>>2]|0)>>>0:0){S();a[811]=0;m=87;break b}h=c[3]|0;f=o;do{if(f>>>0<=h>>>0)break;f=f+-2|0;c[71]=f;g=b[f>>1]|0}while(!(fa(g)|0));if(ma(g)|0){do{if(f>>>0<=h>>>0)break;f=f+-2|0;c[71]=f}while(ma(b[f>>1]|0)|0);if(da(f)|0){S();a[811]=0;m=87;break b}}a[811]=1;m=87;break b}}while(0);S();a[811]=0;m=87;break b}}case 96:{k=c[72]|0;m=l&65535;c[k+(m<<3)+4>>2]=j;b[404]=l+1<<16>>16;c[k+(m<<3)>>2]=3;I();m=87;break}default:m=87}while(0);if((m|0)==87){m=0;c[71]=c[74]}if(a[810]|0){e=0;break}f=c[71]|0;e:do if((f|0)==(o|0))if(n&((b[404]|0)==p<<16>>16&d)){e=b[c[74]>>1]|0;if(Ca(e)|0)break a;else e=1}else e=n;else{if(e<<16>>16==47){e=(a[811]|0)==0;break}if(ha(e)|0)e=1;else{switch(e<<16>>16){case 96:case 34:case 39:case 41:case 93:case 125:{e=1;break e}default:{}}e=0}}while(0);o=f;l=b[404]|0;j=f;n=e;e=c[74]|0}if((m|0)==98)c[74]=i;return e|0}function A(){var d=0,e=0,f=0,g=0,h=0,i=0,j=0,k=0,l=0;l=v;v=v+10240|0;b[403]=0;b[404]=0;c[71]=c[2];a[811]=0;c[70]=0;a[810]=0;c[72]=l+2048;c[73]=l;a[812]=0;f=(c[3]|0)+-2|0;c[74]=f;d=f+(c[68]<<1)|0;c[75]=d;a:while(1){e=f+2|0;c[74]=e;if(f>>>0>=d>>>0){g=83;break}d=b[e>>1]|0;b:do switch(d<<16>>16){case 9:case 10:case 11:case 12:case 13:case 32:break;case 101:{if(((b[404]|0)==0?oa(e)|0:0)?(V(f+4|0,214,10)|0)==0:0){D();g=82}else g=82;break}case 105:{if(oa(e)|0?(V(f+4|0,224,10)|0)==0:0){C();g=82}else g=82;break}case 99:{if((oa(e)|0?(V(f+4|0,68,8)|0)==0:0)?ya(b[f+12>>1]|0)|0:0){a[812]=1;g=82}else g=82;break}case 40:{f=c[72]|0;g=b[404]|0;c[f+((g&65535)<<3)>>2]=1;e=c[71]|0;b[404]=g+1<<16>>16;c[f+((g&65535)<<3)+4>>2]=e;g=82;break}case 91:{f=c[72]|0;g=b[404]|0;c[f+((g&65535)<<3)>>2]=8;e=c[71]|0;b[404]=g+1<<16>>16;c[f+((g&65535)<<3)+4>>2]=e;g=82;break}case 93:{d=b[404]|0;if(!(d<<16>>16)){g=19;break a}b[404]=d+-1<<16>>16;g=82;break}case 44:{d=b[403]|0;if(((d<<16>>16!=0?(h=b[404]|0,h<<16>>16!=0):0)?(c[(c[72]|0)+((h&65535)+-1<<3)>>2]|0)==5:0)?(i=c[(c[73]|0)+((d&65535)+-1<<2)>>2]|0,(c[i+4>>2]|0)==0):0){c[i+4>>2]=(c[71]|0)+2;c[74]=f+4;L(1)|0;g=c[74]|0;c[i+16>>2]=g;c[74]=g+-2;g=82}else g=82;break}case 41:{d=b[404]|0;if(!(d<<16>>16)){g=27;break a}b[404]=d+-1<<16>>16;e=b[403]|0;if(e<<16>>16!=0?(c[(c[72]|0)+((d+-1&65535)<<3)>>2]|0)==5:0){d=c[(c[73]|0)+((e&65535)+-1<<2)>>2]|0;if(!(c[d+4>>2]|0))c[d+4>>2]=(c[71]|0)+2;c[d+12>>2]=f+4;b[403]=e+-1<<16>>16;g=82}else g=82;break}case 123:{d=c[71]|0;g=c[64]|0;do if((b[d>>1]|0)==41&(g|0)!=0?(c[g+12>>2]|0)==(d+2|0):0){e=c[65]|0;c[64]=e;if(!e){c[59]=0;break}else{c[e+32>>2]=0;break}}while(0);f=c[72]|0;g=b[404]|0;c[f+((g&65535)<<3)>>2]=(a[812]|0)==0?2:6;b[404]=g+1<<16>>16;c[f+((g&65535)<<3)+4>>2]=d;a[812]=0;g=82;break}case 125:{d=b[404]|0;if(!(d<<16>>16)){g=40;break a}g=c[72]|0;b[404]=d+-1<<16>>16;if((c[g+((d+-1&65535)<<3)>>2]|0)==4){I();g=82}else g=82;break}case 34:case 39:{M(d);g=82;break}case 47:switch(b[f+4>>1]|0){case 47:{ga();break b}case 42:{U(1);break b}default:{d=c[71]|0;e=b[d>>1]|0;c:do if(!(Y(e)|0))if(e<<16>>16==41){f=b[404]|0;if(!(la(c[(c[72]|0)+((f&65535)<<3)+4>>2]|0)|0))g=55}else g=54;else switch(e<<16>>16){case 46:if(((b[d+-2>>1]|0)+-48&65535)<10){g=54;break c}else break c;case 43:if((b[d+-2>>1]|0)==43){g=54;break c}else break c;case 45:if((b[d+-2>>1]|0)==45){g=54;break c}else break c;default:break c}while(0);if((g|0)==54){f=b[404]|0;g=55}d:do if((g|0)==55){g=0;if(f<<16>>16!=0?(j=c[72]|0,k=(f&65535)+-1|0,e<<16>>16==102?(c[j+(k<<3)>>2]|0)==1:0):0){if(((b[d+-2>>1]|0)==111?N(d+-4|0)|0:0)?$(c[j+(k<<3)+4>>2]|0,178,3)|0:0)break}else g=60;if((g|0)==60?(0,e<<16>>16==125):0){g=c[72]|0;f=f&65535;if(T(c[g+(f<<3)+4>>2]|0)|0)break;if((c[g+(f<<3)>>2]|0)==6)break}if(!(F(d)|0)){switch(e<<16>>16){case 0:break d;case 47:{if(a[811]|0)break d;break}default:{}}g=c[66]|0;if((g|0?d>>>0>=(c[g>>2]|0)>>>0:0)?d>>>0<=(c[g+4>>2]|0)>>>0:0){S();a[811]=0;g=82;break b}f=c[3]|0;do{if(d>>>0<=f>>>0)break;d=d+-2|0;c[71]=d;e=b[d>>1]|0}while(!(fa(e)|0));if(ma(e)|0){do{if(d>>>0<=f>>>0)break;d=d+-2|0;c[71]=d}while(ma(b[d>>1]|0)|0);if(da(d)|0){S();a[811]=0;g=82;break b}}a[811]=1;g=82;break b}}while(0);S();a[811]=0;g=82;break b}}case 96:{f=c[72]|0;g=b[404]|0;c[f+((g&65535)<<3)+4>>2]=c[71];b[404]=g+1<<16>>16;c[f+((g&65535)<<3)>>2]=3;I();g=82;break}default:g=82}while(0);if((g|0)==82){g=0;c[71]=c[74]}f=c[74]|0;d=c[75]|0}if((g|0)==19){xa();d=0}else if((g|0)==27){xa();d=0}else if((g|0)==40){xa();d=0}else if((g|0)==83)d=(a[810]|0)==0?(b[403]|b[404])<<16>>16==0:0;v=l;return d|0}function C(){var d=0,e=0,f=0,g=0,h=0,i=0,j=0;j=c[74]|0;c[74]=j+12;d=L(1)|0;f=c[74]|0;a:do if(d<<16>>16!=46){if(!(d<<16>>16==115&f>>>0>(j+12|0)>>>0)){if(!(d<<16>>16==100&f>>>0>(j+10|0)>>>0)){f=0;i=28;break}if(V(f+2|0,32,8)|0){e=f;d=100;f=0;i=74;break}if(!(ya(b[f+10>>1]|0)|0)){e=f;d=100;f=0;i=74;break}c[74]=f+10;d=L(1)|0;if(d<<16>>16==42){d=42;g=2;i=76;break}c[74]=f;f=0;i=28;break}if((V(f+2|0,22,10)|0)==0?ya(b[f+12>>1]|0)|0:0){c[74]=f+12;d=L(1)|0;e=c[74]|0;if((e|0)!=(f+12|0)){if(d<<16>>16!=102){f=1;i=28;break}if(V(e+2|0,40,6)|0){d=102;f=1;i=74;break}if(!(fa(b[e+8>>1]|0)|0)){d=102;f=1;i=74;break}}c[74]=f;f=0;i=28}else{e=f;d=115;f=0;i=74}}else{c[74]=f+2;switch((L(1)|0)<<16>>16){case 109:{d=c[74]|0;if(V(d+2|0,16,6)|0)break a;e=c[71]|0;if(!(na(e)|0)?(b[e>>1]|0)==46:0)break a;O(j,j,d+8|0,2);break a}case 115:{d=c[74]|0;if(V(d+2|0,22,10)|0)break a;e=c[71]|0;if(!(na(e)|0)?(b[e>>1]|0)==46:0)break a;c[74]=d+12;d=L(1)|0;f=1;i=28;break a}case 100:{d=c[74]|0;if(V(d+2|0,32,8)|0)break a;e=c[71]|0;if(!(na(e)|0)?(b[e>>1]|0)==46:0)break a;c[74]=d+10;d=L(1)|0;f=2;i=28;break a}default:break a}}while(0);b:do if((i|0)==28){if(d<<16>>16==40){g=c[72]|0;h=b[404]|0;c[g+((h&65535)<<3)>>2]=5;d=c[74]|0;b[404]=h+1<<16>>16;c[g+((h&65535)<<3)+4>>2]=d;if((b[c[71]>>1]|0)==46)break;c[74]=d+2;e=L(1)|0;O(j,c[74]|0,0,d);if(!f)d=c[64]|0;else{d=c[64]|0;c[d+28>>2]=(f|0)==1?5:7}h=c[73]|0;j=b[403]|0;b[403]=j+1<<16>>16;c[h+((j&65535)<<2)>>2]=d;switch(e<<16>>16){case 39:{M(39);break}case 34:{M(34);break}case 96:{if(!(Q()|0))i=37;break}default:i=37}if((i|0)==37){c[74]=(c[74]|0)+-2;break}d=(c[74]|0)+2|0;c[74]=d;switch((L(1)|0)<<16>>16){case 44:{c[74]=(c[74]|0)+2;L(1)|0;h=c[64]|0;c[h+4>>2]=d;j=c[74]|0;c[h+16>>2]=j;a[h+24>>0]=1;c[74]=j+-2;break b}case 41:{b[404]=(b[404]|0)+-1<<16>>16;j=c[64]|0;c[j+4>>2]=d;c[j+12>>2]=(c[74]|0)+2;a[j+24>>0]=1;b[403]=(b[403]|0)+-1<<16>>16;break b}default:{c[74]=(c[74]|0)+-2;break b}}}if(!((f|0)==0&d<<16>>16==123)){switch(d<<16>>16){case 42:case 39:case 34:{g=f;i=76;break b}default:{}}e=c[74]|0;i=74;break}d=c[74]|0;if(b[404]|0){c[74]=d+-2;break}c:while(1){c[74]=d+2;d=L(1)|0;while(1){g=c[74]|0;if(d<<16>>16==125){i=65;break c}if(g>>>0>=(c[75]|0)>>>0)break c;if(za(d)|0){M(d);c[74]=(c[74]|0)+2;f=g;e=0}else{ja(d)|0;f=c[74]|0;e=g}d=L(1)|0;if(d<<16>>16==97){d=c[74]|0;if((b[d+2>>1]|0)==115?ya(b[d+4>>1]|0)|0:0){c[74]=d+4;d=L(1)|0;if(za(d)|0){M(d);c[74]=(c[74]|0)+2;d=f;e=0}else{e=c[74]|0;ja(d)|0;d=c[74]|0}h=L(1)|0}else{h=97;d=f}}else{h=d;d=f}if((e|0)!=0&d>>>0>e>>>0)ia(e,d);d=c[74]|0;if(h<<16>>16==44)break;if((d|0)==(g|0)){i=64;break c}else d=h}}if((i|0)==64?h<<16>>16==125:0)i=65;if((i|0)==65)c[74]=g+2;h=(L(1)|0)<<16>>16==102;d=c[74]|0;if(h?V(d+2|0,40,6)|0:0){xa();break}c[74]=d+8;d=L(1)|0;if(za(d)|0){G(j,d,0);break}else{xa();break}}while(0);if((i|0)==74)if((e|0)==(j+12|0))c[74]=j+10;else{g=f;i=76}do if((i|0)==76){if(!((d<<16>>16==42|(g|0)!=2)&(b[404]|0)==0)){c[74]=(c[74]|0)+-2;break}if(za(d)|0)d=c[74]|0;else{i=c[74]|0;K(d);c[74]=i;d=i}e=c[75]|0;while(1){if(d>>>0>=e>>>0){i=86;break}f=b[d>>1]|0;if(za(f)|0){i=84;break}i=d+2|0;c[74]=i;d=i}if((i|0)==84){G(j,f,g);break}else if((i|0)==86){xa();break}}while(0);return}function D(){var a=0,d=0,e=0,f=0,g=0,h=0,i=0,j=0,k=0,l=0,m=0;j=c[74]|0;k=c[66]|0;c[74]=j+12;d=L(1)|0;a=c[74]|0;if(!((a|0)==(j+12|0)?!(X(d)|0):0))m=3;a:do if((m|0)==3){b:do switch(d<<16>>16){case 123:{c[74]=a+2;a=L(1)|0;e=c[74]|0;while(1){if(za(a)|0){M(a);a=(c[74]|0)+2|0;c[74]=a}else{ja(a)|0;a=c[74]|0}L(1)|0;a=P(e,a)|0;if(a<<16>>16==44){c[74]=(c[74]|0)+2;a=L(1)|0}d=e;e=c[74]|0;if(a<<16>>16==125){m=15;break}if((e|0)==(d|0)){m=12;break}if(e>>>0>(c[75]|0)>>>0){m=14;break}}if((m|0)==12){xa();break a}else if((m|0)==14){xa();break a}else if((m|0)==15){c[74]=e+2;m=49;break b}break}case 42:{c[74]=a+2;L(1)|0;m=c[74]|0;P(m,m)|0;m=49;break}case 100:{c[74]=a+14;switch((L(1)|0)<<16>>16){case 97:{d=c[74]|0;if((V(d+2|0,46,8)|0)==0?ma(b[d+10>>1]|0)|0:0){c[74]=d+10;L(0)|0;m=21}break}case 102:{m=21;break}case 99:{d=c[74]|0;if(((V(d+2|0,68,8)|0)==0?(l=b[d+10>>1]|0,ya(l)|0|l<<16>>16==123):0)?(c[74]=d+10,e=L(1)|0,e<<16>>16!=123):0){i=e;m=30}break}default:{}}c:do if((m|0)==21?(f=c[74]|0,(V(f+2|0,54,14)|0)==0):0){d=b[f+16>>1]|0;if(!(ya(d)|0))switch(d<<16>>16){case 40:case 42:break;default:break c}c[74]=f+16;d=L(1)|0;if(d<<16>>16==42){c[74]=(c[74]|0)+2;d=L(1)|0}if(d<<16>>16!=40){i=d;m=30}}while(0);if((m|0)==30?(g=c[74]|0,ja(i)|0,h=c[74]|0,h>>>0>g>>>0):0){aa(a,a+14|0,g,h);c[74]=(c[74]|0)+-2;break a}aa(a,a+14|0,0,0);c[74]=a+12;break a}case 97:{c[74]=a+10;L(0)|0;a=c[74]|0;m=34;break}case 102:{m=34;break}case 99:{if((V(a+2|0,68,8)|0)==0?fa(b[a+10>>1]|0)|0:0){c[74]=a+10;m=L(1)|0;l=c[74]|0;ja(m)|0;m=c[74]|0;aa(l,m,l,m);c[74]=(c[74]|0)+-2;break a}c[74]=a+4;a=a+4|0;m=41;break}case 108:case 118:{m=41;break}default:break a}while(0);if((m|0)==34){c[74]=a+16;a=L(1)|0;if(a<<16>>16==42){c[74]=(c[74]|0)+2;a=L(1)|0}l=c[74]|0;ja(a)|0;m=c[74]|0;aa(l,m,l,m);c[74]=(c[74]|0)+-2;break}else if((m|0)==41){c[74]=a+6;while(1){d=L(1)|0;a=c[74]|0;if(a>>>0>(c[75]|0)>>>0)break;d=ba(d)|0;if((c[74]|0)==(a|0))break;if(d<<16>>16==61)d=z(1)|0;a=c[74]|0;if(d<<16>>16!=44)break;c[74]=a+2}c[74]=a+-2;break}else if((m|0)==49){if((L(1)|0)<<16>>16==102?(l=c[74]|0,(V(l+2|0,40,6)|0)==0):0){c[74]=l+8;G(j,L(1)|0,0);a=(k|0)==0?240:k+16|0;while(1){a=c[a>>2]|0;if(!a)break a;c[a+12>>2]=0;c[a+8>>2]=0;a=a+16|0}}d:do if(c[61]|0){a=(k|0)==0?240:k+16|0;while(1){d=c[a>>2]|0;if(!d)break d;a=c[d+8>>2]|0;if(a|0?ca(a,c[d+12>>2]|0)|0:0){c[d+12>>2]=0;c[d+8>>2]=0}a=d+16|0}}while(0);c[74]=(c[74]|0)+-2;break}}while(0);return}function E(){var a=0,d=0,e=0,f=0,g=0,h=0,i=0;a=c[74]|0;g=(b[a>>1]|0)==123;c[74]=a+2;a=L(1)|0;h=g?125:93;a:while(1){if((h|0)==(a&65535|0))break;f=c[74]|0;if(f>>>0>(c[75]|0)>>>0)break;if((a<<16>>16==46?(b[f+2>>1]|0)==46:0)?(b[f+4>>1]|0)==46:0){c[74]=f+6;a=ba(L(1)|0)|0}else i=9;b:do if((i|0)==9){i=0;do if(g){do if(a<<16>>16==91){z(0)|0;c[74]=(c[74]|0)+2;d=f}else{if(za(a)|0){M(a);c[74]=(c[74]|0)+2;d=f;break}if((a+-48&65535)>=10){ja(a)|0;d=c[74]|0;break}a=f;c:while(1){e=a+2|0;d=b[e>>1]|0;d:do if((d+-48&65535)>=10){switch(d<<16>>16){case 67:case 68:case 70:case 97:case 65:case 99:case 100:case 102:case 46:case 66:case 69:case 79:case 88:case 95:case 98:case 101:case 110:case 111:case 120:break d;case 43:case 45:break;default:break c}switch(b[a>>1]|0){case 69:case 101:break;default:break c}}while(0);a=e}c[74]=e;d=f}while(0);a=L(1)|0;if(a<<16>>16==58){c[74]=(c[74]|0)+2;a=ba(L(1)|0)|0;break}if(d>>>0>f>>>0)aa(f,d,f,d)}else if(a<<16>>16==44){c[74]=f+2;a=L(1)|0;break b}else{a=ba(a)|0;break}while(0);if(a<<16>>16==61)a=z(0)|0;if(a<<16>>16!=44)break a;c[74]=(c[74]|0)+2;a=L(1)|0}while(0)}return}function F(a){a=a|0;a:do switch(b[a>>1]|0){case 100:switch(b[a+-2>>1]|0){case 105:{a=$(a+-4|0,76,2)|0;break a}case 108:{a=$(a+-4|0,80,3)|0;break a}default:{a=0;break a}}case 101:switch(b[a+-2>>1]|0){case 115:switch(b[a+-4>>1]|0){case 108:{a=ea(a+-6|0,101)|0;break a}case 97:{a=ea(a+-6|0,99)|0;break a}default:{a=0;break a}}case 116:{a=$(a+-4|0,86,4)|0;break a}case 117:{a=$(a+-4|0,94,6)|0;break a}default:{a=0;break a}}case 102:{if((b[a+-2>>1]|0)==111?(b[a+-4>>1]|0)==101:0)switch(b[a+-6>>1]|0){case 99:{a=$(a+-8|0,106,6)|0;break a}case 112:{a=$(a+-8|0,118,2)|0;break a}default:{a=0;break a}}else a=0;break}case 107:{a=$(a+-2|0,122,4)|0;break}case 110:{if(ea(a+-2|0,105)|0)a=1;else a=$(a+-2|0,130,5)|0;break}case 111:{a=ea(a+-2|0,100)|0;break}case 114:{a=$(a+-2|0,140,7)|0;break}case 116:{a=$(a+-2|0,154,4)|0;break}case 119:switch(b[a+-2>>1]|0){case 101:{a=ea(a+-4|0,110)|0;break a}case 111:{a=$(a+-4|0,162,3)|0;break a}default:{a=0;break a}}default:a=0}while(0);return a|0}function G(a,d,e){a=a|0;d=d|0;e=e|0;var f=0,g=0;f=(c[74]|0)+2|0;switch(d<<16>>16){case 39:{M(39);g=5;break}case 34:{M(34);g=5;break}default:xa()}do if((g|0)==5){O(a,f,c[74]|0,1);if((e|0)>0)c[(c[64]|0)+28>>2]=(e|0)==1?4:6;c[74]=(c[74]|0)+2;g=(L(0)|0)<<16>>16==119;d=c[74]|0;if(((g?(b[d+2>>1]|0)==105:0)?(b[d+4>>1]|0)==116:0)?(b[d+6>>1]|0)==104:0){c[74]=d+8;if((L(1)|0)<<16>>16!=123){c[74]=d;break}e=c[74]|0;f=e;a:while(1){c[74]=f+2;f=L(1)|0;switch(f<<16>>16){case 39:{M(39);c[74]=(c[74]|0)+2;f=L(1)|0;break}case 34:{M(34);c[74]=(c[74]|0)+2;f=L(1)|0;break}default:f=ja(f)|0}if(f<<16>>16!=58){g=20;break}c[74]=(c[74]|0)+2;switch((L(1)|0)<<16>>16){case 39:{M(39);break}case 34:{M(34);break}default:{g=24;break a}}c[74]=(c[74]|0)+2;switch((L(1)|0)<<16>>16){case 125:{g=28;break a}case 44:break;default:{g=26;break a}}f=(c[74]|0)+2|0;c[74]=f}if((g|0)==20){c[74]=d;break}else if((g|0)==24){c[74]=d;break}else if((g|0)==26){c[74]=d;break}else if((g|0)==28){g=c[64]|0;c[g+16>>2]=e;c[g+12>>2]=(c[74]|0)+2;break}}c[74]=d+-2}while(0);return}function I(){var a=0,d=0,e=0;d=c[75]|0;e=c[74]|0;a:while(1){a=e+2|0;if(e>>>0>=d>>>0){d=10;break}switch(b[a>>1]|0){case 96:{d=7;break a}case 36:{if((b[e+4>>1]|0)==123){d=6;break a}break}case 92:{a=e+4|0;break}default:{}}e=a}if((d|0)==6){a=e+4|0;c[74]=a;d=c[72]|0;e=b[404]|0;c[d+((e&65535)<<3)>>2]=4;b[404]=e+1<<16>>16;c[d+((e&65535)<<3)+4>>2]=a}else if((d|0)==7){c[74]=a;d=c[72]|0;e=(b[404]|0)+-1<<16>>16;b[404]=e;if((c[d+((e&65535)<<3)>>2]|0)!=3)xa()}else if((d|0)==10){c[74]=a;xa()}return}function K(a){a=a|0;var d=0,e=0,f=0,g=0,h=0;while(1){d=c[74]|0;if(a<<16>>16==42){h=3;break}ja(a)|0;a=c[74]|0;if((a|0)==(d|0))break;ia(d,a);if((L(1)|0)<<16>>16!=44)break;c[74]=(c[74]|0)+2;if((L(1)|0)<<16>>16==42)a=42;else break}if(((((h|0)==3?(c[74]=d+2,(L(1)|0)<<16>>16==97):0)?(e=c[74]|0,(b[e+2>>1]|0)==115):0)?ya(b[e+4>>1]|0)|0:0)?(c[74]=e+4,g=L(1)|0,f=c[74]|0,ja(g)|0,g=c[74]|0,g>>>0>f>>>0):0)ia(f,g);return}function L(a){a=a|0;var d=0,e=0,f=0;e=c[74]|0;a:do{d=b[e>>1]|0;b:do if(d<<16>>16!=47)if(a)if(ya(d)|0)break;else break a;else if(ma(d)|0)break;else break a;else switch(b[e+2>>1]|0){case 47:{ga();break b}case 42:{U(a);break b}default:{d=47;break a}}while(0);f=c[74]|0;e=f+2|0;c[74]=e}while(f>>>0<(c[75]|0)>>>0);return d|0}function M(a){a=a|0;var d=0,e=0,f=0,g=0;g=c[75]|0;d=c[74]|0;while(1){f=d+2|0;if(d>>>0>=g>>>0){d=9;break}e=b[f>>1]|0;if(e<<16>>16==a<<16>>16){d=10;break}if(e<<16>>16==92){e=d+4|0;if((b[e>>1]|0)==13){d=d+6|0;d=(b[d>>1]|0)==10?d:e}else d=e}else if(Ca(e)|0){d=9;break}else d=f}if((d|0)==9){c[74]=f;xa()}else if((d|0)==10)c[74]=f;return}function N(a){a=a|0;var d=0,e=0;d=b[a>>1]|0;if(ya(d)|0)e=3;else switch(d<<16>>16){case 41:case 125:case 93:{e=3;break}default:a=0}a:do if((e|0)==3){e=c[3]|0;while(1){if(a>>>0<=e>>>0)break;a=a+-2|0;if(!(ya(d)|0))break;d=b[a>>1]|0}switch(d<<16>>16){case 41:case 125:case 93:{a=1;break a}default:{}}a=(X(d)|0)^1}while(0);return a|0}function O(b,d,e,f){b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0;h=c[69]|0;c[69]=h+36;g=c[64]|0;c[((g|0)==0?236:g+32|0)>>2]=h;c[65]=g;c[64]=h;c[h+8>>2]=b;if(2==(f|0)){b=3;g=e}else{b=1==(f|0)?1:2;g=1==(f|0)?e+2|0:0}c[h+12>>2]=g;c[h+28>>2]=b;c[h>>2]=d;c[h+4>>2]=e;c[h+16>>2]=0;c[h+20>>2]=f;a[h+24>>0]=1==(f|0)&1;c[h+32>>2]=0;return}function P(a,d){a=a|0;d=d|0;var e=0,f=0,g=0,h=0;e=c[74]|0;f=b[e>>1]|0;g=(a|0)==(d|0)?0:a;h=(a|0)==(d|0)?0:d;if(f<<16>>16==97){c[74]=e+4;e=L(1)|0;a=c[74]|0;if(za(e)|0){M(e);d=(c[74]|0)+2|0;c[74]=d}else{ja(e)|0;d=c[74]|0}f=L(1)|0;e=c[74]|0}if((e|0)!=(a|0))aa(a,d,g,h);return f|0}function Q(){var a=0,d=0,e=0,f=0;f=c[74]|0;e=c[75]|0;d=f;a:while(1){a=d+2|0;if(d>>>0>=e>>>0){d=7;break}switch(b[a>>1]|0){case 96:{d=8;break a}case 92:{a=d+4|0;break}case 36:{if((b[d+4>>1]|0)==123){d=7;break a}break}default:{}}d=a}if((d|0)==7){c[74]=f;a=0}else if((d|0)==8){c[74]=a;a=1}return a|0}function R(){var a=0,d=0,e=0;e=c[75]|0;d=c[74]|0;a:while(1){a=d+2|0;if(d>>>0>=e>>>0){d=6;break}switch(b[a>>1]|0){case 13:case 10:{d=6;break a}case 93:{d=7;break a}case 92:{a=d+4|0;break}default:{}}d=a}if((d|0)==6){c[74]=a;xa();a=0}else if((d|0)==7){c[74]=a;a=93}return a|0}function S(){var a=0,d=0;a:while(1){a=c[74]|0;c[74]=a+2;if(a>>>0>=(c[75]|0)>>>0){d=7;break}switch(b[a+2>>1]|0){case 13:case 10:{d=7;break a}case 47:break a;case 91:{R()|0;break}case 92:{c[74]=a+4;break}default:{}}}if((d|0)==7)xa();return}function T(a){a=a|0;switch(b[a>>1]|0){case 62:{a=(b[a+-2>>1]|0)==61;break}case 41:case 59:{a=1;break}case 104:{a=$(a+-2|0,188,4)|0;break}case 121:{a=$(a+-2|0,196,6)|0;break}case 101:{a=$(a+-2|0,208,3)|0;break}default:a=0}return a|0}function U(a){a=a|0;var d=0,e=0,f=0,g=0,h=0;g=(c[74]|0)+2|0;c[74]=g;e=c[75]|0;while(1){d=g+2|0;if(g>>>0>=e>>>0)break;f=b[d>>1]|0;if(!a?Ca(f)|0:0)break;if(f<<16>>16==42?(b[g+4>>1]|0)==47:0){h=8;break}g=d}if((h|0)==8){c[74]=d;d=g+4|0}c[74]=d;return}function V(b,c,d){b=b|0;c=c|0;d=d|0;var e=0,f=0;a:do if(!d)b=0;else{while(1){e=a[b>>0]|0;f=a[c>>0]|0;if(e<<24>>24!=f<<24>>24)break;d=d+-1|0;if(!d){b=0;break a}else{b=b+1|0;c=c+1|0}}b=(e&255)-(f&255)|0}while(0);return b|0}function X(a){a=a|0;a:do switch(a<<16>>16){case 38:case 37:case 33:{a=1;break}default:if((a&-8)<<16>>16==40|(a+-58&65535)<6)a=1;else{switch(a<<16>>16){case 91:case 93:case 94:{a=1;break a}default:{}}a=(a+-123&65535)<4}}while(0);return a|0}function Y(a){a=a|0;a:do switch(a<<16>>16){case 38:case 37:case 33:break;default:if(!((a+-58&65535)<6|(a+-40&65535)<7&a<<16>>16!=41)){switch(a<<16>>16){case 91:case 94:break a;default:{}}return a<<16>>16!=125&(a+-123&65535)<4|0}}while(0);return 1}function Z(a){a=a|0;var c=0;c=b[a>>1]|0;a:do if((c+-9&65535)>=5){switch(c<<16>>16){case 160:case 32:{c=1;break a}default:{}}if(X(c)|0)return c<<16>>16!=46|(na(a)|0)|0;else c=0}else c=1;while(0);return c|0}function _(a){a=a|0;var d=0,e=0;e=v;v=v+16|0;c[e>>2]=0;c[68]=a;d=c[3]|0;b[d+(a<<1)>>1]=0;c[e>>2]=d+(a<<1)+2;c[69]=d+(a<<1)+2;c[59]=0;c[64]=0;c[62]=0;c[60]=0;c[66]=0;c[63]=0;c[61]=0;c[67]=0;v=e;return d|0}function $(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0;f=a+(0-d<<1)+2|0;e=c[3]|0;if(f>>>0>=e>>>0?(V(f,b,d<<1)|0)==0:0)if((f|0)==(e|0))e=1;else e=Z(a+(0-d<<1)|0)|0;else e=0;return e|0}function aa(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0;f=c[69]|0;c[69]=f+20;g=c[66]|0;c[((g|0)==0?240:g+16|0)>>2]=f;c[66]=f;c[f>>2]=a;c[f+4>>2]=b;c[f+8>>2]=d;c[f+12>>2]=e;c[f+16>>2]=0;return}function ba(a){a=a|0;var b=0;switch(a<<16>>16){case 91:case 123:{E();c[74]=(c[74]|0)+2;break}default:{b=c[74]|0;ja(a)|0;a=c[74]|0;if(a>>>0>b>>>0)aa(b,a,b,a)}}return L(1)|0}function ca(a,b){a=a|0;b=b|0;var d=0,e=0;d=244;while(1){e=c[d>>2]|0;if(!e){d=0;break}d=c[e>>2]|0;if(((c[e+4>>2]|0)-d|0)==(b-a|0)?(V(d,a,b-a|0)|0)==0:0){d=1;break}d=e+8|0}return d|0}function da(a){a=a|0;switch(b[a>>1]|0){case 107:{a=$(a+-2|0,122,4)|0;break}case 101:{if((b[a+-2>>1]|0)==117)a=$(a+-4|0,94,6)|0;else a=0;break}default:a=0}return a|0}function ea(a,d){a=a|0;d=d|0;var e=0;e=c[3]|0;if(e>>>0<=a>>>0?(b[a>>1]|0)==d<<16>>16:0)if((e|0)==(a|0))e=1;else e=fa(b[a+-2>>1]|0)|0;else e=0;return e|0}function fa(a){a=a|0;a:do if((a+-9&65535)<5)a=1;else{switch(a<<16>>16){case 32:case 160:{a=1;break a}default:{}}a=a<<16>>16!=46&(X(a)|0)}while(0);return a|0}function ga(){var a=0,d=0,e=0;a=c[75]|0;e=c[74]|0;a:while(1){d=e+2|0;if(e>>>0>=a>>>0)break;switch(b[d>>1]|0){case 13:case 10:break a;default:e=d}}c[74]=d;return}function ha(a){a=a|0;a:do if(((a&-33)+-65&65535)<26|(a+-48&65535)<10)a=1;else{switch(a<<16>>16){case 36:case 95:{a=1;break a}default:{}}a=(a&65535)>127}while(0);return a|0}function ia(a,b){a=a|0;b=b|0;var d=0,e=0;d=c[69]|0;c[69]=d+12;e=c[67]|0;c[((e|0)==0?244:e+8|0)>>2]=d;c[67]=d;c[d>>2]=a;c[d+4>>2]=b;c[d+8>>2]=0;return}function ja(a){a=a|0;while(1){if(ya(a)|0)break;if(X(a)|0)break;a=(c[74]|0)+2|0;c[74]=a;a=b[a>>1]|0;if(!(a<<16>>16)){a=0;break}}return a|0}function ka(){var a=0;a=c[(c[62]|0)+20>>2]|0;switch(a|0){case 1:{a=-1;break}case 2:{a=-2;break}default:a=a-(c[3]|0)>>1}return a|0}function la(a){a=a|0;if(!($(a,168,5)|0)?!($(a,178,3)|0):0)a=$(a,184,2)|0;else a=1;return a|0}function ma(a){a=a|0;switch(a<<16>>16){case 160:case 32:case 12:case 11:case 9:{a=1;break}default:a=0}return a|0}function na(a){a=a|0;if((b[a>>1]|0)==46?(b[a+-2>>1]|0)==46:0)a=(b[a+-4>>1]|0)==46;else a=0;return a|0}function oa(a){a=a|0;if((c[3]|0)==(a|0))a=1;else a=Z(a+-2|0)|0;return a|0}function pa(){var a=0;a=c[(c[63]|0)+12>>2]|0;if(!a)a=-1;else a=a-(c[3]|0)>>1;return a|0}function qa(){var a=0;a=c[(c[62]|0)+12>>2]|0;if(!a)a=-1;else a=a-(c[3]|0)>>1;return a|0}function ra(){var a=0;a=c[(c[63]|0)+8>>2]|0;if(!a)a=-1;else a=a-(c[3]|0)>>1;return a|0}function sa(){var a=0;a=c[(c[62]|0)+16>>2]|0;if(!a)a=-1;else a=a-(c[3]|0)>>1;return a|0}function ta(){var a=0;a=c[(c[62]|0)+4>>2]|0;if(!a)a=-1;else a=a-(c[3]|0)>>1;return a|0}function ua(){var a=0;a=c[62]|0;a=c[((a|0)==0?236:a+32|0)>>2]|0;c[62]=a;return (a|0)!=0|0}function va(){var a=0;a=c[63]|0;a=c[((a|0)==0?240:a+16|0)>>2]|0;c[63]=a;return (a|0)!=0|0}function xa(){a[810]=1;c[70]=(c[74]|0)-(c[3]|0)>>1;c[74]=(c[75]|0)+2;return}function ya(a){a=a|0;return (a|128)<<16>>16==160|(a+-9&65535)<5|0}function za(a){a=a|0;return a<<16>>16==39|a<<16>>16==34|0}function Aa(){return (c[(c[62]|0)+8>>2]|0)-(c[3]|0)>>1|0}function Ba(){return (c[(c[63]|0)+4>>2]|0)-(c[3]|0)>>1|0}function Ca(a){a=a|0;return a<<16>>16==13|a<<16>>16==10|0}function Da(){return (c[c[62]>>2]|0)-(c[3]|0)>>1|0}function Ea(){return (c[c[63]>>2]|0)-(c[3]|0)>>1|0}function Fa(){return d[(c[62]|0)+24>>0]|0|0}function Ga(a){a=a|0;c[3]=a;return}function Ha(){return c[(c[62]|0)+28>>2]|0}function Na(){return c[70]|0}  function su(a, b) {
		a = a | 0;
		b = b | 0;
		v = a + b + 15 & -16;
		return b;
	}
	return {
		su,ai:sa,e:Na,ee:Ba,ele:pa,els:ra,es:Ea,id:ka,ie:ta,ip:Fa,is:Da,it:Ha,p:A,re:va,ri:ua,sa:_,se:qa,ses:Ga,ss:Aa}}