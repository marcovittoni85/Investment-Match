# 🔮 Multi-LLM Investor Matcher

Trova 150-300 investitori potenziali usando 5 AI in parallelo con consensus scoring.

## Features

- **Input minimo**: Solo nome azienda o P.IVA + tipo operazione
- **Auto-profiling**: L'app cerca automaticamente fatturato, settore, descrizione
- **5 LLM in parallelo**: Claude, GPT-4, Gemini, Perplexity, Mistral
- **9 categorie di ricerca**: PE Italia, PE Europa, PE Global, FO Italia, FO Europa, FO Global, Corporate, SWF, Debt
- **Consensus scoring**: Gli investitori citati da più LLM hanno punteggio più alto
- **News con date e fonti**: Ogni investitore ha dichiarazioni pubbliche tracciate
- **Export CSV**: Scarica tutti i risultati

## Deployment su Vercel

### 1. Crea nuovo progetto
```bash
# Estrai lo ZIP
# Apri la cartella in VS Code o terminale
```

### 2. Push su GitHub
```bash
git init
git add .
git commit -m "Multi-LLM Investor Matcher v1"
git remote add origin https://github.com/TUO-USERNAME/multi-llm-investor.git
git push -u origin main
```

### 3. Deploy su Vercel
1. Vai su vercel.com
2. "Add New Project"
3. Importa il repo da GitHub
4. **IMPORTANTE**: Aggiungi Environment Variables:

| Nome | Valore |
|------|--------|
| `ANTHROPIC_API_KEY` | (la tua key Claude) |
| `OPENAI_API_KEY` | sk-proj-... |
| `GEMINI_API_KEY` | AIzaSy... |
| `PERPLEXITY_API_KEY` | pplx-... |
| `MISTRAL_API_KEY` | ... |

5. Deploy!

## Come Funziona

```
INPUT: "Quinti Sedute" + Maggioranza
         │
         ▼
┌─────────────────────────┐
│  1. AUTO-PROFILING      │  Claude cerca: fatturato, settore,
│     (Claude + Search)   │  clienti, news recenti
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  2. MULTI-LLM SEARCH    │  9 ricerche su 5 LLM:
│                         │  - PE Italia (Claude)
│  🟣 Claude              │  - PE Europa (GPT-4)
│  🟢 GPT-4               │  - PE Global (Gemini)
│  🔵 Gemini              │  - FO Italia (Perplexity)
│  🟠 Perplexity          │  - FO Europa (Mistral)
│  🔴 Mistral             │  - FO Global (Claude)
│                         │  - Corporate (GPT-4)
│                         │  - SWF (Gemini)
│                         │  - Debt (Perplexity)
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  3. AGGREGATION         │  - Deduplica per nome
│                         │  - Conta consensus
│                         │  - Merge news
│                         │  - Calcola score
└─────────────────────────┘
         │
         ▼
OUTPUT: 150-300 investitori con:
        - Consensus score (quanti LLM lo citano)
        - News + Data + Fonte
        - Match score
        - Tipo, AUM, Ticket
```

## Costi Stimati

Per ogni ricerca completa (~9 chiamate API):
- Claude: ~$0.10
- GPT-4: ~$0.15
- Gemini: Gratis (quota giornaliera)
- Perplexity: ~$0.05
- Mistral: ~$0.02

**Totale: ~$0.30-0.50 per ricerca**

## Struttura File

```
multi-llm-investor-matcher/
├── api/
│   ├── claude.js      # Endpoint Claude + web search
│   ├── openai.js      # Endpoint GPT-4
│   ├── gemini.js      # Endpoint Gemini
│   ├── perplexity.js  # Endpoint Perplexity (search nativo)
│   └── mistral.js     # Endpoint Mistral
├── src/
│   ├── App.jsx        # App React principale
│   └── index.js       # Entry point
├── public/
│   └── index.html
├── package.json
├── vercel.json
└── README.md
```

## Troubleshooting

**Errore 500 su un LLM**: Controlla che la API key sia corretta in Vercel
**Timeout**: Alcune ricerche possono richiedere >60s, è normale
**0 risultati da un LLM**: Il parsing JSON può fallire, i risultati degli altri LLM compensano

## License

MIT
