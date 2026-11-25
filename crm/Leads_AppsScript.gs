/**
 * LERUMSBOXEN – LEADS-CRM
 * ============================================================
 * Fristående Apps Script, bundet till ett EGET Google Sheet
 * ("Lerumsboxen Leads"). Håll det skilt från medlemsarket så att
 * leads aldrig kan läsas via appens öppna "pull"-endpoint.
 *
 * Installation (se crm/README.md för detaljer):
 *   1. Skapa ett nytt Google Sheet → Tillägg → Apps Script.
 *   2. Klistra in hela den här filen, spara.
 *   3. Ändra KONFIG nedan (minst NOTIFY_EMAILS).
 *   4. Kör funktionen  setup  en gång (godkänn behörigheter).
 *   5. Driftsätt → Ny driftsättning → Webbapp
 *        Kör som: Jag   ·   Åtkomst: Alla
 *   6. Kopiera webbapp-URL:en till LEADS_SCRIPT_URL i konsultation.html.
 */

// ===================== KONFIG =====================
var KONFIG = {
  GYM_NAME:        'Lerumsboxen',
  NOTIFY_EMAILS:   'info@lerumsboxen.se',  // kommaseparerat, får mejl vid varje nytt lead
  SEND_AUTOREPLY:  true,                   // bekräftelsemejl till den som anmält sig
  AUTOREPLY_FROM_NAME: 'Lerumsboxen',
  REMINDER_HOUR:   8,                      // daglig påminnelse kl 08
  RETENTION_MONTHS: 12,                    // avslutade leads anonymiseras efter X månader (GDPR)
  MIN_FILL_SECONDS: 3                      // spamskydd: formulär ifyllt snabbare än så = bot
};

var SHEET_LEADS    = 'Leads';
var SHEET_OVERVIEW = 'Översikt';

var COLS = [
  'ID', 'Inkommen', 'Namn', 'Telefon', 'E-post', 'Intresse', 'Bäst att nå',
  'Meddelande', 'Källa', 'Status', 'Ansvarig', 'Senast kontaktad',
  'Nästa uppföljning', 'Anteckningar'
];

var STATUSES = [
  'Ny',
  'Kontaktad',
  'Konsultation bokad',
  'Konsultation genomförd',
  'Blev medlem',
  'Ej intresserad',
  'Ingen kontakt'
];
var CLOSED_STATUSES = ['Blev medlem', 'Ej intresserad', 'Ingen kontakt'];

var STATUS_COLORS = {
  'Ny':                     '#fde2e4',
  'Kontaktad':              '#fff1c2',
  'Konsultation bokad':     '#dbeafe',
  'Konsultation genomförd': '#e0e7ff',
  'Blev medlem':            '#d1fae5',
  'Ej intresserad':         '#eeeeee',
  'Ingen kontakt':          '#eeeeee'
};

function col_(name) { return COLS.indexOf(name) + 1; }

// ===================== WEBBAPP =====================

function doGet() {
  return json_({ ok: true, service: 'leads' });
}

