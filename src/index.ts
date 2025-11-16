/**
 * video-to-linear (chunked + full diagnostics)
 * --------------------------------------------
 * Uploads a video in chunks to AssemblyAI, shows true progress,
 * transcribes + summarizes feedback into Linear issues.
 */

import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import inquirer from "inquirer";
import ProgressBar from "progress";
import { PassThrough } from "stream";
// Video processing imports removed for speed
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

dotenv.config();

/* ---------------- ENV Validation ---------------- */
const AAI_KEY = process.env.ASSEMBLYAI_API_KEY?.trim();
const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();
const LINEAR_KEY = process.env.LINEAR_API_KEY?.trim();
const TEAM_ID = process.env.LINEAR_TEAM_ID?.trim();

if (!AAI_KEY || !OPENAI_KEY || !LINEAR_KEY || !TEAM_ID) {
  console.error("❌ Missing required .env values:");
  if (!AAI_KEY) console.error("  - ASSEMBLYAI_API_KEY missing");
  if (!OPENAI_KEY) console.error("  - OPENAI_API_KEY missing");
  if (!LINEAR_KEY) console.error("  - LINEAR_API_KEY missing");
  if (!TEAM_ID) console.error("  - LINEAR_TEAM_ID missing");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// execAsync removed since video processing is no longer used

/* ---------------- Path Handling ---------------- */
function sanitizePath(input: string) {
  return input.trim().replace(/^'|'$/g, "").replace(/^"|"$/g, "");
}

function getMimeTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".mkv":
      return "video/x-matroska";
    case ".avi":
      return "video/x-msvideo";
    default:
      return "application/octet-stream";
  }
}

