const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_FILE = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(ROOT_DIR, "codebase.md");

// Directories to skip
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "out",
  "build",
  "dist",
  ".vercel",
  ".turbo",
  ".gemini",
  ".idea",
  ".cache",
]);

// Binary file extensions to omit from code dump
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".tiff",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".exe",
  ".bin",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".mp3",
  ".mp4",
  ".mov",
  ".wav",
]);

// Large files or generated files to omit from full code dump
const OMIT_CONTENT_FILES = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]);

// Mapping of file extensions to markdown syntax language tags
const LANGUAGE_MAP = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".html": "html",
  ".md": "markdown",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".sh": "bash",
  ".bash": "bash",
  ".ps1": "powershell",
  ".svg": "xml",
  ".xml": "xml",
  ".toml": "toml",
  ".ini": "ini",
};

function getLanguage(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (LANGUAGE_MAP[ext]) return LANGUAGE_MAP[ext];
  const base = path.basename(filename).toLowerCase();
  if (base.startsWith(".env")) return "shell";
  if (base === ".gitignore") return "gitignore";
  return "";
}

function normalizePath(p) {
  return p.replace(/\\/g, "/");
}

function shouldIgnore(entryName, fullPath, isDir) {
  if (isDir) {
    return IGNORED_DIRS.has(entryName);
  }
  // Ignore the output file itself
  if (path.resolve(fullPath) === path.resolve(OUTPUT_FILE)) return true;
  // Ignore OS metadata files
  if (entryName === ".DS_Store" || entryName === "Thumbs.db") return true;
  // Ignore env files to prevent leaking secrets
  if (entryName.startsWith(".env")) return true;
  // Ignore typescript build info cache
  if (entryName.endsWith(".tsbuildinfo")) return true;
  return false;
}

// Build directory tree data structure
function scanDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  const dirs = [];
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (shouldIgnore(entry.name, fullPath, entry.isDirectory())) {
      continue;
    }
    if (entry.isDirectory()) {
      dirs.push({
        name: entry.name,
        fullPath,
        children: scanDirectory(fullPath),
      });
    } else if (entry.isFile()) {
      files.push({
        name: entry.name,
        fullPath,
      });
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return { dirs, files };
}

// Render tree structure as ASCII text
function renderTree(node, prefix = "") {
  let lines = [];
  const total = node.dirs.length + node.files.length;
  let index = 0;

  for (const dir of node.dirs) {
    index++;
    const isLast = index === total;
    const branch = isLast ? "└── " : "├── ";
    lines.push(`${prefix}${branch}${dir.name}/`);
    const nextPrefix = prefix + (isLast ? "    " : "│   ");
    lines = lines.concat(renderTree(dir.children, nextPrefix));
  }

  for (const file of node.files) {
    index++;
    const isLast = index === total;
    const branch = isLast ? "└── " : "├── ";
    lines.push(`${prefix}${branch}${file.name}`);
  }

  return lines;
}

// Flatten files list for content printing (matches tree traversal order)
function collectFiles(node) {
  let list = [];
  for (const dir of node.dirs) {
    list = list.concat(collectFiles(dir.children));
  }
  for (const file of node.files) {
    list.push(file);
  }
  return list;
}

function stripAnsi(str) {
  if (!str) return "";
  return str.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "").replace(/\r\n/g, "\n");
}

const HYGIENE_COMMANDS = [
  {
    id: "format",
    name: "Code Formatting (Prettier)",
    command: "pnpm format:check",
    description: "Verify codebase follows Prettier formatting rules",
  },
  {
    id: "lint",
    name: "Code Quality (ESLint)",
    command: "pnpm lint",
    description: "Verify zero ESLint warnings and errors across all files",
  },
  {
    id: "typecheck",
    name: "Type Safety (TypeScript)",
    command: "pnpm typecheck",
    description: "Verify TypeScript compiles cleanly with strict checks without emitting",
  },
  {
    id: "build",
    name: "Production Build (Next.js)",
    command: "pnpm build",
    description: "Verify Next.js compiles, bundles, and generates production pages",
  },
];

