/**
 * 1-Click Direct Machine Upload Bridge for all 42 CNC / Laser / Plasma / Waterjet / Plotter Profiles
 * Supports:
 *  1) Zero-install Browser Directory / USB Picker (File System Access API with cached handle per machine)
 *  2) Zero-install Browser USB Web Serial API (GRBL 115200 flow-controlled G-code & HPGL 9600 streaming)
 *  3) Local Windows CNC Bridge (http://127.0.0.1:47892) for:
 *     - Hot-folder / LAN SMB / USB write + optional Auto-Open in CypCut, RDWorks, Mach3, NcStudio, EzCad, ProNest
 *     - LightBurn Live UDP LOADFILE (127.0.0.1:19840)
 *     - Industrial FTP upload (Syntec, Siemens Sinumerik, Heidenhain, Bystronic, Trumpf, Amada, Mazak, Biesse)
 *     - Direct TCP/IP Socket streaming
 *     - Direct Windows COM Port RS-232/USB streaming
 */

import { getMachineProfile, generateNestedGcode, generateNestedHpgl, validateNestedProduction } from './CncGcodeExporter.js';
import { generateNestedDxf, generateNestedSvg } from './ExportService.js';

export const CNC_BRIDGE_URL = 'http://127.0.0.1:47892';
const STORAGE_KEY = 'khs_cnc_machine_targets_v1';
const cachedDirHandles = new Map();

export const CNC_TRANSPORT_MODES = [
  { id: 'folder', label: 'Köprü · Makine Klasörü / USB + Programda Aç (Önerilen)' },
  { id: 'browser_dir', label: 'Tarayıcıdan Doğrudan Klasör / USB Belleğe Yaz (Kurulumsuz)' },
  { id: 'lightburn', label: 'LightBurn Canlı UDP Bağlantısı (127.0.0.1:19840)' },
  { id: 'webserial', label: 'Tarayıcı USB Seri Port / GRBL & Plotter (Web Serial · Kurulumsuz)' },
  { id: 'ftp', label: 'Endüstriyel FTP Yükleme (Syntec / Siemens / Lazer LAN)' },
  { id: 'tcp', label: 'Doğrudan Ağ TCP/IP Soket Gönderimi' },
  { id: 'serial', label: 'Köprü · Windows COM Port (RS-232 / USB Seri)' },
];

const LIGHTBURN_IDS = new Set(['dxf_lightburn', 'svg_lightburn']);
const WEBSERIAL_GCODE_IDS = new Set(['gcode_grbl_router', 'gcode_grbl_laser']);
const FTP_CONTROLLER_IDS = new Set([
  'gcode_syntec', 'gcode_siemens', 'gcode_heidenhain', 'gcode_router',
  'gcode_biesse', 'gcode_homag',
  'dxf_bystronic', 'dxf_trumpf', 'dxf_amada', 'dxf_mazak', 'dxf_durma',
]);

