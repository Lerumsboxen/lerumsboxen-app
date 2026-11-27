# Lerumsboxen Leads-CRM

Den som googlar Lerumsboxen hamnar på **konsultation.html** och fyller i sina kontaktuppgifter. Leadet sparas i ett Google Sheet som fungerar som CRM, och ni får ett mejl direkt.

```
Google-sökning → konsultation.html → Apps Script (webbapp) → Google Sheet "Lerumsboxen Leads"
                                                            ├→ mejl till er
                                                            └→ bekräftelsemejl till leadet
```

## Installation (ca 10 min)

1. **Skapa arket.** Öppna sheets.new och döp det till *Lerumsboxen Leads*. Använd ett eget ark, inte medlemsarket.
2. **Lägg in scriptet.** Gå till *Tillägg → Apps Script*, ta bort det som står där och klistra in hela `Leads_AppsScript.gs`.
3. **Ändra KONFIG** överst i filen. Sätt `NOTIFY_EMAILS` till den adress som ska få leads, och flera adresser får separeras med kommatecken.
4. **Kör `setup`.** Välj funktionen i listan och klicka Kör, och godkänn sedan behörigheterna. Det skapar flikarna *Leads* och *Översikt*.
5. **Kör `installTriggers`.** Det ger en daglig påminnelse kl 08 och en månatlig GDPR-rensning.
6. **Driftsätt.** Välj *Driftsätt → Ny driftsättning → Webbapp*, sätt *Kör som: Jag* och *Åtkomst: Alla*, och kopiera URL:en.
7. **Koppla formuläret.** Klistra in URL:en i `LEADS_SCRIPT_URL` i `konsultation.html` och publicera sidan.
8. **Testa.** Skicka in ett test-lead och kontrollera att det dyker upp i arket och att mejlet kommer fram.

> Om ni ändrar scriptet senare väljer ni *Driftsätt → Hantera driftsättningar → Redigera → Ny version*, så behåller ni samma URL.

## CRM-appen (tavla för mobil och dator)

`App.html` är en app ovanpå arket. Den visar leads som kort i kolumner per status. Allt sparas fortfarande i arket.

- **Flytta ett lead:** dra kortet till en annan kolumn. På mobilen håller du fingret på kortet en kort stund och drar det till en flik högst upp. Du kan också trycka på en status i kortet.
- **Öppna kortet:** tryck på ett namn. Där finns kontaktuppgifter och meddelande, knappar för Ring, Inget svar, Svarade och Mejla, samt fälten Ansvarig, Nästa uppföljning och Anteckningar. Fälten sparas automatiskt.
- **Inget svar:** tryck på *Inget svar* efter ett samtal som inte besvaras. Svarar personen inte inom 3 dagar (`NO_ANSWER_DAYS`) får ni ett mejl med ett färdigt SMS och en knapp som öppnar SMS-appen. SMS:et finns också i kortet med knapparna *Kopiera* och *Öppna i SMS*.
- **Bekräftelsemejlet** till nya leads ändrar du i appen under **✉ Utskick**. Där kan du slå av och på mejlet, ändra ämne och text, se en förhandsvisning och skicka ett test till dig själv. Platshållarna `{förnamn}`, `{namn}`, `{intresse}` och `{gym}` ersätts automatiskt. Texten sparas i scriptets *Script Properties*, så du behöver inte driftsätta om när du ändrar den. *Återställ standardtext* hämtar texten i `AUTOREPLY_DEFAULT`.
- **SMS-texten** ändrar du i `SMS_TEMPLATE` i KONFIG. Där ersätts `{förnamn}` och `{gym}` automatiskt.

### Installera appen

