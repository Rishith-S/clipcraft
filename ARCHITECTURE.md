# ClipCraft - System Architecture

## Overview
ClipCraft is a full-stack web application that generates videos using AI models. The system consists of a React frontend, Node.js/Express backend, and integrates with various AI services and databases.

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                │
│  │   React App     │  │   React Router  │  │   TailwindCSS   │                │
│  │   (Vite)        │  │   (v7.6.2)      │  │   (v4.1.8)      │                │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                │
│           │                     │                     │                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                │
│  │   Axios HTTP    │  │   EventSource   │  │   React Hot     │                │
│  │   Client        │  │   (SSE)         │  │   Toast         │                │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS/API Calls
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY LAYER                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                │
│  │   Express.js    │  │   CORS          │  │   Rate Limiting │                │
│  │   Server        │  │   Middleware    │  │   (25 req/min)  │                │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                │
│           │                     │                     │                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                │
│  │   JWT Auth      │  │   bcrypt        │  │   Input         │                │
│  │   Middleware    │  │   Password      │  │   Validation    │                │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Internal API Routes
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SERVICE LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                │
│  │   Auth Service  │  │   Chat History  │  │   Video         │                │
│  │   (/auth)       │  │   Service       │  │   Generation    │                │
│  │                 │  │   (/chatHistory)│  │   Service       │                │
│  │ • Login         │  │                 │  │   (/execute)    │                │
│  │ • Register      │  │ • Save History  │  │                 │                │
│  │ • JWT Tokens    │  │ • Retrieve      │  │ • Video ID      │                │
│  │ • OAuth         │  │ • Update        │  │   Generation    │                │
│  └─────────────────┘  └─────────────────┘  │ • Queue         │                │
│                                            │   Management    │                │
│                                            │ • SSE Events    │                │
│                                            └─────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Data Access
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                │
│  │   PostgreSQL    │  │   Redis         │  │   Supabase      │                │
│  │   Database      │  │   (Upstash)     │  │   (Auth)        │                │
│  │                 │  │                 │  │                 │                │
│  │ • Users Table   │  │ • Job Queue     │  │ • OAuth         │                │
│  │ • Videos Table  │  │ • Session Store │  │ • User Mgmt     │                │
│  │ • Prisma ORM    │  │ • Rate Limiting │  │ • Real-time     │                │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ External API Calls
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            EXTERNAL SERVICES                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                │
│  │   OpenAI        │  │   Google        │  │   Mistral AI    │                │
│  │   API           │  │   Generative AI │  │   API           │                │
│  │                 │  │                 │  │                 │                │
│  │ • GPT Models    │  │ • Gemini        │  │ • Mistral       │                │
│  │ • Code Gen      │  │ • Code Gen      │  │ • Code Gen      │                │
│  │ • Text Gen      │  │ • Text Gen      │  │ • Text Gen      │                │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                │
│           │                     │                     │                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                │
│  │   Docker        │  │   Manim         │  │   File Storage  │                │
│  │   Container     │  │   (Animation)   │  │   (Generated    │                │
│  │                 │  │                 │  │   Videos)       │                │
│  │ • Video         │  │ • Python        │  │                 │                │
│  │   Processing    │  │   Animation     │  │ • MP4 Files     │                │
│  │ • Code          │  │ • SVG/MP4       │  │ • Temporary     │                │
│  │   Execution     │  │   Output        │  │   Storage       │                │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Frontend Components
```
src/
├── components/
│   ├── screens/
│   │   ├── Auth.tsx              # Authentication screens
│   │   ├── Homepage.tsx           # Main landing page
│   │   ├── InputBox.tsx           # Video prompt input
│   │   └── PreviewScreen.tsx      # Video generation interface
│   └── utils/
│       ├── Layout.tsx             # Main layout wrapper
│       ├── Navbar.tsx             # Navigation component
│       ├── Modal.tsx              # Modal dialogs
│       ├── Loader.tsx             # Loading states
│       ├── PersistentLogin.tsx    # Auth persistence
│       ├── Callback.tsx           # OAuth callbacks
│       └── Redirect.tsx           # Route redirection
├── hooks/
│   ├── useVideoGeneration.ts      # Video generation logic
│   ├── useChatHistory.ts          # Chat history management
│   └── useRefreshToken.tsx        # Token refresh logic
└── assets/
    ├── videos/                    # Example videos
    ├── svg/                       # SVG icons
    └── fonts/                     # Custom fonts
```

