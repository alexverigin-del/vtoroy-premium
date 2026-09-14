import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";

const image = process.env.COMM_SANITIZER_IMAGE || "isvoi-communications-local-media-sanitizer",
  name = `isvoi-sanitizer-contract-${process.pid}`,
  port = 18080;

function docker(args, expected = 0) {
  const result = spawnSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== expected)
    throw Error(`DOCKER_${args[0].toUpperCase()}_FAILED\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function dockerBuffer(args) {
  const result = spawnSync("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw Error(`DOCKER_${args[0].toUpperCase()}_FAILED\n${result.stderr}`);
  return result.stdout;
}

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok && (await response.json()).version === "isvoi-safe-media/1") return;
    } catch {}
    await pause(250);
  }
  throw Error("SANITIZER_HEALTH_TIMEOUT");
}

async function sanitize(bytes, mime, kind) {
  return fetch(`http://127.0.0.1:${port}/v1/sanitize`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(bytes.length),
      "x-input-mime": mime,
      "x-input-kind": kind,
    },
    body: bytes,
  });
}

try {
  docker([
    "run",
    "-d",
    "--name",
    name,
    "-p",
    `127.0.0.1:${port}:8080`,
    "--read-only",
    "--tmpfs",
    "/tmp:size=64m,mode=1777",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--memory",
    "1g",
    "--cpus",
    "1",
    image,
  ]);
  await waitReady();
  docker(["exec", name, "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=16x16", "-frames:v", "1", "-y", "/tmp/source.png"]);
  docker(["exec", name, "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-y", "/tmp/source.wav"]);
  docker(["exec", name, "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=32x32:rate=5:duration=1", "-c:v", "libvpx-vp9", "-y", "/tmp/source.webm"]);
  const cases = [
    ["source.png", "image/png", "image", "image/png", "png"],
    ["source.wav", "audio/wav", "audio", "audio/ogg", "ogg"],
    ["source.webm", "video/webm", "video", "video/mp4", "mp4"],
  ];
  for (const [file, mime, kind, outputMime, extension] of cases) {
    const source = dockerBuffer(["exec", name, "cat", `/tmp/${file}`]),
      response = await sanitize(source, mime, kind),
      output = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, output.toString());
    assert.equal(response.headers.get("content-type"), outputMime);
    assert.equal(response.headers.get("x-sanitized-extension"), extension);
    assert.equal(response.headers.get("x-sanitized-kind"), kind);
    assert.equal(response.headers.get("x-sanitizer-version"), "isvoi-safe-media/1");
    assert.ok(output.length > 0 && output.length <= 20_000_000);
    assert.notDeepEqual(output, source, `${file} must be fully re-encoded`);
  }

  let response = await sanitize(Buffer.from("%PDF-1.4\n%%EOF"), "application/pdf", "document");
  assert.equal(response.status, 415);
  assert.equal((await response.json()).error_code, "FILE_FORMAT_NOT_ALLOWED");
  response = await sanitize(Buffer.from("not an image"), "image/png", "image");
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error_code, "MEDIA_SANITIZATION_FAILED");
  console.log("MEDIA_SANITIZER_CONTRACT_OK image=png audio=ogg video=mp4 documents=rejected");
} finally {
  spawnSync("docker", ["rm", "-f", name], { stdio: "ignore" });
}
