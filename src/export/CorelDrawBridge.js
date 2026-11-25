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
      const pStroke = p.colorHex || bodyHex;
      const grp = p.partGroup || 'body';
      itemsSvg.push(
        `<path data-part="${escapeXml(p.label)}" data-group="${escapeXml(grp)}" d="${ringToD(p.outer, sh.heightMm)}" fill="none" stroke="${pStroke}" stroke-width="0.25" />`
      );
      const holeStroke = grp === 'file_frame' ? pStroke : holesHex;
      for (const h of p.holes) {
        if (h.length < 3) continue;
        itemsSvg.push(
          `<path data-hole-for="${escapeXml(p.label)}" d="${ringToD(h, sh.heightMm)}" fill="none" stroke="${holeStroke}" stroke-width="0.25" />`
        );
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

    const vbaLayers = new Map();
    for (const part of sh.placements) {
      if (!part.outer.length) continue;
      const pName = String(part.label || 'Parca').replace(/"/g, "'");
      const [pr, pg, pb] = part.colorRgb || [br, bg, bb];
      const grp = part.partGroup || 'body';
      const lVar = grp === 'file_frame' ? 'lFile' : grp === 'fileli_acrylic' ? 'lAc' : grp === 'fileli_dekota' ? 'lDek' : null;
      const lTitle = grp === 'file_frame' ? 'FILE_CERCEVE' : grp === 'fileli_acrylic' ? 'PLEKSI_AKRILIK' : grp === 'fileli_dekota' ? 'ARKA_DEKOTA' : null;
      if (lVar && !vbaLayers.has(lVar)) {
        vbaLayers.set(lVar, lTitle);
        lines.push(`  Dim ${lVar} As Layer: Set ${lVar} = p.CreateLayer("${lTitle}")`);
      }
      const targetLayer = lVar || 'lParts';
      lines.push('  Set crv = doc.CreateCurve()');
      const n = part.outer.length;
      lines.push(`  ReDim xs(0 To ${n - 1}): ReDim ys(0 To ${n - 1})`);
      part.outer.forEach((pt, i) => {
        lines.push(`  xs(${i}) = ${pt.x.toFixed(3)}: ys(${i}) = ${pt.y.toFixed(3)}`);
      });
      lines.push('  AddClosedRing crv, xs, ys, ox, oy');

      if (!distinctHoleColor || grp === 'file_frame') {
        for (const hole of part.holes) {
          if (hole.length < 3) continue;
          lines.push(`  ReDim xs(0 To ${hole.length - 1}): ReDim ys(0 To ${hole.length - 1})`);
          hole.forEach((pt, i) => {
            lines.push(`  xs(${i}) = ${pt.x.toFixed(3)}: ys(${i}) = ${pt.y.toFixed(3)}`);
          });
          lines.push('  AddClosedRing crv, xs, ys, ox, oy');
        }
      }

      lines.push(
        `  Set sh = ${targetLayer}.CreateCurve(crv)`,
        `  sh.Name = "${pName}"`,
        '  sh.Fill.ApplyNoFill',
        '  sh.Outline.Width = 0.2',
        `  sh.Outline.Color.RGBAssign ${pr}, ${pg}, ${pb}`
      );

      if (distinctHoleColor && grp !== 'file_frame' && part.holes.length) {
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
            '  sh.Fill.ApplyNoFill',
            '  sh.Outline.Width = 0.2',
            `  sh.Outline.Color.RGBAssign ${hr}, ${hg}, ${hb}`
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

export function getCorelPluginBasScript(studioUrl = 'https://kutuharfstudyosuprov2.vercel.app/') {
  return [
    'Attribute VB_Name = "KutuHarfStudyosuPlugin"',
    "' Kutu Harf Studyosu Pro v2 - Native CorelDRAW Plugin Modulu",
    'Option Explicit',
    '',
    'Private Function KutuHarfHttpCall(ByVal methodName As String, ByVal endpoint As String) As String',
    '  On Error GoTo ErrH',
    '  Dim req As Object',
    '  Set req = CreateObject("MSXML2.XMLHTTP.6.0")',
    '  req.Open methodName, "http://127.0.0.1:47891" & endpoint, False',
    '  req.Send',
    '  KutuHarfHttpCall = req.responseText',
    '  Exit Function',
    'ErrH:',
    '  KutuHarfHttpCall = ""',
    'End Function',
    '',
    'Public Sub KutuHarf_Studyoyu_Ac()',
    '  Dim sh As Object',
    '  Set sh = CreateObject("WScript.Shell")',
    `  sh.Run "${studioUrl}", 1, False`,
    'End Sub',
    '',
    'Public Sub KutuHarf_Son_Nestingi_Getir()',
    '  Dim res As String',
    '  res = KutuHarfHttpCall("POST", "/api/import-latest")',
    '  If Len(res) = 0 Or InStr(res, """ok"":false") > 0 Then',
    '    MsgBox "Son nesting verisi bulunamadi veya arka plan servisi kapali. Web studyodan bir kez Aktar yapin.", vbInformation, "Kutu Harf Studyosu"',
    '  End If',
    'End Sub',
    '',
    'Public Sub KutuHarf_Kopru_Durumu()',
    '  Dim res As String',
    '  res = KutuHarfHttpCall("GET", "/api/health")',
    '  If InStr(res, """ok"":true") > 0 Then',
    '    MsgBox "Kutu Harf Studyosu CorelDRAW Eklenti Servisi AKTIF (127.0.0.1:47891).", vbInformation, "Kutu Harf Studyosu"',
    '  Else',
    '    MsgBox "Arka plan servisi kapali. Tek Seferlik Kurulumu calistirin.", vbExclamation, "Kutu Harf Studyosu"',
    '  End If',
    'End Sub',
  ].join('\r\n');
}

export function getCorelAddonXslt() {
  return `<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" encoding="utf-8" indent="yes"/>
  <xsl:template match="node()|@*">
    <xsl:copy>
      <xsl:apply-templates select="node()|@*"/>
    </xsl:copy>
  </xsl:template>
</xsl:stylesheet>`;
}

export function getCorelBridgePs1Script() {
  return String.raw`$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Web.Extensions

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Global\KutuHarfCorelBridgeSingleInstance", [ref]$createdNew)
if (-not $createdNew) { exit 0 }

$port = 47891
$prefix = "http://127.0.0.1:$($port)/"
$dataDir = Join-Path $env:LOCALAPPDATA "KutuHarfStudyosu\CorelPlugin"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$latestPath = Join-Path $dataDir "last_nesting.json"
$installedFlag = Test-Path (Join-Path $dataDir "start_silent.vbs")

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  exit 1
}

$jsonSer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$jsonSer.MaxJsonLength = 67108864

$trayHandle = $null
try {
  if ([Environment]::UserInteractive) {
    $rs = [runspacefactory]::CreateRunspace()
    $rs.ApartmentState = "STA"
    $rs.ThreadOptions = "ReuseThread"
    $rs.Open()
    $psTray = [powershell]::Create()
    $psTray.Runspace = $rs
    $null = $psTray.AddScript({
      param($portNum, $latestFile)
      try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        [System.Windows.Forms.Application]::EnableVisualStyles()
        $icon = New-Object System.Windows.Forms.NotifyIcon
        $icon.Icon = [System.Drawing.SystemIcons]::Application
        $icon.Text = "Kutu Harf Studyosu <-> CorelDRAW Eklentisi (Aktif)"
        $icon.Visible = $true

        $menu = New-Object System.Windows.Forms.ContextMenuStrip
        $miOpen = $menu.Items.Add("Kutu Harf Studyosunu Ac")
        $miOpen.add_Click({ Start-Process "https://kutuharfstudyosuprov2.vercel.app/" })
        $miPull = $menu.Items.Add("Son Nestingi CorelDRAW'a Aktar")
        $miPull.add_Click({
          try { Invoke-RestMethod -Uri ("http://127.0.0.1:" + $portNum + "/api/import-latest") -Method Post | Out-Null } catch {}
        })
        $menu.Items.Add("-") | Out-Null
        $miExit = $menu.Items.Add("Servisi Durdur")
        $miExit.add_Click({
          try { Invoke-RestMethod -Uri ("http://127.0.0.1:" + $portNum + "/api/shutdown") -Method Post | Out-Null } catch {}
          $icon.Visible = $false
          $icon.Dispose()
          [System.Windows.Forms.Application]::ExitThread()
        })
        $icon.ContextMenuStrip = $menu
        [System.Windows.Forms.Application]::Run()
      } catch {}
    }).AddArgument($port).AddArgument($latestPath)
    $trayHandle = $psTray.BeginInvoke()
  }
} catch {}

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
      $groupLayers = @{}

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
        $grp = "body"
        if ($part.ContainsKey("partGroup") -and $part["partGroup"]) { $grp = [string]$part["partGroup"] }

        $crv = $doc.CreateCurve()
        $sp = $crv.CreateSubPath($ox + [double]$outer[0]["x"], $oy + [double]$outer[0]["y"])
        for ($k = 1; $k -lt $outer.Count; $k++) {
          $sp.AppendLineSegment($ox + [double]$outer[$k]["x"], $oy + [double]$outer[$k]["y"]) | Out-Null
        }
        $sp.Closed = $true

        $holes = $part["holes"]
        $separateHoleLayer = ($distinctHoleColor -and $grp -ne "file_frame")
        if ($holes -and (-not $separateHoleLayer)) {
          foreach ($hole in $holes) {
            if (-not $hole -or $hole.Count -lt 3) { continue }
            $hsp = $crv.CreateSubPath($ox + [double]$hole[0]["x"], $oy + [double]$hole[0]["y"])
            for ($k = 1; $k -lt $hole.Count; $k++) {
              $hsp.AppendLineSegment($ox + [double]$hole[$k]["x"], $oy + [double]$hole[$k]["y"]) | Out-Null
            }
            $hsp.Closed = $true
          }
        }

        $targetLayer = $lParts
        if ($grp -eq "file_frame") {
          if (-not $groupLayers.ContainsKey("FILE_CERCEVE")) { $groupLayers["FILE_CERCEVE"] = $page.CreateLayer("FILE_CERCEVE") }
          $targetLayer = $groupLayers["FILE_CERCEVE"]
        } elseif ($grp -eq "fileli_acrylic") {
          if (-not $groupLayers.ContainsKey("PLEKSI_AKRILIK")) { $groupLayers["PLEKSI_AKRILIK"] = $page.CreateLayer("PLEKSI_AKRILIK") }
          $targetLayer = $groupLayers["PLEKSI_AKRILIK"]
        } elseif ($grp -eq "fileli_dekota") {
          if (-not $groupLayers.ContainsKey("ARKA_DEKOTA")) { $groupLayers["ARKA_DEKOTA"] = $page.CreateLayer("ARKA_DEKOTA") }
          $targetLayer = $groupLayers["ARKA_DEKOTA"]
        }

        $pRgb = $bodyRgb
        if ($part.ContainsKey("colorRgb") -and $part["colorRgb"] -and $part["colorRgb"].Count -ge 3) {
          $pRgb = $part["colorRgb"]
        }

        $shape = $targetLayer.CreateCurve($crv)
        $shape.Name = [string]$part["label"]
        $shape.Fill.ApplyNoFill()
        $shape.Outline.Width = 0.2
        $shape.Outline.Color.RGBAssign([int]$pRgb[0], [int]$pRgb[1], [int]$pRgb[2])
        $partsCount++

        if ($separateHoleLayer -and $holes) {
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
            $hShape.Fill.ApplyNoFill()
            $hShape.Outline.Width = 0.2
            $hShape.Outline.Color.RGBAssign([int]$holesRgb[0], [int]$holesRgb[1], [int]$holesRgb[2])
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

function Export-SelectionFromCorel() {
  $corel = $null
  try { $corel = [Runtime.InteropServices.Marshal]::GetActiveObject("CorelDRAW.Application") } catch {}
  if (-not $corel -or $corel.Documents.Count -eq 0 -or $null -eq $corel.ActiveDocument) {
    return @{ ok = $false; error = "Acik bir CorelDRAW belgesi bulunamadi." }
  }
  $doc = $corel.ActiveDocument
  $rangeMode = 2
  try {
    if ($doc.Selection -and $doc.Selection.Shapes.Count -gt 0) { $rangeMode = 1 }
  } catch {}
  $tmpSvg = Join-Path $env:TEMP ("khs_corel_pull_" + [Guid]::NewGuid().ToString("N") + ".svg")
  try {
    $exp = $doc.ExportEx($tmpSvg, 1345, $rangeMode)
    if ($exp) { $exp.Finish() }
    if (-not (Test-Path $tmpSvg)) {
      return @{ ok = $false; error = "CorelDRAW SVG disa aktarimi olusturulamadi." }
    }
    $svgText = [System.IO.File]::ReadAllText($tmpSvg, [System.Text.Encoding]::UTF8)
    return @{ ok = $true; svgText = $svgText; fileName = "CorelDRAW_Secim.svg" }
  } finally {
    if (Test-Path $tmpSvg) { Remove-Item $tmpSvg -Force -ErrorAction SilentlyContinue }
  }
}

$runningLoop = $true
while ($runningLoop -and $listener.IsListening) {
  $ctx = $null
  try { $ctx = $listener.GetContext() } catch { break }
  try {
    $method = $ctx.Request.HttpMethod
    $path = $ctx.Request.Url.AbsolutePath
    if ($method -eq "OPTIONS") {
      Send-JsonResponse $ctx 200 @{ ok = $true }
      continue
    }
    if ($method -eq "GET" -and $path -eq "/api/health") {
      $corelOn = $false
      try { $null = [Runtime.InteropServices.Marshal]::GetActiveObject("CorelDRAW.Application"); $corelOn = $true } catch {}
      Send-JsonResponse $ctx 200 @{ ok = $true; service = "kutu-harf-corel-bridge"; version = "2.0"; installed = $installedFlag; corelRunning = $corelOn; hasLatest = (Test-Path $latestPath) }
      continue
    }
    if ($method -eq "POST" -and $path -eq "/api/import") {
      $sr = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
      $raw = $sr.ReadToEnd()
      [System.IO.File]::WriteAllText($latestPath, $raw, [System.Text.UTF8Encoding]::new($false))
      $payload = $jsonSer.DeserializeObject($raw)
      $res = Import-NestingToCorel $payload
      Send-JsonResponse $ctx 200 $res
      continue
    }
    if (($method -eq "POST" -or $method -eq "GET") -and $path -eq "/api/import-latest") {
      if (-not (Test-Path $latestPath)) {
        Send-JsonResponse $ctx 404 @{ ok = $false; error = "Henuz kaydedilmis bir nesting verisi yok." }
        continue
      }
      $raw = [System.IO.File]::ReadAllText($latestPath, [System.Text.Encoding]::UTF8)
      $payload = $jsonSer.DeserializeObject($raw)
      $res = Import-NestingToCorel $payload
      Send-JsonResponse $ctx 200 $res
      continue
    }
    if ($method -eq "POST" -and $path -eq "/api/pull-from-corel") {
      $res = Export-SelectionFromCorel
      if ($res["ok"]) { Send-JsonResponse $ctx 200 $res } else { Send-JsonResponse $ctx 400 $res }
      continue
    }
    if ($method -eq "POST" -and $path -eq "/api/shutdown") {
      Send-JsonResponse $ctx 200 @{ ok = $true }
      $runningLoop = $false
      $listener.Stop()
      continue
    }
    Send-JsonResponse $ctx 404 @{ ok = $false; error = "Bilinmeyen uc nokta: $path" }
  } catch {
    try { Send-JsonResponse $ctx 500 @{ ok = $false; error = [string]$_.Exception.Message } } catch {}
  }
}
`;
}

export function getCorelInstallerPs1Script() {
  const nl = '[Environment]::NewLine';
  return String.raw`param(
  [Parameter(Mandatory=$true)][string]$BridgeSource,
  [Parameter(Mandatory=$true)][string]$PluginBasB64,
  [Parameter(Mandatory=$true)][string]$AddonXsltB64
)
$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "KutuHarfStudyosu\CorelPlugin"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

try { Invoke-RestMethod -Uri "http://127.0.0.1:47891/api/shutdown" -Method Post -TimeoutSec 2 | Out-Null; Start-Sleep -Milliseconds 350 } catch {}

$bridgeDest = Join-Path $installDir "bridge.ps1"
Copy-Item -Path $BridgeSource -Destination $bridgeDest -Force

$vbsPath = Join-Path $installDir "start_silent.vbs"
$vbsLines = @(
  'Set shell = CreateObject("WScript.Shell")',
  ('shell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & "' + $bridgeDest + '" & """", 0, False')
)
[System.IO.File]::WriteAllText($vbsPath, ($vbsLines -join ${nl}), [System.Text.Encoding]::ASCII)

$pluginBasText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PluginBasB64))
$pluginBasDest = Join-Path $installDir "KutuHarfStudyosu_Plugin.bas"
[System.IO.File]::WriteAllText($pluginBasDest, $pluginBasText, [System.Text.UTF8Encoding]::new($false))

$addonXsltText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($AddonXsltB64))
$localAddonDir = Join-Path $installDir "CorelAddon"
New-Item -ItemType Directory -Force -Path $localAddonDir | Out-Null
[System.IO.File]::WriteAllText((Join-Path $localAddonDir "coreldrw.addon"), "", [System.Text.Encoding]::ASCII)
[System.IO.File]::WriteAllText((Join-Path $localAddonDir "AppUI.xslt"), $addonXsltText, [System.Text.UTF8Encoding]::new($false))

$uninstallBat = Join-Path $installDir "uninstall.bat"
$unLines = @(
  '@echo off',
  'powershell.exe -NoProfile -Command "try { Invoke-RestMethod -Uri ''http://127.0.0.1:47891/api/shutdown'' -Method Post -TimeoutSec 2 | Out-Null } catch {}"',
  'reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "KutuHarfCorelBridge" /f >nul 2>&1',
  'reg delete "HKCU\Software\Classes\kutuharf" /f >nul 2>&1',
  'echo Kutu Harf Studyosu CorelDRAW Eklentisi kaldirildi.',
  'pause'
)
[System.IO.File]::WriteAllText($uninstallBat, ($unLines -join ${nl}), [System.Text.Encoding]::ASCII)

$q = [string][char]34
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
if (-not (Test-Path $runKey)) { New-Item -Path $runKey -Force | Out-Null }
Set-ItemProperty -Path $runKey -Name "KutuHarfCorelBridge" -Value ("wscript.exe " + $q + $vbsPath + $q)

$protoKey = "HKCU:\Software\Classes\kutuharf"
New-Item -Path $protoKey -Force | Out-Null
Set-ItemProperty -Path $protoKey -Name "(Default)" -Value "URL:Kutu Harf Studyosu Protocol"
Set-ItemProperty -Path $protoKey -Name "URL Protocol" -Value ""
$cmdKey = "HKCU:\Software\Classes\kutuharf\shell\open\command"
New-Item -Path $cmdKey -Force | Out-Null
Set-ItemProperty -Path $cmdKey -Name "(Default)" -Value ("wscript.exe " + $q + $vbsPath + $q)

$installedCorelPaths = @()
$corelRoaming = Join-Path $env:APPDATA "Corel"
if (Test-Path $corelRoaming) {
  $suites = Get-ChildItem -Path $corelRoaming -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "CorelDRAW*" }
  foreach ($s in $suites) {
    $gmsDir = Join-Path $s.FullName "Draw\GMS"
    $addonsDir = Join-Path $s.FullName "Draw\Addons\KutuHarfStudyosu"
    New-Item -ItemType Directory -Force -Path $gmsDir | Out-Null
    New-Item -ItemType Directory -Force -Path $addonsDir | Out-Null
    Copy-Item -Path $pluginBasDest -Destination (Join-Path $gmsDir "KutuHarfStudyosu_Plugin.bas") -Force
    Copy-Item -Path (Join-Path $localAddonDir "coreldrw.addon") -Destination (Join-Path $addonsDir "coreldrw.addon") -Force
    Copy-Item -Path (Join-Path $localAddonDir "AppUI.xslt") -Destination (Join-Path $addonsDir "AppUI.xslt") -Force
    $installedCorelPaths += $s.Name
  }
}

Start-Process -FilePath "wscript.exe" -ArgumentList ($q + $vbsPath + $q)

$ok = $false
for ($try = 0; $try -lt 16; $try++) {
  Start-Sleep -Milliseconds 250
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:47891/api/health" -TimeoutSec 2
    if ($h.ok) { $ok = $true; break }
  } catch {}
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
if ($ok) {
  Write-Host " KUTU HARF STUDYOSU <-> CORELDRAW EKLENTISI KURULDU!" -ForegroundColor Green
} else {
  Write-Host " Eklenti dosyalari kuruldu; arka plan servisi baslatiliyor..." -ForegroundColor Yellow
}
Write-Host "==================================================================" -ForegroundColor Green
Write-Host " Kurulum Klasoru   : $installDir" -ForegroundColor Cyan
Write-Host " Windows Acilisi   : Otomatik arka plan servisi aktif (penceresiz)" -ForegroundColor Cyan
Write-Host " URL Protokolu     : kutuharf:// aktif (gerekirse webden uyanir)" -ForegroundColor Cyan
if ($installedCorelPaths.Count -gt 0) {
  Write-Host (" CorelDRAW Eklenti : " + ($installedCorelPaths -join ", ")) -ForegroundColor Cyan
}
Write-Host ""
Write-Host " Artık bir daha .bat acmaniza gerek yok! Web sayfasindan tek tikla" -ForegroundColor White
Write-Host " 'Corel'e Aktar' butonuna basabilirsiniz." -ForegroundColor White
Write-Host ""
Start-Sleep -Seconds 3
`;
}

export function generateCorelBridgeLauncherBat() {
  const bridgeB64 = utf8ToBase64(getCorelBridgePs1Script()).match(/.{1,76}/g).map(line => `::${line}`).join('\r\n');
  const instB64 = utf8ToBase64(getCorelInstallerPs1Script()).match(/.{1,76}/g).map(line => `::${line}`).join('\r\n');
  const pluginBasB64 = utf8ToBase64(getCorelPluginBasScript());
  const addonXsltB64 = utf8ToBase64(getCorelAddonXslt());
  return [
    '@echo off',
    'chcp 65001 >nul',
    'title Kutu Harf Studyosu - CorelDRAW Tek Seferlik Kurulum & Eklenti',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$raw = [IO.File]::ReadAllText(\'%~f0\', [Text.Encoding]::UTF8); $m1 = [regex]::Match($raw, \'(?s)::###PS1_B64_START###\\r?\\n(.*?)\\r?\\n::###PS1_B64_END###\'); $b1 = ($m1.Groups[1].Value -replace \'(?m)^::\', \'\' -replace \'\\s+\', \'\'); [IO.File]::WriteAllText(\'%TEMP%\\kutu_harf_corel_bridge.ps1\', [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b1)), [Text.UTF8Encoding]::new($false)); $m2 = [regex]::Match($raw, \'(?s)::###INSTALLER_B64_START###\\r?\\n(.*?)\\r?\\n::###INSTALLER_B64_END###\'); $b2 = ($m2.Groups[1].Value -replace \'(?m)^::\', \'\' -replace \'\\s+\', \'\'); [IO.File]::WriteAllText(\'%TEMP%\\kutu_harf_corel_install.ps1\', [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b2)), [Text.UTF8Encoding]::new($false))"',
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\\kutu_harf_corel_install.ps1" -BridgeSource "%TEMP%\\kutu_harf_corel_bridge.ps1" -PluginBasB64 "${pluginBasB64}" -AddonXsltB64 "${addonXsltB64}"`,
    'exit /b %errorlevel%',
    '::###PS1_B64_START###',
    bridgeB64,
    '::###PS1_B64_END###',
    '::###INSTALLER_B64_START###',
    instB64,
    '::###INSTALLER_B64_END###',
  ].join('\r\n');
}

export function wakeCorelBridgeProtocol() {
  if (typeof document === 'undefined') return false;
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = 'kutuharf://start';
    document.body.appendChild(iframe);
    setTimeout(() => iframe.remove(), 1200);
    return true;
  } catch {
    return false;
  }
}

export async function pullSelectionFromCorel() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${COREL_BRIDGE_URL}/api/pull-from-corel`, {
      method: 'POST',
      mode: 'cors',
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok && data?.svgText) {
      return { ok: true, svgText: data.svgText, fileName: data.fileName || 'CorelDRAW_Secim.svg' };
    }
    return {
      ok: false,
      bridgeOffline: false,
      error: data?.error || `CorelDRAW çizimi alınamadı (${res.status})`,
    };
  } catch {
    return { ok: false, bridgeOffline: true };
  } finally {
    clearTimeout(timer);
  }
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
