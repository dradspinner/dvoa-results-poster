# DVOA Results Poster

Standalone Windows tool for posting orienteering event results online. Imports MeOS results (IOF 3.0 XML or OE2003 CSV) and generates HTML results pages, splits analysis, and flat data exports.

## Download

Grab the latest portable exe from [Releases](https://github.com/dradspinner/dvoa-results-poster/releases). No installation required — just run `DVOA_Results_Poster.exe`.

## Features

### Import Formats
The app auto-detects the file format when loaded:

| Format | Sex | Year of Birth | Recommended |
|--------|-----|---------------|-------------|
| **OE2003 CSV** (semicolon-delimited) | ✅ | ✅ (2-digit → 4-digit) | **Yes** — includes all fields |
| **IOF 3.0 XML** | ❌ (omitted by MeOS) | ✅ | Use when CSV unavailable |

**OE2003 CSV** is the recommended export from MeOS because it includes sex/gender data that MeOS deliberately omits from IOF 3.0 XML results exports for privacy reasons.

In MeOS: **Competition → Export Result and Splits → Export type: OE2003 CSV**

### Validation
- **XML compatibility checker** flags entries that appear to be groups but are encoded as individuals, with a one-click **Create Corrected Copy** option (XML only)
- **Group / Solo validation**: entries with no year of birth or sex are flagged for user confirmation before export. Toggle each entry between Group and Solo, or use bulk "All Group" / "All Solo" buttons.

### HTML Export
Two HTML files are generated in the same directory as the input file:

- **`_results.html`** — Professional results page with:
  - Automatic course color sorting (White → Yellow → Orange → Brown → Green → Red → Blue)
  - Gold/silver/bronze highlights for top 3
  - Time behind calculation for all finishers
  - Proper grouping: Finishers → MP → DNF
  - Score-O support with points and penalties
  - Mobile responsive design and print styles

- **`_splits.html`** — AttackPoint-style splits analysis with:
  - Green-to-red color coding for split performance
  - Bold highlights for fastest splits
  - Cumulative and leg times displayed side by side

### Flat Data Export (CSV & XLSX)

Export a flat results table for spreadsheet import. Available as both CSV and XLSX.

**Columns:**

| # | Column | Description |
|---|--------|-------------|
| 1 | Last Name | Family name |
| 2 | First Name | Given name |
| 3 | Year of Birth | 4-digit year (from CSV 2-digit YB or XML BirthDate) |
| 4 | Sex | M or F (available in CSV; omitted from IOF 3.0 XML) |
| 5 | Club | Organisation name from XML |
| 6 | Chip # | SI card number from ControlCard element |
| 7 | Group/Solo | "Group" or "Solo" — see detection logic below |
| 8 | Time | Finishing time as Excel decimal (seconds ÷ 86400). Format as `[h]:mm:ss` in Excel. |
| 9 | Place | Finishing position (blank for non-finishers) |
| 10 | Status | Blank for OK finishers; MP, DNF, or DNS for others |
| 11 | Course | Class/course name from XML |

**XLSX notes:**
- The Time column is pre-formatted as `[h]:mm:ss` so times display correctly when opened
- Year of Birth and Place are stored as numbers, not text

**Group/Solo detection:**
- **Structural group** (automatic): empty Family name with non-empty Given name — this is MeOS's internal group encoding
- **Predicted group** (shown for validation): non-empty last name, but no year of birth AND no sex in the XML data. The user confirms each prediction before export.
- **Solo** (automatic): has year of birth or sex

Nationality codes and BibNumber fields are intentionally not used for group detection, as volunteers enter these inconsistently.

**Output filenames:**
- CSV: `{input}_flat.csv`
- XLSX: `{input}_flat.xlsx`
- Hyphens in the input filename are replaced with underscores

## Development

### Prerequisites
- Node.js 20+
- npm

### Setup
```
npm install
```

### Run in development
```
npm run electron:dev
```

### Run tests
```
npm test
```

### Build portable exe
```
npm run pack:win
```

Output: `dist-electron/DVOA_Results_Poster.exe`

## Tech Stack
- **Electron** — desktop shell
- **React** + **TypeScript** — UI
- **Ant Design** — component library
- **Vite** — build tool
- **xlsx** (SheetJS) — XLSX export (lazy-loaded)

## License
© DVOA
