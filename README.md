# SheetsLLM - AI-Powered Spreadsheet Transformation Tool

> Transform your spreadsheets using natural language. No formulas, no code, just plain English.

## 🎯 Overview

**SheetsLLM** is a full-stack web application that enables users to transform CSV/XLSX files using natural language instructions. Instead of writing complex Excel formulas or Python scripts, users can simply describe what they want in plain English (e.g., "keep rows where HS% > 25 and FK > 40"), and the AI translates it into precise data operations.

### Why SheetsLLM?

- **Accessibility**: No programming or Excel expertise required
- **Speed**: Most operations complete in under 2 seconds
- **Privacy**: All data processing happens in-session (no permanent storage)
- **Transparency**: See exactly what transformations are being applied
- **Modern UX**: Beautiful dark/light themes with smooth animations

---

## ✨ Features

### Core Functionality

1. **File Upload & Schema Detection**
   - Support for CSV and XLSX files
   - Automatic type inference
   - Multi-sheet XLSX support with interactive sheet selector
   - File size limit: 1 million rows

2. **Natural Language Transformations**
   - Filter rows (e.g., "show only rows where age > 30")
   - Select/drop columns
   - Rename columns
   - Sort data
   - Calculate new columns (arithmetic operations)
   - Group by aggregations (sum, mean, count, etc.)
   - Fill/drop missing values
   - Deduplicate rows
   - Limit/take top N rows

3. **Interactive Workflow**
   - Real-time preview of transformations
   - Undo functionality (step-by-step)
   - Reset to original data
   - Download transformed data as CSV
   - Persistent state across tab navigation

4. **UI/UX Enhancements**
   - Dark/Light theme toggle
   - Glass morphism design
   - Smooth Framer Motion animations
   - Custom confirmation dialogs (no browser popups)
   - Responsive layout
   - Loading states and progress indicators

---

## 🏗️ Architecture

SheetsLLM follows a **client-server architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│           (Next.js 14 + React)              │
│                                             │
│  ┌────────────┐  ┌──────────────────────┐  │
│  │  UI Pages  │  │   Components         │  │
│  │  - Home    │  │   - DropZone         │  │
│  │  - Workspace│  │   - DataGrid        │  │
│  │  - Features │  │   - InstructionPanel│  │
│  │  - History  │  │   - Modals          │  │
│  └────────────┘  └──────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │       Next.js API Routes            │  │
│  │  /api/upload  /api/plan             │  │
│  │  /api/execute /api/undo             │  │
│  │  /api/download                      │  │
│  └──────────────────────────────────────┘  │
└──────────────┬──────────────────────────────┘
               │ HTTP/JSON
               ▼
┌─────────────────────────────────────────────┐
│                Backend                      │
│          (FastAPI + Python)                │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │         FastAPI Endpoints           │  │
│  │  POST /upload                       │  │
│  │  POST /plan                         │  │
│  │  POST /execute                      │  │
│  │  POST /undo                         │  │
│  │  GET  /download                     │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │       Core Processing               │  │
│  │  - Pandas DataFrames                │  │
│  │  - OpenAI GPT-4o-mini              │  │
│  │  - In-memory file storage           │  │
│  │  - History management               │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Data Flow

1. **Upload**: User uploads CSV/XLSX → Frontend sends to Next.js API → Forwarded to FastAPI → Stored in memory
2. **Transform**: User types instruction → Sent to `/plan` → OpenAI generates JSON plan → Sent to `/execute` → Pandas applies transformations → Preview returned
3. **Download**: User clicks download → Frontend requests `/download` → Backend converts DataFrame to CSV → File downloaded

---

## 🛠️ Tech Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Next.js** | 14.2.5 | React framework with App Router |
| **React** | 18.3.1 | UI component library |
| **TypeScript** | 5.5.4 | Type-safe JavaScript |
| **Tailwind CSS** | 3.4.10 | Utility-first CSS framework |
| **Framer Motion** | 11.18.2 | Animation library |
| **Lucide React** | 0.441.0 | Icon library |
| **next-themes** | 0.3.0 | Dark/light theme management |
| **TanStack Table** | 8.20.5 | Data grid rendering |

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **FastAPI** | 0.112.0 | Modern Python web framework |
| **Python** | ≥3.10 | Programming language |
| **Pandas** | 2.2.2 | Data manipulation |
| **OpenAI GPT** | 4o-mini | LLM for NL→JSON translation |
| **Pydantic** | 2.8.2 | Data validation |
| **openpyxl** | 3.1.5 | Excel file support |
| **numexpr** | 2.10.1 | Fast numerical expression evaluation |
| **HTTPX** | 0.27.0 | Async HTTP client |
| **python-dotenv** | 1.0.1 | Environment variable management |