function doPost(e) {
  try {
    var d = parseBody_(e);

    // --- Spamskydd ---
    if (d.website) return json_({ ok: true });                         // honeypot ifylld → låtsas ok
    var started = Number(d.startedAt || 0);
    if (started && (Date.now() - started) / 1000 < KONFIG.MIN_FILL_SECONDS) {
      return json_({ ok: true });
    }

    // --- Validering ---
    var lead = {
      namn:      clean_(d.name, 100),
      telefon:   clean_(d.phone, 40),
      epost:     clean_(d.email, 120).toLowerCase(),
      intresse:  clean_(d.interest, 80),
      tid:       clean_(d.contactTime, 60),
      meddelande:clean_(d.message, 2000),
      kalla:     clean_(d.source, 200)
    };
    if (!lead.namn) return json_({ ok: false, error: 'Namn saknas' });
    if (!lead.telefon && !lead.epost) return json_({ ok: false, error: 'Ange telefon eller e-post' });
    if (lead.epost && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.epost)) {
      return json_({ ok: false, error: 'Ogiltig e-postadress' });
    }
    if (d.consent !== true && d.consent !== 'true' && d.consent !== 'on') {
      return json_({ ok: false, error: 'Samtycke krävs' });
    }

    // --- Dubblettskydd: samma kontakt inom 10 min ---
    var cache = CacheService.getScriptCache();
    var key = 'lead_' + Utilities.base64EncodeWebSafe(lead.epost + '|' + lead.telefon).slice(0, 200);
    if (cache.get(key)) return json_({ ok: true, duplicate: true });
    cache.put(key, '1', 600);

    // --- Spara ---
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    var id;
    try {
      var sh = getLeadsSheet_();
      id = nextId_(sh);
      var row = [];
      row[col_('ID') - 1]                = id;
      row[col_('Inkommen') - 1]          = new Date();
      row[col_('Namn') - 1]              = safe_(lead.namn);
      row[col_('Telefon') - 1]           = safe_(lead.telefon);
      row[col_('E-post') - 1]            = safe_(lead.epost);
      row[col_('Intresse') - 1]          = safe_(lead.intresse);
      row[col_('Bäst att nå') - 1]       = safe_(lead.tid);
      row[col_('Meddelande') - 1]        = safe_(lead.meddelande);
      row[col_('Källa') - 1]             = safe_(lead.kalla);
      row[col_('Status') - 1]            = 'Ny';
      row[col_('Ansvarig') - 1]          = '';
      row[col_('Senast kontaktad') - 1]  = '';
      row[col_('Nästa uppföljning') - 1] = '';
      row[col_('Anteckningar') - 1]      = '';
      sh.appendRow(row);
    } finally {
      lock.releaseLock();
    }

    // --- Mejl (fel här ska inte fälla anmälan) ---
    try { notifyStaff_(id, lead); } catch (err) { console.error('notifyStaff', err); }
    if (KONFIG.SEND_AUTOREPLY && lead.epost) {
      try { autoReply_(lead); } catch (err) { console.error('autoReply', err); }
    }

    return json_({ ok: true, id: id });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Serverfel – försök igen eller ring oss.' });
  }
}

function parseBody_(e) {
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (_) { /* föll igenom till form-data */ }
  }
  return (e && e.parameter) || {};
}

// ===================== MEJL =====================

function notifyStaff_(id, lead) {
  var url = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  var subject = 'Nytt lead #' + id + ': ' + lead.namn + (lead.intresse ? ' – ' + lead.intresse : '');
  var lines = [
    'Ny konsultationsförfrågan via hemsidan.',
    '',
    'Namn:        ' + lead.namn,
    'Telefon:     ' + (lead.telefon || '–'),
    'E-post:      ' + (lead.epost || '–'),
    'Intresse:    ' + (lead.intresse || '–'),
    'Bäst att nå: ' + (lead.tid || '–'),
    'Källa:       ' + (lead.kalla || '–'),
    '',
    'Meddelande:',
    lead.meddelande || '–',
    '',
    'Öppna CRM: ' + url
  ];
  var opts = { name: KONFIG.GYM_NAME + ' CRM' };
  if (lead.epost) opts.replyTo = lead.epost;
  MailApp.sendEmail(KONFIG.NOTIFY_EMAILS, subject, lines.join('\n'), opts);
}

function autoReply_(lead) {
  var first = lead.namn.split(' ')[0];
  var body = [
    'Hej ' + first + '!',
    '',
    'Tack för att du hört av dig till ' + KONFIG.GYM_NAME + '. Vi har tagit emot din förfrågan om en konsultation och återkommer till dig så snart vi kan, oftast inom ett dygn.',
    '',
    'Vill du nå oss innan dess? Svara bara på det här mejlet.',
    '',
    'Hälsningar,',
    KONFIG.GYM_NAME
  ].join('\n');
  MailApp.sendEmail(lead.epost, 'Tack! Vi hör av oss – ' + KONFIG.GYM_NAME, body, {
    name: KONFIG.AUTOREPLY_FROM_NAME,
    replyTo: KONFIG.NOTIFY_EMAILS.split(',')[0].trim()
  });
}