export function getDefaultMachineConnection(profileOrId) {
  const profile = typeof profileOrId === 'string' ? getMachineProfile(profileOrId) : (profileOrId || getMachineProfile());
  const id = profile.id;

  if (LIGHTBURN_IDS.has(id)) {
    return {
      transport: 'lightburn',
      host: '127.0.0.1',
      port: 19840,
      folderPath: '',
      autoOpen: false,
      remoteDir: '/jobs',
      user: 'anonymous',
      pass: '',
      comPort: 'COM3',
      baudRate: 115200,
      protocol: 'raw',
      hint: 'LightBurn canlı UDP bağlantısı (127.0.0.1:19840)',
    };
  }
  if (WEBSERIAL_GCODE_IDS.has(id)) {
    return {
      transport: 'webserial',
      host: '127.0.0.1',
      port: 23,
      folderPath: '',
      autoOpen: false,
      remoteDir: '/jobs',
      user: 'anonymous',
      pass: '',
      comPort: 'COM3',
      baudRate: 115200,
      protocol: 'grbl',
      hint: 'Doğrudan USB Seri (GRBL 115200 baud, kurulumsuz)',
    };
  }
  if (profile.kind === 'plt') {
    return {
      transport: 'webserial',
      host: '127.0.0.1',
      port: 9100,
      folderPath: '',
      autoOpen: false,
      remoteDir: '/jobs',
      user: 'anonymous',
      pass: '',
      comPort: 'COM4',
      baudRate: 9600,
      protocol: 'hpgl',
      hint: 'Doğrudan USB / RS-232 Plotter HPGL akışı (9600 baud)',
    };
  }
  if (FTP_CONTROLLER_IDS.has(id)) {
    return {
      transport: 'ftp',
      host: '192.168.1.100',
      port: 21,
      folderPath: '',
      autoOpen: false,
      remoteDir: '/jobs',
      user: 'anonymous',
      pass: '',
      comPort: 'COM1',
      baudRate: 115200,
      protocol: 'raw',
      hint: 'Endüstriyel CNC/Lazer FTP sunucusu veya ağ paylaşım klasörü',
    };
  }
  return {
    transport: 'folder',
    host: '192.168.1.100',
    port: 21,
    folderPath: '',
    autoOpen: true,
    remoteDir: '/jobs',
    user: 'anonymous',
    pass: '',
    comPort: 'COM3',
    baudRate: 115200,
    protocol: 'raw',
    hint: 'Makine iş klasörü / USB bellek / ağ paylaşımı (+ CAM programında otomatik aç)',
  };
}

function readAllSavedConnections() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function loadMachineConnection(profileOrId) {
  const profile = typeof profileOrId === 'string' ? getMachineProfile(profileOrId) : (profileOrId || getMachineProfile());
  const defaults = getDefaultMachineConnection(profile);
  const all = readAllSavedConnections();
  const saved = all?.[profile.id];
  return saved && typeof saved === 'object' ? { ...defaults, ...saved } : defaults;
}

