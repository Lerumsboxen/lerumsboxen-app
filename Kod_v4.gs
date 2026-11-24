function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = JSON.parse(e.postData.contents);
  var action = data.action;
  var sheetName = data.sheet;

  if (action === "push") {
    var headers = data.headers;
    var rows    = data.rows;
    var sheet   = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    sheet.clearContents();
    sheet.appendRow(headers);
    rows.forEach(function(r) {
      sheet.appendRow(headers.map(function(h) { return r[h] !== undefined ? r[h] : ""; }));
    });
    return json({status: "ok", count: rows.length});
  }

  if (action === "pull") {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return json({rows: []});
    var vals = sheet.getDataRange().getValues();
    if (vals.length < 2) return json({rows: []});
    var hdrs = vals[0];
    var rows = vals.slice(1).map(function(row) {
      var obj = {};
      hdrs.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });
    return json({rows: rows});
  }

  if (action === "diagProgram") {
    var sheet = ss.getSheetByName(sheetName || "2026");
    if (!sheet) return json({error: "Sheet not found: " + (sheetName || "2026")});
    var vals = sheet.getDataRange().getValues();
    if (vals.length < 1) return json({headers: []});
    var hdrs = vals[0].map(function(h) { return (h+"").trim(); });
    var sampleRow = null;
    for (var i = 1; i < vals.length; i++) {
      var d = vals[i][1];
      if (d) { sampleRow = vals[i].map(function(c) { return (c+"").substring(0,30); }); break; }
    }
    return json({headers: hdrs, sampleRow: sampleRow, headerCount: hdrs.length});
  }

  if (action === "getProgram") {
    var sheet = ss.getSheetByName(sheetName || "2026");
    if (!sheet) return json({error: "Sheet not found: " + (sheetName || "2026")});
    var range = sheet.getDataRange();
    var vals = range.getValues();
    if (vals.length < 2) return json({program: {}});
    var cols = data.cols || {};
    var hdrs = vals[0].map(function(h) { return (h+"").toLowerCase().trim(); });
    var dateIdx     = (cols.date     >= 0) ? cols.date     : (hdrs.indexOf("date")     >= 0 ? hdrs.indexOf("date")     : 1);
    var strengthIdx = (cols.strength >= 0) ? cols.strength : (hdrs.indexOf("strength") >= 0 ? hdrs.indexOf("strength") : 2);
    var workoutIdx  = (cols.workout  >= 0) ? cols.workout  : (hdrs.indexOf("workout")  >= 0 ? hdrs.indexOf("workout")  : 3);
    var clubIdx     = (cols.club     >= 0) ? cols.club     : (hdrs.indexOf("club series simulation") >= 0 ? hdrs.indexOf("club series simulation") : 4);
    var hyroxIdx    = (cols.hyrox    >= 0) ? cols.hyrox    : (hdrs.indexOf("hyrox")    >= 0 ? hdrs.indexOf("hyrox")    : 5);
    var endurIdx    = (cols.endurance>= 0) ? cols.endurance: (hdrs.indexOf("endurance - hyrox") >= 0 ? hdrs.indexOf("endurance - hyrox") : 6);
    var olyIdx      = (cols.oly      >= 0) ? cols.oly      : (hdrs.indexOf("oly")      >= 0 ? hdrs.indexOf("oly")      : 7);

    var richVals = range.getRichTextValues();
    var fontWeights = null;
    try { fontWeights = range.getFontWeights(); } catch(e) {}
    var textStyles = null;
    try { textStyles = range.getTextStyles(); } catch(e) {}

    function richToHtml(richCell, cellWeight, cellStyle) {
      if (!richCell) return "";
      var text = richCell.getText();
      if (!text) return "";
      try {
        var runs = richCell.getRuns();
        if (!runs || runs.length === 0) return text;
        if (runs.length === 1) {
          var style = runs[0].getTextStyle();
          var bold = style && style.isBold && style.isBold();
          var italic = style && style.isItalic && style.isItalic();
          return text.split("\n").map(function(l) {
            if (!l) return "";
            if (bold && italic) return "<b><i>" + l + "</i></b>";
            if (bold) return "<b>" + l + "</b>";
            if (italic) return "<i>" + l + "</i>";
            return l;
          }).join("\n");
        }
        var html = "";
        runs.forEach(function(run) {
          var t = run.getText();
          if (!t) return;
          var style = run.getTextStyle();
          var bold = style && style.isBold && style.isBold();
          var italic = style && style.isItalic && style.isItalic();
          if (bold && italic) html += "<b><i>" + t + "</i></b>";
          else if (bold) html += "<b>" + t + "</b>";
          else if (italic) html += "<i>" + t + "</i>";
          else html += t;
        });
        return html || text;
      } catch(e) {
        return text;
      }
    }

    var tz = Session.getScriptTimeZone();
    var program = {};
    vals.slice(1).forEach(function(row, rowIdx) {
      var d = row[dateIdx];
      if (!d) return;
      var date = (d instanceof Date) ? d : new Date(d);
      if (isNaN(date.getTime())) return;
      var iso = Utilities.formatDate(date, tz, "yyyy-MM-dd");
      var richRow = richVals[rowIdx + 1];
      var styleRow = textStyles ? textStyles[rowIdx + 1] : null;
      var weightRow = fontWeights ? fontWeights[rowIdx + 1] : null;
      var strength = richRow ? richToHtml(richRow[strengthIdx], weightRow?weightRow[strengthIdx]:null, styleRow?styleRow[strengthIdx]:null) : (row[strengthIdx] || "").toString().trim();
      var workout  = richRow ? richToHtml(richRow[workoutIdx],  weightRow?weightRow[workoutIdx]:null,  styleRow?styleRow[workoutIdx]:null)  : (row[workoutIdx]  || "").toString().trim();
      var club     = richRow ? richToHtml(richRow[clubIdx],     weightRow?weightRow[clubIdx]:null,     styleRow?styleRow[clubIdx]:null)     : (row[clubIdx]     || "").toString().trim();
      var hyrox    = richRow ? richToHtml(richRow[hyroxIdx],    weightRow?weightRow[hyroxIdx]:null,    styleRow?styleRow[hyroxIdx]:null)    : (row[hyroxIdx]    || "").toString().trim();
      var endur    = richRow ? richToHtml(richRow[endurIdx],    weightRow?weightRow[endurIdx]:null,    styleRow?styleRow[endurIdx]:null)    : (row[endurIdx]    || "").toString().trim();
      var oly      = richRow ? richToHtml(richRow[olyIdx],      weightRow?weightRow[olyIdx]:null,      styleRow?styleRow[olyIdx]:null)      : (row[olyIdx]      || "").toString().trim();
      if (strength || workout || club || hyrox || endur || oly)
        program[iso] = {strength: strength, workout: workout, club: club, hyrox: hyrox, endurance: endur, oly: oly};
    });
    return json({program: program, colsUsed: {date:dateIdx,strength:strengthIdx,workout:workoutIdx,club:clubIdx,hyrox:hyroxIdx,endurance:endurIdx,oly:olyIdx}});
  }

  if (action === "getLBWLProgram") {
    var lbwlSheetName = data.lbwlSheet || "lbwl";
    var dwl2SheetName = data.dwl2Sheet || "2dwl";
    var result = {};

    function rtHtml(richCell) {
      if (!richCell) return "";
      var text = richCell.getText();
      if (!text) return "";
      try {
        var runs = richCell.getRuns();
        if (!runs || runs.length === 0) return text;
        if (runs.length === 1) {
          var s = runs[0].getTextStyle();
          var bold = s && s.isBold && s.isBold();
          var italic = s && s.isItalic && s.isItalic();
          return text.split("\n").map(function(l) {
            if (!l) return "";
            if (bold && italic) return "<b><i>" + l + "</i></b>";
            if (bold) return "<b>" + l + "</b>";
            if (italic) return "<i>" + l + "</i>";
            return l;
          }).join("\n");
        }
        var html = "";
        runs.forEach(function(run) {
          var t = run.getText(); if (!t) return;
          var s = run.getTextStyle();
          var bold = s && s.isBold && s.isBold();
          var italic = s && s.isItalic && s.isItalic();
          if (bold && italic) html += "<b><i>" + t + "</i></b>";
          else if (bold) html += "<b>" + t + "</b>";
          else if (italic) html += "<i>" + t + "</i>";
          else html += t;
        });
        return html || text;
      } catch(e) { return text; }
    }

    function readWLTab(tabName, numDays) {
      var sheet = ss.getSheetByName(tabName);
      if (!sheet) return null;
      var range = sheet.getDataRange();
      var vals = range.getValues();
      if (vals.length < 2) return {};
      var richVals = range.getRichTextValues();
      var weeks = {};
      vals.slice(1).forEach(function(row, rowIdx) {
        var week = (row[0] || "").toString().trim();
        if (!week) return;
        var richRow = richVals[rowIdx + 1];
        var entry = {};
        for (var d = 0; d < numDays; d++) {
          var content = richRow ? rtHtml(richRow[d + 1]) : (row[d + 1] || "").toString().trim();
          if (content) entry["day" + (d + 1)] = content;
        }
        if (Object.keys(entry).length > 0) weeks[week] = entry;
      });
      return weeks;
    }

    var lbwlData = readWLTab(lbwlSheetName, 3);
    var dwl2Data = readWLTab(dwl2SheetName, 2);
    if (lbwlData) result.lbwl    = lbwlData;
    if (dwl2Data) result["2dwl"] = dwl2Data;
    return json(result);
  }

  if (action === "ping") {
    return json({status: "ok"});
  }

  if (action === "sharePRs") {
    var memberName = data.memberName;
    var prs = data.prs || [];
    var tabName = "PRs_" + memberName.replace(/[^a-zA-Z0-9]/g, "_");
    var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
    sheet.clearContents();
    sheet.appendRow(["movement","value","unit","reps","date","notes"]);
    prs.forEach(function(pr) {
      sheet.appendRow([pr.movement||"", pr.value||"", pr.unit||"kg", pr.reps||"", pr.date||"", pr.notes||""]);
    });
    return json({status: "ok", count: prs.length});
  }

  if (action === "getMemberPRs") {
    var memberName = data.memberName;
    var tabName = "PRs_" + memberName.replace(/[^a-zA-Z0-9]/g, "_");
    var sheet = ss.getSheetByName(tabName);
    if (!sheet || sheet.getLastRow() < 2) return json({prs: []});
    var vals = sheet.getDataRange().getValues();
    var hdrs = vals[0];
    var prs = vals.slice(1).map(function(row) {
      var o = {}; hdrs.forEach(function(h,i){ o[h]=row[i]!==undefined?row[i].toString():""; }); return o;
    });
    return json({prs: prs});
  }

  if (action === "registerMember") {
    var sheet = ss.getSheetByName("Members") || ss.insertSheet("Members");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["firstName","surname","avatar","registered","lastSeen","admin","preview","lbwl","2dwl","progRef","email","rehabbot","photoUrl","mobility"]);
    }
    var firstName = data.firstName || "";
    var lastName  = data.lastName  || "";
    var fullName  = data.name      || (firstName + (lastName ? " " + lastName : "")).trim();
    var avatar    = data.avatar    || "💪";
    var email     = (data.email    || "").toString().toLowerCase().trim();
    var photoUrl  = (data.photoUrl || "").toString().trim();
    if (!fullName) return json({status: "ok"});
    var vals = sheet.getDataRange().getValues();
    var found = false;
    for (var r = 1; r < vals.length; r++) {
      var colC = (vals[r][2] || "").toString();
      var oldFmt = (vals[r][2] instanceof Date) || /^\d{4}-\d{2}-\d{2}T/.test(colC);
      var storedFullName = oldFmt
        ? vals[r][0].toString()
        : (vals[r][0].toString() + (vals[r][1] ? " " + vals[r][1].toString() : "")).trim();
      if (storedFullName === fullName) {
        if (oldFmt) {
          var oldAvatar   = vals[r][1] || "";
          var oldReg      = vals[r][2] || "";
          var oldLastSeen = vals[r][3] || "";
          var oldAdmin    = vals[r][4] || "";
          sheet.getRange(r+1, 1, 1, 11).setValues([[
            firstName || fullName.split(" ")[0] || fullName,
            lastName  || fullName.split(" ").slice(1).join(" ") || "",
            avatar || oldAvatar,
            oldReg,
            new Date().toISOString(),
            oldAdmin, "", "", "", "", email
          ]]);
        } else {
          sheet.getRange(r+1, 3).setValue(avatar);
          sheet.getRange(r+1, 5).setValue(new Date().toISOString());
          if (email) sheet.getRange(r+1, 11).setValue(email);
          if (photoUrl) sheet.getRange(r+1, 13).setValue(photoUrl);
        }
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([
        firstName || fullName.split(" ")[0] || fullName,
        lastName  || fullName.split(" ").slice(1).join(" ") || "",
        avatar, new Date().toISOString(), new Date().toISOString(), "", "", "", "", "", email, "", photoUrl
      ]);
    }
    return json({status: "ok"});
  }

  if (action === "getMembers") {
    var sheet = ss.getSheetByName("Members");
    if (!sheet || sheet.getLastRow() < 2) return json({members: []});
    var vals = sheet.getDataRange().getValues();
    var members = vals.slice(1).map(function(row) {
      var colC = (row[2] || "").toString();
      var oldFmt = (row[2] instanceof Date) || /^\d{4}-\d{2}-\d{2}T/.test(colC);
      var name, avatar, registered, lastSeen, adminFlag, previewFlag, lbwlFlag, dwl2Flag, rehabFlag, progRef, emailVal, photoUrlVal, mobilityFlag;
      if (oldFmt) {
        name = row[0].toString().trim();
        avatar = row[1]; registered = row[2]; lastSeen = row[3];
        adminFlag = row[4] && row[4].toString().toLowerCase().trim() === "admin";
        previewFlag = false; lbwlFlag = false; dwl2Flag = false; rehabFlag = false; progRef = ""; emailVal = ""; photoUrlVal = "";
      } else {
        var fn = row[0].toString().trim(), ln = row[1].toString().trim();
        name = (fn + (ln ? " " + ln : "")).trim();
        avatar = row[2]; registered = row[3]; lastSeen = row[4];
        adminFlag   = row[5] && row[5].toString().toLowerCase().trim() === "admin";
        previewFlag = row[6] && row[6].toString().toLowerCase().trim() === "preview";
        lbwlFlag    = row[7] && row[7].toString().toLowerCase().trim() === "lbwl";
        dwl2Flag    = row[8] && row[8].toString().toLowerCase().trim() === "2dwl";
        progRef     = row[9]  ? row[9].toString().trim()  : "";
        emailVal    = row[10] ? row[10].toString().toLowerCase().trim() : "";
        rehabFlag   = row[11] && row[11].toString().toLowerCase().trim() === "rehabbot";
        photoUrlVal = row[12] ? row[12].toString().trim() : "";
        mobilityFlag = row[13] && row[13].toString().toLowerCase().trim() === "mobility";
      }
      return {name: name, avatar: avatar, registered: registered, lastSeen: lastSeen,
              admin: adminFlag, preview: previewFlag, lbwl: lbwlFlag, "2dwl": dwl2Flag,
              rehabbot: rehabFlag, mobility: mobilityFlag || false, programRef: progRef, email: emailVal, photoUrl: photoUrlVal};
    }).filter(function(m) { return m.name; });
    return json({members: members});
  }

  if (action === "getIndividualProgram") {
    var tabName = (data.tab || "").toString().trim();
    if (!tabName) return json({error: "No tab name"});
    var ipSheet = ss.getSheetByName(tabName);
    if (!ipSheet) return json({error: "Tab not found: " + tabName});
    var ipRange = ipSheet.getDataRange();
    var ipVals = ipRange.getValues();
    var ipRich = ipRange.getRichTextValues();
    function ipRtHtml(richCell) {
      if (!richCell) return "";
      var text = richCell.getText();
      if (!text) return "";
      try {
        var runs = richCell.getRuns();
        if (!runs || runs.length === 0) return text;
        if (runs.length === 1) {
          var s = runs[0].getTextStyle();
          var bold = s && s.isBold && s.isBold();
          var italic = s && s.isItalic && s.isItalic();
          return text.split("\n").map(function(l) {
            if (!l) return "";
            if (bold && italic) return "<b><i>" + l + "</i></b>";
            if (bold) return "<b>" + l + "</b>";
            if (italic) return "<i>" + l + "</i>";
            return l;
          }).join("\n");
        }
        var html = "";
        runs.forEach(function(run) {
          var t = run.getText(); if (!t) return;
          var s = run.getTextStyle();
          var bold = s && s.isBold && s.isBold();
          var italic = s && s.isItalic && s.isItalic();
          if (bold && italic) html += "<b><i>" + t + "</i></b>";
          else if (bold) html += "<b>" + t + "</b>";
          else if (italic) html += "<i>" + t + "</i>";
          else html += t;
        });
        return html || text;
      } catch(e) { return text; }
    }
    var ipRows = [];
    for (var i = 1; i < ipVals.length; i++) {
      var r = ipVals[i];
      var rr = ipRich[i];
      var week = r[0] ? r[0].toString().trim() : "";
      var day  = r[1] ? r[1].toString().trim() : "";
      if (!week || !day) continue;
      ipRows.push({ week: week, day: day,
        strength:  rr ? ipRtHtml(rr[2]) : (r[2] ? r[2].toString().trim() : ""),
        wod:       rr ? ipRtHtml(rr[3]) : (r[3] ? r[3].toString().trim() : ""),
        accessory: rr ? ipRtHtml(rr[4]) : (r[4] ? r[4].toString().trim() : ""),
        notes:     rr ? ipRtHtml(rr[5]) : (r[5] ? r[5].toString().trim() : "") });
    }
    return json({rows: ipRows});
  }

  // ── saveIndividualProgram ─────────────────────────────────────────
  if (action === "saveIndividualProgram") {
    var memberName = (data.memberName || "").toString().trim();
    var tabRef     = (data.tabRef     || "").toString().trim();
    var rows       = data.rows || [];
    if (!tabRef) return json({error: "tabRef saknas"});
    if (!rows.length) return json({error: "Inga rader att spara"});

    var ipSheet = ss.getSheetByName(tabRef);
    if (!ipSheet) {
      ipSheet = ss.insertSheet(tabRef);
    } else {
      ipSheet.clearContents();
    }
    ipSheet.appendRow(["week","day","strength","wod","accessory"]);
    rows.forEach(function(r) {
      ipSheet.appendRow([r.week||"", r.day||"", r.strength||"", r.wod||"", r.accessory||""]);
    });

    // Update member's progRef column in Members sheet
    if (memberName) {
      var membersSheet = ss.getSheetByName("Members");
      if (membersSheet) {
        var mVals = membersSheet.getDataRange().getValues();
        for (var mi = 1; mi < mVals.length; mi++) {
          var fn = (mVals[mi][0] || "").toString().trim();
          var ln = (mVals[mi][1] || "").toString().trim();
          var fullName = ln ? fn + " " + ln : fn;
          if (fullName === memberName) {
            membersSheet.getRange(mi + 1, 10).setValue(tabRef); // col J = progRef
            break;
          }
        }
      }
    }
    return json({ok: true, tab: tabRef, rowCount: rows.length});
  }

  if (action === "saveAnthropicKey") {
    var keyVal = (data.key || "").toString().trim();
    var cfg = ss.getSheetByName("Config") || ss.insertSheet("Config");
    var cfgVals = cfg.getDataRange().getValues();
    var found = false;
    for (var ci = 0; ci < cfgVals.length; ci++) {
      if (cfgVals[ci][0] === "anthropic_key") { cfg.getRange(ci+1,2).setValue(keyVal); found = true; break; }
    }
    if (!found) cfg.appendRow(["anthropic_key", keyVal]);
    return json({status: "ok"});
  }

  if (action === "getAnthropicKey") {
    var cfg = ss.getSheetByName("Config");
    if (!cfg) return json({key: ""});
    var cfgVals = cfg.getDataRange().getValues();
    for (var ci = 0; ci < cfgVals.length; ci++) {
      if (cfgVals[ci][0] === "anthropic_key") return json({key: cfgVals[ci][1] ? cfgVals[ci][1].toString().trim() : ""});
    }
    return json({key: ""});
  }

  if (action === "debugCell") {
    var sheet = ss.getSheetByName(sheetName || "2026");
    if (!sheet) return json({error: "Sheet not found"});
    var rowNum = data.row || 91;
    var colNum = data.col || 3;
    var cell = sheet.getRange(rowNum, colNum);
    var richCell = cell.getRichTextValue();
    var result = {
      value: cell.getValue().toString().substring(0, 200),
      fontWeight: cell.getFontWeight(),
      fontWeightRange: (function(){ try { return sheet.getRange(rowNum,colNum).getFontWeights()[0][0]; } catch(e){ return "err:"+e; } })(),
      textStyleBold: (function(){ try { var s=cell.getTextStyle(); return s?s.isBold():"null"; } catch(e){ return "err:"+e; } })(),
      richText: richCell ? richCell.getText().substring(0,100) : "null",
      richRuns: (function(){
        if(!richCell) return [];
        try {
          return richCell.getRuns().map(function(r){
            var s=r.getTextStyle();
            return {text: r.getText().substring(0,30), bold: s?s.isBold():"null"};
          });
        } catch(e){ return ["err:"+e]; }
      })()
    };
    return json(result);
  }

  if (action === "sendChallenge") {
    var sheet = ss.getSheetByName("Challenges") || ss.insertSheet("Challenges");
    if (sheet.getLastRow() === 0) sheet.appendRow(["id","name","from","to","desc","type","deadline","message","date"]);
    var c = data.challenge;
    sheet.appendRow([c.id||"",c.name||"",c.from||"",c.to||"",c.desc||"",c.type||"",c.deadline||"",c.message||"",c.date||""]);
    return json({status: "ok"});
  }

  if (action === "getChallenges") {
    var sheet = ss.getSheetByName("Challenges");
    if (!sheet || sheet.getLastRow() < 2) return json({challenges: []});
    var vals = sheet.getDataRange().getValues();
    var hdrs = vals[0];
    var rows = vals.slice(1).map(function(row) {
      var o = {}; hdrs.forEach(function(h,i){ o[h]=row[i]!==undefined?row[i].toString():""; }); return o;
    });
    return json({challenges: rows});
  }

  if (action === "shareResult") {
    var sheet = ss.getSheetByName("Leaderboard") || ss.insertSheet("Leaderboard");
    if (sheet.getLastRow() === 0) sheet.appendRow(["id","type","memberName","avatar","name","exercise","date","score","rx","topWeight","topReps","desc"]);
    var e = data.entry;
    if (data.deleted) {
      var vals = sheet.getDataRange().getValues();
      for (var r = vals.length - 1; r >= 1; r--) {
        if (vals[r][0] == e.id) { sheet.deleteRow(r + 1); break; }
      }
      return json({status: "ok", action: "deleted"});
    }
    var vals = sheet.getDataRange().getValues();
    var found = false;
    for (var r = 1; r < vals.length; r++) {
      if (vals[r][0] == e.id) {
        sheet.getRange(r+1,1,1,12).setValues([[e.id||"",data.type||"",e.memberName||"",e.avatar||"",e.name||"",e.exercise||"",e.date||"",e.score||"",e.rx||"",e.topWeight||"",e.topReps||"",e.desc||""]]);
        found = true; break;
      }
    }
    if (!found) sheet.appendRow([e.id||"",data.type||"",e.memberName||"",e.avatar||"",e.name||"",e.exercise||"",e.date||"",e.score||"",e.rx||"",e.topWeight||"",e.topReps||"",e.desc||""]);
    return json({status: "ok"});
  }

  if (action === "getLeaderboard") {
    var sheet = ss.getSheetByName("Leaderboard");
    if (!sheet || sheet.getLastRow() < 2) return json({wods:[],strength:[]});
    var vals = sheet.getDataRange().getValues();
    var hdrs = vals[0];
    var rows = vals.slice(1).map(function(row) {
      var o = {}; hdrs.forEach(function(h,i){ o[h]=row[i]!==undefined?row[i].toString():""; }); return o;
    });
    return json({wods:rows.filter(function(r){return r.type==="wod";}),strength:rows.filter(function(r){return r.type==="strength";})});
  }

  if (action === "cloudPush") {
    var memberName = data.memberName;
    var type = data.type;
    var item = data.item;
    var deleted = data.deleted || false;
    var tabName = "Cloud_" + memberName.replace(/[^a-zA-Z0-9]/g,"_");
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) { sheet = ss.insertSheet(tabName); sheet.appendRow(["id","type","data_json","deleted","updated_at"]); }
    var vals = sheet.getDataRange().getValues();
    var found = false;
    for (var r = 1; r < vals.length; r++) {
      if (vals[r][0] == item.id && vals[r][1] == type) {
        sheet.getRange(r+1,3).setValue(JSON.stringify(item));
        sheet.getRange(r+1,4).setValue(deleted?"1":"0");
        sheet.getRange(r+1,5).setValue(new Date().toISOString());
        found = true; break;
      }
    }
    if (!found) sheet.appendRow([item.id,type,JSON.stringify(item),deleted?"1":"0",new Date().toISOString()]);
    return json({status:"ok"});
  }

  if (action === "cloudPull") {
    var memberName = data.memberName;
    var tabName = "Cloud_" + memberName.replace(/[^a-zA-Z0-9]/g,"_");
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) return json({wods:[],strength:[],prs:[]});
    var vals = sheet.getDataRange().getValues();
    var wods=[],strength=[],prs=[],conditioning=[];
    for (var r = 1; r < vals.length; r++) {
      if (vals[r][3]=="1") continue;
      try {
        var item = JSON.parse(vals[r][2]);
        var type = vals[r][1];
        if (type==="wod") wods.push(item);
        else if (type==="strength") strength.push(item);
        else if (type==="pr") prs.push(item);
        else if (type==="conditioning") conditioning.push(item);
      } catch(e) {}
    }
    return json({wods:wods,strength:strength,prs:prs,conditioning:conditioning});
  }

  if (action === "getCustomMovements") {
    var cmSheet = ss.getSheetByName(data.sheet || "CustomMovements");
    if (!cmSheet) return json({movements: [], error: "Sheet '" + (data.sheet || "CustomMovements") + "' not found"});
    var lastRow = cmSheet.getLastRow();
    if (lastRow < 2) return json({movements: []});
    var numCols = Math.max(cmSheet.getLastColumn(), 4);
    var vals = cmSheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    var movements = [];
    vals.forEach(function(r) {
      var name = (r[0]||"").toString().trim();
      if (!name) return;
      var unit = (r[1]||"").toString().trim();
      var defaultVal = (r[2]||"").toString().trim();
      var category = (r[3]||"").toString().trim();
      movements.push({ name: name, unit: unit, defaultValue: defaultVal, category: category });
    });
    return json({movements: movements});
  }

  if (action === "loginWithGoogle") {
    return json(loginWithGoogle(data));
  }

  if (action === "linkGoogleAccount") {
    return json(linkGoogleAccount(data));
  }

  if (action === "checkRehabAccess") {
    return json(checkRehabAccess(data));
  }

  if (action === "uploadProfilePhoto") {
    return json(uploadProfilePhoto_(data));
  }

  if (action === "saveStripeConfig") {
    return json(saveStripeConfig_(data));
  }

  if (action === "createCheckoutSession") {
    return json(createCheckoutSession_(data));
  }

  if (action === "verifyStripePayment") {
    return json(verifyStripePayment_(data));
  }

  if (action === "createBillingPortalSession") {
    return json(createBillingPortalSession_(data));
  }

  if (action === "saveSlidesConfig") {
    return json(saveSlidesConfig_(data));
  }

  if (action === "triggerWeeklySlides") {
    return json(triggerWeeklySlides_(data));
  }

  return json({error: "Unknown action"});
}