// ===================== PÅMINNELSER =====================

/** Körs dagligen: mejlar leads som väntat >24h eller har uppföljning idag/försenad. */
function dailyReminder() {
  var sh = getLeadsSheet_();
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return;

  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var uncontacted = [], followUps = [];

  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var status = r[col_('Status') - 1];
    if (CLOSED_STATUSES.indexOf(status) >= 0) continue;
    var label = '#' + r[col_('ID') - 1] + ' ' + r[col_('Namn') - 1] + ' – ' +
                (r[col_('Telefon') - 1] || r[col_('E-post') - 1]) + ' (' + status + ')';

    var inkommen = r[col_('Inkommen') - 1];
    if (status === 'Ny' && inkommen instanceof Date && now - inkommen > 24 * 3600 * 1000) {
      var days = Math.floor((now - inkommen) / (24 * 3600 * 1000));
      uncontacted.push(label + ', väntat ' + days + ' dag' + (days === 1 ? '' : 'ar'));
    }
    var next = r[col_('Nästa uppföljning') - 1];
    if (next instanceof Date && next <= today) {
      followUps.push(label + ', uppföljning ' + Utilities.formatDate(next, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
    }
  }

  if (!uncontacted.length && !followUps.length) return;

  var body = [];
  if (uncontacted.length) body.push('EJ KONTAKTADE (>24 h):', uncontacted.join('\n'), '');
  if (followUps.length)  body.push('UPPFÖLJNING IDAG / FÖRSENAD:', followUps.join('\n'), '');
  body.push('Öppna CRM: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());

  MailApp.sendEmail(
    KONFIG.NOTIFY_EMAILS,
    KONFIG.GYM_NAME + ' leads: ' + (uncontacted.length + followUps.length) + ' att ta hand om',
    body.join('\n'),
    { name: KONFIG.GYM_NAME + ' CRM' }
  );
}

/** GDPR: anonymiserar avslutade leads äldre än RETENTION_MONTHS. Statistiken (status, intresse, källa, datum) behålls. */
function anonymizeOldLeads() {
  var sh = getLeadsSheet_();
  var data = sh.getDataRange().getValues();
  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - KONFIG.RETENTION_MONTHS);
  var piiCols = ['Namn', 'Telefon', 'E-post', 'Meddelande', 'Anteckningar'];
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var status = r[col_('Status') - 1];
    if (status === 'Blev medlem') continue; // medlemmar finns i medlemsregistret; rensa manuellt vid behov
    if (CLOSED_STATUSES.indexOf(status) < 0) continue;
    var inkommen = r[col_('Inkommen') - 1];
    if (!(inkommen instanceof Date) || inkommen > cutoff) continue;
    if (r[col_('Namn') - 1] === '(anonymiserad)') continue;
    piiCols.forEach(function (c) {
      sh.getRange(i + 1, col_(c)).setValue(c === 'Namn' ? '(anonymiserad)' : '');
    });
    count++;
  }
  console.log('Anonymiserade ' + count + ' leads');
}

// ===================== AUTOMATIK I ARKET =====================

/** Enkel trigger: när status ändras från "Ny" sätts "Senast kontaktad" till idag om den är tom. */
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getName() !== SHEET_LEADS) return;
  if (e.range.getColumn() !== col_('Status') || e.range.getRow() < 2) return;
  var val = e.range.getValue();
  if (!val || val === 'Ny') return;
  var lastCell = sh.getRange(e.range.getRow(), col_('Senast kontaktad'));
  if (!lastCell.getValue()) lastCell.setValue(new Date());
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Leads')
    .addItem('Skicka påminnelse nu', 'dailyReminder')
    .addItem('Lägg till lead manuellt…', 'addLeadManually')
    .addSeparator()
    .addItem('Kör setup igen (formatering)', 'setup')
    .addItem('Installera dagliga triggers', 'installTriggers')
    .addToUi();
}