---

## 🔄 How It Works

### 1. File Upload & Preprocessing

```
User uploads file → FastAPI receives raw bytes → Pandas reads CSV/XLSX
→ Schema inference (column names + dtypes) → Preview (first 500 rows)
→ Stored in memory with unique file_id
```

**Multi-sheet XLSX handling**:
- If XLSX has multiple sheets → Return sheet list to frontend
- User selects sheet via modal → Re-upload with `?sheet_name=` param
- Selected sheet parsed and processed

### 2. Natural Language to Plan Translation

**User Input**: `"keep rows where HS% > 25 and FK > 40"`

**Step 1: Plan Generation** (`/api/plan`)
```python
# Frontend sends to OpenAI via FastAPI
{
  "instruction": "keep rows where HS% > 25 and FK > 40",
  "schema": {
    "columns": [{"name": "HS%", "dtype": "float64"}, ...],
    "samples": [[row1], [row2], ...]
  }
}

# OpenAI responds with structured JSON
{
  "version": "1.0",
  "steps": [
    {
      "op": "filter",
      "where": ["HS% > 25", "FK > 40"]
    }
  ],
  "explain": "Filter rows where HS% > 25 and FK > 40"
}
```

**Step 2: Plan Validation**
- Pydantic models validate JSON structure
- Normalization fixes common model variations (e.g., `by` → `sort`)
- Unsupported operations rejected

**Step 3: Execution** (`/api/execute`)
```python
# Whitelist-based execution (NO arbitrary code)
for step in plan.steps:
    if step.op == "filter":
        df = apply_filter_expressions(df, step.where)
    elif step.op == "select":
        df = df[step.columns]
    elif step.op == "sort":
        df = df.sort_values(...)
    # ... 12 total operations
```

### 3. Transformation Operations

**Supported Operations**:

| Operation | Example Instruction | Backend Action |
|-----------|-------------------|----------------|
| **filter** | "rows where age > 30" | `df[df.query("age > 30")]` |
| **select** | "keep only name and age" | `df[["name", "age"]]` |
| **rename** | "rename Score to Points" | `df.rename(columns={...})` |
| **sort** | "sort by age descending" | `df.sort_values(...)` |
| **limit** | "top 10 rows" | `df.head(10)` |
| **add_columns** | "create KD = K - D" | `df["KD"] = df["K"] - df["D"]` |
| **groupby** | "average score by team" | `df.groupby(...).agg(...)` |
| **dropna** | "remove missing values" | `df.dropna()` |
| **fillna** | "fill age with 0" | `df["age"].fillna(0)` |
| **dedupe** | "remove duplicates" | `df.drop_duplicates()` |

### 4. State Management

**Frontend State** (React + localStorage):
- File metadata (ID, name)
- Current DataFrame preview (columns + rows)
- Original DataFrame (for reset)
- Schema information
- Persistent across page navigation

**Backend State** (In-memory dictionaries):
```python
DFS: Dict[str, pd.DataFrame] = {}           # Current state per file_id
HIST: Dict[str, List[pd.DataFrame]] = {}    # Undo history (snapshots)
```

**Undo Mechanism**:
- After each transformation, DataFrame snapshot saved to history
- Undo removes current state, reverts to previous snapshot
- History cleared on reset/new upload

---

## 📁 Project Structure