function doGet(e) { return doPost(e); }

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Google token verification helper ─────────────────────────────────────────

function verifyGoogleToken_(credential) {
  var info = JSON.parse(UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + credential
  ).getContentText());
  if (!info.email || info.email_verified !== 'true') throw new Error('Invalid token');
  return { email: info.email.toLowerCase(), name: info.name || '', given_name: info.given_name || '', family_name: info.family_name || '' };
}

// ── loginWithGoogle ───────────────────────────────────────────────────────────

function loginWithGoogle(payload) {
  try {
    var info = verifyGoogleToken_(payload.credential);
    var email = info.email;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');
    if (!sheet) return { found: false, members: [], googleName: info.name };
    var vals = sheet.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      var rowEmail = (vals[i][10] || '').toString().toLowerCase().trim();
      if (rowEmail === email) {
        var fn = vals[i][0].toString().trim(), ln = vals[i][1].toString().trim();
        return {
          found: true,
          member: {
            firstName:  fn,
            lastName:   ln,
            name:       (fn + (ln ? ' ' + ln : '')).trim(),
            avatar:     vals[i][2] ? vals[i][2].toString() : '💪',
            email:      email,
            admin:      vals[i][5] && vals[i][5].toString().toLowerCase().trim() === 'admin',
            preview:    vals[i][6] && vals[i][6].toString().toLowerCase().trim() === 'preview',
            lbwl:       vals[i][7] && vals[i][7].toString().toLowerCase().trim() === 'lbwl',
            lbwl2:      vals[i][8] && vals[i][8].toString().toLowerCase().trim() === '2dwl',
            rehabbot:   vals[i][11] && vals[i][11].toString().toLowerCase().trim() === 'rehabbot',
            photoUrl:   vals[i][12] ? vals[i][12].toString().trim() : '',
            mobility:   vals[i][13] && vals[i][13].toString().toLowerCase().trim() === 'mobility'
          }
        };
      }
    }
    var members = vals.slice(1).map(function(row) {
      var fn = row[0].toString().trim(), ln = row[1].toString().trim();
      return { name: (fn + (ln ? ' ' + ln : '')).trim(), avatar: row[2] ? row[2].toString() : '💪' };
    }).filter(function(m) { return m.name; });
    return { found: false, members: members, googleName: info.name };
  } catch(e) {
    return { found: false, error: e.message };
  }
}

