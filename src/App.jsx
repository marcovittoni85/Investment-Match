import React, { useState, useCallback } from 'react';

// MULTI-LLM INVESTOR MATCHER v1.0
// Input: Nome/P.IVA + Tipo Deal
// Output: 150-300 investitori da 5 LLM con consensus scoring

export default function App() {
  const [step, setStep] = useState('input');
  const [input, setInput] = useState({ query: '', dealType: 'maggioranza' });
  const [companyProfile, setCompanyProfile] = useState(null);
  const [llmResults, setLlmResults] = useState({});
  const [aggregatedResults, setAggregatedResults] = useState(null);
  const [progress, setProgress] = useState([]);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [expandedInvestor, setExpandedInvestor] = useState(null);
  const [filters, setFilters] = useState({ minConsensus: 1, type: 'all', hasNews: false });

  // LLM Configuration
  const LLMs = [
    { id: 'claude', name: 'Claude', icon: '🟣', endpoint: '/api/claude', color: '#8B5CF6' },
    { id: 'openai', name: 'GPT-4', icon: '🟢', endpoint: '/api/openai', color: '#10B981' },
    { id: 'gemini', name: 'Gemini', icon: '🔵', endpoint: '/api/gemini', color: '#3B82F6' },
    { id: 'perplexity', name: 'Perplexity', icon: '🟠', endpoint: '/api/perplexity', color: '#F59E0B' },
    { id: 'mistral', name: 'Mistral', icon: '🔴', endpoint: '/api/mistral', color: '#EF4444' },
  ];

  const addProgress = (msg, llm = null) => {
    setProgress(p => [...p, { msg, llm, status: 'running', start: Date.now() }]);
  };

  const updateProgress = (success, count = 0) => {
    setProgress(p => {
      const updated = [...p];
      const last = updated[updated.length - 1];
      if (last) {
        last.status = success ? 'done' : 'error';
        last.duration = Date.now() - last.start;
        last.count = count;
      }
      return updated;
    });
  };

  const callLLM = async (endpoint, prompt) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, maxTokens: 8000 })
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    return await response.json();
  };

  // STEP 1: Auto-profile the company
  const buildCompanyProfile = async (query) => {
    addProgress('🔍 Analisi automatica azienda...', 'claude');
    
    const profilePrompt = `Cerca informazioni su "${query}" (può essere nome azienda o P.IVA italiana).

TROVA E RIPORTA in formato strutturato:
1. ANAGRAFICA: Ragione sociale, Sede, P.IVA, Anno fondazione
2. SETTORE: Settore principale, sotto-settore, descrizione business
3. FINANCIALS: Fatturato ultimo anno, EBITDA o margine, numero dipendenti
4. BUSINESS: Clienti principali, % export, punti di forza
5. OWNERSHIP: Proprietari attuali, struttura societaria
6. NEWS RECENTI: Ultime notizie sull'azienda

Rispondi SOLO con un JSON valido:
{
  "name": "...",
  "legalName": "...",
  "vatNumber": "...",
  "headquarters": "...",
  "region": "...",
  "founded": "...",
  "sector": "...",
  "subSector": "...",
  "description": "...",
  "revenues": "€...M",
  "revenuesNum": 0,
  "ebitda": "€...M",
  "ebitdaMargin": "...%",
  "employees": 0,
  "exportPct": "...%",
  "mainClients": ["..."],
  "owners": "...",
  "strengths": ["..."],
  "recentNews": ["..."],
  "sources": ["..."]
}`;

    try {
      const result = await callLLM('/api/claude', profilePrompt);
      const text = result.text || '';
      
      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const profile = JSON.parse(jsonMatch[0]);
        updateProgress(true, 1);
        return profile;
      }
      throw new Error('No valid JSON in response');
    } catch (e) {
      console.error('Profile error:', e);
      updateProgress(false);
      return null;
    }
  };

  // STEP 2: Build the mega-prompt for investor search
  const buildInvestorPrompt = (profile, dealType, category) => {
    const dealTypeText = {
      'maggioranza': 'acquisizione di maggioranza (51-80%)',
      'totalitaria': 'acquisizione totalitaria (100%)',
      'minoranza': 'investimento di minoranza (10-49%)'
    }[dealType];

    const evEstimate = profile.revenuesNum ? 
      `EV stimato: €${Math.round(profile.revenuesNum * 0.8)}M - €${Math.round(profile.revenuesNum * 1.2)}M` : 
      'EV da definire';

    const categoryPrompts = {
      pe_italy: `Cerca 20-30 FONDI DI PRIVATE EQUITY ITALIANI che potrebbero essere interessati.
Focus su: Investindustrial, Clessidra, Xenon, Progressio, Alcedo, Green Arrow, DeA Capital, Ambienta, 
HAT, NB Renaissance, Consilium, Mandarin, Gradiente, Oltre, Wisequity, Made in Italy Fund.
Per ciascuno indica: AUM, ticket tipico, settori preferiti, deal recenti, DICHIARAZIONI PUBBLICHE su strategie.`,

      pe_europe: `Cerca 20-30 FONDI DI PRIVATE EQUITY EUROPEI con interesse per Italia/Made in Italy.
Focus su: CVC, Permira, EQT, Ardian, PAI Partners, Cinven, BC Partners, Apax, Bridgepoint, 
Equistone, IK Partners, Astorg, Ergon, Waterland, Gimv, Eurazeo, Tikehau.
Per ciascuno indica: presenza Italia, deal italiani recenti, DICHIARAZIONI su settore ${profile.sector}.`,

      pe_global: `Cerca 15-20 MEGA FONDI GLOBALI che investono in Europa.
Focus su: KKR, Blackstone, Carlyle, Apollo, TPG, Bain Capital, Warburg Pincus, Advent, 
General Atlantic, Hellman & Friedman, Silver Lake, Thoma Bravo.
Per ciascuno indica: deal europei recenti, interesse per Made in Italy, DICHIARAZIONI DEI PARTNER.`,

      family_office_italy: `Cerca 20-25 FAMILY OFFICE ITALIANI che fanno investimenti diretti.
Focus su: Exor (Agnelli), Delfin (Del Vecchio), Ferrero, Armani, Benetton (21 Invest), 
Angelini, Barilla, Lavazza, Italmobiliare (Pesenti), TIP (Tamburi), Cucinelli, Tod's (Della Valle),
Coin (family), Merloni, Berlusconi (Fininvest), Caltagirone.
Per ciascuno indica: settori di interesse, deal recenti, DICHIARAZIONI su nuovi investimenti.`,

      family_office_europe: `Cerca 15-20 FAMILY OFFICE EUROPEI che investono in Italia.
Focus su: Quandt (Germania), Henkel (Germania), Reimann/JAB (Germania), Arnault/LVMH (Francia), 
Pinault/Kering (Francia), Mulliez (Francia), Wallenberg (Svezia), Grosvenor (UK), 
Rausing (UK/Svezia), Agnelli/Exor (internazionale), Bosch (Germania).
Per ciascuno indica: interesse per Italia, deal recenti, DICHIARAZIONI su Made in Italy.`,

      family_office_global: `Cerca 15-20 FAMILY OFFICE GLOBALI (USA, Middle East, Asia).
Focus su: Koch Industries, Pritzker, Mars, Dell, Walton (Walmart), Bloomberg,
Al Futtaim (UAE), Olayan (Saudi), Mansour (Egitto), Al Ghurair (UAE),
Li Ka-shing (HK), Ayala (Filippine), Tata (India), Mittal (India).
Per ciascuno indica: investimenti europei, interesse per manufacturing/design.`,

      corporate: `Cerca 15-20 CORPORATE/STRATEGIC BUYERS nel settore ${profile.sector}.
Cerca aziende 5-50x più grandi che fanno M&A attivo, sia italiane che estere.
Per ciascuno indica: strategia M&A, acquisizioni recenti, DICHIARAZIONI su espansione.`,

      swf_institutional: `Cerca 10-15 SOVEREIGN WEALTH FUNDS e INVESTITORI ISTITUZIONALI.
Focus su: GIC (Singapore), Temasek, ADIA (Abu Dhabi), Mubadala, PIF (Saudi), QIA (Qatar),
CPPIB (Canada), CDPQ (Canada), CDP Italia, BPI France, British Business Bank.
Per ciascuno indica: programmi direct investment in Europa, deal recenti.`,

      debt: `Cerca 15-20 FONDI DI DEBITO per acquisition finance.
Focus su: Ares, HPS, Blue Owl, Golub, Tikehau, Arcmont, Pemberton, Hayfin, ICG,
Partners Group, Kartesia, Muzinich, Intermediate Capital.
Per ciascuno indica: ticket, strutture preferite (unitranche, senior, mezz), deal italiani.`
    };

    return `SEI UN M&A ADVISOR ESPERTO. Stai cercando investitori per questa azienda:

=== TARGET ===
${profile.name} (${profile.legalName})
Settore: ${profile.sector} - ${profile.subSector}
Sede: ${profile.headquarters}, ${profile.region}
Fatturato: ${profile.revenues} | EBITDA: ${profile.ebitda} (${profile.ebitdaMargin})
Dipendenti: ${profile.employees} | Export: ${profile.exportPct}
${evEstimate}
Tipo operazione: ${dealTypeText}

Descrizione: ${profile.description}
Clienti: ${profile.mainClients?.join(', ')}
Punti forza: ${profile.strengths?.join(', ')}

=== RICERCA ===
${categoryPrompts[category]}

=== FORMATO OUTPUT ===
Per OGNI investitore trovato, fornisci:
- Nome esatto
- Tipo (PE, Family Office, Corporate, SWF, Debt)
- Sede/Paese
- AUM o dimensione
- Ticket tipico
- Focus settoriale
- PERCHÉ è rilevante per questo target
- NEWS/DICHIARAZIONI RECENTI con DATA e FONTE (es: "Il partner X ha dichiarato a Il Sole 24 Ore il 15/01/2025 che...")
- Deal comparabili recenti
- Contatti chiave se disponibili

Rispondi in formato JSON array:
[
  {
    "name": "...",
    "type": "PE/FO/Corporate/SWF/Debt",
    "headquarters": "...",
    "country": "...",
    "aum": "€...B",
    "ticketSize": "€...M-€...M",
    "focus": ["settore1", "settore2"],
    "relevance": "Perché è adatto a questo target...",
    "news": "Dichiarazione/notizia recente...",
    "newsDate": "GG/MM/AAAA",
    "newsSource": "Fonte (es: BeBeez, Il Sole 24 Ore, Reuters...)",
    "recentDeals": ["Deal 1", "Deal 2"],
    "contacts": ["Nome Cognome - Ruolo"],
    "italyPresence": "Sì/No",
    "website": "..."
  }
]

IMPORTANTE: 
- Cerca informazioni REALI e AGGIORNATE
- Cita SEMPRE la fonte e la data delle notizie
- Includi DICHIARAZIONI PUBBLICHE di partner/managing director
- Non inventare - se non trovi info, ometti il campo`;
  };

  // STEP 3: Run all LLMs in parallel
  const runMultiLLMSearch = async (profile, dealType) => {
    const categories = [
      { id: 'pe_italy', name: 'PE Italiani', llm: 'claude' },
      { id: 'pe_europe', name: 'PE Europei', llm: 'openai' },
      { id: 'pe_global', name: 'PE Globali', llm: 'gemini' },
      { id: 'family_office_italy', name: 'Family Office IT', llm: 'perplexity' },
      { id: 'family_office_europe', name: 'Family Office EU', llm: 'mistral' },
      { id: 'family_office_global', name: 'Family Office Global', llm: 'claude' },
      { id: 'corporate', name: 'Corporate Buyers', llm: 'openai' },
      { id: 'swf_institutional', name: 'SWF & Istituzionali', llm: 'gemini' },
      { id: 'debt', name: 'Debt Funds', llm: 'perplexity' },
    ];

    const results = {};
    
    // Run searches sequentially to avoid rate limits but show progress
    for (const cat of categories) {
      const llmConfig = LLMs.find(l => l.id === cat.llm);
      addProgress(`${llmConfig.icon} ${cat.name}...`, cat.llm);
      
      try {
        const prompt = buildInvestorPrompt(profile, dealType, cat.id);
        const response = await callLLM(llmConfig.endpoint, prompt);
        
        // Parse JSON from response
        const text = response.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        
        if (jsonMatch) {
          try {
            const investors = JSON.parse(jsonMatch[0]);
            results[cat.id] = {
              llm: cat.llm,
              category: cat.name,
              investors: investors.filter(i => i && i.name),
              raw: text
            };
            updateProgress(true, investors.length);
          } catch (parseErr) {
            console.error(`Parse error for ${cat.id}:`, parseErr);
            results[cat.id] = { llm: cat.llm, category: cat.name, investors: [], raw: text };
            updateProgress(true, 0);
          }
        } else {
          results[cat.id] = { llm: cat.llm, category: cat.name, investors: [], raw: text };
          updateProgress(true, 0);
        }
      } catch (err) {
        console.error(`Error for ${cat.id}:`, err);
        results[cat.id] = { llm: cat.llm, category: cat.name, investors: [], error: err.message };
        updateProgress(false);
      }
      
      // Small delay between requests
      await new Promise(r => setTimeout(r, 1000));
    }
    
    return results;
  };

  // STEP 4: Aggregate and deduplicate results
  const aggregateResults = (llmResults) => {
    addProgress('📊 Aggregazione e scoring...', null);
    
    const investorMap = new Map();
    
    // Collect all investors
    Object.entries(llmResults).forEach(([catId, catData]) => {
      (catData.investors || []).forEach(inv => {
        if (!inv?.name) return;
        
        const key = inv.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (investorMap.has(key)) {
          const existing = investorMap.get(key);
          existing.sources.push({ llm: catData.llm, category: catData.category });
          existing.consensus++;
          // Merge news if new
          if (inv.news && !existing.allNews.includes(inv.news)) {
            existing.allNews.push({ text: inv.news, date: inv.newsDate, source: inv.newsSource, llm: catData.llm });
          }
          // Merge deals
          if (inv.recentDeals) {
            existing.allDeals = [...new Set([...existing.allDeals, ...inv.recentDeals])];
          }
        } else {
          investorMap.set(key, {
            ...inv,
            id: investorMap.size + 1,
            sources: [{ llm: catData.llm, category: catData.category }],
            consensus: 1,
            allNews: inv.news ? [{ text: inv.news, date: inv.newsDate, source: inv.newsSource, llm: catData.llm }] : [],
            allDeals: inv.recentDeals || []
          });
        }
      });
    });

    // Convert to array and sort by consensus
    let investors = Array.from(investorMap.values());
    
    // Calculate score
    investors = investors.map(inv => {
      let score = 50;
      score += inv.consensus * 15; // +15 per ogni LLM che lo cita
      if (inv.italyPresence === 'Sì') score += 10;
      if (inv.allNews.length > 0) score += 10;
      if (inv.allDeals.length > 0) score += 5;
      if (inv.contacts?.length > 0) score += 5;
      score = Math.min(99, Math.max(30, score));
      
      return {
        ...inv,
        score,
        fit: score >= 85 ? 'Eccellente' : score >= 70 ? 'Alto' : score >= 55 ? 'Medio' : 'Basso'
      };
    });

    // Sort by score
    investors.sort((a, b) => b.score - a.score);
    
    updateProgress(true, investors.length);
    
    // Build summary
    const summary = {
      total: investors.length,
      byType: {
        pe: investors.filter(i => i.type?.includes('PE') || i.type?.includes('Private')).length,
        fo: investors.filter(i => i.type?.includes('Family')).length,
        corp: investors.filter(i => i.type?.includes('Corporate')).length,
        swf: investors.filter(i => i.type?.includes('SWF') || i.type?.includes('Sovereign')).length,
        debt: investors.filter(i => i.type?.includes('Debt') || i.type?.includes('Lending')).length
      },
      byConsensus: {
        high: investors.filter(i => i.consensus >= 3).length,
        medium: investors.filter(i => i.consensus === 2).length,
        low: investors.filter(i => i.consensus === 1).length
      },
      avgScore: Math.round(investors.reduce((a, i) => a + i.score, 0) / investors.length) || 0
    };

    return { investors, summary };
  };

  // Main search function
  const runSearch = useCallback(async () => {
    if (!input.query.trim()) {
      setError('Inserisci nome azienda o P.IVA');
      return;
    }

    setStep('searching');
    setProgress([]);
    setError(null);
    setLlmResults({});
    setAggregatedResults(null);

    try {
      // Step 1: Profile the company
      const profile = await buildCompanyProfile(input.query);
      if (!profile) {
        setError('Impossibile trovare informazioni sull\'azienda');
        setStep('input');
        return;
      }
      setCompanyProfile(profile);

      // Step 2: Run multi-LLM search
      const results = await runMultiLLMSearch(profile, input.dealType);
      setLlmResults(results);

      // Step 3: Aggregate results
      const aggregated = aggregateResults(results);
      setAggregatedResults(aggregated);

      setStep('results');
    } catch (err) {
      console.error('Search error:', err);
      setError(`Errore: ${err.message}`);
      setStep('input');
    }
  }, [input]);

  // Filter investors
  const getFilteredInvestors = () => {
    if (!aggregatedResults) return [];
    let filtered = [...aggregatedResults.investors];
    
    if (filters.minConsensus > 1) {
      filtered = filtered.filter(i => i.consensus >= filters.minConsensus);
    }
    if (filters.type !== 'all') {
      filtered = filtered.filter(i => {
        const t = i.type?.toLowerCase() || '';
        if (filters.type === 'pe') return t.includes('pe') || t.includes('private') || t.includes('equity');
        if (filters.type === 'fo') return t.includes('family');
        if (filters.type === 'corp') return t.includes('corporate') || t.includes('strategic');
        if (filters.type === 'swf') return t.includes('swf') || t.includes('sovereign') || t.includes('institutional');
        if (filters.type === 'debt') return t.includes('debt') || t.includes('lending') || t.includes('credit');
        return true;
      });
    }
    if (filters.hasNews) {
      filtered = filtered.filter(i => i.allNews?.length > 0);
    }
    
    return filtered;
  };

  // Export to CSV
  const exportCSV = () => {
    if (!aggregatedResults) return;
    const rows = aggregatedResults.investors.map(i => 
      [i.name, i.type, i.country, i.score, i.consensus, i.aum, i.ticketSize, 
       i.focus?.join(';'), i.relevance, i.allNews?.[0]?.text, i.allNews?.[0]?.date,
       i.allNews?.[0]?.source, i.sources?.map(s => s.llm).join(';')]
      .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
      .join(',')
    );
    const csv = 'Nome,Tipo,Paese,Score,Consensus,AUM,Ticket,Focus,Relevance,News,DataNews,FonteNews,LLM\n' + rows.join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `investors_${companyProfile?.name || 'target'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Styles
  const S = {
    app: { minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a0f 0%, #1a1a2e 100%)', color: '#e5e5e5', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px' },
    container: { maxWidth: 700, margin: '0 auto' },
    resultsContainer: { maxWidth: 1200, margin: '0 auto' },
    header: { textAlign: 'center', marginBottom: 32 },
    title: { fontSize: 36, fontWeight: 800, background: 'linear-gradient(135deg, #8B5CF6, #3B82F6, #10B981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#71717a', marginBottom: 16 },
    llmBadges: { display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 24 },
    llmBadge: { fontSize: 12, padding: '6px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' },
    inputSection: { background: 'rgba(255,255,255,0.03)', borderRadius: 20, padding: 32, border: '1px solid rgba(255,255,255,0.08)' },
    inputLabel: { fontSize: 14, color: '#a1a1aa', marginBottom: 8, display: 'block' },
    input: { width: '100%', padding: '16px 20px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 18, marginBottom: 20, outline: 'none' },
    dealTypeRow: { display: 'flex', gap: 12, marginBottom: 24 },
    dealTypeBtn: { flex: 1, padding: '14px 16px', background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#a1a1aa', fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' },
    dealTypeBtnActive: { background: 'rgba(139,92,246,0.2)', borderColor: '#8B5CF6', color: '#fff' },
    searchBtn: { width: '100%', padding: '18px', background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)', color: '#fff', border: 'none', borderRadius: 14, fontSize: 18, fontWeight: 600, cursor: 'pointer' },
    searchBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
    progressContainer: { maxWidth: 700, margin: '40px auto', textAlign: 'center' },
    progressTitle: { fontSize: 28, fontWeight: 700, marginBottom: 8 },
    progressSubtitle: { fontSize: 14, color: '#71717a', marginBottom: 32 },
    progressList: { textAlign: 'left' },
    progressItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, marginBottom: 8, border: '1px solid rgba(255,255,255,0.05)' },
    progressIcon: { fontSize: 20, width: 28 },
    progressMsg: { flex: 1, fontSize: 14, color: '#d4d4d8' },
    progressCount: { fontSize: 13, fontWeight: 600, color: '#10B981', background: 'rgba(16,185,129,0.15)', padding: '4px 10px', borderRadius: 6 },
    progressBar: { height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginTop: 24, overflow: 'hidden' },
    progressFill: { height: '100%', background: 'linear-gradient(90deg, #8B5CF6, #3B82F6, #10B981)', transition: 'width 0.5s' },
    resultsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
    companyInfo: { },
    companyName: { fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 4 },
    companyMeta: { fontSize: 14, color: '#71717a' },
    actions: { display: 'flex', gap: 10 },
    actionBtn: { padding: '10px 18px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 },
    primaryBtn: { background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' },
    summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12, marginBottom: 24 },
    summaryCard: { background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16, textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' },
    summaryValue: { fontSize: 28, fontWeight: 700, color: '#fff' },
    summaryLabel: { fontSize: 11, color: '#71717a', textTransform: 'uppercase', marginTop: 4 },
    filtersRow: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
    filterSelect: { padding: '10px 14px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 13 },
    filterLabel: { fontSize: 12, color: '#71717a' },
    consensusLegend: { display: 'flex', gap: 16, marginBottom: 20, fontSize: 12, color: '#a1a1aa' },
    investorCard: { background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 20, marginBottom: 12, border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.2s' },
    investorHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' },
    investorMain: { flex: 1 },
    investorNameRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 },
    investorName: { fontSize: 18, fontWeight: 600, color: '#fff' },
    consensusBadge: { fontSize: 11, padding: '4px 10px', borderRadius: 6, fontWeight: 600 },
    investorType: { fontSize: 13, color: '#71717a' },
    scoreBox: { textAlign: 'right' },
    scoreCircle: { width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff' },
    fitLabel: { fontSize: 11, color: '#a1a1aa', marginTop: 4 },
    quickInfo: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    infoTag: { fontSize: 12, color: '#d4d4d8', background: 'rgba(255,255,255,0.08)', padding: '5px 12px', borderRadius: 8 },
    newsBox: { background: 'rgba(251,191,36,0.08)', borderRadius: 10, padding: '12px 14px', marginTop: 12, fontSize: 13, color: '#fcd34d', borderLeft: '3px solid #fbbf24' },
    newsDate: { fontSize: 11, color: '#a1a1aa', marginTop: 4 },
    expandedContent: { borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 16, paddingTop: 16 },
    detailSection: { marginBottom: 14 },
    detailTitle: { fontSize: 12, fontWeight: 600, color: '#a1a1aa', marginBottom: 6, textTransform: 'uppercase' },
    detailText: { fontSize: 14, color: '#d4d4d8', lineHeight: 1.6 },
    sourcesList: { display: 'flex', gap: 6, flexWrap: 'wrap' },
    sourceBadge: { fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 4 },
    noResults: { textAlign: 'center', padding: 60, color: '#52525b' },
    footer: { textAlign: 'center', fontSize: 12, color: '#3f3f46', marginTop: 40, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' },
    error: { background: 'rgba(239,68,68,0.15)', borderRadius: 12, padding: 16, marginBottom: 20, color: '#fca5a5' },
  };

  // === RENDER: INPUT SCREEN ===
  if (step === 'input') {
    return (
      <div style={S.app}>
        <div style={S.container}>
          <div style={S.header}>
            <h1 style={S.title}>🔮 Multi-LLM Investor Matcher</h1>
            <p style={S.subtitle}>Trova 150-300 investitori con consensus da 5 AI</p>
            <div style={S.llmBadges}>
              {LLMs.map(llm => (
                <span key={llm.id} style={{...S.llmBadge, borderColor: llm.color}}>
                  {llm.icon} {llm.name}
                </span>
              ))}
            </div>
          </div>

          {error && <div style={S.error}>{error}</div>}

          <div style={S.inputSection}>
            <label style={S.inputLabel}>Nome Azienda o Partita IVA</label>
            <input
              style={S.input}
              placeholder="es: Quinti Sedute oppure 02138850512"
              value={input.query}
              onChange={e => setInput({ ...input, query: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
            />

            <label style={S.inputLabel}>Tipo di Operazione</label>
            <div style={S.dealTypeRow}>
              {[
                { id: 'maggioranza', label: '📊 Maggioranza', desc: '51-80%' },
                { id: 'totalitaria', label: '🏢 Totalitaria', desc: '100%' },
                { id: 'minoranza', label: '📈 Minoranza', desc: '10-49%' }
              ].map(dt => (
                <button
                  key={dt.id}
                  style={{
                    ...S.dealTypeBtn,
                    ...(input.dealType === dt.id ? S.dealTypeBtnActive : {})
                  }}
                  onClick={() => setInput({ ...input, dealType: dt.id })}
                >
                  <div>{dt.label}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{dt.desc}</div>
                </button>
              ))}
            </div>

            <button
              style={{
                ...S.searchBtn,
                ...(input.query.trim() ? {} : S.searchBtnDisabled)
              }}
              onClick={runSearch}
              disabled={!input.query.trim()}
            >
              🚀 Avvia Deep Search Multi-LLM
            </button>

            <p style={{ textAlign: 'center', fontSize: 12, color: '#52525b', marginTop: 16 }}>
              9 ricerche parallele su 5 AI • Tempo stimato: 3-5 minuti
            </p>
          </div>
        </div>
      </div>
    );
  }

  // === RENDER: SEARCHING SCREEN ===
  if (step === 'searching') {
    const done = progress.filter(p => p.status !== 'running').length;
    const total = 10; // 1 profiling + 9 categories
    
    return (
      <div style={S.app}>
        <div style={S.progressContainer}>
          <h2 style={S.progressTitle}>🔍 Deep Search in corso...</h2>
          <p style={S.progressSubtitle}>
            {companyProfile?.name || input.query} • {input.dealType}
          </p>

          <div style={S.progressList}>
            {progress.map((p, i) => {
              const llm = LLMs.find(l => l.id === p.llm);
              return (
                <div key={i} style={S.progressItem}>
                  <span style={S.progressIcon}>
                    {p.status === 'running' ? '⏳' : p.status === 'done' ? '✅' : '❌'}
                  </span>
                  <span style={S.progressMsg}>{p.msg}</span>
                  {p.count > 0 && <span style={S.progressCount}>+{p.count}</span>}
                  {p.duration && (
                    <span style={{ fontSize: 11, color: '#52525b' }}>
                      {(p.duration / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div style={S.progressBar}>
            <div style={{ ...S.progressFill, width: `${(done / total) * 100}%` }} />
          </div>

          <p style={{ marginTop: 20, fontSize: 13, color: '#71717a' }}>
            {done}/{total} completate • 
            {progress.reduce((a, p) => a + (p.count || 0), 0)} investitori trovati
          </p>
        </div>
      </div>
    );
  }

  // === RENDER: RESULTS SCREEN ===
  if (step === 'results' && aggregatedResults) {
    const filtered = getFilteredInvestors();
    
    return (
      <div style={S.app}>
        <div style={S.resultsContainer}>
          <div style={S.resultsHeader}>
            <div style={S.companyInfo}>
              <h1 style={S.companyName}>{companyProfile?.name || 'Target'}</h1>
              <p style={S.companyMeta}>
                {companyProfile?.sector} • {companyProfile?.revenues} • {companyProfile?.headquarters}
                {companyProfile?.ebitdaMargin && ` • EBITDA ${companyProfile.ebitdaMargin}`}
              </p>
            </div>
            <div style={S.actions}>
              <button style={S.actionBtn} onClick={() => setStep('input')}>← Nuova ricerca</button>
              <button style={{...S.actionBtn, ...S.primaryBtn}} onClick={exportCSV}>📥 Export CSV</button>
            </div>
          </div>

          {/* Summary Cards */}
          <div style={S.summaryGrid}>
            <div style={S.summaryCard}>
              <div style={S.summaryValue}>{aggregatedResults.summary.total}</div>
              <div style={S.summaryLabel}>Totali</div>
            </div>
            <div style={S.summaryCard}>
              <div style={S.summaryValue}>{aggregatedResults.summary.byConsensus.high}</div>
              <div style={S.summaryLabel}>🟢 3+ LLM</div>
            </div>
            <div style={S.summaryCard}>
              <div style={S.summaryValue}>{aggregatedResults.summary.byType.pe}</div>
              <div style={S.summaryLabel}>PE</div>
            </div>
            <div style={S.summaryCard}>
              <div style={S.summaryValue}>{aggregatedResults.summary.byType.fo}</div>
              <div style={S.summaryLabel}>Family Office</div>
            </div>
            <div style={S.summaryCard}>
              <div style={S.summaryValue}>{aggregatedResults.summary.byType.corp}</div>
              <div style={S.summaryLabel}>Corporate</div>
            </div>
            <div style={S.summaryCard}>
              <div style={S.summaryValue}>{aggregatedResults.summary.byType.swf}</div>
              <div style={S.summaryLabel}>SWF</div>
            </div>
            <div style={S.summaryCard}>
              <div style={S.summaryValue}>{aggregatedResults.summary.byType.debt}</div>
              <div style={S.summaryLabel}>Debt</div>
            </div>
            <div style={S.summaryCard}>
              <div style={S.summaryValue}>{aggregatedResults.summary.avgScore}</div>
              <div style={S.summaryLabel}>Score Medio</div>
            </div>
          </div>

          {/* Consensus Legend */}
          <div style={S.consensusLegend}>
            <span>🟢 Citato da 3+ LLM = Alta affidabilità</span>
            <span>🟡 Citato da 2 LLM = Media affidabilità</span>
            <span>⚪ Citato da 1 LLM = Verificare</span>
          </div>

          {/* Filters */}
          <div style={S.filtersRow}>
            <span style={S.filterLabel}>Filtri:</span>
            <select 
              style={S.filterSelect}
              value={filters.minConsensus}
              onChange={e => setFilters({...filters, minConsensus: Number(e.target.value)})}
            >
              <option value={1}>Tutti</option>
              <option value={2}>2+ LLM</option>
              <option value={3}>3+ LLM</option>
            </select>
            <select 
              style={S.filterSelect}
              value={filters.type}
              onChange={e => setFilters({...filters, type: e.target.value})}
            >
              <option value="all">Tutti i tipi</option>
              <option value="pe">Private Equity</option>
              <option value="fo">Family Office</option>
              <option value="corp">Corporate</option>
              <option value="swf">SWF/Istituzionali</option>
              <option value="debt">Debt Funds</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={filters.hasNews}
                onChange={e => setFilters({...filters, hasNews: e.target.checked})}
              />
              <span style={S.filterLabel}>Solo con news</span>
            </label>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#71717a' }}>
              {filtered.length} risultati
            </span>
          </div>

          {/* Investor List */}
          {filtered.length === 0 ? (
            <div style={S.noResults}>Nessun investitore trovato con questi filtri</div>
          ) : (
            filtered.map(inv => {
              const isExpanded = expandedInvestor === inv.id;
              const consensusColor = inv.consensus >= 3 ? '#10B981' : inv.consensus === 2 ? '#F59E0B' : '#6b7280';
              const scoreColor = inv.score >= 80 ? '#10B981' : inv.score >= 65 ? '#3B82F6' : '#6b7280';
              
              return (
                <div 
                  key={inv.id} 
                  style={{
                    ...S.investorCard,
                    borderColor: inv.consensus >= 3 ? 'rgba(16,185,129,0.3)' : undefined
                  }}
                >
                  <div style={S.investorHeader} onClick={() => setExpandedInvestor(isExpanded ? null : inv.id)}>
                    <div style={S.investorMain}>
                      <div style={S.investorNameRow}>
                        <span style={S.investorName}>{inv.name}</span>
                        <span style={{
                          ...S.consensusBadge,
                          background: `${consensusColor}20`,
                          color: consensusColor
                        }}>
                          {inv.consensus >= 3 ? '🟢' : inv.consensus === 2 ? '🟡' : '⚪'} {inv.consensus} LLM
                        </span>
                        {inv.italyPresence === 'Sì' && (
                          <span style={{...S.consensusBadge, background: 'rgba(59,130,246,0.2)', color: '#3B82F6'}}>
                            🇮🇹 Italia
                          </span>
                        )}
                      </div>
                      <div style={S.investorType}>
                        {inv.type} • {inv.country || inv.headquarters}
                      </div>
                    </div>
                    <div style={S.scoreBox}>
                      <div style={{...S.scoreCircle, background: scoreColor}}>{inv.score}</div>
                      <div style={S.fitLabel}>{inv.fit}</div>
                    </div>
                  </div>

                  {/* Quick Info */}
                  <div style={S.quickInfo}>
                    {inv.aum && <span style={S.infoTag}>📊 AUM: {inv.aum}</span>}
                    {inv.ticketSize && <span style={S.infoTag}>💰 Ticket: {inv.ticketSize}</span>}
                    {inv.focus?.slice(0, 2).map((f, i) => (
                      <span key={i} style={S.infoTag}>🎯 {f}</span>
                    ))}
                  </div>

                  {/* News */}
                  {inv.allNews?.[0] && (
                    <div style={S.newsBox}>
                      📰 {inv.allNews[0].text}
                      <div style={S.newsDate}>
                        {inv.allNews[0].date && `📅 ${inv.allNews[0].date}`}
                        {inv.allNews[0].source && ` • 📄 ${inv.allNews[0].source}`}
                      </div>
                    </div>
                  )}

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div style={S.expandedContent}>
                      {inv.relevance && (
                        <div style={S.detailSection}>
                          <div style={S.detailTitle}>Perché è rilevante</div>
                          <div style={S.detailText}>{inv.relevance}</div>
                        </div>
                      )}

                      {inv.allDeals?.length > 0 && (
                        <div style={S.detailSection}>
                          <div style={S.detailTitle}>Deal recenti</div>
                          <div style={S.detailText}>{inv.allDeals.join(' • ')}</div>
                        </div>
                      )}

                      {inv.allNews?.length > 1 && (
                        <div style={S.detailSection}>
                          <div style={S.detailTitle}>Altre news</div>
                          {inv.allNews.slice(1).map((n, i) => (
                            <div key={i} style={{...S.newsBox, marginTop: 8}}>
                              📰 {n.text}
                              <div style={S.newsDate}>
                                {n.date && `📅 ${n.date}`} {n.source && `• 📄 ${n.source}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {inv.contacts?.length > 0 && (
                        <div style={S.detailSection}>
                          <div style={S.detailTitle}>Contatti</div>
                          <div style={S.detailText}>{inv.contacts.join(' • ')}</div>
                        </div>
                      )}

                      <div style={S.detailSection}>
                        <div style={S.detailTitle}>Trovato da</div>
                        <div style={S.sourcesList}>
                          {inv.sources?.map((s, i) => {
                            const llm = LLMs.find(l => l.id === s.llm);
                            return (
                              <span key={i} style={{...S.sourceBadge, borderLeft: `3px solid ${llm?.color}`}}>
                                {llm?.icon} {llm?.name} ({s.category})
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {inv.website && (
                        <div style={S.detailSection}>
                          <a href={inv.website} target="_blank" rel="noopener noreferrer" 
                             style={{ color: '#3B82F6', fontSize: 13 }}>
                            🌐 {inv.website}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={S.footer}>
            {new Date().toLocaleString('it-IT')} • {aggregatedResults.summary.total} investitori da {LLMs.length} LLM
          </div>
        </div>
      </div>
    );
  }

  return null;
}
