/* The help page: what the app does, in the order a person meets it. One
   section per part of the product, each with an id the app can link to
   (/help#chef from the chat panel, say). Plain lists, no screenshots: the
   page must stay true when the screens change. */

import { DEFAULT_PLANS, limitText } from "@/lib/plans";

export type HelpSection = {
  id: string;
  title: string;
  intro: string;
  /** Short items, each one thing a person can do or should know */
  items: string[];
};

/** The one-click fixes, by the words the column menu uses. Kept here so the
 *  help page and the menu are checked against each other in a test. */
export const ONE_CLICK_FIXES: { name: string; what: string }[] = [
  { name: "Trim whitespace", what: "strips the spaces around every value in a text column" },
  { name: "Fill empty cells", what: "writes one value into every empty cell of a column" },
  { name: "Drop rows where empty", what: "removes the rows where a column has nothing in it" },
  { name: "Keep rows where", what: "keeps, or removes, the rows where a column is, contains, starts with, is more than, or is empty" },
  { name: "Add columns from a lookup", what: "brings columns in from a linked file, matched on a key, one match per row; rows with no match stay and say so" },
  { name: "Remove duplicate rows", what: "keeps the first of each repeated row, for the whole row or one column" },
  { name: "Standardise dates", what: "reads dates written two ways into one date column" },
  { name: "Clean numbers", what: "reads $1,234.50, (12) and 12% as numbers, and says which values could not be read" },
  { name: "Change type to", what: "turns a column into whole numbers, numbers, dates or text" },
  { name: "Sort all rows", what: "orders the whole file by a column, not only the rows on screen" },
  { name: "Rename", what: "gives a column a new name and keeps it where it was" },
  { name: "Drop column", what: "removes a column" },
];

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "start",
    title: "Getting started",
    intro: "A file in, a cleaned file out, and the steps between saved for next time.",
    items: [
      "Drop a CSV, Excel, JSON or Parquet file on the upload screen, or open a sample. A workbook asks which sheet.",
      "The grid shows the first 500 rows. The strip above the columns shows how complete each one is.",
      "Every column header has a menu of one-click fixes. Each fix is a step: undo it, see it in the history, save it in a recipe.",
      "Chef, on the right, takes plain words: a change to make or a question to answer.",
      "Export as CSV, Excel, JSON, TSV or Parquet. The file name says how many steps were applied and when.",
    ],
  },
  {
    id: "chef",
    title: "What Chef can do",
    intro: "Chef reads a request, writes one read-only query, and either applies it as a step or shows you the answer.",
    items: [
      "A change: \"add a Margin column equal to MRP minus Landing Cost\", \"title-case the Region column\", \"keep rows where Status is paid\". The result is a step you can undo.",
      "A question: \"which region has the most orders?\", \"how many rows have no email?\", \"total MRP by month\". Chef runs a query on every row and shows the answer and the rows behind it. Nothing changes.",
      "A question about the file itself: \"what columns do I have?\", \"what could I clean here?\". Answered from the column names and types.",
      "Another file of yours, linked from the Lookup tables button under a short name: \"add Manager from managers by Region\" brings its columns in on a key, keeping every row of this file. Chef sees its column names and types, nothing else.",
      "Strict privacy is on by default: Chef sees column names, types and counts, never a value. Turn it off on the account page to send a few sample rows for harder requests. Every AI step records what was sent.",
      "A request a one-click fix already covers (\"trim Email\", \"keep rows where Amount > 0\") shows an Apply without AI chip; use it and no AI request is spent.",
      "Esc stops Chef. A stopped request may still land as a step; the panel watches for it.",
      "Recipes, one-click fixes, undo and redo never call the AI. Only a message to Chef counts as an AI request.",
    ],
  },
  {
    id: "fixes",
    title: "One-click fixes",
    intro: "From any column header's menu. No AI, no waiting, and each one is a step like any other.",
    items: ONE_CLICK_FIXES.map((f) => `${f.name}: ${f.what}.`),
  },
  {
    id: "recipes",
    title: "Recipes",
    intro: "The steps you took on one file, saved to run on the next one in one click.",
    items: [
      "Save: after an export, or from the steps rail, name the steps as a recipe.",
      "Run: drop next month's file on the recipe from the upload screen, or pick a file from the Recipes page. No AI call; the saved steps run as they are.",
      "A renamed column: the run asks which of the file's columns is the one the recipe expects, with a guess, and can remember the answer for next month.",
      "The report: each step's rows in and out beside the last run's. A step whose effect moved a lot, or left no rows, is flagged.",
      "Checks: rules the recipe runs on the cleaned rows every time, such as a column being unique, never empty, at least a number, or one of a list. A failing check warns; it does not undo the run.",
      "Edit: rename the recipe, move steps, remove steps, or replace them with another file's steps. A reorder is planned on the file first, so a step moved ahead of one it needs is refused by name.",
      `The Free plan holds ${limitText(DEFAULT_PLANS.free.recipes)} saved recipe${DEFAULT_PLANS.free.recipes === 1 ? "" : "s"}; Pro is unlimited.`,
    ],
  },
  {
    id: "history",
    title: "Steps, undo and history",
    intro: "Every change is a step with the instruction, the query that ran, and the rows before and after.",
    items: [
      "Undo takes the last step back and offers Redo, which puts it back with no AI call.",
      "History lists every step. Go back to any of them, or remove one from the middle: the steps after it run again without it, and one that needs it is named instead.",
      "Sorting the grid sorts the rows on screen. Sort all rows, from the column menu, sorts the file as a step.",
      "The original file is never changed. Go back to the original at any time.",
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    intro: "Your file stays on the server that cleans it. The AI gets the shape of it, not the contents.",
    items: [
      "Strict privacy, on by default: the AI sees column names, types and counts.",
      "Off: it also sees up to five sample values per column and up to five rows, to write better queries for hard requests.",
      "Each AI step keeps a receipt of what was sent. Cache hits, recipes and one-click fixes say No AI call.",
      "Delete any file from the Files page, or delete your account and everything in it from the account page.",
    ],
  },
  {
    id: "plans",
    title: "Plans and limits",
    intro: "Free for the monthly file; Pro for the volume.",
    items: [
      `Free: ${limitText(DEFAULT_PLANS.free.uploads)} uploads and ${limitText(DEFAULT_PLANS.free.ai_requests)} AI requests a month, ${limitText(DEFAULT_PLANS.free.recipes)} saved recipe.`,
      `Pro: ${limitText(DEFAULT_PLANS.pro.uploads)} uploads and ${limitText(DEFAULT_PLANS.pro.ai_requests)} AI requests a month, ${limitText(DEFAULT_PLANS.pro.recipes).toLowerCase()} saved recipes.`,
      "Files up to 1,000,000 rows and 500 columns, 400 MB. Excel export stops at 250,000 rows; CSV and Parquet have no cap.",
      "Counters reset on the first of each month. At a cap, uploads and AI requests pause; files, recipes and history stay.",
    ],
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    intro: "In the workspace.",
    items: [
      "Ctrl+K (Cmd+K on a Mac): the command palette.",
      "/: focus Chef's box.",
      "Ctrl+Enter: send to Chef.",
      "Ctrl+Z: undo the last step.",
      "Ctrl+S: export.",
      "Esc: stop Chef, or close what is open.",
    ],
  },
];

export const helpSection = (id: string) => HELP_SECTIONS.find((s) => s.id === id);