function runCodeHygieneChecks() {
  console.log("\n========================================");
  console.log(" Running Code Hygiene Commands");
  console.log("========================================");
  const results = [];

  for (const check of HYGIENE_COMMANDS) {
    console.log(`\n[Running] ${check.name} -> \`${check.command}\`...`);
    const startTime = Date.now();
    let status = "FAIL";
    let exitCode = null;
    let output = "";

    try {
      const res = spawnSync(check.command, {
        cwd: ROOT_DIR,
        shell: true,
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "true",
          FORCE_COLOR: "0",
          NO_COLOR: "1",
        },
        maxBuffer: 10 * 1024 * 1024,
      });

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
      exitCode = res.status !== null ? res.status : res.error ? 1 : 0;
      const combined = [res.stdout, res.stderr].filter(Boolean).join("\n");
      output = stripAnsi(combined).trim();

      if (exitCode === 0) {
        status = "PASS";
        console.log(`  Result: [PASS] (took ${durationSec}s)`);
      } else {
        status = "FAIL";
        console.log(`  Result: [FAIL] (exit code ${exitCode}, took ${durationSec}s)`);
      }

      results.push({
        ...check,
        status,
        exitCode,
        duration: `${durationSec}s`,
        output:
          output || (status === "PASS" ? "Clean (no output)" : "Command failed with no output"),
      });
    } catch (err) {
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`  Result: [FAIL] (execution error: ${err.message})`);
      results.push({
        ...check,
        status: "FAIL",
        exitCode: 1,
        duration: `${durationSec}s`,
        output: `Execution error: ${err.message}`,
      });
    }
  }

  console.log("\n========================================");
  console.log(" Code Hygiene Checks Finished");
  console.log("========================================\n");
  return results;
}

function renderHygieneSection(results) {
  const lines = [];
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = total - passed;
  const overallStatus = failed === 0 ? "PASS" : "FAIL";

  lines.push("## Code Hygiene Results\n");
  lines.push(`> **Executed on:** ${new Date().toISOString()}`);
  lines.push(
    `> **Overall Status:** **${overallStatus}** (${passed}/${total} passed, ${failed} failed)\n`,
  );

  lines.push("| Check | Command | Status | Duration | Description |");
  lines.push("| :--- | :--- | :---: | :---: | :--- |");
  for (const r of results) {
    lines.push(
      `| **${r.name}** | \`${r.command}\` | **${r.status}** | ${r.duration} | ${r.description} |`,
    );
  }
  lines.push("");

  lines.push("### Detailed Hygiene Output\n");
  results.forEach((r, idx) => {
    lines.push(`#### ${idx + 1}. ${r.name} — ${r.status}\n`);
    lines.push(`- **Command:** \`${r.command}\``);
    lines.push(`- **Result:** **${r.status}** (exit code: ${r.exitCode})`);
    lines.push(`- **Duration:** ${r.duration}`);
    lines.push(`- **Description:** ${r.description}\n`);
    lines.push("````text");
    lines.push(r.output);
    lines.push("````\n");
  });

  return lines.join("\n");
}

function generateMarkdown() {
  const rootName = path.basename(ROOT_DIR);
  const scanned = scanDirectory(ROOT_DIR);
  const treeLines = [rootName + "/", ...renderTree(scanned)];
  const allFiles = collectFiles(scanned);

  const sections = [];

  // Header & Tree Structure
  sections.push("# Codebase Overview\n");
  sections.push(`> Generated on: ${new Date().toISOString()}\n> Total files: ${allFiles.length}\n`);
  sections.push("## Project Structure\n");
  sections.push("```text\n" + treeLines.join("\n") + "\n```\n");

  // Codebase Content
  sections.push("## File Contents\n");

  for (const file of allFiles) {
    const relPath = normalizePath(path.relative(ROOT_DIR, file.fullPath));
    const ext = path.extname(file.name).toLowerCase();
    const lang = getLanguage(file.name);

    sections.push(`### \`${relPath}\`\n`);

    if (BINARY_EXTENSIONS.has(ext)) {
      sections.push("*[Binary file content omitted]*\n");
      continue;
    }

    if (OMIT_CONTENT_FILES.has(file.name)) {
      sections.push("*[Large lockfile content omitted]*\n");
      continue;
    }

    try {
      const content = fs.readFileSync(file.fullPath, "utf8");
      // Use 4 backticks so any 3 backticks in the file content won't break markdown formatting
      sections.push(`\`\`\`\`${lang}\n${content}\n\`\`\`\`\n`);
    } catch (err) {
      sections.push(`*[Error reading file: ${err.message}]*\n`);
    }
  }

  // Code Hygiene Results (always appended at the very bottom)
  const hygieneResults = runCodeHygieneChecks();
  sections.push(renderHygieneSection(hygieneResults));

  const outputContent = sections.join("\n");
  fs.writeFileSync(OUTPUT_FILE, outputContent, "utf8");

  console.log(`Successfully generated codebase markdown:`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  console.log(`  Files included: ${allFiles.length}`);
  console.log(`  Size: ${(Buffer.byteLength(outputContent, "utf8") / 1024).toFixed(2)} KB`);
}

generateMarkdown();