```
llm-spreadsheet-assistant/
├── backend/
│   ├── app/
│   │   └── main.py              # FastAPI app with all endpoints
│   ├── .env                     # Environment variables (OPENAI_API_KEY)
│   └── pyproject.toml           # Python dependencies
│
├── frontend/
│   ├── app/
│   │   ├── api/                 # Next.js API routes (proxy to backend)
│   │   │   ├── upload/route.ts
│   │   │   ├── plan/route.ts
│   │   │   ├── execute/route.ts
│   │   │   ├── undo/route.ts
│   │   │   └── download/route.ts
│   │   ├── features/            # Features page
│   │   ├── history/             # History page (placeholder)
│   │   ├── workspace/           # Main workspace page
│   │   │   └── page.tsx
│   │   ├── layout.tsx           # Root layout with theme provider
│   │   ├── page.tsx             # Landing page
│   │   └── globals.css          # Global styles + theme variables
│   │
│   ├── components/
│   │   ├── ConfirmDialog.tsx    # Custom confirmation modal
│   │   ├── DataGrid.tsx         # Table for previewing data
│   │   ├── DropZone.tsx         # File upload zone
│   │   ├── Header.tsx           # Navigation header
│   │   ├── InstructionPanel.tsx # Instruction input + controls
│   │   ├── SheetSelector.tsx    # XLSX sheet selection modal
│   │   └── ThemeToggle.tsx      # Dark/light theme switcher
│   │
│   ├── lib/
│   │   └── animations.ts        # Framer Motion animation configs
│   │
│   ├── styles/
│   │   └── globals.css          # Tailwind + custom CSS
│   │
│   └── package.json             # Frontend dependencies
│
└── README.md                    # This file
```

---

## 🚀 Setup & Installation

### Prerequisites