function extractJsonArrayFromText(text: string) {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\n([\s\S]*?)\n```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  // Fallback: extract the first top-level JSON array substring
  const start = text.indexOf("[");
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }
  return text;
}

function mapPriorityToLinear(priority: any) {
  if (typeof priority !== "string") return 1;
  const p = priority.trim().toLowerCase();
  if (p === "high") return 3;
  if (p === "medium") return 2;
  if (p === "low") return 1;
  if (p === "none" || p === "no" || p === "0") return 0;
  return 1;
}

function sanitizeIssueForLinear(issue: any) {
  const rawTitle = issue?.Title ?? issue?.title ?? "";
  const rawDescription = issue?.Description ?? issue?.description ?? "";
  const rawPriority = issue?.Priority ?? issue?.priority ?? "";
  const rawRequirements = issue?.requirements ?? [];
  const rawAcceptanceCriteria = issue?.acceptance_criteria ?? [];
  const rawTechnicalNotes = issue?.technical_notes ?? "";

  const title = String(rawTitle).trim().slice(0, 255);
  const description = String(rawDescription).trim();
  const priority = mapPriorityToLinear(rawPriority);
  const requirements = Array.isArray(rawRequirements) ? rawRequirements : [];
  const acceptanceCriteria = Array.isArray(rawAcceptanceCriteria)
    ? rawAcceptanceCriteria
    : [];
  const technicalNotes = String(rawTechnicalNotes).trim();

  return {
    title,
    description,
    priority,
    requirements,
    acceptanceCriteria,
    technicalNotes,
  };
}

function secondsFromMaybeMs(value: number | undefined | null): number | null {
  if (value == null) return null;
  if (value > 100000) return Math.floor(value / 1000);
  return Math.floor(value);
}

function formatTimestamp(secs: number): string {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function makeTimeLink(baseUrl: string, secs: number, label: string): string {
  const ts = formatTimestamp(secs);
  return `- [${ts}](${baseUrl}#t=${secs}) ${label}`;
}

function buildTimeCodedSection(transcriptData: any, videoUrl: string): string {
  if (!videoUrl) return "";
  const lines: string[] = [];

  const chapters: any[] = Array.isArray(transcriptData?.chapters)
    ? transcriptData.chapters
    : [];
  if (chapters.length) {
    lines.push("Relevant chapters:");
    chapters.forEach((c: any, idx: number) => {
      const startSec = secondsFromMaybeMs(
        c?.start ?? c?.start_time ?? c?.startTime
      );
      const name = String(
        c?.headline ?? c?.gist ?? c?.summary ?? `Chapter ${idx + 1}`
      ).trim();
      if (startSec != null) lines.push(makeTimeLink(videoUrl, startSec, name));
    });
  }

  const highlightsContainer = transcriptData?.auto_highlights;
  const highlights: any[] = Array.isArray(highlightsContainer?.results)
    ? highlightsContainer.results
    : Array.isArray(highlightsContainer)
    ? highlightsContainer
    : [];
  if (highlights.length) {
    lines.push("");
    lines.push("Top highlights:");
    highlights.slice(0, 5).forEach((h: any) => {
      // Prefer timestamp/timestamps[0]/start
      const ts0 = h?.timestamp ?? h?.timestamps?.[0];
      const startSec = secondsFromMaybeMs(
        (typeof ts0 === "object" ? ts0?.start : ts0) ?? h?.start
      );
      const text = String(h?.text ?? h?.highlight ?? "Highlight").trim();
      if (startSec != null) lines.push(makeTimeLink(videoUrl, startSec, text));
    });
  }

  if (!lines.length) return "";
  return lines.join("\n");
}

function truncateForContext(input: string, maxLen: number): string {
  const text = String(input || "")
    .trim()
    .replace(/\s+/g, " ");
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function splitLongUtterance(utterance: any, maxWords = 50): any[] {
  const text = String(utterance?.text ?? "").trim();
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return [utterance];

  const segments: any[] = [];
  const startTime =
    utterance?.start ?? utterance?.start_time ?? utterance?.startTime ?? 0;
  const endTime =
    utterance?.end ??
    utterance?.end_time ??
    utterance?.endTime ??
    startTime + 10000;
  const duration = endTime - startTime;

  for (let i = 0; i < words.length; i += maxWords) {
    const segmentWords = words.slice(i, i + maxWords);
    const segmentText = segmentWords.join(" ");
    const segmentStart = startTime + (duration * i) / words.length;
    const segmentEnd =
      startTime +
      (duration * Math.min(i + maxWords, words.length)) / words.length;

    segments.push({
      ...utterance,
      text: segmentText,
      start: segmentStart,
      end: segmentEnd,
      start_time: segmentStart,
      end_time: segmentEnd,
    });
  }

  return segments;
}

function buildCondensedUtterances(
  transcriptData: any,
  maxChars = 10000
): string {
  let utterances: any[] = Array.isArray(transcriptData?.utterances)
    ? transcriptData.utterances
    : [];

  // Split long utterances into smaller segments
  const splitUtterances: any[] = [];
  for (const u of utterances) {
    const segments = splitLongUtterance(u, 50); // Split into ~50 word segments
    splitUtterances.push(...segments);
  }

  let out: string[] = [];
  let total = 0;
  for (const u of splitUtterances) {
    const sec =
      secondsFromMaybeMs(u?.start ?? u?.start_time ?? u?.startTime) ?? 0;
    const speaker = u?.speaker ?? u?.speaker_label ?? u?.speakerLabel ?? "";
    const line = `t=${sec}|${speaker}| ${String(u?.text ?? "").trim()}`;
    total += line.length + 1;
    if (total > maxChars) break;
    out.push(line);
  }
  return out.join("\n");
}

function getSegmentedUtterances(transcriptData: any): any[] {
  const utterances: any[] = Array.isArray(transcriptData?.utterances)
    ? transcriptData.utterances
    : [];

  // Split long utterances into smaller segments
  const splitUtterances: any[] = [];
  for (const u of utterances) {
    const segments = splitLongUtterance(u, 50); // Split into ~50 word segments
    splitUtterances.push(...segments);
  }

  return splitUtterances;
}

function buildTranscriptContextSection(transcriptData: any, videoUrl: string) {
  const lines: string[] = [];
  const utterances = getSegmentedUtterances(transcriptData);

  lines.push("Transcript context (excerpt):");

  if (utterances.length) {
    const maxItems = 6;
    for (let i = 0; i < Math.min(utterances.length, maxItems); i++) {
      const u = utterances[i];
      const speakerRaw = u?.speaker ?? u?.speaker_label ?? u?.speakerLabel;
      const speaker = speakerRaw != null ? `Speaker ${speakerRaw}` : "Speaker";
      const startSec =
        secondsFromMaybeMs(u?.start ?? u?.start_time ?? u?.startTime) ?? 0;
      const ts = formatTimestamp(startSec);
      const text = truncateForContext(u?.text ?? "", 800);
      lines.push(`- [${ts}](${videoUrl}#t=${startSec}) ${speaker}: ${text}`);
    }
  } else if (
    typeof transcriptData?.text === "string" &&
    transcriptData.text.trim().length > 0
  ) {
    const excerpt = truncateForContext(transcriptData.text, 1200);
    lines.push(excerpt);
  } else {
    return "";
  }

  return lines.join("\n");
}

function buildTimeCodedSectionForIssue(
  transcriptData: any,
  videoUrl: string,
  keywords: Set<string>
): string {
  if (!videoUrl) return "";
  const lines: string[] = [];

  const matchesKeywords = (text: string | undefined | null) => {
    if (!text) return false;
    const lower = String(text).toLowerCase();
    for (const k of keywords) {
      if (lower.includes(k)) return true;
    }
    return false;
  };

  const chapters: any[] = Array.isArray(transcriptData?.chapters)
    ? transcriptData.chapters
    : [];
  const matchedChapters: { start: number; label: string }[] = [];
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    const text = String(
      c?.headline ?? c?.gist ?? c?.summary ?? `Chapter ${i + 1}`
    );
    if (matchesKeywords(text)) {
      const startSec = secondsFromMaybeMs(
        c?.start ?? c?.start_time ?? c?.startTime
      );
      if (startSec != null)
        matchedChapters.push({ start: startSec, label: text });
    }
  }
  if (matchedChapters.length) {
    lines.push("Relevant chapters:");
    matchedChapters
      .sort((a, b) => a.start - b.start)
      .slice(0, 5)
      .forEach((mc) => lines.push(makeTimeLink(videoUrl, mc.start, mc.label)));
  }

  const highlightsContainer = transcriptData?.auto_highlights;
  const highlights: any[] = Array.isArray(highlightsContainer?.results)
    ? highlightsContainer.results
    : Array.isArray(highlightsContainer)
    ? highlightsContainer
    : [];
  const matchedHighlights: { start: number; label: string }[] = [];
  for (const h of highlights) {
    const label = String(h?.text ?? h?.highlight ?? "Highlight");
    if (!matchesKeywords(label)) continue;
    const ts0 = h?.timestamp ?? h?.timestamps?.[0];
    const startSec = secondsFromMaybeMs(
      (typeof ts0 === "object" ? ts0?.start : ts0) ?? h?.start
    );
    if (startSec != null) matchedHighlights.push({ start: startSec, label });
  }
  if (matchedHighlights.length) {
    if (lines.length) lines.push("");
    lines.push("Top highlights:");
    matchedHighlights
      .sort((a, b) => a.start - b.start)
      .slice(0, 5)
      .forEach((mh) => lines.push(makeTimeLink(videoUrl, mh.start, mh.label)));
  }

  return lines.join("\n");
}

function tokenizeForMatch(text: string): string[] {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "of",
    "to",
    "in",
    "on",
    "for",
    "with",
    "at",
    "by",
    "from",
    "as",
    "is",
    "are",
    "be",
    "this",
    "that",
    "it",
    "its",
    "we",
    "you",
    "i",
    "they",
    "them",
    "our",
    "your",
    "their",
    "was",
    "were",
    "will",
    "would",
    "can",
    "could",
    "should",
    "have",
    "has",
    "had",
    "do",
    "did",
    "done",
    "not",
    "no",
    "yes",
    "if",
    "then",
    "than",
    "when",
    "where",
    "how",
    "what",
    "why",
    "into",
    "about",
    "over",
    "under",
    "up",
    "down",
    "out",
    "too",
    "very",
  ]);
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
}

