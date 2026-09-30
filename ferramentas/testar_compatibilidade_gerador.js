// Reproduz EXATAMENTE o parseCSV/detectDelimiter/looksLikeHeader do
// gerador-flashcards.html para conferir que os CSVs sao aceitos.
const fs=require('fs'),path=require('path');
const CSV=process.argv[2];

function parseCSV(text, delim) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  var rows = [], row = [], field = '', inQuotes = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function detectDelimiter(text) {
  var sample = text.slice(0, 20000), best = ',', bestScore = -1;
  [',',';','\t','|'].forEach(function (d) {
    var rows = parseCSV(sample, d).filter(r => r.length && r.join('').trim() !== '').slice(0,15);
    if (!rows.length) return;
    var counts = rows.map(r => r.length), min = Math.min.apply(null, counts);
    if (min < 2) return;
    var consistent = counts.every(c => c === min);
    var score = (consistent ? 1000 : 0) + min;
    if (score > bestScore) { bestScore = score; best = d; }
  });
  return best;
}
function looksLikeHeader(row) {
  var norm = s => String(s||'').toLowerCase().replace(/[^a-z]/g,'');
  var first = norm(row[0]);
  var hasQ = /pergunt|quest|frente|comando|prompt/.test(first);
  var hasA = /respost|verso|answer/.test(norm(row[1])) || /respost|verso|answer/.test(norm(row[1]));
  return hasQ && hasA;
}
let ok=0, bad=[], totalCards=0;
for (const f of fs.readdirSync(CSV).filter(x=>x.endsWith('.csv')).sort()) {
  const raw = fs.readFileSync(path.join(CSV,f));
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset+raw.byteLength);
  let text;
  if (buf[0]===0xEF&&buf[1]===0xBB&&buf[2]===0xBF) text = new TextDecoder('utf-8').decode(new Uint8Array(buf).slice(3));
  else { try { text = new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(buf)); } catch(e){ text=new TextDecoder('windows-1252').decode(new Uint8Array(buf)); } }
  const delim = detectDelimiter(text);
  let rows = parseCSV(text, delim).filter(r => r.join('').trim() !== '');
  const nomeDelim = delim === '\t' ? 'tab' : delim === '|' ? 'pipe' : delim;
  let hdr = false;
  if (looksLikeHeader(rows[0])) { rows.shift(); hdr = true; }
  const cards = rows.filter(r => (r[0]||'').trim());
  const semResposta = cards.filter(r => !(r[1]||'').trim()).length;
  const problemas = [];
  if (delim !== ';') problemas.push('separador='+nomeDelim+' (esperado ;)');
  if (!hdr) problemas.push('cabecalho nao reconhecido');
  if (semResposta) problemas.push(semResposta+' cartoes sem resposta');
  if (problemas.length) bad.push(f+': '+problemas.join('; ')); else { ok++; totalCards += cards.length; }
}
console.log('CSVs aceitos pelo gerador: '+ok+'/'+(ok+bad.length)+'  ('+totalCards+' cartoes)');
if (bad.length) { console.log('PROBLEMAS:'); bad.forEach(b=>console.log('  '+b)); process.exit(1); }