- **Python** 3.10 or higher
- **Node.js** 18 or higher
- **OpenAI API Key** ([get one here](https://platform.openai.com/api-keys))

### Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Create virtual environment**
   ```bash
   python -m venv .venv
   ```

3. **Activate virtual environment**
   - Windows:
     ```bash
     .venv\Scripts\activate
     ```
   - macOS/Linux:
     ```bash
     source .venv/bin/activate
     ```

4. **Install dependencies**
   ```bash
   pip install -e .
   ```

5. **Create `.env` file**
   ```bash
   # backend/.env
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-4o-mini
   MAX_ROWS=1000000
   ```

6. **Start the backend server**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   Backend will be available at: **http://localhost:8000**

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

   Frontend will be available at: **http://localhost:3000**

### Verify Setup

1. Open browser to **http://localhost:3000**
2. Check backend health: **http://localhost:8000/health**
3. Upload a test CSV file
4. Try instruction: `"show first 5 rows"`

---

## 📡 API Documentation

### Backend Endpoints (FastAPI)

#### 1. `POST /upload`

Upload and parse CSV/XLSX files.

**Query Parameters**:
- `sheet_name` (optional): For multi-sheet XLSX files

**Headers**:
- `X-Filename`: Filename (e.g., "data.csv")

**Request Body**: Raw file bytes (octet-stream)

**Response**:
```json
// Single sheet or CSV
{
  "file_id": "uuid-string",
  "schema": {
    "columns": [{"name": "col1", "dtype": "int64"}],
    "samples": [[...], [...]]
  },
  "preview": {
    "columns": ["col1", "col2"],
    "rows": [{...}, {...}]
  }
}

// Multi-sheet XLSX (requires selection)
{
  "requires_sheet_selection": true,
  "sheets": ["Sheet1", "Sheet2"],
  "file_id": "uuid-string"
}
```

#### 2. `POST /plan`

Generate transformation plan from natural language.

**Request**:
```json
{
  "file_id": "uuid",
  "instruction": "keep rows where age > 30",
  "schema": {...}
}
```

**Response**:
```json
{
  "plan_json": {
    "version": "1.0",
    "steps": [{
      "op": "filter",
      "where": ["age > 30"]
    }],
    "explain": "Filter rows where age > 30"
  }
}
```

#### 3. `POST /execute`

Execute transformation plan.

**Request**:
```json
{
  "file_id": "uuid",
  "plan_json": {...}
}
```

**Response**:
```json
{
  "columns": ["col1", "col2"],
  "preview": [{...}, {...}]
}
```

#### 4. `POST /undo`

Revert to previous state.

**Request**:
```json
{
  "file_id": "uuid"
}
```

**Response**: Same as execute

#### 5. `GET /download`

Download transformed data.

**Query Parameters**:
- `file_id`: UUID
- `format`: "csv" or "xlsx" (default: csv)

**Response**: File download (CSV/XLSX)

### Frontend API Routes (Next.js)

All frontend routes proxy to backend:
- `/api/upload` → `http://localhost:8000/upload`
- `/api/plan` → `http://localhost:8000/plan`
- `/api/execute` → `http://localhost:8000/execute`
- `/api/undo` → `http://localhost:8000/undo`
- `/api/download` → `http://localhost:8000/download`

**Purpose**: Handle CORS, add middleware, format FormData

---

## 🎨 Design Decisions

### 1. **Why In-Memory Storage?**

**Decision**: Use Python dictionaries instead of database

**Reasoning**:
- MVP simplicity
- No persistent storage needed (privacy-first)
- Fast reads/writes
- Easy undo/redo with snapshots

**Trade-offs**:
- ❌ Data lost on server restart
- ❌ No multi-instance scaling
- ✅ Simple deployment
- ✅ Fast performance

### 2. **Why Next.js API Routes as Proxy?**

**Decision**: Add Next.js middleware instead of direct backend calls

**Reasoning**:
- CORS handling
- Request/response transformation (FormData ↔ octet-stream)
- Future: Authentication, rate limiting, caching

### 3. **Why GPT-4o-mini?**

**Decision**: Use smaller, faster model

**Reasoning**:
- Simple JSON generation task (doesn't need GPT-4 reasoning)
- 10x cheaper
- Faster response times (<1s)

### 4. **Why Whitelist-Based Execution?**

**Decision**: Restrict operations to 12 predefined pandas functions

**Reasoning**:
- **Security**: No arbitrary code execution
- **Reliability**: Tested, predictable operations
- **Performance**: Optimized pandas implementations

### 5. **Why Glass Morphism UI?**

**Decision**: Modern frosted-glass aesthetic with backdrop blur

**Reasoning**:
- Professional appearance
- Clear visual hierarchy
- Smooth theme transitions
- Aligns with modern design trends

### 6. **Why localStorage for State Persistence?**

**Decision**: Save workspace state client-side

**Reasoning**:
- Persist across tab switches
- No backend complexity
- Instant restore on page load
- User controls data (privacy)

---

## 🔮 Future Enhancements

### Short-term

- [ ] **File Join Operations**: Merge multiple spreadsheets
- [ ] **Export to XLSX**: Support Excel output
- [ ] **Batch Operations**: Run same transform on multiple files
- [ ] **Transformation History UI**: Visual timeline of changes
- [ ] **Saved Templates**: Reusable transformation workflows

### Long-term

- [ ] **Multi-user Collaboration**: Share transformations with teams
- [ ] **Database Connectors**: Load from PostgreSQL, MySQL, etc.
- [ ] **Scheduled Transforms**: Cron-like automation
- [ ] **API Key Management**: User-provided OpenAI keys
- [ ] **Advanced Visualizations**: Charts, pivot tables
- [ ] **Custom Functions**: User-defined transformation logic

---

## 🤝 Contributing

This is an MVP project. Contributions, issues, and feature requests are welcome!

**To contribute**:
1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📝 License

This project is built as an MVP demonstration. No formal license applied yet.

---

## 💡 Lessons Learned

### Technical Insights

1. **LLM JSON Mode**: Using OpenAI's JSON mode with strict Pydantic validation ensures structured, parseable outputs
2. **Pandas Performance**: Keep transformations stateless; DataFrame copies prevent unintended mutations
3. **Next.js App Router**: API routes in App Router require different patterns than Pages Router
4. **Theme Implementation**: CSS variables + Tailwind + next-themes = seamless dark/light switching
5. **Sheet Selection UX**: Multi-sheet XLSX requires two-step upload flow (detect → select → re-upload)

### Design Insights

1. **Glass Morphism**: Requires careful backdrop-blur + transparency tuning for readability
2. **Confirmation Dialogs**: Custom modals > browser alerts for modern UX
3. **Loading States**: Always show spinner + disable buttons during async operations
4. **Mobile Responsiveness**: Table overflows require horizontal scroll containers

---

## 📞 Contact & Support

For questions, feedback, or issues:
- Create an issue in this repository
- Email: pranjalprateek9@gmail.com