type IssueAnchor = {
  start: number;
  label: string;
  kind: "chapter" | "highlight";
};

function collectAnchorsForIssue(
  transcriptData: any,
  keywords: Set<string>
): IssueAnchor[] {
  const anchors: IssueAnchor[] = [];

  const matches = (text: string | undefined | null) => {
    if (!text) return false;
    const lower = String(text).toLowerCase();
    for (const k of keywords) if (lower.includes(k)) return true;
    return false;
  };

  const chapters: any[] = Array.isArray(transcriptData?.chapters)
    ? transcriptData.chapters
    : [];
  chapters.forEach((c: any, idx: number) => {
    const name = String(
      c?.headline ?? c?.gist ?? c?.summary ?? `Chapter ${idx + 1}`
    );
    if (!matches(name)) return;
    const start = secondsFromMaybeMs(c?.start ?? c?.start_time ?? c?.startTime);
    if (start != null) anchors.push({ start, label: name, kind: "chapter" });
  });

  const highlightsContainer = transcriptData?.auto_highlights;
  const highlights: any[] = Array.isArray(highlightsContainer?.results)
    ? highlightsContainer.results
    : Array.isArray(highlightsContainer)
    ? highlightsContainer
    : [];
  highlights.forEach((h: any) => {
    const label = String(h?.text ?? h?.highlight ?? "Highlight");
    if (!matches(label)) return;
    const ts0 = h?.timestamp ?? h?.timestamps?.[0];
    const start = secondsFromMaybeMs(
      (typeof ts0 === "object" ? ts0?.start : ts0) ?? h?.start
    );
    if (start != null) anchors.push({ start, label, kind: "highlight" });
  });

  // sort by time, dedupe by start seconds
  anchors.sort((a, b) => a.start - b.start);
  const seen = new Set<number>();
  return anchors.filter((a) =>
    seen.has(a.start) ? false : (seen.add(a.start), true)
  );
}

function collectDefaultAnchors(transcriptData: any): IssueAnchor[] {
  const anchors: IssueAnchor[] = [];
  const chapters: any[] = Array.isArray(transcriptData?.chapters)
    ? transcriptData.chapters
    : [];
  chapters.forEach((c: any, idx: number) => {
    const start = secondsFromMaybeMs(c?.start ?? c?.start_time ?? c?.startTime);
    const label = String(
      c?.headline ?? c?.gist ?? c?.summary ?? `Chapter ${idx + 1}`
    );
    if (start != null) anchors.push({ start, label, kind: "chapter" });
  });
  const highlightsContainer = transcriptData?.auto_highlights;
  const highlights: any[] = Array.isArray(highlightsContainer?.results)
    ? highlightsContainer.results
    : Array.isArray(highlightsContainer)
    ? highlightsContainer
    : [];
  highlights.forEach((h: any) => {
    const ts0 = h?.timestamp ?? h?.timestamps?.[0];
    const start = secondsFromMaybeMs(
      (typeof ts0 === "object" ? ts0?.start : ts0) ?? h?.start
    );
    const label = String(h?.text ?? h?.highlight ?? "Highlight");
    if (start != null) anchors.push({ start, label, kind: "highlight" });
  });
  anchors.sort((a, b) => a.start - b.start);
  const seen = new Set<number>();
  return anchors.filter((a) =>
    seen.has(a.start) ? false : (seen.add(a.start), true)
  );
}

function renderAnchors(anchors: IssueAnchor[], videoUrl: string): string {
  if (!anchors.length) return "";
  const lines: string[] = ["Relevant moments:"];
  anchors
    .slice(0, 5)
    .forEach((a) => lines.push(makeTimeLink(videoUrl, a.start, a.label)));
  return lines.join("\n");
}

