/* The four product pages: what the nav's Product menu lists, what the home
   page's sections link to, and the content of /product/[slug]. Visuals are
   named here and drawn by components/marketing/visuals. */

export type VisualKey =
  | "fix"
  | "insights"
  | "chef"
  | "sql"
  | "rerun"
  | "recipes"
  | "missing"
  | "privacy"
  | "receipt"
  | "history"
  | "export"
  | "undo";

export type Cell = { visual: VisualKey; title: string; body: string };
export type Block = { heading: string; body: string; visual: VisualKey; cells: [Cell, Cell] };

export type ProductPage = {
  slug: string;
  href: string;
  name: string;
  /** Two short lines under the name in the Product menu */
  menu: string;
  /** The label above the hero headline */
  label: string;
  headline: string;
  lead: string;
  /** One line used on the home page section and the cross-links */
  pitch: string;
  /** Feature names for the home page's "Features" row, with one line each */
  features: { name: string; detail: string }[];
  blocks: Block[];
};

export const PRODUCT_PAGES: ProductPage[] = [
  {
    slug: "clean",
    href: "/product/clean",
    name: "Clean",
    menu: "One-click fixes for the mess every export brings",
    label: "Clean",
    headline: "Fix the usual mess in one click",
    lead: "Trim, dedupe, fill, rename, sort and change types from any column. The common fixes cost no AI request and show the result before anything is saved.",
    pitch: "Insights find the duplicates, gaps and odd formats for you, and every fix is one click from the column it belongs to.",
    features: [
      { name: "Column menu", detail: "Every column carries its own fixes: trim, fill, drop empty rows, dedupe, standardise dates, rename." },
      { name: "Insights", detail: "On upload, SheetsLLM counts duplicates, empty cells and mixed formats, and offers the fix beside each." },
      { name: "Column health", detail: "A strip above the grid shows how complete every column is, so the gaps are visible before you scroll." },
      { name: "Preview first", detail: "Each fix shows the rows before and after, and nothing is saved until you keep it." },
    ],
    blocks: [
      {
        heading: "The fixes you reach for every month",
        body: "Open any column and the fixes it needs are right there, grouped under Fix, no AI. They run straight away against the file and cost no AI request.",
        visual: "fix",
        cells: [
          { visual: "insights", title: "Insights on upload", body: "Duplicates, empty cells and mixed date formats, counted and offered as a fix." },
          { visual: "undo", title: "Every step undoable", body: "Each fix is a step in the history, so undo is one click and redo is another." },
        ],
      },
      {
        heading: "See it before you keep it",
        body: "A fix shows exactly what it changed: rows before and after, and the cells it touched wash in violet for a moment so you can find them.",
        visual: "history",
        cells: [
          { visual: "export", title: "Export named for the steps", body: "CSV, Excel, JSON or Parquet, with a file name that says how many steps it includes." },
          { visual: "receipt", title: "No AI, on the record", body: "One-click fixes say so in the history: no AI call, nothing sent anywhere." },
        ],
      },
    ],
  },
  {
    slug: "chef",
    href: "/product/chef",
    name: "Chef",
    menu: "Describe a change in a sentence and get checked SQL",
    label: "Chef, the AI",
    headline: "Say it in a sentence, get checked SQL",
    lead: "For everything a column menu cannot do, ask Chef. It writes read-only SQL against your file, validates it, and shows the result before you keep it.",
    pitch: "Chef reads the shape of your file, not its contents, and writes validated read-only SQL you can inspect on every step.",
    features: [
      { name: "Plain English", detail: "Ask for a margin column, a split name, a filter or a pivot, in your own words." },
      { name: "Validated SQL", detail: "Chef's SQL is checked as read-only before it runs, and you can open it on any step." },
      { name: "Clarifying questions", detail: "When a request is ambiguous, Chef asks with suggested answers instead of guessing." },
      { name: "Sent receipt", detail: "Every AI step records exactly what was sent: column names and types, and samples only if you allowed them." },
    ],
    blocks: [
      {
        heading: "A colleague who knows SQL",
        body: "Describe the change and Chef answers with a step: the instruction, the SQL that ran, and the rows and columns after. Ask a question instead and you get an answer, not a change.",
        visual: "chef",
        cells: [
          { visual: "sql", title: "SQL you can read", body: "Open the SQL on any step. It is read-only, checked, and runs against your file only." },
          { visual: "receipt", title: "What was sent", body: "Each AI step says what left the browser, down to whether sample rows were included." },
        ],
      },
      {
        heading: "Your values stay with you",
        body: "By default Chef sees a schema summary: column names, types and counts. Strict privacy is on from the start, and you choose if a hard request may include a few sample rows.",
        visual: "privacy",
        cells: [
          { visual: "insights", title: "Questions about your data", body: "Ask which column has the most gaps or what a field means; Chef answers from the schema." },
          { visual: "undo", title: "Undo anything", body: "An AI step is a step like any other: undo it, redo it, or go back past it." },
        ],
      },
    ],
  },
  {
    slug: "recipes",
    href: "/product/recipes",
    name: "Recipes",
    menu: "Save the steps once and replay them on next month's file",
    label: "Recipes",
    headline: "Next month's export, cleaned in one drop",
    lead: "Every cleanup is a list of steps. Save it as a recipe and run it on the next export: the same steps, in order, deterministically, with no AI call.",
    pitch: "Recipes replay exactly, without asking the AI again, and tell you which column went missing if the export changed.",
    features: [
      { name: "Save as a recipe", detail: "Any file's steps become a recipe in one click, named for the job it does." },
      { name: "Run on a new file", detail: "Drop next month's export on a recipe, or pick a file you already have." },
      { name: "No AI on replay", detail: "A recipe runs the saved SQL in order. It costs no AI request and gives the same result every time." },
      { name: "Missing columns", detail: "If the new export lacks a column a step needs, the recipe stops and names it." },
    ],
    blocks: [
      {
        heading: "Clean it once, then let it run",
        body: "The first month you clean by hand, a click or a sentence at a time. Save the steps, and from then on the cleanup is a drop: the recipe runs every step against the new file.",
        visual: "rerun",
        cells: [
          { visual: "recipes", title: "A shelf of recipes", body: "Every recipe shows its steps, the file it came from and the columns it needs." },
          { visual: "missing", title: "Told, not broken", body: "When a column is missing, the run stops at that step and says which column." },
        ],
      },
      {
        heading: "The same result, every time",
        body: "A recipe is the saved SQL of each step, replayed in order. No model is asked again, so next month's file is cleaned exactly the way this month's was.",
        visual: "history",
        cells: [
          { visual: "export", title: "Straight to export", body: "Run the recipe and export in the same minute, the file named for its steps and date." },
          { visual: "receipt", title: "No AI call", body: "Replays say so on every step: nothing was sent, nothing was asked." },
        ],
      },
    ],
  },
  {
    slug: "privacy",
    href: "/product/privacy",
    name: "Privacy & history",
    menu: "Schema-only by default, with every step on the record",
    label: "Privacy and history",
    headline: "The AI sees the shape, never the values",
    lead: "Most AI spreadsheet tools send the whole file to a model. SheetsLLM sends column names, types and counts, keeps a receipt of every request, and never trains on your data.",
    pitch: "Strict privacy is on from the start, every AI step records what it sent, and the history keeps every step's instruction and SQL.",
    features: [
      { name: "Strict privacy", detail: "On by default: the AI sees column names and types only, never a value." },
      { name: "Receipts", detail: "Every AI step stores what was sent, so you can show anyone exactly what left." },
      { name: "Full history", detail: "Instruction, SQL, and rows and columns before and after, for every step." },
      { name: "Original kept", detail: "The uploaded file is never changed; go back to it, or to any step, at any time." },
    ],
    blocks: [
      {
        heading: "Schema in, values out",
        body: "When you ask Chef something, it gets a summary of your columns. The rows stay where they are. Turn on sample rows only for a hard request, and the receipt says so.",
        visual: "privacy",
        cells: [
          { visual: "receipt", title: "A receipt per request", body: "Column names and types sent, and whether any sample rows went with them." },
          { visual: "sql", title: "Read-only SQL", body: "What runs against your file is checked as read-only before it runs." },
        ],
      },
      {
        heading: "A history finance can read",
        body: "Every step keeps the instruction, the SQL that ran, and the rows and columns before and after. Undo one, redo it, or go back to any step; the original file is never touched.",
        visual: "history",
        cells: [
          { visual: "undo", title: "Go back anywhere", body: "Return to any step and carry on from there, without losing the file." },
          { visual: "export", title: "Exports that say what they hold", body: "File names carry how many steps were applied and the date, so a download is never a mystery." },
        ],
      },
    ],
  },
];

export const productPage = (slug: string) => PRODUCT_PAGES.find((p) => p.slug === slug);
