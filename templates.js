/*  Decision Capsule – Vorlagenbibliothek (kann groß werden)
    Struktur:
    - window.TEMPLATES_BY_TOPIC: { "Thema": [ {id,name,category,data:{...}} ] }
    - window.SUCCESS_CHIPS: { categorySlug: [ "Chip Text", ... ] }
    Hinweis:
    - category: kurze Slugs → bestimmen Kalibrierungs-Buckets
*/

(function(){
  const by = (id, name, cat, d) => ({ id, name, category: cat, data: d });

  const Base = {
    buy:   (p="Produkt")=>({ title:"Kaufentscheidung", decision:`Ich kaufe ${p}.`, options:"Kaufen\nNicht kaufen\nAlternative",
      chosen:"Kaufen", reasons:"Preis/Leistung ok\nRückgaberecht vorhanden", assumptions:"Kein besseres Angebot kurzfristig",
      success:"Zufriedenheit ≥ 8/10 · Budget eingehalten · in 30 Tagen prüfen", confidence:70 }),
    finance:(x="Abo")=>({ title:"Abo-Entscheidung", decision:`Ich wechsle/kündige ${x}.`, options:"Wechseln\nKündigen\nBehalten",
      chosen:"Wechseln", reasons:"Leistung passt\nKosten ↓", assumptions:"Keine versteckten Gebühren",
      success:"Kosten ↓ ≥ 20 % bei gleicher Leistung", confidence:65 }),
    health:(r="Routine")=>({ title:"Neue Routine testen", decision:`Ich teste ${r} 14 Tage.`,
      options:"Starten\nSpäter prüfen\nNicht starten", chosen:"Starten",
      reasons:"Einstiegshürde gering\nMessbar", assumptions:"Keine Nebenwirkungen",
      success:"Energie ≥ 7/10 · Schlaf +2 Punkte", confidence:65 }),
    learn:(k="Kurs")=>({ title:"Kursentscheidung", decision:`Ich belege ${k}.`,
      options:"Belegen\nWarteliste\nAblehnen", chosen:"Belegen",
      reasons:"Klares Ziel\nZeitbudget vorhanden", assumptions:"Kosten/Nutzen ok",
      success:"Abschluss ≤ 6 Wochen · 2 Anwendungen", confidence:65 }),
    project:(x="Projekt")=>({ title:"Side-Projekt starten", decision:`Ich starte ${x} (kleiner Umfang).`,
      options:"Starten\nSpäter\nVerwerfen", chosen:"Starten",
      reasons:"Machbar in 14 Tagen", assumptions:"3 Abende frei/Woche",
      success:"MVP live · 5 Feedbacks", confidence:60 }),
    personal:(p="Person")=>({ title:"Gespräch führen", decision:`Ich spreche mit ${p}.`,
      options:"Diese Woche\nNächste Woche\nSchriftlich", chosen:"Diese Woche",
      reasons:"Konkretes Ziel", assumptions:"Ruhiger Rahmen",
      success:"Termin fixiert · Ergebnis protokolliert", confidence:60 }),
    home:(x="Bereich")=>({ title:"Entrümpeln", decision:`Ich entrümple ${x} 7 Tage.`,
      options:"Starten\nWochenende\nNicht", chosen:"Starten",
      reasons:"Kleinschritte möglich", assumptions:"Täglich 20 Min",
      success:">5 Teile/Tag · sichtbare Fläche frei", confidence:70 }),
    travel:(z="Ziel")=>({ title:"Reise buchen", decision:`Ich buche Reise ${z}.`,
      options:"Buchen\nAbwarten\nAlternative", chosen:"Buchen",
      reasons:"Preis gut · Storno möglich", assumptions:"Termine passen",
      success:"Budget ≤ X · Stornofrist > 14 Tage", confidence:65 }),
    tools:(t="Tool")=>({ title:"Tool wählen", decision:`Ich abonniere ${t}.`,
      options:"Abonnieren\nTesten\nNicht", chosen:"Testen",
      reasons:"Use-Case klar", assumptions:"Export/Lock-in geprüft",
      success:"Zeitersparnis ≥ 30 Min/Woche", confidence:60 }),
    habit:(h="Gewohnheit")=>({ title:"Gewohnheit aufbauen", decision:`Ich übe ${h} 30 Tage.`,
      options:"Starten\nSchrittweise\nNicht", chosen:"Schrittweise",
      reasons:"Mini-Schritte", assumptions:"Puffer eingeplant",
      success:"≥ 24/30 Tage erfüllt", confidence:65 }),
    money:(t="Sparen")=>({ title:"Finanz-Ziel", decision:`Ich erhöhe ${t}.`,
      options:"Sofort\nSchrittweise\nNicht", chosen:"Schrittweise",
      reasons:"Automatisierung möglich", assumptions:"Fixkosten konstant",
      success:"Dauerauftrag X €/Monat · 3 Monate halten", confidence:65 }),
    study:(s="Thema")=>({ title:"Lernziel", decision:`Ich lerne ${s} 4 Wochen.`,
      options:"Starten\nKleiner Plan\nNicht", chosen:"Kleiner Plan",
      reasons:"Tägliche 20 Min", assumptions:"Ablenkungen gering",
      success:"≥ 20 Sessions · Quiz ≥ 80 %", confidence:60 }),
  };

  const TEMPLATES_BY_TOPIC = {
    "Kauf & Finanzen": [
      by("buy-phone",   "Elektronik kaufen", "buy",     Base.buy("<Produkt>")),
      by("buy-vehicle", "Fahrzeug kaufen",   "buy",     Base.buy("Fahrzeug (gebraucht)")),
      by("buy-furniture","Möbel kaufen",     "buy",     Base.buy("Möbelstück")),
      by("finance-switch","Abo wechseln/kündigen","finance", Base.finance("<Abo>")),
      by("finance-insurance","Versicherung anpassen","finance",{ title:"Versicherung prüfen", decision:"Ich passe Versicherung <X> an.",
        options:"Anpassen\nBehalten\nKündigen", chosen:"Anpassen", reasons:"Leistung passend\nPreis ok",
        assumptions:"Keine Lücken", success:"Leistung gleich/mehr · Prämie ≤ Budget", confidence:60 }),
      by("money-save", "Sparziel erhöhen", "money",    Base.money("Sparen")),
    ],

    "Gesundheit & Fitness": [
      by("health-routine","Routine 14 Tage testen","health", Base.health("<Routine>")),
      by("health-sleep",  "Schlaf anpassen",       "health", Base.health("Schlafzeit (±15 min)")),
      by("health-diet",   "Ernährung 7 Tage testen","health",Base.health("Ernährungs-Änderung")),
      by("health-walk",   "Täglich 8k Schritte",    "habit",  Base.habit("8k Schritte")),
      by("health-gym",    "Kraft 3× pro Woche",     "habit",  Base.habit("Krafttraining")),
      by("health-focus",  "Bildschirm-Pausen",      "habit",  Base.habit("Bildschirm-Pausen")),
    ],

    "Lernen & Projekte": [
      by("learn-course", "Kurs belegen",    "learn",   Base.learn("<Kurs>")),
      by("learn-cert",   "Zertifikat planen","learn",   { title:"Zertifikat", decision:"Ich plane Zertifikat <X>.",
        options:"Starten\nTermin setzen\nNicht", chosen:"Termin setzen", reasons:"Karriere-Nutzen", assumptions:"Zeitfenster frei",
        success:"Termin fixiert · Lernplan steht", confidence:60 }),
      by("proj-side",    "Side-Projekt starten","project", Base.project("<Projekt>")),
      by("create-post",  "Artikel/Video veröffentlichen","project",{ title:"Veröffentlichen", decision:"Ich veröffentliche <Beitrag>.",
        options:"Jetzt\nIterieren\nVerwerfen", chosen:"Jetzt", reasons:"Story steht", assumptions:"Kein Rechtsrisiko",
        success:"Live · 3 qual. Rückmeldungen", confidence:70 }),
    ],

    "Beziehungen & Alltag": [
      by("talk-tough",   "Schwieriges Gespräch","personal", Base.personal("<Person>")),
      by("gift",         "Geschenk wählen",     "personal",{ title:"Geschenk wählen", decision:"Ich wähle Geschenk <X>.",
        options:"X\nY\nErlebnis", chosen:"Erlebnis", reasons:"Persönlicher Bezug", assumptions:"Termin passt",
        success:"Reaktion positiv (≥8/10)", confidence:70 }),
      by("boundary",     "Grenze setzen",       "personal",{ title:"Grenze setzen", decision:"Ich ziehe Grenze bei <Thema>.",
        options:"Jetzt klar\nSchrittweise\nNicht jetzt", chosen:"Jetzt klar",
        reasons:"Wertschonend + konkret", assumptions:"Kein Eskalationsrisiko",
        success:"Regel kommuniziert · 14 Tage gehalten", confidence:60 }),
      by("move-house",   "Umzug planen",        "home",{ title:"Umzug planen", decision:"Ich plane Umzug <Ort>.",
        options:"Planen\nAngebote holen\nVerschieben", chosen:"Angebote holen",
        reasons:"Zeitfenster klar", assumptions:"Budget bekannt",
        success:"2 Angebote · Terminfenster fix", confidence:60 }),
    ],

    "Wohnen & Organisation": [
      by("home-declutter","Entrümpeln 7 Tage","home",   Base.home("<Bereich>")),
      by("home-appliance","Haushaltsgerät kaufen","buy", Base.buy("Haushaltsgerät")),
      by("home-repair",   "Reparatur beauftragen","home",{ title:"Reparatur", decision:"Ich beauftrage Reparatur <X>.",
        options:"Beauftragen\nSelbst versuchen\nAufschieben", chosen:"Beauftragen",
        reasons:"Sicherheit/Qualität", assumptions:"Kostenrahmen klar",
        success:"Termin fixiert · Kosten ≤ Budget", confidence:60 }),
      by("paperwork",     "Papierkram erledigen","home",{ title:"Papierkram", decision:"Ich erledige <Vorgang> (1 Stunde).",
        options:"Jetzt\nAufteilen\nVertagen", chosen:"Aufteilen", reasons:"Niedrige Hürde", assumptions:"Checkliste vorhanden",
        success:"Checkliste komplett · Frist eingehalten", confidence:65 }),
    ],

    "Reise & Freizeit": [
      by("trip-book",    "Reise buchen",    "travel",  Base.travel("<Ziel>")),
      by("event-go",     "Event besuchen",  "travel",{ title:"Event", decision:"Ich gehe zu <Event>.",
        options:"Hingehen\nSpäter\nNicht", chosen:"Hingehen", reasons:"Begleitung vorhanden", assumptions:"Anreise ok",
        success:"Teilnahme · 2 Kontakte", confidence:70 }),
      by("weekend-plan", "Wochenende planen","travel",{ title:"Wochenende", decision:"Ich plane <Aktivität>.",
        options:"A\nB\nC", chosen:"A", reasons:"Wetter/Logistik passt", assumptions:"Kosten gering",
        success:"Durchgeführt · Zufriedenheit ≥ 8/10", confidence:70 }),
      by("fitness-trip", "Aktiv-Ausflug",    "travel",{ title:"Aktiv-Ausflug", decision:"Ich mache <Tour>.",
        options:"Buchen\nPlanen\nNicht", chosen:"Planen", reasons:"Ausrüstung vorhanden", assumptions:"Wetter stabil",
        success:"Tour durchgeführt · Erholung hoch", confidence:65 }),
    ],

    "Digital & Arbeit": [
      by("tool-sub",     "Software abonnieren?","tools", Base.tools("<Tool>")),
      by("os-update",    "System-Update",       "tools",{ title:"Update", decision:"Ich spiele Update <Version> ein.",
        options:"Jetzt\nSpäter\nAuslassen", chosen:"Später", reasons:"Backup vorhanden", assumptions:"Kompatibel",
        success:"Stabilität ok · neue Funktion genutzt", confidence:75 }),
      by("backup-plan",  "Backup umstellen",    "tools",{ title:"Backup ändern", decision:"Ich stelle auf <Strategie> um.",
        options:"Umstellen\nPilot 7 Tage\nNicht", chosen:"Pilot 7 Tage", reasons:"Restore getestet",
        assumptions:"Kosten im Rahmen", success:"Test-Restore < 30 Min", confidence:65 }),
      by("focus-mode",   "Fokus-Zeit täglich",  "habit", Base.habit("25-Min Fokus-Timer")),
    ],

    "Geld & Verträge": [
      by("salary-talk",  "Gehalt verhandeln",   "finance",{ title:"Gehalt", decision:"Ich verhandle Gehalt.",
        options:"Jetzt\nTermin holen\nNicht", chosen:"Termin holen", reasons:"Marktwert", assumptions:"Unterlagen parat",
        success:"Termin fixiert · Zielband geklärt", confidence:55 }),
      by("debt-plan",    "Schuldenplan",        "finance",{ title:"Schuldenplan", decision:"Ich erstelle Plan.",
        options:"Heute\nWoche\nNicht", chosen:"Heute", reasons:"Zinsen vermeiden", assumptions:"Einnahmen stabil",
        success:"Plan fertig · 1 Rate bezahlt", confidence:60 }),
      by("invest-check", "Invest prüfen",       "finance",{ title:"Invest prüfen", decision:"Ich prüfe Invest <X> (nur Analyse).",
        options:"Analysieren\nBeobachten\nNicht", chosen:"Analysieren",
        reasons:"Risiko verstehen", assumptions:"Kein FOMO",
        success:"Risiko/Return notiert · Entscheidung in 7 Tagen", confidence:60 }),
      by("mobile-plan",  "Handyvertrag wechseln","finance", Base.finance("Handyvertrag")),
    ],
  };

  // Erfolgschips je Kategorie (werden unter dem Erfolgsfeld angezeigt)
  const SUCCESS_CHIPS = {
    buy:     ["Preis ≤ Budget", "Rückgabe möglich", "Zufriedenheit ≥ 8/10", "in 30 Tagen prüfen"],
    finance: ["Kosten ↓ ≥ 20 %", "Leistung gleich/mehr", "Kündigung fristgerecht", "Bestätigung erhalten"],
    health:  ["Energie ≥ 7/10", "Schlaf +2", "Schmerz ↓", "7/7 Tage eingehalten"],
    habit:   ["≥ 24/30 Tage", "täglich 20 Min", "Ausfall ≤ 2 Tage", "Belohnung am Ende"],
    learn:   ["Abschluss ≤ 6 Wochen", "Quiz ≥ 80 %", "2 Anwendungen", "Feedback bekommen"],
    project: ["MVP live", "5 Nutzer-Feedbacks", "Scope klein gehalten", "Fehlerliste erstellt"],
    personal:["Termin fixiert", "freundlich & klar", "Ergebnis notiert", "Follow-up geplant"],
    home:    [">5 Teile/Tag", "sichtbare Fläche frei", "Kosten ≤ Budget", "Termin fixiert"],
    travel:  ["Budget ≤ X", "Storno > 14 Tage", "2 Kontakte", "Erholung hoch"],
    tools:   ["Zeitersparnis ≥ 30 Min/Woche", "Export möglich", "Team-OK", "Test bestanden"],
    money:   ["Dauerauftrag X €", "3 Monate gehalten", "Notgroschen ≥ 3 Monate", "Ausgaben getrackt"],
    study:   ["≥ 20 Sessions", "Quiz ≥ 80 %", "Projekt abgegeben", "Peer-Feedback"],
    general: ["Ziel erreicht", "keine Probleme", "Zeitplan gehalten", "Review in 30 Tagen"]
  };

  window.TEMPLATES_BY_TOPIC = TEMPLATES_BY_TOPIC;
  window.SUCCESS_CHIPS = SUCCESS_CHIPS;
})();