/** För leads som ringer eller kommer in direkt – lägger en tom rad med ID och datum. */
function addLeadManually() {
  var sh = getLeadsSheet_();
  var id = nextId_(sh);
  var row = COLS.map(function () { return ''; });
  row[col_('ID') - 1] = id;
  row[col_('Inkommen') - 1] = new Date();
  row[col_('Källa') - 1] = 'Manuellt';
  row[col_('Status') - 1] = 'Ny';
  sh.appendRow(row);
  sh.setActiveRange(sh.getRange(sh.getLastRow(), col_('Namn')));
}

// ===================== SETUP =====================

/** Kör en gång. Skapar flikar, rubriker, rullistor, färger och översikt. Säker att köra igen. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_LEADS) || ss.insertSheet(SHEET_LEADS, 0);

  // Rubriker
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS])
    .setFontWeight('bold').setBackground('#0b0b0d').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);

  var maxRows = Math.max(sh.getMaxRows(), 1000);
  if (sh.getMaxRows() < maxRows) sh.insertRowsAfter(sh.getMaxRows(), maxRows - sh.getMaxRows());
  var n = maxRows - 1;

  // Format
  sh.getRange(2, col_('Inkommen'), n, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sh.getRange(2, col_('Senast kontaktad'), n, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, col_('Nästa uppföljning'), n, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, col_('Telefon'), n, 1).setNumberFormat('@');
  sh.getRange(2, col_('Meddelande'), n, 1).setWrap(true);
  sh.getRange(2, col_('Anteckningar'), n, 1).setWrap(true);

  // Rullistor
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUSES, true).setAllowInvalid(false).build();
  sh.getRange(2, col_('Status'), n, 1).setDataValidation(statusRule);

  var dateRule = SpreadsheetApp.newDataValidation()
    .requireDate().setAllowInvalid(false).build();
  sh.getRange(2, col_('Senast kontaktad'), n, 1).setDataValidation(dateRule);
  sh.getRange(2, col_('Nästa uppföljning'), n, 1).setDataValidation(dateRule);

  // Färg per status (hela raden)
  var statusLetter = columnLetter_(col_('Status'));
  var full = sh.getRange(2, 1, n, COLS.length);
  var rules = STATUSES.map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + statusLetter + '2="' + s + '"')
      .setBackground(STATUS_COLORS[s]).setRanges([full]).build();
  });
  // Försenad uppföljning → röd text
  var nextLetter = columnLetter_(col_('Nästa uppföljning'));
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($' + nextLetter + '2<>"",$' + nextLetter + '2<=TODAY(),ISNA(MATCH($' +
      statusLetter + '2,{"Blev medlem";"Ej intresserad";"Ingen kontakt"},0)))')
    .setFontColor('#b0001a').setBold(true)
    .setRanges([sh.getRange(2, col_('Nästa uppföljning'), n, 1)]).build());
  sh.setConditionalFormatRules(rules);

  // Kolumnbredder
  var widths = { 'ID': 50, 'Inkommen': 130, 'Namn': 170, 'Telefon': 120, 'E-post': 200,
    'Intresse': 170, 'Bäst att nå': 110, 'Meddelande': 280, 'Källa': 140, 'Status': 170,
    'Ansvarig': 100, 'Senast kontaktad': 120, 'Nästa uppföljning': 130, 'Anteckningar': 300 };
  Object.keys(widths).forEach(function (k) { sh.setColumnWidth(col_(k), widths[k]); });

  if (!sh.getFilter()) sh.getRange(1, 1, maxRows, COLS.length).createFilter();

  buildOverview_(ss);

  // Ta bort tomt standardblad
  var blank = ss.getSheetByName('Blad1') || ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  ss.setActiveSheet(sh);
}

function buildOverview_(ss) {
  var ov = ss.getSheetByName(SHEET_OVERVIEW) || ss.insertSheet(SHEET_OVERVIEW);
  ov.clear();
  var L = "'" + SHEET_LEADS + "'!";
  var S = L + columnLetter_(col_('Status')) + ':' + columnLetter_(col_('Status'));
  var D = L + columnLetter_(col_('Inkommen')) + ':' + columnLetter_(col_('Inkommen'));
  var I = L + columnLetter_(col_('Intresse')) + ':' + columnLetter_(col_('Intresse'));
  var K = L + columnLetter_(col_('Källa')) + ':' + columnLetter_(col_('Källa'));

  var rows = [['LEADS – ÖVERSIKT', ''], ['', ''], ['Status', 'Antal']];
  STATUSES.forEach(function (s) { rows.push([s, '=COUNTIF(' + S + ',"' + s + '")']); });
  rows.push(['Totalt', '=COUNTA(' + S + ')-1']);
  rows.push(['', '']);
  rows.push(['Nyckeltal', '']);
  rows.push(['Konvertering till medlem', '=IFERROR(COUNTIF(' + S + ',"Blev medlem")/(COUNTA(' + S + ')-1),0)']);
  rows.push(['Leads senaste 30 dagar', '=COUNTIF(' + D + ',">="&TODAY()-30)']);
  rows.push(['Leads denna månad', '=COUNTIFS(' + D + ',">="&EOMONTH(TODAY(),-1)+1,' + D + ',"<="&EOMONTH(TODAY(),0)+1)']);
  rows.push(['Väntar på första kontakt', '=COUNTIF(' + S + ',"Ny")']);
  ov.getRange(1, 1, rows.length, 2).setValues(rows);

  var r0 = rows.length + 2;
  ov.getRange(r0, 1).setValue('Per intresse');
  ov.getRange(r0 + 1, 1).setFormula('=IFERROR(QUERY(' + L + 'A:N,"select ' + columnLetter_(col_('Intresse')) +
    ', count(' + columnLetter_(col_('ID')) + ') where ' + columnLetter_(col_('ID')) +
    ' is not null group by ' + columnLetter_(col_('Intresse')) + ' order by count(' + columnLetter_(col_('ID')) +
    ') desc label count(' + columnLetter_(col_('ID')) + ') \'Antal\'",1),"")');
  ov.getRange(r0, 4).setValue('Per källa');
  ov.getRange(r0 + 1, 4).setFormula('=IFERROR(QUERY(' + L + 'A:N,"select ' + columnLetter_(col_('Källa')) +
    ', count(' + columnLetter_(col_('ID')) + ') where ' + columnLetter_(col_('ID')) +
    ' is not null group by ' + columnLetter_(col_('Källa')) + ' order by count(' + columnLetter_(col_('ID')) +
    ') desc label count(' + columnLetter_(col_('ID')) + ') \'Antal\'",1),"")');

  ov.getRange('A1').setFontSize(14).setFontWeight('bold');
  ov.getRange('A3:B3').setFontWeight('bold');
  ov.getRange(4 + STATUSES.length, 1, 1, 2).setFontWeight('bold');
  ov.getRange(6 + STATUSES.length, 1).setFontWeight('bold');
  ov.getRange(7 + STATUSES.length, 2).setNumberFormat('0%');
  ov.getRange(r0, 1).setFontWeight('bold');
  ov.getRange(r0, 4).setFontWeight('bold');
  ov.setColumnWidth(1, 220); ov.setColumnWidth(2, 80); ov.setColumnWidth(4, 200);
}

/** Kör en gång efter setup: daglig påminnelse + månatlig GDPR-rensning. */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'dailyReminder' || f === 'anonymizeOldLeads') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyReminder').timeBased().everyDays(1).atHour(KONFIG.REMINDER_HOUR).create();
  ScriptApp.newTrigger('anonymizeOldLeads').timeBased().onMonthDay(1).atHour(3).create();
}

// ===================== HJÄLPARE =====================

function getLeadsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_LEADS);
  if (!sh) { setup(); sh = ss.getSheetByName(SHEET_LEADS); }
  return sh;
}

function nextId_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return 1;
  var ids = sh.getRange(2, col_('ID'), last - 1, 1).getValues();
  var max = 0;
  ids.forEach(function (r) { var v = Number(r[0]); if (v > max) max = v; });
  return max + 1;
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

/** Förhindrar formelinjektion i arket (värden som börjar med = + - @). */
function safe_(v) {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function columnLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