// ── linkGoogleAccount ─────────────────────────────────────────────────────────

function linkGoogleAccount(payload) {
  try {
    var info = verifyGoogleToken_(payload.credential);
    var email = info.email;
    var memberName = (payload.memberName || '').trim();
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');
    if (!sheet) return { status: 'error', error: 'Members sheet missing' };
    var vals = sheet.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      var fn = vals[i][0].toString().trim(), ln = vals[i][1].toString().trim();
      var name = (fn + (ln ? ' ' + ln : '')).trim();
      if (name === memberName) {
        sheet.getRange(i + 1, 11).setValue(email);
        return { status: 'ok' };
      }
    }
    return { status: 'error', error: 'Member not found: ' + memberName };
  } catch(e) {
    return { status: 'error', error: e.message };
  }
}

// ── checkRehabAccess ──────────────────────────────────────────────────────────

function checkRehabAccess(payload) {
  try {
    var info = verifyGoogleToken_(payload.credential);
    var email = info.email;
    var ss2 = SpreadsheetApp.getActiveSpreadsheet();
    var membersSheet = ss2.getSheetByName('Members');
    if (membersSheet) {
      var mVals = membersSheet.getDataRange().getValues();
      for (var i = 1; i < mVals.length; i++) {
        var rowEmail = (mVals[i][10] || '').toString().toLowerCase().trim();
        if (rowEmail === email) {
          var rehabCol = (mVals[i][11] || '').toString().toLowerCase().trim();
          if (rehabCol === 'rehabbot') return { access: true };
          break;
        }
      }
    }
    var legacySheet = ss2.getSheetByName('RehabMembers');
    if (legacySheet) {
      var rows = legacySheet.getDataRange().getValues();
      for (var j = 1; j < rows.length; j++) {
        if ((rows[j][0] + '').toLowerCase().trim() === email && rows[j][1] === true) {
          return { access: true };
        }
      }
    }
    return { access: false };
  } catch(e) {
    return { access: false, error: e.message };
  }
}