1. **Uppdatera scriptet.** Ersätt koden i Apps Script med den nya `Leads_AppsScript.gs`. Behåll dina egna värden i KONFIG.
2. **Lägg till appfilen.** Klicka på *+* → *HTML*, döp filen till exakt `App` och klistra in hela `App.html`.
3. **Kör `setup` igen.** Det lägger till kolumnerna *Samtalsförsök*, *Ej nådd sedan* och *SMS skickat*. Befintliga leads påverkas inte.
4. **Uppdatera formulärets driftsättning.** Välj *Driftsätt → Hantera driftsättningar → Redigera (pennan) → Version: Ny version*. Formulärets URL ändras inte.
5. **Skapa en separat driftsättning för appen.** Välj *Driftsätt → Ny driftsättning → Webbapp* och ställ in:
   - *Kör som:* **Användaren som öppnar webbappen**
   - *Åtkomst:* **Alla med ett Google-konto**

   Kopiera URL:en till `CRM_APP_URL` i KONFIG, spara, och uppdatera båda driftsättningarna en gång till enligt steg 4.
6. **Ge personalen tillgång.** Dela arket (redigera) med den personal som ska använda appen. Fyll gärna i deras Google-konton i `CRM_USERS`. Den som saknar tillgång till arket kan inte öppna några leads.
7. **Lägg appen på hemskärmen.** Öppna **https://lerumsboxen.github.io/lerumsboxen-app/leads/** i mobilen och följ instruktionen på sidan (Safari: dela-knappen → *Lägg till på hemskärmen*; Chrome: menyn → *Installera app*). Ikonen öppnar CRM-appen direkt. Sidan ligger i `leads/index.html`; byter appen adress ändrar du `CRM_APP_URL` där.

Varför två driftsättningar? Formuläret måste vara öppet för alla. Appen ska bara visas för er. Appen körs som den som är inloggad, så det är arkets delning som styr vem som ser leads. Även om någon öppnar formulärets URL visar den aldrig appen för andra än dig.

`App.html` kan också öppnas direkt i en webbläsare. Då körs den i testläge med påhittade leads och sparar ingenting.

## Så få Google-sökare till formuläret

- **Google Företagsprofil** (business.google.com): lägg länken till `konsultation.html` som bokningslänk eller webbplats, och gärna som ett inlägg med knappen *Läs mer*.
- **Hemsidan**: länka eller knappa till sidan, till exempel "Boka gratis konsultation".
- **Spåra källan**: lägg till `?src=google-profil` (eller `utm_source=…`) i länkarna. Då syns det i kolumnen *Källa* och under *Per källa* i Översikt.

## Arbeta i CRM:et

| Kolumn | Användning |
|---|---|
| Status | Rullista: Ny → Kontaktad → Konsultation bokad → Konsultation genomförd → Blev medlem / Ej intresserad / Ingen kontakt |
| Ansvarig | Den som tar leadet |
| Senast kontaktad | Fylls i automatiskt när status lämnar *Ny* |
| Nästa uppföljning | Ett datum. Försenade datum blir röda och kommer med i morgonmejlet |
| Anteckningar | Fritext |

- Raderna färgas efter status, och filtret i rubrikraden går att använda.
- Menyn **Leads** i arket innehåller *Lägg till lead manuellt* (för den som ringer eller kommer in direkt) och *Skicka påminnelse nu*.
- **Översikt** visar antal per status, konvertering, leads de senaste 30 dagarna, samt fördelning per intresse och källa.
- **Morgonmejlet** går bara ut när något behöver göras: leads som väntat mer än 24 h, eller uppföljningar som är idag eller försenade.

## Spam och säkerhet

- Formuläret har ett dolt honeypot-fält och en minsta ifyllnadstid, och samma kontakt kan bara skicka en gång per 10 min.
- Värden som börjar med `= + - @` sparas som text, vilket stoppar formelinjektion.
- Leads ligger i ett eget ark, så appens öppna `pull`-endpoint i `Kod_v4.gs` kan inte läsa dem.

## GDPR

- Formuläret kräver samtycke, och texten säger vad uppgifterna används till.
- `anonymizeOldLeads` körs den 1:a varje månad. Den tömmer namn, telefon, e-post, meddelande och anteckningar på avslutade leads (*Ej intresserad* och *Ingen kontakt*) som är äldre än `RETENTION_MONTHS` (12). Statistiken finns kvar.
- Leads med status *Blev medlem* rensas inte automatiskt.
- Dela arket bara med personal som behöver det.
