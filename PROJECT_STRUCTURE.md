# Estrutura de pastas sugerida

```txt
.
├── backend/
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── app.js
│       ├── server.js
│       ├── config/
│       │   └── env.js
│       ├── controllers/
│       │   └── matchupController.js
│       ├── routes/
│       │   └── matchupRoutes.js
│       ├── services/
│       │   ├── matchupAnalyzerService.js
│       │   ├── requestQueue.js
│       │   └── riotApiClient.js
│       └── utils/
│           └── httpError.js
└── frontend/
    └── src/app/
        ├── core/
        │   ├── models/
        │   │   └── matchup.models.ts
        │   └── services/
        │       └── matchup.service.ts
        └── features/
            └── matchup-analyzer/
                └── matchup-analyzer.component.ts
```