// ── uploadProfilePhoto_ ───────────────────────────────────────────────────────

function uploadProfilePhoto_(data) {
  var memberName = (data.memberName || '').trim();
  var base64DataUrl = data.base64 || '';
  if (!memberName || !base64DataUrl) return { error: 'memberName och base64 krävs' };

  var match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { error: 'Ogiltig base64-dataURL' };
  var contentType = match[1];
  var base64Data = match[2];

  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, memberName + '.jpg');

  var folderName = 'LBWT Profile Photos';
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

  var ss2 = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss2.getSheetByName('Members');
  var existingUrl = '';
  var memberRowIndex = -1;
  if (sheet) {
    var vals = sheet.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      var fn = vals[i][0].toString().trim(), ln = vals[i][1].toString().trim();
      var name = (fn + (ln ? ' ' + ln : '')).trim();
      if (name === memberName) {
        existingUrl = vals[i][12] ? vals[i][12].toString().trim() : '';
        memberRowIndex = i;
        break;
      }
    }
  }

  if (existingUrl) {
    try {
      var oldIdMatch = existingUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (!oldIdMatch) oldIdMatch = existingUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (oldIdMatch) DriveApp.getFileById(oldIdMatch[1]).setTrashed(true);
    } catch(e) {}
  }

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var fileId = file.getId();
  var url = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400';

  if (sheet && memberRowIndex > 0) {
    sheet.getRange(memberRowIndex + 1, 13).setValue(url);
  }

  return { url: url };
}

