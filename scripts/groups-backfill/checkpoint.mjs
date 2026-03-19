import fs from "node:fs";
import path from "node:path";

export function loadCheckpoint(checkpointPath) {
  if (!fs.existsSync(checkpointPath)) {
    return {
      pageCursor: null,
      processedThreadIds: [],
      lastRunAt: null,
    };
  }

  const raw = fs.readFileSync(checkpointPath, "utf8");
  return JSON.parse(raw);
}

export function saveCheckpoint(checkpointPath, checkpoint) {
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}