### Backend Services
```
src/
├── routes/
│   ├── auth.ts                    # Authentication endpoints
│   ├── chatHistory.ts             # Chat history management
│   └── execute.ts                 # Video generation endpoints
├── middleware/
│   ├── verifyAuth.ts              # JWT verification
│   └── allowCredentials.ts        # CORS credentials
├── utils/
│   ├── prisma.ts                  # Database client
│   ├── redis.ts                   # Redis client
│   ├── queueReader.ts             # Job queue processor
│   ├── sse.ts                     # Server-Sent Events
│   ├── prompt.ts                  # AI prompt handling
│   ├── supabase.ts                # Supabase client
│   └── types.ts                   # TypeScript types
└── generated/                     # Prisma generated client
```

## Data Flow

### 1. User Authentication Flow
```
User → React App → Auth Service → Supabase → JWT Token → Frontend Storage
```

### 2. Video Generation Flow
```
User Input → Frontend → API Gateway → Video Service → Queue → AI Services → Docker → Manim → Video Output → SSE → Frontend
```

### 3. Real-time Communication Flow
```
Frontend → EventSource → SSE Service → Job Events → Frontend Updates
```

## Key Technologies

### Frontend Stack
- **React 19.1.0** - UI framework
- **Vite 6.3.5** - Build tool and dev server
- **TypeScript 5.8.3** - Type safety
- **TailwindCSS 4.1.8** - Styling
- **React Router 7.6.2** - Client-side routing
- **Axios 1.9.0** - HTTP client
- **React Hot Toast 2.5.2** - Notifications

### Backend Stack
- **Node.js** - Runtime environment
- **Express.js 5.1.0** - Web framework
- **TypeScript 5.8.3** - Type safety
- **Prisma 6.8.2** - Database ORM
- **PostgreSQL** - Primary database
- **Redis (Upstash)** - Caching and job queue
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing

### AI & External Services
- **OpenAI API** - GPT models for code generation
- **Google Generative AI** - Gemini models
- **Mistral AI** - Alternative AI models
- **Docker** - Containerized video processing
- **Manim** - Python animation library
- **Supabase** - Authentication and user management

## Security Features

1. **Rate Limiting** - 25 requests per minute per IP
2. **JWT Authentication** - Secure token-based auth
3. **CORS Protection** - Cross-origin request control
4. **Input Validation** - Zod schema validation
5. **Password Hashing** - bcrypt for secure storage
6. **OAuth Integration** - GitHub authentication

## Scalability Considerations

1. **Queue-based Processing** - Redis for job management
2. **Stateless API** - JWT-based authentication
3. **Database Indexing** - Optimized queries with Prisma
4. **Caching Strategy** - Redis for session and queue data
5. **Containerization** - Docker for video processing
6. **Real-time Updates** - SSE for live progress updates

## Deployment Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CDN/Static    │    │   Load Balancer │    │   API Gateway   │
│   Assets        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │    │   Express.js    │    │   Database      │
│   (Frontend)    │◄──►│   (Backend)     │◄──►│   (PostgreSQL)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Redis Cache   │    │   Docker        │    │   File Storage  │
│   & Queue       │    │   Containers    │    │   (Videos)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

This architecture provides a scalable, secure, and maintainable system for AI-powered video generation with real-time updates and robust error handling. 