// ── Config helper ─────────────────────────────────────────────────────────────

function getConfigValue_(cfg, key) {
  if (!cfg) return null;
  var vals = cfg.getDataRange().getValues();
  for (var i = 0; i < vals.length; i++) {
    if ((vals[i][0] || '').toString().trim() === key) {
      return vals[i][1] ? vals[i][1].toString().trim() : null;
    }
  }
  return null;
}

function setConfigValue_(cfg, cfgVals, key, value) {
  for (var i = 0; i < cfgVals.length; i++) {
    if ((cfgVals[i][0] || '').toString().trim() === key) {
      cfg.getRange(i + 1, 2).setValue(value);
      cfgVals[i][1] = value;
      return;
    }
  }
  cfg.appendRow([key, value]);
  cfgVals.push([key, value]);
}

// ── createBillingPortalSession_ ───────────────────────────────────────────────

function createBillingPortalSession_(data) {
  var ss2 = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = ss2.getSheetByName('Config');
  if (!cfg) return { error: 'Config-fliken saknas' };

  var stripeKey = getConfigValue_(cfg, 'stripe_key');
  if (!stripeKey) return { error: 'Stripe Secret Key saknas' };

  var memberEmail = (data.memberEmail || '').toString().toLowerCase().trim();
  if (!memberEmail) return { error: 'E-postadress saknas' };

  var returnUrl = (data.returnUrl || '').toString();

  try {
    var searchResp = UrlFetchApp.fetch('https://api.stripe.com/v1/customers/search?query=email:"' + memberEmail + '"&limit=1', {
      headers: { 'Authorization': 'Bearer ' + stripeKey },
      muteHttpExceptions: true
    });
    var searchResult = JSON.parse(searchResp.getContentText());
    if (searchResult.error) return { error: searchResult.error.message || 'Stripe-fel vid kundsökning' };

    var customers = searchResult.data || [];
    if (!customers.length) return { error: 'Ingen Stripe-kund hittades för ' + memberEmail };
    var customerId = customers[0].id;

    var portalBody = 'customer=' + encodeURIComponent(customerId);
    if (returnUrl) portalBody += '&return_url=' + encodeURIComponent(returnUrl);
    var portalResp = UrlFetchApp.fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + stripeKey },
      payload: portalBody,
      muteHttpExceptions: true
    });
    var portal = JSON.parse(portalResp.getContentText());
    if (portal.error) return { error: portal.error.message || 'Stripe-fel vid portalskapande' };
    return { url: portal.url };
  } catch(e) {
    return { error: 'Nätverksfel: ' + e.message };
  }
}

