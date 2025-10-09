# My Drive Server

Node.js server built with Clean Architecture and MVC pattern using TypeScript.

## Project Structure

```
src/
├── application/     # Use cases and business logic
├── domain/         # Entities and business rules
├── infrastructure/ # External implementations
├── interfaces/     # Controllers and presenters
└── config/         # Configuration
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests