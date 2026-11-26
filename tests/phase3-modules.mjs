import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSignageMasterPrompt } from '../src/ai/SignageAiEngine.js';
import { APP_EXPERT_SYSTEM_PROMPT, ASSISTANT_TOOLS, resolveLocalExpertIntent } from '../src/ai/AppExpertAssistant.js';

// Module 4: Geometry-locked Master Prompt
const prompt = buildSignageMasterPrompt('Gece görünümü, sıcak gün ışığı halo, mermer cepheye yerleştir', {
  objects: [{ text: 'ATLAS' }],
  constructionType: 'metal',
  faceMaterial: 'aynaAltin',
  sideMaterial: 'aynaAltin',
  lightingMode: 'halo',
  lightColor: '#ffc982',
  night: true,
  widthMm: 1800,
  heightMm: 450,
  depthMm: 80,
});
assert(prompt.includes('ATLAS'));
assert(prompt.includes('ORİJİNAL LOGO GEOMETRİSİ'));
assert(prompt.includes('80 mm'));
assert(prompt.includes('mermer cepheye yerleştir'));

// Module 5: App Expert Assistant System Prompt, Tools & Local Intent Execution
assert(APP_EXPERT_SYSTEM_PROMPT.includes('YALNIZCA Türkçe'));
assert(ASSISTANT_TOOLS.length >= 8);
for (const name of ['switch_workspace', 'set_material', 'set_lighting', 'run_nesting', 'highlight_ui_element']) {
  assert(ASSISTANT_TOOLS.some(t => t.name === name), `Missing tool ${name}`);
}

const matIntent = resolveLocalExpertIntent('Ayna altın yap ve gündüz moduna geç');
assert(matIntent.toolCalls.some(c => c.name === 'set_material' && c.args.materialId === 'aynaAltin'));
assert(matIntent.toolCalls.some(c => c.name === 'set_lighting' && c.args.night === false));

const nestIntent = resolveLocalExpertIntent('Nesting çalıştır');
assert(nestIntent.toolCalls.some(c => c.name === 'run_nesting'));

const guideIntent = resolveLocalExpertIntent('Corel aktar nerede?');
assert(guideIntent.toolCalls.some(c => c.name === 'highlight_ui_element' && c.args.selector === '#cwsSendCorel'));

const dimIntent = resolveLocalExpertIntent('Yükseklik 550 derinlik 100 yap');
assert(dimIntent.toolCalls.some(c => c.name === 'set_dimensions' && c.args.heightMm === 550 && c.args.depthMm === 100));

// UI Wiring
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert(html.includes('id="signageAiModal"') && html.includes('id="appExpertDrawer"') && html.includes('id="btnHeaderAiExpert"') && html.includes('data-main-ws="aistudio"'));
assert(main.includes("label: 'AI ile Devam Et'") && main.includes('showGuideCursor'));

console.log('✓ Phase 3 Modules (4 & 5: Signage AI Engine & App Expert Assistant) verified cleanly');
