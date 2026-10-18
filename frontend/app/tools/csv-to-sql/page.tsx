import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { CsvToSqlTool } from "@/components/tools/MoreTools";

export const metadata: Metadata = {
  title: "CSV to SQL Converter: CREATE TABLE and INSERT (Free)",
  description: "Convert a CSV to SQL INSERT statements with a CREATE TABLE for PostgreSQL, MySQL or SQLite, types read from the values. Free, in your browser.",
  alternates: { canonical: "/tools/csv-to-sql" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/csv-to-sql"
      title={"CSV to SQL converter"}
      intro={"Turn a CSV into SQL you can run: a CREATE TABLE with a type for each column, read from its values, and INSERT statements in batches. Choose PostgreSQL, MySQL or SQLite."}
      steps={[
  "Choose your CSV file. It is read locally in your browser.",
  "Pick the database and a table name.",
  "Copy the SQL or download it as a .sql file."
]}
      faq={[
  {
    "q": "Is my file uploaded anywhere?",
    "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
  },
  {
    "q": "How are types chosen?",
    "a": "A column of whole numbers becomes an integer, numbers with decimals a double, true and false a boolean, and anything else text."
  },
  {
    "q": "What happens to empty cells?",
    "a": "They become NULL."
  },
  {
    "q": "Are quotes in values safe?",
    "a": "Yes. Single quotes are doubled and names are quoted for the database you pick."
  }
]}
    >
      <CsvToSqlTool />
    </ToolShell>
  );
}