// ── saveSlidesConfig_ ─────────────────────────────────────────────────────────

function saveSlidesConfig_(data) {
  var ss2 = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = ss2.getSheetByName('Config') || ss2.insertSheet('Config');
  var cfgVals = cfg.getDataRange().getValues();
  if (data.slidesWebhookUrl)    setConfigValue_(cfg, cfgVals, 'slides_webhook_url',    data.slidesWebhookUrl);
  if (data.slidesWebhookSecret) setConfigValue_(cfg, cfgVals, 'slides_webhook_secret', data.slidesWebhookSecret);
  return { ok: true };
}

// ── triggerWeeklySlides_ ──────────────────────────────────────────────────────

function triggerWeeklySlides_(data) {
  var ss2 = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = ss2.getSheetByName('Config');
  if (!cfg) return { error: 'Config-fliken saknas' };

  var webhookUrl = getConfigValue_(cfg, 'slides_webhook_url');
  if (!webhookUrl) return { error: 'Slides webhook URL saknas. Konfigurera i Admin.' };

  var secret = getConfigValue_(cfg, 'slides_webhook_secret') || '';

  try {
    var resp = UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ secret: secret, isoMonday: data.isoMonday || null }),
      muteHttpExceptions: true
    });
    var result = JSON.parse(resp.getContentText());
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

