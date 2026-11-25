/**
 * CorelDRAW 1-Click Nesting Bridge & Colored Exporter
 * Transfers exact nested parts (1:1 mm), sheet dimensions (width × height + margins),
 * and user-selected body/hole colors directly into CorelDRAW via:
 *  1) Live Local COM Bridge (Windows PowerShell HttpListener on 127.0.0.1:47891)
 *  2) CorelDRAW Colored 1:1 mm SVG export / clipboard copy
 *  3) Native CorelDRAW VBA Macro (.bas) module
 */

export const COREL_BRIDGE_URL = 'http://127.0.0.1:47891';

const escapeXml = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function parseHexRgb(hex, fallback = [200, 147, 67]) {
  const clean = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!clean) {
    const [r, g, b] = fallback;
    const h = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    return { hex: h, r, g, b };
  }
  const n = clean[1].toLowerCase();
  return {
    hex: `#${n}`,
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

export function buildCorelNestingPayload(sheets = [], previewColors = {}, projectName = 'KutuHarf_Nesting') {
  const body = parseHexRgb(previewColors?.body, [200, 147, 67]);
  const holes = parseHexRgb(previewColors?.holes, [200, 147, 67]);
  const groupColors = previewColors?.groups || {};
  const normalizedSheets = (sheets || []).map((sh, idx) => {
    const mL = Number(sh.marginLeftMm ?? sh.marginMm ?? 15);
    const mR = Number(sh.marginRightMm ?? sh.marginMm ?? 15);
    const mT = Number(sh.marginTopMm ?? sh.marginMm ?? 15);
    const mB = Number(sh.marginBottomMm ?? sh.marginMm ?? 15);
    return {
      index: sh.index ?? idx + 1,
      name: sh.name || `Levha ${idx + 1}`,
      materialGroup: sh.materialLabel || sh.materialGroup || 'Genel',
      widthMm: Number(sh.widthMm || 3000),
      heightMm: Number(sh.heightMm || 1500),
      marginLeftMm: mL,
      marginRightMm: mR,
      marginTopMm: mT,
      marginBottomMm: mB,
      placements: (sh.placements || []).map((p, pi) => {
        const grp = p.partGroup || 'body';
        const pCol = parseHexRgb(groupColors[grp] || p.partColor || body.hex, [body.r, body.g, body.b]);
        return {
          id: p.id || `part_${pi + 1}`,
          label: p.label || `Parça ${pi + 1}`,
          partGroup: grp,
          partGroupLabel: p.partGroupLabel || 'Gövde',
          colorHex: pCol.hex,
          colorRgb: [pCol.r, pCol.g, pCol.b],
          angleDeg: Number(p.angleDeg || 0),
          outer: (p.outer || []).map(pt => ({ x: Number(pt.x.toFixed(4)), y: Number(pt.y.toFixed(4)) })),
          holes: (p.holes || []).map(h => h.map(pt => ({ x: Number(pt.x.toFixed(4)), y: Number(pt.y.toFixed(4)) }))),
        };
      }),
    };
  });

  return {
    version: '1.0',
    projectName: String(projectName || 'KutuHarf_Nesting'),
    units: 'mm',
    colors: {
      bodyHex: body.hex,
      bodyRgb: [body.r, body.g, body.b],
      holesHex: holes.hex,
      holesRgb: [holes.r, holes.g, holes.b],
    },
    sheets: normalizedSheets,
  };
}

export function generateCorelColoredSvg(sheets, previewColors = {}, projectName = 'KutuHarf_Nesting') {
  const payload = buildCorelNestingPayload(sheets, previewColors, projectName);
  if (!payload.sheets.length) return '';

  const gap = 80;
  let totalH = 0, maxW = 0;
  for (const sh of payload.sheets) {
    maxW = Math.max(maxW, sh.widthMm);
    totalH += sh.heightMm + gap;
  }
  totalH = Math.max(100, totalH - gap);

  const bodyHex = payload.colors.bodyHex;
  const holesHex = payload.colors.holesHex;
  const distinctHoleColor = holesHex !== bodyHex;
  const ringToD = (ring, hMm) =>
    'M ' + ring.map(pt => `${pt.x.toFixed(3)},${(hMm - pt.y).toFixed(3)}`).join(' L ') + ' Z';

  let yOff = 0;
  const groups = [];
  for (const sh of payload.sheets) {
    const itemsSvg = [];
    const usableW = Math.max(0, sh.widthMm - sh.marginLeftMm - sh.marginRightMm);
    const usableH = Math.max(0, sh.heightMm - sh.marginTopMm - sh.marginBottomMm);

    itemsSvg.push(
      `<rect id="PLAKA_EBATI_${sh.index}" x="0" y="0" width="${sh.widthMm.toFixed(3)}" height="${sh.heightMm.toFixed(3)}" fill="none" stroke="#111827" stroke-width="0.4" />`,
      `<rect id="KESIM_ALANI_${sh.index}" x="${sh.marginLeftMm.toFixed(3)}" y="${sh.marginTopMm.toFixed(3)}" width="${usableW.toFixed(3)}" height="${usableH.toFixed(3)}" fill="none" stroke="#64748b" stroke-width="0.2" stroke-dasharray="6,4" />`
    );

    for (const p of sh.placements) {
      if (!p.outer.length) continue;
      const pFill = p.colorHex || bodyHex;
      const compoundD = [ringToD(p.outer, sh.heightMm), ...p.holes.filter(h => h.length >= 3).map(h => ringToD(h, sh.heightMm))].join(' ');
      itemsSvg.push(
        `<path data-part="${escapeXml(p.label)}" data-group="${escapeXml(p.partGroup || 'body')}" d="${compoundD}" fill="${pFill}" fill-rule="evenodd" stroke="#1f2937" stroke-width="0.15" />`
      );
      if (distinctHoleColor && p.partGroup !== 'file_frame') {
        for (const h of p.holes) {
          if (h.length < 3) continue;
          itemsSvg.push(
            `<path data-hole-for="${escapeXml(p.label)}" d="${ringToD(h, sh.heightMm)}" fill="${holesHex}" stroke="#1f2937" stroke-width="0.12" />`
          );
        }
      }
    }

    groups.push(
      `  <g id="LEVHA_${sh.index}" data-name="${escapeXml(sh.name)}" data-size="${sh.widthMm}x${sh.heightMm}mm" transform="translate(0, ${yOff.toFixed(3)})">\n    ${itemsSvg.join('\n    ')}\n  </g>`
    );
    yOff += sh.heightMm + gap;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Kutu Harf Stüdyosu CorelDRAW 1:1 mm Nesting (${escapeXml(payload.projectName)}) -->
<svg xmlns="http://www.w3.org/2000/svg" width="${maxW.toFixed(3)}mm" height="${totalH.toFixed(3)}mm" viewBox="0 0 ${maxW.toFixed(3)} ${totalH.toFixed(3)}">
${groups.join('\n')}
</svg>`;
}

export function generateCorelVbaMacro(payload) {
  const data = payload?.sheets ? payload : buildCorelNestingPayload(payload);
  const [br, bg, bb] = data.colors.bodyRgb;
  const [hr, hg, hb] = data.colors.holesRgb;
  const distinctHoleColor = data.colors.holesHex !== data.colors.bodyHex;

  const lines = [
    'Attribute VB_Name = "KutuHarfNestingAktar"',
    "' Kutu Harf Studyosu - CorelDRAW 1:1 mm Otomatik Nesting Aktarim Makrosu",
    'Option Explicit',
    '',
    'Private Sub AddClosedRing(ByVal crv As Curve, ByRef xs() As Double, ByRef ys() As Double, ByVal ox As Double, ByVal oy As Double)',
    '  Dim sp As SubPath, i As Long',
    '  If UBound(xs) < 2 Then Exit Sub',
    '  Set sp = crv.CreateSubPath(ox + xs(0), oy + ys(0))',
    '  For i = 1 To UBound(xs)',
    '    sp.AppendLineSegment ox + xs(i), oy + ys(i)',
    '  Next i',
    '  sp.Closed = True',
    'End Sub',
    '',
    'Public Sub KutuHarf_Nesting_Aktar()',
    '  Dim doc As Document, p As Page, lp As Layer, lParts As Layer, lHoles As Layer',
    '  Dim crv As Curve, hCrv As Curve, sh As Shape, xs() As Double, ys() As Double',
    '  Dim ox As Double, oy As Double',
    '  If ActiveDocument Is Nothing Then Set doc = CreateDocument() Else Set doc = ActiveDocument',
    '  doc.Unit = cdrMillimeter',
    '  Optimization = True',
    '  doc.BeginCommandGroup "Kutu Harf Studyosu Nesting"',
    '  On Error GoTo Cleanup',
  ];

  data.sheets.forEach((sh, idx) => {
    const safeName = String(sh.name || `Levha ${idx + 1}`).replace(/"/g, "'");
    lines.push(`  ' === ${safeName} (${sh.widthMm} x ${sh.heightMm} mm) ===`);
    if (idx === 0) {
      lines.push('  If doc.ActivePage.Shapes.Count = 0 Then Set p = doc.ActivePage Else Set p = doc.AddPages(1)');
    } else {
      lines.push('  Set p = doc.AddPages(1)');
    }
    lines.push(
      `  p.Name = "${safeName} (${sh.widthMm}x${sh.heightMm}mm)"`,
      `  p.SetSize ${sh.widthMm.toFixed(3)}, ${sh.heightMm.toFixed(3)}`,
      '  p.Activate',
      '  ox = p.LeftX : oy = p.BottomY',
      '  Set lp = p.CreateLayer("PLAKA_SINIRI")',
      '  Set lParts = p.CreateLayer("PARCALAR")',
      ...(distinctHoleColor ? ['  Set lHoles = p.CreateLayer("IC_DELIKLER")'] : []),
      `  Set sh = lp.CreateRectangle2(ox, oy, ${sh.widthMm.toFixed(3)}, ${sh.heightMm.toFixed(3)})`,
      '  sh.Name = "PLAKA_EBATI"',
      '  sh.Fill.ApplyNoFill',
      '  sh.Outline.Width = 0.25',
      '  sh.Outline.Color.RGBAssign 90, 102, 122'
    );

    for (const part of sh.placements) {
      if (!part.outer.length) continue;
      const pName = String(part.label || 'Parca').replace(/"/g, "'");
      lines.push('  Set crv = doc.CreateCurve()');
      const n = part.outer.length;
      lines.push(`  ReDim xs(0 To ${n - 1}): ReDim ys(0 To ${n - 1})`);
      part.outer.forEach((pt, i) => {
        lines.push(`  xs(${i}) = ${pt.x.toFixed(3)}: ys(${i}) = ${pt.y.toFixed(3)}`);
      });
      lines.push('  AddClosedRing crv, xs, ys, ox, oy');

      for (const hole of part.holes) {
        if (hole.length < 3) continue;
        lines.push(`  ReDim xs(0 To ${hole.length - 1}): ReDim ys(0 To ${hole.length - 1})`);
        hole.forEach((pt, i) => {
          lines.push(`  xs(${i}) = ${pt.x.toFixed(3)}: ys(${i}) = ${pt.y.toFixed(3)}`);
        });
        lines.push('  AddClosedRing crv, xs, ys, ox, oy');
      }

      lines.push(
        '  Set sh = lParts.CreateCurve(crv)',
        `  sh.Name = "${pName}"`,
        `  sh.Fill.ApplyUniformFill CreateRGBColor(${br}, ${bg}, ${bb})`,
        '  sh.Outline.Width = 0.1',
        '  sh.Outline.Color.RGBAssign 30, 35, 42'
      );

      if (distinctHoleColor && part.holes.length) {
        for (const hole of part.holes) {
          if (hole.length < 3) continue;
          lines.push(
            '  Set hCrv = doc.CreateCurve()',
            `  ReDim xs(0 To ${hole.length - 1}): ReDim ys(0 To ${hole.length - 1})`
          );
          hole.forEach((pt, i) => {
            lines.push(`  xs(${i}) = ${pt.x.toFixed(3)}: ys(${i}) = ${pt.y.toFixed(3)}`);
          });
          lines.push(
            '  AddClosedRing hCrv, xs, ys, ox, oy',
            '  Set sh = lHoles.CreateCurve(hCrv)',
            `  sh.Name = "${pName} - Ic Bosluk"`,
            `  sh.Fill.ApplyUniformFill CreateRGBColor(${hr}, ${hg}, ${hb})`,
            '  sh.Outline.Width = 0.1',
            '  sh.Outline.Color.RGBAssign 30, 35, 42'
          );
        }
      }
    }
  });

  lines.push(
    '  ActiveWindow.ActiveView.ToFitPage',
    'Cleanup:',
    '  Optimization = False',
    '  doc.EndCommandGroup',
    '  ActiveWindow.Refresh',
    'End Sub'
  );
  return lines.join('\r\n');
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

export function getCorelBridgePs1Script() {
  return String.raw`$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Web.Extensions

$port = 47891
$prefix = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "HATA: Port $port acilamadi. Onceki kopru penceresi aciksa kapatip tekrar deneyin." -ForegroundColor Red
  Read-Host "Cikmak icin Enter'a basin"
  exit 1
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Kutu Harf Studyosu <-> CorelDRAW Canli Kopru Aktif!" -ForegroundColor Green
Write-Host " Dinlenen adres : $prefix" -ForegroundColor Cyan
Write-Host " Durum          : Web stüdyodan 'CorelDRAW'a Gonder' butonuna basin." -ForegroundColor Yellow
Write-Host " Kapatmak icin  : Bu pencereyi kapatin veya Ctrl+C" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Green

$jsonSer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$jsonSer.MaxJsonLength = 67108864

function Send-JsonResponse($ctx, [int]$status, $obj) {
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

function Import-NestingToCorel($payload) {
  $corel = $null
  try { $corel = [Runtime.InteropServices.Marshal]::GetActiveObject("CorelDRAW.Application") } catch {}
  if (-not $corel) {
    $corel = New-Object -ComObject CorelDRAW.Application
  }
  $corel.Visible = $true
  if ($corel.Documents.Count -eq 0 -or $null -eq $corel.ActiveDocument) {
    $doc = $corel.CreateDocument()
  } else {
    $doc = $corel.ActiveDocument
  }

  $doc.Unit = 3
  $colors = $payload["colors"]
  $bodyRgb = $colors["bodyRgb"]
  $holesRgb = $colors["holesRgb"]
  $distinctHoleColor = ($colors["holesHex"] -ne $colors["bodyHex"])
  $sheets = $payload["sheets"]
  $partsCount = 0

  $corel.Optimization = $true
  $doc.BeginCommandGroup("Kutu Harf Studyosu Nesting")
  try {
    for ($si = 0; $si -lt $sheets.Count; $si++) {
      $sh = $sheets[$si]
      if ($si -eq 0 -and $doc.ActivePage.Shapes.Count -eq 0) {
        $page = $doc.ActivePage
      } else {
        $page = $doc.AddPages(1)
      }
      $wMm = [double]$sh["widthMm"]
      $hMm = [double]$sh["heightMm"]
      $page.Name = "$($sh['name']) ($wMm x $hMm mm)"
      $page.SetSize($wMm, $hMm)
      $page.Activate()

      $ox = [double]$page.LeftX
      $oy = [double]$page.BottomY

      $lPlate = $page.CreateLayer("PLAKA_SINIRI")
      $lParts = $page.CreateLayer("PARCALAR")
      $lHoles = $null
      if ($distinctHoleColor) { $lHoles = $page.CreateLayer("IC_DELIKLER") }

      $plateRect = $lPlate.CreateRectangle2($ox, $oy, $wMm, $hMm)
      $plateRect.Name = "PLAKA_EBATI_$($sh['index'])"
      $plateRect.Fill.ApplyNoFill()
      $plateRect.Outline.Width = 0.25
      $plateRect.Outline.Color.RGBAssign(90, 102, 122)

      $mL = [double]$sh["marginLeftMm"]
      $mR = [double]$sh["marginRightMm"]
      $mT = [double]$sh["marginTopMm"]
      $mB = [double]$sh["marginBottomMm"]
      $uW = [Math]::Max(1, $wMm - $mL - $mR)
      $uH = [Math]::Max(1, $hMm - $mT - $mB)
      $cutRect = $lPlate.CreateRectangle2($ox + $mL, $oy + $mB, $uW, $uH)
      $cutRect.Name = "KESIM_ALANI_$($sh['index'])"
      $cutRect.Fill.ApplyNoFill()
      $cutRect.Outline.Width = 0.12
      $cutRect.Outline.Color.RGBAssign(148, 163, 184)

      foreach ($part in $sh["placements"]) {
        $outer = $part["outer"]
        if (-not $outer -or $outer.Count -lt 3) { continue }
        $crv = $doc.CreateCurve()
        $sp = $crv.CreateSubPath($ox + [double]$outer[0]["x"], $oy + [double]$outer[0]["y"])
        for ($k = 1; $k -lt $outer.Count; $k++) {
          $sp.AppendLineSegment($ox + [double]$outer[$k]["x"], $oy + [double]$outer[$k]["y"]) | Out-Null
        }
        $sp.Closed = $true

        $holes = $part["holes"]
        if ($holes) {
          foreach ($hole in $holes) {
            if (-not $hole -or $hole.Count -lt 3) { continue }
            $hsp = $crv.CreateSubPath($ox + [double]$hole[0]["x"], $oy + [double]$hole[0]["y"])
            for ($k = 1; $k -lt $hole.Count; $k++) {
              $hsp.AppendLineSegment($ox + [double]$hole[$k]["x"], $oy + [double]$hole[$k]["y"]) | Out-Null
            }
            $hsp.Closed = $true
          }
        }

        $shape = $lParts.CreateCurve($crv)
        $shape.Name = [string]$part["label"]
        $shape.Fill.ApplyUniformFill($corel.CreateRGBColor([int]$bodyRgb[0], [int]$bodyRgb[1], [int]$bodyRgb[2]))
        $shape.Outline.Width = 0.1
        $shape.Outline.Color.RGBAssign(30, 35, 42)
        $partsCount++

        if ($distinctHoleColor -and $holes) {
          foreach ($hole in $holes) {
            if (-not $hole -or $hole.Count -lt 3) { continue }
            $hCrv = $doc.CreateCurve()
            $hp = $hCrv.CreateSubPath($ox + [double]$hole[0]["x"], $oy + [double]$hole[0]["y"])
            for ($k = 1; $k -lt $hole.Count; $k++) {
              $hp.AppendLineSegment($ox + [double]$hole[$k]["x"], $oy + [double]$hole[$k]["y"]) | Out-Null
            }
            $hp.Closed = $true
            $hShape = $lHoles.CreateCurve($hCrv)
            $hShape.Name = "$($part['label']) - Ic Bosluk"
            $hShape.Fill.ApplyUniformFill($corel.CreateRGBColor([int]$holesRgb[0], [int]$holesRgb[1], [int]$holesRgb[2]))
            $hShape.Outline.Width = 0.1
            $hShape.Outline.Color.RGBAssign(30, 35, 42)
          }
        }
      }
    }
    try { $corel.ActiveWindow.ActiveView.ToFitPage() } catch {}
  } finally {
    $corel.Optimization = $false
    $doc.EndCommandGroup()
    try { $corel.ActiveWindow.Refresh() } catch {}
  }
  return @{
    ok = $true
    sheetsImported = $sheets.Count
    partsImported = $partsCount
    corelVersion = [string]$corel.Version
  }
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $method = $ctx.Request.HttpMethod
    $path = $ctx.Request.Url.AbsolutePath
    if ($method -eq "OPTIONS") {
      Send-JsonResponse $ctx 200 @{ ok = $true }
      continue
    }
    if ($method -eq "GET" -and $path -eq "/api/health") {
      $running = $false
      try { $null = [Runtime.InteropServices.Marshal]::GetActiveObject("CorelDRAW.Application"); $running = $true } catch {}
      Send-JsonResponse $ctx 200 @{ ok = $true; service = "kutu-harf-corel-bridge"; version = "1.0"; corelRunning = $running }
      continue
    }
    if ($method -eq "POST" -and $path -eq "/api/import") {
      $sr = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
      $raw = $sr.ReadToEnd()
      $payload = $jsonSer.DeserializeObject($raw)
      $res = Import-NestingToCorel $payload
      Write-Host "[$(Get-Date -Format 'HH:mm:ss')] CorelDRAW'a $($res.sheetsImported) levha, $($res.partsImported) parca eklendi." -ForegroundColor Green
      Send-JsonResponse $ctx 200 $res
      continue
    }
    Send-JsonResponse $ctx 404 @{ ok = $false; error = "Bilinmeyen uc nokta: $path" }
  } catch {
    Write-Host "[HATA] $($_.Exception.Message)" -ForegroundColor Red
    Send-JsonResponse $ctx 500 @{ ok = $false; error = [string]$_.Exception.Message }
  }
}
`;
}

export function generateCorelBridgeLauncherBat() {
  const b64 = utf8ToBase64(getCorelBridgePs1Script());
  const wrapped = b64.match(/.{1,76}/g).map(line => `::${line}`).join('\r\n');
  return [
    '@echo off',
    'chcp 65001 >nul',
    'title Kutu Harf Studyosu - CorelDRAW Canli Kopru',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$raw = [IO.File]::ReadAllText(\'%~f0\', [Text.Encoding]::UTF8); $m = [regex]::Match($raw, \'(?s)::###PS1_B64_START###\\r?\\n(.*?)\\r?\\n::###PS1_B64_END###\'); $b64 = ($m.Groups[1].Value -replace \'(?m)^::\', \'\' -replace \'\\s+\', \'\'); $bytes = [Convert]::FromBase64String($b64); [IO.File]::WriteAllText(\'%TEMP%\\kutu_harf_corel_bridge.ps1\', [Text.Encoding]::UTF8.GetString($bytes), [Text.UTF8Encoding]::new($false))"',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\\kutu_harf_corel_bridge.ps1"',
    'exit /b %errorlevel%',
    '::###PS1_B64_START###',
    wrapped,
    '::###PS1_B64_END###',
  ].join('\r\n');
}

export async function checkCorelBridgeStatus(timeoutMs = 900) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${COREL_BRIDGE_URL}/api/health`, {
      method: 'GET',
      mode: 'cors',
      signal: ctrl.signal,
    });
    if (!res.ok) return { online: false };
    const data = await res.json();
    return { online: Boolean(data?.ok), ...data };
  } catch {
    return { online: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendNestingToCorel(sheets, previewColors = {}, projectName = 'KutuHarf_Nesting') {
  const payload = buildCorelNestingPayload(sheets, previewColors, projectName);
  const svgText = generateCorelColoredSvg(sheets, previewColors, projectName);
  const vbaMacro = generateCorelVbaMacro(payload);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${COREL_BRIDGE_URL}/api/import`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) {
      return { ok: true, ...data, payload, svgText, vbaMacro };
    }
    return {
      ok: false,
      bridgeOffline: false,
      error: data?.error || `CorelDRAW köprüsü hata döndürdü (${res.status})`,
      payload,
      svgText,
      vbaMacro,
    };
  } catch {
    return { ok: false, bridgeOffline: true, payload, svgText, vbaMacro };
  } finally {
    clearTimeout(timer);
  }
}
