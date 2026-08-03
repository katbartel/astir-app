# New Project Foundation

## Goal

Create a new full-stack TypeScript career app project that preserves the useful
foundation from this repository while leaving UI decisions to be added
separately.

This spec is intended as a migration brief for a new project. It should define
the base environment, project structure, backend API, local development setup,
and browser annotation support. It should not define final UI decisions. Those
should be supplied separately in later design specs or direct annotations.

## Rationale

The current app is small enough that the existing frontend could be continued,
but it already has substantial layout-specific CSS and product UI decisions.
Starting a new project gives the next frontend a cleaner base and lets the UI
approach be chosen intentionally later.

The backend foundation is simple and portable. Recreate it almost exactly in
the new project, then build a neutral frontend shell that can receive the UI
direction separately.

## Project Structure

Use a full-stack monorepo with npm workspaces.

```text
.
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── types/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── health.controller.ts
│   │   ├── companies.controller.ts
│   │   ├── companies.service.ts
│   │   └── types.ts
│   └── package.json
├── docs/
├── docker-compose.yml
├── package.json
└── README.md
```

Keep ownership boundaries explicit:

- Frontend code belongs under `frontend/`.
- Backend code belongs under `backend/`.
- Product and implementation notes belong under `docs/`.
- Root files should provide workspace, Docker, and documentation glue.

## Root Workspace Setup

Use Node.js 22 or newer and npm 10 or newer.

The root `package.json` should define npm workspaces and convenience commands:

```json
{
  "private": true,
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev": "docker compose run --rm install && docker compose up --build",
    "dev:frontend": "npm run dev --workspace frontend",
    "dev:backend": "npm run dev --workspace backend",
    "build": "npm run build --workspaces",
    "lint": "npm run lint --workspaces",
    "typecheck": "npm run typecheck --workspaces"
  }
}
```

## Frontend Requirements

Use:

- React 19
- TypeScript
- Vite
- Agentation for browser-based page annotations during development

The frontend should start as a neutral application shell or mock surface. Do not
hard-code final product layout, navigation, visual style, or detailed UI
decisions in the foundation step.

The shell should be ready for later UI implementation and should prove that
frontend-to-backend API communication works.

## Frontend API Proxy

Configure Vite so frontend requests to `/api/*` are proxied to the backend in
development.

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
})
```

## Browser Annotation Support

Include Agentation in the frontend mock so design and behavior changes can be
annotated directly on the page for coding agents.

`frontend/src/main.tsx` should include:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Agentation } from 'agentation'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {import.meta.env.DEV && (
      <Agentation endpoint="http://localhost:4747" />
    )}
  </StrictMode>,
)
```

Agentation should only render in development. The production build should not
include the annotation toolbar.

## Backend Requirements

Use NestJS with TypeScript and strict compiler settings.

The backend should:

- Prefix all routes with `/api`.
- Expose `GET /api/health`.
- Expose `GET /api/companies`.
- Read runtime configuration from environment variables where relevant.
- Default to port `3000`.
- Listen on `0.0.0.0` so it works inside Docker Compose.
- Support local hot reloading.
- Stay stateless for the initial foundation.

Do not add these yet:

- Database
- ORM
- Migrations
- Authentication
- Scraping
- Queues or background workers
- Persistent job-tracking behavior

## Backend Entry Point

`backend/src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api')

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port, '0.0.0.0')
}

void bootstrap()
```

## Backend Module

`backend/src/app.module.ts` should register the initial controllers and service:

```ts
import { Module } from '@nestjs/common'
import { CompaniesController } from './companies.controller'
import { CompaniesService } from './companies.service'
import { HealthController } from './health.controller'

@Module({
  controllers: [CompaniesController, HealthController],
  providers: [CompaniesService],
})
export class AppModule {}
```

## Health Endpoint

`GET /api/health` should return:

```json
{
  "status": "ok",
  "service": "career-api"
}
```

Implementation:

```ts
import { Controller, Get } from '@nestjs/common'

type HealthResponse = {
  status: 'ok'
  service: 'career-api'
}

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'career-api',
    }
  }
}
```

## Companies Endpoint

`GET /api/companies` should return static sample company and job data for now.

Shared backend types:

```ts
export type Job = {
  id: number
  title: string
  location: string
  postedAt: string
  stage: string
}

export type Company = {
  id: number
  name: string
  jobs: Job[]
}
```

Controller:

```ts
import { Controller, Get, Inject } from '@nestjs/common'
import { CompaniesService } from './companies.service'
import { Company } from './types'

@Controller('companies')
export class CompaniesController {
  constructor(
    @Inject(CompaniesService)
    private readonly companiesService: CompaniesService,
  ) {}

  @Get()
  getCompanies(): Company[] {
    return this.companiesService.getCompanies()
  }
}
```

Service:

```ts
import { Injectable } from '@nestjs/common'
import { Company } from './types'

const companies: Company[] = [
  {
    id: 1,
    name: 'Google',
    jobs: [
      {
        id: 1,
        title: 'Senior Product Manager, Security & privacy',
        location: 'Remote, EMEA',
        postedAt: 'June 9, 2026',
        stage: '1st stage',
      },
    ],
  },
]

@Injectable()
export class CompaniesService {
  getCompanies(): Company[] {
    return companies
  }
}
```

The frontend can use this endpoint to confirm API loading, loading states, and
error states, but final product behavior should be defined later.

## Docker Compose

Docker Compose should start both apps for local development.

Use services for:

- `install`: runs `npm install`.
- `frontend`: runs Vite on port `5173`.
- `backend`: runs the NestJS backend on port `3000`.

The frontend service should set:

```yaml
VITE_API_PROXY_TARGET: http://backend:3000
```

The backend service should set:

```yaml
PORT: 3000
```

Mount the repository into the containers and use named volumes for
`node_modules` so hot reloading works without overwriting local dependency
folders.

## Development Workflow

Root commands should support:

```bash
npm install
npm run dev
npm run dev:frontend
npm run dev:backend
npm run lint
npm run typecheck
npm run build
```

Expected local URLs:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:3000
Proxy:    http://localhost:5173/api/*
```

## README Requirements

The new project README should document:

- Required Node.js and npm versions.
- Docker requirement.
- Project structure.
- Workspace commands.
- Frontend and backend ports.
- Vite `/api` proxy behavior.
- Agentation browser annotation workflow.
- Current API endpoints.
- That the initial backend is stateless and uses sample data only.

## Acceptance Criteria

- The project has separate `frontend/` and `backend/` directories.
- The root project uses npm workspaces.
- The frontend starts with Vite hot reloading.
- The frontend remains UI-framework neutral until design direction is supplied.
- Agentation appears in development so page-level changes can be annotated.
- The backend starts with hot reloading.
- Docker Compose starts the frontend and backend together.
- `GET /api/health` works through the Vite dev server proxy.
- `GET /api/companies` works through the Vite dev server proxy.
- Root lint, type-check, and build commands cover both apps.
- No final UI decisions are embedded in the foundation beyond the minimal mock
  needed for development and annotation.

## Verification

Before considering the new project foundation complete, run:

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

Then confirm:

- `http://localhost:5173` loads.
- `http://localhost:5173/api/health` returns the health payload.
- `http://localhost:5173/api/companies` returns sample companies.
- The development page includes Agentation for annotations.
- The production build does not render Agentation.