// ── saveStripeConfig_ ─────────────────────────────────────────────────────────

function saveStripeConfig_(data) {
  var ss2 = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = ss2.getSheetByName('Config') || ss2.insertSheet('Config');
  var cfgVals = cfg.getDataRange().getValues();
  if (data.stripeKey)             setConfigValue_(cfg, cfgVals, 'stripe_key',                      data.stripeKey);
  if (data.priceLbwl)             setConfigValue_(cfg, cfgVals, 'stripe_price_lbwl',               data.priceLbwl);
  if (data.price2dwl)             setConfigValue_(cfg, cfgVals, 'stripe_price_2dwl',               data.price2dwl);
  if (data.priceRehab)            setConfigValue_(cfg, cfgVals, 'stripe_price_rehab',              data.priceRehab);
  if (data.priceMobility)         setConfigValue_(cfg, cfgVals, 'stripe_price_mobility',           data.priceMobility);
  if (data.priceIndividualProgram) setConfigValue_(cfg, cfgVals, 'stripe_price_individualprogram', data.priceIndividualProgram);
  return { status: 'ok' };
}

// ── createCheckoutSession_ ────────────────────────────────────────────────────

function createCheckoutSession_(data) {
  var ss2 = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = ss2.getSheetByName('Config');
  if (!cfg) return { error: 'Config-fliken saknas. Spara Stripe-nycklarna under Admin → Stripe.' };

  var stripeKey = getConfigValue_(cfg, 'stripe_key');
  if (!stripeKey) return { error: 'Stripe Secret Key saknas. Admins: gå till Sync-inställningar → Stripe.' };

  var product = (data.product || '').toString().trim();
  var priceMap = {
    lbwl:              'stripe_price_lbwl',
    '2dwl':            'stripe_price_2dwl',
    rehab:             'stripe_price_rehab',
    mobility:          'stripe_price_mobility',
    individualprogram: 'stripe_price_individualprogram'
  };
  var priceKey = priceMap[product];
  if (!priceKey) return { error: 'Okänd produkt: ' + product };

  var priceId = getConfigValue_(cfg, priceKey);
  if (!priceId) return { error: 'Price ID för ' + product + ' saknas. Konfigurera i Admin → Stripe.' };

  var memberName  = (data.memberName  || '').toString().trim();
  var memberEmail = (data.memberEmail || '').toString().trim();
  var successUrl  = (data.successUrl  || '').toString();
  var cancelUrl   = (data.cancelUrl   || '').toString();

  var isSubscription = (product === 'rehab' || product === 'mobility');

  var params = {
    'mode': isSubscription ? 'subscription' : 'payment',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'success_url': successUrl,
    'cancel_url': cancelUrl,
    'metadata[memberName]': memberName,
    'metadata[memberEmail]': memberEmail,
    'metadata[product]': product
  };

  // Pass intake form data as metadata for individualprogram
  if (product === 'individualprogram') {
    var intakeFields = ['goal','daysPerWeek','programWeeks','maxSquat','maxDeadlift','maxBench','maxClean','maxSnatch','notes'];
    intakeFields.forEach(function(f) {
      if (data[f] !== undefined && data[f] !== null && data[f] !== '') {
        // Stripe metadata values max 500 chars
        params['metadata[' + f + ']'] = String(data[f]).substring(0, 500);
      }
    });
  }

  if (memberEmail) params['customer_email'] = memberEmail;

  var body = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');

  try {
    var resp = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + stripeKey },
      payload: body,
      muteHttpExceptions: true
    });
    var result = JSON.parse(resp.getContentText());
    if (result.error) return { error: result.error.message || 'Stripe-fel' };
    return { url: result.url, sessionId: result.id };
  } catch(e) {
    return { error: 'Nätverksfel: ' + e.message };
  }
}

// ── verifyStripePayment_ ──────────────────────────────────────────────────────