function buildContextAroundAnchor(
  transcriptData: any,
  videoUrl: string,
  anchorSec: number,
  windowSec = 30,
  maxLines = 6
): string {
  const utterances = getSegmentedUtterances(transcriptData);
  if (!utterances.length) return "";
  const startWin = Math.max(0, anchorSec - windowSec);
  const endWin = anchorSec + windowSec;
  const lines: string[] = ["Transcript context (anchor excerpt):"];
  for (const u of utterances) {
    const start = secondsFromMaybeMs(u?.start ?? u?.start_time ?? u?.startTime);
    if (start == null || start < startWin || start > endWin) continue;
    const speakerRaw = u?.speaker ?? u?.speaker_label ?? u?.speakerLabel;
    const speaker = speakerRaw != null ? `Speaker ${speakerRaw}` : "Speaker";
    const ts = formatTimestamp(start);
    const text = truncateForContext(u?.text ?? "", 800);
    lines.push(`- [${ts}](${videoUrl}#t=${start}) ${speaker}: ${text}`);
    if (lines.length - 1 >= maxLines) break;
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

function buildIssueSpecificContext(
  title: string,
  description: string,
  transcriptData: any,
  videoUrl: string
): string {
  const utterances = getSegmentedUtterances(transcriptData);
  if (!utterances.length) return "";

  const keywords = new Set([
    ...tokenizeForMatch(title),
    ...tokenizeForMatch(description),
  ]);
  if (keywords.size === 0) return "";

  type Scored = { score: number; u: any };
  const scored: Scored[] = utterances.map((u) => {
    const text = String(u?.text || "").toLowerCase();
    let score = 0;
    for (const k of keywords) if (text.includes(k)) score++;
    return { score, u };
  });

  const top = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((s) => s.u);

  if (!top.length) return "";

  const lines: string[] = ["Transcript context (matched excerpt):"];
  for (const u of top) {
    const speakerRaw = u?.speaker ?? u?.speaker_label ?? u?.speakerLabel;
    const speaker = speakerRaw != null ? `Speaker ${speakerRaw}` : "Speaker";
    const startSec =
      secondsFromMaybeMs(u?.start ?? u?.start_time ?? u?.startTime) ?? 0;
    const ts = formatTimestamp(startSec);
    const text = truncateForContext(u?.text ?? "", 800);
    lines.push(`- [${ts}](${videoUrl}#t=${startSec}) ${speaker}: ${text}`);
  }

  return lines.join("\n");
}

function buildRequirementsSection(
  requirements: string[],
  acceptanceCriteria: string[],
  technicalNotes: string
): string {
  const sections: string[] = [];

  if (requirements.length > 0) {
    sections.push("## Requirements");
    requirements.forEach((req, i) => {
      sections.push(`${i + 1}. ${req}`);
    });
  }

  if (acceptanceCriteria.length > 0) {
    sections.push("## Acceptance Criteria");
    acceptanceCriteria.forEach((criteria, i) => {
      sections.push(`${i + 1}. ${criteria}`);
    });
  }

  if (technicalNotes.trim()) {
    sections.push("## Technical Notes");
    sections.push(technicalNotes);
  }

  return sections.join("\n\n");
}

/* ---------------- Video Processing ---------------- */
// Visual context generation removed for speed

/* ---------------- Prompt for file ---------------- */
async function getVideoPath() {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "filePath",
      message: "Enter the path to your video file (drag & drop here):",
      validate: (input) => {
        const clean = sanitizePath(input);
        if (!fs.existsSync(clean)) return `File not found: ${clean}`;
        const ext = path.extname(clean).toLowerCase();
        if (![".mp4", ".mov", ".mkv", ".avi"].includes(ext))
          return "Please provide a valid video file (.mp4, .mov, .mkv, .avi)";
        return true;
      },
    },
  ]);
  return sanitizePath(answers.filePath);
}

/* ---------------- Video Compression ---------------- */
async function compressVideo(inputPath: string): Promise<string | null> {
  try {
    const inputDir = path.dirname(inputPath);
    const inputName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(inputDir, `${inputName}_compressed.mov`);

    console.log(`🎬 Compressing ${path.basename(inputPath)}...`);

    // Check if compressed file already exists
    if (fs.existsSync(outputPath)) {
      console.log(
        `✅ Using existing compressed file: ${path.basename(outputPath)}`
      );
      return outputPath;
    }

    // Use ffmpeg to compress the video with progress and shorter timeout
    const command = `ffmpeg -i "${inputPath}" -c:v libx264 -crf 28 -c:a aac -preset fast -y "${outputPath}"`;

    console.log(`⏱️ Compression timeout: 2 minutes`);
    await execAsync(command, { timeout: 120000 }); // 2 minute timeout

    if (fs.existsSync(outputPath)) {
      return outputPath;
    }
    return null;
  } catch (error: any) {
    if (error.code === "TIMEOUT") {
      console.error(`❌ Compression timed out after 2 minutes`);
      console.error(
        `💡 Try using a smaller video file or check if the file is corrupted`
      );
    } else {
      console.error(`❌ Compression failed:`, error.message);
    }
    return null;
  }
}

/* ---------------- Upload (single streaming POST with real progress) ---------------- */
async function uploadVideo(filePath: string) {
  console.log(`🎥 Uploading ${path.basename(filePath)} via streaming...`);

  let stats = fs.statSync(filePath);
  let fileSize = stats.size;
  let fileSizeMB = Math.round(fileSize / 1024 / 1024);

  console.log(`📊 File size: ${fileSizeMB}MB (${fileSize} bytes)`);

  // Try to compress videos for better upload speed and reliability
  console.log(`🔄 Optimizing video for upload...`);

  const compressedPath = await compressVideo(filePath);
  if (compressedPath) {
    console.log(`✅ Optimization complete: ${compressedPath}`);
    // Update file path to use compressed version
    filePath = compressedPath;
    stats = fs.statSync(filePath);
    const newFileSizeMB = Math.round(stats.size / 1024 / 1024);
    console.log(
      `📊 Optimized size: ${newFileSizeMB}MB (${Math.round(
        (1 - stats.size / fileSize) * 100
      )}% reduction)`
    );

    // Update file size for progress bar
    fileSize = stats.size;
    fileSizeMB = newFileSizeMB;
  } else {
    console.log(`⚠️ Compression failed, using original file`);
    console.log(`📊 Original size: ${fileSizeMB}MB`);

    // Check if original file is too large
    if (fileSizeMB > 200) {
      console.error(
        `❌ Original file too large: ${fileSizeMB}MB (limit: 200MB)`
      );
      console.error(`💡 Try using a smaller video file or compress manually`);
      throw new Error(`File too large: ${fileSizeMB}MB`);
    }
  }

  const bar = new ProgressBar("Uploading [:bar] :percent :etas", {
    width: 30,
    total: fileSize,
  });

  // Add timeout and better error handling
  const uploadTimeout = Math.max(300000, fileSizeMB * 10000); // 5min base + 10s per MB
  console.log(`⏱️ Upload timeout: ${Math.round(uploadTimeout / 1000)}s`);

  try {
    console.log(`🚀 Starting upload to AssemblyAI...`);
    console.log(`📡 Endpoint: https://api.assemblyai.com/v2/upload`);
    console.log(`🔑 API Key: ${AAI_KEY?.substring(0, 8)}...`);

    const res = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      fs.createReadStream(filePath),
      {
        headers: {
          authorization: AAI_KEY!,
          "Content-Type": getMimeTypeForPath(filePath),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: uploadTimeout,
        // Track actual upload progress
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const uploaded = progressEvent.loaded;
            const percent = Math.round((uploaded * 100) / progressEvent.total);

            // Update progress bar to show actual upload progress
            bar.update(uploaded / progressEvent.total);

            // Show detailed progress every 10%
            if (percent % 10 === 0 && percent > 0) {
              console.log(
                `\n📤 Uploaded ${percent}% (${Math.round(
                  uploaded / 1024 / 1024
                )}MB / ${Math.round(progressEvent.total / 1024 / 1024)}MB)`
              );
            }
          }
        },
      }
    );
    const uploadUrl: string | undefined = res.data?.upload_url;
    if (!uploadUrl) throw new Error("AssemblyAI did not return upload_url.");
    console.log("\n✅ Upload complete:", uploadUrl);
    return uploadUrl;
  } catch (err: any) {
    if (err.code === "ECONNABORTED") {
      console.error(
        `\n❌ Upload timeout after ${Math.round(uploadTimeout / 1000)}s`
      );
      console.error(
        `💡 Try uploading a smaller file or check your internet connection`
      );
    } else if (err.response?.status === 413) {
      console.error(
        `\n❌ File too large (${fileSizeMB}MB). AssemblyAI has upload limits.`
      );
      console.error(
        `💡 Try compressing the video or splitting it into smaller parts`
      );
    } else {
      console.error("\n❌ Upload failed:", err.response?.data || err.message);
    }
    throw err;
  }
}