export function saveMachineConnection(profileId, cfg) {
  const defaults = getDefaultMachineConnection(profileId);
  const merged = { ...defaults, ...(cfg || {}) };
  try {
    const all = readAllSavedConnections();
    all[profileId] = merged;
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
  return merged;
}

export function buildMachineUploadPayload(sheets = [], cncConfig = {}, projectName = 'KutuHarf') {
  const profile = getMachineProfile(cncConfig?.profile);
  const val = validateNestedProduction(sheets, cncConfig);
  const safeProj = String(projectName || 'KutuHarf').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'KutuHarf';
  const ext = profile.ext || (profile.kind === 'gcode' ? 'nc' : profile.kind);
  const fileName = `${safeProj}_${profile.id}.${ext}`;

  let content = '';
  let mime = 'text/plain';
  if (sheets.length && val.totalParts > 0) {
    if (profile.kind === 'dxf') {
      content = generateNestedDxf(sheets);
      mime = 'application/dxf';
    } else if (profile.kind === 'svg') {
      content = generateNestedSvg(sheets);
      mime = 'image/svg+xml';
    } else if (profile.kind === 'plt') {
      content = generateNestedHpgl(sheets, cncConfig);
      mime = 'text/plain';
    } else {
      content = generateNestedGcode(sheets, cncConfig);
      mime = 'text/plain';
    }
  }

  return {
    valid: val.valid && Boolean(content),
    issues: val.issues,
    totalParts: val.totalParts,
    sheetCount: sheets.length,
    profile,
    fileName,
    content,
    mime,
  };
}

export async function uploadViaBrowserDirectory(fileName, content, profileId = 'default', forceRepick = false) {
  if (typeof globalThis.showDirectoryPicker !== 'function') {
    throw new Error('Tarayıcınız doğrudan klasör yazmayı desteklemiyor (Chrome/Edge kullanın veya Yerel Köprüyü başlatın).');
  }
  let dirHandle = !forceRepick ? cachedDirHandles.get(profileId) : null;
  if (dirHandle) {
    try {
      const perm = await dirHandle.queryPermission?.({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const req = await dirHandle.requestPermission?.({ mode: 'readwrite' });
        if (req !== 'granted') dirHandle = null;
      }
    } catch {
      dirHandle = null;
    }
  }
  if (!dirHandle) {
    dirHandle = await globalThis.showDirectoryPicker({ mode: 'readwrite' });
    cachedDirHandles.set(profileId, dirHandle);
  }
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return { ok: true, target: `${dirHandle.name}\\${fileName}`, message: `✓ USB/Klasöre yazıldı: ${dirHandle.name}\\${fileName}` };
}

export async function streamViaWebSerial(content, opts = {}, onProgress = () => {}) {
  if (!globalThis.navigator?.serial?.requestPort) {
    throw new Error('Bu tarayıcı Web Serial desteklemiyor (Chrome/Edge kullanın veya Yerel Köprü COM Portu seçin).');
  }
  const baudRate = Math.max(1200, Number(opts.baudRate) || 115200);
  const protocol = opts.protocol || 'raw';
  const port = await globalThis.navigator.serial.requestPort();
  await port.open({ baudRate });

  const encoder = new TextEncoder();
  const writer = port.writable.getWriter();
  let reader = null;
  try {
    if (protocol === 'grbl') {
      reader = port.readable?.getReader?.() || null;
      const decoder = new TextDecoder();
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('(') && !l.startsWith(';'));
      await writer.write(encoder.encode('\r\n'));
      await new Promise(r => setTimeout(r, 120));
      let buf = '';
      for (let i = 0; i < lines.length; i++) {
        await writer.write(encoder.encode(`${lines[i]}\n`));
        if (reader) {
          const deadline = Date.now() + 5000;
          while (Date.now() < deadline) {
            const { value, done } = await Promise.race([
              reader.read(),
              new Promise(r => setTimeout(() => r({ value: null, done: false, timeout: true }), 1200)),
            ]);
            if (done || !value) break;
            buf += decoder.decode(value, { stream: true });
            if (/\bok\b/i.test(buf)) { buf = ''; break; }
            if (/error:/i.test(buf)) throw new Error(`GRBL hata: ${buf.trim()}`);
          }
        }
        if (i % 10 === 0 || i === lines.length - 1) onProgress({ sent: i + 1, total: lines.length, pct: Math.round(((i + 1) / lines.length) * 100) });
      }
      return { ok: true, linesSent: lines.length, message: `✓ Web Serial (GRBL ${baudRate} baud): ${lines.length} satır makineye gönderildi.` };
    }

    // HPGL / raw chunked streaming
    const bytes = encoder.encode(content);
    const chunkSize = 2048;
    for (let off = 0; off < bytes.length; off += chunkSize) {
      await writer.write(bytes.subarray(off, Math.min(bytes.length, off + chunkSize)));
      onProgress({ sent: Math.min(bytes.length, off + chunkSize), total: bytes.length, pct: Math.round((Math.min(bytes.length, off + chunkSize) / bytes.length) * 100) });
      await new Promise(r => setTimeout(r, 15));
    }
    return { ok: true, bytesSent: bytes.length, message: `✓ Web Serial (${baudRate} baud): ${(bytes.length / 1024).toFixed(1)} KB veri makineye gönderildi.` };
  } finally {
    try { await writer.close(); } catch {}
    try { writer.releaseLock(); } catch {}
    try { await reader?.cancel(); } catch {}
    try { reader?.releaseLock(); } catch {}
    try { await port.close(); } catch {}
  }
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function getCncBridgePs1Script() {
  return String.raw`$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Web.Extensions

$listenPort = 47892
$prefix = "http://127.0.0.1:$listenPort/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "HATA: Port $listenPort acilamadi. Onceki CNC kopru penceresi aciksa kapatin." -ForegroundColor Red
  Read-Host "Cikmak icin Enter'a basin"
  exit 1
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Kutu Harf Studyosu <-> CNC / Lazer / Plazma / Plotter Canli Kopru" -ForegroundColor Green
Write-Host " Dinlenen adres : $prefix" -ForegroundColor Cyan
Write-Host " Ozellikler     : Klasor/USB + Programda Ac, LightBurn UDP, FTP, TCP, COM" -ForegroundColor Yellow
Write-Host " Kapatmak icin  : Bu pencereyi kapatin veya Ctrl+C" -ForegroundColor Gray
Write-Host "==================================================================" -ForegroundColor Cyan

$jsonSer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$jsonSer.MaxJsonLength = 67108864

function Send-CncJson($ctx, [int]$status, $obj) {
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = "application/json; charset=utf-8"
  $ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*")
  $ctx.Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  $ctx.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
  $ctx.Response.Headers.Add("Access-Control-Allow-Private-Network", "true")
  $json = $jsonSer.Serialize($obj)
  $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
  $ctx.Response.ContentLength64 = $buf.Length
  $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
  $ctx.Response.OutputStream.Close()
}

function Save-JobFile($targetDir, $fileName, $content) {
  $dir = if ($targetDir -and $targetDir.Trim().Length -gt 0) { $targetDir.Trim() } else { Join-Path ([Environment]::GetFolderPath("Desktop")) "KutuHarf_CNC_Isler" }
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $fullPath = Join-Path $dir $fileName
  [System.IO.File]::WriteAllText($fullPath, [string]$content, [System.Text.UTF8Encoding]::new($false))
  return $fullPath
}

function Execute-CncUpload($req) {
  $transport = [string]$req["transport"]
  $fileName = [string]$req["fileName"]
  $content = [string]$req["content"]
  $folderPath = [string]$req["folderPath"]
  $autoOpen = [bool]$req["autoOpen"]
  $targetHost = [string]$req["host"]
  $targetPort = [int]($req["port"])
  $remoteDir = [string]$req["remoteDir"]
  $ftpUser = [string]$req["user"]
  $ftpPass = [string]$req["pass"]
  $comPort = [string]$req["comPort"]
  $baudRate = [int]($req["baudRate"])
  $protocol = [string]$req["protocol"]

  if ($transport -eq "folder" -or $transport -eq "app") {
    $fullPath = Save-JobFile $folderPath $fileName $content
    if ($autoOpen) { Start-Process -FilePath $fullPath }
    return @{ ok = $true; target = $fullPath; message = "Makine dosyasi kaydedildi: $fullPath" }
  }

  if ($transport -eq "lightburn") {
    $fullPath = Save-JobFile $folderPath $fileName $content
    $lbHost = if ($targetHost) { $targetHost } else { "127.0.0.1" }
    $lbPort = if ($targetPort -gt 0) { $targetPort } else { 19840 }
    $udp = New-Object System.Net.Sockets.UdpClient
    try {
      $msg = [System.Text.Encoding]::UTF8.GetBytes("LOADFILE:$fullPath")
      [void]$udp.Send($msg, $msg.Length, $lbHost, $lbPort)
    } finally {
      $udp.Close()
    }
    return @{ ok = $true; target = "$($lbHost):$lbPort -> $fullPath"; message = "LightBurn'e canli gonderildi: $fileName" }
  }

  if ($transport -eq "ftp") {
    if (-not $targetHost) { throw "FTP IP adresi veya ana bilgisayar adi girin." }
    $fPort = if ($targetPort -gt 0) { $targetPort } else { 21 }
    $cleanDir = ($remoteDir -replace '\\', '/').Trim('/')
    $uriStr = if ($cleanDir) { "ftp://$($targetHost):$fPort/$cleanDir/$fileName" } else { "ftp://$($targetHost):$fPort/$fileName" }
    $ftpReq = [System.Net.FtpWebRequest]::Create($uriStr)
    $ftpReq.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
    $u = if ($ftpUser) { $ftpUser } else { "anonymous" }
    $ftpReq.Credentials = New-Object System.Net.NetworkCredential($u, $ftpPass)
    $ftpReq.UseBinary = $true
    $ftpReq.UsePassive = $true
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
    $ftpReq.ContentLength = $bytes.Length
    $rs = $ftpReq.GetRequestStream()
    $rs.Write($bytes, 0, $bytes.Length)
    $rs.Close()
    $resp = $ftpReq.GetResponse()
    $statusDesc = [string]$resp.StatusDescription
    $resp.Close()
    return @{ ok = $true; target = $uriStr; message = "FTP yukleme tamamlandi ($statusDesc)" }
  }

  if ($transport -eq "tcp") {
    if (-not $targetHost) { throw "Makine TCP IP adresi girin." }
    $tPort = if ($targetPort -gt 0) { $targetPort } else { 9100 }
    $client = New-Object System.Net.Sockets.TcpClient
    try {
      $client.Connect($targetHost, $tPort)
      $stream = $client.GetStream()
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Flush()
    } finally {
      $client.Close()
    }
    return @{ ok = $true; target = "$($targetHost):$tPort"; message = "TCP/IP soketine yuklendi: $($targetHost):$tPort" }
  }

  if ($transport -eq "serial") {
    if (-not $comPort) { throw "COM port secin (orn. COM3)." }
    $bRate = if ($baudRate -gt 0) { $baudRate } else { 115200 }
    $serialObj = New-Object System.IO.Ports.SerialPort $comPort, $bRate, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
    $serialObj.ReadTimeout = 4000
    $serialObj.WriteTimeout = 4000
    $serialObj.NewLine = [string][char]10
    $serialObj.Open()
    try {
      if ($protocol -eq "grbl") {
        $serialObj.WriteLine("")
        Start-Sleep -Milliseconds 150
        try { $null = $serialObj.ReadExisting() } catch {}
        $lines = $content -split "\r?\n"
        $sentLines = 0
        foreach ($line in $lines) {
          $trim = $line.Trim()
          if (-not $trim -or $trim.StartsWith("(") -or $trim.StartsWith(";")) { continue }
          $serialObj.WriteLine($trim)
          $ack = $serialObj.ReadLine()
          if ($ack -match "error") { throw "GRBL hatasi ($trim): $ack" }
          $sentLines++
        }
        return @{ ok = $true; target = "$comPort @ $bRate"; message = "$comPort uzerinden $sentLines satir G-Code akisi tamamlandi." }
      } else {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
        $serialObj.Write($bytes, 0, $bytes.Length)
        return @{ ok = $true; target = "$comPort @ $bRate"; message = "$comPort uzerinden $($bytes.Length) byte gonderildi." }
      }
    } finally {
      if ($serialObj.IsOpen) { $serialObj.Close() }
      $serialObj.Dispose()
    }
  }

  throw "Bilinmeyen aktarim turu: $transport"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $method = $ctx.Request.HttpMethod
    $path = $ctx.Request.Url.AbsolutePath
    if ($method -eq "OPTIONS") {
      Send-CncJson $ctx 200 @{ ok = $true }
      continue
    }
    if ($method -eq "GET" -and $path -eq "/api/health") {
      $comPorts = @([System.IO.Ports.SerialPort]::GetPortNames())
      $drives = @([System.IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady } | ForEach-Object { $_.Name })
      Send-CncJson $ctx 200 @{ ok = $true; service = "kutu-harf-cnc-bridge"; version = "1.0"; comPorts = $comPorts; drives = $drives }
      continue
    }
    if ($method -eq "POST" -and $path -eq "/api/upload") {
      $sr = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
      $raw = $sr.ReadToEnd()
      $payload = $jsonSer.DeserializeObject($raw)
      $res = Execute-CncUpload $payload
      Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $($res.message)" -ForegroundColor Green
      Send-CncJson $ctx 200 $res
      continue
    }
    Send-CncJson $ctx 404 @{ ok = $false; error = "Bilinmeyen uc nokta: $path" }
  } catch {
    Write-Host "[HATA] $($_.Exception.Message)" -ForegroundColor Red
    Send-CncJson $ctx 500 @{ ok = $false; error = [string]$_.Exception.Message }
  }
}
`;
}

export function generateCncBridgeLauncherBat() {
  const b64 = utf8ToBase64(getCncBridgePs1Script());
  const wrapped = b64.match(/.{1,76}/g).map(line => `::${line}`).join('\r\n');
  return [
    '@echo off',
    'chcp 65001 >nul',
    'title Kutu Harf Studyosu - CNC Makine Canli Koprusu',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$raw = [IO.File]::ReadAllText(\'%~f0\', [Text.Encoding]::UTF8); $m = [regex]::Match($raw, \'(?s)::###PS1_B64_START###\\r?\\n(.*?)\\r?\\n::###PS1_B64_END###\'); $b64 = ($m.Groups[1].Value -replace \'(?m)^::\', \'\' -replace \'\\s+\', \'\'); $bytes = [Convert]::FromBase64String($b64); [IO.File]::WriteAllText(\'%TEMP%\\kutu_harf_cnc_bridge.ps1\', [Text.Encoding]::UTF8.GetString($bytes), [Text.UTF8Encoding]::new($false))"',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\\kutu_harf_cnc_bridge.ps1"',
    'exit /b %errorlevel%',
    '::###PS1_B64_START###',
    wrapped,
    '::###PS1_B64_END###',
  ].join('\r\n');
}

export async function checkCncBridgeStatus(timeoutMs = 900) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${CNC_BRIDGE_URL}/api/health`, {
      method: 'GET',
      mode: 'cors',
      signal: ctrl.signal,
    });
    if (!res.ok) return { online: false, comPorts: [], drives: [] };
    const data = await res.json();
    return {
      online: Boolean(data?.ok),
      comPorts: Array.isArray(data?.comPorts) ? data.comPorts : [],
      drives: Array.isArray(data?.drives) ? data.drives : [],
      ...data,
    };
  } catch {
    return { online: false, comPorts: [], drives: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadToCncMachine(sheets, cncConfig = {}, projectName = 'KutuHarf', connectionOverride = null, onProgress = () => {}) {
  const payload = buildMachineUploadPayload(sheets, cncConfig, projectName);
  if (!payload.valid) {
    return {
      ok: false,
      invalidLayout: true,
      error: payload.issues[0]?.msg || 'Geçerli kesim yerleşimi bulunamadı.',
      payload,
    };
  }
  const conn = connectionOverride || loadMachineConnection(payload.profile);

  if (conn.transport === 'browser_dir') {
    const res = await uploadViaBrowserDirectory(payload.fileName, payload.content, payload.profile.id);
    return { ...res, payload };
  }

  if (conn.transport === 'webserial') {
    const res = await streamViaWebSerial(payload.content, { baudRate: conn.baudRate, protocol: conn.protocol }, onProgress);
    return { ...res, payload };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${CNC_BRIDGE_URL}/api/upload`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transport: conn.transport,
        profileId: payload.profile.id,
        profileLabel: payload.profile.label,
        fileName: payload.fileName,
        content: payload.content,
        folderPath: conn.folderPath || '',
        autoOpen: Boolean(conn.autoOpen),
        host: conn.host || '127.0.0.1',
        port: Number(conn.port) || 0,
        remoteDir: conn.remoteDir || '',
        user: conn.user || '',
        pass: conn.pass || '',
        comPort: conn.comPort || '',
        baudRate: Number(conn.baudRate) || 115200,
        protocol: conn.protocol || 'raw',
      }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) return { ok: true, ...data, payload };
    return { ok: false, bridgeOffline: false, error: data?.error || `CNC köprüsü hata verdi (${res.status})`, payload };
  } catch {
    return { ok: false, bridgeOffline: true, payload };
  } finally {
    clearTimeout(timer);
  }
}