function verifyStripePayment_(data) {
  var sessionId = (data.sessionId || '').toString().trim();
  if (!sessionId) return { error: 'sessionId saknas' };

  var ss2 = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = ss2.getSheetByName('Config');
  if (!cfg) return { error: 'Config-fliken saknas' };

  var stripeKey = getConfigValue_(cfg, 'stripe_key');
  if (!stripeKey) return { error: 'Stripe Secret Key saknas' };

  try {
    var resp = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions/' + sessionId, {
      headers: { 'Authorization': 'Bearer ' + stripeKey },
      muteHttpExceptions: true
    });
    var session = JSON.parse(resp.getContentText());
    if (session.error) return { error: session.error.message || 'Stripe-fel' };

    var paid = session.payment_status === 'paid' || session.status === 'complete';
    if (!paid) return { error: 'Betalning ej genomförd', status: session.payment_status };

    var meta = session.metadata || {};
    var product    = (meta.product    || data.product    || '').toString().trim();
    var memberName = (meta.memberName || data.memberName || '').toString().trim();
    var memberEmail = (meta.memberEmail || data.memberEmail || '').toString().toLowerCase().trim();

    // ── Individuellt Program: store request + send email, don't modify Members ──
    if (product === 'individualprogram') {
      var reqSheet = ss2.getSheetByName('ProgramRequests');
      if (!reqSheet) {
        reqSheet = ss2.insertSheet('ProgramRequests');
        reqSheet.appendRow(['memberName','memberEmail','goal','daysPerWeek','programWeeks',
                            'maxSquat','maxDeadlift','maxBench','maxClean','maxSnatch',
                            'notes','requestedAt','sessionId','status']);
      }
      var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
      reqSheet.appendRow([
        memberName,
        memberEmail,
        meta.goal         || '',
        meta.daysPerWeek  || '',
        meta.programWeeks || '',
        meta.maxSquat     || '',
        meta.maxDeadlift  || '',
        meta.maxBench     || '',
        meta.maxClean     || '',
        meta.maxSnatch    || '',
        meta.notes        || '',
        now,
        sessionId,
        'pending'
      ]);

      // Send notification email
      var goalLabels = {
        crossfit:     'CrossFit Komplement',
        styrka:       'Styrka (Powerlifting)',
        hypertrofi:   'Hypertrofi',
        powerbuilding:'Powerbuilding'
      };
      var goalLabel = goalLabels[meta.goal] || meta.goal || '—';
      var prs = [];
      if (meta.maxSquat)    prs.push('Squat: '    + meta.maxSquat    + ' kg');
      if (meta.maxDeadlift) prs.push('Deadlift: ' + meta.maxDeadlift + ' kg');
      if (meta.maxBench)    prs.push('Bench: '    + meta.maxBench    + ' kg');
      if (meta.maxClean)    prs.push('Clean: '    + meta.maxClean    + ' kg');
      if (meta.maxSnatch)   prs.push('Snatch: '   + meta.maxSnatch   + ' kg');

      var emailBody =
        '<h2 style="font-family:sans-serif;color:#a78bfa;">Ny beställning: Individuellt Program</h2>' +
        '<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;">' +
        '<tr><td style="padding:4px 12px 4px 0;color:#888;">Namn</td><td><strong>' + memberName + '</strong></td></tr>' +
        '<tr><td style="padding:4px 12px 4px 0;color:#888;">E-post</td><td>' + memberEmail + '</td></tr>' +
        '<tr><td style="padding:4px 12px 4px 0;color:#888;">Mål</td><td>' + goalLabel + '</td></tr>' +
        '<tr><td style="padding:4px 12px 4px 0;color:#888;">Pass/vecka</td><td>' + (meta.daysPerWeek || '—') + '</td></tr>' +
        '<tr><td style="padding:4px 12px 4px 0;color:#888;">Programlängd</td><td>' + (meta.programWeeks || '—') + ' veckor</td></tr>' +
        '<tr><td style="padding:4px 12px 4px 0;color:#888;vertical-align:top;">Max-lyft</td><td>' + (prs.length ? prs.join('<br>') : '—') + '</td></tr>' +
        '<tr><td style="padding:4px 12px 4px 0;color:#888;vertical-align:top;">Skador/noter</td><td>' + (meta.notes || '—') + '</td></tr>' +
        '</table>' +
        '<p style="font-family:sans-serif;font-size:13px;color:#888;margin-top:16px;">' +
        'Öppna appen → Programmering → Individual Programs → <strong>' + memberName + '</strong> → ✦ Ny för att generera programmet.' +
        '</p>';

      try {
        GmailApp.sendEmail(
          'calle@lerumsboxen.com',
          '📋 Individuellt program beställt av ' + memberName,
          'Ny beställning från ' + memberName + ' (' + memberEmail + ').\n\nMål: ' + goalLabel +
          '\nPass/vecka: ' + (meta.daysPerWeek||'—') + '\nProgramlängd: ' + (meta.programWeeks||'—') + ' veckor' +
          '\nMax-lyft: ' + (prs.length ? prs.join(', ') : '—') +
          '\nNoter: ' + (meta.notes || '—'),
          { htmlBody: emailBody, name: 'Lerumsboxen App' }
        );
      } catch(mailErr) {
        // Email failure is non-fatal — payment is still verified
      }

      return { status: 'ok', product: product, memberName: memberName };
    }

    // ── All other products: write flag to Members sheet ───────────────────────
    var membersSheet = ss2.getSheetByName('Members');
    if (!membersSheet) return { error: 'Members-fliken saknas' };
    var mVals = membersSheet.getDataRange().getValues();

    var colIndex, colValue;
    if (product === 'rehab') {
      colIndex = 12; colValue = 'rehabbot';
    } else if (product === 'lbwl') {
      colIndex = 8;  colValue = 'lbwl';
    } else if (product === '2dwl') {
      colIndex = 9;  colValue = '2dwl';
    } else if (product === 'mobility') {
      colIndex = 14; colValue = 'mobility';
    } else {
      return { error: 'Okänd produkt: ' + product };
    }

    var updated = false;
    for (var mi = 1; mi < mVals.length; mi++) {
      var fn = (mVals[mi][0] || '').toString().trim();
      var ln = (mVals[mi][1] || '').toString().trim();
      var fullName = ln ? fn + ' ' + ln : fn;
      if (fullName.trim() === memberName) {
        membersSheet.getRange(mi + 1, colIndex).setValue(colValue);
        updated = true;
        break;
      }
    }
    if (!updated) return { error: 'Ingen medlem hittades med namn: ' + memberName };

    return { status: 'ok', product: product, memberName: memberName };

  } catch(e) {
    return { error: 'Verifieringsfel: ' + e.message };
  }
}