/* ---------------- Request Transcription ---------------- */
async function requestTranscript(audioUrl: string) {
  console.log("📝 Requesting transcription...");
  const body = {
    audio_url: audioUrl,
    auto_chapters: true,
    auto_highlights: true,
    speaker_labels: true,
  };

  try {
    const res = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      body,
      {
        headers: {
          Authorization: AAI_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ Transcription started:", res.data.id);
    return res.data.id;
  } catch (err: any) {
    console.error(
      "❌ AssemblyAI transcript request failed:",
      err.response?.data || err.message
    );
    throw err;
  }
}

/* ---------------- Poll Until Complete ---------------- */
async function waitForTranscript(id: string) {
  console.log("⏳ Waiting for transcription...");
  let retries = 0;
  while (true) {
    try {
      const r = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${id}`,
        {
          headers: { authorization: AAI_KEY },
        }
      );
      const status = r.data.status;
      if (status === "completed") {
        console.log("\n✅ Transcription complete");
        return r.data;
      }
      if (status === "error") throw new Error(r.data.error);
      process.stdout.write(".");
      await sleep(10000);
      retries++;
      if (retries % 10 === 0)
        console.log(`\nStill processing (${retries * 10}s)...`);
    } catch (err: any) {
      console.error("\n⚠️ Polling error:", err.response?.data || err.message);
      await sleep(10000);
    }
  }
}

/* ---------------- Summarize to Issues ---------------- */
async function summarizeToIssues(text: string, transcriptData?: any) {
  console.log("\n🧠 Summarizing transcript into issues...");
  const prompt = `
  From this transcript of client feedback, extract ALL mentions of problems, improvements, features, bugs, or any actionable items.
  
  Be VERY comprehensive - include EVERYTHING mentioned, even minor issues, suggestions, or potential improvements. Extract separate issues for:
  - Any broken functionality
  - Any missing features
  - Any UI/UX improvements
  - Any performance issues
  - Any design problems
  - Any workflow improvements
  - Any suggestions or ideas
  - Any complaints or concerns
  - Any future enhancements
  - Any other actionable items
  
  Each issue must include:
  - Title (concise, actionable)
  - Description (detailed problem description with specific requirements)
  - Priority (High / Medium / Low)
  - anchorSec (integer seconds where the discussion starts), if you can infer it from provided utterances with timestamps
  - requirements (array of specific technical requirements to fix the issue)
  - acceptance_criteria (array of criteria that must be met for the issue to be considered complete)
  - technical_notes (additional technical context or implementation details)
  
  For the Description field, include:
  - The specific problem being described
  - Current broken behavior or missing functionality
  - Expected behavior or desired outcome
  - Impact on users and business
  
  Respond in pure JSON array format with ALL issues found.
  `;

  try {
    const condensed = transcriptData
      ? buildCondensedUtterances(transcriptData)
      : undefined;
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: text.slice(0, 10000) },
          condensed
            ? {
                role: "user",
                content:
                  "<raw_transcript>\n" +
                  "Raw transcript with timestamps (format: t=seconds|speaker| text):\n" +
                  "This is the complete transcript broken into segments. Use this for precise timing and context if needed.\n" +
                  "You can ignore this section if the main transcript text above is sufficient.\n\n" +
                  condensed +
                  "\n</raw_transcript>",
              }
            : undefined,
        ],
        temperature: 0.2,
      },
      { headers: { Authorization: `Bearer ${OPENAI_KEY}` } }
    );

    const raw = res.data.choices?.[0]?.message?.content;
    if (!raw) throw new Error("No response content from OpenAI.");
    const jsonCandidate = extractJsonArrayFromText(raw);
    const issues = JSON.parse(jsonCandidate);
    console.log(`✅ Generated ${issues.length} issues`);
    return issues;
  } catch (err: any) {
    console.error(
      "\n❌ OpenAI summarization failed:",
      err.response?.data || err.message
    );
    throw err;
  }
}

/* ---------------- Create Issues in Linear ---------------- */
async function createLinearIssues(
  issues: any[],
  teamId: string,
  availableLabels: Array<{ id: string; name: string }>,
  videoUrl: string,
  transcriptData: any,
  videoPath: string
) {
  console.log("📬 Creating issues in Linear...");
  const createdLabelsCache = new Map<string, string>();
  let processedCount = 0;
  for (const issue of issues) {
    processedCount++;
    console.log(`  📝 Processing issue ${processedCount}/${issues.length}...`);
    try {
      const {
        title,
        description,
        priority,
        requirements,
        acceptanceCriteria,
        technicalNotes,
      } = sanitizeIssueForLinear(issue);
      if (!title) {
        console.warn("  ⏭️ Skipping issue with empty title");
        continue;
      }
      let labelIds = inferLabelIdsFromIssue(
        title,
        description,
        availableLabels
      );
      if (labelIds.length === 0) {
        const cats = inferCategories(title, description);
        for (const c of cats) {
          const id = await ensureCategoryLabelId(
            c,
            availableLabels,
            teamId,
            createdLabelsCache
          );
          if (id) labelIds.push(id);
          if (labelIds.length >= 3) break;
        }
      }
      const anchorSecFromLLM =
        typeof (issue as any)?.anchorSec === "number"
          ? Math.max(0, Math.floor((issue as any).anchorSec))
          : null;
      const issueKeywords = new Set([
        ...tokenizeForMatch(title),
        ...tokenizeForMatch(description),
      ]);
      const anchors =
        anchorSecFromLLM != null
          ? [
              {
                start: anchorSecFromLLM,
                label: title,
                kind: "highlight" as const,
              },
            ]
          : issueKeywords.size
          ? collectAnchorsForIssue(transcriptData, issueKeywords)
          : collectDefaultAnchors(transcriptData);
      const firstAnchor = anchors[0];
      const timeLinks = renderAnchors(anchors, videoUrl);
      const matchedContext = firstAnchor
        ? buildContextAroundAnchor(
            transcriptData,
            videoUrl,
            firstAnchor.start,
            30,
            6
          )
        : buildIssueSpecificContext(
            title,
            description,
            transcriptData,
            videoUrl
          );
      const contextBlock =
        matchedContext ||
        buildTranscriptContextSection(transcriptData, videoUrl);

      // Build detailed requirements section
      const requirementsSection = buildRequirementsSection(
        requirements,
        acceptanceCriteria,
        technicalNotes
      );

      // Visual context generation removed for speed
      let screenshots: string[] = [];
      let clips: string[] = [];

      const parts = [
        description,
        requirementsSection,
        timeLinks,
        contextBlock,
      ].filter((p) => p && p.trim().length > 0);
      const finalDescription = parts.join("\n\n");

      console.log(`    📤 Creating Linear issue: "${title}"...`);
      const res = await axios.post(
        "https://api.linear.app/graphql",
        {
          query: `
            mutation($input: IssueCreateInput!) {
              issueCreate(input: $input) { success issue { id title } }
            }
          `,
          variables: {
            input: {
              teamId,
              title,
              description: finalDescription,
              priority,
              labelIds: labelIds.length ? labelIds : undefined,
            },
          },
        },
        {
          headers: {
            Authorization: LINEAR_KEY as string,
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30 second timeout
        }
      );

      const issueId = res.data?.data?.issueCreate?.issue?.id;
      const created = res.data?.data?.issueCreate?.issue?.title;

      if (created && issueId) {
        console.log(`  ✅ Created issue: ${created}`);

        // Visual context uploads removed for speed
      } else {
        const errors = res.data?.errors || res.data?.data?.issueCreate?.errors;
        if (errors) {
          console.error(
            "  ❌ Linear validation errors:",
            JSON.stringify(errors, null, 2)
          );
        } else {
          console.log("  ⚠️ Unexpected Linear response:", res.data);
        }
      }

      // Reduced delay between issues for faster processing
      if (processedCount < issues.length) {
        console.log(`    ⏳ Waiting 500ms before next issue...`);
        await sleep(500); // Reduced from 2000ms to 500ms
      }
    } catch (err: any) {
      console.error(
        "  ❌ Failed to create issue:",
        err.response?.data || err.message
      );
    }
  }
  console.log("✅ All issues processed");
}

/* ---------------- Linear Team Selection ---------------- */
async function fetchLinearTeams() {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      { query: `{ teams { nodes { id name key } } }` },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    const teams = res.data?.data?.teams?.nodes || [];
    return teams.map((t: any) => ({ id: t.id, name: t.name, key: t.key }));
  } catch (err: any) {
    console.error(
      "❌ Failed to fetch Linear teams:",
      err.response?.data || err.message
    );
    return [];
  }
}

async function selectLinearTeam() {
  const teams = await fetchLinearTeams();
  if (!teams.length) {
    throw new Error(
      "No Linear teams available. Set LINEAR_TEAM_ID in .env or check API key."
    );
  }

  // Check if we should auto-select from environment variable
  if (TEAM_ID && process.argv.includes("--use-env-team")) {
    const byId = teams.find((t: any) => t.id === TEAM_ID);
    const byKey = teams.find((t: any) => t.key === TEAM_ID);
    const foundTeam = byId || byKey;

    if (foundTeam) {
      console.log(
        `✅ Using team from env: ${foundTeam.name} (${foundTeam.key})`
      );
      return foundTeam.id;
    } else {
      console.warn(
        `⚠️ LINEAR_TEAM_ID "${TEAM_ID}" not found in available teams`
      );
    }
  }

  // Default: show team selection prompt
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "teamId",
      message: "Select a Linear team:",
      choices: teams.map((t: any) => ({
        name: `${t.name} (${t.key})`,
        value: t.id,
      })),
    },
  ]);
  return answers.teamId as string;
}

/* ---------------- Linear Labels + Inference ---------------- */
async function fetchLinearLabels(
  teamId: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `query($id: String!) { team(id: $id) { labels { nodes { id name } } } }`,
        variables: { id: teamId },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    const labels = res.data?.data?.team?.labels?.nodes || [];
    return labels.map((l: any) => ({ id: l.id, name: l.name }));
  } catch (err: any) {
    console.error(
      "❌ Failed to fetch Linear labels:",
      err.response?.data || err.message
    );
    return [];
  }
}

function inferLabelIdsFromIssue(
  title: string,
  description: string,
  availableLabels: Array<{ id: string; name: string }>
): string[] {
  if (!availableLabels.length) return [];
  const haystack = ` ${title}\n${description} `.toLowerCase();

  const matched = new Set<string>();
  for (const label of availableLabels) {
    const name = String(label.name || "").trim();
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${escaped.toLowerCase()}([^a-z0-9]|$)`);
    if (re.test(haystack)) {
      matched.add(label.id);
      if (matched.size >= 3) break; // cap to 3 labels max
    }
  }
  return Array.from(matched);
}

function inferCategories(title: string, description: string): string[] {
  const text = ` ${title}\n${description} `.toLowerCase();
  const categories: string[] = [];

  // Bug indicators
  if (
    /(bug|error|exception|stack\s*trace|crash|fail|broken|doesn't work|does not work|regression|not working|broken|malfunction)/.test(
      text
    )
  ) {
    categories.push("Bug");
  }

  // Improvement indicators
  if (
    /(improvement|enhancement|optimi[sz]e|speed|faster|performance|refactor|usability|quality|better|upgrade)/.test(
      text
    )
  ) {
    categories.push("Improvement");
  }

  // UI/Branding indicators
  if (
    /(ui|ux|interface|design|layout|styling|color|colour|font|typography|spacing|alignment|button|modal|dialog|hover|focus|visual|appearance)/.test(
      text
    )
  ) {
    categories.push("UI");
  }
  if (/(brand|branding|logo|palette|identity|customization)/.test(text)) {
    categories.push("Branding");
  }

  // Domain-specific categories
  if (/(invitation|invite|accept|join|event|rsvp)/.test(text)) {
    categories.push("Invitation System");
  }
  if (/(email|template|mail|notification)/.test(text)) {
    categories.push("Email System");
  }
  if (/(chat|conversation|message|talk|discuss)/.test(text)) {
    categories.push("Chat Feature");
  }
  if (/(document|form|populate|fill|data|information)/.test(text)) {
    categories.push("Document Management");
  }
  if (/(test|testing|verify|validation|check|debug)/.test(text)) {
    categories.push("Testing");
  }
  if (/(portal|dashboard|interface|system|platform)/.test(text)) {
    categories.push("Platform");
  }
  if (/(user|customer|client|dj|planner|wedding)/.test(text)) {
    categories.push("User Experience");
  }
  if (/(security|auth|login|permission|access)/.test(text)) {
    categories.push("Security");
  }
  if (/(api|backend|server|database|integration)/.test(text)) {
    categories.push("Backend");
  }
  if (/(mobile|responsive|device|phone|tablet)/.test(text)) {
    categories.push("Mobile");
  }

  // Deduplicate while preserving order
  return Array.from(new Set(categories));
}

function findLabelIdByPreferredNames(
  availableLabels: Array<{ id: string; name: string }>,
  preferredNames: string[]
): string | null {
  const lowerToId = new Map<string, string>();
  for (const l of availableLabels)
    lowerToId.set(String(l.name).toLowerCase(), l.id);
  for (const name of preferredNames) {
    const id = lowerToId.get(name.toLowerCase());
    if (id) return id;
  }
  return null;
}

function findSimilarLabelId(
  category: string,
  availableLabels: Array<{ id: string; name: string }>
): string | null {
  const categoryLower = category.toLowerCase();

  // First try exact matches
  for (const label of availableLabels) {
    const labelName = String(label.name).toLowerCase();
    if (labelName === categoryLower) {
      return label.id;
    }
  }

  // Then try fuzzy matching
  for (const label of availableLabels) {
    const labelName = String(label.name).toLowerCase();

    // Check if category contains label name or vice versa
    if (
      categoryLower.includes(labelName) ||
      labelName.includes(categoryLower)
    ) {
      return label.id;
    }

    // Check for word overlap (at least 60% of words match)
    const categoryWords = categoryLower.split(/\s+/);
    const labelWords = labelName.split(/\s+/);

    if (categoryWords.length > 0 && labelWords.length > 0) {
      const commonWords = categoryWords.filter((word) =>
        labelWords.some(
          (labelWord) => word.includes(labelWord) || labelWord.includes(word)
        )
      );

      const similarity =
        commonWords.length / Math.max(categoryWords.length, labelWords.length);
      if (similarity >= 0.6) {
        return label.id;
      }
    }
  }

  return null;
}

function getLabelColor(labelName: string): string {
  const colorMap: Record<string, string> = {
    // Negative/Problem labels - use red tones
    Bug: "#ff6b6b", // Red
    Error: "#ff6b6b", // Red
    Issue: "#ff6b6b", // Red
    Problem: "#ff6b6b", // Red
    Critical: "#e74c3c", // Darker red

    // UI/Design labels - use blue tones
    UI: "#74b9ff", // Light blue
    UX: "#74b9ff", // Light blue
    "User Experience": "#74b9ff", // Light blue
    Design: "#74b9ff", // Light blue
    Interface: "#74b9ff", // Light blue

    // Feature/Enhancement labels - use green tones
    Feature: "#00b894", // Teal green
    Enhancement: "#00b894", // Teal green
    Improvement: "#00b894", // Teal green
    "New Feature": "#00b894", // Teal green

    // Technical/Backend labels - use purple tones
    Backend: "#a29bfe", // Light purple
    API: "#a29bfe", // Light purple
    Database: "#a29bfe", // Light purple
    Server: "#a29bfe", // Light purple
    Integration: "#a29bfe", // Light purple

    // Communication labels - use orange tones
    "Email System": "#fd79a8", // Pink
    "Chat Feature": "#fd79a8", // Pink
    Notification: "#fd79a8", // Pink
    Communication: "#fd79a8", // Pink

    // Document/Data labels - use yellow tones
    "Document Management": "#fdcb6e", // Light orange
    Data: "#fdcb6e", // Light orange
    Information: "#fdcb6e", // Light orange
    Content: "#fdcb6e", // Light orange

    // Platform/System labels - use gray tones
    Platform: "#636e72", // Gray
    System: "#636e72", // Gray
    Infrastructure: "#636e72", // Gray

    // Security labels - use dark blue
    Security: "#2d3436", // Dark gray
    Auth: "#2d3436", // Dark gray
    Permission: "#2d3436", // Dark gray

    // Testing labels - use cyan
    Testing: "#00cec9", // Cyan
    QA: "#00cec9", // Cyan
    Test: "#00cec9", // Cyan

    // Mobile labels - use indigo
    Mobile: "#6c5ce7", // Indigo
    Responsive: "#6c5ce7", // Indigo
    App: "#6c5ce7", // Indigo

    // Branding labels - use magenta
    Branding: "#e84393", // Magenta
    Brand: "#e84393", // Magenta
    Identity: "#e84393", // Magenta

    // Invitation labels - use coral
    "Invitation System": "#ff7675", // Coral
    Invitation: "#ff7675", // Coral
    Invite: "#ff7675", // Coral
  };

  // Return mapped color or default pastel color
  return colorMap[labelName] || "#ddd6fe"; // Default light purple
}

async function createLinearLabel(
  name: string,
  teamId?: string
): Promise<string | null> {
  try {
    const color = getLabelColor(name);
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { issueLabel { id name } } }`,
        variables: {
          input: {
            name,
            color,
            // teamId may not be required in Linear; include only if provided
            teamId: teamId || undefined,
          },
        },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    const id = res.data?.data?.issueLabelCreate?.issueLabel?.id as
      | string
      | undefined;
    return id || null;
  } catch (err: any) {
    console.error(
      "  ❌ Failed to create label:",
      err.response?.data || err.message
    );
    return null;
  }
}

async function ensureCategoryLabelId(
  category: string,
  availableLabels: Array<{ id: string; name: string }>,
  teamId: string,
  createdCache: Map<string, string>
): Promise<string | null> {
  const preferredNamesByCategory: Record<string, string[]> = {
    Bug: ["Bug"],
    Improvement: ["Improvement", "Enhancement"],
    UI: ["UI", "UX", "Design"],
    Branding: ["Branding", "Brand"],
    "Invitation System": ["Invitation System", "Invitations"],
    "Email System": ["Email System", "Email"],
    "Chat Feature": ["Chat Feature", "Chat"],
    "Document Management": ["Document Management", "Documents"],
    Testing: ["Testing", "QA"],
    Platform: ["Platform", "System"],
    "User Experience": ["User Experience", "UX"],
    Security: ["Security", "Auth"],
    Backend: ["Backend", "API"],
    Mobile: ["Mobile", "Responsive"],
  };

  const preferred = preferredNamesByCategory[category];

  // Check cache first
  for (const name of preferred) {
    const cached = createdCache.get(name.toLowerCase());
    if (cached) return cached;
  }

  // Look for exact matches using preferred names
  const existingId = findLabelIdByPreferredNames(availableLabels, preferred);
  if (existingId) {
    console.log(`    🔍 Reusing existing label: "${category}"`);
    return existingId;
  }

  // Look for similar labels using fuzzy matching
  const similarId = findSimilarLabelId(category, availableLabels);
  if (similarId) {
    const similarLabel = availableLabels.find((l) => l.id === similarId);
    console.log(
      `    🔍 Reusing similar label: "${similarLabel?.name}" for "${category}"`
    );
    return similarId;
  }

  // Auto-create label for speed
  const createName = preferred[0];
  console.log(`    📋 Auto-creating label: "${createName}"`);

  const newId = await createLinearLabel(createName, teamId);
  if (newId) {
    availableLabels.push({ id: newId, name: createName });
    createdCache.set(createName.toLowerCase(), newId);
  }
  return newId;
}

/* ---------------- Exports ---------------- */
export {
  fetchLinearTeams,
  fetchLinearLabels,
  inferCategories,
  findLabelIdByPreferredNames,
  findSimilarLabelId,
  createLinearLabel,
};

/* ---------------- Main Flow ---------------- */
if (require.main === module) {
  (async () => {
    try {
      const selectedTeamId = await selectLinearTeam();
      const labels = await fetchLinearLabels(selectedTeamId);

      // Check if we should use existing transcript for faster testing
      if (
        process.env.USE_EXISTING_TRANSCRIPT === "true" &&
        fs.existsSync("transcript.json")
      ) {
        console.log("⚡ Using existing transcript for faster testing...");
        const transcriptData = JSON.parse(
          fs.readFileSync("transcript.json", "utf8")
        );
        const issues = await summarizeToIssues(
          transcriptData.text,
          transcriptData
        );

        // No video path needed since visual context is removed
        const dummyVideoPath = "/Users/glennrenda/Downloads/Glenn2.mov";

        await createLinearIssues(
          issues,
          selectedTeamId,
          labels,
          "https://dummy-url.com", // Dummy URL for existing transcript
          transcriptData,
          dummyVideoPath
        );

        console.log("\n🎉 Done! Issues created using existing transcript.");
        return;
      }

      // Full flow: video upload, transcription, etc.
      const filePath = await getVideoPath();
      const uploadUrl = await uploadVideo(filePath);
      console.log("⏱ Waiting briefly before requesting transcription...");
      await sleep(3000);
      const transcriptId = await requestTranscript(uploadUrl);
      const transcriptData = await waitForTranscript(transcriptId);

      fs.writeFileSync(
        "transcript.json",
        JSON.stringify(transcriptData, null, 2)
      );
      console.log("💾 Saved transcript.json");

      const issues = await summarizeToIssues(
        transcriptData.text,
        transcriptData
      );
      await createLinearIssues(
        issues,
        selectedTeamId,
        labels,
        uploadUrl,
        transcriptData,
        filePath
      );

      console.log("\n🎉 Done! Transcript saved and issues pushed to Linear.");
    } catch (err: any) {
      console.error("\n❌ FATAL ERROR:", err.response?.data || err.message);
      console.error("🔍 Full stack:", err.stack);
    }
  })();
}
